/* Vignettes d'identification des biens.
 *
 * Raison d'être : les titres d'annonces se ressemblent au point d'être
 * indiscernables — « Appartement 02ch Bonapriso » revient cinq fois dans le
 * stock. La photo est ce qui les sépare.
 *
 * Ce que ces contrôles protègent, en particulier :
 *   - une URL d'image entre désormais dans du HTML généré. Si elle n'est pas
 *     échappée, une annonce dont le nom de fichier contient un guillemet
 *     casse l'attribut, et le reste devient du balisage ;
 *   - `images` vient d'une base que ce dépôt ne contrôle pas. Un champ
 *     absent, nul, vide ou mal typé doit donner une vignette de repli, pas
 *     une exception qui vide l'écran Propriétés ;
 *   - deux biens sans photo doivent malgré tout porter deux pastilles
 *     différentes, sinon la vignette ne sert à rien.
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
    /* escAttr s'appuie sur escHtml : extraire l'un sans l'autre donne
       « escHtml is not defined » au premier appel. */
    grab(/function escHtml[\s\S]*?\n}/, 'escHtml'),
    grab(/function escAttr[\s\S]*?\n}/, 'escAttr'),
    grab(/function coverOf[\s\S]*?\n}/, 'coverOf'),
    grab(/const TYPE_CODE = \{[\s\S]*?\n\};/, 'TYPE_CODE'),
    grab(/function hueFrom[\s\S]*?\n}/, 'hueFrom'),
    grab(/function thumbHtml[\s\S]*?\n}/, 'thumbHtml')
  ].join('\n') + '\nreturn { coverOf, hueFrom, thumbHtml, TYPE_CODE };')();

  const { coverOf, hueFrom, thumbHtml, TYPE_CODE } = scope;
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  /* ── coverOf : la première photo, ou rien ── */
  ok('la première photo est retenue',
     coverOf({ images: ['https://a/1', 'https://a/2'] }) === 'https://a/1');
  ok('une annonce sans champ images donne null',
     coverOf({ title: 'x' }) === null);
  ok('un tableau vide donne null',
     coverOf({ images: [] }) === null);
  ok('null ou undefined ne lève pas',
     coverOf(null) === null && coverOf(undefined) === null);
  ok('une chaîne à la place du tableau donne null',
     coverOf({ images: 'https://a/1' }) === null);
  ok('les entrées non-chaînes sont ignorées',
     coverOf({ images: [null, 42, {}, 'https://a/3'] }) === 'https://a/3');
  ok('une entrée vide est ignorée',
     coverOf({ images: ['   ', 'https://a/4'] }) === 'https://a/4');

  /* ── hueFrom : stable, et discriminant ── */
  ok('la même clé donne toujours la même teinte',
     hueFrom('abc-123') === hueFrom('abc-123'));
  ok('deux clés voisines donnent deux teintes différentes',
     hueFrom('bien-1') !== hueFrom('bien-2'));
  ok('la teinte reste dans 0-359',
     [0, 1, 'x', 'un-identifiant-assez-long-4f2a', 99999]
       .every(k => { const h = hueFrom(k); return h >= 0 && h < 360 && Number.isInteger(h); }));
  ok('une clé absente ne lève pas',
     hueFrom(null) === hueFrom(undefined));

  /* ── thumbHtml : le HTML produit ── */
  const avec = thumbHtml('https://a/1.jpg', 'bien-1', 'apartment');
  ok('avec photo, une balise img est produite', /<img /.test(avec));
  ok('avec photo, le chargement est paresseux — 200 biens à ~95 Ko',
     /loading="lazy"/.test(avec));
  ok('avec photo, onerror retire l’image cassée',
     /onerror="this\.remove\(\)"/.test(avec));

  const sans = thumbHtml(null, 'bien-2', 'studio');
  ok('sans photo, aucune balise img', !/<img/.test(sans));
  ok('sans photo, le code de type est porté par data-code',
     /data-code="STU"/.test(sans));
  ok('un type inconnu ne casse pas la vignette',
     /data-code="/.test(thumbHtml(null, 'x', 'chalet-en-bois')));
  ok('un type absent ne casse pas la vignette',
     /data-code="/.test(thumbHtml(null, 'x', null)));

  ok('deux biens sans photo portent deux teintes différentes',
     thumbHtml(null, 'bien-1', 'apartment') !== thumbHtml(null, 'bien-2', 'apartment'));

  /* ── L'échappement : le vrai risque ──
     Critère : aucune balise ÉTRANGÈRE ne doit sortir. On ne cherche pas une
     sous-chaîne (« onerror= » est inoffensif dans du texte échappé), on
     compte les balises réellement ouvertes. */
  const hostile = thumbHtml(
    'https://a/x.jpg" onload="alert(1)"><script>alert(2)</script><img src="',
    'bien-3', 'villa');
  const balises = (hostile.match(/<[a-zA-Z]/g) || []).length;
  ok('une URL hostile n’ouvre aucune balise supplémentaire (span + img = 2)',
     balises === 2);
  ok('une URL hostile ne fait pas sortir de script',
     !/<script/i.test(hostile));
  ok('les guillemets de l’URL sont échappés',
     hostile.indexOf('&quot;') !== -1);

  /* ── Le vocabulaire ── */
  const TYPES_SQL = ['apartment', 'studio', 'villa', 'house', 'duplex', 'building',
    'plots-of-land', 'warehouse', 'office', 'shop', 'commercial'];
  ok('les 11 types acceptés par la base ont tous un code',
     TYPES_SQL.every(t => typeof TYPE_CODE[t] === 'string' && TYPE_CODE[t].length));
  ok('aucun code n’est en double — sinon deux types se confondraient',
     new Set(Object.values(TYPE_CODE)).size === Object.keys(TYPE_CODE).length);

  /* ── site.js doit réellement demander la colonne ──
     Sans ça les vignettes seraient muettes côté site, sans aucune erreur. */
  const site = fs.readFileSync(path.join(ROOT, 'assets/js/site.js'), 'utf8');
  const cols = (site.match(/const COLS = '([^']*)'/) || [])[1] || '';
  ok('site.js demande la colonne images', cols.split(',').indexOf('images') !== -1);

  return { title: 'Vignettes des biens', checks };
}

module.exports = { run };
