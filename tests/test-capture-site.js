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
    grab(/function looseKey[\s\S]*?\n}/, 'looseKey'),
    grab(/const SECTEURS = \{[\s\S]*?\n\};/, 'SECTEURS'),
    grab(/function quartierEtSecteur[\s\S]*?\n}/, 'quartierEtSecteur'),
    grab(/function captureVersListing[\s\S]*?\n}/, 'captureVersListing'),
    grab(/function recherchesDuSite[\s\S]*?\n}/, 'recherchesDuSite'),
    grab(/function capturesPourRecherche[\s\S]*?\n}/, 'capturesPourRecherche'),
    grab(/function formatMoney[\s\S]*?\n}/, 'formatMoney'),
    grab(/function titreCapture[\s\S]*?\n}/, 'titreCapture'),
    grab(/function messageOffreClient[\s\S]*?\n}/, 'messageOffreClient')
  ].join('\n') + '\nreturn { demandeVersRecherche, recherchesDuSite, capturesPourRecherche, messageOffreClient };')(window);
  const { demandeVersRecherche, recherchesDuSite, capturesPourRecherche, messageOffreClient } = scope;

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

  /* Le message envoyé au CLIENT : l'offre et le numéro du confrère. */
  const offre = { id: 1, title: 'Appartement 3 chambres meublé, Bonapriso', district: 'Bonapriso', price: 350000, rent_sale: 'rent' };
  const msg = messageOffreClient(demande, offre, { name: 'Paul Ekwalla' }, '237699124578');
  ok('message client : salue la personne par son nom', /^Bonjour Mme Ngo,/.test(msg));
  ok('message client : porte l’offre et le loyer mensuel', msg.includes('Appartement 3 chambres meublé, Bonapriso') && /350.000 FCFA par mois/.test(msg));
  ok('message client : porte le nom ET le numéro du confrère', msg.includes('Paul Ekwalla, +237699124578'));
  ok('message client : le quartier n’est pas répété s’il est déjà dans le titre', !msg.includes('(Bonapriso)'));
  const terrain = { id: 2, title: null, message: 'Terrain titré Logpom 591 m²', district: 'Logpom', price: null, price_m2: 140000, rent_sale: 'sale' };
  const msg2 = messageOffreClient({ name: 'Anonymous' }, terrain, null, '237677001122');
  ok('message client : « Anonymous » n’est pas un nom', /^Bonjour, suite/.test(msg2));
  ok('message client : prix au m² quand il n’y a pas de total', /140.000 FCFA le m²/.test(msg2));
  ok('message client : jamais « undefined » ni « null »', !/undefined|null/.test(msg + msg2));

  /* Publication en lot (06/11/2026) : ce qui peut partir sur le site. */
  const lot = new Function([
    grab(/function looseKey[\s\S]*?\n}/, 'looseKey'),
    grab(/function quartierDeLaListe[\s\S]*?\n}/, 'quartierDeLaListe'),
    grab(/const SECTEURS = \{[\s\S]*?\n\};/, 'SECTEURS'),
    grab(/function quartierEtSecteur[\s\S]*?\n}/, 'quartierEtSecteur'),
    grab(/function similarProperties[\s\S]*?\n}/, 'similarProperties'),
    grab(/const PRIX_VENTE_MIN = [^\n]*/, 'PRIX_VENTE_MIN'),
    grab(/function prixPubliable[\s\S]*?\n}/, 'prixPubliable'),
    grab(/function raisonNonPubliable[\s\S]*?\n}/, 'raisonNonPubliable'),
    grab(/function formatMoney[\s\S]*?\n}/, 'formatMoney'),
    grab(/function marquerDoublonsProbables[\s\S]*?\n}/, 'marquerDoublonsProbables'),
    grab(/function trierPourPublication[\s\S]*?\n}/, 'trierPourPublication')
  ].join('\n') + '\nreturn { raisonNonPubliable, trierPourPublication, prixPubliable };')();
  const QUARTIERS = ['Logpom', 'Makepe', 'Bonadiwoto (Grand Mall)', 'Deïdo'];
  const PORTEFEUILLE = [{ id: 7, district: 'Makepe', surface_m2: 400, price: 30000000, price_m2: null }];
  const v = (x) => Object.assign({ statut: 'analysee', rent_sale: 'sale', type: 'plots-of-land', price: 50000000, surface_m2: 500, district: 'Logpom' }, x);
  const R = (x) => lot.raisonNonPubliable(v(x), QUARTIERS, PORTEFEUILLE);
  ok('lot : une vente complète part', R({}) === null);
  ok('lot : une location ne part pas', R({ rent_sale: 'rent' }) === 'pas une vente');
  ok('lot : déjà transformée en fiche', R({ statut: 'promue' }) === 'déjà une fiche');
  ok('lot : sans prix total, elle part quand même (en « sur demande »)', R({ price: null }) === null);
  ok('prix : un vrai prix de vente est gardé', lot.prixPubliable(v({ price: 25000000 })) === 25000000);
  ok('prix : « 300 000 » pour un terrain (frais de signature) → sur demande', lot.prixPubliable(v({ price: 300000 })) === null);
  ok('prix : signalé douteux par l’analyse → sur demande', lot.prixPubliable(v({ price: 25000000, manquant: ['prix_douteux'] })) === null);
  ok('prix : absent → sur demande', lot.prixPubliable(v({ price: null })) === null);
  ok('lot : terrain sans surface, refusé', R({ surface_m2: null }) === 'terrain sans surface');
  ok('lot : maison sans surface, acceptée', R({ type: 'house', surface_m2: null }) === null);
  ok('lot : quartier absent du site, refusé', R({ district: 'Nyalla' }) === 'quartier inconnu du site');
  ok('lot : orthographe du site retrouvée (Deido → Deïdo, Bonadiwoto)', R({ district: 'Deido' }) === null && R({ district: 'bonadiwoto' }) === null);
  ok('lot : même bien déjà au portefeuille, refusé', R({ district: 'Makepe', surface_m2: 400, price: 30000000 }) === 'déjà au portefeuille');
  const tri = lot.trierPourPublication([
    v({ id: 1 }), v({ id: 2, district: 'logpom' }), v({ id: 3, district: 'Nyalla' }), v({ id: 4, district: 'nyalla' }), v({ id: 5, rent_sale: 'rent' })
  ], QUARTIERS, PORTEFEUILLE);
  ok('lot : le même terrain posté deux fois ne part qu’une fois', tri.publiables.length === 1 && tri.refus['même bien, autre confrère'] === 1);
  ok('lot : le quartier pris est celui du site', tri.publiables[0]._quartier === 'Logpom');
  ok('lot : quartiers inconnus regroupés malgré la casse', tri.inconnus.length === 1 && tri.inconnus[0].n === 2);
  /* Le cas d'Akwa (08/11/2026) : même terrain, deux confrères, deux prix. */
  const QA = QUARTIERS.concat('Akwa');
  const akwa = lot.trierPourPublication([
    v({ id: 186, district: 'Akwa', surface_m2: 806, price: 900000000 }),
    v({ id: 188, district: 'Akwa', surface_m2: 806, price: 725400000 }),
    v({ id: 190, district: 'Akwa', surface_m2: 510, price: 400000000 })
  ], QA, PORTEFEUILLE).publiables;
  const parId = (id) => akwa.find(a => a.id === id);
  ok('doublon : même quartier + même surface, prix différents → signalé', !!parId(186)._doublon);
  ok('doublon : la moins chère reste sans soupçon (choix de l’utilisateur)', !parId(188)._doublon);
  ok('doublon : une autre surface n’est pas un doublon', !parId(190)._doublon);
  ok('doublon : rien n’est écarté d’office, les doublons passent en fin de liste', akwa.length === 3 && akwa[2].id === 186);
  const vsFiche = lot.trierPourPublication([v({ id: 7, district: 'Makepe', surface_m2: 400, price: 41000000 })], QUARTIERS, PORTEFEUILLE).publiables;
  ok('doublon : même surface qu’une fiche du portefeuille, autre prix → signalé', vsFiche.length === 1 && /fiche/.test(vsFiche[0]._doublon || ''));
  ok('lot : une vente à « Denver » part dans Bonamoussadi', lot.raisonNonPubliable(v({ district: 'Denver' }), QUARTIERS.concat('Bonamoussadi'), PORTEFEUILLE) === null
    && lot.trierPourPublication([v({ id: 9, district: 'Denver' })], QUARTIERS.concat('Bonamoussadi'), PORTEFEUILLE).publiables[0]._quartier === 'Bonamoussadi');

  /* Secteurs d'un quartier (06/11/2026) : Denver, Santa Barbara → Bonamoussadi. */
  const qs = new Function([
    grab(/function looseKey[\s\S]*?\n}/, 'looseKey'),
    grab(/const SECTEURS = \{[\s\S]*?\n\};/, 'SECTEURS'),
    grab(/function quartierEtSecteur[\s\S]*?\n}/, 'quartierEtSecteur')
  ].join('\n') + '\nreturn quartierEtSecteur;')();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('secteur lu comme quartier : « Denver » → Bonamoussadi (Denver)', eq(qs({ district: 'Denver' }), { quartier: 'Bonamoussadi', secteur: 'Denver' }));
  ok('secteur : casse et accents indifférents (« cité chirac » → Yassa)', qs({ district: 'cité chirac' }).quartier === 'Yassa');
  ok('secteur : « Santa Barbara » → Bonamoussadi', qs({ district: 'Santa Barbara' }).quartier === 'Bonamoussadi');
  ok('secteur dans l’adresse, quartier juste : gardé, secteur relevé', eq(qs({ district: 'Bonamoussadi', address: 'Bonamoussadi (Denver), à pied du goudron' }), { quartier: 'Bonamoussadi', secteur: 'Denver' }));
  ok('secteur dans l’adresse, sans quartier : le quartier est déduit', qs({ district: null, address: 'Cité Chirac, derrière la pharmacie' }).quartier === 'Yassa');
  ok('quartier ordinaire : inchangé, sans secteur', eq(qs({ district: 'Logpom' }), { quartier: 'Logpom', secteur: null }));
  ok('pas de faux secteur dans un mot plus long (« Denverland »)', qs({ district: 'Denverland' }).secteur === null);
  ok('rien du tout : rien d’inventé', eq(qs({}), { quartier: null, secteur: null }));

  return { title: 'Demandes du site ↔ annonces des groupes', checks };
}

module.exports = { run };
