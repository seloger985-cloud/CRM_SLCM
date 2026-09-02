/* Client Supabase partagé — défini une seule fois dans assets/js/config.js.
   Les credentials ne sont plus dupliqués entre app.js et facture.html. */
const supabaseClient = window.SLCM_DB.getClient();

// DOM elements
const mainContent = document.getElementById('main-content');
const dashboardBtn = document.getElementById('dashboard-btn');
const clientsBtn = document.getElementById('clients-btn');
const propertiesBtn = document.getElementById('properties-btn');
const activitiesBtn = document.getElementById('activities-btn');
const paymentsBtn = document.getElementById('payments-btn');
const invoicesBtn = document.getElementById('invoices-btn');
const tasksBtn = document.getElementById('tasks-btn');
const automationBtn = document.getElementById('automation-btn');
const pipelineBtn = document.getElementById('pipeline-btn');
const matchingBtn = document.getElementById('matching-btn');

// Event listeners — wrappés pour marquer l'état actif dans la sidebar
function setActiveNav(btn) {
  document.querySelectorAll('header nav button').forEach(b => b.classList.remove('active'));
  if (!btn) return;
  btn.classList.add('active');

  /* Sur mobile la navigation est une rangée qui défile : sans ça, l'entrée
     active peut se trouver hors du champ de vision et on croit l'avoir perdue.
     Sans effet sur bureau, où la colonne n'a pas de débordement horizontal. */
  if (typeof btn.scrollIntoView === 'function') {
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function navTo(btn, fn) {
  return () => {
    setActiveNav(btn);
    if (typeof fn === 'function') fn();
  };
}

dashboardBtn.addEventListener('click', navTo(dashboardBtn, showDashboard));
clientsBtn.addEventListener('click', navTo(clientsBtn, showClients));
propertiesBtn.addEventListener('click', navTo(propertiesBtn, showProperties));
activitiesBtn.addEventListener('click', navTo(activitiesBtn, showActivities));
paymentsBtn.addEventListener('click', navTo(paymentsBtn, showPayments));
invoicesBtn.addEventListener('click', () => { window.location.href = 'facture.html'; });
tasksBtn.addEventListener('click', navTo(tasksBtn, showTasks));
automationBtn.addEventListener('click', navTo(automationBtn, showAutomation));
pipelineBtn.addEventListener('click', navTo(pipelineBtn, showPipeline));
matchingBtn.addEventListener('click', navTo(matchingBtn, showMatching));

/* Redessine le tableau de bord au changement de thème, uniquement s'il est à
   l'écran : ses deux graphiques sont peints sur un canevas et ne suivent pas
   la cascade CSS. Les autres vues n'en ont pas besoin. */
document.addEventListener('slcm:theme-changed', () => {
  if (window.SLCM_SESSION && dashboardBtn.classList.contains('active')) showDashboard();
});

// Initialize — on n'interroge la base qu'une fois la session confirmée
// par auth.js. Sans session, RLS bloque tout et l'écran resterait vide.
mainContent.innerHTML = '<div class="loading"><div class="spinner"></div><div>Chargement…</div></div>';
setActiveNav(dashboardBtn);
if (window.SLCM_SESSION) {
  showDashboard();
} else {
  document.addEventListener('slcm:auth-ready', () => showDashboard(), { once: true });
}

window.addEventListener('error', event => {
  console.error('Erreur JavaScript détectée:', event.error || event.message);
  displayError('Une erreur est survenue dans l’application. Ouvre la console pour voir les détails.');
});

// Templates de messages prédéfinis
const messageTemplates = {
  whatsapp: {
    general: "Bonjour {name}, merci de votre intérêt pour nos services immobiliers. Comment pouvons-nous vous aider ?",
    followup: "Bonjour {name}, nous espérons que vous allez bien. Avez-vous des questions sur nos propriétés ?",
    visit_reminder: "Bonjour {name}, rappel de votre visite prévue le {date}. Nous vous attendons !",
    payment_reminder: "Bonjour {name}, nous vous rappelons que le paiement de {amount} FCFA est en attente.",
    congrats_signed: "Félicitations {name} ! Votre transaction immobilière est finalisée. Merci de votre confiance."
  },
  email: {
    general: "Bonjour {name},\n\nMerci de votre intérêt pour nos services immobiliers.\n\nCordialement,\nVotre équipe immobilière",
    followup: "Bonjour {name},\n\nNous espérons que vous allez bien. N'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nVotre équipe immobilière",
    visit_reminder: "Bonjour {name},\n\nRappel de votre visite prévue le {date}.\n\nCordialement,\nVotre équipe immobilière"
  }
};

// Fonction pour remplacer les variables dans les templates
function replaceTemplateVars(template, data) {
  return template
    .replace(/{name}/g, data.name || '')
    .replace(/{date}/g, data.date || '')
    .replace(/{amount}/g, data.amount || '');
}

// Fonction pour obtenir les suggestions d'automatisation
function getAutomationSuggestions() {
  const suggestions = [];
  const now = new Date();

  return Promise.all([
    getAll('clients'),
    getAll('activities'),
    getAll('payments')
  ]).then(([clients, activities, payments]) => {

    // Rappels de visite (activités de type 'visit' dans les 7 prochains jours)
    activities.forEach(activity => {
      if (activity.type === 'visit') {
        const visitDate = new Date(activity.date);
        const daysDiff = Math.ceil((visitDate - now) / (1000 * 60 * 60 * 24));

        if (daysDiff >= 0 && daysDiff <= 7) {
          const client = clients.find(c => c.id === activity.client_id);
          if (client) {
            suggestions.push({
              type: 'visit_reminder',
              priority: daysDiff <= 1 ? 'high' : 'medium',
              message: `Rappel visite ${client.name} dans ${daysDiff} jour(s)`,
              action: () => sendWhatsApp(client.phone, replaceTemplateVars(messageTemplates.whatsapp.visit_reminder, {
                name: client.name,
                date: visitDate.toLocaleDateString('fr-FR')
              })),
              client: client,
              dueDate: visitDate
            });
          }
        }
      }
    });

    // Paiements en attente
    payments.forEach(payment => {
      if (payment.status === 'pending') {
        const paymentDate = new Date(payment.payment_date);
        const daysOverdue = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));

        if (daysOverdue > 0) {
          const client = clients.find(c => c.id === payment.client_id);
          if (client) {
            suggestions.push({
              type: 'payment_reminder',
              priority: daysOverdue > 7 ? 'high' : 'medium',
              message: `Paiement en retard de ${daysOverdue} jour(s) - ${client.name}`,
              action: () => sendWhatsApp(client.phone, replaceTemplateVars(messageTemplates.whatsapp.payment_reminder, {
                name: client.name,
                amount: payment.amount
              })),
              client: client,
              overdue: daysOverdue
            });
          }
        }
      }
    });

    // Clients sans activité récente (plus de 7 jours)
    clients.forEach(client => {
      const clientActivities = activities.filter(a => a.client_id === client.id);
      if (clientActivities.length > 0) {
        const lastActivity = new Date(Math.max(...clientActivities.map(a => new Date(a.date))));
        const daysSinceLastActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

        if (daysSinceLastActivity > 7 && client.status !== 'signé') {
          suggestions.push({
            type: 'followup',
            priority: daysSinceLastActivity > 14 ? 'high' : 'medium',
            message: `Relance ${client.name} - dernière activité il y a ${daysSinceLastActivity} jours`,
            action: () => sendWhatsApp(client.phone, replaceTemplateVars(messageTemplates.whatsapp.followup, {
              name: client.name
            })),
            client: client,
            daysInactive: daysSinceLastActivity
          });
        }
      }
    });

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  });
}

// Configuration WhatsApp Business
const WHATSAPP_BUSINESS_NUMBER = '650840714';

/* Normalise un numéro camerounais au format international attendu par wa.me :
   "650 840 714", "+237650840714", "00237650840714" -> "237650840714" */
