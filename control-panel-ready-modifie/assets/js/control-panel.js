console.log("JS OK");
const SUPABASE_URL = "TON_URL";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycHZrY2R1ZWp4aWt6Zm5veXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTEyODcsImV4cCI6MjA5MzQ4NzI4N30.v4o5_U5YDqZpuxC8xOv6f3BsVZbjP0IeI9gFs1zt3c4";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let leads = [];

async function loadLeads() {
  const { data, error } = await client
    .from('control_panel_leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  leads = data || [];
  render();
}

async function addLead() {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!name && !phone) {
    alert('Ajoute un nom ou numéro');
    return;
  }

  const { error } = await client
    .from('control_panel_leads')
    .insert([{
      name: name || 'Sans nom',
      phone,
      zone: document.getElementById('zone').value,
      budget: document.getElementById('budget').value,
      type: document.getElementById('type').value,
      notes: document.getElementById('notes').value,
      status: 'nouveau'
    }]);

  if (error) {
    alert(error.message);
    return;
  }

  loadLeads();
}

async function moveLead(id, status) {
  await client
    .from('control_panel_leads')
    .update({ status })
    .eq('id', id);

  loadLeads();
}

function getWhatsApp(phone, lead) {
  let clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '#';
  if (!clean.startsWith('237')) clean = '237' + clean;

  const msg = `Bonjour ${lead.name},
Suite à votre recherche (${lead.zone} ${lead.budget || ''}),
je vous propose des options disponibles.`;

  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

function render() {
  const cols = ['nouveau','en_cours','visite','negociation','conclu'];

  cols.forEach(c => {
    document.getElementById(c).innerHTML = `<h3>${c}</h3>`;
  });

  leads.forEach(l => {
    const el = document.createElement('div');

    el.innerHTML = `
      <b>${l.name}</b><br>
      ${l.zone || ''} ${l.budget || ''}<br>
      ${l.phone}<br>

      <a href="${getWhatsApp(l.phone, l)}" target="_blank">WhatsApp</a><br>

      <button onclick="moveLead('${l.id}','en_cours')">En cours</button>
      <button onclick="moveLead('${l.id}','visite')">Visite</button>
      <button onclick="moveLead('${l.id}','negociation')">Négo</button>
      <button onclick="moveLead('${l.id}','conclu')">Conclu</button>
    `;

    document.getElementById(l.status).appendChild(el);
  });
}

loadLeads();