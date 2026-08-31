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
  if (btn) btn.classList.add('active');
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
    <h2>🤖 Automatisation & Suggestions</h2>

    <div class="automation-section">
      <h3>📝 Templates de Messages</h3>
      <div class="templates-grid">
        <div class="template-card">
          <h4>WhatsApp - Message général</h4>
          <p class="template-text">${messageTemplates.whatsapp.general}</p>
          <button onclick="copyTemplate('whatsapp', 'general')">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Relance</h4>
          <p class="template-text">${messageTemplates.whatsapp.followup}</p>
          <button onclick="copyTemplate('whatsapp', 'followup')">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Rappel visite</h4>
          <p class="template-text">${messageTemplates.whatsapp.visit_reminder}</p>
          <button onclick="copyTemplate('whatsapp', 'visit_reminder')">Copier</button>
        </div>
        <div class="template-card">
          <h4>WhatsApp - Rappel paiement</h4>
          <p class="template-text">${messageTemplates.whatsapp.payment_reminder}</p>
          <button onclick="copyTemplate('whatsapp', 'payment_reminder')">Copier</button>
        </div>
      </div>
    </div>

    <div class="automation-section">
      <h3>🚀 Actions Automatiques Suggérées</h3>
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
    container.innerHTML = '<p class="no-suggestions">🎉 Aucune action automatique nécessaire pour le moment !</p>';
    return;
  }

  container.innerHTML = `
    <div class="suggestions-list">
      ${suggestions.map((suggestion, index) => `
        <div class="suggestion-item ${suggestion.priority}">
          <div class="suggestion-header">
            <span class="priority-badge ${suggestion.priority}">${suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🟢'}</span>
            <span class="suggestion-type">${getSuggestionTypeLabel(suggestion.type)}</span>
          </div>
          <div class="suggestion-content">
            <p>${suggestion.message}</p>
            <div class="suggestion-actions">
              <button onclick="executeSuggestion(${index})" class="action-btn">📱 WhatsApp</button>
              <button onclick="createActivityFromSuggestion(${index})" class="action-btn secondary">📝 Activité</button>
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

async function showDashboard() {
  // Récupération des données de base
  const newRequests = await getStatusCount('clients', 'nouvelle demande');
  const visits = await getStatusCount('clients', 'visite');
  const negotiations = await getStatusCount('clients', 'négociation');
  const signed = await getStatusCount('clients', 'signé');
  const paymentsCount = await getCount('payments');

  // Données pour métriques avancées
  const allClients = await getAll('clients');
  const allPayments = await getAll('payments');
  const allProperties = await getAll('properties');

  // Calculs des métriques
  const totalRevenue = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const conversionRate = allClients.length > 0 ? ((signed / allClients.length) * 100).toFixed(1) : 0;
  const avgPropertyPrice = allProperties.length > 0 ?
    (allProperties.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0) / allProperties.length).toFixed(0) : 0;

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

  const recentActivities = await getRecent('activities', 5);
  const recentTasks = await getRecent('tasks', 5);
  const recentClients = await getRecent('clients', 5);

  mainContent.innerHTML = `
    <h2>Tableau de bord</h2>

    <!-- Métriques principales -->
    <div class="dashboard">
      <div class="card highlight">
        <h3>💰 Chiffre d'Affaires</h3>
        <p class="metric">${totalRevenue.toLocaleString()} FCFA</p>
        <small>Total des paiements</small>
      </div>
      <div class="card">
        <h3>📈 Taux de Conversion</h3>
        <p class="metric">${conversionRate}%</p>
        <small>Clients signés / Total clients</small>
      </div>
      <div class="card">
        <h3>🏠 Prix Moyen</h3>
        <p class="metric">${parseInt(avgPropertyPrice).toLocaleString()} FCFA</p>
        <small>Prix moyen des propriétés</small>
      </div>
      <div class="card">
        <h3>👥 Total Clients</h3>
        <p class="metric">${allClients.length}</p>
        <small>Clients actifs</small>
      </div>
    </div>

    <!-- Graphiques -->
    <div class="dashboard-charts">
      <div class="chart-container">
        <h3>📊 Pipeline de Vente</h3>
        <canvas id="statusChart" width="400" height="200"></canvas>
      </div>
      <div class="chart-container">
        <h3>🎯 Sources de Leads</h3>
        <canvas id="sourceChart" width="400" height="200"></canvas>
      </div>
    </div>

    <!-- Alertes -->
    ${overduePayments.length > 0 ? `
    <div class="alerts">
      <h3>⚠️ Alertes</h3>
      <div class="alert alert-warning">
        <strong>${overduePayments.length} paiement(s) en retard</strong>
        <p>Vérifiez les paiements en attente depuis plus de 7 jours.</p>
      </div>
    </div>
    ` : ''}

    <!-- Sections existantes -->
    <div class="dashboard-sections">
      <div class="list">
        <h3>👤 Clients récents</h3>
        ${recentClients.length ? recentClients.map(c => `<div class="list-item"><span>${c.name}</span><span>${formatDate(c.created_at)}</span></div>`).join('') : '<p>Aucun client récent.</p>'}
      </div>
      <div class="list">
        <h3>📅 Activités récentes</h3>
        ${recentActivities.map(a => `<div class="list-item"><span>${getActivityLabel(a.type)} - ${a.notes}</span><span>${new Date(a.date).toLocaleDateString()}</span></div>`).join('')}
      </div>
      <div class="list">
        <h3>✅ Tâches récentes</h3>
        ${recentTasks.map(t => `<div class="list-item"><span>${t.title}</span><span>${t.status}</span></div>`).join('')}
      </div>
    </div>
  `;

  // Initialisation des graphiques
  setTimeout(() => {
    initCharts(statusData, statusLabels, sourceStats);
  }, 100);
}