function normalizePhone(phone) {
  var d = String(phone || '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.indexOf('237') === 0) return d;
  if (d.length === 9) return '237' + d;          // numéro local
  return d;
}

/* CORRECTIF 16/08/2026 — le paramètre `phone` était reçu puis ignoré :
   l'URL était construite avec WHATSAPP_BUSINESS_NUMBER, donc toutes les
   relances s'ouvraient sur une conversation avec soi-même. */
function sendWhatsApp(phone, message) {
  const target = normalizePhone(phone) || WHATSAPP_BUSINESS_NUMBER;
  const whatsappUrl = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

// Fonction pour afficher les suggestions d'automatisation
async function showAutomation() {
  mainContent.innerHTML = `
    <h2>Automatisation</h2>

    <div class="automation-section">
      <h3>Modèles de messages</h3>
      <div class="templates-grid">
        <div class="template-card">
          <h4>WhatsApp - Message général</h4>
          <p class="template-text">${messageTemplates.whatsapp.general}</p>
          <button onclick="copyTemplate('whatsapp', 'general')" class="btn btn-outline">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Relance</h4>
          <p class="template-text">${messageTemplates.whatsapp.followup}</p>
          <button onclick="copyTemplate('whatsapp', 'followup')" class="btn btn-outline">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Rappel visite</h4>
          <p class="template-text">${messageTemplates.whatsapp.visit_reminder}</p>
          <button onclick="copyTemplate('whatsapp', 'visit_reminder')" class="btn btn-outline">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Rappel paiement</h4>
          <p class="template-text">${messageTemplates.whatsapp.payment_reminder}</p>
          <button onclick="copyTemplate('whatsapp', 'payment_reminder')" class="btn btn-outline">Copier</button>
        </div>
      </div>
    </div>

    <div class="automation-section">
      <h3>Relances suggérées</h3>
      <div id="suggestions-container">
        <div class="loading"><div class="spinner"></div>Analyse des données...</div>
      </div>
    </div>
  `;

  // Charger les suggestions
  const suggestions = await getAutomationSuggestions();
  displaySuggestions(suggestions);
}

function displaySuggestions(suggestions) {
  const container = document.getElementById('suggestions-container');

  if (suggestions.length === 0) {
    container.innerHTML = '<p class="no-suggestions">Aucune relance à proposer pour le moment.</p>';
    return;
  }

  container.innerHTML = `
    <div class="suggestions-list">
      ${suggestions.map((suggestion, index) => `
        <div class="suggestion-item ${suggestion.priority}">
          <div class="suggestion-header">
            <span class="priority-badge ${suggestion.priority}">${suggestion.priority === 'high' ? 'Urgent' : suggestion.priority === 'medium' ? 'À faire' : 'Quand possible'}</span>
            <span class="suggestion-type">${getSuggestionTypeLabel(suggestion.type)}</span>
          </div>
          <div class="suggestion-content">
            <p>${escHtml(suggestion.message)}</p>
            <div class="suggestion-actions">
              <button onclick="executeSuggestion(${index})" class="btn btn-primary">WhatsApp</button>
              <button onclick="createActivityFromSuggestion(${index})" class="btn btn-outline">Noter une activité</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Stocker les suggestions globalement pour les actions
  window.currentSuggestions = suggestions;
}

function getSuggestionTypeLabel(type) {
  const labels = {
    visit_reminder: 'Rappel de visite',
    payment_reminder: 'Rappel de paiement',
    followup: 'Relance client'
  };
  return labels[type] || type;
}

function copyTemplate(type, templateKey) {
  const template = messageTemplates[type][templateKey];
  navigator.clipboard.writeText(template).then(() => {
    UI.toast('Template copié dans le presse-papiers', 'success');
  });
}

function executeSuggestion(index) {
  const suggestion = window.currentSuggestions[index];
  if (suggestion && suggestion.action) {
    suggestion.action();
  }
}

async function createActivityFromSuggestion(index) {
  const suggestion = window.currentSuggestions[index];
  if (!suggestion) return;

  // Créer une activité de relance
  const activity = {
    type: 'call',
    client_id: suggestion.client.id,
    notes: `Relance automatique: ${suggestion.message}`,
    date: new Date().toISOString().split('T')[0]
  };

  try {
    const { error } = await supabaseClient.from('activities').insert([activity]);
    if (error) throw error;

    UI.toast('Activité de relance créée', 'success');
    showAutomation(); // Rafraîchir
  } catch (error) {
    console.error('Erreur lors de la création de l\'activité:', error);
    UI.handleError(error);
  }
}

/* (doublon du bloc d'initialisation retiré — il rappelait showDashboard()
   sans attendre 'slcm:auth-ready'. Le premier rendu partait donc sans
   session, RLS renvoyait zéro ligne, et tout se redessinait ensuite.
   Le bloc du haut de fichier fait déjà le travail, dans le bon ordre.) */

/* (doublon du handler d'erreur global retiré — il était enregistré deux fois,
   ce qui affichait chaque erreur en double à l'utilisateur) */

/* ═══════════════ TABLEAU DE BORD ═══════════════

   Ce que cet écran doit répondre, en un regard :
     à faire   — ce qui attend une action de ma part
     entrant   — les demandes à qualifier
     en cours  — ce qui est engagé et pas encore conclu
     résultat  — ce qui est encaissé

   Les quatre cartes suivent cet ordre, de gauche à droite. C'est
   l'entonnoir de l'agence, pas une collection de statistiques.

   Refonte des données du 31/08/2026 : onze requêtes séquentielles, dont
   cinq redondantes — quatre comptages de statuts et un getRecent('clients')
   que getAll('clients') contenait déjà. Ramenées à quatre, en parallèle. */
async function showDashboard() {
  const [allClients, allPayments, allTasks, recentActivities, siteListings, shared, allDemands] = await Promise.all([
    getAll('clients'),
    getAll('payments'),
    getAll('tasks'),
    getRecent('activities', 5),
    /* Les annonces du site sont en cache 5 minutes côté site.js, et les deux
       appels dégradent en silence : le tableau de bord reste utilisable même
       si selogercm.com ne répond pas. */
    window.SLCM_SITE.fetchListings(),
    window.SLCM_MATCH.loadShared(),
    getAll('demands')
  ]);

  /* Annonces parues depuis le dernier passage qui répondent à une recherche. */
  const fresh = window.SLCM_MATCH.freshMatches(allDemands, siteListings, shared);
  window._freshListings = siteListings;

  /* Comptages dérivés de la liste déjà en mémoire, plus par requête. */
  const byStatus = (s) => allClients.filter(c => (c.status || 'nouvelle demande') === s).length;
  const newRequests  = byStatus('nouvelle demande');
  const visits       = byStatus('visite');
  const negotiations = byStatus('négociation');
  const signed       = byStatus('signé');
  const inProgress   = visits + negotiations;

  const totalRevenue = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const conversionRate = allClients.length > 0 ? ((signed / allClients.length) * 100).toFixed(1) : 0;

  /* getAll trie par created_at décroissant : les plus récents sont en tête. */
  const recentClients = allClients.slice(0, 5);

  /* À faire : les tâches non terminées, la plus urgente d'abord. Une tâche
     sans échéance passe après celles qui en ont une. */
  const openTasks = allTasks
    .filter(t => t.status !== 'completed')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const today = new Date().toISOString().slice(0, 10);
  const lateTasks = openTasks.filter(t => t.due_date && t.due_date < today).length;

  // Données pour graphiques
  const statusData = [newRequests, visits, negotiations, signed];
  const statusLabels = ['Nouvelles demandes', 'Visites', 'Négociations', 'Signés'];

  // Source de leads
  const sourceStats = {};
  allClients.forEach(client => {
    const source = client.source || 'Non spécifié';
    sourceStats[source] = (sourceStats[source] || 0) + 1;
  });

  // Alertes
  const overduePayments = allPayments.filter(p =>
    p.status === 'pending' &&
    new Date(p.payment_date) < new Date() &&
    new Date(p.payment_date) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Plus de 7 jours de retard
  );

  mainContent.innerHTML = `
    <h2>Tableau de bord</h2>

    <!-- Les quatre temps de l'agence : à faire → entrant → en cours → résultat.
         « Prix moyen » a été retiré : une moyenne sur des biens hétérogènes —
         studio et immeuble dans le même calcul — n'oriente aucune décision. -->
    <div class="dashboard">
      <div class="card${openTasks.length ? ' attention' : ''}">
        <h3>À faire</h3>
        <p class="metric">${openTasks.length}</p>
        <small>${openTasks.length === 0
          ? 'Rien en attente'
          : 'tâche' + (openTasks.length > 1 ? 's' : '') + ' ouverte' + (openTasks.length > 1 ? 's' : '') + (lateTasks ? ' · ' + lateTasks + ' en retard' : '')}</small>
      </div>
      <div class="card">
        <h3>Nouvelles demandes</h3>
        <p class="metric">${newRequests}</p>
        <small>${newRequests === 0 ? 'Aucune à qualifier' : 'à qualifier'}</small>
      </div>
      <div class="card">
        <h3>En cours</h3>
        <p class="metric">${inProgress}</p>
        <small>${visits} en visite · ${negotiations} en négociation</small>
      </div>
      <div class="card highlight">
        <h3>Chiffre d'affaires</h3>
        <p class="metric">${formatMoney(totalRevenue)} FCFA</p>
        <small>${signed} signé${signed > 1 ? 's' : ''} sur ${allClients.length} client${allClients.length > 1 ? 's' : ''} · ${conversionRate}% de conversion</small>
      </div>
    </div>

    <!-- Graphiques -->
    <div class="dashboard-charts">
      <div class="chart-container">
        <h3>Pipeline de vente</h3>
        <div class="chart-box"><canvas id="statusChart"></canvas></div>
      </div>
      <div class="chart-container">
        <h3>Origine des clients</h3>
        <div class="chart-box"><canvas id="sourceChart"></canvas></div>
      </div>
    </div>

    <!-- Alertes : une occasion à saisir avant un problème à régler -->
    ${(fresh.length || overduePayments.length) ? `
    <div class="alerts">
      <h3>Alertes</h3>
      ${fresh.length ? `
      <div class="alert alert-match" id="fresh-alert">
        <strong>${fresh.length} nouvelle${fresh.length > 1 ? 's' : ''} annonce${fresh.length > 1 ? 's' : ''} sur selogercm.com trouve${fresh.length > 1 ? 'nt' : ''} preneur</strong>
        ${fresh.slice(0, 4).map(f => {
          const noms = [...new Set(f.demands.map(h => {
            const c = allClients.find(x => String(x.id) === String(h.demand.client_id));
            return (c && c.name) || 'sans nom';
          }))];
          return `<p>${escHtml(f.listing.title || 'Sans titre')} — ${noms.slice(0, 3).map(escHtml).join(', ')}${noms.length > 3 ? ' et ' + (noms.length - 3) + ' autre(s)' : ''}</p>`;
        }).join('')}
        ${fresh.length > 4 ? `<p class="item-meta">et ${fresh.length - 4} autre(s).</p>` : ''}
        <div class="alert-actions">
          <button onclick="goToMatching()" class="btn btn-primary">Ouvrir les rapprochements</button>
          <button onclick="dismissFreshAlert()" class="btn btn-outline">J'ai vu</button>
        </div>
      </div>` : ''}
      ${overduePayments.length ? `
      <div class="alert alert-warning">
        <strong>${overduePayments.length} paiement${overduePayments.length > 1 ? 's' : ''} en retard</strong>
        <p>En attente depuis plus de sept jours.</p>
      </div>` : ''}
    </div>
    ` : ''}

    <!-- À gauche ce qui arrive, au centre ce qui a été fait, à droite ce qui
         attend. La colonne des tâches ne montre plus « les 5 plus récentes »
         — une tâche déjà terminée n'a rien à faire sur un tableau de bord —
         mais les tâches ouvertes, échéance la plus proche en tête. -->
    <div class="dashboard-sections">
      <div class="list">
        <h3>Derniers clients</h3>
        ${recentClients.length
          ? recentClients.map(c => `<div class="list-item"><span>${escHtml(c.name)}</span><span class="item-meta">${formatDate(c.created_at)}</span></div>`).join('')
          : '<p class="item-meta">Aucun client enregistré.</p>'}
      </div>
      <div class="list">
        <h3>Dernières activités</h3>
        ${recentActivities.length
          ? recentActivities.map(a => `<div class="list-item"><span>${getActivityLabel(a.type)} — ${escHtml(a.notes)}</span><span class="item-meta">${formatDate(a.date)}</span></div>`).join('')
          : '<p class="item-meta">Aucune activité enregistrée.</p>'}
      </div>
      <div class="list">
        <h3>À faire</h3>
        ${openTasks.length
          ? openTasks.slice(0, 6).map(t => `<div class="list-item"><span>${escHtml(t.title)}</span><span class="item-meta">${
              t.due_date
                ? (t.due_date < today ? '<strong style="color:var(--danger)">' + formatDate(t.due_date) + '</strong>' : formatDate(t.due_date))
                : 'sans échéance'
            }</span></div>`).join('')
          : '<p class="item-meta">Rien en attente.</p>'}
      </div>
    </div>
  `;

  // Initialisation des graphiques
  setTimeout(() => {
    initCharts(statusData, statusLabels, sourceStats);
  }, 100);
}

/* Lit un token du thème courant. Chart.js ne connaît pas les variables CSS :
   sans ça, ses axes et ses légendes restent en gris foncé et disparaissent
   sur le fond sombre. */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ═══════════════ COULEURS DES GRAPHIQUES ═══════════════

   Validées le 31/08/2026 contre les deux surfaces réelles du CRM (#ffffff et
   #18181b) : bande de luminosité, seuil de saturation, séparation en vision
   déficiente (pire paire voisine ΔE 9,1 en protanopie, seuil 8) et contraste.
   Ce ne sont pas des couleurs choisies à l'œil.

   Deux jeux, parce que les deux graphiques ne font pas le même travail :

     RAMPE   pour le pipeline. Ses quatre étapes sont ORDONNÉES, et elles sont
             déjà nommées sous l'axe : quatre teintes sans rapport laissaient
             croire à quatre catégories indépendantes, et la couleur
             n'encodait rien. Une seule teinte, du clair au foncé, dit qu'on
             avance vers la signature.

     SOURCES pour l'origine des clients. Là, les catégories sont bien
             indépendantes : six teintes fixes, jamais recyclées.

   L'orange de marque #ED7A14 ne peut pas servir tel quel sur fond sombre —
   luminosité 0,698, hors de la bande 0,48–0,67. D'où l'échelon #D4720F, sur
   le même principe que --accent-text dans la feuille de style. */
const CHART_COLORS = {
  light: {
    ramp:    ['#E9A45F', '#DF8730', '#C4680C', '#824509'],
    sources: ['#2a78d6', '#ED7A14', '#1baf7a', '#eda100', '#e87ba4', '#008300']
  },
  dark: {
    ramp:    ['#F6C795', '#EDA05A', '#D4720F', '#8A4E0D'],
    sources: ['#3987e5', '#D4720F', '#199e70', '#c98500', '#d55181', '#008300']
  }
};

function chartColors() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? CHART_COLORS.dark : CHART_COLORS.light;
}

function initCharts(statusData, statusLabels, sourceStats) {
  /* Axes, légendes et grilles suivent le thème. */
  Chart.defaults.color = token('--fg-1');
  Chart.defaults.borderColor = token('--border-1');
  const family = token('--font-sans');
  if (family) Chart.defaults.font.family = family;

  /* maintainAspectRatio: false délègue la hauteur au CSS (.chart-box, 300px).
     Sans ça, Chart.js ignore les attributs du <canvas>, se dimensionne sur un
     parent sans hauteur, et le camembert débordait de sa carte en étirant la
     colonne voisine. */
  const baseOptions = { responsive: true, maintainAspectRatio: false };
  const palette = chartColors();
  const surface = token('--bg-0');

  // Pipeline — série unique, rampe ordonnée, pas de bordure
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    new Chart(statusCtx, {
      type: 'bar',
      data: {
        labels: statusLabels,
        datasets: [{
          label: 'Clients',
          data: statusData,
          backgroundColor: palette.ramp,
          borderWidth: 0,
          /* Extrémité arrondie côté valeur, pied carré sur la ligne de base. */
          borderRadius: { topLeft: 4, topRight: 4 },
          maxBarThickness: 24
        }]
      },
      options: Object.assign({}, baseOptions, {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        }
      })
    });
  }

  // Origine des clients — six catégories indépendantes
  const sourceCtx = document.getElementById('sourceChart');
  if (sourceCtx) {
    new Chart(sourceCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(sourceStats),
        datasets: [{
          data: Object.values(sourceStats),
          backgroundColor: palette.sources,
          /* Écart de 2px à la couleur du fond entre segments, plutôt qu'un
             contour : deux secteurs voisins ne se touchent jamais. */
          borderColor: surface,
          borderWidth: 2
        }]
      },
      options: Object.assign({}, baseOptions, {
        plugins: { legend: { position: 'bottom' } }
      })
    });
  }
}

