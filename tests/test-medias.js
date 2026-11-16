/* Médias d'une annonce déjà en ligne — netlify/functions/crm-medias.js du site.
 *
 * Raison d'être (16/11/2026) : les annonces publiées depuis le CRM n'avaient
 * aucun écran pour recevoir les photos arrivées après coup. Le site applique
 * les règles (nouveau média en couverture, affiche retirée) ; ce qui peut se
 * casser ICI sans bruit : envoyer l'affiche dans « garder » (elle resterait
 * en couverture), mettre l'annonce à jour avant que les photos soient
 * parties (URL mortes), ou oublier la case « aucune photo tamponnée ».
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
  const checks = [];
  const ok = (label, pass) => checks.push([label, !!pass]);

  /* medTotal : le plafond de 15 porte sur ce qui RESTERA en ligne. */
  const scope = new Function([
    'const PHOTOS_MAX = 15;',
    grab(/const medView = [^\n]*/, 'medView'),
    grab(/function medTotal[\s\S]*?\n}/, 'medTotal'),
    'return { medView, medTotal };'
  ].join('\n'))();
  const { medView, medTotal } = scope;
  Object.assign(medView, {
    actuelles: ['affiche', 'p1', 'p2', 'p3'], affiche: 'affiche',
    retirees: new Set(['p2']), photos: [{}, {}]
  });
  ok('total : affiche et photos retirées non comptées (2 gardées + 2 neuves = 4)', medTotal() === 4);

  const enreg = grab(/async function medEnregistrer[\s\S]*?\n}/, 'medEnregistrer');
  ok('« garder » exclut l’affiche et les photos retirées',
     /const garder = medView\.actuelles\.filter\(u => u !== medView\.affiche && !medView\.retirees\.has\(u\)\)/.test(enreg));
  ok('case « aucun média tamponné » exigée', enreg.indexOf("getElementById('med-propres').checked") !== -1);
  const iPhotos = enreg.indexOf("'crm-image-upload-url'"), iVideo = enreg.indexOf("'crm-video-upload-url'"),
        iMaj = enreg.indexOf("action: 'enregistrer'");
  ok('photos et vidéo envoyées AVANT la mise à jour de l’annonce', iPhotos > -1 && iVideo > iPhotos && iMaj > iVideo);
  ok('vidéo seule : son image sert de couverture', /if \(medView\.video && !blobs\.length\)[\s\S]{0,120}imageDeVideo/.test(enreg));

  const bouton = grab(/const medias = \([^\n]*/, 'bouton Médias');
  ok('bouton « Médias » : seulement un bien en ligne au code CF/SL',
     bouton.indexOf('p.listing_slug') !== -1 && bouton.indexOf('(CF|SL)') !== -1);
  ok('bouton « Médias » affiché dans la liste des biens', /\$\{publier\}\$\{medias\}/.test(src));
  ok('durée vidéo : 90 s, comme crm-video-upload-url du site', /const VIDEO_MAX_S = 90;/.test(src));

  return { title: 'Médias d’une annonce en ligne (crm-medias)', checks };
}

module.exports = { run };
