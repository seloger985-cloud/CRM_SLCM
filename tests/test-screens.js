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

async function run() {
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

  /* Session DÉJÀ présente au chargement — le cas du rechargement à chaud.
     app.js appelait alors showDashboard() pendant l'exécution du fichier,
     donc avant l'initialisation de TABLE_COLS : « Cannot access before
     initialization », écran « Erreur ». Le premier chargement ci-dessus ne
     pouvait pas le voir, puisqu'il passe par la branche sans session. */
  const win2 = fauxElement();
  win2.SLCM_DB = { getClient: fauxSupabase };
  win2.SLCM_CONFIG = { SUPABASE_URL: 'https://exemple.test' };
  win2.SLCM_SITE = { fetchListings: () => Promise.resolve([]) };
  win2.SLCM_MATCH = new Proxy({}, { get: () => () => [] });
  win2.addEventListener = () => {};
  win2.SLCM_SESSION = { user: { email: 'test@exemple.test' } };

  /* Les écrans sont tous `async` : une erreur dedans devient une PROMESSE
     REJETÉE, pas une exception. Un try/catch ne la voit pas — le navigateur,
     lui, affiche « Uncaught (in promise) ». C'est ainsi que le bug de zone
     morte sur TABLE_COLS avait échappé à la première version de ce test. */
  const rejets = [];
  const guetteur = (e) => rejets.push(e);
  process.on('unhandledRejection', guetteur);

  let demarrage = true;
  const microtaches = [];
  const ancien = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (f) => microtaches.push(f);
  try {
    new Function(
      'window', 'document', 'localStorage', 'Chart', 'UI', 'fetch', 'getComputedStyle', 'queueMicrotask',
      src
    )(win2, doc, stockage, fauxElement(), fauxElement(), () => Promise.resolve({}),
      () => ({ getPropertyValue: () => '' }), (f) => microtaches.push(f));
    microtaches.forEach(f => f());
  } catch (e) {
    demarrage = false;
    checks.push(['session déjà présente au chargement — ' + e.message, false]);
  } finally {
    globalThis.queueMicrotask = ancien;
  }

  /* Deux tours de boucle : le temps que Node signale les rejets. */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', guetteur);

  if (rejets.length) {
    demarrage = false;
    checks.push(['session déjà présente au chargement — ' + (rejets[0] && rejets[0].message), false]);
  }
  if (demarrage) checks.push(['session déjà présente au chargement (rechargement à chaud)', true]);

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