/* ═══════════════ RENDU DES LISTES ═══════════════

   Les icônes étaient recopiées à l'identique dans cinq listes — le crayon
   cinq fois, les deux WhatsApp deux fois. Chaque ligne de liste dépassait
   les 3 000 caractères, ce qui rendait impossible de vérifier d'un coup
   d'œil que les valeurs venant de la base sont bien échappées. C'était la
   vraie raison pour laquelle l'échappement manquait ici : personne ne peut
   relire ça.

   Règle, désormais uniforme sur tout le fichier :
     escHtml() pour du texte, escAttr() dans un attribut,
     Number() pour un identifiant passé à un onclick. */

/* Ramène l'agent là d'où il venait après un enregistrement contextuel.
   Sans ça, noter une visite depuis la fiche d'un client le catapultait dans
   l'écran Activités, au milieu d'une liste qu'il n'était pas en train de lire. */
function returnTo(back, fallback) {
  if (back === 'clients') return showClients();
  if (back === 'properties') return showProperties();
  return fallback();
}

const ICON_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 001.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 00-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 005.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

const ICON_ACTIVITY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>';

const ICON_PAYMENT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>';

const ICON_EDIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

const ICON_WHATSAPP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg>';

const ICON_RELANCE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';

function clientRow(c) {
  const status = c.status || 'nouvelle demande';
  const source = c.source || 'Non renseignée';
  /* Compté par showClients, qui charge les recherches une seule fois. */
  const nb = (window._demandCount && window._demandCount[String(c.id)]) || 0;
  return `<div class="list-item">
    <div>
      <strong>${escHtml(c.name)}</strong> — ${escHtml(c.phone || 'pas de numéro')}
      <span class="status-badge" data-status="${escAttr(status)}">${escHtml(status)}</span>
    </div>
    <div class="item-meta">Source : ${escHtml(source)}${c.source_detail ? ' (' + escHtml(c.source_detail) + ')' : ''}</div>
    <div class="item-meta">${nb ? nb + ' recherche' + (nb > 1 ? 's' : '') + ' active' + (nb > 1 ? 's' : '') : 'aucune recherche'}</div>
    <div class="item-meta">${formatDate(c.created_at)}</div>
    <div>
      <a href="${escAttr(getWhatsApp(c.phone, c, 'general'))}" target="_blank" rel="noopener" class="whatsapp-btn" title="WhatsApp général">${ICON_WHATSAPP}</a>
      <a href="${escAttr(getWhatsApp(c.phone, c, 'followup'))}" target="_blank" rel="noopener" class="relance whatsapp-btn" title="Relance WhatsApp">${ICON_RELANCE}</a>
      <button onclick="showClientDemands(${Number(c.id)})" class="edit-btn" title="Ses recherches">${ICON_SEARCH}</button>
      <button onclick="addActivityFor('client', ${Number(c.id)})" class="edit-btn" title="Noter une activité pour ce client">${ICON_ACTIVITY}</button>
      <button onclick="addPaymentFor('client', ${Number(c.id)})" class="edit-btn" title="Enregistrer un paiement de ce client">${ICON_PAYMENT}</button>
      <button onclick="editClient(${Number(c.id)})" class="edit-btn" title="Modifier la fiche">${ICON_EDIT}</button>
    </div>
  </div>`;
}

async function showClients() {
  UI.showLoading();
  const [clients, demands] = await Promise.all([getAll('clients'), getAll('demands')]);

  /* Compteur de recherches actives, calculé une fois pour toute la liste
     plutôt qu'une requête par ligne. */
  window._demandCount = {};
  demands.filter(d => d.active !== false).forEach(d => {
    const k = String(d.client_id);
    window._demandCount[k] = (window._demandCount[k] || 0) + 1;
  });
  window._clients = clients;
  mainContent.innerHTML = `
    <h2>Clients</h2>
    <div class="toolbar">
      <input type="search" id="client-search" class="search-input" placeholder="Rechercher : nom, téléphone, statut, source…">
      <button onclick="showClientForm()" class="btn btn-primary">Ajouter Client</button>
      <button onclick="exportCSV('clients')" class="ghost-btn">Export CSV</button>
    </div>
    <div class="list" id="client-list">
      ${clients.length ? clients.map(clientRow).join('') : '<p class="item-meta">Aucun client pour le moment.</p>'}
    </div>
  `;

  const ci = document.getElementById('client-search');
  if (ci) {
    let ct = null;
    ci.addEventListener('input', () => {
      clearTimeout(ct);
      ct = setTimeout(() => {
        const q = ci.value.trim().toLowerCase();
        const terms = q ? q.split(/\s+/) : [];
        document.querySelectorAll('#client-list .list-item').forEach((el, i) => {
          const c = window._clients[i] || {};
          const hay = [c.name, c.phone, c.email, c.status, c.source, c.source_detail].join(' ').toLowerCase();
          el.style.display = terms.every(t => hay.indexOf(t) !== -1) ? '' : 'none';
        });
      }, 180);
    });
  }
}

function showClientForm(client = null) {
  mainContent.innerHTML = `
    <h2>${client ? 'Modifier' : 'Ajouter'} Client</h2>
    <form id="client-form">
      <div class="form-group">
        <label>Nom:</label>
        <input type="text" id="client-name" value="${escAttr((client && client.name) || '')}" required>
      </div>
      <div class="form-group">
        <label>Téléphone:</label>
        <input type="tel" id="client-phone" value="${escAttr((client && client.phone) || '')}">
      </div>
      <div class="form-group">
        <label>Email:</label>
        <input type="email" id="client-email" value="${escAttr((client && client.email) || '')}">
      </div>
      <div class="form-group">
        <label>Source de contact:</label>
        <select id="client-source" onchange="toggleClientSourceDetail()">
          <option value="">Sélectionner</option>
          <option value="facebook" ${client && client.source === 'facebook' ? 'selected' : ''}>Facebook</option>
          <option value="Koutchoumi" ${client && client.source === 'Koutchoumi' ? 'selected' : ''}>Koutchoumi</option>
          <option value="selogercm" ${client && client.source === 'selogercm' ? 'selected' : ''}>selogercm</option>
          <option value="Recommendations" ${client && client.source === 'Recommendations' ? 'selected' : ''}>Recommendations</option>
          <option value="autres" ${client && client.source === 'autres' ? 'selected' : ''}>Autres</option>
        </select>
      </div>
      <div class="form-group" id="client-source-detail-group" style="display: ${client && client.source === 'autres' ? 'block' : 'none'};">
        <label>Précisez:</label>
        <input type="text" id="client-source-detail" value="${escAttr(client ? (client.source_detail || '') : '')}">
      </div>
      <div class="form-group">
        <label>Type:</label>
        <select id="client-type">
          <option value="buyer" ${client && client.type === 'buyer' ? 'selected' : ''}>Acheteur</option>
          <option value="seller" ${client && client.type === 'seller' ? 'selected' : ''}>Vendeur</option>
          <option value="renter" ${client && client.type === 'renter' ? 'selected' : ''}>Locataire</option>
        </select>
      </div>
      <div class="form-group">
        <label>Statut demande:</label>
        <select id="client-status">
          <option value="nouvelle demande" ${client && client.status === 'nouvelle demande' ? 'selected' : ''}>Nouvelle demande</option>
          <option value="visite" ${client && client.status === 'visite' ? 'selected' : ''}>Visite</option>
          <option value="négociation" ${client && client.status === 'négociation' ? 'selected' : ''}>Négociation</option>
          <option value="signé" ${client && client.status === 'signé' ? 'selected' : ''}>Signé</option>
        </select>
      </div>
      <!-- Le bloc « Sa recherche » a quitté ce formulaire le 31/08/2026 :
           un client peut porter plusieurs recherches. Elles vivent désormais
           dans leur propre table et se gèrent depuis la liste des clients. -->

      ${client ? '<div class="form-group" id="client-demands-summary"></div>' : ''}
      <div class="form-group">
        <label>Notes <span class="item-meta">— sur la personne. Ce qu'elle cherche se note dans ses recherches.</span></label>
        <textarea id="client-notes">${escHtml((client && client.notes) || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${client ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showClients()" class="btn btn-outline">Annuler</button>
    </form>
  `;

  /* Le champ « Précisez » de la source « autres » se répète d'un client à
     l'autre : on rappelle ce qui a déjà été écrit. */
  wireSuggestions('client-source-detail', 'clients', 'source_detail');
  if (client) fillDemandsSummary(client.id);

  document.getElementById('client-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveClient(client ? client.id : null);
  });
}

async function saveClient(id) {
  const client = {
    name: document.getElementById('client-name').value,
    phone: document.getElementById('client-phone').value,
    email: document.getElementById('client-email').value,
    source: document.getElementById('client-source').value,
    source_detail: document.getElementById('client-source-detail') ? document.getElementById('client-source-detail').value : null,
    type: document.getElementById('client-type').value,
    status: document.getElementById('client-status').value,
    notes: document.getElementById('client-notes').value
  };

  /* Doublon : on demande avant d'écrire, pas après. Une fois la fiche créée,
     la corriger coûte plus cher que de renoncer — le CRM ne sait pas
     supprimer (voir le README). L'agent garde le dernier mot : deux
     homonymes existent, et un couple peut partager un numéro. */
  const jumeaux = findDuplicates({ id, name: client.name, phone: client.phone },
                                 await getAll('clients'));
  if (jumeaux.length) {
    const liste = jumeaux.slice(0, 3)
      .map(d => (d.client.name || 'sans nom') + ' (' + d.raison + ')').join(', ');
    const continuer = await UI.confirm(
      'Une fiche existe déjà : ' + liste + '.'
      + '\n\nSi c\'est la même personne avec une SECONDE recherche, créer une '
      + 'deuxième fiche est aujourd\'hui la seule façon de faire — le formulaire '
      + 'ne porte qu\'une demande par client.',
      { title: 'Fiche similaire', confirmLabel: 'Créer quand même', cancelLabel: 'Revenir à la saisie' });
    if (!continuer) return;
  }

  try {
    /* .select() renvoie la ligne telle qu'elle est en base — avec son id pour
       une création, et les valeurs réellement retenues. C'est cette ligne-là
       qu'on évalue ensuite, pas les champs du formulaire. */
    const { data, error } = id
      ? await supabaseClient.from('clients').update(client).eq('id', id).select()
      : await supabaseClient.from('clients').insert([client]).select();
    if (error) throw error;

    /* À la CRÉATION, on enchaîne sur la recherche : c'est au moment où le
       client appelle qu'on sait ce qu'il veut, et ne pas le lui demander là
       revient à ne jamais le noter. En modification, non : la fiche et ses
       recherches se gèrent séparément. */
    if (!id && data && data[0]) {
      UI.toast('Client enregistré. Que cherche-t-il ?', 'success', 6000);
      showDemandForm(null, { client_id: data[0].id }, 'clients');
    } else {
      showClients();
    }
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du client:', error);
    UI.handleError(error);
  }
}

