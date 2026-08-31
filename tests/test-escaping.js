/* Une fiche client hostile ne doit produire aucun balisage.
 *
 * Raison d'être : les valeurs venant de la base étaient injectées brutes dans
 * `innerHTML` sur cinq écrans. Le risque n'était pas tant l'attaque — le CRM
 * est privé — que la corruption silencieuse : un client nommé
 * « Ets <Nkolo> & Fils » disparaissait de l'écran sans un mot.
 *
 * Le critère est le BALISAGE, pas la sous-chaîne. Le texte « onerror= » peut
 * apparaître sans danger à l'intérieur d'un &lt;img échappé : c'est du texte.
 * On vérifie donc quelles balises sont réellement ouvertes.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ALLOWED = ['div', 'strong', 'span', 'a', 'button', 'svg', 'path'];

const HOSTILE = {
  id: 42,
  name: '<img src=x onerror="alert(1)">Ets Kotto & Fils',
  phone: '699 12 45 78',
  status: '" onmouseover="alert(2)',
  source: 'facebook',
  source_detail: '<script>alert(3)</script>',
  created_at: '2026-08-14T10:00:00Z'
};

function run() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const grab = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error('introuvable dans app.js : ' + label);
    return m[0];
  };

  const render = new Function([
    grab(/const ICON_EDIT = '[^']*';/, 'ICON_EDIT'),
    grab(/const ICON_ACTIVITY = '[^']*';/, 'ICON_ACTIVITY'),
    grab(/const ICON_PAYMENT = '[^']*';/, 'ICON_PAYMENT'),
    grab(/const ICON_WHATSAPP = '[^']*';/, 'ICON_WHATSAPP'),
    grab(/const ICON_RELANCE = '[^']*';/, 'ICON_RELANCE'),
    grab(/const WHATSAPP_BUSINESS_NUMBER = '[^']*';/, 'WHATSAPP_BUSINESS_NUMBER'),
    grab(/function normalizePhone[\s\S]*?\n}/, 'normalizePhone'),
    grab(/function getWhatsApp[\s\S]*?\n}/, 'getWhatsApp'),
    grab(/function formatDate[\s\S]*?\n}/, 'formatDate'),
    grab(/function escHtml[\s\S]*?\n}/, 'escHtml'),
    grab(/function escAttr[\s\S]*?\n}/, 'escAttr'),
    grab(/function clientRow[\s\S]*?\n}/, 'clientRow')
  ].join('\n') + '\nreturn clientRow;')();

  const html = render(HOSTILE);

  const opened = [...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map(m => m[1].toLowerCase());
  const intruders = [...new Set(opened)].filter(t => !ALLOWED.includes(t));
  const attrs = [...html.matchAll(/\s[\w-]+="([^"]*)"/g)].map(m => m[1]);
  const broken = attrs.filter(v => v.includes('"'));

  return {
    title: 'Échappement du balisage',
    checks: [
      [intruders.length ? `balise(s) étrangère(s) : ${intruders.join(', ')}` : 'aucune balise étrangère au gabarit',
       intruders.length === 0],
      ["aucune sortie d'attribut", broken.length === 0],
      ['la charge <img> est neutralisée', !/<img/i.test(html)],
      ['la charge <script> est neutralisée', !/<script/i.test(html)],
      ['le nom reste lisible', html.includes('Ets Kotto &amp; Fils')],
      ['les chevrons sont neutralisés', html.includes('&lt;img')],
      ["l'attribut data-status tient", /data-status="&quot; onmouseover=/.test(html)],
      ["l'identifiant reste numérique", html.includes('editClient(42)')]
    ]
  };
}

module.exports = { run };
