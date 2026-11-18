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
    grab(/function resumeDemande[\s\S]*?\n}/, 'resumeDemande'),
    grab(/const TYPE_EN = \{[\s\S]*?\n\};/, 'TYPE_EN'),
    grab(/const TYPE_FEMININ = [^\n]*/, 'TYPE_FEMININ'),
    grab(/function relanceDemandeSite[\s\S]*?\n}/, 'relanceDemandeSite')
  ].join('\n') + '\nreturn { demandeVersClient, demandeVersRecherche, resumeDemande, relanceDemandeSite };')();
  const { demandeVersClient, demandeVersRecherche, resumeDemande, relanceDemandeSite } = scope;

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

  /* Relance WhatsApp (18/11/2026) : modèle B validé par Armand, signé
     SE LOGER CM, en anglais pour une demande anglaise. Les espaces des
     nombres sont normalisés : toLocaleString met une espace insécable. */
  const plat = s => String(s).replace(/\s/g, ' ');
  const quand = '2026-11-12T10:00:00Z';
  ok('relance : critères, date, visite, signature',
     plat(relanceDemandeSite(Object.assign({}, cherche, { name: 'Paul', created_at: quand }))) ===
     plat('Bonjour Paul, suite à votre demande du 12/11/2026 sur selogercm.com (appartement 3 chambres meublé à louer, '
       + 'Bonapriso ou Bali, 400 000 FCFA max), nous avons des biens à vous faire visiter. Quand êtes-vous disponible ?\n\nSE LOGER CM'));
  ok('relance : en anglais pour une demande anglaise',
     relanceDemandeSite(Object.assign({}, cherche, { name: 'Paul', created_at: quand, lang: 'en' })) ===
     'Hello Paul, following your request of 12/11/2026 on selogercm.com (3-bedroom furnished apartment to rent, '
       + 'Bonapriso or Bali, 400,000 FCFA max), we have properties to show you. When are you available?\n\nSE LOGER CM');
  ok('relance : rendez-vous sur une annonce, sans nom ni critère',
     relanceDemandeSite({ source: 'rdv', name: 'Anonymous', listing_ref: 'CF26-DLA-028', created_at: quand }) ===
     'Bonjour, suite à votre demande de visite du 12/11/2026 sur selogercm.com (annonce réf. CF26-DLA-028), '
       + 'nous avons des biens à vous faire visiter. Quand êtes-vous disponible ?\n\nSE LOGER CM');
  const nu = relanceDemandeSite({ source: 'contact' });
  ok('relance : rien à dire = ni parenthèses vides, ni « du »', nu.indexOf('()') === -1 && nu.indexOf(' du ') === -1
     && nu.indexOf('undefined') === -1 && nu.indexOf('Bonjour, suite à votre message sur selogercm.com, ') === 0);
  ok('relance : maison meublée, terrain à acheter, 1 chambre au singulier',
     relanceDemandeSite({ rent_sale: 'rent', type: 'house', furnished: true, bedrooms: 1 }).indexOf('(maison 1 chambre meublée à louer)') !== -1
     && relanceDemandeSite({ rent_sale: 'sale', type: 'plots-of-land', districts: ['Japoma'] }).indexOf('(terrain à acheter, Japoma)') !== -1);

  return { title: 'Demandes du site → CRM', checks };
}

module.exports = { run };