function toggleClientSourceDetail() {
  const source = document.getElementById('client-source').value;
  const detailGroup = document.getElementById('client-source-detail-group');
  if (detailGroup) {
    detailGroup.style.display = source === 'autres' ? 'block' : 'none';
  }
}

/* État de la vue Propriétés : conservé entre les rendus pour que la
   recherche n'oblige pas à re-télécharger les données à chaque frappe. */
const propsView = { crm: [], site: [], q: '', src: 'all', loaded: false };

/* Vocabulaire des types de biens, UNIQUE pour les trois endroits où il sert :
   les annonces du site (listings.type, hors de notre main), les fiches biens
   du CRM (properties.type, contrainte élargie par sql/04_property_types.sql)
   et les critères d'une recherche (demands.wanted_types).

   Les clés sont exactement celles de la base du site. Une divergence
   d'orthographe ne produit aucune erreur : elle rend simplement le
   rapprochement muet, ce qui est bien pire. */
const TYPE_FR = {
  apartment: 'Appartement', studio: 'Studio', villa: 'Villa', house: 'Maison',
  duplex: 'Duplex', building: 'Immeuble', 'plots-of-land': 'Terrain',
  warehouse: 'Entrepôt', office: 'Bureau', shop: 'Boutique', commercial: 'Local commercial'
};

/* Les quartiers de Douala, proposés en liste parce qu'ils reviennent tous les
   jours. La liste n'est pas fermée : le formulaire de recherche accepte aussi
   des quartiers libres — Yaoundé, Kribi, Bafoussam — voir freeDistricts(). */
const DEMAND_DISTRICTS = ['Bonapriso','Bali','Bonanjo','Bonamoussadi','Makepe','Logpom',
  'Logbessou','Akwa','Deido','Kotto','Bonabéri','Yassa','Bonadiwoto','Youpwe','Ndogbong'];

/* Ce qui, dans une recherche, ne vient pas de la liste ci-dessus. */
function freeDistricts(wanted) {
  return (wanted || []).filter(d => DEMAND_DISTRICTS.indexOf(d) === -1);
}

/* Fusionne la sélection en liste et la saisie libre, sans doublon et sans
   valeur vide. La comparaison ignore casse et accents : « bonapriso » saisi
   à la main ne doit pas s'ajouter à côté de « Bonapriso » coché. */
function mergeDistricts(selectId, freeInputId) {
  const listes = multiVals(selectId) || [];
  const brut = (document.getElementById(freeInputId) || {}).value || '';
  const libres = brut.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);

  const out = [];
  const vus = new Set();
  listes.concat(libres).forEach(d => {
    const k = looseKey(d);
    if (!k || vus.has(k)) return;
    vus.add(k);
    out.push(d);
  });
  return out.length ? out : null;
}

function multiVals(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = Array.from(el.selectedOptions).map(o => o.value);
  return v.length ? v : null;
}
function numOrNull(id) {
  const el = document.getElementById(id);
  const n = el && el.value !== '' ? Number(el.value) : null;
  return Number.isFinite(n) ? n : null;
}

async function showProperties(force) {
  UI.showLoading();

  if (!propsView.loaded || force) {
    const [crm, site] = await Promise.all([
      getAll('properties'),
      (window.SLCM_SITE && window.SLCM_SITE.fetchListings) ? window.SLCM_SITE.fetchListings() : Promise.resolve([])
    ]);
    propsView.crm = crm;
    propsView.site = site;
    propsView.loaded = true;
  }

  mainContent.innerHTML = `
    <h2>Propriétés</h2>
    <div class="toolbar">
      <input type="search" id="prop-search" class="search-input" placeholder="Rechercher : titre, quartier, prix, référence…" value="${escAttr(propsView.q)}">
      <select id="prop-source" class="search-select">
        <option value="all"  ${propsView.src === 'all'  ? 'selected' : ''}>Toutes les sources</option>
        <option value="site" ${propsView.src === 'site' ? 'selected' : ''}>selogercm.com</option>
        <option value="crm"  ${propsView.src === 'crm'  ? 'selected' : ''}>Saisies CRM</option>
      </select>
      <button onclick="showPropertyForm()" class="btn btn-primary">Ajouter</button>
      <button onclick="exportCSV('properties')" class="ghost-btn" title="Exporter en CSV">Export CSV</button>
      <button onclick="showProperties(true)" class="ghost-btn" title="Recharger depuis selogercm.com">↻</button>
    </div>
    <p class="item-meta" id="prop-count"></p>
    <div class="list" id="prop-list"></div>
  `;

  const input = document.getElementById('prop-search');
  const sel = document.getElementById('prop-source');
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { propsView.q = input.value; renderPropsList(); }, 180);
  });
  sel.addEventListener('change', () => { propsView.src = sel.value; renderPropsList(); });

  renderPropsList();
}

/* Fusionne les biens publiés sur selogercm.com et les saisies internes.
   Un bien du site déjà rattaché à une fiche CRM (listing_id) n'apparaît
   qu'une fois : la fiche CRM prime et porte le lien vers l'annonce. */
function mergeProperties() {
  const linked = new Set(propsView.crm.map(p => p.listing_id).filter(Boolean));
  const crm = propsView.crm.map(p => Object.assign({}, p, {
    _src: p.listing_id ? 'site' : 'crm',
    _linked: !!p.listing_id
  }));
  const site = propsView.site
    .filter(l => !linked.has(l.id))
    .map(l => ({
      id: null, _siteId: l.id, _slug: l.slug, _src: 'site', _linked: false,
      title: l.title, address: [l.district, l.city].filter(Boolean).join(', '),
      price: l.price, status: l.status, type: l.type, created_at: l.created_at
    }));
  return crm.concat(site);
}

function renderPropsList() {
  const q = propsView.q.trim().toLowerCase();
  let rows = mergeProperties();
  if (propsView.src !== 'all') rows = rows.filter(r => r._src === propsView.src);
  if (q) {
    const terms = q.split(/\s+/);
    rows = rows.filter(r => {
      const hay = [r.title, r.address, r.type, r.status, r.price, r._slug].join(' ').toLowerCase();
      return terms.every(t => hay.indexOf(t) !== -1);
    });
  }

  const box = document.getElementById('prop-list');
  const cnt = document.getElementById('prop-count');
  if (cnt) {
    const nSite = propsView.site.length;
    cnt.textContent = `${rows.length} bien(s) affiché(s) · ${nSite} publié(s) sur selogercm.com · ${propsView.crm.length} fiche(s) CRM`;
  }
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = '<p>Aucun bien ne correspond à cette recherche.</p>';
    return;
  }

  box.innerHTML = rows.map(p => {
    const badge = p._src === 'site'
      ? '<span class="src-badge src-site" title="Publié sur selogercm.com">SITE</span>'
      : '<span class="src-badge src-crm" title="Saisie interne">CRM</span>';
    const price = Number(p.price) > 0 ? Number(p.price).toLocaleString('fr-FR') + ' FCFA' : 'Prix non renseigné';
    const slug = p._slug || p.listing_slug;
    const link = slug
      ? `<a href="https://selogercm.com/annonce/${encodeURIComponent(slug)}" target="_blank" rel="noopener" class="ghost-btn" title="Voir l'annonce en ligne">Voir</a>`
      : '';
    /* Partage : uniquement pour un bien ayant une page publique.
       Une fiche purement interne n'a pas d'URL à envoyer. */
    const sid = p._siteId || p.listing_id;
    const share = (slug && sid)
      ? `<button onclick="shareListing('${escAttr(sid)}')" class="ghost-btn share-btn" title="Partager à un client">Partager</button>`
      : '';
    const action = p.id
      ? `<button onclick="addActivityFor('property', ${Number(p.id)})" class="edit-btn" title="Noter une activité sur ce bien">${ICON_ACTIVITY}</button>`
        + `<button onclick="editProperty(${Number(p.id)})" class="edit-btn" title="Modifier la fiche">${ICON_EDIT}</button>`
      : `<button onclick="importListing('${escAttr(p._siteId)}')" class="edit-btn" title="Créer une fiche CRM pour ce bien">+ Fiche</button>`;
    return `<div class="list-item">
      <div><strong>${escHtml(p.title || 'Sans titre')}</strong> ${badge}</div>
      <div class="item-meta">${escHtml(p.address || '')} — ${price}</div>
      <div class="item-meta">${formatDate(p.created_at)}</div>
      <div>${link}${share}${action}</div>
    </div>`;
  }).join('');
}

/* Crée une fiche CRM rattachée à une annonce du site.
   Le bien n'est pas dupliqué : la fiche porte listing_id + listing_slug
   et sert de point d'accroche aux activités, paiements et commissions. */
async function importListing(siteId) {
  const l = propsView.site.find(x => String(x.id) === String(siteId));
  if (!l) return;
  const { data, error } = await supabaseClient.from('properties').insert([{
    title: l.title,
    address: [l.district, l.city].filter(Boolean).join(', '),
    type: l.type === 'apartment' ? 'apartment' : 'house',
    price: l.price,
    status: l.status === 'active' ? 'available' : 'available',
    description: 'Importé depuis selogercm.com',
    listing_id: l.id,
    listing_slug: l.slug,
    source: 'site'
  }]).select();
  if (error) { UI.toast('Import impossible : ' + error.message, 'error'); return; }
  if (data && data[0]) propsView.crm.unshift(data[0]);
  UI.toast('Fiche CRM créée pour « ' + (l.title || 'ce bien') + ' »', 'success');
  renderPropsList();
  alertClientsForListing(l);
}

/* ═══════════════ PARTAGE À UN CLIENT ═══════════════ */

/* Sélecteur de client : on montre en tête ceux dont la demande
   correspond au bien, pour éviter de faire défiler toute la base. */
