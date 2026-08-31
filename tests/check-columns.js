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
  const sql = fs.readFileSync(path.join(ROOT, 'sql/01_schema.sql'), 'utf8');
  const checks = [];

  const schema = {};
  for (const m of sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    schema[m[1]] = m[2].split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('--')).map(l => l.split(/\s+/)[0]);
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

  /* Les statuts proposés doivent être acceptés par la contrainte CHECK. */
  const check = sql.match(/payments_status_check CHECK \(\(status = ANY \(ARRAY\[([^\]]+)\]/);
  if (check) {
    const allowed = [...check[1].matchAll(/'([^']+)'::text/g)].map(x => x[1]);
    const form = [...app.matchAll(/<option value="(\w+)" \$\{v\.status/g)].map(x => x[1]);
    const bad = form.filter(x => !allowed.includes(x));
    checks.push([
      bad.length
        ? `payments : statut(s) ${bad.join(', ')} refusé(s) par le CHECK`
        : `payments : statuts du formulaire (${form.join(', ')}) tous autorisés`,
      bad.length === 0
    ]);
  }

  return { title: 'Colonnes du code vs schéma', checks };
}

module.exports = { run };
