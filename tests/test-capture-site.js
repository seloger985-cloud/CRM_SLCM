/* Demandes du site ↔ annonces des groupes (sql/16, 03/11/2026).
 *
 * Raison d'être : une demande laissée sur selogercm.com (« Je cherche un
 * appartement à Bonapriso, 400 000 max ») doit trouver l'offre qu'un
 * confrère vient de poster dans un groupe — et SEULEMENT celle-là. Un faux
 * rapprochement fait écrire pour rien à un confrère ; un rapprochement
 * manqué laisse passer un client.
 *
 * Les fonctions sont prises dans app.js, et le moteur est le vrai match.js.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const grab = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error('introuvable dans app.js : ' + label);
    return m[0];
  };

  const window = { SLCM_DB: { getClient: () => null } };
  new Function('window', fs.readFileSync(path.join(ROOT, 'assets/js/match.js'), 'utf8'))(window);

  const scope = new Function('window', [
    grab(/const TYPE_FR = \{[\s\S]*?\n\};/, 'TYPE_FR'),
    grab(/const SOURCE_DEMANDE = [^\n]*/, 'SOURCE_DEMANDE'),
    grab(/function demandeVersRecherche[\s\S]*?\n}/, 'demandeVersRecherche'),
    grab(/function captureVersListing[\s\S]*?\n}/, 'captureVersListing'),
    grab(/function recherchesDuSite[\s\S]*?\n}/, 'recherchesDuSite'),
    grab(/function capturesPourRecherche[\s\S]*?\n}/, 'capturesPourRecherche')
  ].join('\n') + '\nreturn { demandeVersRecherche, recherchesDuSite, capturesPourRecherche };')(window);
  const { demandeVersRecherche, recherchesDuSite, capturesPourRecherche } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const hier = new Date(Date.now() - 86400000).toISOString();

  const CAPTURES = [
    { id: 1, statut: 'analysee', rent_sale: 'rent', type: 'apartment', district: 'Bonapriso', price: 350000, bedrooms: 3, furnished: true, posted_at: hier },
    { id: 2, statut: 'analysee', rent_sale: 'rent', type: 'apartment', district: 'Bonapriso', price: 650000, bedrooms: 3, posted_at: hier },
    { id: 3, statut: 'analysee', rent_sale: 'rent', type: 'apartment', district: 'Makepe', price: 300000, bedrooms: 3, posted_at: hier },
    { id: 4, statut: 'analysee', rent_sale: 'sale', type: 'apartment', district: 'Bonapriso', price: 300000, posted_at: hier },
    { id: 5, statut: 'analysee', rent_sale: 'rent', type: 'studio', district: 'Bonapriso', price: 150000, posted_at: hier },
    { id: 6, statut: 'analysee', rent_sale: 'rent', type: 'apartment', district: 'bonapriso', price: null, bedrooms: 3, posted_at: hier }
  ];
  const demande = { id: 42, name: 'Mme Ngo', source: 'je_cherche', rent_sale: 'rent', type: 'apartment',
    districts: ['Bonapriso'], budget_max: 400000, bedrooms: 2 };

  const ids = capturesPourRecherche(demandeVersRecherche(demande, 'site-42'), CAPTURES).map(h => h.capture.id);
  ok('l’offre qui répond est trouvée (Bonapriso, 350 000, 3 ch.)', ids.includes(1));
  ok('hors budget : écartée (650 000 > 400 000)', !ids.includes(2));
  ok('autre quartier : écartée (Makepe)', !ids.includes(3));
  ok('vente pour une location : écartée', !ids.includes(4));
  ok('autre type : écarté (studio)', !ids.includes(5));
  ok('« prix sur demande » reste proposé, et la casse du quartier ne compte pas', ids.includes(6));
  ok('les meilleures d’abord : celle qui a un prix dans le budget passe devant', ids[0] === 1);

  const contact = { id: 43, name: 'Paul', source: 'contact', rent_sale: null, message: 'Rappelez-moi' };
  const anonyme = { id: 44, name: 'Anonymous', source: 'je_cherche', rent_sale: 'sale', type: 'plots-of-land', districts: ['Logpom'] };
  const r = recherchesDuSite([demande, contact, anonyme]);
  ok('un simple message de contact ne cherche rien : laissé de côté', r.length === 2);
  ok('le nom affiché est celui de la demande', r[0]._nom === 'Mme Ngo');
  ok('« Anonymous » devient « Visiteur du site »', r[1]._nom === 'Visiteur du site');
  ok('le client n’existe pas encore : la recherche porte l’id de la demande', r[0].client_id === 'site-42');

  const vide = { id: 45, name: 'X', source: 'je_cherche', rent_sale: 'rent' };
  ok('une demande sans aucun critère ne déclenche rien (le moteur exige un critère)',
    capturesPourRecherche(demandeVersRecherche(vide, 'site-45'), CAPTURES).length === 0);

  return { title: 'Demandes du site ↔ annonces des groupes', checks };
}

module.exports = { run };