async function shareListing(siteId) {
  const listing = (propsView.site || []).find(x => String(x.id) === String(siteId))
    || await window.SLCM_SITE.fetchListing(siteId);
  if (!listing) { UI.toast('Annonce introuvable.', 'error'); return; }

  const clients = await getAll('clients');
  if (!clients.length) { UI.toast('Aucun client enregistré.', 'error'); return; }

  /* Les clients dont la demande colle au bien remontent en tête :
     inutile de faire défiler toute la base à chaque partage. */
  /* Un client peut porter plusieurs recherches : on retient la meilleure,
     puisque c'est la personne qu'on va contacter, pas sa recherche. */
  const demands = await getAll('demands');
  const meilleur = new Map();
  window.SLCM_MATCH.demandsForListing(listing, demands).forEach(h => {
    const k = String(h.demand.client_id);
    if (!meilleur.has(k) || meilleur.get(k) < h.score) meilleur.set(k, h.score);
  });

  const scored = clients.map(c => {
    const score = meilleur.get(String(c.id)) || 0;
    return { c, score, fit: score > 0 };
  }).sort((a, b) => b.score - a.score || String(a.c.name || '').localeCompare(String(b.c.name || '')));

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="item-meta">${escHtml(listing.title || '')} — ${Number(listing.price) > 0 ? Number(listing.price).toLocaleString('fr-FR') + ' FCFA' : 'prix sur demande'}</p>
    <input type="search" id="pick-search" class="search-input" placeholder="Filtrer les clients…" style="margin:.6rem 0;width:100%">
    <div class="pick-list" id="pick-list">
      ${scored.map(({ c, score, fit }) => `
        <label class="pick-row"${c.phone ? '' : ' title="Pas de numéro : envoi impossible"'}>
          <input type="checkbox" value="${escAttr(c.id)}"${c.phone ? '' : ' disabled'}>
          <span class="pick-name">${escHtml(c.name || 'Sans nom')}</span>
          <span class="item-meta">${escHtml(c.phone || 'pas de numéro')}</span>
          ${fit ? `<span class="src-badge src-site">MATCH ${score}%</span>` : ''}
        </label>`).join('')}
    </div>
    <p class="item-meta" style="margin-top:.6rem">WhatsApp ouvre un onglet par client. Au-delà de trois ou quatre, le navigateur en bloque une partie.</p>`;

  const inp = body.querySelector('#pick-search');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    body.querySelectorAll('.pick-row').forEach(el => {
      el.style.display = el.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  });

  UI.modal({
    title: 'Partager ce bien',
    body: body,
    actions: [
      { label: 'Annuler', variant: 'ghost' },
      {
        label: 'Envoyer sur WhatsApp',
        variant: 'primary',
        onClick: async () => {
          const ids = Array.from(body.querySelectorAll('#pick-list input:checked')).map(i => Number(i.value));
          if (!ids.length) { UI.toast('Aucun client sélectionné.', 'error'); return false; }
          let sent = 0;
          for (const id of ids) {
            const c = clients.find(x => x.id === id);
            if (!c || !c.phone) continue;
            sendWhatsApp(c.phone, window.SLCM_MATCH.shareMessage(listing, c));
            await window.SLCM_MATCH.markShared(id, listing);
            sent++;
          }
          UI.toast(sent + ' envoi(s) préparé(s).', 'success');
        }
      }
    ]
  });
}


/* Le repère « déjà vu » n'avance que sur action de l'agent : recharger deux
   fois le tableau de bord ne doit pas faire disparaître l'alerte en silence. */
function goToMatching() {
  /* Pas `navTo(...)()` : navTo fabrique un gestionnaire, elle ne navigue pas.
     C'est précisément la confusion qui rendait le bouton Rapprochements inerte
     avant le 31/08 — on ne la réintroduit pas dans un onclick. */
  setActiveNav(matchingBtn);
  showMatching();
}

function dismissFreshAlert() {
  window.SLCM_MATCH.markSeen(window._freshListings || []);
  const el = document.getElementById('fresh-alert');
  if (el) el.remove();
}

/* ═══════════════ SUGGESTIONS ET VALEURS RETENUES ═══════════════

   Deux conforts de saisie, sans intelligence artificielle non plus.

   Les suggestions ne devinent rien : elles rappellent ce qui a déjà été
   saisi. Le but n'est pas de taper moins vite, c'est d'éviter les variantes.
   « Bonapriso », « bonapriso » et « Bonaprisso » sont trois quartiers pour
   une base de données et un seul pour un humain — et c'est exactement ce
   genre d'écart qui rend un rapprochement muet sans qu'on comprenne
   pourquoi. */

function looseKey(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

/** Fabrique un fetchSuggestions à partir de valeurs déjà en base. */
function suggestFrom(values, extra) {
  const uniques = [...new Set(
    (values || []).concat(extra || [])
      .filter(Boolean).map(v => String(v).trim()).filter(v => v.length > 1)
  )].sort((a, b) => a.localeCompare(b, 'fr'));

  return (q) => {
    const key = looseKey(q);
    return uniques
      .filter(v => looseKey(v).indexOf(key) !== -1)
      .slice(0, 8)
      .map(v => ({ label: v }));
  };
}

/* ─── Valeurs retenues d'une saisie à l'autre ───

   Un agent qui enregistre quatre visites d'affilée reprend quatre fois le
   même type. La dernière valeur choisie devient le défaut de la CRÉATION
   suivante — jamais d'une modification, où elle écraserait une donnée
   existante. Le repère est local au navigateur : c'est une habitude de
   saisie, pas une donnée du CRM. */

/** Branche l'autocomplétion d'un champ sur les valeurs déjà en base. */
async function wireSuggestions(inputId, table, column, extra) {
  const el = document.getElementById(inputId);
  if (!el || !window.UI || typeof UI.autocomplete !== 'function') return;
  const rows = await getAll(table);
  if (!el.isConnected) return;   // l'agent a quitté le formulaire entre-temps
  UI.autocomplete(el, {
    minChars: 1,
    fetchSuggestions: suggestFrom(rows.map(r => r[column]), extra)
  });
}

function rememberChoice(key, value) {
  try { if (value) localStorage.setItem('slcm-last-' + key, value); } catch (e) {}
}

function lastChoice(key, fallback) {
  try { return localStorage.getItem('slcm-last-' + key) || fallback; }
  catch (e) { return fallback; }
}

/* ═══════════════ DÉTECTION DE DOUBLONS ═══════════════

   Sans aucune intelligence artificielle, délibérément : rapprocher deux
   numéros ou deux noms se décide par des règles. C'est gratuit, instantané,
   ça ne peut pas se tromper de façon imprévisible, et un modèle n'aurait
   d'intérêt que là où une règle échoue vraiment — ce n'est pas le cas ici.

   Rien n'est bloquant : on signale, l'agent tranche. Deux personnes peuvent
   légitimement partager un numéro — un couple, une secrétaire — et deux
   homonymes existent. */

/* Nom comparable : sans accents, sans civilité, sans ponctuation.
   « M. Dicka », « Dicka » et « M DICKA » se rejoignent. */
/* Civilités retirées avant comparaison : « M. Dicka », « Dicka » et
   « M DICKA » désignent la même personne. */
const CIVILITES = /\b(m|mr|mme|mlle|dr|pr|monsieur|madame|mademoiselle)\b\.?/g;

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // accents
    .toLowerCase()
    .replace(CIVILITES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')                       // ponctuation, &, tirets
    .trim();
}

/**
 * Les fiches existantes qui ressemblent à celle qu'on s'apprête à créer.
 * @param {object} candidate  { id?, name, phone }
 * @param {array}  clients    le portefeuille
 */
function findDuplicates(candidate, clients) {
  const name = normalizeName(candidate.name);
  const phone = normalizePhone(candidate.phone);
  if (!name && !phone) return [];

  return clients.filter(c => {
    if (candidate.id && c.id === candidate.id) return false;   // pas soi-même
    /* Un numéro identique est le signal le plus fort : deux chaînes saisies
       « 650 840 714 » et « +237650840714 » désignent le même abonné. */
    if (phone && normalizePhone(c.phone) === phone) return true;
    return name && normalizeName(c.name) === name;
  }).map(c => ({
    client: c,
    raison: (phone && normalizePhone(c.phone) === phone) ? 'même numéro' : 'même nom'
  }));
}

/* Raccourcis de saisie contextuelle. Le formulaire s'ouvre déjà rattaché à
   la fiche d'où l'on vient, et l'annulation comme l'enregistrement y ramènent. */
function addActivityFor(kind, id) {
  const draft = kind === 'client' ? { client_id: id } : { property_id: id };
  if (kind === 'property') draft.type = 'visit';
  showActivityForm(null, draft, kind === 'client' ? 'clients' : 'properties');
}

function addPaymentFor(kind, id) {
  showPaymentForm(null, kind === 'client' ? { client_id: id } : { property_id: id },
                  kind === 'client' ? 'clients' : 'properties');
}

/* ═══════════════ LES RECHERCHES D'UN CLIENT ═══════════════

   Un client peut chercher plusieurs choses à la fois — un studio pour lui,
   un deux-chambres pour sa mère. Jusqu'au 31/08/2026 la fiche client ne
   portait qu'une recherche, et le seul contournement était de créer deux
   fiches au même nom. Voir sql/03_demands.sql. */

/** Libellé lisible d'une recherche : celui saisi, sinon déduit des critères. */
function demandLabel(d) {
  if (d.label) return d.label;
  const bits = [];
  if (d.rent_sale) bits.push(d.rent_sale === 'rent' ? 'location' : 'achat');
  if (d.wanted_types && d.wanted_types.length) {
    bits.push(d.wanted_types.map(t => TYPE_FR[t] || t).join(' / '));
  }
  if (d.wanted_districts && d.wanted_districts.length) bits.push(d.wanted_districts.join(', '));
  if (d.min_bedrooms) bits.push(d.min_bedrooms + '+ ch.');
  if (d.budget_min && d.budget) bits.push(formatMoney(d.budget_min) + ' – ' + formatMoney(d.budget) + ' FCFA');
  else if (d.budget) bits.push('≤ ' + formatMoney(d.budget) + ' FCFA');
  else if (d.budget_min) bits.push('≥ ' + formatMoney(d.budget_min) + ' FCFA');
  if (d.wants_furnished) bits.push('meublé');
  return bits.join(' · ') || 'critères à préciser';
}

/* Rappel en lecture seule, dans la fiche client : ce qu'il cherche est sur
   un autre écran, et sans ce bloc on ouvre une fiche sans savoir pourquoi ce
   client est là. Ne modifie rien — le bouton renvoie vers l'écran dédié. */
async function fillDemandsSummary(clientId) {
  const box = document.getElementById('client-demands-summary');
  if (!box) return;
  const siennes = (await getAll('demands'))
    .filter(d => String(d.client_id) === String(clientId));
  if (!box.isConnected) return;

  box.innerHTML = `
    <label>Ses recherches</label>
    ${siennes.length
      ? `<div class="list">${siennes.map(d => `
          <div class="list-item">
            <div>${escHtml(demandLabel(d))} ${d.active ? '' : '<span class="src-badge src-crm">EN PAUSE</span>'}</div>
            <div class="item-meta">${escHtml(d.notes || '')}</div>
          </div>`).join('')}</div>`
      : "<p class=\"item-meta\">Aucune recherche enregistrée — ce client n'apparaîtra dans aucun rapprochement.</p>"}
    <button type="button" onclick="showClientDemands(${Number(clientId)})" class="ghost-btn" style="margin-top:var(--space-2)">
      ${siennes.length ? 'Gérer ses recherches' : 'Ajouter une recherche'}
    </button>`;
}

async function showClientDemands(clientId) {
  UI.showLoading();
  const [client, demands] = await Promise.all([
    getById('clients', clientId),
    getAll('demands')
  ]);
  if (!client) { UI.toast('Client introuvable.', 'error'); return showClients(); }
  const siennes = demands.filter(d => String(d.client_id) === String(clientId));

  mainContent.innerHTML = `
    <h2>Recherches de ${escHtml(client.name)}</h2>
    <div class="toolbar">
      <button onclick="showDemandForm(null, { client_id: ${Number(clientId)} })" class="btn btn-primary">Ajouter une recherche</button>
      <button onclick="showClients()" class="btn btn-outline">Retour aux clients</button>
    </div>
    ${siennes.length ? `<div class="list">${siennes.map(d => `
      <div class="list-item">
        <div><strong>${escHtml(demandLabel(d))}</strong>
          ${d.active ? '' : '<span class="src-badge src-crm">EN PAUSE</span>'}</div>
        <div class="item-meta">${escHtml(d.notes || '')}</div>
        <div class="item-meta">créée le ${formatDate(d.created_at)}</div>
        <div>
          <button onclick="editDemand(${Number(d.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button>
          <button onclick="toggleDemand(${Number(d.id)}, ${d.active ? 'false' : 'true'})" class="ghost-btn">${d.active ? 'Mettre en pause' : 'Réactiver'}</button>
        </div>
      </div>`).join('')}</div>`
      : `<div class="empty-state">
           <p><strong>Aucune recherche enregistrée.</strong></p>
           <p>Sans recherche, ce client n'apparaît jamais dans les rapprochements.
           Une recherche porte un budget, des quartiers, un type de bien — et un
           même client peut en avoir plusieurs.</p>
         </div>`}
  `;
}

function showDemandForm(demand = null, draft = null, back = null) {
  const v = demand || draft || {};
  const editing = !!demand;
  const clientId = v.client_id;
  /* Arrivé depuis la création d'un client, « Passer » doit rendre la main à
     la liste : un vendeur ou un apporteur n'a pas de recherche, et on ne le
     coince pas sur un écran vide. */
  const annuler = back === 'clients' ? 'showClients()' : 'showClientDemands(' + Number(clientId) + ')';

  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier' : 'Ajouter'} une recherche</h2>
    <form id="demand-form">
      <div class="form-group">
        <label>Intitulé <span class="item-meta">— facultatif, par exemple « pour sa mère »</span></label>
        <input type="text" id="demand-label" value="${escAttr(v.label || '')}"
               placeholder="À défaut, l'intitulé est déduit des critères">
      </div>
      <fieldset class="demand-block">
        <legend>Critères <span class="item-meta">— alimentent les rapprochements</span></legend>
        <div class="form-group">
          <label>Transaction:</label>
          <select id="demand-rentsale" required>
            <option value="">À préciser</option>
            <option value="rent" ${v.rent_sale === 'rent' ? 'selected' : ''}>Location</option>
            <option value="sale" ${v.rent_sale === 'sale' ? 'selected' : ''}>Achat</option>
          </select>
          <p class="item-meta">Sans transaction, aucun rapprochement n'est possible.</p>
        </div>
        <div class="form-group">
          <label>Types recherchés <span class="item-meta">(Ctrl / Cmd pour plusieurs)</span></label>
          <select id="demand-types" multiple size="5">
            ${Object.keys(TYPE_FR).map(t => `<option value="${escAttr(t)}" ${(v.wanted_types || []).indexOf(t) !== -1 ? 'selected' : ''}>${TYPE_FR[t]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Quartiers visés:</label>
          <select id="demand-districts" multiple size="5">
            ${DEMAND_DISTRICTS.map(d => `<option value="${escAttr(d)}" ${(v.wanted_districts || []).indexOf(d) !== -1 ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Autres quartiers <span class="item-meta">— hors Douala, séparés par des virgules</span></label>
          <input type="text" id="demand-districts-free"
                 value="${escAttr(freeDistricts(v.wanted_districts).join(', '))}"
                 placeholder="Yaoundé, Kribi, Bafoussam…" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Budget maximum (FCFA):</label>
          <input type="number" id="demand-budget" value="${escAttr(v.budget || '')}" placeholder="Loyer mensuel ou prix de vente">
        </div>
        <div class="form-group">
          <label>Budget minimum (FCFA) <span class="item-meta">— facultatif</span></label>
          <input type="number" id="demand-budget-min" value="${escAttr(v.budget_min || '')}" placeholder="Écarte les biens trop en dessous des attentes">
        </div>
        <div class="form-group">
          <label>Chambres minimum:</label>
          <input type="number" id="demand-bedrooms" min="0" value="${escAttr(v.min_bedrooms || '')}">
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="demand-furnished" ${v.wants_furnished ? 'checked' : ''}> Meublé exigé</label>
        </div>
      </fieldset>
      <div class="form-group">
        <label>Le besoin en clair <span class="item-meta">— ce que le client a dit, avec ses mots</span></label>
        <textarea id="demand-notes" placeholder="« Cherche à emménager avant décembre, budget serré mais peut monter pour du meublé. »">${escHtml(v.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="demand-active" ${v.active === false ? '' : 'checked'}> Active dans les rapprochements</label>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="${annuler}" class="btn btn-outline">${back === 'clients' ? 'Passer, sans recherche' : 'Annuler'}</button>
    </form>
  `;

  document.getElementById('demand-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveDemand(editing ? demand.id : null, clientId);
  });
}

async function saveDemand(id, clientId) {
  const demand = {
    client_id: clientId,
    label: document.getElementById('demand-label').value || null,
    /* Critères — null quand non renseigné, jamais 0 ni '' : un 0 serait lu
       comme « budget nul » et bloquerait tout rapprochement. */
    rent_sale: document.getElementById('demand-rentsale').value || null,
    wanted_types: multiVals('demand-types'),
    wanted_districts: mergeDistricts('demand-districts', 'demand-districts-free'),
    budget: numOrNull('demand-budget'),
    budget_min: numOrNull('demand-budget-min'),
    min_bedrooms: numOrNull('demand-bedrooms'),
    wants_furnished: document.getElementById('demand-furnished').checked ? true : null,
    notes: document.getElementById('demand-notes').value || null,
    active: document.getElementById('demand-active').checked
  };

  try {
    const { data, error } = id
      ? await supabaseClient.from('demands').update(demand).eq('id', id).select()
      : await supabaseClient.from('demands').insert([demand]).select();
    if (error) throw error;

    showClientDemands(clientId);
    if (data && data[0]) alertMatchesForDemand(data[0]);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la recherche:', error);
    UI.handleError(error);
  }
}

async function editDemand(id) {
  const demand = await getById('demands', id);
  if (!demand) { UI.toast('Recherche introuvable.', 'error'); return; }
  showDemandForm(demand);
}

/** Met une recherche en pause, ou la réveille. Rien ne se supprime. */
async function toggleDemand(id, active) {
  const demand = await getById('demands', id);
  if (!demand) return;
  try {
    const { error } = await supabaseClient.from('demands').update({ active }).eq('id', id);
    if (error) throw error;
    UI.toast(active ? 'Recherche réactivée.' : 'Recherche mise en pause.', 'success');
    showClientDemands(demand.client_id);
  } catch (error) {
    UI.handleError(error);
  }
}

/* ═══════════════ ALERTES DE RAPPROCHEMENT ═══════════════

   Le rapprochement existait déjà, mais il fallait aller le chercher : ouvrir
   l'écran Rapprochements et regarder. Une correspondance qui apparaît pendant
   qu'on est ailleurs n'existait pour personne.

   Trois moments de déclenchement, tous immédiats et sans tâche de fond :
     · une demande est enregistrée  → quelles annonces y répondent
     · un bien entre au portefeuille → quels clients l'attendaient
     · une annonce paraît sur le site → signalée au tableau de bord

   Rien n'est envoyé automatiquement, conformément au principe du fichier
   match.js : on signale, l'agent décide. */

/* Charge de quoi évaluer un rapprochement. Dégrade en silence : une alerte
   manquée ne doit jamais empêcher un enregistrement d'aboutir. */
async function matchContext() {
  try {
    const [listings, shared] = await Promise.all([
      window.SLCM_SITE.fetchListings(),
      window.SLCM_MATCH.loadShared()
    ]);
    return { listings, shared };
  } catch (e) {
    console.error('[match] contexte indisponible :', e && e.message);
    return { listings: [], shared: new Set() };
  }
}

/** Après l'enregistrement d'une demande : ce qui y répond, s'il y a lieu. */
async function alertMatchesForDemand(demand) {
  if (!demand || !window.SLCM_MATCH.isLive(demand)) return;
  const { listings, shared } = await matchContext();
  const hits = window.SLCM_MATCH.matchesForDemand(demand, listings, shared);
  if (!hits.length) return;
  UI.toast(
    hits.length + ' annonce' + (hits.length > 1 ? 's correspondent' : ' correspond')
      + ' à cette recherche : ' + demandLabel(demand) + '.',
    'success', 7000);
}

/** Après l'entrée d'un bien : les clients qui l'attendaient. */
async function alertClientsForListing(listing) {
  if (!listing) return;
  const [{ shared }, demands, clients] = await Promise.all([
    matchContext(), getAll('demands'), getAll('clients')
  ]);
  const hits = window.SLCM_MATCH.demandsForListing(listing, demands, shared);
  if (!hits.length) return;

  /* Deux recherches d'un même client ne comptent que pour une personne :
     c'est à elle qu'on écrira, pas à sa recherche. */
  const parClient = new Map(clients.map(c => [String(c.id), c]));
  const noms = [...new Set(hits.map(h => {
    const c = parClient.get(String(h.demand.client_id));
    return (c && c.name) || 'sans nom';
  }))];
  UI.toast(
    noms.length + ' client' + (noms.length > 1 ? 's attendaient' : ' attendait')
      + ' ce bien : ' + noms.slice(0, 3).join(', ') + (noms.length > 3 ? '…' : ''),
    'success', 8000);
}

/* ═══════════════ MATCHING ═══════════════ */

async function showMatching() {
  UI.showLoading();

  const [clients, demands, listings, sent] = await Promise.all([
    getAll('clients'),
    getAll('demands'),
    window.SLCM_SITE.fetchListings(),
    window.SLCM_MATCH.loadShared()
  ]);

  /* Le moteur ne connaît que des demandes ; l'écran doit nommer des gens.
     La jointure se fait ici, une fois, plutôt qu'à chaque affichage. */
  const parClient = new Map(clients.map(c => [String(c.id), c]));
  const vivantes = demands.filter(window.SLCM_MATCH.isLive);
  const matches = window.SLCM_MATCH.computeMatches(demands, listings, sent);

  if (!vivantes.length) {
    mainContent.innerHTML = `
      <h2>Rapprochements</h2>
      <div class="empty-state">
        <p><strong>Aucune recherche enregistrée.</strong></p>
        <p>Le rapprochement compare ce que cherchent vos clients aux
        ${listings.length} annonces publiées sur selogercm.com. Pour qu'il
        fonctionne, ouvrez une fiche client, puis « Recherches », et renseignez
        au moins une transaction et un critère. Un même client peut porter
        plusieurs recherches.</p>
        <button onclick="showClients()" class="btn btn-primary">Ouvrir les clients</button>
      </div>`;
    return;
  }

  window._matchCache = { listings, matches, parClient };

  const nbClients = new Set(vivantes.map(d => String(d.client_id))).size;

  mainContent.innerHTML = `
    <h2>Rapprochements</h2>
    <p class="item-meta">${vivantes.length} recherche(s) active(s) chez ${nbClients} client(s) · ${listings.length} annonce(s) en ligne · ${matches.length} recherche(s) avec au moins une correspondance</p>
    ${matches.length ? matches.map((m, mi) => {
      const client = parClient.get(String(m.demand.client_id));
      return `
      <div class="match-card">
        <div class="match-head">
          <strong>${escHtml((client && client.name) || 'Client inconnu')}</strong>
          <span class="item-meta">${escHtml(demandLabel(m.demand))}</span>
          <span class="src-badge src-site">${m.total} bien(s)</span>
        </div>
        <div class="list">
          ${m.hits.map((h, hi) => `
            <div class="list-item">
              <div><strong>${escHtml(h.listing.title || 'Sans titre')}</strong>
                <span class="src-badge src-site">${h.score}%</span></div>
              <div class="item-meta">${escHtml([h.listing.district, h.listing.city].filter(Boolean).join(', '))} — ${Number(h.listing.price) > 0 ? formatMoney(h.listing.price) + ' FCFA' : 'prix sur demande'}</div>
              <div class="item-meta">${escHtml(h.reasons.join(' · '))}</div>
              <div>
                ${h.listing.slug ? `<a href="https://selogercm.com/annonce/${encodeURIComponent(h.listing.slug)}" target="_blank" rel="noopener" class="ghost-btn">Voir</a>` : ''}
                <button onclick="sendMatch(${mi},${hi})" class="ghost-btn share-btn">Envoyer</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`; }).join('')
      : `<div class="empty-state"><p><strong>Aucune correspondance actuellement.</strong></p>
         <p>Les critères de vos clients ne trouvent pas d'écho dans le stock en ligne,
         ou les biens correspondants leur ont déjà été envoyés.</p></div>`}
  `;
}

/* Envoi d'un match : WhatsApp s'ouvre, la trace est enregistrée, et le bien
   disparaît des propositions suivantes — pour TOUTES les recherches de ce
   client, puisque l'historique est indexé sur la personne. */
async function sendMatch(mi, hi) {
  const cache = window._matchCache;
  const m = cache && cache.matches[mi];
  if (!m) return;
  const h = m.hits[hi];
  if (!h) return;
  const client = cache.parClient.get(String(m.demand.client_id));
  if (!client) { UI.toast('Client introuvable.', 'error'); return; }
  if (!client.phone) { UI.toast('Ce client n\'a pas de numéro.', 'error'); return; }

  sendWhatsApp(client.phone, window.SLCM_MATCH.shareMessage(h.listing, client));
  await window.SLCM_MATCH.markShared(client.id, h.listing);
  UI.toast('Envoyé à ' + (client.name || 'ce client') + '.', 'success');
  showMatching();
}


/* Export CSV — la seule protection contre la perte de données du CRM. */
async function exportCSV(table) {
  const rows = await getAll(table);
  if (!rows.length) { UI.toast('Rien à exporter.', 'error'); return; }
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[";\n]/.test(s) ? '"' + s + '"' : s;
  };
  const csv = '\uFEFF' + [cols.join(';')].concat(rows.map(r => cols.map(c => cell(r[c])).join(';'))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `slcm-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  UI.toast(`${rows.length} ligne(s) exportée(s).`, 'success');
}

function escHtml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v) {
  return escHtml(v).replace(/"/g, '&quot;');
}

function showPropertyForm(property = null) {
  const v = property || {};
  const editing = !!property;
  /* En création, on reprend le dernier choix de l'agent ; en modification,
     jamais — ce serait écraser une donnée existante par une habitude. */
  const defType   = v.type   || (editing ? '' : lastChoice('property-type', 'house'));
  const defStatus = v.status || (editing ? '' : lastChoice('property-status', 'available'));

  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier' : 'Ajouter'} un bien</h2>
    <form id="property-form">
      <div class="form-group">
        <label>Titre:</label>
        <input type="text" id="property-title" value="${escAttr(v.title || '')}" required>
      </div>
      <div class="form-group">
        <label>Adresse:</label>
        <input type="text" id="property-address" value="${escAttr(v.address || '')}" required
               placeholder="Quartier, ville" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Type:</label>
        <select id="property-type">
          ${Object.keys(TYPE_FR).map(t => `<option value="${escAttr(t)}" ${defType === t ? 'selected' : ''}>${TYPE_FR[t]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Prix (FCFA):</label>
        <input type="number" id="property-price" value="${escAttr(v.price || '')}">
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="property-status">
          <option value="available" ${defStatus === 'available' ? 'selected' : ''}>Disponible</option>
          <option value="sold" ${defStatus === 'sold' ? 'selected' : ''}>Vendu</option>
          <option value="rented" ${defStatus === 'rented' ? 'selected' : ''}>Loué</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="property-description">${escHtml(v.description || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="showProperties()" class="btn btn-outline">Annuler</button>
    </form>
  `;

  /* Adresses déjà saisies + les quartiers connus du rapprochement : écrire
     « Bonaprisso » une fois suffit à rendre un bien introuvable. */
  wireSuggestions('property-address', 'properties', 'address', DEMAND_DISTRICTS);

  document.getElementById('property-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProperty(editing ? property.id : null);
  });
}

async function saveProperty(id) {
  const property = {
    title: document.getElementById('property-title').value,
    address: document.getElementById('property-address').value,
    type: document.getElementById('property-type').value,
    /* Même règle que due_date : le prix est facultatif, et '' est refusé
       par une colonne numérique. numOrNull fait déjà exactement ça. */
    price: numOrNull('property-price'),
    status: document.getElementById('property-status').value,
    description: document.getElementById('property-description').value
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('properties').update(property).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('properties').insert([property]);
      if (error) throw error;
    }
    rememberChoice('property-type', property.type);
    rememberChoice('property-status', property.status);
    showProperties();
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la propriété:', error);
    UI.handleError(error);
  }
}

async function showActivities() {
  UI.showLoading();
  const activities = await getAll('activities');
  mainContent.innerHTML = `
    <h2>Journal d'activités</h2>
    <button onclick="showActivityForm()" class="btn btn-primary">Ajouter Activité</button>
    <div class="list">
      ${activities.length ? activities.map(a => `<div class="list-item">
        <div><strong>${getActivityLabel(a.type)}</strong> — ${escHtml(a.notes)}</div>
        <div class="item-meta">${formatDate(a.date)}</div>
        <div><button onclick="editActivity(${Number(a.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button></div>
      </div>`).join('') : '<p class="item-meta">Aucune activité pour le moment.</p>'}
    </div>
  `;
}

/* ═══════════════ SAISIE CONTEXTUELLE ═══════════════

   Les six formulaires du CRM étaient tous « globaux » : pour noter une visite
   chez Marthe, il fallait aller dans Activités puis retrouver Marthe dans une
   liste de vingt noms — alors qu'on venait de sa fiche, et que le CRM savait
   donc déjà de qui on parlait. C'était la vraie répétition de la saisie, plus
   que le fait de retaper des mots.

   Les formulaires acceptent désormais un second argument :
     · `draft`  les valeurs de départ d'un NOUVEL enregistrement
     · `back`   l'écran où revenir après l'enregistrement, pour ne pas
                éjecter l'agent de la liste qu'il était en train de parcourir

   Le premier argument garde son rôle : un objet = modification, null = création. */

function showActivityForm(activity = null, draft = null, back = null) {
  const v = activity || draft || {};
  const editing = !!activity;
  const defType = v.type || (editing ? '' : lastChoice('activity-type', 'call'));
  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier' : 'Ajouter'} une activité</h2>
    <form id="activity-form">
      <div class="form-group">
        <label>Type:</label>
        <select id="activity-type">
          <option value="call" ${defType === 'call' ? 'selected' : ''}>Appel</option>
          <option value="meeting" ${defType === 'meeting' ? 'selected' : ''}>Rendez-vous</option>
          <option value="email" ${defType === 'email' ? 'selected' : ''}>Email</option>
          <option value="visit" ${defType === 'visit' ? 'selected' : ''}>Visite</option>
        </select>
      </div>
      <div class="form-group">
        <label>Client (optionnel):</label>
        <select id="activity-client">
          <option value="">Aucun</option>
          <!-- Options will be populated -->
        </select>
      </div>
      <div class="form-group">
        <label>Propriété (optionnel):</label>
        <select id="activity-property">
          <option value="">Aucune</option>
          <!-- Options will be populated -->
        </select>
      </div>
      <div class="form-group">
        <label>Notes:</label>
        <textarea id="activity-notes" required>${escHtml(v.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Date:</label>
        <input type="date" id="activity-date" value="${escAttr(v.date || new Date().toISOString().split('T')[0])}" required>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="${back === 'clients' ? 'showClients()' : back === 'properties' ? 'showProperties()' : 'showActivities()'}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  // Options + sélection courante, posées ensemble une fois les données là
  populateSelect('activity-client', 'clients', 'name', v.client_id);
  populateSelect('activity-property', 'properties', 'title', v.property_id);

  document.getElementById('activity-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveActivity(editing ? activity.id : null, back);
  });
}

async function saveActivity(id, back) {
  const activity = {
    type: document.getElementById('activity-type').value,
    client_id: document.getElementById('activity-client').value || null,
    property_id: document.getElementById('activity-property').value || null,
    notes: document.getElementById('activity-notes').value,
    date: document.getElementById('activity-date').value
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('activities').update(activity).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('activities').insert([activity]);
      if (error) throw error;
    }
    rememberChoice('activity-type', activity.type);
    returnTo(back, showActivities);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de l\'activité:', error);
    UI.handleError(error);
  }
}

