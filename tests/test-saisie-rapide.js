/* Saisie rapide : un contact et son activité en un seul enregistrement.
 *
 * Raison d'être : le 09/11/2026, le client perdu avait été vu en visite, mais
 * sa fiche n'a jamais été créée — il fallait deux formulaires, sur deux
 * écrans, et sur le terrain ça ne se fait pas. L'écran qui les réunit ne vaut
 * que si trois choses tiennent :
 *   · il ne crée pas de doublon quand le numéro est déjà connu ;
 *   · il applique la même règle de suite que le formulaire d'activité ;
 *   · le lien `#saisie-rapide` du rappel Telegram survit à la page de
 *     connexion — sinon l'agent atterrit sur le tableau de bord.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

async function run() {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const grab = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error('introuvable dans app.js : ' + label);
    return m[0];
  };
  const scope = new Function([
    grab(/function normalizePhone[\s\S]*?\n}/, 'normalizePhone'),
    grab(/const CIVILITES = [^\n]*/, 'CIVILITES'),
    grab(/function normalizeName[\s\S]*?\n}/, 'normalizeName'),
    grab(/function findDuplicates[\s\S]*?\n}/, 'findDuplicates'),
    grab(/const OUTCOME_FR = \{[\s\S]*?\n\};/, 'OUTCOME_FR'),
    grab(/const TYPES_SUITE_REQUISE[^\n]*/, 'TYPES_SUITE_REQUISE'),
    grab(/const SUITE_VISITE_DEFAUT[^\n]*/, 'SUITE_VISITE_DEFAUT'),
    grab(/const SUITE_WHATSAPP_DEFAUT[^\n]*/, 'SUITE_WHATSAPP_DEFAUT'),
    grab(/function estSuiteParDefaut[\s\S]*?\n}/, 'estSuiteParDefaut'),
    grab(/function suiteRequise[\s\S]*?\n}/, 'suiteRequise'),
    grab(/function verifierSuite[\s\S]*?\n}/, 'verifierSuite'),
    grab(/const QUICK_TYPES[^\n]*/, 'QUICK_TYPES'),
    grab(/function statutNouveauClient[\s\S]*?\n}/, 'statutNouveauClient'),
    grab(/function preparerSaisieRapide[\s\S]*?\n}/, 'preparerSaisieRapide'),
    grab(/function memeNumero[\s\S]*?\n}/, 'memeNumero'),
    grab(/function appliquerProposition[\s\S]*?\n}/, 'appliquerProposition'),
    grab(/const ECRANS_FRAGMENT = \{[\s\S]*?\n\};/, 'ECRANS_FRAGMENT'),
    grab(/function ecranDeFragment[\s\S]*?\n}/, 'ecranDeFragment')
  ].join('\n') + '\nreturn { preparerSaisieRapide, memeNumero, appliquerProposition, ecranDeFragment, statutNouveauClient, SUITE_VISITE_DEFAUT };')();
  const { preparerSaisieRapide, memeNumero, appliquerProposition, ecranDeFragment, statutNouveauClient, SUITE_VISITE_DEFAUT } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  const PORTEFEUILLE = [
    { id: 1, name: 'M. Dicka', phone: '650 840 714' },
    { id: 2, name: 'Marthe Ngo', phone: '699124578' }
  ];
  const AUJ = '2026-11-10';
  const visite = (extra) => Object.assign({
    name: 'Paul Essomba', phone: '677 00 11 22', type: 'visit', notes: 'A aimé le salon',
    next_step: 'Relancer pour avoir son retour', next_date: '2026-11-11'
  }, extra);

  /* ── Le cas nominal : un inconnu rencontré en visite ── */
  const p = preparerSaisieRapide(visite(), PORTEFEUILLE, AUJ);
  ok('un nouveau contact donne une fiche client à créer', p.nouveauClient && p.nouveauClient.name === 'Paul Essomba');
  ok('et une activité datée du jour', p.activite && p.activite.date === AUJ && p.activite.type === 'visit');
  ok('la suite part avec l’activité', p.activite.next_step && p.activite.next_date === '2026-11-11');
  ok('après une visite, le client entre au pipeline à l’étape « visite »', p.nouveauClient.status === 'visite');
  ok('après un appel, il entre en « nouvelle demande »', statutNouveauClient('call') === 'nouvelle demande');
  ok('le numéro est gardé tel que saisi', p.nouveauClient.phone === '677 00 11 22');

  /* ── Les doublons ── */
  const d = preparerSaisieRapide(visite({ name: 'Dicka', phone: '+237650840714' }), PORTEFEUILLE, AUJ);
  ok('un numéro déjà connu, même écrit autrement, arrête l’enregistrement',
     d.doublons && d.doublons.length === 1 && d.doublons[0].client.id === 1);
  ok('rien n’est prêt à écrire tant que l’agent n’a pas tranché', !d.nouveauClient && !d.activite);
  const choisi = preparerSaisieRapide(visite({ phone: '650840714', client_id: 1 }), PORTEFEUILLE, AUJ);
  ok('fiche existante choisie : aucune fiche créée, l’activité y est rattachée',
     choisi.nouveauClient === null && choisi.client_id === 1 && choisi.activite);
  const autre = preparerSaisieRapide(visite({ name: 'M. Dicka', phone: '', creerQuandMeme: true }), PORTEFEUILLE, AUJ);
  ok('« c’est une autre personne » : la fiche est créée malgré l’homonyme', autre.nouveauClient && !autre.doublons);
  ok('pendant la frappe, le même numéro est signalé', memeNumero('00237 699 12 45 78', PORTEFEUILLE).length === 1);
  ok('un numéro incomplet ne signale rien', memeNumero('699', PORTEFEUILLE).length === 0);

  /* ── La règle de suite du lot 1 vaut ici aussi ── */
  ok('une visite sans suite est refusée, comme dans le formulaire',
     !!preparerSaisieRapide(visite({ next_step: '', next_date: '' }), PORTEFEUILLE, AUJ).erreur);
  const sans = preparerSaisieRapide(visite({ aucuneSuite: true }), PORTEFEUILLE, AUJ);
  ok('« Aucune suite nécessaire » : acceptée, et la suite pré-remplie est retirée',
     !sans.erreur && sans.activite.next_step === null && sans.activite.next_date === null);
  ok('un appel sans suite passe',
     !preparerSaisieRapide(visite({ type: 'call', next_step: '', next_date: '' }), PORTEFEUILLE, AUJ).erreur);

  /* ── Ce qui reste obligatoire, et ce qui ne l'est pas ── */
  ok('sans nom ni fiche choisie : refusé', !!preparerSaisieRapide(visite({ name: '  ' }), PORTEFEUILLE, AUJ).erreur);
  const muet = preparerSaisieRapide(visite({ notes: '' }), PORTEFEUILLE, AUJ);
  ok('une note vide n’empêche pas d’enregistrer (la base exige un texte : il est fourni)',
     !muet.erreur && muet.activite.notes.length > 0);
  ok('sans bien ni source, rien ne casse',
     p.activite.property_id === null && p.nouveauClient.source === null);

  /* ── La proposition tirée de la note ne remplace jamais une saisie ── */
  const prop = { name: 'Paul', phone: '677001122', type: 'meeting', outcome: 'pending',
                 next_step: 'Envoyer les photos du T3', next_date: '2026-11-12', manquant: [] };
  const plein = appliquerProposition({ name: 'Paul Essomba', phone: '', next_step: SUITE_VISITE_DEFAUT, next_date: '2026-11-11' }, prop);
  ok('un nom déjà tapé n’est pas remplacé', plein.name === undefined);
  ok('un champ vide est rempli', plein.phone === '677001122');
  ok('la suite proposée d’office cède la place à celle de la note',
     plein.next_step === 'Envoyer les photos du T3' && plein.next_date === '2026-11-12');
  const tape = appliquerProposition({ next_step: 'Rappeler jeudi', next_date: '2026-11-13' }, prop);
  ok('une suite écrite par l’agent est gardée', tape.next_step === undefined && tape.next_date === undefined);
  ok('la relance WhatsApp proposée d’office cède aussi la place à la note',
     appliquerProposition({ next_step: 'Relancer sur WhatsApp' }, prop).next_step === 'Envoyer les photos du T3');
  ok('la note peut dire « WhatsApp »', appliquerProposition({ type: 'visit' }, { type: 'whatsapp' }).type === 'whatsapp');
  ok('un type choisi à la main est gardé', appliquerProposition({ typeTouche: true }, prop).type === undefined);
  ok('une valeur hors vocabulaire est ignorée',
     appliquerProposition({}, { type: 'fax', outcome: 'peut-être', next_date: 'jeudi' }).type === undefined
     && appliquerProposition({}, { outcome: 'peut-être' }).outcome === undefined
     && appliquerProposition({}, { next_date: 'jeudi' }).next_date === undefined);
  ok('pas de proposition : rien ne bouge', Object.keys(appliquerProposition({}, null)).length === 0);

  /* ── Le lien profond ── */
  ok('#saisie-rapide désigne l’écran', ecranDeFragment('#saisie-rapide') === 'saisie-rapide');
  ok('un fragment inconnu ne désigne rien', ecranDeFragment('#toString') === null && ecranDeFragment('') === null);

  /* auth.js est EXÉCUTÉ, pas relu : sans session, il redirige vers la page
     de connexion, et c'est le fragment de CETTE redirection qui comptait. */
  const auth = fs.readFileSync(path.join(ROOT, 'assets/js/auth.js'), 'utf8');
  const executer = (loc, session) => new Promise((resolve) => {
    const win = {
      location: Object.assign({ replace: (u) => resolve(u) }, loc),
      SLCM_DB: { getClient: () => ({ auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => {}
      } }) }
    };
    const doc = { body: { style: {} }, dispatchEvent: () => resolve(null), addEventListener: () => {} };
    new Function('window', 'document', 'Event', auth)(win, doc, function Event() {});
    setTimeout(() => resolve('(aucune redirection)'), 200);
  });
  const vers = await executer({ pathname: '/index.html', search: '', hash: '#saisie-rapide' }, null);
  ok('sans session, la redirection garde #saisie-rapide',
     typeof vers === 'string' && decodeURIComponent(vers.split('next=')[1] || '') === '/index.html#saisie-rapide');
  const retour = await executer({ pathname: '/login.html', search: '?next=' + encodeURIComponent('/index.html#saisie-rapide'), hash: '' },
                                { user: { email: 'a@b.test' } });
  ok('après connexion, on revient sur #saisie-rapide', retour === '/index.html#saisie-rapide');

  /* ── La fonction Edge understand-note ──
     Elle ne tourne pas ici (Deno, clé Anthropic) : on contrôle ce qui se
     lit dans le fichier, c'est-à-dire les règles de la maison. */
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/understand-note/index.ts'), 'utf8');
  ok('understand-note porte un marqueur VERSION, journalisé et renvoyé',
     /const VERSION = '[0-9-]+[a-z]?'/.test(fn) && fn.includes("console.log('[understand-note] version', VERSION)")
     && fn.includes('version: VERSION'));
  ok('understand-note n’écrit rien en base', !/\.(from|insert|update|upsert|rpc)\(/.test(fn));
  ok('understand-note n’importe aucun fichier local (déploiement par le dashboard)', !/from '\.\.?\//.test(fn));
  const typesFn = (fn.match(/const TYPES = \[([^\]]*)\]/) || [])[1] || '';
  const typesCrm = (src.match(/const QUICK_TYPES = \[([^\]]*)\]/) || [])[1] || '';
  ok('la fonction et l’écran parlent des mêmes types d’activité',
     typesFn.replace(/\s/g, '') === typesCrm.replace(/\s/g, '') && typesFn.length > 0);

  return { title: 'Saisie rapide', checks };
}

module.exports = { run };
