/* Les migrations doivent pouvoir se jouer dans l'ordre des numéros.
 *
 * Raison d'être : le 20/10/2026, `sql/10_immeubles.sql` a été joué avant
 * `sql/09_gestion_locative.sql`. Il lit `public.leases`, que 09 crée — tout
 * le fichier a échoué sur « relation public.leases does not exist », y
 * compris les colonnes ajoutées plus haut qui n'avaient, elles, aucune
 * dépendance.
 *
 * L'ordre des fichiers était bon : c'est l'exécution qui avait sauté une
 * étape, et rien dans le fichier ne signalait la dépendance. Deux réponses :
 * une garde `to_regclass` dans 10, et ce contrôle — qui vérifie qu'aucune
 * migration ne s'appuie sur une table créée PLUS TARD. Ce serait alors
 * impossible à jouer, quel que soit le soin de l'opérateur.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* Le SQL débarrassé de ses commentaires ET de ses chaînes.
 *
 * Indispensable : `00_introspection.sql` GÉNÈRE du DDL sous forme de texte
 * (`format('alter table public.%I …')`). Chercher « alter table » dans le
 * fichier entier le prend pour une migration déguisée — et un contrôle qui
 * crie sur du code correct finit par être ignoré. */
function nu(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/E?'(?:[^']|'')*'/g, "''");
}

/* Les tables référencées par un fichier. On ignore `create table`, qui les
   définit, et `to_regclass('public.x')`, qui sert justement à tester leur
   absence sans échouer. */
function referencees(sql) {
  const sansCreate = nu(sql).replace(/create table (?:if not exists )?public\.\w+/g, '')
                            .replace(/to_regclass\([^)]*\)/g, '');
  const out = new Set();
  const motifs = [
    /\bfrom\s+public\.(\w+)/g,
    /\bjoin\s+public\.(\w+)/g,
    /\bupdate\s+public\.(\w+)/g,
    /\binsert\s+into\s+public\.(\w+)/g,
    /\bdelete\s+from\s+public\.(\w+)/g,
    /\balter\s+table\s+public\.(\w+)/g,
    /\breferences\s+public\.(\w+)/g,
    /\bon\s+public\.(\w+)/g
  ];
  motifs.forEach(re => {
    for (const m of sansCreate.matchAll(re)) out.add(m[1]);
  });
  return [...out];
}

function run() {
  const dir = path.join(ROOT, 'sql');
  const fichiers = fs.readdirSync(dir)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort();

  const checks = [];
  const connues = new Set();
  let fautes = 0;

  for (const f of fichiers) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');

    /* D'abord ce que CE fichier crée : une migration peut créer une table et
       s'en servir plus bas, c'est légitime. */
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)) {
      connues.add(m[1]);
    }

    const manquantes = referencees(sql).filter(t => !connues.has(t));
    if (manquantes.length) {
      checks.push([`${f} s'appuie sur ${manquantes.join(', ')} — créée(s) plus tard ou jamais`, false]);
      fautes++;
    }
  }

  if (!fautes) {
    checks.push([
      `${fichiers.length} migration(s) jouables dans l'ordre des numéros (${connues.size} tables)`,
      true
    ]);
  }

  /* Un CTE déclaré doit être LU.
   *
   * Raison d'être : la requête de vérification de `10_immeubles.sql` déclarait
   * `with attendu(objet, present) as (…)` puis agrégeait `string_agg(objet…)`
   * sans jamais écrire `from attendu`. Postgres répond « column "objet" does
   * not exist » — message qui désigne une colonne alors que la faute est une
   * clause absente.
   *
   * C'est le pire endroit pour une faute : la migration a RÉUSSI, et seule sa
   * vérification échoue. L'agent croit que tout a raté et rejoue, ou pire,
   * renonce. */
  for (const f of fichiers) {
    const sql = nu(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const m of sql.matchAll(/\bwith\s+(\w+)\s*\([^)]*\)\s+as\s*\(/gi)) {
      const nom = m[1];
      const lu = new RegExp('\\b(?:from|join)\\s+' + nom + '\\b', 'i').test(sql);
      if (!lu) checks.push([`${f} : le CTE « ${nom} » est déclaré mais jamais lu (from ${nom} manquant)`, false]);
    }
  }

  /* Une vérification ne doit pas dépendre de ce qu'elle vérifie.
   *
   * Raison d'être : la requête finale de `10_immeubles.sql` comptait
   * `from public.properties where landlord_id is not null` — or `landlord_id`
   * est la colonne que ce fichier ajoute. Si l'ajout échoue, la vérification
   * échoue aussi, et avec un message qui parle d'autre chose.
   *
   * Et le coût est bien pire qu'un mauvais message : l'éditeur SQL de Supabase
   * joue le fichier dans UNE transaction, donc cette erreur finale ANNULE tout
   * ce qui a réussi avant. La migration paraît jouée alors que rien ne l'est.
   *
   * Règle : dans le bloc de vérification, une colonne ajoutée par le fichier
   * ne peut apparaître que comme valeur comparée (`column_name = 'x'`). */
  /* La bannière se reconnaît aux CAPITALES, et la recherche est donc
     sensible à la casse.
     Discriminant vérifié sur le dossier, pas supposé : « VÉRIFICATION » en
     capitales n'apparaît que dans les trois bannières (08, 09, 10), tandis
     que les en-têtes écrivent « la requête de vérification en fin de
     fichier » en minuscules. Deux faux positifs étaient venus de là —
     partir de la mention d'en-tête faisait analyser le fichier entier,
     ALTER compris.
     Les migrations sans bannière ne sont pas jugées, plutôt que de deviner
     où commence leur vérification. */
  for (const f of fichiers) {
    const brut = fs.readFileSync(path.join(dir, f), 'utf8');
    let i = -1;
    for (const m of brut.matchAll(/VÉRIFICATION/g)) i = m.index;
    if (i < 0) continue;
    const bloc = nu(brut.slice(i));
    const ajoutees = [...nu(brut).matchAll(/add column if not exists\s+(\w+)/g)].map(m => m[1]);
    const fautives = ajoutees.filter(c => new RegExp('\\b' + c + '\\b').test(bloc));
    if (fautives.length) {
      checks.push([
        `${f} : la vérification lit ${fautives.join(', ')}, colonne(s) que ce fichier ajoute`,
        false
      ]);
    }
  }

  /* `00_introspection.sql` ne crée rien et ne doit rien modifier : il sert à
     relire le schéma. Une migration déguisée en introspection passerait
     inaperçue au moment de rejouer la base depuis zéro. */
  const intro = path.join(dir, '00_introspection.sql');
  if (fs.existsSync(intro)) {
    const sql = nu(fs.readFileSync(intro, 'utf8'));
    const ecrit = /\b(create table|alter table|insert into|update |delete from|drop )/i.test(sql);
    checks.push(['00_introspection.sql ne modifie rien', !ecrit]);
  }

  return { title: 'Ordre des migrations', checks };
}

module.exports = { run };
