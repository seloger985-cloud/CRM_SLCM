/* Suggestions de saisie et valeurs retenues — sans IA.
 *
 * Raison d'être : les suggestions ne devinent rien, elles rappellent ce qui a
 * déjà été saisi. Le but n'est pas de taper moins vite mais d'éviter les
 * variantes : « Bonapriso », « bonapriso » et « Bonaprisso » sont trois
 * quartiers pour une base et un seul pour un humain — et c'est précisément ce
 * genre d'écart qui rend un rapprochement muet sans qu'on comprenne pourquoi.
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
    grab(/function looseKey[\s\S]*?\n}/, 'looseKey'),
    grab(/function suggestFrom[\s\S]*?\n}/, 'suggestFrom')
  ].join('\n') + '\nreturn { looseKey, suggestFrom };')();
  const { looseKey, suggestFrom } = scope;

  const ADRESSES = ['Bonapriso, Douala', 'Akwa, Douala', 'Logpom, Douala', null, '', 'x'];
  const QUARTIERS = ['Bonapriso', 'Bali', 'Makepe'];
  const suggest = suggestFrom(ADRESSES, QUARTIERS);
  const labels = q => suggest(q).map(i => i.label);

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  ok('la casse est ignorée', labels('bonap').includes('Bonapriso, Douala'));
  ok('les accents sont ignorés', looseKey('Maképé') === looseKey('makepe'));
  ok('la recherche porte sur tout le libellé', labels('douala').length === 3);
  ok('les quartiers connus complètent les adresses déjà saisies',
     labels('bali').includes('Bali'));
  ok('les valeurs vides sont écartées', !labels('').includes(''));
  ok('les valeurs d’un seul caractère sont écartées', !labels('x').includes('x'));
  ok('aucun doublon dans les propositions',
     new Set(labels('douala')).size === labels('douala').length);
  ok('les propositions sont triées', (() => {
    const l = labels('douala');
    return l.join('|') === l.slice().sort((a, b) => a.localeCompare(b, 'fr')).join('|');
  })());
  ok('au plus huit propositions', suggestFrom(
    Array.from({ length: 30 }, (_, i) => 'Quartier ' + i))('quartier').length === 8);
  ok('une recherche sans écho ne propose rien', labels('yaoundé').length === 0);

  return { title: 'Suggestions de saisie', checks };
}

module.exports = { run };
