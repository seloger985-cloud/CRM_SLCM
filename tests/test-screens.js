/* Chaque écran doit se construire sans lever d'erreur.
 *
 * Raison d'être : le bouton « Annuler » de la boîte de réception a été
 * livré avec `${back === 'inbox' ? … }` alors que `showInbox()` ne reçoit
 * aucun `back`. Résultat en production : ReferenceError, écran « Erreur »,
 * fonctionnalité inaccessible.
 *
 * `node --check` ne pouvait pas le voir — la syntaxe était valide. Les
 * autres contrôles non plus : ils testent des fonctions pures, or le bug
 * vivait dans un gabarit HTML. Il fallait EXÉCUTER le rendu.
 *
 * D'où ce faux navigateur. Il ne vérifie pas que l'écran est joli : il
 * vérifie qu'il se construit. C'est le contrôle le moins exigeant possible,
 * et il aurait suffi.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* Un élément qui accepte tout : n'importe quelle propriété rend un élément,
   n'importe quel appel réussit. On ne simule pas un navigateur, on l'empêche
   seulement de faire échouer le rendu pour de mauvaises raisons. */
function fauxElement() {
  const cible = function () { return fauxElement(); };
  return new Proxy(cible, {
    get(_t, prop) {
      /* undefined sur les symboles : sans ça, Array.from(el.selectedOptions)
         croit trouver un itérateur et casse pour de bon. */
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'value' || prop === 'textContent' || prop === 'innerHTML') return '';
      if (prop === 'checked' || prop === 'isConnected') return false;
      if (prop === 'length') return 0;
      return fauxElement();
    },
    set() { return true; },
    apply() { return fauxElement(); }
  });
}

/* Supabase : tout est chaînable, et l'attente rend un résultat vide. */
function fauxSupabase() {
  const p = new Proxy(function () { return fauxSupabase(); }, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: [], error: null });
      if (typeof prop === 'symbol') return undefined;
      return fauxSupabase();
    },
    apply() { return fauxSupabase(); }
  });
  return p;
}

/* Les écrans construits sans réseau : ceux dont le gabarit est le risque. */
const ECRANS = [
  ['showInbox', []],
  ['showClientForm', []],
  ['showClientForm', [{ id: 1, name: 'Test', phone: '650840714' }]],
  ['showPropertyForm', []],
  ['showPropertyForm', [null, { title: 'Depuis un message', _manquant: ['price'] }, 'inbox']],
  ['showPropertyForm', [{ id: 2, title: 'Villa', type: 'villa', status: 'available' }]],
  ['showActivityForm', []],
  ['showActivityForm', [null, { client_id: 1 }, 'clients']],
  ['showActivityForm', [{ id: 3, type: 'visit', notes: 'x', date: '2026-09-01' }]],
  ['showTaskForm', []],
  ['showTaskForm', [{ id: 4, title: 'x', status: 'pending' }]],
  ['showPaymentForm', []],
  ['showPaymentForm', [null, { client_id: 1 }, 'clients']],
  ['showDemandForm', [null, { client_id: 1 }, 'clients']],
  ['showDemandForm', [{ id: 5, client_id: 1, rent_sale: 'rent', active: true }]]
];

function run() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const checks = [];

  const win = fauxElement();
  win.SLCM_DB = { getClient: fauxSupabase };
  win.SLCM_CONFIG = { SUPABASE_URL: 'https://exemple.test' };
  win.SLCM_SITE = { fetchListings: () => Promise.resolve([]) };
  win.SLCM_MATCH = new Proxy({}, { get: () => () => [] });
  win.addEventListener = () => {};

  const doc = fauxElement();
  doc.getElementById = () => fauxElement();
  doc.querySelectorAll = () => [];
  doc.createElement = () => fauxElement();
  doc.addEventListener = () => {};
  doc.documentElement = fauxElement();

  const store = {};
  const stockage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };

  let expose;
  try {
    expose = new Function(
      'window', 'document', 'localStorage', 'Chart', 'UI', 'fetch', 'getComputedStyle',
      src + '\nreturn (nom) => eval(nom);'
    )(win, doc, stockage, fauxElement(), fauxElement(), () => Promise.resolve({}),
      () => ({ getPropertyValue: () => '' }));
  } catch (e) {
    return { title: 'Construction des écrans', checks: [['app.js se charge', false]] };
  }
  checks.push(['app.js se charge sans erreur', true]);

  for (const [nom, args] of ECRANS) {
    let fn;
    try { fn = expose(nom); } catch (_e) { fn = null; }
    if (typeof fn !== 'function') {
      checks.push([`${nom} est déclarée`, false]);
      continue;
    }
    const etiquette = args.length
      ? `${nom}(${args.map(a => (a === null ? 'null' : typeof a === 'object' ? '{…}' : JSON.stringify(a))).join(', ')})`
      : `${nom}()`;
    try {
      fn(...args);
      checks.push([etiquette, true]);
    } catch (e) {
      checks.push([`${etiquette} — ${e.message}`, false]);
    }
  }

  return { title: 'Construction des écrans', checks };
}

module.exports = { run };
