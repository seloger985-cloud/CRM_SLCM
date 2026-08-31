/* Le moteur de rapprochement, dans les deux sens, plus la veille.
 *
 * `match.js` est le seul endroit du CRM où une décision métier est calculée
 * plutôt qu'affichée : quel bien répond à quelle demande. Une régression y
 * est invisible — le CRM continue de fonctionner, il propose simplement
 * moins bien, ou trop. D'où ces cas fixes.
 *
 * L'unité évaluée est une DEMANDE depuis le 31/08/2026 : un client peut en
 * porter plusieurs, et c'est la recherche qui a un budget, pas la personne.
 * Le cas « M. Dicka » — un studio ET un deux-chambres — est reproduit ici.
 *
 * Le fichier est chargé dans un faux navigateur : ni DOM, ni réseau.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const LISTINGS = [
  { id: 'a1', slug: 'appt-bonapriso', title: 'Appartement 3 ch Bonapriso', status: 'active',
    rent_sale: 'rent', type: 'apartment', district: 'Bonapriso', city: 'Douala',
    price: 350000, bedrooms: 3, furnished: true, created_at: '2026-08-30T10:00:00Z' },
  { id: 'a2', slug: 'villa-logpom', title: 'Villa Logpom', status: 'active',
    rent_sale: 'rent', type: 'villa', district: 'Logpom', city: 'Douala',
    price: 900000, bedrooms: 5, furnished: false, created_at: '2026-08-20T10:00:00Z' },
  { id: 'a3', slug: 'studio-akwa', title: 'Studio Akwa', status: 'active',
    rent_sale: 'rent', type: 'studio', district: 'Akwa', city: 'Douala',
    price: 120000, bedrooms: 1, furnished: true, created_at: '2026-08-31T09:00:00Z' },
  { id: 'a4', slug: 'loue', title: 'Déjà loué', status: 'rented',
    rent_sale: 'rent', type: 'apartment', district: 'Bonapriso', city: 'Douala',
    price: 300000, bedrooms: 3, furnished: true, created_at: '2026-08-31T09:30:00Z' }
];

/* M. Dicka, client 1 : deux recherches distinctes. C'est le cas qui a motivé
   la table `demands` — il était inexprimable quand la demande vivait dans la
   fiche client. */
const DICKA_STUDIO = { id: 10, client_id: 1, active: true, rent_sale: 'rent',
  wanted_types: ['studio'], wanted_districts: ['Akwa'], budget: 150000 };
const DICKA_APPT = { id: 11, client_id: 1, active: true, rent_sale: 'rent',
  wanted_types: ['apartment'], wanted_districts: ['Bonapriso'],
  budget: 400000, min_bedrooms: 2, wants_furnished: true };

const PAUL = { id: 12, client_id: 2, active: true, rent_sale: 'rent',
  wanted_districts: ['Logpom'], budget: 1000000 };
const SANS_CRITERE = { id: 13, client_id: 3, active: true, rent_sale: 'rent' };
const ABANDONNEE = { id: 14, client_id: 4, active: false, rent_sale: 'rent', budget: 400000 };
const SANS_TRANSACTION = { id: 15, client_id: 5, active: true, rent_sale: null, budget: 400000 };

const DEMANDS = [DICKA_STUDIO, DICKA_APPT, PAUL, SANS_CRITERE, ABANDONNEE, SANS_TRANSACTION];

function run() {
  const store = {};
  const win = {};
  const fakeStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  new Function('window', 'localStorage',
    fs.readFileSync(path.join(ROOT, 'assets/js/match.js'), 'utf8'))(win, fakeStorage);
  const M = win.SLCM_MATCH;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  /* Deux demandes d'un même client se comportent indépendamment */
  const studio = M.matchesForDemand(DICKA_STUDIO, LISTINGS);
  const appart = M.matchesForDemand(DICKA_APPT, LISTINGS);
  ok('la recherche « studio » ne trouve que le studio',
     studio.length === 1 && studio[0].listing.id === 'a3');
  ok('la recherche « appartement » ne trouve que l’appartement',
     appart.length === 1 && appart[0].listing.id === 'a1');
  ok('les deux recherches d’un même client ne se contaminent pas',
     studio[0].listing.id !== appart[0].listing.id);

  /* Critères bloquants */
  ok('le bien déjà loué est écarté (statut)',
     !appart.some(h => h.listing.id === 'a4'));
  ok('une demande sans transaction ne rapproche rien',
     M.matchesForDemand(SANS_TRANSACTION, LISTINGS).length === 0);
  ok('une demande sans critère ne rapproche rien',
     M.matchesForDemand(SANS_CRITERE, LISTINGS).length === 0);
  ok('une demande abandonnée ne rapproche rien',
     M.matchesForDemand(ABANDONNEE, LISTINGS).length === 0);

  /* Sens inverse — une annonce vers les demandes */
  const pourStudio = M.demandsForListing(LISTINGS[2], DEMANDS);
  ok('le studio Akwa ne réveille que la recherche « studio » de Dicka',
     pourStudio.length === 1 && pourStudio[0].demand.id === 10);
  ok('la villa Logpom ne réveille que Paul',
     (() => { const r = M.demandsForListing(LISTINGS[1], DEMANDS);
              return r.length === 1 && r[0].demand.client_id === 2; })());

  /* Historique — indexé sur le CLIENT, pas sur la demande */
  ok('une annonce déjà envoyée au client ne revient sur AUCUNE de ses demandes',
     M.matchesForDemand(DICKA_STUDIO, LISTINGS, new Set(['1|a3'])).length === 0);

  /* Vue d’ensemble */
  const tous = M.computeMatches(DEMANDS, LISTINGS);
  ok('trois demandes vivantes trouvent preneur', tous.length === 3);
  ok('chaque entrée porte sa demande', tous.every(m => m.demand && m.demand.client_id));
  ok('les meilleurs scores remontent',
     tous[0].hits[0].score >= tous[tous.length - 1].hits[0].score);

  /* Veille sur les nouveautés */
  ok('premier passage : aucune alerte, le repère est posé',
     M.freshMatches(DEMANDS, LISTINGS).length === 0 && M.lastSeen());
  ok('le repère pointe la plus récente annonce', M.lastSeen() === '2026-08-31T09:30:00Z');

  store['slcm-listings-seen'] = '2026-08-29T00:00:00Z';
  const depuis = M.freshMatches(DEMANDS, LISTINGS);
  ok('deux annonces sont postérieures au repère', depuis.length === 2);
  ok('seules celles qui trouvent preneur sont retenues', depuis.every(f => f.demands.length > 0));
  ok('l’annonce déjà louée n’alerte pas', !depuis.some(f => f.listing.id === 'a4'));

  return { title: 'Moteur de rapprochement', checks };
}

module.exports = { run };
