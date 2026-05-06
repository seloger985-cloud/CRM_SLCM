// Supabase configuration - Replace with your actual URL and key
const SUPABASE_URL = 'https://dukwtseqticijlvrmkgz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1a3d0c2VxdGljaWpsdnJta2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTYzMDIsImV4cCI6MjA5MzU5MjMwMn0.u-FH3WhZxIpE9uJtTDF1IWOOht-ooPgAqwsnyZmUNa4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('Mini CRM Immobilier : app.js chargé');

// DOM elements
const mainContent = document.getElementById('main-content');
const dashboardBtn = document.getElementById('dashboard-btn');
const clientsBtn = document.getElementById('clients-btn');
const propertiesBtn = document.getElementById('properties-btn');
const activitiesBtn = document.getElementById('activities-btn');
const paymentsBtn = document.getElementById('payments-btn');
const tasksBtn = document.getElementById('tasks-btn');
const automationBtn = document.getElementById('automation-btn');
const pipelineBtn = document.getElementById('pipeline-btn');

// Event listeners
dashboardBtn.addEventListener('click', showDashboard);
clientsBtn.addEventListener('click', showClients);
propertiesBtn.addEventListener('click', showProperties);
activitiesBtn.addEventListener('click', showActivities);
paymentsBtn.addEventListener('click', showPayments);
tasksBtn.addEventListener('click', showTasks);
automationBtn.addEventListener('click', showAutomation);
pipelineBtn.addEventListener('click', showPipeline);

// Initialize
mainContent.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
showDashboard();

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

// Fonction pour envoyer WhatsApp (ouvre le lien)
function sendWhatsApp(phone, message) {
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodedMessage}`;
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
    alert('Template copié dans le presse-papiers !');
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

    alert('Activité de relance créée !');
    showAutomation(); // Rafraîchir
  } catch (error) {
    console.error('Erreur lors de la création de l\'activité:', error);
    alert('Erreur : ' + (error.message || error.toString()));
  }
}

// Initialize
mainContent.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
showDashboard();
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

async function showClients() {
  const clients = await getAll('clients');
  mainContent.innerHTML = `
    <h2>Clients</h2>
    <button onclick="showClientForm()">Ajouter Client</button>
    <div class="list">
      ${clients.length ? clients.map(c => `<div class="list-item"><div><strong>${c.name}</strong> - ${c.phone} <span class="status-badge" data-status="${c.status || 'nouvelle demande'}">${c.status || 'nouvelle demande'}</span></div><div class="item-meta">Source: ${c.source || 'Non renseignée'}${c.source_detail ? ' (' + c.source_detail + ')' : ''}</div><div class="item-meta">${formatDate(c.created_at)}</div><div><a href="${getWhatsApp(c.phone, c, 'general')}" target="_blank" class="whatsapp-btn" title="WhatsApp général"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg></a><a href="${getWhatsApp(c.phone, c, 'followup')}" target="_blank" class="relance whatsapp-btn" title="Relance WhatsApp"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></a><button onclick="editClient(${c.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div></div>`).join('') : '<p>Aucun client pour le moment.</p>'}
    </div>
  `;
}

function showClientForm(client = null) {
  mainContent.innerHTML = `
    <h2>${client ? 'Modifier' : 'Ajouter'} Client</h2>
    <form id="client-form">
      <div class="form-group">
        <label>Nom:</label>
        <input type="text" id="client-name" value="${client ? client.name : ''}" required>
      </div>
      <div class="form-group">
        <label>Téléphone:</label>
        <input type="tel" id="client-phone" value="${client ? client.phone : ''}">
      </div>
      <div class="form-group">
        <label>Email:</label>
        <input type="email" id="client-email" value="${client ? client.email : ''}">
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
      <div class="form-group">
        <label>Notes:</label>
        <textarea id="client-notes">${client ? client.notes : ''}</textarea>
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
    notes: document.getElementById('client-notes').value
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
    alert('Erreur : ' + (error.message || error.toString()));
  }
}

function toggleClientSourceDetail() {
  const source = document.getElementById('client-source').value;
  const detailGroup = document.getElementById('client-source-detail-group');
  if (detailGroup) {
    detailGroup.style.display = source === 'autres' ? 'block' : 'none';
  }
}

