/* Le bilan de la semaine, à l'écran et sur Telegram.
 *
 * Raison d'être : le samedi, Armand compile sa semaine. Un bilan faux est
 * pire que pas de bilan : il rassure. Les pièges vérifiés ici sont précis —
 * un client créé dimanche 23h30 à Douala est en base à 22h30 UTC sans
 * fuseau ; une signature n'a pas de date propre ; un clic WhatsApp suivi de
 * la conversation notée ne vaut pas deux interactions ; et le message
 * Telegram ne doit porter aucun montant.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/daily-digest/index.ts'), 'utf8');
  const grab = (re, label) => {
    const m = app.match(re);
    if (!m) throw new Error('introuvable dans app.js : ' + label);
    return m[0];
  };
  const A = new Function([
    grab(/const FUSEAU_AGENCE[^\n]*/, 'FUSEAU_AGENCE'),
    grab(/function dateLocale[\s\S]*?\n}/, 'dateLocale'),
    grab(/function ajouterJours[\s\S]*?\n}/, 'ajouterJours'),
    grab(/function daysUntil[\s\S]*?\n}/, 'daysUntil'),
    grab(/function hasOpenFollowUp[\s\S]*?\n}/, 'hasOpenFollowUp'),
    grab(/function openFollowUps[\s\S]*?\n}/, 'openFollowUps'),
    grab(/const TYPES_SUITE_REQUISE[^\n]*/, 'TYPES_SUITE_REQUISE'),
    grab(/function suiteRequise[\s\S]*?\n}/, 'suiteRequise'),
    grab(/const JOURNAL_AUTO_NOTE[^\n]*/, 'JOURNAL_AUTO_NOTE'),
    grab(/const SANS_SUITE_DELAI_JOURS[^\n]*/, 'SANS_SUITE_DELAI_JOURS'),
    grab(/const FENETRE_BRIEFING_JOURS[^\n]*/, 'FENETRE_BRIEFING_JOURS'),
    grab(/const REFROIDI_JOURS[^\n]*/, 'REFROIDI_JOURS'),
    grab(/function estLigneAutomatique[\s\S]*?\n}/, 'estLigneAutomatique'),
    grab(/function clientsRefroidis[\s\S]*?\n}/, 'clientsRefroidis'),
    grab(/function briefingDuJour[\s\S]*?\n}/, 'briefingDuJour'),
    grab(/function dateDeHorodatage[\s\S]*?\n}/, 'dateDeHorodatage'),
    grab(/function bilanSemaine[\s\S]*?\n}/, 'bilanSemaine')
  ].join('\n') + '\nreturn { bilanSemaine, dateDeHorodatage, JOURNAL_AUTO_NOTE };')();
  const D = new Function(fn.slice(fn.indexOf('// ── RÈGLES'), fn.indexOf('// ── FIN DES RÈGLES ──'))
    + '\nreturn { reglesBilan, messageSemaine, debutSemaine };')();

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  /* ── Les horodatages sans fuseau ── */
  ok('dimanche 23h30 UTC, c’est déjà lundi à Douala', A.dateDeHorodatage('2026-11-08T23:30:00') === '2026-11-09');
  ok('le format « espace » de PostgREST est compris', A.dateDeHorodatage('2026-11-09 10:00:00') === '2026-11-09');
  ok('un horodatage avec fuseau est respecté', A.dateDeHorodatage('2026-11-09T10:00:00+00:00') === '2026-11-09');
  ok('rien ne lève sur une valeur absente', A.dateDeHorodatage(null) === null);

  /* ── Une semaine type : lundi 9 → samedi 14 novembre 2026 ── */
  const LUNDI = '2026-11-09', SAMEDI = '2026-11-14';
  const X = (o) => Object.assign({ outcome: null, next_step: null, next_date: null, next_done_at: null, notes: 'x' }, o);
  const clients = [
    { id: 1, name: 'Paul Essomba', status: 'visite', created_at: '2026-11-08T23:30:00' },   // lundi à Douala
    { id: 2, name: 'Marthe Ngo', status: 'négociation', created_at: '2026-11-08T21:00:00' }, // dimanche
    { id: 3, name: 'M. Dicka', status: 'signé', created_at: '2026-10-01T10:00:00' },
    { id: 4, name: 'Ets Nkolo', status: 'visite', created_at: '2026-09-01T10:00:00' }
  ];
  const acts = [
    X({ id: 1, client_id: 1, type: 'visit', date: '2026-11-09', outcome: 'done' }),
    X({ id: 2, client_id: 1, type: 'visit', date: '2026-11-10', outcome: 'pending', next_step: 'Relancer', next_date: '2026-11-12' }),
    X({ id: 3, client_id: 2, type: 'visit', date: '2026-11-11', outcome: 'no_show', next_step: 'Reprogrammer', next_date: '2026-11-13',
        next_done_at: '2026-11-13T09:00:00+00:00' }),
    X({ id: 4, client_id: 2, type: 'visit', date: '2026-11-12' }),
    X({ id: 5, client_id: 2, type: 'whatsapp', date: '2026-11-12', notes: 'Contact initié depuis le CRM (WhatsApp).' }),
    X({ id: 6, client_id: 2, type: 'whatsapp', date: '2026-11-12', next_step: 'Relancer sur WhatsApp', next_date: '2026-11-16' }),
    X({ id: 7, client_id: 3, type: 'meeting', date: '2026-11-13', notes: 'Progression pipeline: signé' }),
    X({ id: 8, client_id: 3, type: 'call', date: '2026-11-15' }),                              // dimanche : hors semaine
    X({ id: 9, client_id: 4, type: 'call', date: '2026-10-01' })
  ];
  const payments = [
    { id: 1, status: 'paid', payment_date: '2026-11-10', amount: 350000 },
    { id: 2, status: 'pending', payment_date: '2026-11-11', amount: 100000 },
    { id: 3, status: 'paid', payment_date: '2026-11-15', amount: 50000 }
  ];
  const b = A.bilanSemaine(acts, clients, payments, LUNDI, SAMEDI);

  ok('la semaine va du lundi au samedi', b.lundi === LUNDI && b.samedi === SAMEDI);
  ok('5 interactions : le clic automatique et le pipeline à part, le dimanche exclu', b.interactions === 5);
  ok('par type : 4 visites, 1 WhatsApp', b.parType.visit === 4 && b.parType.whatsapp === 1 && !b.parType.call);
  ok('le contact lancé depuis le CRM est compté à part', b.contactsCrm === 1);
  ok('nouveaux clients : celui de dimanche 23h30 UTC est de lundi ; celui de dimanche soir non',
     b.nouveauxClients.length === 1 && b.nouveauxClients[0].id === 1);
  ok('visites : 1 aboutie, 1 en attente, 1 non tenue, 1 sans issue',
     b.visites.abouties === 1 && b.visites.enAttente === 1 && b.visites.echouees === 1 && b.visites.sansIssue === 1);
  ok('suites de la semaine : 2 dues, 1 faite, 1 ouverte et en retard',
     b.suites.dues === 2 && b.suites.fermees === 1 && b.suites.ouvertes === 1 && b.suites.enRetard === 1);
  ok('une suite de lundi prochain n’est pas « de la semaine »', b.suites.dues === 2);
  ok('la signature est lue dans le passage au pipeline', b.signatures.length === 1 && b.signatures[0] === 3);
  ok('encaissements : seulement ce qui est payé, dans la semaine',
     b.encaissements.nombre === 1 && b.encaissements.total === 350000);
  ok('à reprendre lundi : la relance en retard et celle de lundi',
     b.aReprendre.suites.map(x => x.id).sort().join(',') === '2,6');
  ok('à reprendre lundi : Marthe a une suite ouverte, elle n’est pas « sans suite »',
     !b.aReprendre.sansSuite.some(x => x.client.id === 2));
  ok('refroidis : Ets Nkolo, sans activité depuis octobre', b.refroidis.some(x => x.client.id === 4));
  const enCours = A.bilanSemaine(acts, clients, payments, LUNDI, '2026-11-11');
  ok('semaine en cours : « en retard » se juge à aujourd’hui, pas à samedi', enCours.suites.enRetard === 0);

  /* ── Parité avec le message du samedi ── */
  const m = D.reglesBilan(acts, clients, payments, LUNDI, SAMEDI);
  ok('parité : interactions, contacts CRM, nouveaux clients',
     m.interactions === b.interactions && m.contactsCrm === b.contactsCrm && m.nouveauxClients === b.nouveauxClients.length);
  ok('parité : visites', JSON.stringify(m.visites) === JSON.stringify(b.visites));
  ok('parité : suites', JSON.stringify(m.suites) === JSON.stringify(b.suites));
  ok('parité : signatures et nombre d’encaissements', m.signatures === b.signatures.length && m.encaissements === b.encaissements.nombre);
  ok('parité : à reprendre lundi',
     m.aReprendre.suites.map(x => x.kind + x.id).join() === b.aReprendre.suites.map(x => x.kind + x.id).join()
     && m.aReprendre.sansSuite.length === b.aReprendre.sansSuite.length);
  ok('parité : même lundi pour un samedi', D.debutSemaine(SAMEDI) === LUNDI);

  const nomDe = (id) => (clients.find(c => String(c.id) === String(id)) || {}).name || '';
  const texte = D.messageSemaine(m, nomDe, 'https://crm.exemple.test');
  ok('le message renvoie vers #bilan', texte.endsWith('https://crm.exemple.test/index.html#bilan'));
  ok('le message nomme la semaine', texte.includes('lundi 9 novembre') && texte.includes('samedi 14 novembre'));
  ok('aucun montant dans le message', !/350|FCFA|000/.test(texte));
  ok('les accords : « 4 visites », « 1 aboutie »', texte.includes('4 visites') && texte.includes('1 aboutie,'));
  ok('noms courts', !texte.includes('Essomba') && !texte.includes('Marthe Ngo'));
  ok('la fonction ne lit même pas le montant des paiements',
     /from\('payments'\)\.select\('id,status,payment_date'\)/.test(fn));

  /* ── Le déclenchement ── */
  const sql = fs.readFileSync(path.join(ROOT, 'sql/19_bilan_semaine.sql'), 'utf8');
  ok('samedi 18h00 à Douala (17h00 UTC)', sql.includes("'daily-digest-semaine', '0 17 * * 6'"));
  ok('le secret vient du coffre', sql.includes('vault.decrypted_secrets'));
  ok('#bilan ouvre l’écran', /'bilan': \(\) => showBilanSemaine\(\)/.test(app));

  return { title: 'Bilan de la semaine', checks };
}

module.exports = { run };