async function editActivity(id) {
  const activity = await getById('activities', id);
  if (!activity) {
    UI.toast('Activité non trouvée', 'error');
    return;
  }
  showActivityForm(activity);
}

async function showTasks() {
  UI.showLoading();
  const tasks = await getAll('tasks');
  mainContent.innerHTML = `
    <h2>Tâches</h2>
    <button onclick="showTaskForm()" class="btn btn-primary">Ajouter Tâche</button>
    <div class="list">
      ${tasks.length ? tasks.map(t => `<div class="list-item">
        <div><strong>${escHtml(t.title)}</strong> — ${getTaskStatusLabel(t.status)}</div>
        <div class="item-meta">${t.due_date ? 'Échéance ' + formatDate(t.due_date) : 'Sans échéance'} · créée le ${formatDate(t.created_at)}</div>
        <div><button onclick="editTask(${Number(t.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button></div>
      </div>`).join('') : '<p class="item-meta">Aucune tâche pour le moment.</p>'}
    </div>
  `;
}

function showTaskForm(task = null) {
  mainContent.innerHTML = `
    <h2>${task ? 'Modifier' : 'Ajouter'} Tâche</h2>
    <form id="task-form">
      <div class="form-group">
        <label>Titre:</label>
        <input type="text" id="task-title" value="${escAttr((task && task.title) || '')}" required>
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="task-description">${escHtml((task && task.description) || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Date d'échéance:</label>
        <input type="date" id="task-due-date" value="${escAttr((task && task.due_date) || '')}">
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="task-status">
          <option value="pending" ${task && task.status === 'pending' ? 'selected' : ''}>En attente</option>
          <option value="completed" ${task && task.status === 'completed' ? 'selected' : ''}>Terminée</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary">${task ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showTasks()" class="btn btn-outline">Annuler</button>
    </form>
  `;

  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTask(task ? task.id : null);
  });
}

