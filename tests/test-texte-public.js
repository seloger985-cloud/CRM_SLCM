/* Texte public d'une annonce — rédigé depuis le message d'origine (15/11/2026).
 *
 * Raison d'être : la description publiée sur selogercm.com vient désormais
 * du message du confrère. Une seule fuite — son nom, son agence, son
 * numéro — et le client l'appelle directement. Le modèle est consigné, mais
 * le code revérifie : ces contrôles tiennent cette seconde couche, et le
 * repli (lignes du visuel) quand il n'y a pas de texte.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const T = require(path.join(ROOT, 'assets/js/texte-public.js'));
  const checks = [];
  const ok = (l, v) => checks.push([l, !!v]);

  const paul = { id: 3, name: 'Confrère Paul Ekwalla', agency: 'Ekwalla Immo Services', wa_alias: 'Paul Terrains 237' };
  const mots = T.interdits(paul, { auteur: 'Paul Terrains 237' });
  ok('interdits : prénom, nom, alias (hors « Confrère »)', ['paul', 'ekwalla', 'terrains'].some(m => mots.includes(m)) && mots.includes('ekwalla') && !mots.includes('confrere'));
  ok('interdits : pas les mots communs d’agence (immo, services)', !mots.includes('immo') && !mots.includes('services'));
  ok('interdits : un auteur qui n’est qu’un numéro n’ajoute rien', T.interdits(null, { auteur: '+237 699 12 45 78' }).length === 0);
  ok('interdits : rien du tout, rien', T.interdits(null, null).length === 0);

  ok('trace : nom retrouvé malgré casse et accents', T.trace('Terrain titré, voir EKWALLA.', ['ekwalla']) === 'ekwalla');
  ok('trace : mot entier seulement (« paulette » n’est pas « paul »)', T.trace('Rue Paulette, accès facile.', ['paul']) === '');
  ok('trace : texte propre', T.trace('Terrain de 500 m² titré, accès bitumé.', mots) === '');

  ok('message : l’offre captée d’abord',
     T.messageDOrigine({ description: 'note interne' }, { message: 'Terrain 500 m² titré à Lendi' }) === 'Terrain 500 m² titré à Lendi');
  ok('message : sinon la description, sans la ligne « Vu dans »',
     T.messageDOrigine({ description: 'Terrain titré Lendi\n\nVu dans « Immo Pro » le 12/11/2026' }, null) === 'Terrain titré Lendi');
  ok('message : « Importé depuis selogercm.com » n’est pas un message', T.messageDOrigine({ description: 'Importé depuis selogercm.com' }, null) === '');
  ok('message : fiche vide → vide', T.messageDOrigine(null, null) === '');

  ok('description : lieu puis texte rédigé, sans les lignes du visuel',
     T.description('Lendi, Carrefour', 'Terrain titré.', ['Ligne 2', 'Ligne 3']) === 'Situé : Lendi, Carrefour.\nTerrain titré.');
  ok('description : sans texte, les lignes du visuel comme avant',
     T.description('Lendi', '', ['Ligne 2', '', 'Ligne 3']) === 'Situé : Lendi.\nLigne 2\nLigne 3');

  ok('motif : une fonction ancienne se reconnaît', /redéployer/.test(T.motif('paquet_vide')) && /redéployer/.test(T.motif('mode_inconnu')));
  ok('motif : la trace nomme le mot', /ekwalla/.test(T.motif('trace_annonceur : ekwalla')));

  /* La fonction et le module disent la même chose */
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/capture-annonces/index.ts'), 'utf8');
  ok('fonction : le mode « rediger » existe et la version est montée', /body\.mode === 'rediger'/.test(fn) && /VERSION = '2026-11-15-a'/.test(fn));
  ok('fonction : le prix est exclu du texte (consigne)', /LE PRIX N'Y FIGURE PAS/.test(fn));
  ok('fonction : numéros, liens et e-mails effacés par le code', /replace\(LIEN, ''\)\.replace\(COURRIEL, ''\)\.replace\(NUMERO, ''\)/.test(fn));
  ok('fonction : paquet de rédaction ≤ 20 (un lot)', /const REDIGER_MAX = 20;/.test(fn));

  /* Branchements */
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const visuel = fs.readFileSync(path.join(ROOT, 'visuel-terrain-bonapriso.html'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('chargé par index.html et par la page visuel', /texte-public\.js/.test(index) && /texte-public\.js/.test(visuel));
  ok('texte_public hors de TABLE_COLS (la liste des biens survit sans sql/20)',
     !/properties:\s*'[^']*texte_public/.test(app));
  ok('publication avec photos : contrôle de trace avant envoi', /SLCM_TEXTE\.trace\(texte/.test(app) && /preRemplirTexte\(p\)/.test(app));
  ok('page visuel : description via SLCM_TEXTE.description', /SLCM_TEXTE\.description\(lieu, texte/.test(visuel));

  return { title: 'Texte public depuis le message d’origine (sql/20)', checks };
}

module.exports = { run };
