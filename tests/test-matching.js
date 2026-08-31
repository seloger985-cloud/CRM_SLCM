/* Le moteur de rapprochement, dans les deux sens, plus la veille.
 *
 * `match.js` est le seul endroit du CRM où une décision métier est calculée
 * plutôt qu'affichée : quel bien répond à quelle demande. Une régression y
 * est invisible — le CRM continue de fonctionner, il propose simplement
 * moins bien, ou trop. D'où ces cas fixes.
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

const MARTHE = { id: 1, name: 'Marthe', type: 'renter', matching_active: true,
  wanted_types: ['apartment', 'studio'], wanted_districts: ['Bonapriso', 'Akwa'],
  budget: 400000, min_bedrooms: 1, wants_furnished: true };
const PAUL = { id: 2, name: 'Paul', type: 'renter', matching_active: true,
  wanted_districts: ['Logpom'], budget: 1000000 };
const SANS_CRITERE = { id: 3, name: 'Sans critères', type: 'renter' };
const DESACTIVE = { id: 4, name: 'Désactivé', type: 'renter',
  budget: 400000, matching_active: false };
const CLIENTS = [MARTHE, PAUL, SANS_CRITERE, DESACTIVE];

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

  /* Sens 1 — une demande vers les annonces */
  const pourMarthe = M.matchesForClient(MARTHE, LISTINGS);
  ok('Marthe reçoit 2 annonces', pourMarthe.length === 2);
  ok('la villa Logpom est écartée (type et quartier)', !pourMarthe.some(h => h.listing.id === 'a2'));
  ok('le bien déjà loué est écarté (statut)', !pourMarthe.some(h => h.listing.id === 'a4'));
  ok('le mieux noté arrive en tête', pourMarthe[0].score >= pourMarthe[1].score);

  /* Sens 2 — une annonce vers les clients */
  const pourStudio = M.clientsForListing(LISTINGS[2], CLIENTS);
  const pourVilla = M.clientsForListing(LISTINGS[1], CLIENTS);
  ok('le studio Akwa intéresse le seul Marthe', pourStudio.length === 1 && pourStudio[0].client.id === 1);
  ok('la villa Logpom intéresse le seul Paul', pourVilla.length === 1 && pourVilla[0].client.id === 2);
  ok('un client sans critère n’est jamais proposé',
     !pourStudio.concat(pourVilla).some(h => h.client.id === 3));
  ok('un client désactivé n’est jamais proposé',
     !pourStudio.concat(pourVilla).some(h => h.client.id === 4));

  /* Historique d'envoi */
  ok('une annonce déjà envoyée ne revient pas',
     M.matchesForClient(MARTHE, LISTINGS, new Set(['1|a1'])).every(h => h.listing.id !== 'a1'));

  /* Veille sur les nouveautés */
  ok('premier passage : aucune alerte, le repère est posé',
     M.freshMatches(CLIENTS, LISTINGS).length === 0 && M.lastSeen());
  ok('le repère pointe la plus récente annonce', M.lastSeen() === '2026-08-31T09:30:00Z');

  store['slcm-listings-seen'] = '2026-08-29T00:00:00Z';
  const depuis = M.freshMatches(CLIENTS, LISTINGS);
  ok('deux annonces sont postérieures au repère', depuis.length === 2);
  ok('seules celles qui trouvent preneur sont retenues', depuis.every(f => f.clients.length > 0));
  ok('l’annonce déjà louée n’alerte pas', !depuis.some(f => f.listing.id === 'a4'));

  return { title: 'Moteur de rapprochement', checks };
}

module.exports = { run };
