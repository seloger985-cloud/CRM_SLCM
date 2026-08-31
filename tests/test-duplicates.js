/* Détection de doublons — sans IA, par règles.
 *
 * Raison d'être : le tableau de bord affichait « M. Dicka » deux fois, le
 * même jour. Les biens sont protégés du double import par l'index
 * `uniq_properties_listing` ; les clients ne l'étaient par rien. Et comme le
 * CRM ne sait pas supprimer, une fiche en double reste — et fausse le total
 * clients comme le taux de conversion.
 *
 * Rien n'est bloquant : ces règles signalent, l'agent tranche.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const PORTEFEUILLE = [
  { id: 1, name: 'M. Dicka',        phone: '650 84 07 14' },
  { id: 2, name: 'Marthe Ngô Bell', phone: '+237699124578' },
  { id: 3, name: 'Ets Kotto & Fils', phone: null },
  { id: 4, name: 'Sans téléphone',  phone: '' }
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
    grab(/const CIVILITES = [^\n]*/, 'CIVILITES'),
    grab(/function normalizeName[\s\S]*?\n}/, 'normalizeName'),
    grab(/function findDuplicates[\s\S]*?\n}/, 'findDuplicates')
  ].join('\n') + '\nreturn { normalizeName, findDuplicates };')();

  const { normalizeName, findDuplicates } = scope;
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const trouve = (c) => findDuplicates(c, PORTEFEUILLE);

  /* Normalisation des noms */
  ok('« M. Dicka » et « Dicka » se rejoignent',
     normalizeName('M. Dicka') === normalizeName('Dicka'));
  ok('la casse et les accents sont ignorés',
     normalizeName('Marthe NGÔ BELL') === normalizeName('marthe ngo bell'));
  ok('une civilité n’est pas confondue avec un nom',
     normalizeName('Madame Essomba') === 'essomba');

  /* Nom */
  ok('un homonyme est signalé', trouve({ name: 'M DICKA' }).length === 1);
  ok('le motif est le nom', trouve({ name: 'M DICKA' })[0].raison === 'même nom');
  ok('un nom inconnu ne déclenche rien', trouve({ name: 'Nouveau client' }).length === 0);

  /* Téléphone — le signal le plus fort */
  ok('le même numéro écrit autrement est reconnu',
     trouve({ name: 'Tout autre nom', phone: '+237650840714' }).length === 1);
  ok('le motif est le numéro',
     trouve({ name: 'Tout autre nom', phone: '00237650840714' })[0].raison === 'même numéro');

  /* Cas limites */
  ok('modifier une fiche ne la signale pas contre elle-même',
     trouve({ id: 1, name: 'M. Dicka', phone: '650 84 07 14' }).length === 0);
  ok('une fiche vide ne déclenche rien', trouve({ name: '', phone: '' }).length === 0);
  ok('deux fiches sans téléphone ne sont pas jumelles pour autant',
     trouve({ name: 'Autre société', phone: '' }).length === 0);

  return { title: 'Détection de doublons', checks };
}

module.exports = { run };
