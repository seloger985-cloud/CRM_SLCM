/* Croise les colonnes demandées au serveur avec le schéma réel.
 *
 * Raison d'être : `TABLE_COLS.payments` a longtemps réclamé des colonnes
 * `accompte` et `reste` qui n'existaient pas. PostgREST rejetait alors TOUTE
 * lecture de la table, `getAll()` retournait un tableau vide, et l'écran
 * Paiements comme le chiffre d'affaires affichaient zéro — sans une erreur
 * visible. Quatre relectures du code n'avaient rien vu ; la comparaison au
 * schéma l'a trouvé en une seconde.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  /* TOUS les fichiers SQL, pas seulement 01_schema.sql.
   *
   * Raison d'être : 01 décrit l'état d'origine, les migrations numérotées le
   * font évoluer. Ne lire que 01 obligeait à le recopier à la main à chaque
   * migration — et le 15/10/2026 cette recopie avait divergé : `property_id`
   * manquait sur `invoices` alors que le code l'écrivait, d'où un HTTP 400 à
   * chaque sauvegarde de facture. Le schéma tenu à la main re-divergera
   * toujours ; la somme des migrations, non. */
  const sql = fs.readdirSync(path.join(ROOT, 'sql'))
    .filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(ROOT, 'sql', f), 'utf8'))
    .join('\n');
  const checks = [];

  const schema = {};
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    schema[m[1]] = m[2].split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('--')).map(l => l.split(/\s+/)[0]);
  }
  /* Puis les colonnes ajoutées après coup par une migration. */
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+add column if not exists\s+(\w+)/g)) {
    if (schema[m[1]] && !schema[m[1]].includes(m[2])) schema[m[1]].push(m[2]);
  }

  const block = app.match(/const TABLE_COLS = \{([\s\S]*?)\n\};/);
  if (!block) return { title: 'Colonnes', checks: [['TABLE_COLS est lisible', false]] };

  for (const m of block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
    const table = m[1];
    const cols = m[2].split(',');
    const real = schema[table];
    if (!real) { checks.push([`${table} : présente dans sql/01_schema.sql`, false]); continue; }
    const missing = cols.filter(c => !real.includes(c));
    checks.push([
      missing.length
        ? `${table} : ${missing.join(', ')} — inexistante(s) en base`
        : `${table} : ${cols.length} colonnes, toutes présentes`,
      missing.length === 0
    ]);
  }

  /* Les statuts proposés doivent être acceptés par la contrainte CHECK.
   *
   * Scopé au SEUL formulaire de paiement : depuis la gérance, d'autres écrans
   * proposent un `v.status` qui relève de leur propre table (un bail est
   * 'suspended', un signalement 'en_cours'). Les confronter au CHECK de
   * `payments` faisait crier ce contrôle sur du code parfaitement correct. */
  const check = sql.match(/payments_status_check CHECK \(\(status = ANY \(ARRAY\[([^\]]+)\]/);
  const formPaiement = (app.match(/function showPaymentForm[\s\S]*?\n}/) || [''])[0];
  if (check) {
    const allowed = [...check[1].matchAll(/'([^']+)'::text/g)].map(x => x[1]);
    const form = [...formPaiement.matchAll(/<option value="(\w+)"\s*\$\{/g)].map(x => x[1]);
    const bad = form.filter(x => !allowed.includes(x));
    checks.push([
      bad.length
        ? `payments : statut(s) ${bad.join(', ')} refusé(s) par le CHECK`
        : `payments : statuts du formulaire (${form.join(', ')}) tous autorisés`,
      bad.length === 0
    ]);
  }

  /* Les types de CLIENT, dans les deux sens.
   *
   * Raison d'être : `sql/09` a ajouté 'landlord' à la contrainte, mais le
   * formulaire n'en proposait toujours que trois. Un propriétaire bailleur
   * devait donc être enregistré en « Vendeur » — aucune erreur, aucun signal,
   * et toute lecture par type qui ment.
   *
   * Les contrôles existants ne regardaient qu'un sens : « le formulaire ne
   * propose rien d'interdit ». Celui-ci ajoute l'autre, le seul qui aurait
   * attrapé l'oubli : « la base n'accepte rien que le formulaire ignore ». */
  /* La DERNIÈRE définition de la contrainte, pas la première : `sql/09` la
     supprime puis la recrée avec 'landlord'. Lire celle de `01_schema.sql`
     donnait trois types au lieu de quatre, et le contrôle accusait le
     formulaire d'un type « refusé par la base » qu'elle accepte très bien.
     Insensible à la casse : 01 écrit ARRAY[, 09 écrit array[. */
  let clientCheck = null;
  for (const m of sql.matchAll(/clients_type_check[\s\S]{0,400}?array\s*\[([^\]]+)\]/gi)) clientCheck = m;
  const vocabClient = app.match(/const CLIENT_TYPE_FR = \{([\s\S]*?)\n\};/);
  if (clientCheck && vocabClient) {
    const autorises = [...clientCheck[1].matchAll(/'([^']+)'::text/g)].map(x => x[1]);
    const proposes = [...vocabClient[1].matchAll(/^\s*(\w+):/gm)].map(x => x[1]);
    const oublies = autorises.filter(t => proposes.indexOf(t) === -1);
    const interdits = proposes.filter(t => autorises.indexOf(t) === -1);
    checks.push([
      oublies.length
        ? `clients : type(s) ${oublies.join(', ')} accepté(s) en base mais absent(s) du formulaire`
        : `clients : les ${autorises.length} types de la base sont tous proposés`,
      oublies.length === 0
    ]);
    checks.push([
      interdits.length
        ? `clients : type(s) ${interdits.join(', ')} proposé(s) mais refusé(s) par la base`
        : `clients : aucun type proposé hors contrainte`,
      interdits.length === 0
    ]);
  } else {
    checks.push(['clients : contrainte et vocabulaire tous deux lisibles', false]);
  }

  /* Même garde pour les types de biens : le formulaire ne doit proposer que
     ce que properties_type_check accepte. Sans ça, choisir « Villa » échoue
     à l'enregistrement avec une erreur 23514 que personne ne lit. */
  const typeCheck = sql.match(/properties_type_check CHECK \(([\s\S]*?)\)\);/);
  if (typeCheck) {
    const allowed = [...typeCheck[1].matchAll(/'([^']+)'::text/g)].map(x => x[1]);
    const vocab = app.match(/const TYPE_FR = \{([\s\S]*?)\n\};/);
    const offered = vocab
      ? [...vocab[1].matchAll(/(?:^|\s|')([a-z-]+)'?\s*:/g)].map(x => x[1])
      : [];
    const bad = offered.filter(t => !allowed.includes(t));
    checks.push([
      bad.length
        ? `properties : type(s) ${bad.join(', ')} proposé(s) mais refusé(s) par le CHECK`
        : `properties : les ${offered.length} types proposés sont tous autorisés`,
      offered.length > 0 && bad.length === 0
    ]);
  }

  return { title: 'Colonnes du code vs schéma', checks };
}

module.exports = { run };
