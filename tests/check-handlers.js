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

  return {
    title: 'Gestionnaires onclick',
    checks: [[
      missing.length
        ? `introuvable(s) : ${missing.join(', ')}`
        : `${called.length} fonction(s) appelée(s), toutes déclarées`,
      missing.length === 0
    ]]
  };
}

module.exports = { run };
