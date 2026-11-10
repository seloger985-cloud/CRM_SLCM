/* Journal des contacts lancés depuis le CRM, et le type « whatsapp ».
 *
 * Raison d'être : les boutons WhatsApp et Appeler d'une fiche client étaient
 * de simples liens. Un client relancé depuis le CRM restait « sans activité
 * depuis 7 jours », et une conversation WhatsApp ne pouvait même pas être
 * notée : la base n'acceptait que call, meeting, email et visit.
 *
 * Ce que ces contrôles tiennent :
 *   · aucun type proposé à l'écran n'est refusé par la contrainte en base —
 *     le défaut serait silencieux jusqu'au premier enregistrement ;
 *   · un double appui ne fait pas deux lignes, un échec ne bloque pas la
 *     suivante ;
 *   · la note dit « initié », jamais « envoyé » ;
 *   · les confrères restent hors du journal.
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
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  /* ── Les types à l'écran contre la contrainte en base ──
     La DERNIÈRE définition de activities_type_check, dans l'ordre des
     migrations : c'est celle qui sera en vigueur une fois tout joué. */
  const fichiers = fs.readdirSync(path.join(ROOT, 'sql')).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  let permis = null, ou = null;
  for (const f of fichiers) {
    const sql = fs.readFileSync(path.join(ROOT, 'sql', f), 'utf8').replace(/--[^\n]*/g, '');
    const m = [...sql.matchAll(/activities_type_check\s+check\s*\(([\s\S]*?)\)\s*\)\s*;/gi)].pop()
           || [...sql.matchAll(/activities_type_check CHECK \(\(type = ANY \(ARRAY\[([^\]]*)\]/g)].pop();
    if (m) { permis = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]); ou = f; }
  }
  ok('la contrainte activities_type_check est lisible dans sql/ (' + (ou || 'introuvable') + ')', permis && permis.length);
  permis = permis || [];
  const quick = ((src.match(/const QUICK_TYPES = \[([^\]]*)\]/) || [])[1] || '').match(/[a-z_]+/g) || [];
  const form = grab(/function showActivityForm[\s\S]*?\n}/, 'showActivityForm');
  const options = [...form.matchAll(/<option value="([a-z_]+)"/g)].map(m => m[1])
    .filter(v => !/^(done|pending|failed|no_show)$/.test(v));
  const libelles = [...grab(/function getActivityLabel[\s\S]*?\n}/, 'getActivityLabel').matchAll(/case '([a-z_]+)'/g)].map(m => m[1]);
  const horsBase = [...new Set(quick.concat(options, libelles))].filter(t => !permis.includes(t));
  ok(horsBase.length ? 'types proposés mais refusés par la base : ' + horsBase.join(', ')
                     : 'tous les types proposés sont acceptés par la base', horsBase.length === 0);
  ok('« whatsapp » est accepté par la base (sql/17)', permis.includes('whatsapp'));
  ok('« whatsapp » est proposé partout : saisie rapide, formulaire, libellé',
     quick.includes('whatsapp') && options.includes('whatsapp') && libelles.includes('whatsapp'));
  const m17 = fs.readFileSync(path.join(ROOT, 'sql/17_activity_whatsapp.sql'), 'utf8');
  ok('sql/17 est rejouable (drop constraint if exists)', /drop constraint if exists activities_type_check/.test(m17));

  /* ── L'anti-doublon et la note ── */
  const scope = new Function([
    grab(/const JOURNAL_AUTO_NOTE[^\n]*/, 'JOURNAL_AUTO_NOTE'),
    grab(/const JOURNAL_DELAI_MIN[^\n]*/, 'JOURNAL_DELAI_MIN'),
    grab(/function doitJournaliser[\s\S]*?\n}/, 'doitJournaliser'),
    grab(/function noteJournal[\s\S]*?\n}/, 'noteJournal')
  ].join('\n') + '\nreturn { doitJournaliser, noteJournal, JOURNAL_AUTO_NOTE };')();
  const { doitJournaliser, noteJournal, JOURNAL_AUTO_NOTE } = scope;
  const T = Date.parse('2026-11-10T09:00:00Z');
  ok('un premier contact est noté', doitJournaliser(null, T));
  ok('le même, 9 minutes plus tard, ne l’est pas', !doitJournaliser(T, T + 9 * 60000));
  ok('le même, 10 minutes plus tard, l’est', doitJournaliser(T, T + 10 * 60000));
  const nw = noteJournal('whatsapp', 'relance');
  ok('la note commence par la marque du journal automatique', nw.indexOf(JOURNAL_AUTO_NOTE) === 0);
  ok('la note dit que l’envoi n’est pas vérifié', /n’est pas vérifié/.test(nw) && !/envoyé/.test(nw));
  ok('un appel est nommé comme tel', /appel/.test(noteJournal('call')) && !/WhatsApp/.test(noteJournal('call')));

  /* ── journaliserContact, exécutée contre une fausse base ── */
  const ecrits = [];
  let refuser = false;
  const toasts = [];
  const store = {};
  const fauxLocal = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const fauxSupabase = { from: () => ({ insert: async (rows) => {
    if (refuser) return { error: { message: 'violates check constraint "activities_type_check"' } };
    ecrits.push(rows[0]); return { error: null };
  } }) };
  const journaliser = new Function('supabaseClient', 'localStorage', 'UI', [
    grab(/const FUSEAU_AGENCE[^\n]*/, 'FUSEAU_AGENCE'),
    grab(/function dateLocale[\s\S]*?\n}/, 'dateLocale'),
    grab(/const JOURNAL_AUTO_NOTE[^\n]*/, 'JOURNAL_AUTO_NOTE'),
    grab(/const JOURNAL_DELAI_MIN[^\n]*/, 'JOURNAL_DELAI_MIN'),
    grab(/function doitJournaliser[\s\S]*?\n}/, 'doitJournaliser'),
    grab(/function noteJournal[\s\S]*?\n}/, 'noteJournal'),
    grab(/async function journaliserContact[\s\S]*?\n}/, 'journaliserContact')
  ].join('\n') + '\nreturn journaliserContact;')(fauxSupabase, fauxLocal, { toast: (m) => toasts.push(m) });

  const ancienneConsole = console.error;
  console.error = () => {};
  try {
    await journaliser(7, 'whatsapp', 'relance');
    await journaliser(7, 'whatsapp', 'relance');
    ok('un double appui ne fait qu’une ligne', ecrits.length === 1);
    ok('la ligne porte le client, le type et la date du jour',
       ecrits[0] && ecrits[0].client_id === 7 && ecrits[0].type === 'whatsapp' && /^\d{4}-\d{2}-\d{2}$/.test(ecrits[0].date));
    ok('la ligne n’a pas de suite (elle s’écrit sans formulaire)', ecrits[0] && !ecrits[0].next_step);
    await journaliser(7, 'call');
    ok('un appel au même client reste noté à part', ecrits.length === 2);
    await journaliser(7, 'email');
    await journaliser(null, 'whatsapp');
    ok('un type inconnu ou un client absent n’écrit rien', ecrits.length === 2);

    refuser = true;
    await journaliser(8, 'whatsapp');
    ok('un refus de la base se voit à l’écran (sql/17 non joué)', toasts.length === 1);
    refuser = false;
    await journaliser(8, 'whatsapp');
    ok('après un échec, le contact suivant est bien noté', ecrits.length === 3 && ecrits[2].client_id === 8);
  } finally {
    console.error = ancienneConsole;
  }

  /* ── Où le journal est branché, et où il ne l'est pas ── */
  const row = grab(/function clientRow[\s\S]*?\n}/, 'clientRow');
  ok('les deux liens WhatsApp de la liste Clients sont journalisés',
     (row.match(/data-journal-type="whatsapp"/g) || []).length === 2);
  ok('la liste Clients a un bouton Appeler journalisé', /href="tel:[\s\S]*?data-journal-type="call"/.test(row));
  const ecouteur = (src.match(/document\.addEventListener\('click'[\s\S]*?\n}\);/) || [''])[0];
  ok('un gestionnaire délégué écoute les liens marqués', ecouteur.includes("closest('[data-journal-client]')"));
  ok('il ne bloque pas l’ouverture du lien', ecouteur && !ecouteur.includes('preventDefault'));
  const send = grab(/function sendWhatsApp[\s\S]*?\n}/, 'sendWhatsApp');
  ok('WhatsApp s’ouvre AVANT l’écriture (sinon le navigateur bloque la fenêtre)',
     send.indexOf('window.open') > -1 && send.indexOf('window.open') < send.indexOf('journaliserContact'));
  const confreres = [...src.matchAll(/sendWhatsApp\(confrereWa\([^\n]*/g)].map(m => m[0]);
  ok('les messages aux confrères ne sont pas journalisés',
     confreres.length > 0 && confreres.every(l => !l.includes('client_id')));
  const appelConfrere = (src.match(/[^\n]*Appeler le confrère[^\n]*/) || [''])[0];
  ok('l’appel à un confrère n’est pas journalisé', appelConfrere && !appelConfrere.includes('data-journal'));

  return { title: 'Journal des contacts et type WhatsApp', checks };
}

module.exports = { run };
