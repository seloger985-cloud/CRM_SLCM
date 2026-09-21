/* Toute fonction appelée depuis un `onclick` doit exister.
 *
 * Raison d'être : le bouton « Rapprochements » est resté inerte pendant des
 * semaines. Il était câblé en `onclick="navTo(this, showMatching)"` — or
 * `navTo` FABRIQUE un gestionnaire, elle ne navigue pas. Le clic partait
 * dans le vide, sans erreur en console, et tout l'écran de rapprochement
 * était inaccessible. Ce contrôle attrape la famille entière : un nom mal
 * orthographié, une fonction renommée, un raccourci laissé derrière.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const JS = ['config.js', 'auth.js', 'site.js', 'match.js', 'ui.js', 'app.js'];
const PAGES = ['index.html', 'login.html'];
const BUILTIN = new Set(['alert', 'confirm', 'print', 'history']);

function run() {
  const js = JS.map(f => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n');
  const html = PAGES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

  const declared = new Set([
    ...[...js.matchAll(/^(?:async\s+)?function\s+(\w+)/gm)].map(m => m[1]),
    ...[...js.matchAll(/^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\()/gm)].map(m => m[1])
  ]);

  const called = [...new Set([...(js + '\n' + html).matchAll(/onclick="(\w+)\(/g)].map(m => m[1]))];
  const missing = called.filter(f => !declared.has(f) && !BUILTIN.has(f));

  /* Tout getElementById('…-btn') doit trouver son id dans le balisage.
   *
   * Raison d'être : app.js range ces éléments dans des `const` au CHARGEMENT,
   * puis appelle addEventListener dessus. Un id mal orthographié donne null,
   * donc « Cannot read properties of null » pendant l'exécution du fichier —
   * et c'est le CRM ENTIER qui ne démarre plus, pas seulement le bouton.
   *
   * Aucun autre contrôle ne peut le voir : le faux navigateur de test-screens
   * renvoie un élément pour n'importe quel id, par construction. Il fallait
   * confronter le JS au balisage réel.
   */
  const ids = [...new Set([...js.matchAll(/getElementById\('([\w-]+-btn)'\)/g)].map(m => m[1]))];
  const orphelins = ids.filter(id => html.indexOf('id="' + id + '"') === -1);

  /* Et l'inverse : une entrée de navigation que personne ne branche est un
     bouton mort à l'écran — le défaut d'origine de « Rapprochements ».
     On cherche dans le JS *et* dans le HTML : `logout-btn` est branché par un
     <script> en ligne d'index.html, et ne pas l'admettre ferait crier ce
     contrôle sur un bouton parfaitement fonctionnel. */
  const nav = [...new Set([...html.matchAll(/<button id="([\w-]+-btn)"/g)].map(m => m[1]))];
  const tout = js + '\n' + html;
  const inertes = nav.filter(id => tout.indexOf("getElementById('" + id + "')") === -1);

  return {
    title: 'Gestionnaires onclick et boutons',
    checks: [
      [missing.length
        ? `introuvable(s) : ${missing.join(', ')}`
        : `${called.length} fonction(s) appelée(s), toutes déclarées`,
       missing.length === 0],
      [orphelins.length
        ? `id demandé par app.js mais absent du HTML : ${orphelins.join(', ')}`
        : `${ids.length} bouton(s) cherché(s) par le JS, tous présents dans le balisage`,
       orphelins.length === 0],
      [inertes.length
        ? `bouton affiché mais jamais branché : ${inertes.join(', ')}`
        : `${nav.length} bouton(s) du balisage, tous branchés côté JS`,
       inertes.length === 0]
    ]
  };
}

module.exports = { run };
