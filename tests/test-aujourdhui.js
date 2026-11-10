/* L'écran « Aujourd'hui » : ce qui attend, et ce qui se perd.
 *
 * Raison d'être : le client perdu le 09/11/2026 n'apparaissait nulle part.
 * Sa visite n'avait pas de suite, donc pas de « à faire » — et tout ce que
 * le CRM montrait d'urgent partait des suites. Le filet de sécurité, ce sont
 * les clients vus SANS suite : c'est la règle qui l'aurait sauvé.
 *
 * Un lundi, « hier » est un dimanche vide : la dernière journée d'activité
 * doit être trouvée, pas supposée.
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
    grab(/function briefingAOuvrir[\s\S]*?\n}/, 'briefingAOuvrir'),
    grab(/const MOIS_FR = \[[\s\S]*?\];/, 'MOIS_FR'),
    grab(/const JOURS_FR = \[[^\n]*/, 'JOURS_FR'),
    grab(/function jourEnLettres[\s\S]*?\n}/, 'jourEnLettres')
  ].join('\n') + '\nreturn { briefingDuJour, briefingAOuvrir, jourEnLettres, clientsRefroidis, JOURNAL_AUTO_NOTE };')();
  const { briefingDuJour, briefingAOuvrir, jourEnLettres, JOURNAL_AUTO_NOTE } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const ids = (l, f) => l.map(f).sort((a, b) => a - b).join(',');

  const LUNDI = '2026-11-16';
  const clients = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(id => ({
    id, name: 'Client ' + id, phone: '6990000' + String(id).padStart(2, '0'), status: id === 11 ? 'signé' : 'visite'
  }));
  const A = (o) => Object.assign({ outcome: null, next_step: null, next_date: null, next_done_at: null, notes: 'x' }, o);
  const activites = [
    /* Le cas du 09/11 : vu en visite samedi, rien de prévu. */
    A({ id: 1, client_id: 1, type: 'visit', date: '2026-11-14' }),
    A({ id: 2, client_id: 2, type: 'call', date: '2026-11-14', next_step: 'Envoyer le bail', next_date: LUNDI }),
    A({ id: 3, client_id: 3, type: 'visit', date: '2026-11-13', next_step: 'Relancer', next_date: '2026-11-15', outcome: 'pending' }),
    A({ id: 4, client_id: 4, type: 'visit', date: '2026-11-12', next_step: 'Relancer', next_date: '2026-11-13',
        next_done_at: '2026-11-13T10:00:00Z', outcome: 'done' }),
    /* « Je vous reviens » sur WhatsApp, sans relance prévue. */
    A({ id: 5, client_id: 5, type: 'whatsapp', date: '2026-11-14', outcome: 'pending' }),
    A({ id: 6, client_id: 6, type: 'visit', date: '2026-11-14', outcome: 'failed' }),
    /* Vu en visite vendredi ; dimanche, un simple clic sur WhatsApp. */
    A({ id: 7, client_id: 7, type: 'visit', date: '2026-11-13', outcome: 'pending' }),
    A({ id: 71, client_id: 7, type: 'whatsapp', date: '2026-11-14', notes: JOURNAL_AUTO_NOTE + ' (WhatsApp — relance).' }),
    A({ id: 8, client_id: 8, type: 'visit', date: LUNDI }),
    A({ id: 9, client_id: 9, type: 'meeting', date: '2026-11-14', notes: 'Progression pipeline: visite' }),
    A({ id: 10, client_id: 10, type: 'visit', date: '2026-09-01' }),
    A({ id: 11, client_id: 11, type: 'visit', date: '2026-11-14' }),
    A({ id: 12, client_id: 12, type: 'visit', date: '2026-11-13' }),
    A({ id: 121, client_id: 12, type: 'call', date: '2026-10-20', next_step: 'Rappeler un jour' })
  ];
  const taches = [
    { id: 1, title: 'Déposer le dossier', due_date: LUNDI, status: 'pending' },
    { id: 2, title: 'Déjà fait', due_date: '2026-11-10', status: 'completed' },
    { id: 3, title: 'Payer la pub', due_date: '2026-11-11', status: 'pending' }
  ];
  const b = briefingDuJour(activites, clients, taches, LUNDI);

  /* ── 1. La dernière journée ── */
  ok('un lundi, la dernière journée est le samedi', b.derniere.date === '2026-11-14');
  ok('elle réunit les activités de ce samedi, avec leurs issues',
     b.derniere.activites.length === 7 && b.derniere.activites.some(a => a.outcome === 'failed'));
  ok('« samedi 14 novembre », en toutes lettres', jourEnLettres('2026-11-14') === 'samedi 14 novembre');
  const creux = briefingDuJour([A({ id: 1, client_id: 1, type: 'call', date: '2026-11-12' })], clients, [], LUNDI);
  ok('aucune activité hier ni samedi : on remonte au jeudi', creux.derniere.date === '2026-11-12');
  const rien = briefingDuJour([], [], [], LUNDI);
  ok('aucune activité du tout : pas de date, pas d’erreur', rien.derniere.date === null && rien.derniere.activites.length === 0);
  ok('une activité d’aujourd’hui n’est pas « la dernière journée »',
     !b.derniere.activites.some(a => a.date === LUNDI));

  /* ── 2. À faire ── */
  ok('pour aujourd’hui : la suite du jour et la tâche du jour',
     b.aujourdhui.length === 2 && b.aujourdhui.some(x => x.kind === 'suite' && x.id === 2)
     && b.aujourdhui.some(x => x.kind === 'task' && x.id === 1));
  ok('en retard : la tâche du 11, puis la suite du 15, la plus ancienne d’abord',
     b.enRetard.map(x => x.kind + x.id).join(',') === 'task3,suite3');
  ok('une tâche terminée n’apparaît pas', !b.enRetard.concat(b.aujourdhui).some(x => x.kind === 'task' && x.id === 2));
  ok('une suite sans date n’est ni du jour ni en retard',
     !b.enRetard.concat(b.aujourdhui).some(x => x.id === 121));
  const fermee = briefingDuJour(activites.map(a => a.id === 2 ? Object.assign({}, a, { next_done_at: '2026-11-16T08:00:00Z' }) : a),
                                clients, taches, LUNDI);
  ok('une suite fermée disparaît', !fermee.aujourdhui.some(x => x.kind === 'suite' && x.id === 2));

  /* ── 3. Sans suite : le filet ── */
  const sans = b.sansSuite.map(x => x.client.id);
  ok('le cas du client perdu : visite samedi, rien de prévu → signalé', sans.includes(1));
  ok('« je vous reviens » sur WhatsApp sans relance → signalé', sans.includes(5));
  ok('un clic sur WhatsApp ne fait pas taire le filet (ligne automatique)', sans.includes(7));
  ok('exactement ces trois-là', ids(b.sansSuite, x => x.client.id) === '1,5,7');
  ok('une suite ouverte, même sur une autre activité, suffit', !sans.includes(12) && !sans.includes(3));
  ok('une suite faite reste une suite traitée', !sans.includes(4));
  ok('une issue tranchée (« n’a pas abouti ») vaut décision', !sans.includes(6));
  ok('la visite de ce matin a sa journée devant elle', !sans.includes(8));
  ok('un changement de colonne du pipeline n’est pas un rendez-vous', !sans.includes(9));
  ok('au-delà de 30 jours, on passe aux refroidis', !sans.includes(10));
  ok('un client signé n’est pas relancé', !sans.includes(11));
  const corrige = briefingDuJour(activites.map(a => a.id === 1 ? Object.assign({}, a, { next_step: 'Relancer', next_date: '2026-11-17' }) : a),
                                 clients, taches, LUNDI);
  ok('dès qu’une suite est prévue, il sort de la liste', !corrige.sansSuite.some(x => x.client.id === 1));

  /* ── 4. Visites sans issue ── */
  ok('visites sans issue : samedi, vendredi (Client 12), et ce matin',
     ids(b.visitesSansIssue, a => a.id) === '1,8,11,12');
  ok('une visite avec issue n’y est pas', !b.visitesSansIssue.some(a => a.id === 6 || a.id === 7));

  /* ── 5. Refroidis ── */
  ok('un client sans activité depuis septembre est refroidi',
     b.refroidis.length === 1 && b.refroidis[0].client.id === 10 && b.refroidis[0].jours === 76);
  ok('un client déjà « sans suite » n’est pas répété dans les refroidis',
     !b.refroidis.some(x => b.sansSuite.some(y => y.client.id === x.client.id)));
  const auto = grab(/function getAutomationSuggestions[\s\S]*?\n}/, 'getAutomationSuggestions');
  ok('l’écran Automatisation utilise la même règle (pas de copie)', auto.includes('clientsRefroidis('));

  /* ── Ouverture automatique et lien direct ── */
  ok('première ouverture du jour : l’écran s’ouvre', briefingAOuvrir(null, LUNDI) && briefingAOuvrir('2026-11-14', LUNDI));
  ok('déjà vu aujourd’hui : on n’insiste pas', !briefingAOuvrir(LUNDI, LUNDI));
  const depart = grab(/function ecranDeDepart[\s\S]*?\n}/, 'ecranDeDepart');
  ok('un lien #saisie-rapide l’emporte sur l’ouverture du jour',
     depart.indexOf('ECRANS_FRAGMENT[frag]()') > -1 && depart.indexOf('ECRANS_FRAGMENT[frag]()') < depart.indexOf('briefingAOuvrir('));
  ok('#aujourdhui ouvre l’écran', /'aujourdhui': \(\) => showAujourdhui\(\)/.test(grab(/const ECRANS_FRAGMENT = \{[\s\S]*?\n\};/, 'ECRANS_FRAGMENT')));

  return { title: 'Aujourd’hui : point du jour et clients sans suite', checks };
}

module.exports = { run };
