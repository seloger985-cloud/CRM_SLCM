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
const visualBtn = document.getElementById('visual-btn');
const reelsBtn = document.getElementById('reels-btn');
const reperesBtn = document.getElementById('reperes-btn');
const tasksBtn = document.getElementById('tasks-btn');
const automationBtn = document.getElementById('automation-btn');
const pipelineBtn = document.getElementById('pipeline-btn');
const matchingBtn = document.getElementById('matching-btn');
const leasesBtn = document.getElementById('leases-btn');

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
/* Pages autonomes : on quitte l'application, donc pas de navTo — il poserait
   l'etat actif sur un bouton qu'on ne reverra pas. */
visualBtn.addEventListener('click', () => { window.location.href = 'visuel-terrain-bonapriso.html'; });
reelsBtn.addEventListener('click', () => { window.location.href = 'reels.html'; });
reperesBtn.addEventListener('click', () => { window.location.href = 'reperes.html'; });
tasksBtn.addEventListener('click', navTo(tasksBtn, showTasks));
automationBtn.addEventListener('click', navTo(automationBtn, showAutomation));
pipelineBtn.addEventListener('click', navTo(pipelineBtn, showPipeline));
matchingBtn.addEventListener('click', navTo(matchingBtn, showMatching));
leasesBtn.addEventListener('click', navTo(leasesBtn, showLeases));
const siteDemandsBtn = document.getElementById('site-demands-btn');
if (siteDemandsBtn) siteDemandsBtn.addEventListener('click', navTo(siteDemandsBtn, showSiteDemands));

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
  /* Différé d'un tour de boucle, et ce n'est pas un détail : appelée ici
     directement, showDashboard() s'exécute PENDANT le chargement du fichier
     et touche TABLE_COLS, déclarée bien plus bas. Une const dans sa zone
     morte lève « Cannot access before initialization », et l'écran affiche
     « Erreur » — uniquement quand la session est déjà là au chargement,
     c'est-à-dire au rechargement à chaud. La branche `else` n'avait pas le
     problème : son événement arrive après la fin du fichier. */
  queueMicrotask(() => ecranDeDepart());
} else {
  document.addEventListener('slcm:auth-ready', () => ecranDeDepart(), { once: true });
}

/* Écran d'arrivée. `index.html?publier=12` ouvre directement la publication
   avec photos de la fiche 12 : le générateur de visuel y renvoie les biens
   qui ne sont pas des terrains (un visuel seul compte pour UNE image, le
   site en exige trois hors terrain). Le paramètre est retiré de l'adresse,
   pour qu'un rechargement ne rouvre pas le formulaire. */
