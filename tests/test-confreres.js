/* Confrères et code court — sql/12.
 *
 * Raison d'être : une campagne de terrains de confrères. Un prospect cite un
 * référence (« CF26-DLA-028 », « le 28 »), il faut retrouver le bien puis le confrère
 * qui le détient. Et le contact d'un confrère, extrait d'un message, doit
 * retrouver la fiche existante plutôt que d'en créer une seconde.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const REPERTOIRE = [
  { id: 1, name: 'Paul Ekwalla', phone: '699 12 45 78', whatsapp: null },
  { id: 2, name: 'Paul Nkotto',  phone: '+237 677 00 11 22', whatsapp: '655 33 44 55' },
  { id: 3, name: 'Sans numéro',  phone: null, whatsapp: null }
];

function run() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const grab = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error('introuvable dans app.js : ' + label);
    return m[0];
  };
  const scope = new Function([
    grab(/function normalizePhone[\s\S]*?\n}/, 'normalizePhone'),
    grab(/function confrereWa[\s\S]*?\n}/, 'confrereWa'),
    grab(/const PHONE_IN_TEXT = [^\n]*/, 'PHONE_IN_TEXT'),
    grab(/function findConfrere[\s\S]*?\n}/, 'findConfrere'),
    grab(/function contactName[\s\S]*?\n}/, 'contactName'),
    grab(/function confrereMessage[\s\S]*?\n}/, 'confrereMessage'),
    grab(/function codeKeys[\s\S]*?\n}/, 'codeKeys'),
    grab(/function looseKey[\s\S]*?\n}/, 'looseKey'),
    grab(/function similarProperties[\s\S]*?\n}/, 'similarProperties'),
    grab(/function totalFromM2[\s\S]*?\n}/, 'totalFromM2'),
    grab(/const RELANCE_JOURS = [^\n]*/, 'RELANCE_JOURS'),
    grab(/function aRelancer[\s\S]*?\n}/, 'aRelancer'),
    grab(/function relanceMessage[\s\S]*?\n}/, 'relanceMessage'),
    grab(/const TYPE_FR = \{[\s\S]*?\n\};/, 'TYPE_FR'),
    grab(/function texteParDefaut[\s\S]*?\n}/, 'texteParDefaut')
  ].join('\n') + '\nreturn { confrereWa, findConfrere, contactName, confrereMessage, codeKeys, similarProperties, totalFromM2, aRelancer, relanceMessage, texteParDefaut };')();

  const { confrereWa, findConfrere, contactName, confrereMessage, codeKeys, similarProperties, totalFromM2, aRelancer, relanceMessage, texteParDefaut } = scope;
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const id = c => c && c.id;

  /* Retrouver un confrère par son numéro, quelle qu'en soit l'écriture */
  ok('numéro local espacé → Paul Ekwalla', id(findConfrere('Paul 6 99 12 45 78', REPERTOIRE)) === 1);
  ok('numéro +237 → Paul Ekwalla', id(findConfrere('+237699124578', REPERTOIRE)) === 1);
  ok('numéro WhatsApp → Paul Nkotto', id(findConfrere('WA 655.33.44.55', REPERTOIRE)) === 2);
  ok('même prénom sans numéro → personne (jamais par le nom)', findConfrere('Paul', REPERTOIRE) === null);
  ok('numéro inconnu → personne', findConfrere('690 00 00 00', REPERTOIRE) === null);
  ok('contact vide → personne', findConfrere(null, REPERTOIRE) === null);

  /* Le nom, une fois le numéro retiré */
  ok('« Paul Ekwalla 699124578 » → « Paul Ekwalla »', contactName('Paul Ekwalla 699124578') === 'Paul Ekwalla');
  ok('« 699 12 45 78 - Mme Ngo » → « Mme Ngo »', contactName('699 12 45 78 - Mme Ngo') === 'Mme Ngo');

  /* Le numéro auquel écrire */
  ok('WhatsApp distinct préféré au téléphone', confrereWa(REPERTOIRE[1]) === '237655334455');
  ok('sinon le téléphone', confrereWa(REPERTOIRE[0]) === '237699124578');
  ok('aucun numéro → chaîne vide', confrereWa(REPERTOIRE[2]) === '');

  /* Le message, dans les mots du confrère */
  const m1 = confrereMessage({ confrere_ref: 'LGP-07', title: 'Terrain 591 m²', district: 'Logpom' }, REPERTOIRE[0]);
  ok('message : sa référence quand il en a donné une', m1.indexOf('réf. LGP-07') !== -1 && m1.indexOf('Logpom') !== -1);
  const m2 = confrereMessage({ title: 'Terrain 591 m²', address: 'Logpom, Douala' }, REPERTOIRE[0]);
  ok('message : sinon le titre et le lieu', m2.indexOf('« Terrain 591 m² »') !== -1 && m2.indexOf('Logpom, Douala') !== -1);
  ok('message : jamais « undefined »', m2.indexOf('undefined') === -1 && confrereMessage({}, null).indexOf('undefined') === -1);

  /* Le code tel qu'on le tape au téléphone */
  const k = codeKeys('CF26-DLA-028');
  const a = ' ' + k + ' ';
  ok('« cf26-dla-028 » retrouve CF26-DLA-028', a.indexOf(' cf26-dla-028 ') !== -1);
  ok('« cf28 » retrouve CF26-DLA-028', a.indexOf(' cf28 ') !== -1);
  ok('« 28 » retrouve CF26-DLA-028', a.indexOf(' 28 ') !== -1);
  ok('SL26-YDE-031 → « sl31 » et « 31 »', (' ' + codeKeys('SL26-YDE-031') + ' ').indexOf(' sl31 ') !== -1);
  const old = ' ' + codeKeys('T-028') + ' ';
  ok('ancien code T-028 : « t28 » et « 28 » marchent encore', old.indexOf(' t28 ') !== -1 && old.indexOf(' 28 ') !== -1);
  ok('pas de code → rien à chercher', codeKeys(null) === '');

  /* Même terrain, autre confrère */
  const STOCK = [
    { id: 1, code: 'T-012', district: 'Logpom', surface_m2: 591, price: 82740000, price_m2: 140000 },
    { id: 2, code: 'T-013', district: 'Logpom', surface_m2: 600, price: 84000000, price_m2: 140000 },
    { id: 3, code: 'A-002', district: 'Bonapriso', surface_m2: null, price: 350000 }
  ];
  const ids = l => l.map(o => o.id).join(',');
  ok('même quartier (accents/casse), surface et prix au m² → signalé',
     ids(similarProperties({ district: 'LOGPÔM', surface_m2: 591, price_m2: 140000 }, STOCK)) === '1');
  ok('même total sans prix au m² → signalé',
     ids(similarProperties({ district: 'Logpom', surface_m2: 591, price: 82740000 }, STOCK)) === '1');
  ok('surface différente → rien (terrains voisins)',
     similarProperties({ district: 'Logpom', surface_m2: 595, price_m2: 140000 }, STOCK).length === 0);
  ok('même surface mais autre prix → rien',
     similarProperties({ district: 'Logpom', surface_m2: 591, price_m2: 120000 }, STOCK).length === 0);
  ok('sans surface → jamais d\'alerte (appartement)',
     similarProperties({ district: 'Bonapriso', price: 350000 }, STOCK).length === 0);
  ok('la fiche elle-même n\'est pas son propre doublon',
     similarProperties(STOCK[0], STOCK).length === 0);

  /* Le total d'un terrain vendu au m² */
  ok('591 m² × 140 000 = 82 740 000', totalFromM2('591', '140000') === 82740000);
  ok('un champ vide → pas de total', totalFromM2('', '140000') === null && totalFromM2('591', '') === null);

  /* Relance à 15 jours */
  const JOUR = 86400000, MAINT = Date.parse('2026-11-20T12:00:00Z');
  const il_y_a = j => new Date(MAINT - j * JOUR).toISOString();
  const ANNONCES = [
    { id: 'L1', status: 'active', created_at: il_y_a(20) },
    { id: 'L2', status: 'active', created_at: il_y_a(5) },
    { id: 'L3', status: 'expired', created_at: il_y_a(40) }
  ];
  const BIENS = [
    { id: 1, code: 'CF26-DLA-028', confrere_id: 7, listing_id: 'L1', status: 'available' },
    { id: 2, code: 'CF26-DLA-029', confrere_id: 7, listing_id: 'L2', status: 'available' },
    { id: 3, code: 'CF26-DLA-030', confrere_id: 7, listing_id: 'L3', status: 'available' },
    { id: 4, code: 'SL26-DLA-031', confrere_id: null, listing_id: 'L1', status: 'available' },
    { id: 5, code: 'CF26-DLA-032', confrere_id: 7, listing_id: 'L1', status: 'sold' }
  ];
  const r0 = aRelancer(BIENS, ANNONCES, {}, MAINT).map(p => p.id).join(',');
  ok('20 jours en ligne → à relancer ; 5 jours, expirée, mandat direct, vendu → non', r0 === '1');
  ok('relancé il y a 3 jours → plus rien jusqu\'à 15 jours après',
     aRelancer(BIENS, ANNONCES, { 1: MAINT - 3 * JOUR }, MAINT).length === 0);
  ok('relancé il y a 16 jours → de nouveau à relancer',
     aRelancer(BIENS, ANNONCES, { 1: MAINT - 16 * JOUR }, MAINT).length === 1);
  const rm = relanceMessage({ code: 'CF26-DLA-028', confrere_ref: 'LGP-07', district: 'Logpom' }, { name: 'Paul' });
  ok('message de relance : sa réf., le lieu, notre réf.', rm.indexOf('réf. LGP-07') !== -1 && rm.indexOf('Logpom') !== -1 && rm.indexOf('CF26-DLA-028') !== -1);

  /* Texte public de départ : les champs seuls */
  ok('texte public : « Appartement, 3 chambres, 2 douches, meublé à Bonapriso. »',
     texteParDefaut({ type: 'apartment', bedrooms: 3, bathrooms: 2, furnished: true, district: 'Bonapriso' })
       === 'Appartement, 3 chambres, 2 douches, meublé à Bonapriso.');
  ok('texte public : rien de la description (le message du confrère)',
     texteParDefaut({ type: 'villa', district: 'Bali', description: 'Paul 699124578 commission 1 mois' }).indexOf('699') === -1);

  return { title: 'Confrères et code court (sql/12)', checks };
}

module.exports = { run };