async function saveTask(id) {
  const task = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    /* La date est facultative. Envoyer '' à une colonne `date` fait échouer
       tout l'enregistrement côté PostgreSQL ; c'est null qu'il attend. */
    due_date: document.getElementById('task-due-date').value || null,
    status: document.getElementById('task-status').value
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('tasks').update(task).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('tasks').insert([task]);
      if (error) throw error;
    }
    showTasks();
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la tâche:', error);
    UI.handleError(error);
  }
}

function displayError(message) {
  mainContent.innerHTML = `
    <div class="card">
      <h2>Erreur</h2>
      <p>${message}</p>
      <p>Vérifiez que les tables Supabase existent et que la clé est correcte.</p>
    </div>
  `;
}

// Pipeline de vente
async function showPipeline() {
  UI.showLoading();
  const clients = await getAll('clients');
  
  const stages = ['nouvelle demande', 'visite', 'négociation', 'signé'];
  const stageTitles = {
    'nouvelle demande': 'Nouvelles demandes',
    'visite': 'Visites',
    'négociation': 'Négociation',
    'signé': 'Signés'
  };

  // Grouper les clients par statut
  const grouped = {};
  stages.forEach(stage => {
    grouped[stage] = clients.filter(c => (c.status || 'nouvelle demande') === stage);
  });

  // Calculs
  const totalClients = clients.length;
  const conversionRate = totalClients > 0 ? (((grouped['signé']?.length || 0) / totalClients) * 100).toFixed(1) : 0;

  mainContent.innerHTML = `
    <h2>Pipeline de vente</h2>
    
    <div class="pipeline-stats">
      <div class="stat">
        <span class="stat-label">Total Clients</span>
        <span class="stat-value">${totalClients}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Taux de Conversion</span>
        <span class="stat-value">${conversionRate}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">Prévisions</span>
        <span class="stat-value">${grouped['signé']?.length || 0} signés</span>
      </div>
    </div>

    <div class="pipeline-container">
      ${stages.map(stage => `
        <div class="pipeline-column" data-status="${stage}">
          <div class="column-header">
            <h3>${stageTitles[stage]}</h3>
            <span class="column-count">${(grouped[stage]?.length || 0)}</span>
          </div>
          <div class="column-body" id="column-${stage}">
            ${(grouped[stage] || []).map(client => `
              <div class="pipeline-card" draggable="true" data-client-id="${Number(client.id)}" data-status="${escAttr(stage)}" onclick="viewClientDetails(${Number(client.id)})">
                <div class="card-header">
                  <strong>${escHtml(client.name)}</strong>
                  <span class="status-indicator"></span>
                </div>
                <div class="card-body">
                  <p class="card-phone">${escHtml(client.phone || 'Pas de numéro')}</p>
                  <p class="card-source">${escHtml(client.source || 'Non renseignée')}</p>
                  <div class="card-date">${formatDate(client.created_at)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="pipeline-help">
      <p>Glissez-déposez une carte pour faire avancer un client dans le pipeline.</p>
    </div>
  `;

  // Initialiser le drag & drop
  initPipelineDragDrop();
}

function initPipelineDragDrop() {
  const cards = document.querySelectorAll('.pipeline-card');
  const columns = document.querySelectorAll('.column-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('clientId', card.dataset.clientId);
      e.dataTransfer.setData('currentStatus', card.dataset.status);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      const clientId = parseInt(e.dataTransfer.getData('clientId'));
      const newStatus = column.parentElement.dataset.status;
      
      column.classList.remove('drag-over');
      updateClientStatus(clientId, newStatus);
    });
  });
}