async function showProperties() {
  const properties = await getAll('properties');
  mainContent.innerHTML = `
    <h2>Propriétés</h2>
    <button onclick="showPropertyForm()">Ajouter Propriété</button>
    <div class="list">
      ${properties.length ? properties.map(p => `<div class="list-item"><div><strong>${p.title}</strong> - ${p.address} - ${p.price} FCFA</div><div class="item-meta">${formatDate(p.created_at)}</div><button onclick="editProperty(${p.id})" class="edit-btn" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div>`).join('') : '<p>Aucune propriété pour le moment.</p>'}
    </div>
  `;
}

function showPropertyForm(property = null) {
  mainContent.innerHTML = `
    <h2>${property ? 'Modifier' : 'Ajouter'} Propriété</h2>
    <form id="property-form">
      <div class="form-group">
        <label>Titre:</label>
        <input type="text" id="property-title" value="${property ? property.title : ''}" required>
      </div>
      <div class="form-group">
        <label>Adresse:</label>
        <input type="text" id="property-address" value="${property ? property.address : ''}" required>
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
        <input type="number" id="property-price" value="${property ? property.price : ''}">
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
        <textarea id="property-description">${property ? property.description : ''}</textarea>
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
    price: document.getElementById('property-price').value,
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
    alert('Erreur : ' + (error.message || error.toString()));
  }
}

async function showActivities() {
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
        <textarea id="activity-notes" required>${activity ? activity.notes : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Date:</label>
        <input type="date" id="activity-date" value="${activity ? activity.date : new Date().toISOString().split('T')[0]}" required>
      </div>
      <button type="submit">${activity ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showActivities()">Annuler</button>
    </form>
  `;

  // Populate client and property options
  populateSelect('activity-client', 'clients', 'name');
  populateSelect('activity-property', 'properties', 'title');

  if (activity && activity.client_id) {
    document.getElementById('activity-client').value = activity.client_id;
  }
  if (activity && activity.property_id) {
    document.getElementById('activity-property').value = activity.property_id;
  }

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
    alert('Erreur : ' + (error.message || error.toString()));
  }
}

async function editActivity(id) {
  const activity = await getById('activities', id);
  if (!activity) {
    alert('Activité non trouvée');
    return;
  }
  showActivityForm(activity);
}

async function showTasks() {
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
        <input type="text" id="task-title" value="${task ? task.title : ''}" required>
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea id="task-description">${task ? task.description : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Date d'échéance:</label>
        <input type="date" id="task-due-date" value="${task ? task.due_date : ''}">
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
    due_date: document.getElementById('task-due-date').value,
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
    alert('Erreur : ' + (error.message || error.toString()));
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
    alert('Erreur : ' + (error.message || error.toString()));
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

async function getAll(table) {
  const { data, error } = await supabaseClient.from(table).select('*').order('created_at', { ascending: false });
  if (error) {
    console.error(`Erreur Supabase table ${table}:`, error.message);
    return [];
  }
  return data || [];
}

async function getRecent(table, limit) {
  const { data, error } = await supabaseClient.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
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

function getWhatsApp(phone, client, messageType = 'general') {
  let clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '#';
  if (!clean.startsWith('237')) clean = '237' + clean;

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

  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

async function populateSelect(selectId, table, field) {
  const select = document.getElementById(selectId);
  const data = await getAll(table);
  data.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item[field];
    select.appendChild(option);
  });
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
    alert('Client non trouvé');
    return;
  }
  showClientForm(client);
}

async function editProperty(id) {
  const property = await getById('properties', id);
  if (!property) {
    alert('Propriété non trouvée');
    return;
  }
  showPropertyForm(property);
}

async function editTask(id) {
  const task = await getById('tasks', id);
  if (!task) {
    alert('Tâche non trouvée');
    return;
  }
  showTaskForm(task);
}

async function showPayments() {
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
        <input type="number" id="payment-amount" value="${payment ? payment.amount : ''}" required>
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
        <input type="date" id="payment-date" value="${payment ? payment.payment_date : new Date().toISOString().split('T')[0]}" required>
      </div>
      <div class="form-group">
        <label>Notes:</label>
        <textarea id="payment-notes">${payment ? payment.notes : ''}</textarea>
      </div>
      <button type="submit">${payment ? 'Modifier' : 'Ajouter'}</button>
      <button type="button" onclick="showPayments()">Annuler</button>
    </form>
  `;

  populateSelect('payment-client', 'clients', 'name');
  populateSelect('payment-property', 'properties', 'title');

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
    alert('Erreur : ' + (error.message || error.toString()));
  }
}

async function editPayment(id) {
  const payment = await getById('payments', id);
  if (!payment) {
    alert('Paiement non trouvé');
    return;
  }
  showPaymentForm(payment);
}
