/* Le rappel Telegram (supabase/functions/daily-digest) dit la même chose que
 * l'écran « Aujourd'hui », et ne dit rien de trop.
 *
 * Raison d'être : la fonction Edge ne peut pas importer app.js, ses règles
 * sont donc RECOPIÉES. Deux copies divergent toujours, sans bruit : le jour
 * où l'écran aura une règle de plus, le message du matin mentirait. Ce
 * contrôle exécute le bloc « RÈGLES » de la fonction sous Node et compare
 * son résultat à briefingDuJour() sur les mêmes données.
 *
 * Et un bot Telegram n'est pas chiffré de bout en bout : aucun numéro,
 * aucun montant, aucun texte de note ne doit partir dans le message.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/daily-digest/index.ts'), 'utf8');
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const grab = (src, re, label) => {
    const m = src.match(re);
    if (!m) throw new Error('introuvable : ' + label);
    return m[0];
  };

  /* ── Le bloc RÈGLES de la fonction, exécuté tel quel ── */
  const debut = fn.indexOf('// ── RÈGLES');
  const fin = fn.indexOf('// ── FIN DES RÈGLES ──');
  ok('la fonction délimite son bloc de règles', debut > -1 && fin > debut);
  const bloc = fn.slice(debut, fin);
  ok('le bloc de règles est du JavaScript pur (aucune annotation de type)', !/\)\s*:\s*\w+\s*[{=]|: (string|number|unknown|boolean)\b/.test(bloc));
  const D = new Function(bloc + '\nreturn { reglesDigest, messageMatin, messageSoir, nomCourt, nettoyer, dateLocale, ' +
    'TYPES_SUITE_REQUISE, JOURNAL_AUTO_NOTE, SANS_SUITE_DELAI_JOURS, FENETRE_BRIEFING_JOURS, MESSAGE_MAX: 3900 };')();

  /* ── Les constantes : mêmes noms, mêmes valeurs que app.js ── */
  const valeur = (nom) => {
    const m = app.match(new RegExp('const ' + nom + ' = ([^;]*);'));
    return m ? new Function('return ' + m[1])() : undefined;
  };
  for (const nom of ['TYPES_SUITE_REQUISE', 'JOURNAL_AUTO_NOTE', 'SANS_SUITE_DELAI_JOURS', 'FENETRE_BRIEFING_JOURS']) {
    ok(nom + ' : même valeur dans app.js et dans la fonction', JSON.stringify(valeur(nom)) === JSON.stringify(D[nom]));
  }
  ok('chaque fichier renvoie à l’autre',
     fn.includes('briefingDuJour') && app.includes('daily-digest'));

  /* ── Parité : les données de tests/test-aujourdhui.js, aux deux moteurs ── */
  const A = new Function([
    grab(app, /function daysUntil[\s\S]*?\n}/, 'daysUntil'),
    grab(app, /function hasOpenFollowUp[\s\S]*?\n}/, 'hasOpenFollowUp'),
    grab(app, /function openFollowUps[\s\S]*?\n}/, 'openFollowUps'),
    grab(app, /const TYPES_SUITE_REQUISE[^\n]*/, 'TYPES_SUITE_REQUISE'),
    grab(app, /function suiteRequise[\s\S]*?\n}/, 'suiteRequise'),
    grab(app, /const JOURNAL_AUTO_NOTE[^\n]*/, 'JOURNAL_AUTO_NOTE'),
    grab(app, /const SANS_SUITE_DELAI_JOURS[^\n]*/, 'SANS_SUITE_DELAI_JOURS'),
    grab(app, /const FENETRE_BRIEFING_JOURS[^\n]*/, 'FENETRE_BRIEFING_JOURS'),
    grab(app, /const REFROIDI_JOURS[^\n]*/, 'REFROIDI_JOURS'),
    grab(app, /function estLigneAutomatique[\s\S]*?\n}/, 'estLigneAutomatique'),
    grab(app, /function clientsRefroidis[\s\S]*?\n}/, 'clientsRefroidis'),
    grab(app, /function briefingDuJour[\s\S]*?\n}/, 'briefingDuJour')
  ].join('\n') + '\nreturn briefingDuJour;')();

  const LUNDI = '2026-11-16';
  const clients = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(id => ({
    id, name: ['Paul Essomba', 'M. Dicka', 'Marthe Ngo Bassa'][id % 3] + ' ' + id, phone: '699 12 45 78',
    status: id === 11 ? 'signé' : 'visite'
  }));
  const X = (o) => Object.assign({ outcome: null, next_step: null, next_date: null, next_done_at: null,
                                   notes: 'Loyer 350 000 FCFA, rappeler au 699 12 45 78' }, o);
  const acts = [
    X({ id: 1, client_id: 1, type: 'visit', date: '2026-11-14' }),
    X({ id: 2, client_id: 2, type: 'call', date: '2026-11-14', next_step: 'Envoyer le bail de 350 000', next_date: LUNDI }),
    X({ id: 3, client_id: 3, type: 'visit', date: '2026-11-13', next_step: 'Relancer', next_date: '2026-11-15', outcome: 'pending' }),
    X({ id: 4, client_id: 4, type: 'visit', date: '2026-11-12', next_step: 'R', next_date: '2026-11-13', next_done_at: '2026-11-13T10:00:00Z', outcome: 'done' }),
    X({ id: 5, client_id: 5, type: 'whatsapp', date: '2026-11-14', outcome: 'pending' }),
    X({ id: 6, client_id: 6, type: 'visit', date: '2026-11-14', outcome: 'failed' }),
    X({ id: 7, client_id: 7, type: 'visit', date: '2026-11-13', outcome: 'pending' }),
    X({ id: 71, client_id: 7, type: 'whatsapp', date: '2026-11-14', notes: D.JOURNAL_AUTO_NOTE + ' (WhatsApp).' }),
    X({ id: 8, client_id: 8, type: 'visit', date: LUNDI }),
    X({ id: 9, client_id: 9, type: 'meeting', date: '2026-11-14', notes: 'Progression pipeline: visite' }),
    X({ id: 10, client_id: 10, type: 'visit', date: '2026-09-01' }),
    X({ id: 11, client_id: 11, type: 'visit', date: '2026-11-14' }),
    X({ id: 12, client_id: 12, type: 'visit', date: '2026-11-13' }),
    X({ id: 121, client_id: 12, type: 'call', date: '2026-10-20', next_step: 'Rappeler un jour' })
  ];
  const taches = [
    { id: 1, title: 'Déposer le dossier', due_date: LUNDI, status: 'pending' },
    { id: 2, title: 'Déjà fait', due_date: '2026-11-10', status: 'completed' },
    { id: 3, title: 'Payer la pub', due_date: '2026-11-11', status: 'pending' }
  ];
  const ecran = A(acts, clients, taches, LUNDI);
  const msg = D.reglesDigest(acts, clients, taches, LUNDI);
  const cle = (l) => l.map(x => x.kind + x.id).join(',');
  ok('parité : même dernière journée', ecran.derniere.date === msg.derniere.date
     && ecran.derniere.activites.length === msg.derniere.activites.length);
  ok('parité : même « pour aujourd’hui »', cle(ecran.aujourdhui) === cle(msg.aujourdhui));
  ok('parité : même « en retard », même ordre', cle(ecran.enRetard) === cle(msg.enRetard));
  ok('parité : mêmes clients sans suite, même ordre',
     ecran.sansSuite.map(x => x.client.id).join(',') === msg.sansSuite.map(x => x.client.id).join(','));
  ok('parité : les visites du jour sans issue sont celles de l’écran, datées d’aujourd’hui',
     msg.visitesDuJourSansIssue.map(a => a.id).join(',')
       === ecran.visitesSansIssue.filter(a => a.date === LUNDI).map(a => a.id).join(','));

  /* ── Les messages ── */
  const nomDe = (id) => (clients.find(c => String(c.id) === String(id)) || {}).name || '';
  const URL = 'https://crm.exemple.test';
  const matin = D.messageMatin(msg, nomDe, URL, LUNDI);
  const soir = D.messageSoir(msg, nomDe, URL, LUNDI);
  ok('le matin renvoie vers #aujourdhui', matin.includes(URL + '/index.html#aujourdhui'));
  ok('le soir renvoie vers #saisie-rapide', soir.includes(URL + '/index.html#saisie-rapide'));
  ok('le matin nomme la dernière journée (samedi)', matin.includes('Samedi 14 novembre'));
  ok('le matin signale les clients sans suite', /Sans suite \(3\)/.test(matin));
  ok('le soir pose la question', soir.includes('Qui as-tu vu aujourd’hui ?'));
  ok('le soir liste la visite du jour sans issue', /Visites du jour sans issue \(1\)/.test(soir));

  /* Confidentialité : le texte des notes contient un numéro et un montant ;
     un intitulé d'action aussi. Rien de tout cela ne doit sortir. */
  const deux = matin + '\n' + soir;
  ok('aucun numéro de téléphone dans les messages', !/699|12 45 78/.test(deux));
  ok('aucun montant dans les messages', !/350|FCFA/.test(deux));
  ok('le texte des notes ne sort pas', !deux.includes('rappeler au'));
  ok('les noms sont courts : « Paul Essomba » devient « Paul … »', !deux.includes('Essomba') && deux.includes('Paul'));
  ok('« M. Dicka » reste lisible', D.nomCourt('M. Dicka') === 'M. Dicka');
  ok('un nom piégé est échappé (parse_mode HTML)',
     !D.messageSoir({ duJour: [], visitesDuJourSansIssue: [{ id: 1, client_id: 1 }] }, () => '<b>Ets</b> & Fils', URL, LUNDI).includes('<b>Ets'));
  ok('un intitulé garde son sens, sans le montant', D.nettoyer('Envoyer le bail de 350 000') === 'Envoyer le bail de …');

  /* Toujours envoyé, même court — et jamais trop long pour Telegram. */
  const vide = D.reglesDigest([], [], [], LUNDI);
  const matinVide = D.messageMatin(vide, () => '', URL, LUNDI);
  ok('un matin sans rien produit quand même un message', matinVide.length > 20 && matinVide.includes('#aujourdhui'));
  const beaucoup = [];
  for (let i = 0; i < 400; i++) beaucoup.push(X({ id: 1000 + i, client_id: 1, type: 'call', date: '2026-11-14', next_step: 'Rappeler longuement '.repeat(5), next_date: '2026-11-15' }));
  const long = D.messageMatin(D.reglesDigest(beaucoup, clients, [], LUNDI), nomDe, URL, LUNDI);
  ok('un message chargé reste sous la limite de Telegram, lien compris',
     long.length <= 4096 && long.endsWith(URL + '/index.html#aujourdhui'));

  /* ── La fonction elle-même : règles de la maison ── */
  ok('daily-digest porte un marqueur VERSION, journalisé et renvoyé',
     /const VERSION = '[0-9-]+[a-z]?'/.test(fn) && fn.includes("console.log('[daily-digest] version', VERSION)") && fn.includes('version: VERSION'));
  ok('elle exige le secret du cron', fn.includes("req.headers.get('x-cron-secret')") && fn.includes("Deno.env.get('CRON_SECRET')"));
  /* Chaque requête, de son `db.from(` jusqu'à la suivante ou au `;`. */
  const lectures = fn.split("db.from('").slice(1)
    .filter(s => /^(activities|tasks|clients|payments)'/.test(s)).map(s => s.split(';')[0]);
  ok('chaque lecture métier filtre par owner_id (la clé service ignore le RLS)',
     lectures.length >= 6 && lectures.every(l => l.includes(".eq('owner_id', p.owner_id)")));
  ok('elle n’écrit que dans notif_log', !/from\('(activities|clients|tasks|properties|payments)'\)[^;]*\.(insert|update|delete|upsert)\(/.test(fn));
  ok('le jeton du bot ne sort pas dans les erreurs', fn.includes("split(token).join('***')"));
  ok('aucun import local (déploiement par le dashboard)', !/from '\.\.?\//.test(fn));

  /* Le SQL qui la déclenche. */
  const sql = fs.readFileSync(path.join(ROOT, 'sql/18_notifications_telegram.sql'), 'utf8');
  ok('matin du lundi au samedi à 07h30 (06h30 UTC)', sql.includes("'daily-digest-matin', '30 6 * * 1-6'"));
  ok('soir du lundi au vendredi à 18h00 (17h00 UTC)', sql.includes("'daily-digest-soir', '0 17 * * 1-5'"));
  ok('un envoi par agent, par sorte et par jour (index unique)', /unique index if not exists uniq_notif_log_envoi\s+on public\.notif_log \(owner_id, kind, for_date\)/.test(sql));
  ok('le secret du cron vient du coffre, pas du fichier', sql.includes('vault.decrypted_secrets') && !/x-cron-secret', '[^(]/.test(sql));

  return { title: 'Rappels Telegram (daily-digest)', checks };
}

module.exports = { run };
