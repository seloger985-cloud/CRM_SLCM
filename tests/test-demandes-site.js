/* Demandes du site → CRM (24/10/2026).
 *
 * Raison d'être : une demande laissée sur selogercm.com (« Je cherche »,
 * rendez-vous, contact) devient en un clic une fiche client et sa
 * recherche. Une conversion fausse se paie cher et sans bruit : une
 * recherche sans transaction n'est proposée à personne, un budget à 0
 * bloquerait tout rapprochement.
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
  const scope = new Function([
    grab(/const TYPE_FR = \{[\s\S]*?\n\};/, 'TYPE_FR'),
    grab(/const SOURCE_DEMANDE = [^\n]*/, 'SOURCE_DEMANDE'),
    grab(/function demandeVersClient[\s\S]*?\n}/, 'demandeVersClient'),
    grab(/function demandeVersRecherche[\s\S]*?\n}/, 'demandeVersRecherche'),
    grab(/function resumeDemande[\s\S]*?\n}/, 'resumeDemande')
  ].join('\n') + '\nreturn { demandeVersClient, demandeVersRecherche, resumeDemande };')();
  const { demandeVersClient, demandeVersRecherche, resumeDemande } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  const cherche = { source: 'je_cherche', name: 'Awa N.', phone: '237699124578', rent_sale: 'rent', type: 'apartment',
    districts: ['Bonapriso', 'Bali'], budget_max: 400000, bedrooms: 3, furnished: true, message: 'Avant fin novembre' };
  const c = demandeVersClient(cherche);
  ok('client : nom, téléphone au format +237…, source « site »', c.name === 'Awa N.' && c.phone === '+237699124578' && c.source === 'site');
  ok('client : locataire pour une location, acheteur pour un achat',
     c.type === 'renter' && demandeVersClient(Object.assign({}, cherche, { rent_sale: 'sale' })).type === 'buyer');
  ok('client : la référence citée suit dans le détail de la source',
     demandeVersClient({ source: 'rdv', name: 'X', phone: '237600000000', listing_ref: 'CF26-DLA-028' }).source_detail === 'Rendez-vous · réf. CF26-DLA-028');
  ok('client : un contact « Anonymous » prend son numéro ou son e-mail pour nom',
     demandeVersClient({ source: 'contact', name: 'Anonymous', email: 'a@b.cm' }).name === 'a@b.cm');

  const r = demandeVersRecherche(cherche, 42);
  ok('recherche : liée au client, transaction, type, quartiers', r.client_id === 42 && r.rent_sale === 'rent'
     && r.wanted_types[0] === 'apartment' && r.wanted_districts.join() === 'Bonapriso,Bali');
  ok('recherche : budget, chambres, meublé repris', r.budget === 400000 && r.min_bedrooms === 3 && r.wants_furnished === true);
  const vide = demandeVersRecherche({ source: 'je_cherche', rent_sale: 'sale' }, 1);
  ok('recherche : un critère absent reste null, jamais 0', vide.budget === null && vide.min_bedrooms === null && vide.wanted_types === null);
  ok('recherche : pas de transaction (simple contact) → pas de recherche', demandeVersRecherche({ source: 'contact' }, 1) === null);

  ok('résumé lisible', resumeDemande(cherche) === 'Location · Appartement · 3 ch. · Bonapriso, Bali · 400 000 FCFA max · meublé'.replace(/ /g, ' ')
     || resumeDemande(cherche).replace(/\s/g, ' ') === 'Location · Appartement · 3 ch. · Bonapriso, Bali · 400 000 FCFA max · meublé');

  return { title: 'Demandes du site → CRM', checks };
}

module.exports = { run };
