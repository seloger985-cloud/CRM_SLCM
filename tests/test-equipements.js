/* Les équipements repérés dans un message collé (sql/15).
 *
 * La détection est une RÈGLE (mots-clés + négation juste avant) : ces cas
 * fixent ce qu'elle doit trouver, et surtout ce qu'elle ne doit pas
 * inventer — une case cochée à tort part ensuite sur le site.
 *
 * Le bloc est lu dans app.js tel quel : pas de copie à tenir à jour.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const debut = app.indexOf('const EQUIPEMENTS = [');
  const fin = app.indexOf('/* Ce que le message ne disait pas.');
  const checks = [];
  if (debut < 0 || fin < debut) {
    checks.push(['le bloc EQUIPEMENTS est présent dans app.js', false]);
    return { title: 'Équipements dans un message collé', checks };
  }
  const { EQUIPEMENTS, detecterEquipements } = new Function(app.slice(debut, fin) + '\nreturn { EQUIPEMENTS, detecterEquipements };')();
  const trouve = (t) => Object.keys(detecterEquipements(t)).sort().join(',');

  checks.push(['les 7 cases du site, mêmes noms de colonnes',
    EQUIPEMENTS.map(e => e.k).sort().join(',') === 'climatisation,forage,gardien,generator,parking,pool,videosurveillance']);
  checks.push(['parking, groupe électrogène, forage, gardien',
    trouve('Appartement 3ch meublé, parking, groupe électrogène, forage. Gardien 24h/24') === 'forage,gardien,generator,parking']);
  checks.push(['piscine, clim, caméras',
    trouve('Villa avec piscine, clim dans toutes les chambres, caméras de surveillance') === 'climatisation,pool,videosurveillance']);
  checks.push(['« sans parking », « pas de piscine » ne cochent rien ; « Climatisé. » coche',
    trouve('Studio sans parking, pas de piscine. Climatisé.') === 'climatisation']);
  checks.push(['« offre de groupe » n’est pas un groupe électrogène',
    trouve('Offre de groupe : 3 terrains à Logpom') === '']);
  checks.push(['splits, château d’eau, vigile, groupe de secours',
    trouve("Duplex, 2 splits, château d'eau, vigile, groupe de secours") === 'climatisation,forage,gardien,generator']);
  checks.push(['« Clinique » n’est pas une clim', trouve('Clinique à vendre') === '']);
  checks.push(['message vide → rien', trouve('') === '']);
  return { title: 'Équipements dans un message collé', checks };
}

module.exports = { run };