function initCharts(statusData, statusLabels, sourceStats) {
  // Graphique du pipeline
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    new Chart(statusCtx, {
      type: 'bar',
      data: {
        labels: statusLabels,
        datasets: [{
          label: 'Nombre de clients',
          data: statusData,
          backgroundColor: [
            '#ffeaa7', // nouvelles demandes
            '#74b9ff', // visites
            '#fdcb6e', // négociations
            '#55efc4'  // signés
          ],
          borderColor: [
            '#d63031',
            '#0984e3',
            '#e17055',
            '#00b894'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  // Graphique des sources
  const sourceCtx = document.getElementById('sourceChart');
  if (sourceCtx) {
    new Chart(sourceCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(sourceStats),
        datasets: [{
          data: Object.values(sourceStats),
          backgroundColor: [
            '#f59a23',
            '#25d366',
            '#e74c3c',
            '#9b59b6',
            '#3498db',
            '#95a5a6'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

async function showClients() {
  UI.showLoading();
  const clients = await getAll('clients');
  window._clients = clients;
  mainContent.innerHTML = `
    <h2>Clients</h2>
    <div class="toolbar">
      <input type="search" id="client-search" class="search-input" placeholder="Rechercher : nom, téléphone, statut, source…">
      <button onclick="showClientForm()">Ajouter Client</button>
      <button onclick="exportCSV('clients')" class="ghost-btn">Export CSV</button>
    </div>
    <div class="list" id="client-list">
      ${clients.length ? clients.map(c => `<div class="list-item"><div><strong>${c.name}</strong> - ${c.phone} <span class="status-badge" data-status="${c.status || 'nouvelle demande'}">${c.status || 'nouvelle demande'}</span></div><div class="item-meta">Source: ${c.source || 'Non renseignée'}${c.source_detail ? ' (' + c.source_detail + ')' : ''}</div><div class="item-meta">${formatDate(c.created_at)}</div><div><a href="${getWhatsApp(c.phone, c, 'general')}" target="_blank" class="whatsapp-btn" title="WhatsApp général"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg></a><a href="${getWhatsApp(c.phone, c, 'followup')}" target="_blank" class="relance whatsapp-btn" title="Relance WhatsApp"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></a><button onclick="editClient(${c.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div></div>`).join('') : '<p>Aucun client pour le moment.</p>'}
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
        <input type="text" id="client-name" value="${(client && client.name) || ''}" required>
      </div>
      <div class="form-group">
        <label>Téléphone:</label>
        <input type="tel" id="client-phone" value="${(client && client.phone) || ''}">
      </div>
      <div class="form-group">
        <label>Email:</label>
        <input type="email" id="client-email" value="${(client && client.email) || ''}">
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
        <input type="text" id="client-source-detail" value="${client ? (client.source_detail || '') : ''}">
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
      <fieldset class="demand-block">
        <legend>Sa recherche <span class="item-meta">— alimente les rapprochements</span></legend>
        <div class="form-group">
          <label>Transaction:</label>
          <select id="client-rentsale">
            <option value="">Déduire du type de client</option>
            <option value="rent" ${client && client.rent_sale === 'rent' ? 'selected' : ''}>Location</option>
            <option value="sale" ${client && client.rent_sale === 'sale' ? 'selected' : ''}>Achat</option>
          </select>
        </div>
        <div class="form-group">
          <label>Types recherchés <span class="item-meta">(Ctrl / Cmd pour plusieurs)</span></label>
          <select id="client-types" multiple size="5">
            ${Object.keys(DEMAND_TYPE_FR).map(t => `<option value="${t}" ${client && (client.wanted_types || []).indexOf(t) !== -1 ? 'selected' : ''}>${DEMAND_TYPE_FR[t]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Quartiers visés:</label>
          <select id="client-districts" multiple size="5">
            ${DEMAND_DISTRICTS.map(d => `<option value="${d}" ${client && (client.wanted_districts || []).indexOf(d) !== -1 ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Budget maximum (FCFA):</label>
          <input type="number" id="client-budget" value="${client && client.budget ? client.budget : ''}" placeholder="Loyer mensuel ou prix de vente">
        </div>
        <div class="form-group">
          <label>Chambres minimum:</label>
          <input type="number" id="client-bedrooms" min="0" value="${client && client.min_bedrooms ? client.min_bedrooms : ''}">
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="client-furnished" ${client && client.wants_furnished ? 'checked' : ''}> Meublé exigé</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="client-matching" ${!client || client.matching_active !== false ? 'checked' : ''}> Actif dans les rapprochements</label>
        </div>
      </fieldset>

      <div class="form-group">
        <label>Notes:</label>
        <textarea id="client-notes">${(client && client.notes) || ''}</textarea>
      </div>
      <button type="submit">${client ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showClients()">Annuler</button>
    </form>
  `;

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
    notes: document.getElementById('client-notes').value,

    /* Critères de recherche — null quand non renseigné, jamais 0 ni ''.
       Un 0 serait interprété comme « budget nul » et bloquerait tout. */
    rent_sale: document.getElementById('client-rentsale').value || null,
    wanted_types: multiVals('client-types'),
    wanted_districts: multiVals('client-districts'),
    budget: numOrNull('client-budget'),
    min_bedrooms: numOrNull('client-bedrooms'),
    wants_furnished: document.getElementById('client-furnished').checked ? true : null,
    matching_active: document.getElementById('client-matching').checked
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('clients').update(client).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('clients').insert([client]);
      if (error) throw error;
    }
    showClients();
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

/* Valeurs strictement alignées sur la base du site : une divergence
   d'orthographe ne produit aucune erreur, elle rend simplement le
   rapprochement muet. */
const DEMAND_TYPE_FR = {
  apartment: 'Appartement', studio: 'Studio', villa: 'Villa', house: 'Maison',
  duplex: 'Duplex', building: 'Immeuble', 'plots-of-land': 'Terrain',
  warehouse: 'Entrepôt', office: 'Bureau', shop: 'Boutique', commercial: 'Local commercial'
};
const DEMAND_DISTRICTS = ['Bonapriso','Bali','Bonanjo','Bonamoussadi','Makepe','Logpom',
  'Logbessou','Akwa','Deido','Kotto','Bonabéri','Yassa','Bonadiwoto','Youpwe','Ndogbong'];

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
      <button onclick="showPropertyForm()">Ajouter</button>
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
      ? `<a href="https://selogercm.com/annonce/${slug}" target="_blank" rel="noopener" class="ghost-btn" title="Voir l'annonce en ligne">Voir</a>`
      : '';
    /* Partage : uniquement pour un bien ayant une page publique.
       Une fiche purement interne n'a pas d'URL à envoyer. */
    const sid = p._siteId || p.listing_id;
    const share = (slug && sid)
      ? `<button onclick="shareListing('${sid}')" class="ghost-btn share-btn" title="Partager à un client">Partager</button>`
      : '';
    const action = p.id
      ? `<button onclick="editProperty(${p.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>`
      : `<button onclick="importListing('${p._siteId}')" class="edit-btn" title="Créer une fiche CRM pour ce bien">+ Fiche</button>`;
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
  const scored = clients.map(c => {
    const r = window.SLCM_MATCH.hasDemand(c) ? window.SLCM_MATCH.evaluate(listing, c) : null;
    return { c, score: r ? r.score : 0, fit: !!r };
  }).sort((a, b) => b.score - a.score || String(a.c.name || '').localeCompare(String(b.c.name || '')));

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="item-meta">${escHtml(listing.title || '')} — ${Number(listing.price) > 0 ? Number(listing.price).toLocaleString('fr-FR') + ' FCFA' : 'prix sur demande'}</p>
    <input type="search" id="pick-search" class="search-input" placeholder="Filtrer les clients…" style="margin:.6rem 0;width:100%">
    <div class="pick-list" id="pick-list">
      ${scored.map(({ c, score, fit }) => `
        <label class="pick-row"${c.phone ? '' : ' title="Pas de numéro : envoi impossible"'}>
          <input type="checkbox" value="${c.id}"${c.phone ? '' : ' disabled'}>
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


/* ═══════════════ MATCHING ═══════════════ */

async function showMatching() {
  UI.showLoading();

  const [clients, listings, sent] = await Promise.all([
    getAll('clients'),
    window.SLCM_SITE.fetchListings(),
    window.SLCM_MATCH.loadShared()
  ]);

  const withDemand = clients.filter(window.SLCM_MATCH.hasDemand);
  const matches = window.SLCM_MATCH.computeMatches(clients, listings, sent);

  /* Cas fréquent au démarrage : des clients existent mais aucun ne porte
     de critère. Le dire explicitement évite de croire à un bug. */
  if (!withDemand.length) {
    mainContent.innerHTML = `
      <h2>Rapprochements</h2>
      <div class="empty-state">
        <p><strong>Aucune demande enregistrée.</strong></p>
        <p>Le rapprochement compare ce que cherchent vos clients aux
        ${listings.length} annonces publiées sur selogercm.com. Pour qu'il
        fonctionne, ouvrez une fiche client et renseignez au moins un critère :
        budget, quartier, type de bien ou nombre de chambres.</p>
        <button onclick="showClients()">Ouvrir les clients</button>
      </div>`;
    return;
  }

  window._matchCache = { listings, matches };

  mainContent.innerHTML = `
    <h2>Rapprochements</h2>
    <p class="item-meta">${withDemand.length} client(s) avec une demande · ${listings.length} annonce(s) en ligne · ${matches.length} client(s) avec au moins une correspondance</p>
    ${matches.length ? matches.map((m, mi) => `
      <div class="match-card">
        <div class="match-head">
          <strong>${escHtml(m.client.name || 'Sans nom')}</strong>
          <span class="item-meta">${escHtml(demandLabel(m.client))}</span>
          <span class="src-badge src-site">${m.total} bien(s)</span>
        </div>
        <div class="list">
          ${m.hits.map((h, hi) => `
            <div class="list-item">
              <div><strong>${escHtml(h.listing.title || 'Sans titre')}</strong>
                <span class="src-badge src-site">${h.score}%</span></div>
              <div class="item-meta">${escHtml([h.listing.district, h.listing.city].filter(Boolean).join(', '))} — ${Number(h.listing.price) > 0 ? Number(h.listing.price).toLocaleString('fr-FR') + ' FCFA' : 'prix sur demande'}</div>
              <div class="item-meta">${escHtml(h.reasons.join(' · '))}</div>
              <div>
                ${h.listing.slug ? `<a href="https://selogercm.com/annonce/${h.listing.slug}" target="_blank" rel="noopener" class="ghost-btn">Voir</a>` : ''}
                <button onclick="sendMatch(${mi},${hi})" class="ghost-btn share-btn">Envoyer</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')
      : `<div class="empty-state"><p><strong>Aucune correspondance actuellement.</strong></p>
         <p>Les critères de vos clients ne trouvent pas d'écho dans le stock en ligne,
         ou les biens correspondants leur ont déjà été envoyés.</p></div>`}
  `;
}

/* Libellé lisible de la demande, affiché sous le nom du client */
function demandLabel(c) {
  const bits = [];
  const tx = window.SLCM_MATCH.wantedTransaction(c);
  if (tx) bits.push(tx === 'rent' ? 'location' : 'achat');
  if (c.wanted_types && c.wanted_types.length) bits.push(c.wanted_types.join('/'));
  if (c.wanted_districts && c.wanted_districts.length) bits.push(c.wanted_districts.join(', '));
  if (c.min_bedrooms) bits.push(c.min_bedrooms + '+ ch.');
  if (c.budget) bits.push('≤ ' + Number(c.budget).toLocaleString('fr-FR') + ' FCFA');
  if (c.wants_furnished) bits.push('meublé');
  return bits.join(' · ') || 'critères partiels';
}

/* Envoi d'un match : WhatsApp s'ouvre, la trace est enregistrée,
   et le bien disparaît des propositions suivantes pour ce client. */
async function sendMatch(mi, hi) {
  const m = window._matchCache && window._matchCache.matches[mi];
  if (!m) return;
  const h = m.hits[hi];
  if (!h) return;
  if (!m.client.phone) { UI.toast('Ce client n\'a pas de numéro.', 'error'); return; }
  sendWhatsApp(m.client.phone, window.SLCM_MATCH.shareMessage(h.listing, m.client));
  await window.SLCM_MATCH.markShared(m.client.id, h.listing);
  UI.toast('Envoyé à ' + (m.client.name || 'ce client') + '.', 'success');
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
  mainContent.innerHTML = `
    <h2>${property ? 'Modifier' : 'Ajouter'} Propriété</h2>
    <form id="property-form">
      <div class="form-group">
        <label>Titre:</label>
        <input type="text" id="property-title" value="${(property && property.title) || ''}" required>
      </div>
      <div class="form-group">
        <label>Adresse:</label>
        <input type="text" id="property-address" value="${(property && property.address) || ''}" required>
      </div>
      <div class="form-group">
        <label>Type:</label>
        <select id="property-type">
          <option value="house" ${property && property.type === 'house' ? 'selected' : ''}>Maison</option>
          <option value="apartment" ${property && property.type === 'apartment' ? 'selected' : ''}>Appartement</option>
        </select>
      </div>
      <div class="form-group">
        <label>Prix (FCFA):</label>
        <input type="number" id="property-price" value="${(property && property.price) || ''}">
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="property-status">
          <option value="available" ${property && property.status === 'available' ? 'selected' : ''}>Disponible</option>
          <option value="sold" ${property && property.status === 'sold' ? 'selected' : ''}>Vendu</option>
          <option value="rented" ${property && property.status === 'rented' ? 'selected' : ''}>Loué</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="property-description">${(property && property.description) || ''}</textarea>
      </div>
      <button type="submit">${property ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showProperties()">Annuler</button>
    </form>
  `;

  document.getElementById('property-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProperty(property ? property.id : null);
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
    <button onclick="showActivityForm()">Ajouter Activité</button>
    <div class="list">
      ${activities.length ? activities.map(a => `<div class="list-item"><div><strong>${getActivityLabel(a.type)}</strong> - ${a.notes}</div><div>${new Date(a.date).toLocaleDateString()}</div><div><button onclick="editActivity(${a.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div></div>`).join('') : '<p>Aucune activité pour le moment.</p>'}
    </div>
  `;
}

function showActivityForm(activity = null) {
  mainContent.innerHTML = `
    <h2>${activity ? 'Modifier' : 'Ajouter'} Activité</h2>
    <form id="activity-form">
      <div class="form-group">
        <label>Type:</label>
        <select id="activity-type">
          <option value="call" ${activity && activity.type === 'call' ? 'selected' : ''}>Appel</option>
          <option value="meeting" ${activity && activity.type === 'meeting' ? 'selected' : ''}>Rendez-vous</option>
          <option value="email" ${activity && activity.type === 'email' ? 'selected' : ''}>Email</option>
          <option value="visit" ${activity && activity.type === 'visit' ? 'selected' : ''}>Visite</option>
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
        <textarea id="activity-notes" required>${(activity && activity.notes) || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Date:</label>
        <input type="date" id="activity-date" value="${(activity && activity.date) || new Date().toISOString().split('T')[0]}" required>
      </div>
      <button type="submit">${activity ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showActivities()">Annuler</button>
    </form>
  `;

  // Options + sélection courante, posées ensemble une fois les données là
  populateSelect('activity-client', 'clients', 'name', activity && activity.client_id);
  populateSelect('activity-property', 'properties', 'title', activity && activity.property_id);

  document.getElementById('activity-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveActivity(activity ? activity.id : null);
  });
}

async function saveActivity(id) {
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
    showActivities();
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
    <button onclick="showTaskForm()">Ajouter Tâche</button>
    <div class="list">
      ${tasks.length ? tasks.map(t => `<div class="list-item"><div><strong>${t.title}</strong> - ${t.status}</div><div class="item-meta">Créé le ${formatDate(t.created_at)}</div><button onclick="editTask(${t.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div>`).join('') : '<p>Aucune tâche pour le moment.</p>'}
    </div>
  `;
}

function showTaskForm(task = null) {
  mainContent.innerHTML = `
    <h2>${task ? 'Modifier' : 'Ajouter'} Tâche</h2>
    <form id="task-form">
      <div class="form-group">
        <label>Titre:</label>
        <input type="text" id="task-title" value="${(task && task.title) || ''}" required>
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="task-description">${(task && task.description) || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Date d'échéance:</label>
        <input type="date" id="task-due-date" value="${(task && task.due_date) || ''}">
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="task-status">
          <option value="pending" ${task && task.status === 'pending' ? 'selected' : ''}>En attente</option>
          <option value="completed" ${task && task.status === 'completed' ? 'selected' : ''}>Terminée</option>
        </select>
      </div>
      <button type="submit">${task ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showTasks()">Annuler</button>
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
    'nouvelle demande': '🆕 Nouvelles Demandes',
    'visite': '👁️ Visites',
    'négociation': '💬 Négociation',
    'signé': '✅ Signés'
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
    <h2>📊 Pipeline de Vente</h2>
    
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
        <span class="stat-value">${(grouped['signé']?.length || 0).toLocaleString()} signés</span>
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
              <div class="pipeline-card" draggable="true" data-client-id="${client.id}" data-status="${stage}" onclick="viewClientDetails(${client.id})">
                <div class="card-header">
                  <strong>${client.name}</strong>
                  <span class="status-indicator"></span>
                </div>
                <div class="card-body">
                  <p class="card-phone">${client.phone || 'N/A'}</p>
                  <p class="card-source">${client.source || 'Non renseignée'}</p>
                  <div class="card-date">${formatDate(client.created_at)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="pipeline-help">
      <p>💡 Glissez-déposez les cartes pour avancer les clients dans le pipeline</p>
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
    const client = await getById('clients', clientId);
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
async function getCount(table) {
  const { count, error } = await supabaseClient.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`Erreur Supabase table ${table}:`, error.message);
    return 0;
  }
  return count || 0;
}

/* Colonnes explicites : select('*') tirait toutes les colonnes de chaque
   table à chaque affichage, y compris les champs texte longs jamais utilisés
   dans les listes. Sur une connexion mobile, c'est du volume inutile. */
const TABLE_COLS = {
  clients:    'id,name,phone,email,type,status,source,source_detail,notes,created_at,budget,budget_min,rent_sale,wanted_types,wanted_districts,min_bedrooms,wants_furnished,matching_active',
  properties: 'id,title,address,type,price,status,description,listing_id,listing_slug,source,created_at',
  activities: 'id,type,client_id,property_id,notes,date,created_at',
  tasks:      'id,title,description,due_date,status,created_at',
  payments:   'id,client_id,property_id,amount,accompte,reste,status,payment_date,notes,created_at'
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

async function getStatusCount(table, status) {
  const { count, error } = await supabaseClient.from(table).select('*', { count: 'exact', head: true }).eq('status', status);
  if (error) {
    console.error(`Erreur Supabase status ${status}:`, error.message);
    return 0;
  }
  return count || 0;
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

function getPaymentStatusLabel(status) {
  switch (status) {
    case 'pending': return 'En attente';
    case 'accompte': return 'Accompte';
    case 'reste': return 'Reste';
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
    <button onclick="showPaymentForm()">Ajouter Paiement</button>
    <div class="list">
      ${payments.length ? payments.map(p => `<div class="list-item"><div><strong>${p.amount} FCFA</strong> - ${getPaymentStatusLabel(p.status)}</div><div>${findName(p.client_id, clients) || 'Client #' + p.client_id} / ${findName(p.property_id, properties) || 'Propriété #' + p.property_id}</div><div class="item-meta">Créé le ${formatDate(p.created_at)}</div><button onclick="editPayment(${p.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div>`).join('') : '<p>Aucun paiement pour le moment.</p>'}
    </div>
  `;
}

function showPaymentForm(payment = null) {
  mainContent.innerHTML = `
    <h2>${payment ? 'Modifier' : 'Ajouter'} Paiement</h2>
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
        <input type="number" id="payment-amount" value="${(payment && payment.amount) || ''}" required>
      </div>
      <div class="form-group">
        <label>Statut:</label>
        <select id="payment-status">
          <option value="pending" ${payment && payment.status === 'pending' ? 'selected' : ''}>En attente</option>
          <option value="accompte" ${payment && payment.status === 'accompte' ? 'selected' : ''}>Accompte</option>
          <option value="reste" ${payment && payment.status === 'reste' ? 'selected' : ''}>Reste</option>
          <option value="paid" ${payment && payment.status === 'paid' ? 'selected' : ''}>Payé</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date de paiement:</label>
        <input type="date" id="payment-date" value="${(payment && payment.payment_date) || new Date().toISOString().split('T')[0]}" required>
      </div>
      <div class="form-group">
        <label>Notes:</label>
        <textarea id="payment-notes">${(payment && payment.notes) || ''}</textarea>
      </div>
      <button type="submit">${payment ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showPayments()">Annuler</button>
    </form>
  `;

  populateSelect('payment-client', 'clients', 'name', payment && payment.client_id);
  populateSelect('payment-property', 'properties', 'title', payment && payment.property_id);

  document.getElementById('payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    savePayment(payment ? payment.id : null);
  });
}

async function savePayment(id) {
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
    showPayments();
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
