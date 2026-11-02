/* Lecture d'un export de groupe WhatsApp — assets/js/capture.js (sql/16).
 *
 * Raison d'être : tout ce qui suit l'import repose sur ce découpage. Un
 * message mal coupé donne une annonce tronquée ; un bavardage retenu coûte
 * un appel d'analyse ; une empreinte instable réimporte le même bien à
 * chaque export. Aucun de ces défauts ne se voit à l'écran.
 */
const C = require('../assets/js/capture.js');

/* Un extrait fidèle aux exports Android, marques invisibles comprises. */
const ANDROID = [
  '02/11/2026 08:01 - Les messages et les appels sont chiffrés de bout en bout.',
  '02/11/2026 08:05 - Paul Logpom: Bonjour à tous',
  '02/11/2026 08:07 - Paul Logpom: Terrain titré à vendre Logpom',
  '591 m² à 140 mille le m²',
  'Accès bitumé',
  '02/11/2026 08:09 - +237 6 99 12 45 78: <Médias omis>',
  '02/11/2026 08:10 - +237 6 99 12 45 78: Appartement 3 chambres meublé Bonapriso 350k le mois \u200e<Ce message a été modifié>',
  '02/11/2026 08:12 - Marie: Je cherche un studio à Bali budget 100k',
  '02/11/2026 08:13 - Marie: Dispo ?',
  '02/11/2026 08:20 - Paul Logpom a ajouté Jean',
  '02/11/2026 08:25 - Jean: TERRAIN TITRÉ à vendre LOGPOM !!',
  '591 m2 à 140 mille le m2',
  'Accès bitumé',
  '02/11/2026 08:30 - Jean: Ce message a été supprimé'
].join('\r\n');

const IPHONE = '[02/11/26 9:05:12 PM] Ali: Villa duplex 5 chambres à louer Makepe 800 000 fcfa\n[02/11/26 9:06:00 PM] Ali: image absente';

function run() {
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  const { messages, systeme } = C.decouper(ANDROID);
  ok('messages système comptés à part (chiffrement, ajout)', systeme === 2);
  ok('un message vidé par « Médias omis » n’est pas gardé', !messages.some(m => /médias/i.test(m.texte)));
  ok('un message supprimé n’est pas gardé', !messages.some(m => /supprimé/.test(m.texte)));
  const terrain = messages.find(m => m.auteur === 'Paul Logpom' && /Terrain/.test(m.texte));
  ok('les lignes de suite restent dans leur message', terrain && /591 m²/.test(terrain.texte) && /bitumé/.test(terrain.texte));
  ok('date lue à la française, à UTC+1', terrain && terrain.posted_at === '2026-11-02T08:07:00+01:00');
  const appart = messages.find(m => /Appartement/.test(m.texte));
  ok('auteur sous forme de numéro conservé tel quel', appart && appart.auteur === '+237 6 99 12 45 78');
  ok('la mention « message modifié » est retirée', appart && !/modifié/.test(appart.texte));

  const iphone = C.decouper(IPHONE).messages;
  ok('format iPhone : crochets, secondes, PM', iphone.length === 1 && iphone[0].posted_at === '2026-11-02T21:05:12+01:00');

  ok('offre reconnue : terrain au m²', C.ressembleAnnonce(terrain.texte));
  ok('offre reconnue : appartement avec loyer', C.ressembleAnnonce(appart.texte));
  ok('salutation écartée', !C.ressembleAnnonce('Bonjour à tous, belle journée au groupe !'));
  ok('« Dispo ? » écarté', !C.ressembleAnnonce('Dispo ?'));
  ok('une DEMANDE n’est pas une offre', !C.ressembleAnnonce('Je cherche un studio à Bali budget 100k pour un client sérieux'));
  ok('« Mon client cherche » écarté aussi', !C.ressembleAnnonce('Mon client cherche un terrain titré à Logpom 500 m², budget 60 millions'));

  ok('empreinte stable malgré casse, accents, ponctuation, m²/m2',
    C.empreinte('Terrain titré à vendre Logpom\n591 m² à 140 mille le m²\nAccès bitumé')
      !== C.empreinte('Villa à louer') &&
    C.empreinte('TERRAIN TITRÉ à vendre LOGPOM !!\n591 m2 à 140 mille le m2\nAccès bitumé')
      === C.empreinte('Terrain titre a vendre logpom 591 m2 a 140 mille le m2 acces bitume'));

  const p = C.preparer(ANDROID, 'Pros Douala');
  ok('le même terrain reposté par Jean n’est gardé qu’une fois', p.annonces.filter(a => /logpom/i.test(a.message)).length === 1);
  ok('… et c’est la première parution qui reste', p.annonces.find(a => /logpom/i.test(a.message)).auteur === 'Paul Logpom');
  ok('2 annonces retenues sur l’extrait', p.annonces.length === 2);
  ok('le groupe est porté par chaque annonce', p.annonces.every(a => a.groupe === 'Pros Douala'));

  ok('nom du groupe tiré du fichier (Android FR)', C.groupeDepuisFichier('Discussion WhatsApp avec Pros Immo Douala.txt') === 'Pros Immo Douala');
  ok('nom du groupe tiré du fichier (anglais)', C.groupeDepuisFichier('WhatsApp Chat with Terrains 237.txt') === 'Terrains 237');
  ok('« _chat.txt » (iPhone) ne donne pas de nom', C.groupeDepuisFichier('_chat.txt') === null);

  return { title: 'Capture des groupes WhatsApp', checks };
}

module.exports = { run };