function ecranDeDepart() {
  const recherche = typeof location !== 'undefined' ? location.search : '';   /* absent des tests Node */
  const id = Number(new URLSearchParams(recherche).get('publier'));
  if (id > 0) {
    history.replaceState(null, '', location.pathname);
    return showPublishForm(id);
  }
  return showDashboard();
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

/* ═══════════════ CONFRÈRES (sql/12) ═══════════════

   Un prospect appelle pour « le CF26-DLA-028 ». Le code ouvre la fiche, la fiche
   nomme le confrère qui détient le bien. Rien de tout cela ne sort sur un
   visuel : seul le code y figure. */

/* Le numéro auquel écrire à un confrère : son WhatsApp s'il en a donné un
   distinct, sinon son téléphone. */
function confrereWa(c) {
  return normalizePhone((c && (c.whatsapp || c.phone)) || '');
}

/* Les numéros contenus dans un texte libre (« Paul 6 99 12 45 78 »). */
const PHONE_IN_TEXT = /\+?\d[\d\s.-]{7,}\d/g;

/* Le confrère que désigne un contact extrait d'un message. Par le NUMÉRO
   seulement : deux confrères portent volontiers le même prénom, jamais le
   même numéro. null si aucun ne correspond. */
function findConfrere(contact, confreres) {
  const voulus = (String(contact || '').match(PHONE_IN_TEXT) || []).map(normalizePhone).filter(Boolean);
  if (!voulus.length) return null;
  return (confreres || []).find(c =>
    [c.phone, c.whatsapp].map(normalizePhone).some(n => n && voulus.indexOf(n) !== -1)
  ) || null;
}

/* Ce que le contact dit du nom, une fois les numéros retirés. */
function contactName(contact) {
  return String(contact || '').replace(PHONE_IN_TEXT, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, '').trim();
}

/* Le message au confrère, dans SES mots : sa référence s'il en a donné une,
   sinon le titre et le lieu. */
function confrereMessage(p, c) {
  const quoi = p.confrere_ref ? `votre bien réf. ${p.confrere_ref}` : `votre bien « ${p.title || 'sans titre'} »`;
  const lieu = p.district || p.address || '';
  return `Bonjour ${(c && c.name) || ''}, j'ai un client intéressé par ${quoi}${lieu ? ' (' + lieu + ')' : ''}. Est-il toujours disponible ?`;
}

/* Le même terrain circule souvent chez plusieurs confrères. Deux fiches
   sont « le même bien » si elles partagent le quartier ET la surface ET un
   prix (total ou au m²). Exigeant à dessein : une fausse alerte sur deux
   terrains voisins de même taille coûte une seconde, un doublon publié
   coûte deux codes pour un seul bien. Rien n'est bloquant : l'agent tranche. */
function similarProperties(p, list) {
  const q = looseKey(p.district);
  const s = Number(p.surface_m2);
  if (!q || !(s > 0)) return [];
  return (list || []).filter(o =>
    o.id !== p.id &&
    looseKey(o.district) === q &&
    Number(o.surface_m2) === s &&
    ((p.price > 0 && Number(o.price) === Number(p.price)) ||
     (p.price_m2 > 0 && Number(o.price_m2) === Number(p.price_m2)))
  );
}

/* Relance à 15 jours (choix du 24/10/2026). Une offre de groupe se vend
   vite : un bien de confrère encore en ligne au bout de 15 jours mérite
   la question « toujours disponible ? ». Le compteur part de la dernière
   relance si elle est plus récente que la mise en ligne.
   `relances` : { [propertyId]: horodatage ms } (gardé dans le navigateur). */
const RELANCE_JOURS = 15;
function aRelancer(props, annonces, relances, maintenant) {
  const enLigne = new Map((annonces || []).map(l => [String(l.id), l]));
  const delai = RELANCE_JOURS * 86400000;
  return (props || []).filter(p => {
    if (!p.confrere_id || !p.listing_id || p.status !== 'available') return false;
    const l = enLigne.get(String(p.listing_id));
    if (!l || l.status !== 'active') return false;
    const depuis = Math.max(new Date(l.created_at).getTime() || 0, Number((relances || {})[p.id]) || 0);
    return maintenant - depuis >= delai;
  });
}

/* Le message de relance, dans les mots du confrère. */
function relanceMessage(p, c) {
  const quoi = p.confrere_ref ? `le bien réf. ${p.confrere_ref}` : `le bien « ${p.title || 'sans titre'} »`;
  const lieu = p.district || p.address || '';
  return `Bonjour ${(c && c.name) || ''}, ${quoi}${lieu ? ' (' + lieu + ')' : ''} est-il toujours disponible ? Il est en ligne chez nous sous la réf. ${p.code}.`;
}

/* La référence telle qu'on la tape vite. Format du site depuis sql/13 :
   CF26-DLA-028 (confrère) ou SL26-DLA-031 (mandat direct). « cf26-dla-028 »,
   « cf28 » et « 28 » désignent le même bien : le numéro est unique sur tout
   le portefeuille, quel que soit le préfixe. Accepte aussi l'ancien format
   (T-028), que garde `ancien_code` — des visuels le portent encore. */
function codeKeys(code) {
  if (!code) return '';
  const c = String(code).toLowerCase();
  const m = c.match(/^([a-z]+)(?:\d{2}-[a-z]{3})?-0*(\d+)$/);
  if (!m) return c;
  return c + ' ' + m[1] + m[2] + ' ' + m[2];
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
  refreshSiteDemandsCount();   /* sans attendre : le compteur suit quand il arrive */
  const [allClients, allPayments, allTasks, allActivities, siteListings, shared, allDemands] = await Promise.all([
    getAll('clients'),
    getAll('payments'),
    getAll('tasks'),
    getAll('activities'),
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

  /* getAll trie par created_at décroissant : les cinq premières sont les
     plus récentes, et la même liste sert aux suites en attente. */
  const recentActivities = allActivities.slice(0, 5);

  /* « À faire » réunit deux natures : une tâche qu'on s'est fixée, et la
     suite d'une activité — une visite qui a échoué, une négociation qui
     attend un retour. La seconde n'existait pas avant le 31/08/2026 : elle
     était écrite en prose dans les notes, donc invisible. */
  const suites = openFollowUps(allActivities);
  const aFaire = openTasks.map(t => ({
      quoi: t.title, quand: t.due_date, id: t.id, kind: 'task'
    })).concat(suites.map(a => ({
      quoi: a.next_step, quand: a.next_date, id: a.id, kind: 'suite',
      contexte: getActivityLabel(a.type)
    })))
    .sort((x, y) => (x.quand || '9999').localeCompare(y.quand || '9999'));

  const enRetard = aFaire.filter(x => x.quand && x.quand < today).length;

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
      <div class="card${aFaire.length ? ' attention' : ''}">
        <h3>À faire</h3>
        <p class="metric">${aFaire.length}</p>
        <small>${aFaire.length === 0
          ? 'Rien en attente'
          : openTasks.length + ' tâche' + (openTasks.length > 1 ? 's' : '')
            + (suites.length ? ' · ' + suites.length + ' suite' + (suites.length > 1 ? 's' : '') + " d'activité" : '')
            + (enRetard ? ' · ' + enRetard + ' en retard' : '')}</small>
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
        ${aFaire.length
          ? aFaire.slice(0, 6).map(x => `<div class="list-item">
              <span>${escHtml(x.quoi)}${x.kind === 'suite' ? ` <span class="src-badge src-crm">${escHtml(x.contexte)}</span>` : ''}</span>
              <span class="item-meta">${
                x.quand
                  ? (x.quand < today ? '<strong style="color:var(--danger)">' + formatDate(x.quand) + '</strong>' : formatDate(x.quand))
                  : 'sans échéance'
              }</span>
            </div>`).join('')
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
          ${Object.keys(CLIENT_TYPE_FR).map(t =>
            `<option value="${escAttr(t)}" ${client && client.type === t ? 'selected' : ''}>${escHtml(CLIENT_TYPE_FR[t])}</option>`
          ).join('')}
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
const propsView = { crm: [], site: [], confreres: [], q: '', src: 'all', loaded: false, showUnits: false };

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
    const [crm, site, confreres] = await Promise.all([
      getAll('properties'),
      (window.SLCM_SITE && window.SLCM_SITE.fetchListings) ? window.SLCM_SITE.fetchListings() : Promise.resolve([]),
      getAll('confreres')
    ]);
    propsView.crm = crm;
    propsView.site = site;
    propsView.confreres = confreres;
    propsView.loaded = true;
  }

  mainContent.innerHTML = `
    <h2>Propriétés</h2>
    <div class="toolbar">
      <input type="search" id="prop-search" class="search-input" placeholder="Rechercher : référence (CF26-DLA-028 ou 28), titre, quartier, confrère, référence…" value="${escAttr(propsView.q)}">
      <select id="prop-source" class="search-select">
        <option value="all"  ${propsView.src === 'all'  ? 'selected' : ''}>Toutes les sources</option>
        <option value="site" ${propsView.src === 'site' ? 'selected' : ''}>selogercm.com</option>
        <option value="crm"  ${propsView.src === 'crm'  ? 'selected' : ''}>Saisies CRM</option>
      </select>
      <button onclick="showPropertyForm()" class="btn btn-primary">Ajouter</button>
      <button onclick="showInbox()" class="ghost-btn" title="Coller un message reçu d'un confrère">Depuis un message</button>
      <button onclick="showConfreres()" class="ghost-btn" title="Le répertoire des confrères">Confrères</button>
      <button onclick="toggleUnits()" class="ghost-btn" id="units-toggle" title="Les logements d'un immeuble sont masqués par défaut">${propsView.showUnits ? 'Masquer' : 'Afficher'} les logements</button>
      <button onclick="exportCSV('properties')" class="ghost-btn" title="Exporter en CSV">Export CSV</button>
      <button onclick="showProperties(true)" class="ghost-btn" title="Recharger depuis selogercm.com">↻</button>
    </div>
    <div id="relances"></div>
    <p class="item-meta" id="prop-count"></p>
    <div class="list" id="prop-list"></div>
  `;
  renderRelances();

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

/* ═══════════════ VIGNETTES ═══════════════

   Deux titres se ressemblent souvent au point d'être indiscernables dans une
   liste — « Appartement 02ch Bonapriso » revient cinq fois. La photo est ce
   qui les sépare en un regard. */

/* La première photo de l'annonce, ou null. Tolère un champ absent, vide, ou
   contenant autre chose que des chaînes : la vignette est un confort, elle
   ne doit jamais faire échouer un rendu. */
function coverOf(listing) {
  const images = listing && listing.images;
  if (!Array.isArray(images)) return null;
  const url = images.find(u => typeof u === 'string' && u.trim());
  return url ? url.trim() : null;
}

/* Code court affiché quand il n'y a pas de photo. Écrit à la main plutôt que
   tronqué de TYPE_FR : « Terrain » et « Local commercial » donneraient TER et
   LOC par découpe, mais « Immeuble » donnerait IMM et « Maison » MAI — autant
   fixer le vocabulaire une fois. */
const TYPE_CODE = {
  apartment: 'APP', studio: 'STU', villa: 'VIL', house: 'MAI',
  duplex: 'DUP', building: 'IMM', 'plots-of-land': 'TER',
  warehouse: 'ENT', office: 'BUR', shop: 'BOU', commercial: 'LOC'
};

/* Teinte stable dérivée de l'identifiant. Le but n'est pas d'être joli mais
   de DISTINGUER : deux appartements du même quartier, sans photo ni l'un ni
   l'autre, doivent quand même porter deux pastilles différentes. */
function hueFrom(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/* La vignette. La pastille colorée est TOUJOURS rendue, l'image se pose
   par-dessus. Donc : une fiche sans photo garde un repère visuel, et une URL
   cassée retire son <img> (onerror) en laissant la pastille — jamais l'icône
   d'image brisée du navigateur, jamais de saut de mise en page.

   `loading="lazy"` n'est pas un raffinement ici : la variante `public` de
   Cloudflare pèse ~95 Ko et la liste peut afficher 200 biens. */
function thumbHtml(cover, key, type) {
  const code = TYPE_CODE[type] || '—';
  const img = cover
    ? `<img src="${escAttr(cover)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
    : '';
  return `<span class="thumb" style="--thumb-h:${hueFrom(key)}" data-code="${escAttr(code)}">${img}</span>`;
}

/* Fusionne les biens publiés sur selogercm.com et les saisies internes.
   Un bien du site déjà rattaché à une fiche CRM (listing_id) n'apparaît
   qu'une fois : la fiche CRM prime et porte le lien vers l'annonce. */
function mergeProperties() {
  const linked = new Set(propsView.crm.map(p => p.listing_id).filter(Boolean));
  /* Les annonces par identifiant : une fiche CRM rattachée ne porte que
     `listing_id`, jamais les photos. Sa vignette vient donc de l'annonce —
     qui reste dans propsView.site même quand on la retire de l'affichage. */
  const parId = new Map(propsView.site.map(l => [String(l.id), l]));
  const confParId = new Map((propsView.confreres || []).map(c => [c.id, c]));
  const crm = propsView.crm.map(p => Object.assign({}, p, {
    _src: p.listing_id ? 'site' : 'crm',
    _linked: !!p.listing_id,
    _cover: p.listing_id ? coverOf(parId.get(String(p.listing_id))) : null,
    _confrere: p.confrere_id ? confParId.get(p.confrere_id) || null : null,
    _ref: p.listing_id ? ((parId.get(String(p.listing_id)) || {}).ref || '') : '',
    /* Un logement d'immeuble. Masque par defaut dans la liste generale : un
       immeuble de douze appartements y noierait tout le reste du
       portefeuille, et on le consulte depuis sa fiche d'immeuble. */
    _unit: !!p.parent_id
  }));
  const site = propsView.site
    .filter(l => !linked.has(l.id))
    .map(l => ({
      id: null, _siteId: l.id, _slug: l.slug, _ref: l.ref || '', _src: 'site', _linked: false,
      title: l.title, address: [l.district, l.city].filter(Boolean).join(', '),
      price: l.price, status: l.status, type: l.type, created_at: l.created_at,
      _cover: coverOf(l)
    }));
  return crm.concat(site);
}

function renderPropsList() {
  const q = propsView.q.trim().toLowerCase();
  let rows = mergeProperties();
  if (!propsView.showUnits) rows = rows.filter(r => !r._unit);
  if (propsView.src !== 'all') rows = rows.filter(r => r._src === propsView.src);
  if (q) {
    const terms = q.split(/\s+/);
    rows = rows.filter(r => {
      const c = r._confrere;
      const hay = [r.title, r.address, r.type, r.status, r.price, r._slug, r._ref,
                   codeKeys(r.code), codeKeys(r.ancien_code), r.confrere_ref, c && c.name, c && c.agency].join(' ').toLowerCase();
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
    /* Prix sur demande : le vrai prix reste visible ICI (usage interne),
       marqué pour rappeler qu'il n'est pas publié. */
    const price = (Number(p.price) > 0 ? Number(p.price).toLocaleString('fr-FR') + ' FCFA'
                   : (p.prix_sur_demande ? 'Prix sur demande' : 'Prix non renseigné'))
                + (p.prix_sur_demande && Number(p.price) > 0 ? ' · publié « sur demande »' : '');
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
    /* Le code public en tête : c'est ce que cite le prospect au téléphone. */
    const code = p.code ? `<span class="src-badge" title="Code public, imprimé sur les visuels">${escHtml(p.code)}</span> ` : '';
    const c = p._confrere;
    const origine = c
      ? `<div class="item-meta">Via ${escHtml(c.name)}${c.agency ? ' (' + escHtml(c.agency) + ')' : ''}${p.confrere_ref ? ' · sa réf. ' + escHtml(p.confrere_ref) : ''}${p.commission ? ' · ' + escHtml(p.commission) : ''}</div>`
      : '';
    const ecrire = (c && confrereWa(c) && p.id)
      ? `<button onclick="contactConfrere(${Number(p.id)})" class="ghost-btn" title="Écrire au confrère sur WhatsApp">WhatsApp confrère</button>`
        + `<a href="tel:+${escAttr(normalizePhone(c.phone || c.whatsapp))}" class="ghost-btn" title="Appeler le confrère">Appeler</a>`
      : '';
    /* Vendu : la fiche passe « vendu » et, si le bien est en ligne, l'annonce
       du site aussi — une offre de groupe se vend vite. */
    const vendu = (p.id && p.status === 'available')
      ? `<button onclick="markSold(${Number(p.id)})" class="ghost-btn" title="Marquer vendu / loué (et sur le site)">Vendu</button>`
      : '';
    /* Le visuel part de la fiche : code public sur le badge, champs remplis.
       Utile surtout aux terrains ; les logements se publient avec leurs photos. */
    const visuel = p.id
      ? `<a href="visuel-terrain-bonapriso.html?bien=${Number(p.id)}" class="ghost-btn" title="Créer le visuel de ce bien">Visuel</a>`
      : '';
    const publier = (p.id && p.code && !p.listing_slug && p.status === 'available')
      ? `<button onclick="showPublishForm(${Number(p.id)})" class="ghost-btn" title="Publier sur selogercm.com avec des photos">Publier</button>`
      : '';
    return `<div class="list-item">
      ${thumbHtml(p._cover, p.id || p._siteId || p.title, p.type)}
      <div>${code}<strong>${escHtml(p.title || 'Sans titre')}</strong> ${badge}</div>
      <div class="item-meta">${escHtml(p.address || '')} — ${price}${p._ref ? ' · ' + escHtml(p._ref) : ''}</div>
      ${origine}
      <div class="item-meta">${formatDate(p.created_at)}</div>
      <div>${link}${share}${ecrire}${publier}${visuel}${vendu}${action}</div>
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

/* ═══════════════ ISSUE ET SUITE D'UNE ACTIVITÉ ═══════════════

   Une visite qui échoue, une négociation qui attend un retour : c'était
   écrit en prose dans les notes, donc invisible pour le CRM. Depuis le
   31/08/2026 (voir sql/05_activity_outcome.sql), l'activité porte son
   issue et sa suite.

   Aucune tâche n'est créée automatiquement : la suite vit sur l'activité
   où elle a été écrite. La dupliquer dans `tasks` obligerait à
   synchroniser deux endroits, et l'un des deux finirait par mentir. */

const OUTCOME_FR = {
  done:    'Abouti',
  pending: 'En attente d’un retour',
  failed:  'N’a pas abouti',
  no_show: 'Ne s’est pas tenu'
};

function outcomeLabel(o) {
  return OUTCOME_FR[o] || '';
}

/** Vrai si l'activité attend encore quelque chose de l'agent. */
function hasOpenFollowUp(a) {
  return !!(a && a.next_step && !a.next_done_at);
}

/** Les suites ouvertes, la plus urgente d'abord. Une suite sans date passe
    après celles qui en ont une — comme pour les tâches. */
function openFollowUps(activities) {
  return (activities || [])
    .filter(hasOpenFollowUp)
    .sort((a, b) => (a.next_date || '9999').localeCompare(b.next_date || '9999'));
}

/** Marque une suite comme faite. Rien ne se supprime : on horodate. */
async function closeFollowUp(id, back) {
  try {
    const { error } = await supabaseClient.from('activities')
      .update({ next_done_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    UI.toast('Suite marquée comme faite.', 'success');
    if (back === 'dashboard') showDashboard(); else showActivities();
  } catch (error) {
    UI.handleError(error);
  }
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

/* ═══════════════ BOÎTE DE RÉCEPTION ═══════════════

   Un confrère envoie un bien par WhatsApp, en prose. Le retaper prend cinq
   minutes ; le coller en prend cinq secondes. C'est le seul endroit du CRM
   où un modèle fait quelque chose qu'une règle ne sait pas faire : l'entrée
   est du texte libre écrit par quelqu'un d'autre.

   La fonction understand-inbox N'ÉCRIT RIEN. Elle propose une fiche, le
   formulaire s'ouvre pré-rempli, l'agent corrige et valide. Voir
   supabase/functions/README.md. */

/** Appelle une Edge Function du projet CRM.
 *
 * Passe par supabase-js plutôt que par un fetch à la main : le client sait
 * poser les DEUX en-têtes que la passerelle exige — `Authorization` avec le
 * jeton de session, et `apikey`. Un fetch maison qui n'envoie que le premier
 * se fait rejeter par la passerelle AVANT d'atteindre la fonction, avec un
 * 401 impossible à distinguer d'un refus applicatif. C'est ce qui s'est
 * passé le 03/09/2026.
 */
async function callFunction(name, payload) {
  const { data, error } = await supabaseClient.functions.invoke(name, { body: payload });

  if (error) {
    /* « Edge Function returned a non-2xx status code » ne dit rien. Le motif
       exact est dans le corps de la réponse — « session_invalide »,
       « message_too_long », « extraction_impossible ». On va le chercher, et
       à défaut on rend au moins le code HTTP, qui oriente déjà. */
    const ctx = error.context;
    const statut = ctx && typeof ctx.status === 'number' ? ctx.status : null;
    let motif = '';

    try {
      if (ctx && typeof ctx.json === 'function') {
        const corps = await ctx.clone().json();
        if (corps) motif = [corps.error, corps.detail].filter(Boolean).join(' — ');
      }
    } catch (_e) {
      /* Corps déjà lu, ou pas du JSON : on tente le texte brut. */
      try {
        if (ctx && typeof ctx.text === 'function') motif = (await ctx.clone().text()).slice(0, 200);
      } catch (_e2) { /* tant pis */ }
    }

    /* La console garde tout, l'écran garde l'essentiel. */
    console.error('[callFunction]', name, 'HTTP', statut, error);
    if (!motif) motif = error.message || 'appel impossible';
    throw new Error(statut ? motif + ' (HTTP ' + statut + ')' : motif);
  }
  return data;
}

function showInbox() {
  mainContent.innerHTML = `
    <h2>Ajouter un bien depuis un message</h2>
    <form id="inbox-form">
      <div class="form-group">
        <label>Le message reçu <span class="item-meta">— tel quel, sans le retoucher</span></label>
        <textarea id="inbox-message" rows="8" required
          placeholder="Bonjour, j'ai un appartement 3 chambres meublé à Bonapriso, 350k le mois. Libre immédiatement. Contact 699 12 45 78."></textarea>
      </div>
      <p class="item-meta">Seul ce message est envoyé pour analyse. Ton portefeuille ne sort pas du CRM.</p>
      <button type="submit" class="btn btn-primary" id="inbox-go">Analyser</button>
      <button type="button" onclick="showProperties()" class="btn btn-outline">Annuler</button>
    </form>
    <div id="inbox-result"></div>
  `;

  document.getElementById('inbox-form').addEventListener('submit', (e) => {
    e.preventDefault();
    analyzeInbox();
  });
}

async function analyzeInbox() {
  const champ = document.getElementById('inbox-message');
  const bouton = document.getElementById('inbox-go');
  const sortie = document.getElementById('inbox-result');
  const message = champ.value.trim();
  if (!message) return;

  bouton.disabled = true;
  bouton.textContent = 'Analyse…';
  sortie.innerHTML = '';

  try {
    const { bien, explication } = await callFunction('understand-inbox', { message });

    if (!bien) {
      /* Le modèle a jugé que le message ne décrit pas un bien. C'est une
         réponse valide, pas une panne : on la montre sans dramatiser. */
      sortie.innerHTML = `<div class="empty-state">
        <p><strong>Aucun bien reconnu dans ce message.</strong></p>
        <p>${escHtml(explication || '')}</p>
      </div>`;
      return;
    }

    /* Le contact n'a pas de colonne dans `properties` : plutôt que de le
       perdre, on le range dans la description, nommé. */
    const description = [bien.description, bien.contact ? 'Contact : ' + bien.contact : '']
      .filter(Boolean).join('\n\n');

    showPropertyForm(null, {
      title: bien.title, type: bien.type, price: bien.price,
      address: bien.address, district: bien.district,
      rent_sale: bien.rent_sale, bedrooms: bien.bedrooms,
      surface_m2: bien.surface_m2, price_m2: bien.price_m2,
      furnished: bien.furnished, description,
      /* Le contact sert à retrouver ou créer le confrère (sql/12). Il reste
         aussi dans la description : si l'agent choisit « en direct », il
         n'est pas perdu pour autant. */
      _contact: bien.contact || null,
      _manquant: bien.manquant || []
    }, 'inbox');
  } catch (e) {
    sortie.innerHTML = `<div class="alert alert-warning">
      <strong>L'analyse n'a pas abouti.</strong>
      <p>${escHtml(e.message)}</p>
      <p class="item-meta">Le bien peut toujours être saisi à la main.</p>
    </div>`;
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Analyser';
  }
}

/* Ce que le message ne disait pas. Affiché en tête du formulaire plutôt que
   laissé vide en silence : un champ absent doit se voir, sinon on croit à
   une information vérifiée. */
const MANQUANT_FR = {
  title: 'le titre', type: 'le type de bien', rent_sale: 'location ou vente',
  price: 'le prix', address: "l'adresse", district: 'le quartier',
  bedrooms: 'le nombre de chambres', furnished: 'meublé ou non',
  description: 'la description', contact: 'le contact',
  surface_m2: 'la surface', price_m2: 'le prix au m²'
};

function manquantBanner(manquant) {
  if (!manquant || !manquant.length) return '';
  const noms = manquant.map(m => MANQUANT_FR[m] || m);
  return `<div class="alert alert-match">
    <strong>Le message ne disait pas tout</strong>
    <p>À compléter : ${escHtml(noms.join(', '))}.</p>
    <p class="item-meta">Sans transaction renseignée, ce bien ne sera proposé à personne.</p>
  </div>`;
}

/* ═══════════════ UN BIEN DU CRM VU PAR LE RAPPROCHEMENT ═══════════════

   Le moteur ne connaît qu'une forme : celle des annonces du site. Une fiche
   du CRM en diffère sur deux points, et deux seulement — son identifiant est
   un entier, et son état se dit « available » là où le moteur attend
   « active ».

   Plutôt que d'apprendre au moteur à connaître deux formes, on traduit ici.
   match.js reste ignorant de l'existence du CRM, ce qui le garde testable
   sans base de données.

   L'identifiant est préfixé : « crm-12 » ne peut pas entrer en collision
   avec un uuid du site dans l'historique d'envoi. */

function asListing(p) {
  return {
    id: 'crm-' + p.id,
    slug: p.listing_slug || null,
    title: p.title,
    /* Le moteur écarte tout ce qui n'est pas « active ». Un bien vendu ou
       loué n'a effectivement plus à être proposé. */
    status: p.status === 'available' ? 'active' : p.status,
    rent_sale: p.rent_sale || null,
    type: p.type || null,
    district: p.district || null,
    /* Pas de colonne `city` sur une fiche CRM : l'adresse en tient lieu
       dans les messages de partage. */
    city: null,
    price: p.price,
    bedrooms: p.bedrooms,
    furnished: p.furnished,
    created_at: p.created_at,
    _crm: true
  };
}

/* Le stock rapprochable : les annonces du site ET les fiches internes qui
   ne viennent pas du site — celles-là sont déjà représentées par leur
   annonce, les compter deux fois les proposerait en double. */
function matchableStock(siteListings, crmProperties) {
  const internes = (crmProperties || [])
    .filter(p => !p.listing_id)
    .map(asListing);
  return (siteListings || []).concat(internes);
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
    const [listings, shared, props] = await Promise.all([
      window.SLCM_SITE.fetchListings(),
      window.SLCM_MATCH.loadShared(),
      getAll('properties')
    ]);
    return { listings: matchableStock(listings, props), shared };
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

  const [clients, demands, siteListings, sent, crmProps] = await Promise.all([
    getAll('clients'),
    getAll('demands'),
    window.SLCM_SITE.fetchListings(),
    window.SLCM_MATCH.loadShared(),
    getAll('properties')
  ]);
  /* Les annonces du site ET les fiches internes : un bien reçu d'un confrère
     n'est pas publié, il doit quand même trouver preneur. */
  const listings = matchableStock(siteListings, crmProps);

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
              ${thumbHtml(coverOf(h.listing), h.listing.id || h.listing.slug || h.listing.title, h.listing.type)}
              <div><strong>${escHtml(h.listing.title || 'Sans titre')}</strong>
                <span class="src-badge src-site">${h.score}%</span></div>
              <div class="item-meta">${escHtml([h.listing.district, h.listing.city].filter(Boolean).join(', '))} — ${Number(h.listing.price) > 0 ? formatMoney(h.listing.price) + ' FCFA' : 'prix sur demande'}</div>
              <div class="item-meta">${escHtml(h.reasons.join(' · '))}</div>
              <div>
                ${h.listing._crm ? '<span class="src-badge src-crm">FICHE CRM</span>' : ''}
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

function showPropertyForm(property = null, draft = null, back = null) {
  const v = property || draft || {};
  const editing = !!property;
  /* En création, on reprend le dernier choix de l'agent ; en modification,
     jamais — ce serait écraser une donnée existante par une habitude. */
  const defType   = v.type   || (editing ? '' : lastChoice('property-type', 'house'));
  const defStatus = v.status || (editing ? '' : lastChoice('property-status', 'available'));

  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier' : 'Ajouter'} un bien</h2>
    ${manquantBanner(v._manquant)}
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
        <label>Surface (m²):</label>
        <input type="number" id="property-surface" min="0" value="${escAttr(v.surface_m2 || '')}">
      </div>
      <div class="form-group">
        <label>Prix au m² (FCFA):</label>
        <input type="number" id="property-price-m2" min="0" value="${escAttr(v.price_m2 || '')}"
               placeholder="Pour un terrain vendu au m²">
      </div>
      <div class="form-group">
        <label>Prix total (FCFA):</label>
        <input type="number" id="property-price" value="${escAttr(v.price || '')}">
        <small class="item-meta" id="property-price-hint"></small>
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="property-prix-demande" ${v.prix_sur_demande ? 'checked' : ''}>
          Prix sur demande <span class="item-meta">— ventes : le prix reste ici, il n'est pas publié sur le site</span></label>
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="property-status">
          <option value="available" ${defStatus === 'available' ? 'selected' : ''}>Disponible</option>
          <option value="sold" ${defStatus === 'sold' ? 'selected' : ''}>Vendu</option>
          <option value="rented" ${defStatus === 'rented' ? 'selected' : ''}>Loué</option>
        </select>
      </div>
      <fieldset class="demand-block">
        <legend>Origine du bien <span class="item-meta">— jamais imprimée sur un visuel</span></legend>
        <p class="item-meta">${v.code
          ? 'Code public : <strong>' + escHtml(v.code) + '</strong> — c&#39;est lui que cite le prospect.'
          : 'La référence publique (CF26-DLA-…) est attribuée à l&#39;enregistrement.'}</p>
        <div class="form-group">
          <label>Confrère:</label>
          <select id="property-confrere">
            <option value="">En direct (pas de confrère)</option>
            <option value="__new">+ Nouveau confrère…</option>
          </select>
        </div>
        <div id="confrere-new" style="display:none">
          <div class="form-group">
            <label>Nom du confrère:</label>
            <input type="text" id="confrere-new-name" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Téléphone / WhatsApp:</label>
            <input type="tel" id="confrere-new-phone" autocomplete="off">
          </div>
        </div>
        <div class="form-group">
          <label>Sa référence:</label>
          <input type="text" id="property-confrere-ref" value="${escAttr(v.confrere_ref || '')}" placeholder="La référence du confrère pour ce bien">
        </div>
        <div class="form-group">
          <label>Commission convenue:</label>
          <input type="text" id="property-commission" value="${escAttr(v.commission || '')}" placeholder="50/50, 5 % acheteur…">
        </div>
      </fieldset>
      <fieldset class="demand-block">
        <legend>Pour le rapprochement <span class="item-meta">— sans transaction, ce bien n'est proposé à personne</span></legend>
        <div class="form-group">
          <label>Transaction:</label>
          <select id="property-rentsale">
            <option value="">À préciser</option>
            <option value="rent" ${v.rent_sale === 'rent' ? 'selected' : ''}>Location</option>
            <option value="sale" ${v.rent_sale === 'sale' ? 'selected' : ''}>Vente</option>
          </select>
        </div>
        <div class="form-group">
          <label>Quartier:</label>
          <input type="text" id="property-district" value="${escAttr(v.district || '')}"
                 placeholder="Bonapriso" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Chambres:</label>
          <input type="number" id="property-bedrooms" min="0" value="${escAttr(v.bedrooms || '')}">
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="property-furnished" ${v.furnished ? 'checked' : ''}> Meublé</label>
        </div>
      </fieldset>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="property-description">${escHtml(v.description || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="${back === 'inbox' ? 'showInbox()' : 'showProperties()'}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  /* Adresses déjà saisies + les quartiers connus du rapprochement : écrire
     « Bonaprisso » une fois suffit à rendre un bien introuvable. */
  wireSuggestions('property-address', 'properties', 'address', DEMAND_DISTRICTS);
  wireSuggestions('property-district', 'properties', 'district', DEMAND_DISTRICTS);
  fillConfrereSelect(v);
  wirePriceFromM2();

  document.getElementById('property-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProperty(editing ? property.id : null);
  });
}

/* Le total d'un terrain vendu au m², calculé tant que l'agent ne l'a pas
   saisi lui-même. Un total tapé à la main fait foi (il peut inclure un
   geste) : on ne l'écrase jamais, on signale seulement l'écart. */
function totalFromM2(surface, prixM2) {
  const s = Number(surface), p = Number(prixM2);
  return s > 0 && p > 0 ? Math.round(s * p) : null;
}

function wirePriceFromM2() {
  const s = document.getElementById('property-surface');
  const m = document.getElementById('property-price-m2');
  const t = document.getElementById('property-price');
  const hint = document.getElementById('property-price-hint');
  if (!s || !m || !t) return;
  let auto = !t.value;                       /* vide au départ → on calcule */
  t.addEventListener('input', () => { auto = !t.value; maj(); });
  function maj() {
    const calc = totalFromM2(s.value, m.value);
    if (auto && calc) t.value = calc;
    hint.textContent = calc && Number(t.value) !== calc
      ? `Surface × prix au m² = ${calc.toLocaleString('fr-FR')} FCFA`
      : '';
  }
  s.addEventListener('input', maj);
  m.addEventListener('input', maj);
  maj();
}

/* Remplit la liste des confrères, puis choisit le bon :
   - en modification, celui de la fiche ;
   - depuis un message (draft._contact), celui dont le NUMÉRO figure dans le
     contact extrait ; à défaut, « Nouveau confrère » pré-rempli avec le nom
     et le numéro lus dans le message. Le contact ne se perd plus en prose. */
async function fillConfrereSelect(v) {
  const sel = document.getElementById('property-confrere');
  if (!sel) return;
  const bloc = document.getElementById('confrere-new');
  const basculer = () => { bloc.style.display = sel.value === '__new' ? '' : 'none'; };
  sel.addEventListener('change', basculer);

  const tous = await getAll('confreres');
  if (!sel.isConnected) return;
  propsView.confreres = tous;
  const nouveau = sel.querySelector('option[value="__new"]');
  tous.filter(c => c.active !== false || c.id === v.confrere_id).forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name + (c.agency ? ' — ' + c.agency : '') + (c.phone ? ' · ' + c.phone : '');
    sel.insertBefore(o, nouveau);
  });

  if (v.confrere_id) {
    sel.value = String(v.confrere_id);
  } else if (v._contact) {
    const connu = findConfrere(v._contact, tous);
    if (connu) {
      sel.value = String(connu.id);
    } else {
      sel.value = '__new';
      document.getElementById('confrere-new-name').value = contactName(v._contact);
      const num = (String(v._contact).match(PHONE_IN_TEXT) || [])[0];
      if (num) document.getElementById('confrere-new-phone').value = num.trim();
    }
  }
  basculer();
}

/* Le confrère choisi dans le formulaire, créé s'il est nouveau. Renvoie son
   id, null pour un bien en direct, ou undefined si la saisie est incomplète
   (le message a déjà été affiché). Un « nouveau » confrère dont le numéro
   est déjà connu n'est pas recréé : c'est le même, on le reprend. */
async function resolveConfrere() {
  const choix = document.getElementById('property-confrere').value;
  if (!choix) return null;
  if (choix !== '__new') return Number(choix);

  const name = document.getElementById('confrere-new-name').value.trim();
  const phone = document.getElementById('confrere-new-phone').value.trim();
  if (!name) { UI.toast('Indiquez au moins le nom du confrère.', 'error'); return undefined; }

  const deja = phone ? findConfrere(phone, await getAll('confreres')) : null;
  if (deja) return deja.id;

  const { data, error } = await supabaseClient.from('confreres')
    .insert([{ name, phone: phone || null }]).select();
  if (error) { UI.handleError(error); return undefined; }
  return data[0].id;
}

/* Vendu (ou loué) : la fiche d'abord, puis l'annonce du site par la même
   passerelle que reperes.html (listing-maj, session CRM validée côté
   serveur). Si le site échoue, la fiche reste juste et on le dit. */
async function markSold(propertyId) {
  const p = propsView.crm.find(x => x.id === propertyId);
  if (!p) return;
  const loc = p.rent_sale === 'rent';
  const ok = await UI.confirm(
    (p.code ? p.code + ' — ' : '') + (p.title || 'Ce bien') + ' : marquer ' + (loc ? 'loué' : 'vendu') + ' ?'
    + (p.listing_slug ? '\n\nL\'annonce du site passera aussi « ' + (loc ? 'loué' : 'vendu') + ' ».' : ''),
    { title: loc ? 'Bien loué' : 'Bien vendu', confirmLabel: 'Confirmer', cancelLabel: 'Annuler' });
  if (!ok) return;

  const { error } = await supabaseClient.from('properties')
    .update({ status: loc ? 'rented' : 'sold' }).eq('id', propertyId);
  if (error) { UI.handleError(error); return; }

  if (p.listing_slug) {
    try {
      const sess = (await supabaseClient.auth.getSession()).data.session;
      const r = await fetch('https://selogercm.com/.netlify/functions/listing-maj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sess && sess.access_token) },
        body: JSON.stringify({ slug: p.listing_slug, action: 'statut', vente: !loc })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      UI.toast('Fiche et annonce du site mises à jour', 'success');
    } catch (e) {
      UI.toast('Fiche mise à jour, mais pas le site : ' + ((e && e.message) || e), 'error');
    }
  } else {
    UI.toast('Fiche mise à jour', 'success');
  }
  propsView.loaded = false;
  showProperties();
}

/* ═══════════════ DEMANDES DU SITE (24/10/2026) ═══════════════

   Ce que les visiteurs de selogercm.com laissent avec un contact : le
   formulaire « Je cherche un bien », les rendez-vous, le contact. Le CRM
   vient les chercher (netlify/functions/crm-demandes.js, jeton du CRM
   validé côté site) et l'agent les importe EN UN CLIC : le système propose,
   l'agent valide — une demande fantaisiste ne pollue pas le fichier. */

const SOURCE_DEMANDE = { je_cherche: 'Je cherche', rdv: 'Rendez-vous', contact: 'Contact' };

/* La fiche client tirée d'une demande. Pure, donc testable. */
function demandeVersClient(d) {
  return {
    name: (d.name && d.name !== 'Anonymous') ? d.name : (d.phone ? '+' + d.phone : d.email || 'Visiteur du site'),
    phone: d.phone ? '+' + d.phone : null,
    email: d.email || null,
    type: d.rent_sale === 'sale' ? 'buyer' : (d.rent_sale === 'rent' ? 'renter' : null),
    source: 'site',
    source_detail: (SOURCE_DEMANDE[d.source] || d.source) + (d.listing_ref ? ' · réf. ' + d.listing_ref : ''),
    notes: d.message || null
  };
}

/* La recherche tirée d'une demande, ou null quand elle ne dit pas ce
   qui est cherché (un simple message de contact). Pure, donc testable. */
function demandeVersRecherche(d, clientId) {
  if (!d.rent_sale) return null;
  return {
    client_id: clientId,
    label: 'Site — ' + (SOURCE_DEMANDE[d.source] || d.source),
    rent_sale: d.rent_sale,
    wanted_types: d.type ? [d.type] : null,
    wanted_districts: (d.districts && d.districts.length) ? d.districts : null,
    budget: Number(d.budget_max) > 0 ? Number(d.budget_max) : null,
    budget_min: null,
    min_bedrooms: Number(d.bedrooms) > 0 ? Number(d.bedrooms) : null,
    wants_furnished: d.furnished === true ? true : null,
    notes: d.message || null,
    active: true
  };
}

/* Une ligne lisible : « Location · Appartement · 3 ch. · Bonapriso · 400 000 FCFA max ». */
function resumeDemande(d) {
  return [d.rent_sale === 'sale' ? 'Achat' : (d.rent_sale === 'rent' ? 'Location' : ''),
          TYPE_FR[d.type] || d.type || '',
          Number(d.bedrooms) > 0 ? d.bedrooms + ' ch.' : '',
          (d.districts || []).join(', '),
          Number(d.budget_max) > 0 ? Number(d.budget_max).toLocaleString('fr-FR') + ' FCFA max' : '',
          d.furnished === true ? 'meublé' : '']
    .filter(Boolean).join(' · ');
}

const siteDemandsView = { list: [] };

async function siteFetch(chemin, options) {
  const jeton = (await supabaseClient.auth.getSession()).data.session?.access_token;
  const r = await fetch(SITE_FN + chemin, Object.assign({}, options, {
    headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton }, (options || {}).headers || {})
  }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

/* Le compteur de la navigation. Silencieux en cas d'échec : il n'est
   qu'un rappel, l'écran dira l'erreur si on l'ouvre. */
async function refreshSiteDemandsCount() {
  const badge = document.getElementById('site-demands-count');
  if (!badge) return;
  try {
    const { demandes } = await siteFetch('crm-demandes');
    siteDemandsView.list = demandes || [];
    badge.textContent = siteDemandsView.list.length;
    badge.hidden = !siteDemandsView.list.length;
  } catch (e) { badge.hidden = true; }
}

async function showSiteDemands() {
  UI.showLoading();
  try {
    const { demandes } = await siteFetch('crm-demandes');
    siteDemandsView.list = demandes || [];
  } catch (e) {
    mainContent.innerHTML = `<h2>Demandes du site</h2><div class="alert alert-warning">
      <strong>Les demandes n'ont pas pu être lues.</strong><p>${escHtml(e.message)}</p></div>`;
    return;
  }
  const badge = document.getElementById('site-demands-count');
  if (badge) { badge.textContent = siteDemandsView.list.length; badge.hidden = !siteDemandsView.list.length; }

  const l = siteDemandsView.list;
  mainContent.innerHTML = `
    <h2>Demandes du site</h2>
    <p class="item-meta">${l.length ? l.length + ' demande(s) à traiter, la plus récente en premier.' : ''}
      « Importer » crée la fiche client (ou retrouve celle qui a ce numéro) et sa recherche, puis annonce les biens qui correspondent.</p>
    <div class="list">
      ${l.length ? l.map(d => `<div class="list-item">
        <div><span class="src-badge">${escHtml(SOURCE_DEMANDE[d.source] || d.source)}</span>
          <strong>${escHtml(d.name || 'Sans nom')}</strong>${d.lang === 'en' ? ' <span class="item-meta">(anglais)</span>' : ''}</div>
        <div class="item-meta">${escHtml([d.phone ? '+' + d.phone : '', d.email || ''].filter(Boolean).join(' · '))}</div>
        ${resumeDemande(d) ? `<div class="item-meta">${escHtml(resumeDemande(d))}</div>` : ''}
        ${d.listing_ref ? `<div class="item-meta">Annonce : réf. ${escHtml(d.listing_ref)}</div>` : ''}
        ${d.message ? `<div class="item-meta">« ${escHtml(d.message)} »</div>` : ''}
        <div class="item-meta">${formatDate(d.created_at)}</div>
        <div>
          <button onclick="importSiteDemand(${Number(d.id)})" class="btn btn-primary">Importer</button>
          ${d.phone ? `<button onclick="sendWhatsApp('${escAttr(d.phone)}', '')" class="ghost-btn">WhatsApp</button>` : ''}
          <button onclick="dismissSiteDemand(${Number(d.id)})" class="ghost-btn" title="Essai, doublon ou message hors sujet">Écarter</button>
        </div>
      </div>`).join('') : '<p>Aucune demande en attente. Elles arrivent du formulaire « Je cherche un bien », des rendez-vous et du contact de selogercm.com.</p>'}
    </div>`;
}

async function importSiteDemand(id) {
  const d = siteDemandsView.list.find(x => x.id === id);
  if (!d) return;
  try {
    /* 1. Le client : le même numéro = la même personne. Un nom seul ne
          suffit pas à décider, on demande. */
    const tous = await getAll('clients');
    const jumeaux = findDuplicates({ name: d.name, phone: d.phone ? '+' + d.phone : null }, tous);
    let client = null;
    const parTel = jumeaux.find(j => d.phone && normalizePhone(j.client.phone) === normalizePhone('+' + d.phone));
    if (parTel) {
      client = parTel.client;
    } else if (jumeaux.length) {
      const ok = await UI.confirm(
        'Une fiche porte déjà ce nom : ' + (jumeaux[0].client.name || '') + '. Lui rattacher cette demande ?',
        { title: 'Même personne ?', confirmLabel: 'Oui, la rattacher', cancelLabel: 'Non, nouvelle fiche' });
      if (ok) client = jumeaux[0].client;
    }
    if (!client) {
      const { data, error } = await supabaseClient.from('clients').insert([demandeVersClient(d)]).select();
      if (error) throw error;
      client = data[0];
    }

    /* 2. La recherche, s'il y a de quoi en faire une. */
    const recherche = demandeVersRecherche(d, client.id);
    let creee = null;
    if (recherche) {
      const { data, error } = await supabaseClient.from('demands').insert([recherche]).select();
      if (error) throw error;
      creee = data[0];
    }

    /* 3. Une trace dans les activités pour un rendez-vous ou un contact :
          c'est une demande à rappeler, avec la référence citée. */
    if (d.source !== 'je_cherche') {
      await supabaseClient.from('activities').insert([{
        type: d.source === 'rdv' ? 'meeting' : 'email', client_id: client.id,
        notes: (d.source === 'rdv' ? 'Demande de rendez-vous (site)' : 'Message de contact (site)')
          + (d.listing_ref ? ' — réf. ' + d.listing_ref : '') + (d.message ? ' — ' + d.message : ''),
        date: new Date().toISOString().slice(0, 10)
      }]);
    }

    /* 4. Côté site : la demande est traitée, rattachée à la fiche. */
    await siteFetch('crm-demandes', { method: 'POST', body: JSON.stringify({ id: d.id, action: 'importee', crm_client_id: client.id }) });

    UI.toast('Importée : ' + (client.name || 'client') + (creee ? ' — recherche créée' : ''), 'success');
    refreshSiteDemandsCount();
    showClientDemands(client.id);
    if (creee) alertMatchesForDemand(creee);
  } catch (e) {
    UI.toast('Import impossible : ' + ((e && e.message) || e), 'error');
  }
}

async function dismissSiteDemand(id) {
  const ok = await UI.confirm('Écarter cette demande sans l\'importer ? (essai, doublon, message hors sujet)',
    { title: 'Écarter', confirmLabel: 'Écarter', cancelLabel: 'Annuler' });
  if (!ok) return;
  try {
    await siteFetch('crm-demandes', { method: 'POST', body: JSON.stringify({ id, action: 'ecartee' }) });
    showSiteDemands();
  } catch (e) {
    UI.toast('Impossible : ' + ((e && e.message) || e), 'error');
  }
}

/* ═══════════════ RELANCES À 15 JOURS ═══════════════
   Le repère « relancé le… » vit dans le navigateur (localStorage) : c'est
   un rappel de travail pour un CRM à un seul utilisateur, pas une donnée
   métier — comme le repère « J'ai vu » des rapprochements. */
const RELANCES_CLE = 'slcm-relances';
function relancesFaites() {
  try { return JSON.parse(localStorage.getItem(RELANCES_CLE) || '{}') || {}; } catch (e) { return {}; }
}

function renderRelances() {
  const box = document.getElementById('relances');
  if (!box) return;
  const liste = aRelancer(propsView.crm, propsView.site, relancesFaites(), Date.now());
  if (!liste.length) { box.innerHTML = ''; return; }
  const conf = new Map((propsView.confreres || []).map(c => [c.id, c]));
  box.innerHTML = `<div class="alert alert-match">
    <strong>${liste.length} bien${liste.length > 1 ? 's' : ''} de confrère en ligne depuis ${RELANCE_JOURS} jours ou plus</strong>
    <p class="item-meta">Une offre de groupe se vend vite : vérifie qu'ils sont toujours disponibles. Vendu ? Bouton « Vendu » sur la fiche.</p>
    ${liste.map(p => {
      const c = conf.get(p.confrere_id);
      return `<div style="margin-top:6px">${escHtml(p.code)} — ${escHtml(p.title || '')}${c ? ' · ' + escHtml(c.name) : ''}
        ${c && confrereWa(c) ? `<button onclick="relancerConfrere(${Number(p.id)})" class="ghost-btn">Relancer</button>` : '<span class="item-meta">(pas de numéro)</span>'}</div>`;
    }).join('')}
  </div>`;
}

function relancerConfrere(propertyId) {
  const p = propsView.crm.find(x => x.id === propertyId);
  const c = p && (propsView.confreres || []).find(x => x.id === p.confrere_id);
  if (!p || !c || !confrereWa(c)) return;
  sendWhatsApp(confrereWa(c), relanceMessage(p, c));
  const r = relancesFaites();
  r[propertyId] = Date.now();
  try { localStorage.setItem(RELANCES_CLE, JSON.stringify(r)); } catch (e) { /* navigation privée : on relancera encore */ }
  renderRelances();
}

/* ═══════════════ PUBLIER AVEC DES PHOTOS ═══════════════

   Appartements, villas, studios : pas de visuel, des photos. Même chaîne
   que pour un terrain (netlify/functions/crm-publier.js) : référence = code,
   contact = l'agence, 30 jours. Les photos sont réduites en WebP ici, puis
   envoyées DIRECTEMENT à Cloudflare (crm-image-upload-url.js) — rien de
   lourd ne transite par une fonction, la data mobile ne paie que l'utile.

   Le texte public est reconstruit à partir des CHAMPS, jamais repris de la
   description : celle-ci vient souvent du message du confrère (son numéro,
   « commission 1 mois », « me laisser la visite »). */
const SITE_FN = 'https://selogercm.com/.netlify/functions/';
const PHOTOS_MIN = 3;             /* hors terrain — choix du 24/10/2026 */
const PHOTOS_MAX = 15;
const pubView = { p: null, photos: [] };   /* photos : [{ file, apercu }] */

/* Le texte public de départ, à partir des seuls champs de la fiche. */
function texteParDefaut(p) {
  const n = (v, mot) => Number(v) > 0 ? v + ' ' + mot + (Number(v) > 1 ? 's' : '') : '';
  let s = [TYPE_FR[p.type] || 'Bien', n(p.bedrooms, 'chambre'), n(p.bathrooms, 'douche')].filter(Boolean).join(', ');
  if (p.furnished) s += ', meublé';
  if (p.district) s += ' à ' + p.district;
  return s + '.';
}

/* Une photo réduite à 1600 px de côté, en WebP — comme publish.html. */
function photoEnWebp(file, maxCote = 1600, qualite = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxCote / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('conversion impossible')), 'image/webp', qualite);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format illisible : ' + (file.name || file.type))); };
    img.src = url;
  });
}

async function showPublishForm(propertyId) {
  const p = propsView.crm.find(x => x.id === propertyId) || await getById('properties', propertyId);
  if (!p) { UI.toast('Fiche introuvable', 'error'); return; }
  pubView.photos.forEach(x => URL.revokeObjectURL(x.apercu));
  pubView.p = p; pubView.photos = [];
  const terrain = p.type === 'plots-of-land';
  const prix = p.prix_sur_demande ? 'Prix sur demande'
    : (Number(p.price) > 0 ? Number(p.price).toLocaleString('fr-FR') + ' FCFA' : 'Prix manquant');

  mainContent.innerHTML = `
    <h2>Publier ${escHtml(p.code)} sur selogercm.com</h2>
    <p class="item-meta">${escHtml(p.title || '')} — ${escHtml(prix)}${p.rent_sale === 'rent' ? ' / mois' : ''} · ${escHtml(p.district || 'quartier manquant')}</p>
    <p class="item-meta">Référence publique : <strong>${escHtml(p.code)}</strong> · contact affiché : l&#39;agence · en ligne 30 jours.</p>
    <div class="form-group">
      <label>Photos (${terrain ? '1' : PHOTOS_MIN} minimum, ${PHOTOS_MAX} maximum) — la première sert de couverture :</label>
      <input type="file" id="pub-photos" accept="image/*" multiple>
      <p class="item-meta" id="pub-compte"></p>
    </div>
    <div id="pub-grille" style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0"></div>
    <div class="form-group">
      <label>Texte public <span class="item-meta">— relis-le : rien du message du confrère n&#39;y est repris</span></label>
      <textarea id="pub-texte" rows="4">${escHtml(texteParDefaut(p))}</textarea>
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="pub-propres">
        Aucune photo ne montre un numéro, un logo ou un nom d&#39;agence</label>
      <p class="item-meta">Le site efface un numéro écrit dans un texte, pas sur une image. Une seule photo tamponnée envoie ton client chez le confrère.</p>
    </div>
    <button type="button" id="pub-go" class="btn btn-primary">Publier</button>
    <button type="button" onclick="showProperties()" class="btn btn-outline">Annuler</button>
    <p class="item-meta" id="pub-etat"></p>`;

  /* Les photos s'AJOUTENT à chaque choix : sur certains téléphones, le
     sélecteur n'en rend qu'une à la fois (appareil photo, navigateur intégré
     d'une appli…). Le compteur dit où on en est et qu'on peut recommencer. */
  document.getElementById('pub-photos').addEventListener('change', e => {
    const choisies = [...e.target.files];
    /* Certains sélecteurs Android rendent un fichier sans type MIME : on
       se fie alors à l'extension plutôt que de l'écarter en silence. */
    const nouvelles = choisies.filter(f => /^image\//.test(f.type) || (!f.type && /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name || '')));
    let ajoutees = 0;
    for (const f of nouvelles) {
      if (pubView.photos.length >= PHOTOS_MAX) break;
      pubView.photos.push({ file: f, apercu: URL.createObjectURL(f) });
      ajoutees++;
    }
    e.target.value = '';
    dessinerPhotos();
    if (choisies.length && !ajoutees) {
      UI.toast(pubView.photos.length >= PHOTOS_MAX ? `Maximum ${PHOTOS_MAX} photos atteint.` : 'Fichier non reconnu comme une photo.', 'error');
    } else if (ajoutees) {
      UI.toast(`${ajoutees} photo${ajoutees > 1 ? 's' : ''} ajoutée${ajoutees > 1 ? 's' : ''}`, 'success');
    }
  });
  dessinerPhotos();
  document.getElementById('pub-go').addEventListener('click', publierAvecPhotos);
}

/* Les vignettes, avec ← → pour l'ordre et ✕ pour retirer. */
function dessinerPhotos() {
  const g = document.getElementById('pub-grille');
  if (!g) return;
  const c = document.getElementById('pub-compte');
  if (c && pubView.p) {
    const min = pubView.p.type === 'plots-of-land' ? 1 : PHOTOS_MIN, n = pubView.photos.length;
    c.textContent = n >= min
      ? `${n} photo${n > 1 ? 's' : ''} — c'est suffisant (jusqu'à ${PHOTOS_MAX}).`
      : `${n} photo${n > 1 ? 's' : ''} sur ${min} minimum. Le sélecteur n'en prend qu'une ? Touchez-le de nouveau : chaque choix s'ajoute aux précédents.`;
    c.style.color = n >= min ? '' : '#b45309';
  }
  g.innerHTML = pubView.photos.map((x, i) => `
    <div style="width:150px">
      <img src="${escAttr(x.apercu)}" alt="" style="width:150px;height:110px;object-fit:cover;border-radius:8px;${i === 0 ? 'outline:3px solid var(--accent, #ED7A14)' : ''}">
      <div class="item-meta">${i === 0 ? 'Couverture' : 'Photo ' + (i + 1)}</div>
      <button type="button" class="ghost-btn" onclick="deplacerPhoto(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Avant">←</button>
      <button type="button" class="ghost-btn" onclick="deplacerPhoto(${i},1)" ${i === pubView.photos.length - 1 ? 'disabled' : ''} title="Après">→</button>
      <button type="button" class="ghost-btn" onclick="retirerPhoto(${i})" title="Retirer">✕</button>
    </div>`).join('');
}
function deplacerPhoto(i, sens) {
  const j = i + sens, l = pubView.photos;
  if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  dessinerPhotos();
}
function retirerPhoto(i) {
  const [x] = pubView.photos.splice(i, 1);
  if (x) URL.revokeObjectURL(x.apercu);
  dessinerPhotos();
}

async function publierAvecPhotos() {
  const p = pubView.p;
  const etat = t => { const e = document.getElementById('pub-etat'); if (e) e.textContent = t; };
  const terrain = p.type === 'plots-of-land';
  const min = terrain ? 1 : PHOTOS_MIN;
  if (pubView.photos.length < min) { UI.toast(`Au moins ${min} photo${min > 1 ? 's' : ''}.`, 'error'); return; }
  if (!document.getElementById('pub-propres').checked) {
    UI.toast('Vérifie d\'abord qu\'aucune photo ne montre le numéro ou le logo du confrère.', 'error'); return;
  }
  if (!p.rent_sale || !p.district) { UI.toast('La fiche doit indiquer la transaction et le quartier.', 'error'); return; }
  if (!(Number(p.price) > 0) && !(p.prix_sur_demande && p.rent_sale === 'sale')) {
    UI.toast('Prix manquant (ou « prix sur demande » pour une vente).', 'error'); return;
  }

  const btn = document.getElementById('pub-go');
  btn.disabled = true;
  try {
    const jeton = (await supabaseClient.auth.getSession()).data.session?.access_token;
    const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton };

    etat('Préparation des photos…');
    const blobs = [];
    for (let i = 0; i < pubView.photos.length; i++) {
      etat(`Réduction des photos… ${i + 1}/${pubView.photos.length}`);
      blobs.push(await photoEnWebp(pubView.photos[i].file));
    }

    const r1 = await fetch(SITE_FN + 'crm-image-upload-url', { method: 'POST', headers: auth, body: JSON.stringify({ n: blobs.length }) });
    const j1 = await r1.json().catch(() => ({}));
    if (!r1.ok) throw new Error(j1.error || 'URLs d\'envoi : HTTP ' + r1.status);

    for (let i = 0; i < blobs.length; i++) {
      etat(`Envoi des photos… ${i + 1}/${blobs.length}`);
      const envoyer = () => {
        const fd = new FormData();
        fd.append('file', blobs[i], `photo_${i + 1}.webp`);
        return fetch(j1.photos[i].uploadURL, { method: 'POST', body: fd });
      };
      /* Deux essais par photo : sur une connexion mobile, un échec isolé
         ne doit pas faire perdre toute la publication. */
      let r = await envoyer().catch(() => null);
      if (!r || !r.ok) r = await envoyer().catch(() => null);
      if (!r || !r.ok) throw new Error(`photo ${i + 1} non envoyée — réessaie (les photos déjà parties seront relevées par l'audit des images)`);
    }

    etat('Création de l\'annonce…');
    const corps = {
      code: p.code, title: p.title, type: p.type, rent_sale: p.rent_sale,
      price: p.prix_sur_demande ? null : p.price, prix_sur_demande: !!p.prix_sur_demande,
      surface_m2: p.surface_m2, district: p.district, city: 'Douala',
      repere: (p.address && p.address !== p.district) ? p.address : null,
      description: document.getElementById('pub-texte').value.trim(),
      bedrooms: p.bedrooms, bathrooms: p.bathrooms, furnished: !!p.furnished,
      images: j1.photos.map(x => x.url)
    };
    const r2 = await fetch(SITE_FN + 'crm-publier', { method: 'POST', headers: auth, body: JSON.stringify(corps) });
    const j2 = await r2.json().catch(() => ({}));
    if (!(r2.ok || r2.status === 409)) throw new Error(j2.error || 'HTTP ' + r2.status);

    const { error } = await supabaseClient.from('properties').update({ listing_id: j2.id, listing_slug: j2.slug }).eq('id', p.id);
    if (error) throw new Error('annonce en ligne, mais fiche non rattachée : ' + error.message);

    UI.toast((r2.status === 409 ? 'Déjà en ligne — fiche rattachée : ' : 'En ligne : ') + 'selogercm.com/annonce/' + j2.slug, 'success');
    pubView.photos.forEach(x => URL.revokeObjectURL(x.apercu));
    pubView.photos = [];
    propsView.loaded = false;
    showProperties(true);
  } catch (e) {
    etat('');
    UI.toast('Publication impossible : ' + ((e && e.message) || e), 'error');
    btn.disabled = false;
  }
}

/* Écrire au confrère qui détient ce bien, message déjà rédigé. */
function contactConfrere(propertyId) {
  const p = propsView.crm.find(x => x.id === propertyId);
  const c = p && (propsView.confreres || []).find(x => x.id === p.confrere_id);
  if (!p || !c || !confrereWa(c)) { UI.toast('Aucun numéro pour ce confrère.', 'error'); return; }
  sendWhatsApp(confrereWa(c), confrereMessage(p, c));
}

/* ═══════════════ RÉPERTOIRE DES CONFRÈRES ═══════════════
   Pas de suppression, comme partout dans le CRM : un confrère dont on ne
   veut plus passe « inactif » et disparaît des listes de choix, ses biens
   gardent leur origine. */
async function showConfreres() {
  UI.showLoading();
  const [tous, biens] = await Promise.all([getAll('confreres'), getAll('properties')]);
  const parConfrere = {};
  biens.forEach(b => { if (b.confrere_id) parConfrere[b.confrere_id] = (parConfrere[b.confrere_id] || 0) + 1; });

  mainContent.innerHTML = `
    <h2>Confrères</h2>
    <div class="toolbar">
      <button onclick="showConfrereForm()" class="btn btn-primary">Ajouter</button>
      <button onclick="showProperties()" class="ghost-btn">← Biens</button>
    </div>
    <div class="list">
      ${tous.length ? tous.map(c => `<div class="list-item">
        <div><strong>${escHtml(c.name)}</strong>${c.agency ? ' — ' + escHtml(c.agency) : ''}${c.active === false ? ' <span class="item-meta">(inactif)</span>' : ''}</div>
        <div class="item-meta">${escHtml(c.phone || 'Pas de numéro')}${c.zones ? ' · ' + escHtml(c.zones) : ''} · ${parConfrere[c.id] || 0} bien(s)</div>
        ${c.notes ? `<div class="item-meta">${escHtml(c.notes)}</div>` : ''}
        <div><button onclick="editConfrere(${Number(c.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button></div>
      </div>`).join('') : '<p>Aucun confrère pour le moment. Ils se créent aussi depuis la fiche d&#39;un bien.</p>'}
    </div>`;
}

async function editConfrere(id) {
  const c = await getById('confreres', id);
  if (!c) { UI.toast('Confrère introuvable', 'error'); return; }
  showConfrereForm(c);
}

function showConfrereForm(c = null) {
  const v = c || {};
  mainContent.innerHTML = `
    <h2>${c ? 'Modifier' : 'Ajouter'} un confrère</h2>
    <form id="confrere-form">
      <div class="form-group"><label>Nom:</label>
        <input type="text" id="confrere-name" value="${escAttr(v.name || '')}" required></div>
      <div class="form-group"><label>Agence:</label>
        <input type="text" id="confrere-agency" value="${escAttr(v.agency || '')}"></div>
      <div class="form-group"><label>Téléphone:</label>
        <input type="tel" id="confrere-phone" value="${escAttr(v.phone || '')}"></div>
      <div class="form-group"><label>WhatsApp (si différent):</label>
        <input type="tel" id="confrere-whatsapp" value="${escAttr(v.whatsapp || '')}"></div>
      <div class="form-group"><label>Zones:</label>
        <input type="text" id="confrere-zones" value="${escAttr(v.zones || '')}" placeholder="Logpom, Kotto, PK14…"></div>
      <div class="form-group"><label>Notes:</label>
        <textarea id="confrere-notes" placeholder="Conditions habituelles, fiabilité…">${escHtml(v.notes || '')}</textarea></div>
      <div class="form-group"><label><input type="checkbox" id="confrere-active" ${v.active === false ? '' : 'checked'}> Actif</label></div>
      <button type="submit" class="btn btn-primary">${c ? 'Enregistrer' : 'Ajouter'}</button>
      <button type="button" onclick="showConfreres()" class="btn btn-outline">Annuler</button>
    </form>`;
  document.getElementById('confrere-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveConfrere(c ? c.id : null);
  });
}

async function saveConfrere(id) {
  const val = k => document.getElementById('confrere-' + k).value.trim() || null;
  const confrere = {
    name: val('name'), agency: val('agency'), phone: val('phone'),
    whatsapp: val('whatsapp'), zones: val('zones'), notes: val('notes'),
    active: document.getElementById('confrere-active').checked
  };
  const { error } = id
    ? await supabaseClient.from('confreres').update(confrere).eq('id', id)
    : await supabaseClient.from('confreres').insert([confrere]);
  if (error) { UI.handleError(error); return; }
  propsView.loaded = false;
  showConfreres();
}

async function saveProperty(id) {
  const property = {
    title: document.getElementById('property-title').value,
    address: document.getElementById('property-address').value,
    type: document.getElementById('property-type').value,
    /* Même règle que due_date : le prix est facultatif, et '' est refusé
       par une colonne numérique. numOrNull fait déjà exactement ça. */
    price: numOrNull('property-price'),
    surface_m2: numOrNull('property-surface'),
    price_m2: numOrNull('property-price-m2'),
    prix_sur_demande: document.getElementById('property-prix-demande').checked,
    status: document.getElementById('property-status').value,
    description: document.getElementById('property-description').value,

    /* Ce que le rapprochement exige. Sans transaction, un bien reste
       invisible aux recherches — c'est le premier critère bloquant. */
    district: document.getElementById('property-district').value || null,
    rent_sale: document.getElementById('property-rentsale').value || null,
    bedrooms: numOrNull('property-bedrooms'),
    furnished: document.getElementById('property-furnished').checked ? true : null
  };

  try {
    /* L'origine du bien (sql/12). Résolue avant l'écriture : un nouveau
       confrère doit exister pour qu'on puisse y pointer. */
    /* Même terrain, autre confrère ? Seulement à la création. */
    if (!id) {
      const tous = await getAll('properties');
      const jumeaux = similarProperties(property, tous);
      if (jumeaux.length) {
        const conf = new Map((await getAll('confreres')).map(c => [c.id, c.name]));
        const liste = jumeaux.slice(0, 3).map(o => (o.code || '#' + o.id) + ' « ' + (o.title || 'sans titre') + ' »'
          + (o.confrere_id && conf.get(o.confrere_id) ? ' via ' + conf.get(o.confrere_id) : '')).join(', ');
        const continuer = await UI.confirm(
          'Ce bien ressemble à ' + liste + ' : même quartier, même surface, même prix.'
          + '\n\nUn terrain circule souvent chez plusieurs confrères. Le publier deux fois, '
          + 'c\'est deux codes pour un seul bien.',
          { title: 'Bien déjà connu ?', confirmLabel: 'Créer quand même', cancelLabel: 'Revenir à la saisie' });
        if (!continuer) return;
      }
    }

    const confrereId = await resolveConfrere();
    if (confrereId === undefined) return;
    property.confrere_id = confrereId;
    property.confrere_ref = document.getElementById('property-confrere-ref').value.trim() || null;
    property.commission = document.getElementById('property-commission').value.trim() || null;

    const { data, error } = id
      ? await supabaseClient.from('properties').update(property).eq('id', id).select()
      : await supabaseClient.from('properties').insert([property]).select();
    if (error) throw error;

    rememberChoice('property-type', property.type);
    rememberChoice('property-status', property.status);
    propsView.loaded = false;   /* le code public vient d'être attribué par la base */
    showProperties();
    if (data && data[0] && data[0].code && !id) UI.toast('Bien enregistré — code public ' + data[0].code, 'success');

    /* Une fiche interne peut désormais trouver preneur : on le dit tout de
       suite. Les fiches rattachées à une annonce sont déjà couvertes par
       l'annonce elle-même, les alerter deux fois serait du bruit. */
    if (data && data[0] && !data[0].listing_id) alertClientsForListing(asListing(data[0]));
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
        <div><strong>${getActivityLabel(a.type)}</strong> — ${escHtml(a.notes)}
          ${a.outcome ? `<span class="src-badge ${a.outcome === 'failed' || a.outcome === 'no_show' ? 'src-crm' : 'src-site'}">${escHtml(outcomeLabel(a.outcome))}</span>` : ''}</div>
        <div class="item-meta">${formatDate(a.date)}</div>
        <div class="item-meta">${hasOpenFollowUp(a)
          ? 'À faire : ' + escHtml(a.next_step) + (a.next_date ? ' — ' + formatDate(a.next_date) : '')
          : (a.next_step ? 'Suite faite' : '')}</div>
        <div>
          ${hasOpenFollowUp(a) ? `<button onclick="closeFollowUp(${Number(a.id)})" class="ghost-btn">Fait</button>` : ''}
          <button onclick="editActivity(${Number(a.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button>
        </div>
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
      <fieldset class="demand-block">
        <legend>Suite <span class="item-meta">— ce que le CRM doit retenir</span></legend>
        <div class="form-group">
          <label>Issue:</label>
          <select id="activity-outcome">
            <option value="">Non renseignée</option>
            ${Object.keys(OUTCOME_FR).map(o => `<option value="${escAttr(o)}" ${v.outcome === o ? 'selected' : ''}>${OUTCOME_FR[o]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>À faire ensuite <span class="item-meta">— laisser vide s'il n'y a rien</span></label>
          <input type="text" id="activity-next-step" value="${escAttr(v.next_step || '')}"
                 placeholder="Proposer Bonapriso à la place" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Pour quand:</label>
          <input type="date" id="activity-next-date" value="${escAttr(v.next_date || '')}">
        </div>
      </fieldset>
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
    date: document.getElementById('activity-date').value,
    outcome: document.getElementById('activity-outcome').value || null,
    next_step: document.getElementById('activity-next-step').value || null,
    /* Une date sans rien à faire n'a pas de sens : on ne la garde pas. */
    next_date: document.getElementById('activity-next-step').value
      ? (document.getElementById('activity-next-date').value || null) : null
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
  /* parent_id / landlord_id / floor / unit_label / bathrooms ajoutes par
     sql/10 : `properties` etait plat, un immeuble et ses appartements y
     etaient des lignes sans lien, et le proprietaire n'existait que sur
     le bail — donc un logement vacant n'en avait pas. */
  properties: 'id,title,address,type,price,status,description,listing_id,listing_slug,source,created_at,district,rent_sale,bedrooms,furnished,parent_id,landlord_id,floor,unit_label,bathrooms,code,confrere_id,confrere_ref,commission,surface_m2,price_m2,ancien_code,prix_sur_demande',
  /* sql/12 : le confrère qui détient un bien, et le code court public. */
  confreres:  'id,name,agency,phone,whatsapp,zones,notes,active,created_at',
  activities: 'id,type,client_id,property_id,notes,date,created_at,outcome,next_step,next_date,next_done_at',
  tasks:      'id,title,description,due_date,status,created_at',
  /* CORRECTIF 31/08/2026 — `accompte` et `reste` étaient demandés ici alors
     qu'ils n'existent pas dans la table (voir sql/01_schema.sql). PostgREST
     rejetait donc TOUTE lecture de payments (42703), getAll() retournait un
     tableau vide, et par ricochet : écran Paiements toujours vide, chiffre
     d'affaires à 0, alerte retards muette, relances jamais proposées.
     Le suivi acompte / solde reste à construire, base comprise. */
  /* lease_id / period / kind ajoutes par sql/09 : une echeance de loyer EST
     un paiement attendu. Sans `period`, « le loyer d'octobre » n'est pas
     exprimable ; sans `kind`, on ne distingue plus un loyer d'un
     encaissement de facture. */
  payments:   'id,client_id,property_id,amount,status,payment_date,notes,created_at,lease_id,period,kind,last_reminder_at',
  leases:     'id,property_id,tenant_id,landlord_id,start_date,duration_months,rent_amount,payment_day,caution_months,avance_months,commission_rate,status,notes,created_at',
  incidents:  'id,property_id,lease_id,reported_at,reported_by,title,description,urgency,status,cost,resolved_at,resolution,created_at',
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

/* ═══════════════════════════════════════════════════════════════════
   GÉRANCE LOCATIVE — baux, échéances, relances, signalements

   Modèle décidé le 20/10/2026 : le locataire paie DIRECTEMENT le
   propriétaire. L'agence ne tient pas de compte de gérance — elle constate,
   elle relance, et elle facture sa commission à part avec le module Facture.
   Un seul flux d'argent à suivre.

   Les échéances ne vivent PAS dans une table à elles : ce sont des lignes de
   `payments` en 'pending', portant `lease_id` et `period`. Conséquence
   directe et voulue : l'alerte retard du tableau de bord, le chiffre
   d'affaires et l'écran Paiements les voient sans une ligne de code en plus.
   ═══════════════════════════════════════════════════════════════════ */

/* Le vocabulaire des clients, en UN seul endroit.
   `landlord` a été ajouté à la contrainte CHECK par sql/09 — mais pas au
   formulaire, qui ne proposait toujours que trois types. Un propriétaire
   bailleur devait donc être enregistré en « Vendeur », et toute lecture par
   type mentait. Construire les <option> depuis cette table plutôt que de les
   écrire à la main évite que le défaut se reproduise au prochain ajout. */
const CLIENT_TYPE_FR = {
  buyer:    'Acheteur',
  seller:   'Vendeur',
  renter:   'Locataire',
  landlord: 'Propriétaire (bailleur)'
};

const LEASE_STATUS_FR = { active: 'En cours', ended: 'Terminé', suspended: 'Suspendu' };
const INCIDENT_STATUS_FR = { ouvert: 'Ouvert', en_cours: 'En cours', resolu: 'Résolu' };
const INCIDENT_URGENCY_FR = { basse: 'Basse', normale: 'Normale', urgente: 'Urgente' };
const REPORTED_BY_FR = { tenant: 'Locataire', landlord: 'Propriétaire', agency: 'Agence' };

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* « octobre 2026 » à partir de 2026-10-01. Construit à la main : toLocaleDateString
   dépend de la locale du navigateur, et l'écran affichait déjà deux formats de
   date différents côte à côte avant qu'on ne l'uniformise. */
function periodLabel(period) {
  if (!period) return '—';
  const p = String(period).split('-');
  const m = Number(p[1]) - 1;
  return (MOIS_FR[m] || '?') + ' ' + p[0];
}

/* Le premier du mois, en texte, sans passer par Date : un décalage de fuseau
   suffirait à faire reculer la période d'un mois dans l'hémisphère ouest. */
function firstOfMonth(annee, mois) {
  const m = ((mois % 12) + 12) % 12;
  const a = annee + Math.floor(mois / 12);
  return a + '-' + String(m + 1).padStart(2, '0') + '-01';
}

function addMonths(periode, n) {
  const p = String(periode).split('-');
  return firstOfMonth(Number(p[0]), Number(p[1]) - 1 + n);
}

/* Le DERNIER JOUR couvert par un bail.
 *
 * Ne pas confondre avec addMonths, qui travaille sur des PÉRIODES de loyer et
 * rend toujours un 1er du mois. Réutiliser addMonths ici — ce que faisait la
 * première version — jetait le jour du mois : un bail du 15 avril sur 12 mois
 * affichait « 01/04/2027 » au lieu du 14 avril.
 *
 * La règle est celle du QUANTIÈME : le bail court jusqu'à la veille du jour
 * anniversaire. Un bail de 12 mois commencé le 15 avril finit le 14 avril
 * suivant — sans ce « moins un jour » il durerait douze mois et un.
 *
 * Et quand le jour anniversaire n'existe pas — le 31 février —, le bail court
 * jusqu'au DERNIER JOUR du mois, sans retrancher. Un bail d'un mois commencé
 * le 31 janvier finit donc le 28 février, pas le 27 : la veille d'un
 * « 31 février » tombe après le 28, pas avant.
 *
 * Tout passe par Date.UTC : avec un Date local, un fuseau à l'ouest ferait
 * reculer la date d'une journée. */
function leaseEnd(startDate, months) {
  const n = Number(months);
  if (!startDate || !Number.isFinite(n) || n <= 0) return null;
  const p = String(startDate).slice(0, 10).split('-');
  const a = Number(p[0]), m = Number(p[1]) - 1, j = Number(p[2]);
  if (!Number.isFinite(a) || !Number.isFinite(m) || !Number.isFinite(j)) return null;

  const total = m + n;
  const annee = a + Math.floor(total / 12);
  const mois = ((total % 12) + 12) % 12;
  /* Jour 0 du mois suivant = dernier jour du mois visé. */
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();

  /* Le quantième n'existe pas dans le mois d'arrivée : on s'arrête à son
     dernier jour, sans retirer de journée. */
  if (j > dernier) {
    return annee + '-' + String(mois + 1).padStart(2, '0') + '-' + String(dernier).padStart(2, '0');
  }
  const d = new Date(Date.UTC(annee, mois, j));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* Jours entiers entre deux dates, positif si `date` est dans le futur.
   Comparaison faite à midi UTC : à minuit, un décalage d'heure d'été suffit à
   changer le résultat d'une unité. */
function daysUntil(date, today) {
  if (!date) return null;
  const j = (s) => Date.parse(String(s).slice(0, 10) + 'T12:00:00Z');
  const a = j(date), b = j(today || new Date().toISOString().slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/* L'état réel d'une échéance. 'late' n'est pas un statut en base : c'est
   'pending' dont la date est passée. Le calculer ici évite d'avoir à tenir
   une colonne à jour par un travail planifié qui n'existe pas. */
function rentState(p) {
  if (p.status === 'paid') return 'paid';
  const auj = new Date().toISOString().split('T')[0];
  return (p.payment_date && p.payment_date < auj) ? 'late' : 'due';
}

const RENT_STATE_FR = { paid: 'Payé', late: 'En retard', due: 'À venir' };

/* ─────────────── LISTE DES BAUX ─────────────── */

const leasesView = { showAll: false };

async function showLeases() {
  UI.showLoading();
  const [leases, clients, properties, payments] = await Promise.all([
    getAll('leases'), getAll('clients'), getAll('properties'), getAll('payments')
  ]);

  const parClient = new Map(clients.map(c => [String(c.id), c]));
  const parBien = new Map(properties.map(p => [String(p.id), p]));

  /* Les échéances par bail, pour afficher l'état sans un appel par ligne. */
  const parBail = new Map();
  payments.forEach(p => {
    if (!p.lease_id) return;
    const k = String(p.lease_id);
    if (!parBail.has(k)) parBail.set(k, []);
    parBail.get(k).push(p);
  });

  const rows = leasesView.showAll ? leases : leases.filter(l => l.status === 'active');
  /* Calcule a l'ouverture : rien ne tourne en arriere-plan dans ce CRM. */
  const alertes = geranceAlerts(leases, payments);

  mainContent.innerHTML = `
    <h2>Gérance</h2>
    ${geranceAlertBanner(alertes)}
    <div class="toolbar">
      <button onclick="showLeaseForm()" class="btn btn-primary">Nouveau bail</button>
      <button onclick="toggleLeaseFilter()" class="ghost-btn">${leasesView.showAll ? 'Voir les baux en cours' : 'Voir tous les baux'}</button>
      <button onclick="showLandlords()" class="ghost-btn">Portefeuille par propriétaire</button>
      <button onclick="showIncidents()" class="ghost-btn">Signalements</button>
    </div>
    <p class="item-meta">${rows.length} bail/baux affiché(s) · ${leases.filter(l => l.status === 'active').length} en cours</p>
    <div class="list">
      ${rows.length ? rows.map(l => {
        const bien = parBien.get(String(l.property_id));
        const loc = parClient.get(String(l.tenant_id));
        const ech = parBail.get(String(l.id)) || [];
        const retards = ech.filter(p => rentState(p) === 'late').length;
        const impayes = ech.filter(p => p.status !== 'paid').length;
        return `<div class="list-item${retards ? ' attention' : ''}">
          <div>
            <strong>${escHtml((bien && bien.title) || 'Bien #' + l.property_id)}</strong>
            <span class="src-badge ${l.status === 'active' ? 'src-site' : 'src-crm'}">${LEASE_STATUS_FR[l.status] || l.status}</span>
            <div class="item-meta">${escHtml((loc && loc.name) || 'Locataire #' + l.tenant_id)} · ${formatMoney(l.rent_amount)} FCFA/mois · échéance le ${Number(l.payment_day)}</div>
            <div class="item-meta">${retards
              ? '<strong>' + retards + ' loyer(s) en retard</strong>'
              : (impayes ? impayes + ' échéance(s) à venir' : 'Rien en attente')}</div>
          </div>
          <div>
            <button onclick="showLeaseDetail(${Number(l.id)})" class="btn btn-outline">Ouvrir</button>
            <button onclick="editLease(${Number(l.id)})" class="edit-btn" title="Modifier le bail">${ICON_EDIT}</button>
          </div>
        </div>`;
      }).join('') : `<div class="empty-state"><p><strong>Aucun bail ${leasesView.showAll ? '' : 'en cours'}.</strong></p>
        <p>Un bail relie un bien, un locataire et un propriétaire. Il porte le loyer,
        la durée et le jour d'échéance — c'est lui qui permet de générer les loyers à percevoir.</p></div>`}
    </div>
  `;
}

function toggleLeaseFilter() {
  leasesView.showAll = !leasesView.showAll;
  showLeases();
}

/* ─────────────── FICHE D'UN BAIL ─────────────── */

async function showLeaseDetail(id) {
  UI.showLoading();
  const [leases, clients, properties, payments, incidents] = await Promise.all([
    getAll('leases'), getAll('clients'), getAll('properties'), getAll('payments'), getAll('incidents')
  ]);

  const l = leases.find(x => String(x.id) === String(id));
  if (!l) { mainContent.innerHTML = '<h2>Bail introuvable</h2>'; return; }

  const bien = properties.find(p => String(p.id) === String(l.property_id));
  const loc = clients.find(c => String(c.id) === String(l.tenant_id));
  const bailleur = clients.find(c => String(c.id) === String(l.landlord_id));

  /* Les plus récentes en tête : c'est le mois courant qu'on vient consulter. */
  const ech = payments
    .filter(p => String(p.lease_id) === String(l.id))
    .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));

  const sign = incidents
    .filter(i => String(i.lease_id) === String(l.id))
    .sort((a, b) => String(b.reported_at || '').localeCompare(String(a.reported_at || '')));

  /* leaseEnd, et surtout PAS addMonths : celle-ci travaille sur les périodes
     de loyer et rend toujours un 1er du mois. C'est la confusion qui affichait
     « 01/04/2027 » pour un bail commencé le 15 avril. */
  const fin = leaseEnd(l.start_date, l.duration_months);
  const joursAvantFin = fin ? daysUntil(fin) : null;
  const commission = Math.round(Number(l.rent_amount) * Number(l.commission_rate || 0) / 100);

  mainContent.innerHTML = `
    <h2>${escHtml((bien && bien.title) || 'Bien #' + l.property_id)}</h2>
    <p class="item-meta">
      <span class="src-badge ${l.status === 'active' ? 'src-site' : 'src-crm'}">${LEASE_STATUS_FR[l.status] || l.status}</span>
      ${escHtml((bien && bien.address) || '')}
    </p>

    <div class="dashboard">
      <div class="card"><h3>Loyer mensuel</h3><p class="metric">${formatMoney(l.rent_amount)}</p><small>FCFA · dû le ${Number(l.payment_day)} du mois</small></div>
      <div class="card"><h3>Locataire</h3><p class="metric" style="font-size:1.1rem">${escHtml((loc && loc.name) || '—')}</p><small>${escHtml((loc && loc.phone) || 'Pas de téléphone')}</small></div>
      <div class="card"><h3>Propriétaire</h3><p class="metric" style="font-size:1.1rem">${escHtml((bailleur && bailleur.name) || 'Non renseigné')}</p><small>${escHtml((bailleur && bailleur.phone) || '')}</small></div>
      <div class="card"><h3>Part agence</h3><p class="metric">${formatMoney(commission)}</p><small>${Number(l.commission_rate || 0)} % · à facturer séparément</small></div>
    </div>

    <h3>Le bail</h3>
    <div class="list">
      <div class="list-item"><div>Début</div><div class="item-meta">${formatDate(l.start_date)}</div></div>
      <div class="list-item"><div>Durée</div><div class="item-meta">${l.duration_months
        ? Number(l.duration_months) + ' mois — dernier jour couvert : ' + formatDate(fin)
          + (l.status === 'active' && joursAvantFin !== null
              ? (joursAvantFin < 0
                  ? ' <strong>(échu depuis ' + Math.abs(joursAvantFin) + ' jour(s))</strong>'
                  : joursAvantFin <= RENEWAL_NOTICE_DAYS
                    ? ' <strong>(dans ' + joursAvantFin + ' jour(s))</strong>'
                    : '')
              : '')
        : 'Durée indéterminée'}</div></div>
      <div class="list-item"><div>Caution</div><div class="item-meta">${Number(l.caution_months || 0)} mois (${formatMoney(Number(l.rent_amount) * Number(l.caution_months || 0))} FCFA)</div></div>
      <div class="list-item"><div>Avance</div><div class="item-meta">${Number(l.avance_months || 0)} mois (${formatMoney(Number(l.rent_amount) * Number(l.avance_months || 0))} FCFA)</div></div>
      ${l.notes ? `<div class="list-item"><div>Notes</div><div class="item-meta">${escHtml(l.notes)}</div></div>` : ''}
    </div>

    <h3>Échéances</h3>
    <div class="toolbar">
      <button onclick="generateSchedule(${Number(l.id)})" class="btn btn-primary">Générer les prochains loyers</button>
      <button onclick="showIncidentForm(null, {lease_id:${Number(l.id)}, property_id:${Number(l.property_id)}}, 'lease-${Number(l.id)}')" class="ghost-btn">Signaler un problème</button>
      ${l.status === 'active' ? `<button onclick="endLease(${Number(l.id)})" class="ghost-btn">Clore le bail</button>` : ''}
    </div>
    <div class="list">
      ${ech.length ? ech.map(p => {
        const etat = rentState(p);
        return `<div class="list-item${etat === 'late' ? ' attention' : ''}">
          <div>
            <strong>${periodLabel(p.period)}</strong>
            <span class="src-badge ${etat === 'paid' ? 'src-site' : 'src-crm'}">${RENT_STATE_FR[etat]}</span>
            <div class="item-meta">${formatMoney(p.amount)} FCFA · dû le ${formatDate(p.payment_date)}</div>
          </div>
          <div>
            ${etat !== 'paid' ? `<button onclick="markRentPaid(${Number(p.id)}, ${Number(l.id)})" class="btn btn-outline">Marquer payé</button>` : ''}
            ${etat === 'late' && loc && loc.phone ? `<button onclick="relanceRent(${Number(p.id)}, ${Number(l.id)})" class="edit-btn" title="Relancer par WhatsApp">${ICON_WHATSAPP}</button>` : ''}
          </div>
        </div>`;
      }).join('') : '<p class="item-meta">Aucune échéance générée. Le bouton ci-dessus crée les loyers à percevoir pour les mois à venir.</p>'}
    </div>

    <h3>Signalements</h3>
    <div class="list">
      ${sign.length ? sign.map(i => incidentRow(i)).join('')
        : '<p class="item-meta">Aucun signalement sur ce bail.</p>'}
    </div>

    <button onclick="showLeases()" class="btn btn-outline">Retour aux baux</button>
  `;
}

/* ─────────────── GÉNÉRATION DES ÉCHÉANCES ───────────────

   On génère à la demande, jamais automatiquement : rien dans ce CRM ne
   tourne en arrière-plan, et un travail planifié qui créerait des lignes
   sans qu'on le voie serait impossible à déboguer depuis le navigateur.

   La base refuse les doublons (index unique sur lease_id + period), donc
   relancer le bouton ne peut pas créer deux fois le loyer d'octobre. On
   s'appuie sur elle plutôt que sur une vérification en JavaScript qu'un
   second onglet contournerait. */
async function generateSchedule(leaseId) {
  try {
    const [leases, payments] = await Promise.all([getAll('leases'), getAll('payments')]);
    const l = leases.find(x => String(x.id) === String(leaseId));
    if (!l) throw new Error('Bail introuvable');

    const existantes = new Set(
      payments.filter(p => String(p.lease_id) === String(l.id) && p.period)
              .map(p => String(p.period))
    );

    const debut = String(l.start_date).slice(0, 7) + '-01';
    /* On s'arrête à la fin du bail quand elle est connue, sinon douze mois :
       au-delà, on génèrerait des loyers pour un bail qui aura peut-être été
       résilié, et il faudrait ensuite les effacer — or le CRM ne supprime rien. */
    const total = l.duration_months ? Number(l.duration_months) : 12;

    const aCreer = [];
    for (let i = 0; i < total; i++) {
      const periode = addMonths(debut, i);
      if (existantes.has(periode)) continue;
      aCreer.push({
        lease_id: l.id,
        client_id: l.tenant_id,
        property_id: l.property_id,
        amount: l.rent_amount,
        status: 'pending',
        /* La date d'exigibilité : le jour du mois convenu au bail. Distincte
           de `period`, qui désigne le mois couvert. */
        payment_date: periode.slice(0, 8) + String(l.payment_day).padStart(2, '0'),
        period: periode,
        kind: 'rent',
        notes: 'Loyer ' + periodLabel(periode)
      });
    }

    if (!aCreer.length) {
      UI.toast('Toutes les échéances sont déjà générées', 'info');
      return;
    }

    const continuer = await UI.confirm(
      aCreer.length + ' échéance(s) vont être créées, de ' + periodLabel(aCreer[0].period)
      + ' à ' + periodLabel(aCreer[aCreer.length - 1].period) + '.',
      'Générer les loyers'
    );
    if (!continuer) return;

    const { error } = await supabaseClient.from('payments').insert(aCreer);
    if (error) throw error;
    UI.toast(aCreer.length + ' échéance(s) créée(s)', 'success');
    showLeaseDetail(leaseId);
  } catch (e) {
    console.error('[gerance] generateSchedule:', e);
    UI.handleError(e);
  }
}

async function markRentPaid(paymentId, leaseId) {
  try {
    const { error } = await supabaseClient
      .from('payments')
      .update({ status: 'paid', payment_date: new Date().toISOString().split('T')[0] })
      .eq('id', paymentId);
    if (error) throw error;
    UI.toast('Loyer encaissé', 'success');
    showLeaseDetail(leaseId);
  } catch (e) {
    console.error('[gerance] markRentPaid:', e);
    UI.handleError(e);
  }
}

/* La relance n'écrit RIEN : elle ouvre WhatsApp avec un message prêt. C'est
   l'agent qui envoie, parce qu'un message parti sans relecture engage
   l'agence auprès d'un client. */
async function relanceRent(paymentId, leaseId) {
  const [payments, clients, properties, leases] = await Promise.all([
    getAll('payments'), getAll('clients'), getAll('properties'), getAll('leases')
  ]);
  const p = payments.find(x => String(x.id) === String(paymentId));
  const l = leases.find(x => String(x.id) === String(leaseId));
  if (!p || !l) return;
  const loc = clients.find(c => String(c.id) === String(l.tenant_id));
  const bien = properties.find(b => String(b.id) === String(l.property_id));
  if (!loc || !loc.phone) { UI.toast('Pas de téléphone pour ce locataire', 'error'); return; }

  const message = 'Bonjour ' + (loc.name || '') + ', '
    + 'le loyer de ' + periodLabel(p.period)
    + (bien && bien.title ? ' pour ' + bien.title : '')
    + ' (' + formatMoney(p.amount) + ' FCFA) était dû le ' + formatDate(p.payment_date) + '. '
    + 'Merci de régulariser dès que possible. SE LOGER CM.';
  sendWhatsApp(loc.phone, message);

  /* On note la date AVANT de savoir si le message est parti : WhatsApp s'ouvre
     ailleurs et ne nous dit rien. Entre redemander une relance demain et la
     redemander dans sept jours, la seconde erreur est la moins genante — un
     locataire relance deux fois par semaine se braque.

     Un echec d'ecriture n'est pas bloquant : le message, lui, est parti. */
  supabaseClient
    .from('payments')
    .update({ last_reminder_at: new Date().toISOString().slice(0, 10) })
    .eq('id', paymentId)
    .then(({ error }) => {
      if (error) console.error('[gerance] trace de relance:', error);
      else showLeaseDetail(leaseId);
    });
}

async function endLease(id) {
  const continuer = await UI.confirm(
    "Le bail passera en « Terminé » et le bien redeviendra disponible. "
    + 'Les échéances déjà générées sont conservées : elles font partie de ton historique.',
    'Clore le bail'
  );
  if (!continuer) return;
  try {
    const { data: l, error } = await supabaseClient
      .from('leases').update({ status: 'ended' }).eq('id', id).select().single();
    if (error) throw error;
    /* Le bien redevient proposable au rapprochement. Sans ça il resterait
       'rented' et n'apparaîtrait plus jamais dans les correspondances. */
    if (l && l.property_id) {
      await supabaseClient.from('properties').update({ status: 'available' }).eq('id', l.property_id);
    }
    UI.toast('Bail clos', 'success');
    showLeases();
  } catch (e) {
    console.error('[gerance] endLease:', e);
    UI.handleError(e);
  }
}

/* ─────────────── FORMULAIRE DE BAIL ─────────────── */

async function editLease(id) {
  const rows = await getAll('leases');
  const l = rows.find(x => String(x.id) === String(id));
  if (l) showLeaseForm(l);
}

function showLeaseForm(lease = null, draft = null, back = null) {
  const v = lease || draft || {};
  const editing = !!lease;
  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier le' : 'Nouveau'} bail</h2>
    <form id="lease-form">
      <div class="form-group">
        <label for="lease-property">Bien loué :</label>
        <select id="lease-property" required><option value="">Sélectionne un bien</option></select>
      </div>
      <div class="form-group">
        <label for="lease-tenant">Locataire :</label>
        <select id="lease-tenant" required><option value="">Sélectionne un client</option></select>
      </div>
      <div class="form-group">
        <label for="lease-landlord">Propriétaire bailleur :</label>
        <select id="lease-landlord"><option value="">Non renseigné</option></select>
        <small class="item-meta">Facultatif — le bail peut être saisi avant que sa fiche n'existe.</small>
      </div>
      <div class="form-group">
        <label for="lease-start">Début du bail :</label>
        <input type="date" id="lease-start" value="${escAttr(v.start_date || new Date().toISOString().split('T')[0])}" required>
      </div>
      <div class="form-group">
        <label for="lease-duration">Durée (mois) :</label>
        <input type="number" id="lease-duration" min="1" value="${escAttr(v.duration_months || '')}" placeholder="Laisser vide pour une durée indéterminée">
      </div>
      <div class="form-group">
        <label for="lease-rent">Loyer mensuel (FCFA) :</label>
        <input type="number" id="lease-rent" min="1" value="${escAttr(v.rent_amount || '')}" required>
      </div>
      <div class="form-group">
        <label for="lease-day">Jour d'échéance :</label>
        <input type="number" id="lease-day" min="1" max="28" value="${escAttr(v.payment_day || 5)}" required>
        <small class="item-meta">Entre 1 et 28 : un bail au 31 n'aurait pas d'échéance en février.</small>
      </div>
      <div class="form-group">
        <label for="lease-caution">Caution (mois) :</label>
        <input type="number" id="lease-caution" min="0" value="${escAttr(v.caution_months != null ? v.caution_months : 0)}">
      </div>
      <div class="form-group">
        <label for="lease-avance">Avance (mois) :</label>
        <input type="number" id="lease-avance" min="0" value="${escAttr(v.avance_months != null ? v.avance_months : 0)}">
      </div>
      <div class="form-group">
        <label for="lease-commission">Commission de gérance (%) :</label>
        <input type="number" id="lease-commission" min="0" max="100" step="0.5" value="${escAttr(v.commission_rate != null ? v.commission_rate : 0)}">
        <small class="item-meta">Se facture à part, avec le module Facture.</small>
      </div>
      ${editing ? `<div class="form-group">
        <label for="lease-status">Statut :</label>
        <select id="lease-status">
          <option value="active"    ${v.status === 'active' ? 'selected' : ''}>En cours</option>
          <option value="suspended" ${v.status === 'suspended' ? 'selected' : ''}>Suspendu</option>
          <option value="ended"     ${v.status === 'ended' ? 'selected' : ''}>Terminé</option>
        </select>
      </div>` : ''}
      <div class="form-group">
        <label for="lease-notes">Notes :</label>
        <textarea id="lease-notes">${escHtml(v.notes || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer le bail'}</button>
      <button type="button" onclick="showLeases()" class="btn btn-outline">Annuler</button>
    </form>
  `;

  populateSelect('lease-property', 'properties', 'title', v.property_id);
  populateSelect('lease-tenant', 'clients', 'name', v.tenant_id);
  populateSelect('lease-landlord', 'clients', 'name', v.landlord_id);

  document.getElementById('lease-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveLease(editing ? lease.id : null);
  });
}

async function saveLease(id) {
  const lease = {
    property_id: document.getElementById('lease-property').value || null,
    tenant_id: document.getElementById('lease-tenant').value || null,
    landlord_id: document.getElementById('lease-landlord').value || null,
    start_date: document.getElementById('lease-start').value,
    duration_months: document.getElementById('lease-duration').value || null,
    rent_amount: document.getElementById('lease-rent').value,
    payment_day: document.getElementById('lease-day').value,
    caution_months: document.getElementById('lease-caution').value || 0,
    avance_months: document.getElementById('lease-avance').value || 0,
    commission_rate: document.getElementById('lease-commission').value || 0,
    notes: document.getElementById('lease-notes').value || null
  };
  const statusEl = document.getElementById('lease-status');
  if (statusEl) lease.status = statusEl.value;

  try {
    if (id) {
      const { error } = await supabaseClient.from('leases').update(lease).eq('id', id);
      if (error) throw error;
      UI.toast('Bail mis à jour', 'success');
    } else {
      const { data, error } = await supabaseClient.from('leases').insert([lease]).select().single();
      if (error) throw error;
      /* Le bien passe en loué : sans ça il continuerait d'être proposé aux
         clients en recherche, et on ferait visiter un appartement occupé. */
      await supabaseClient.from('properties').update({ status: 'rented' }).eq('id', lease.property_id);
      UI.toast('Bail créé — génère maintenant les échéances', 'success');
      showLeaseDetail(data.id);
      return;
    }
    showLeases();
  } catch (e) {
    console.error('[gerance] saveLease:', e);
    /* L'index unique sur (property_id) where status='active' remonte ici.
       Le message brut de PostgREST ne dirait rien à l'agent. */
    if (String(e.message || '').indexOf('uniq_lease_active_property') !== -1) {
      UI.toast('Ce bien porte déjà un bail en cours. Clos-le avant d’en créer un autre.', 'error');
      return;
    }
    UI.handleError(e);
  }
}

/* ─────────────── SIGNALEMENTS ─────────────── */

function incidentRow(i, bienNom) {
  const badge = i.status === 'resolu' ? 'src-site' : 'src-crm';
  return `<div class="list-item${i.status !== 'resolu' && i.urgency === 'urgente' ? ' attention' : ''}">
    <div>
      <strong>${escHtml(i.title)}</strong>
      <span class="src-badge ${badge}">${INCIDENT_STATUS_FR[i.status] || i.status}</span>
      ${i.urgency === 'urgente' && i.status !== 'resolu' ? '<span class="src-badge src-crm">URGENT</span>' : ''}
      <div class="item-meta">${bienNom ? escHtml(bienNom) + ' · ' : ''}Signalé par ${REPORTED_BY_FR[i.reported_by] || '—'} le ${formatDate(i.reported_at)}</div>
      ${i.description ? `<div class="item-meta">${escHtml(i.description)}</div>` : ''}
      ${i.cost != null ? `<div class="item-meta">Coût : ${formatMoney(i.cost)} FCFA</div>` : ''}
      ${i.resolution ? `<div class="item-meta">Résolution : ${escHtml(i.resolution)}</div>` : ''}
    </div>
    <div><button onclick="editIncident(${Number(i.id)})" class="edit-btn" title="Modifier">${ICON_EDIT}</button></div>
  </div>`;
}

const incidentsView = { showAll: false };

async function showIncidents() {
  UI.showLoading();
  const [incidents, properties] = await Promise.all([getAll('incidents'), getAll('properties')]);
  const parBien = new Map(properties.map(p => [String(p.id), p]));

  const rows = (incidentsView.showAll ? incidents : incidents.filter(i => i.status !== 'resolu'))
    .sort((a, b) => String(b.reported_at || '').localeCompare(String(a.reported_at || '')));
  const ouverts = incidents.filter(i => i.status !== 'resolu').length;

  mainContent.innerHTML = `
    <h2>Signalements</h2>
    <div class="toolbar">
      <button onclick="showIncidentForm()" class="btn btn-primary">Nouveau signalement</button>
      <button onclick="toggleIncidentFilter()" class="ghost-btn">${incidentsView.showAll ? 'Voir les non résolus' : 'Voir tous'}</button>
      <button onclick="showLeases()" class="ghost-btn">Retour aux baux</button>
    </div>
    <p class="item-meta">${rows.length} affiché(s) · ${ouverts} non résolu(s)</p>
    <div class="list">
      ${rows.length ? rows.map(i => {
        const b = parBien.get(String(i.property_id));
        return incidentRow(i, (b && b.title) || 'Bien #' + i.property_id);
      }).join('') : `<div class="empty-state"><p><strong>Aucun signalement${incidentsView.showAll ? '' : ' en cours'}.</strong></p>
        <p>Un signalement est un problème sur un bien — fuite, panne, dégradation —
        avec son cycle de vie : ouvert, en cours, résolu.</p></div>`}
    </div>
  `;
}

function toggleIncidentFilter() {
  incidentsView.showAll = !incidentsView.showAll;
  showIncidents();
}

async function editIncident(id) {
  const rows = await getAll('incidents');
  const i = rows.find(x => String(x.id) === String(id));
  if (i) showIncidentForm(i);
}

function showIncidentForm(incident = null, draft = null, back = null) {
  const v = incident || draft || {};
  const editing = !!incident;
  const retour = back && back.indexOf('lease-') === 0
    ? 'showLeaseDetail(' + Number(back.slice(6)) + ')'
    : 'showIncidents()';

  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier le' : 'Nouveau'} signalement</h2>
    <form id="incident-form">
      <div class="form-group">
        <label for="incident-property">Bien concerné :</label>
        <select id="incident-property" required><option value="">Sélectionne un bien</option></select>
      </div>
      <div class="form-group">
        <label for="incident-title">Objet :</label>
        <input type="text" id="incident-title" value="${escAttr(v.title || '')}" required placeholder="Fuite d'eau à la cuisine">
      </div>
      <div class="form-group">
        <label for="incident-desc">Description :</label>
        <textarea id="incident-desc">${escHtml(v.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="incident-by">Signalé par :</label>
        <select id="incident-by">
          <option value="tenant"   ${(v.reported_by || 'tenant') === 'tenant' ? 'selected' : ''}>Locataire</option>
          <option value="landlord" ${v.reported_by === 'landlord' ? 'selected' : ''}>Propriétaire</option>
          <option value="agency"   ${v.reported_by === 'agency' ? 'selected' : ''}>Agence</option>
        </select>
      </div>
      <div class="form-group">
        <label for="incident-date">Date du signalement :</label>
        <input type="date" id="incident-date" value="${escAttr(v.reported_at || new Date().toISOString().split('T')[0])}" required>
      </div>
      <div class="form-group">
        <label for="incident-urgency">Urgence :</label>
        <select id="incident-urgency">
          <option value="basse"   ${v.urgency === 'basse' ? 'selected' : ''}>Basse</option>
          <option value="normale" ${(v.urgency || 'normale') === 'normale' ? 'selected' : ''}>Normale</option>
          <option value="urgente" ${v.urgency === 'urgente' ? 'selected' : ''}>Urgente</option>
        </select>
      </div>
      <div class="form-group">
        <label for="incident-status">État :</label>
        <select id="incident-status">
          <option value="ouvert"   ${(v.status || 'ouvert') === 'ouvert' ? 'selected' : ''}>Ouvert</option>
          <option value="en_cours" ${v.status === 'en_cours' ? 'selected' : ''}>En cours</option>
          <option value="resolu"   ${v.status === 'resolu' ? 'selected' : ''}>Résolu</option>
        </select>
      </div>
      <div class="form-group">
        <label for="incident-cost">Coût de l'intervention (FCFA) :</label>
        <input type="number" id="incident-cost" min="0" value="${escAttr(v.cost != null ? v.cost : '')}" placeholder="Laisser vide tant qu'on ne sait pas">
      </div>
      <div class="form-group">
        <label for="incident-resolution">Résolution :</label>
        <textarea id="incident-resolution" placeholder="Ce qui a été fait">${escHtml(v.resolution || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Enregistrer le signalement'}</button>
      <button type="button" onclick="${retour}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  populateSelect('incident-property', 'properties', 'title', v.property_id);
  document.getElementById('incident-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveIncident(editing ? incident.id : null, v.lease_id || null, back);
  });
}

async function saveIncident(id, leaseId, back) {
  const statut = document.getElementById('incident-status').value;
  const incident = {
    property_id: document.getElementById('incident-property').value || null,
    title: document.getElementById('incident-title').value,
    description: document.getElementById('incident-desc').value || null,
    reported_by: document.getElementById('incident-by').value,
    reported_at: document.getElementById('incident-date').value,
    urgency: document.getElementById('incident-urgency').value,
    status: statut,
    cost: document.getElementById('incident-cost').value || null,
    resolution: document.getElementById('incident-resolution').value || null,
    /* Horodaté à la clôture, et effacé si on rouvre : une date de résolution
       sur un signalement rouvert ferait croire le problème réglé. */
    resolved_at: statut === 'resolu' ? new Date().toISOString().split('T')[0] : null
  };
  if (leaseId) incident.lease_id = leaseId;

  try {
    if (id) {
      const { error } = await supabaseClient.from('incidents').update(incident).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('incidents').insert([incident]);
      if (error) throw error;
    }
    UI.toast('Signalement enregistré', 'success');
    if (back && back.indexOf('lease-') === 0) showLeaseDetail(Number(back.slice(6)));
    else showIncidents();
  } catch (e) {
    console.error('[gerance] saveIncident:', e);
    UI.handleError(e);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   IMMEUBLES ET LOGEMENTS — la structure du portefeuille

   `properties` était plat : un immeuble et ses appartements y étaient des
   lignes sans lien. On ne pouvait donc ni lister les logements d'un immeuble,
   ni compter ceux qui sont loués, ni présenter un portefeuille par
   propriétaire.

   Chaque logement est une VRAIE ligne `properties` pointant vers l'immeuble
   par `parent_id`, et non un compteur sur l'immeuble : les loyers diffèrent
   d'un appartement à l'autre, donc chacun porte son prix, son statut, son
   bail et son locataire.
   ═══════════════════════════════════════════════════════════════════ */

/* « RDC », « 1er étage », « 4e étage ». Le rez-de-chaussée est l'étage 0 :
   un entier se trie dans l'ordre du bâtiment, là où un texte placerait
   « 10e » avant « 2e ». */
function floorLabel(n) {
  const e = Number(n);
  if (!Number.isFinite(e)) return '';
  if (e === 0) return 'RDC';
  if (e === 1) return '1er étage';
  return e + 'e étage';
}

function unitTitle(immeubleNom, etage, libelle) {
  return [immeubleNom, floorLabel(etage), libelle].filter(Boolean).join(' — ');
}

/* Ce qui décrit un logement en un coup d'œil : « 2 ch · 2 dch · meublé ». */
function unitSpec(u) {
  const bits = [];
  if (u.bedrooms) bits.push(Number(u.bedrooms) + ' ch');
  if (u.bathrooms) bits.push(Number(u.bathrooms) + ' dch');
  if (u.furnished) bits.push('meublé');
  if (u.type && typeof TYPE_FR !== 'undefined' && TYPE_FR[u.type]) bits.unshift(TYPE_FR[u.type]);
  return bits.join(' · ');
}

/* ─────────────── PORTEFEUILLE PAR PROPRIÉTAIRE ─────────────── */

async function showLandlords() {
  UI.showLoading();
  const [properties, clients, leases] = await Promise.all([
    getAll('properties'), getAll('clients'), getAll('leases')
  ]);

  const parClient = new Map(clients.map(c => [String(c.id), c]));
  const bauxActifs = new Set(leases.filter(l => l.status === 'active').map(l => String(l.property_id)));

  /* Regroupement par propriétaire. Les biens sans bailleur forment un groupe
     à part plutôt que d'être tus : c'est la liste de ce qui reste à
     renseigner, et la cacher la rendrait invisible. */
  const groupes = new Map();
  properties.forEach(p => {
    const k = p.landlord_id ? String(p.landlord_id) : '';
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(p);
  });

  const ordre = [...groupes.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    const na = (parClient.get(a) || {}).name || '';
    const nb = (parClient.get(b) || {}).name || '';
    return na.localeCompare(nb);
  });

  mainContent.innerHTML = `
    <h2>Portefeuille par propriétaire</h2>
    <div class="toolbar">
      <button onclick="showBuildingForm()" class="btn btn-primary">Nouvel immeuble</button>
      <button onclick="showLeases()" class="ghost-btn">Retour aux baux</button>
    </div>
    ${ordre.length ? ordre.map(k => {
      const prop = k ? parClient.get(k) : null;
      const biens = groupes.get(k);
      const immeubles = biens.filter(b => b.type === 'building');
      const logements = biens.filter(b => b.parent_id);
      const isoles = biens.filter(b => !b.parent_id && b.type !== 'building');
      const unites = logements.concat(isoles);
      const loues = unites.filter(u => bauxActifs.has(String(u.id))).length;
      const loyers = unites.reduce((s, u) => s + (bauxActifs.has(String(u.id)) ? (Number(u.price) || 0) : 0), 0);

      return `<div class="match-card">
        <div class="match-head">
          <strong>${escHtml(prop ? prop.name : 'Propriétaire non renseigné')}</strong>
          ${prop && prop.phone ? `<span class="item-meta">${escHtml(prop.phone)}</span>` : ''}
          <span class="src-badge src-site">${unites.length} logement(s) · ${loues} loué(s)</span>
        </div>
        <p class="item-meta">${loyers ? formatMoney(loyers) + ' FCFA de loyers en cours' : 'Aucun loyer en cours'}</p>
        <div class="list">
          ${immeubles.map(im => {
            const siens = logements.filter(u => String(u.parent_id) === String(im.id));
            const sl = siens.filter(u => bauxActifs.has(String(u.id))).length;
            return `<div class="list-item">
              <div><strong>${escHtml(im.title)}</strong>
                <div class="item-meta">${escHtml(im.district || im.address || '')} · ${siens.length} logement(s) · ${sl} loué(s)</div>
              </div>
              <div><button onclick="showBuilding(${Number(im.id)})" class="btn btn-outline">Ouvrir</button></div>
            </div>`;
          }).join('')}
          ${isoles.map(b => `<div class="list-item">
            <div><strong>${escHtml(b.title)}</strong>
              <div class="item-meta">Bien isolé · ${escHtml(b.district || '')} ${b.price ? '· ' + formatMoney(b.price) + ' FCFA' : ''}</div>
            </div>
            <div><span class="src-badge ${bauxActifs.has(String(b.id)) ? 'src-site' : 'src-crm'}">${bauxActifs.has(String(b.id)) ? 'Loué' : 'Libre'}</span></div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('') : `<div class="empty-state"><p><strong>Aucun bien enregistré.</strong></p>
      <p>Commence par créer un immeuble : tu décris sa composition une fois,
      et chaque logement devient une fiche que tu peux louer séparément.</p></div>`}
  `;
}

/* ─────────────── FICHE D'UN IMMEUBLE ─────────────── */

async function showBuilding(id) {
  UI.showLoading();
  const [properties, clients, leases] = await Promise.all([
    getAll('properties'), getAll('clients'), getAll('leases')
  ]);

  const im = properties.find(p => String(p.id) === String(id));
  if (!im) { mainContent.innerHTML = '<h2>Immeuble introuvable</h2>'; return; }

  const prop = clients.find(c => String(c.id) === String(im.landlord_id));
  const bailParBien = new Map(
    leases.filter(l => l.status === 'active').map(l => [String(l.property_id), l])
  );
  const parClient = new Map(clients.map(c => [String(c.id), c]));

  /* Ordre du bâtiment : étage puis libellé. Sans le tri sur l'entier `floor`,
     le 10e étage s'intercalerait entre le 1er et le 2e. */
  const unites = properties
    .filter(p => String(p.parent_id) === String(im.id))
    .sort((a, b) => (Number(a.floor) || 0) - (Number(b.floor) || 0)
                 || String(a.unit_label || '').localeCompare(String(b.unit_label || '')));

  const loues = unites.filter(u => bailParBien.has(String(u.id))).length;
  const loyersEnCours = unites.reduce((s, u) =>
    s + (bailParBien.has(String(u.id)) ? (Number(bailParBien.get(String(u.id)).rent_amount) || 0) : 0), 0);
  const potentiel = unites.reduce((s, u) => s + (Number(u.price) || 0), 0);

  /* Les logements groupés par étage, pour que la fiche se lise comme le
     bâtiment et non comme une liste à plat. */
  const etages = new Map();
  unites.forEach(u => {
    const e = Number(u.floor) || 0;
    if (!etages.has(e)) etages.set(e, []);
    etages.get(e).push(u);
  });

  mainContent.innerHTML = `
    <h2>${escHtml(im.title)}</h2>
    <p class="item-meta">${escHtml(im.address || '')}${im.district ? ' · ' + escHtml(im.district) : ''}</p>

    <div class="dashboard">
      <div class="card"><h3>Logements</h3><p class="metric">${unites.length}</p><small>${loues} loué(s) · ${unites.length - loues} libre(s)</small></div>
      <div class="card"><h3>Loyers en cours</h3><p class="metric">${formatMoney(loyersEnCours)}</p><small>FCFA par mois</small></div>
      <div class="card"><h3>Potentiel</h3><p class="metric">${formatMoney(potentiel)}</p><small>FCFA si tout est loué</small></div>
      <div class="card"><h3>Propriétaire</h3><p class="metric" style="font-size:1.1rem">${escHtml(prop ? prop.name : 'Non renseigné')}</p><small>${escHtml((prop && prop.phone) || '')}</small></div>
    </div>

    <div class="toolbar">
      <button onclick="showUnitForm(null, {parent_id:${Number(im.id)}}, ${Number(im.id)})" class="btn btn-primary">Ajouter un logement</button>
      <button onclick="showBuildingForm(${Number(im.id)})" class="ghost-btn">Modifier l'immeuble</button>
      <button onclick="showLandlords()" class="ghost-btn">Retour au portefeuille</button>
    </div>

    ${unites.length ? [...etages.keys()].sort((a, b) => a - b).map(e => `
      <h3>${floorLabel(e)}</h3>
      <div class="list">
        ${etages.get(e).map(u => {
          const bail = bailParBien.get(String(u.id));
          const loc = bail ? parClient.get(String(bail.tenant_id)) : null;
          return `<div class="list-item">
            <div>
              <strong>${escHtml(u.unit_label || u.title)}</strong>
              <span class="src-badge ${bail ? 'src-site' : 'src-crm'}">${bail ? 'Loué' : 'Libre'}</span>
              <div class="item-meta">${escHtml(unitSpec(u) || '—')}</div>
              <div class="item-meta">${bail
                ? formatMoney(bail.rent_amount) + ' FCFA/mois · ' + escHtml((loc && loc.name) || 'Locataire #' + bail.tenant_id)
                : (u.price ? formatMoney(u.price) + ' FCFA/mois demandés' : 'Loyer non renseigné')}</div>
            </div>
            <div>
              ${bail
                ? `<button onclick="showLeaseDetail(${Number(bail.id)})" class="btn btn-outline">Le bail</button>`
                : `<button onclick="showLeaseForm(null, {property_id:${Number(u.id)}, landlord_id:${Number(u.landlord_id) || 0}, rent_amount:${Number(u.price) || 0}})" class="btn btn-outline">Louer</button>`}
              <button onclick="editUnit(${Number(u.id)}, ${Number(im.id)})" class="edit-btn" title="Modifier le logement">${ICON_EDIT}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('')
      : `<div class="empty-state"><p><strong>Cet immeuble n'a aucun logement.</strong></p>
         <p>Modifie l'immeuble pour en décrire la composition, ou ajoute les logements un par un.</p></div>`}
  `;
}

/* ─────────────── CRÉATION D'UN IMMEUBLE, AVEC SA COMPOSITION ─────────────── */

async function showBuildingForm(id = null) {
  let im = null;
  if (id) {
    const rows = await getAll('properties');
    im = rows.find(p => String(p.id) === String(id)) || null;
  }
  const v = im || {};
  const editing = !!im;

  mainContent.innerHTML = `
    <h2>${editing ? "Modifier l'immeuble" : 'Nouvel immeuble'}</h2>
    <form id="building-form">
      <div class="form-group">
        <label for="b-title">Nom de l'immeuble :</label>
        <input type="text" id="b-title" value="${escAttr(v.title || '')}" required placeholder="Immeuble Makepe">
      </div>
      <div class="form-group">
        <label for="b-landlord">Propriétaire :</label>
        <select id="b-landlord"><option value="">Non renseigné</option></select>
        <small class="item-meta">Chaque logement créé en hérite, et peut ensuite le surcharger.</small>
      </div>
      <div class="form-group">
        <label for="b-address">Adresse :</label>
        <input type="text" id="b-address" value="${escAttr(v.address || '')}" required>
      </div>
      <div class="form-group">
        <label for="b-district">Quartier :</label>
        <input type="text" id="b-district" value="${escAttr(v.district || '')}" placeholder="Makepe">
      </div>
      <div class="form-group">
        <label for="b-notes">Description :</label>
        <textarea id="b-notes">${escHtml(v.description || '')}</textarea>
      </div>

      ${editing ? '' : `
      <h3>Composition</h3>
      <p class="item-meta">Les logements sont créés d'un coup, puis tu ajustes chacun —
      loyer, chambres, douches. Laisse à 0 pour créer l'immeuble seul et ajouter
      les logements un par un.</p>
      <div class="form-group">
        <label for="b-floors">Nombre d'étages (hors rez-de-chaussée) :</label>
        <input type="number" id="b-floors" min="0" max="30" value="2">
      </div>
      <div class="form-group">
        <label for="b-rdc">Logements au rez-de-chaussée :</label>
        <input type="number" id="b-rdc" min="0" max="20" value="0">
      </div>
      <div class="form-group">
        <label for="b-per-floor">Logements par étage :</label>
        <input type="number" id="b-per-floor" min="0" max="20" value="2">
      </div>
      <div class="form-group">
        <label for="b-unit-type">Type des logements :</label>
        <select id="b-unit-type">
          ${Object.keys(TYPE_FR).map(t => `<option value="${escAttr(t)}" ${t === 'apartment' ? 'selected' : ''}>${escHtml(TYPE_FR[t])}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="b-bed">Chambres par logement :</label>
        <input type="number" id="b-bed" min="0" max="10" value="2">
      </div>
      <div class="form-group">
        <label for="b-bath">Douches par logement :</label>
        <input type="number" id="b-bath" min="0" max="10" value="1">
      </div>
      <div class="form-group">
        <label for="b-rent">Loyer mensuel par défaut (FCFA) :</label>
        <input type="number" id="b-rent" min="0" value="" placeholder="Ajustable logement par logement">
      </div>`}

      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : "Créer l'immeuble"}</button>
      <button type="button" onclick="${editing ? 'showBuilding(' + Number(id) + ')' : 'showLandlords()'}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  populateSelect('b-landlord', 'clients', 'name', v.landlord_id);

  document.getElementById('building-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveBuilding(editing ? im.id : null);
  });
}

async function saveBuilding(id) {
  const titre = document.getElementById('b-title').value.trim();
  const immeuble = {
    title: titre,
    type: 'building',
    address: document.getElementById('b-address').value.trim(),
    district: document.getElementById('b-district').value.trim() || null,
    description: document.getElementById('b-notes').value || null,
    landlord_id: document.getElementById('b-landlord').value || null,
    rent_sale: 'rent',
    status: 'available'
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('properties').update(immeuble).eq('id', id);
      if (error) throw error;
      UI.toast('Immeuble mis à jour', 'success');
      showBuilding(id);
      return;
    }

    const { data, error } = await supabaseClient
      .from('properties').insert([immeuble]).select().single();
    if (error) throw error;

    const etages = Number(document.getElementById('b-floors').value) || 0;
    const auRdc = Number(document.getElementById('b-rdc').value) || 0;
    const parEtage = Number(document.getElementById('b-per-floor').value) || 0;

    const modele = {
      type: document.getElementById('b-unit-type').value,
      bedrooms: Number(document.getElementById('b-bed').value) || null,
      bathrooms: Number(document.getElementById('b-bath').value) || null,
      price: Number(document.getElementById('b-rent').value) || null
    };

    const unites = [];
    const poser = (etage, nb) => {
      for (let k = 1; k <= nb; k++) {
        const libelle = 'App ' + k;
        unites.push(Object.assign({}, modele, {
          parent_id: data.id,
          landlord_id: immeuble.landlord_id,
          floor: etage,
          unit_label: libelle,
          /* Le titre reste la désignation complète : c'est lui que cherche la
             barre de recherche des Propriétés, et « App 2 » seul n'y
             distinguerait pas deux immeubles. */
          title: unitTitle(titre, etage, libelle),
          address: immeuble.address,
          district: immeuble.district,
          rent_sale: 'rent',
          status: 'available',
          source: 'crm'
        }));
      }
    };
    poser(0, auRdc);
    for (let e = 1; e <= etages; e++) poser(e, parEtage);

    if (unites.length) {
      const { error: eu } = await supabaseClient.from('properties').insert(unites);
      /* L'immeuble est créé : un échec ici ne doit pas le perdre. On le dit,
         et l'agent ajoute les logements un par un depuis la fiche. */
      if (eu) {
        console.error('[immeubles] creation des logements:', eu);
        UI.toast('Immeuble créé, mais les logements ont échoué : ' + eu.message, 'error');
        showBuilding(data.id);
        return;
      }
    }

    UI.toast(unites.length
      ? 'Immeuble créé avec ' + unites.length + ' logement(s)'
      : 'Immeuble créé', 'success');
    showBuilding(data.id);
  } catch (e) {
    console.error('[immeubles] saveBuilding:', e);
    UI.handleError(e);
  }
}

/* ─────────────── UN LOGEMENT ───────────────

   Formulaire distinct de celui des biens : un logement HÉRITE de l'adresse et
   du quartier de son immeuble. Les redemander inviterait à les faire diverger,
   et il faudrait ensuite deviner lequel fait foi. */

async function editUnit(id, buildingId) {
  const rows = await getAll('properties');
  const u = rows.find(p => String(p.id) === String(id));
  if (u) showUnitForm(u, null, buildingId || u.parent_id);
}

function showUnitForm(unit = null, draft = null, buildingId = null) {
  const v = unit || draft || {};
  const editing = !!unit;
  const retour = 'showBuilding(' + Number(buildingId || v.parent_id || 0) + ')';

  mainContent.innerHTML = `
    <h2>${editing ? 'Modifier le' : 'Nouveau'} logement</h2>
    <form id="unit-form">
      <div class="form-group">
        <label for="u-label">Libellé :</label>
        <input type="text" id="u-label" value="${escAttr(v.unit_label || '')}" required placeholder="App 3, Porte gauche, Boutique A">
      </div>
      <div class="form-group">
        <label for="u-floor">Étage :</label>
        <input type="number" id="u-floor" min="0" max="30" value="${escAttr(v.floor != null ? v.floor : 0)}" required>
        <small class="item-meta">0 pour le rez-de-chaussée.</small>
      </div>
      <div class="form-group">
        <label for="u-type">Type :</label>
        <select id="u-type">
          ${Object.keys(TYPE_FR).map(t => `<option value="${escAttr(t)}" ${(v.type || 'apartment') === t ? 'selected' : ''}>${escHtml(TYPE_FR[t])}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="u-bed">Chambres :</label>
        <input type="number" id="u-bed" min="0" max="10" value="${escAttr(v.bedrooms != null ? v.bedrooms : '')}">
      </div>
      <div class="form-group">
        <label for="u-bath">Douches :</label>
        <input type="number" id="u-bath" min="0" max="10" value="${escAttr(v.bathrooms != null ? v.bathrooms : '')}">
      </div>
      <div class="form-group">
        <label for="u-price">Loyer mensuel demandé (FCFA) :</label>
        <input type="number" id="u-price" min="0" value="${escAttr(v.price || '')}">
        <small class="item-meta">Le loyer réellement convenu est porté par le bail.</small>
      </div>
      <div class="form-group">
        <label for="u-furnished">
          <input type="checkbox" id="u-furnished" ${v.furnished ? 'checked' : ''}> Meublé
        </label>
      </div>
      <div class="form-group">
        <label for="u-landlord">Propriétaire :</label>
        <select id="u-landlord"><option value="">Celui de l'immeuble</option></select>
        <small class="item-meta">À ne renseigner que si ce logement appartient à quelqu'un d'autre.</small>
      </div>
      <div class="form-group">
        <label for="u-desc">Description :</label>
        <textarea id="u-desc">${escHtml(v.description || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter le logement'}</button>
      <button type="button" onclick="${retour}" class="btn btn-outline">Annuler</button>
    </form>
  `;

  populateSelect('u-landlord', 'clients', 'name', v.landlord_id);
  document.getElementById('unit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveUnit(editing ? unit.id : null, buildingId || v.parent_id);
  });
}

async function saveUnit(id, buildingId) {
  try {
    const biens = await getAll('properties');
    const im = biens.find(p => String(p.id) === String(buildingId));

    const libelle = document.getElementById('u-label').value.trim();
    const etage = Number(document.getElementById('u-floor').value) || 0;

    const unite = {
      parent_id: buildingId || null,
      unit_label: libelle,
      floor: etage,
      type: document.getElementById('u-type').value,
      bedrooms: Number(document.getElementById('u-bed').value) || null,
      bathrooms: Number(document.getElementById('u-bath').value) || null,
      price: Number(document.getElementById('u-price').value) || null,
      furnished: document.getElementById('u-furnished').checked,
      description: document.getElementById('u-desc').value || null,
      /* Vide = celui de l'immeuble. On RECOPIE au lieu de laisser NULL : une
         requête « les biens de ce propriétaire » doit répondre sans avoir à
         remonter la chaîne des parents. */
      landlord_id: document.getElementById('u-landlord').value || (im ? im.landlord_id : null) || null,
      /* Hérités de l'immeuble, jamais saisis deux fois. */
      title: unitTitle(im ? im.title : '', etage, libelle),
      address: im ? im.address : '',
      district: im ? im.district : null,
      rent_sale: 'rent',
      source: 'crm'
    };
    if (!id) unite.status = 'available';

    if (id) {
      const { error } = await supabaseClient.from('properties').update(unite).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('properties').insert([unite]);
      if (error) throw error;
    }
    UI.toast('Logement enregistré', 'success');
    showBuilding(buildingId);
  } catch (e) {
    console.error('[immeubles] saveUnit:', e);
    UI.handleError(e);
  }
}


/* Bascule d'affichage des logements dans la liste generale des biens. */
function toggleUnits() {
  propsView.showUnits = !propsView.showUnits;
  const b = document.getElementById('units-toggle');
  if (b) b.textContent = (propsView.showUnits ? 'Masquer' : 'Afficher') + ' les logements';
  renderPropsList();
}

/* ═══════════════ RAPPELS DE GÉRANCE ═══════════════

   Trois cadences, demandées le 20/10/2026 :
     · échéance de loyer à venir  → prévenir 5 jours avant
     · fin de bail / renouvellement → prévenir 5 jours avant
     · loyer en retard            → relancer tous les 7 jours

   CE QUE CE N'EST PAS : des notifications poussées. Le CRM est un site
   statique, rien n'y tourne en arrière-plan — pas de tâche planifiée, pas de
   service worker. Ces alertes sont CALCULÉES à l'ouverture de l'écran. Tant
   que le CRM n'est pas ouvert, rien ne part. Le jour où un envoi automatique
   sera voulu, il faudra une fonction Edge déclenchée par un cron Supabase,
   et c'est un autre chantier.

   La cadence de 7 jours est RÉELLE et non cosmétique : elle s'appuie sur
   `payments.last_reminder_at`, posée à chaque relance envoyée (sql/11). Sans
   cette colonne on ne saurait que compter les jours depuis l'échéance, ce qui
   redemanderait une relance à chaque ouverture. */

const RENEWAL_NOTICE_DAYS = 5;
const RELANCE_EVERY_DAYS = 7;

/* Fonction PURE : elle reçoit la date du jour plutôt que de la lire, pour
   être vérifiable sans attendre le calendrier. */
function geranceAlerts(leases, payments, today) {
  const auj = today || new Date().toISOString().slice(0, 10);
  const baux = leases || [];
  const lignes = payments || [];

  /* ── Fins de bail ── */
  const renouvellements = [];
  baux.forEach(l => {
    if (l.status !== 'active' || !l.duration_months) return;
    const fin = leaseEnd(l.start_date, l.duration_months);
    const jours = daysUntil(fin, auj);
    if (jours === null || jours > RENEWAL_NOTICE_DAYS) return;
    renouvellements.push({ lease: l, fin: fin, jours: jours });
  });
  /* Le plus urgent d'abord : un bail déjà échu passe avant un bail qui finit
     dans cinq jours. */
  renouvellements.sort((a, b) => a.jours - b.jours);

  /* ── Loyers ── */
  const relances = [];
  const echeances = [];
  lignes.forEach(p => {
    if (!p.lease_id || p.status === 'paid') return;
    const jours = daysUntil(p.payment_date, auj);
    if (jours === null) return;

    if (jours < 0) {
      /* En retard. Relançable si on n'a jamais relancé, ou si la dernière
         relance remonte à au moins sept jours. */
      const depuis = p.last_reminder_at ? -daysUntil(p.last_reminder_at, auj) : null;
      if (depuis === null || depuis >= RELANCE_EVERY_DAYS) {
        relances.push({ payment: p, retard: -jours, depuis: depuis });
      }
    } else if (jours <= RENEWAL_NOTICE_DAYS) {
      echeances.push({ payment: p, jours: jours });
    }
  });
  relances.sort((a, b) => b.retard - a.retard);
  echeances.sort((a, b) => a.jours - b.jours);

  return { renouvellements: renouvellements, relances: relances, echeances: echeances };
}

/* Le bandeau, rendu en tête de l'écran Gérance. Rien si tout est calme :
   une alerte toujours présente cesse d'être lue. */
function geranceAlertBanner(alertes) {
  const r = alertes.renouvellements, rel = alertes.relances, ech = alertes.echeances;
  if (!r.length && !rel.length && !ech.length) return '';

  const bloc = [];

  if (rel.length) {
    bloc.push(`<p><strong>${rel.length} loyer(s) à relancer</strong>
      — jamais relancés, ou relancés il y a plus de ${RELANCE_EVERY_DAYS} jours.</p>`);
  }
  if (r.length) {
    const echus = r.filter(x => x.jours < 0).length;
    bloc.push(`<p><strong>${r.length} bail/baux à renouveler</strong>
      ${echus ? '— dont ' + echus + ' déjà échu(s)' : '— sous ' + RENEWAL_NOTICE_DAYS + ' jours'}.</p>`);
  }
  if (ech.length) {
    bloc.push(`<p>${ech.length} échéance(s) de loyer dans les ${RENEWAL_NOTICE_DAYS} jours.</p>`);
  }

  return `<div class="alert-match">${bloc.join('')}
    <p class="item-meta">Calculé à l'ouverture de cet écran : rien ne part tout seul.</p>
  </div>`;
}