async function updateClientStatus(clientId, newStatus) {
  try {
    const { error } = await supabaseClient.from('clients').update({ status: newStatus }).eq('id', clientId);
    if (error) throw error;
    
    // Créer une activité pour tracer le changement
    await supabaseClient.from('activities').insert([{
      client_id: clientId,
      type: 'meeting',
      notes: `Progression pipeline: ${newStatus}`,
      date: new Date().toISOString().split('T')[0]
    }]);

    showPipeline(); // Rafraîchir
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    UI.handleError(error);
  }
}

function viewClientDetails(clientId) {
  // Éditer le client
  editClient(clientId);
}


// Utility functions
/* (getCount et getStatusCount retirés le 31/08/2026 : le tableau de bord était
   leur seul appelant, et il dérive désormais ses compteurs de la liste des
   clients qu'il charge de toute façon. Cinq allers-retours réseau en moins.) */

/* Colonnes explicites : select('*') tirait toutes les colonnes de chaque
   table à chaque affichage, y compris les champs texte longs jamais utilisés
   dans les listes. Sur une connexion mobile, c'est du volume inutile. */
const TABLE_COLS = {
  clients:    'id,name,phone,email,type,status,source,source_detail,notes,created_at',
  properties: 'id,title,address,type,price,status,description,listing_id,listing_slug,source,created_at',
  activities: 'id,type,client_id,property_id,notes,date,created_at',
  tasks:      'id,title,description,due_date,status,created_at',
  /* CORRECTIF 31/08/2026 — `accompte` et `reste` étaient demandés ici alors
     qu'ils n'existent pas dans la table (voir sql/01_schema.sql). PostgREST
     rejetait donc TOUTE lecture de payments (42703), getAll() retournait un
     tableau vide, et par ricochet : écran Paiements toujours vide, chiffre
     d'affaires à 0, alerte retards muette, relances jamais proposées.
     Le suivi acompte / solde reste à construire, base comprise. */
  payments:   'id,client_id,property_id,amount,status,payment_date,notes,created_at',
  demands:    'id,client_id,label,rent_sale,wanted_types,wanted_districts,budget,budget_min,min_bedrooms,wants_furnished,active,notes,created_at'
};

async function getAll(table) {
  const cols = TABLE_COLS[table] || '*';
  const { data, error } = await supabaseClient.from(table).select(cols).order('created_at', { ascending: false });
  if (error) {
    console.error(`Erreur Supabase table ${table}:`, error.message);
    return [];
  }
  return data || [];
}

async function getRecent(table, limit) {
  const cols = TABLE_COLS[table] || '*';
  const { data, error } = await supabaseClient.from(table).select(cols).order('created_at', { ascending: false }).limit(limit);
  if (error) {
    console.error(`Erreur Supabase table ${table}:`, error.message);
    return [];
  }
  return data || [];
}

function getActivityLabel(type) {
  switch (type) {
    case 'call': return 'Appel';
    case 'meeting': return 'Rendez-vous';
    case 'email': return 'Email';
    case 'visit': return 'Visite';
    default: return type;
  }
}

/* Manquait, alors que ses deux jumelles existaient : le statut brut de la base
   — « pending » — s'affichait tel quel dans les tâches, sur le tableau de bord
   comme sur l'écran Tâches. */
function getTaskStatusLabel(status) {
  switch (status) {
    case 'pending': return 'En attente';
    case 'completed': return 'Terminée';
    default: return status;
  }
}

function getPaymentStatusLabel(status) {
  switch (status) {
    case 'pending': return 'En attente';
    case 'paid': return 'Payé';
    default: return status;
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/* CORRECTIF 31/08/2026 — plusieurs montants passaient par toLocaleString() sans
   locale : le navigateur choisissait la sienne, et le tableau de bord affichait
   « 1,500,000 FCFA » à la virgule américaine pendant que les prix des biens
   s'écrivaient « 350 000 FCFA ». Même problème sur les dates, en pire : une
   activité du 1er septembre s'affichait « 9/1/2026 », lisible comme le 9
   janvier. Un format ne doit jamais dépendre du navigateur qui regarde. */
function formatMoney(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR');
}

/* CORRECTIF 31/08/2026 — même bug que sendWhatsApp le 16/08, corrigé ici
   seulement aujourd'hui : le paramètre `phone` était reçu puis ignoré au
   profit de WHATSAPP_BUSINESS_NUMBER. Les deux icônes WhatsApp de chaque
   ligne client ouvraient donc une conversation avec notre propre numéro.
   Même règle de repli que sendWhatsApp : à défaut de numéro client, on
   retombe sur la ligne business plutôt que de produire une URL invalide. */
function getWhatsApp(phone, client, messageType = 'general') {
  const target = normalizePhone(phone) || WHATSAPP_BUSINESS_NUMBER;

  let msg = '';
  switch (messageType) {
    case 'followup':
      msg = `Bonjour ${client.name}, suite à notre dernier échange, avez-vous des nouvelles concernant votre recherche immobilière ?`;
      break;
    case 'property':
      msg = `Bonjour ${client.name}, nous avons une nouvelle propriété qui pourrait vous intéresser.`;
      break;
    default:
      msg = `Bonjour ${client.name}, nous avons des nouvelles concernant votre recherche immobilière.`;
  }

  return `https://wa.me/${target}?text=${encodeURIComponent(msg)}`;
}

/* Remplit une liste déroulante depuis une table, et pose la valeur courante.
   Le 4e paramètre est indispensable : un <select> ignore SILENCIEUSEMENT
   toute valeur qu'il ne connaît pas encore. Comme le chargement des options
   passe par le réseau, poser la valeur depuis l'appelant, juste après
   l'appel, arrivait toujours trop tôt — la liste retombait sur « Aucun »,
   et l'enregistrement suivant écrasait le lien en base par null. */
async function populateSelect(selectId, table, field, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const data = await getAll(table);

  /* L'agent a pu quitter le formulaire pendant le chargement : ne rien
     écrire dans un élément qui n'est plus dans la page. */
  if (!select.isConnected) return;

  data.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item[field];
    select.appendChild(option);
  });

  if (selectedValue !== null && selectedValue !== undefined && selectedValue !== '') {
    select.value = String(selectedValue);
  }
}

async function getById(table, id) {
  const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).single();
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

async function editClient(id) {
  const client = await getById('clients', id);
  if (!client) {
    UI.toast('Client non trouvé', 'error');
    return;
  }
  showClientForm(client);
}

async function editProperty(id) {
  const property = await getById('properties', id);
  if (!property) {
    UI.toast('Propriété non trouvée', 'error');
    return;
  }
  showPropertyForm(property);
}

async function editTask(id) {
  const task = await getById('tasks', id);
  if (!task) {
    UI.toast('Tâche non trouvée', 'error');
    return;
  }
  showTaskForm(task);
}

async function showPayments() {
  UI.showLoading();
  const payments = await getAll('payments');
  const clients = await getAll('clients');
  const properties = await getAll('properties');
  const findName = (id, list) => {
    const item = list.find(i => i.id === id);
    return item ? item.name || item.title : null;
  };

  mainContent.innerHTML = `
    <h2>Paiements</h2>
    <button onclick="showPaymentForm()" class="btn btn-primary">Ajouter Paiement</button>
    <div class="list">
      ${payments.length ? payments.map(p => `<div class="list-item">
        <div><strong>${formatMoney(p.amount)} FCFA</strong> — ${getPaymentStatusLabel(p.status)}</div>
        <div class="item-meta">${escHtml(findName(p.client_id, clients) || 'Client #' + p.client_id)} · ${escHtml(findName(p.property_id, properties) || 'Bien #' + p.property_id)}</div>
        <div class="item-meta">${formatDate(p.payment_date)}</div>
        <div><button onclick="editPayment(${Number(p.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button></div>
      </div>`).join('') : '<p class="item-meta">Aucun paiement pour le moment.</p>'}
    </div>
  `;
}

function showPaymentForm(payment = null, draft = null, back = null) {
  const v = payment || draft || {};
  const editing = !!payment;
  const defStatus = v.status || (editing ? '' : lastChoice('payment-status', 'pending'));
  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier' : 'Ajouter'} un paiement</h2>
    <form id="payment-form">
      <div class="form-group">
        <label>Client:</label>
        <select id="payment-client">
          <option value="">Sélectionne un client</option>
        </select>
      </div>
      <div class="form-group">
        <label>Propriété:</label>
        <select id="payment-property">
          <option value="">Sélectionne une propriété</option>
        </select>
      </div>
      <div class="form-group">
        <label>Montant (FCFA):</label>
        <input type="number" id="payment-amount" value="${escAttr(v.amount || '')}" required>
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="payment-status">
          <option value="pending" ${defStatus === 'pending' ? 'selected' : ''}>En attente</option>
          <option value="paid" ${defStatus === 'paid' ? 'selected' : ''}>Payé</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date de paiement:</label>
        <input type="date" id="payment-date" value="${escAttr(v.payment_date || new Date().toISOString().split('T')[0])}" required>
      </div>
      <div class="form-group">
        <label>Notes:</label>
        <textarea id="payment-notes">${escHtml(v.notes || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="${back === 'clients' ? 'showClients()' : back === 'properties' ? 'showProperties()' : 'showPayments()'}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  populateSelect('payment-client', 'clients', 'name', v.client_id);
  populateSelect('payment-property', 'properties', 'title', v.property_id);

  document.getElementById('payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    savePayment(editing ? payment.id : null, back);
  });
}

async function savePayment(id, back) {
  const payment = {
    client_id: document.getElementById('payment-client').value || null,
    property_id: document.getElementById('payment-property').value || null,
    amount: document.getElementById('payment-amount').value,
    status: document.getElementById('payment-status').value,
    payment_date: document.getElementById('payment-date').value,
    notes: document.getElementById('payment-notes').value
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('payments').update(payment).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('payments').insert([payment]);
      if (error) throw error;
    }
    rememberChoice('payment-status', payment.status);
    returnTo(back, showPayments);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du paiement:', error);
    UI.handleError(error);
  }
}

async function editPayment(id) {
  const payment = await getById('payments', id);
  if (!payment) {
    UI.toast('Paiement non trouvé', 'error');
    return;
  }
  showPaymentForm(payment);
}
