// ════════════════════════════════════════════════════════════════════
//  daily-digest — le rappel Telegram du matin et du soir.
//
//  À DÉPLOYER depuis le dashboard Supabase du projet dukwtseqticijlvrmkgz :
//  Edge Functions → Deploy a new function → nom « daily-digest » →
//  coller ce fichier entier. Puis, dans ses paramètres, DÉSACTIVER
//  « Verify JWT » : l'appelant est pg_cron, pas un utilisateur connecté.
//
//  Secrets (Edge Functions → Secrets) : TELEGRAM_BOT_TOKEN, CRON_SECRET,
//  CRM_URL. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées
//  automatiquement par Supabase — rien à copier.
//
//  ── Ce qu'elle fait ──
//
//  pg_cron (sql/18) l'appelle à 07h30 et 18h00, heure de Douala. Pour
//  chaque agent inscrit dans `notif_prefs`, elle lit SES activités, ses
//  clients et ses tâches, calcule le point du jour et l'envoie sur
//  Telegram. Matin : la dernière journée, les clients sans suite, ce qui
//  est en retard et pour aujourd'hui. Soir : « qui as-tu vu aujourd'hui ? »
//  et les visites du jour sans issue. Toujours envoyé, même court : c'est
//  l'habitude qu'on installe.
//
//  ── Ce qu'elle ne fait PAS, délibérément ──
//
//  · Elle n'écrit RIEN dans les données métier. Seul `notif_log` reçoit
//    une ligne par envoi, pour empêcher un doublon.
//  · Elle n'envoie ni numéro de téléphone, ni montant, ni pièce
//    d'identité, ni le texte des notes : un bot Telegram n'est pas chiffré
//    de bout en bout. Des noms courts (« Paul E. ») et des intitulés.
//  · Elle ne devine rien : mêmes règles que l'écran « Aujourd'hui ».
//
//  ── Les règles sont recopiées, volontairement ──
//
//  Une fonction Edge ne peut pas importer assets/js/app.js. Le bloc
//  « RÈGLES » ci-dessous réimplante un sous-ensemble de briefingDuJour()
//  (app.js, section « AUJOURD'HUI ») avec les MÊMES noms de constantes et
//  les mêmes seuils. Il est écrit en JavaScript pur pour que
//  tests/test-digest.js l'exécute sous Node et compare son résultat à
//  celui de l'écran sur les mêmes données : une divergence fait échouer
//  la suite, au lieu de faire mentir le message.
// ════════════════════════════════════════════════════════════════════

// @ts-nocheck — le bloc RÈGLES est du JavaScript pur, sans annotations,
// pour que Node puisse l'exécuter dans les tests. Le runtime Edge ne
// vérifie pas les types ; cette ligne évite qu'un éditeur ou un futur
// `deno check` ne prenne ce choix pour une erreur.
import { createClient } from 'npm:@supabase/supabase-js@2.49.0';

/* À incrémenter dès qu'on touche ce fichier. Voir README, « Vérifier QUELLE
   version tourne ». */
const VERSION = '2026-11-10-b';

// ── RÈGLES (JavaScript pur — exécuté par tests/test-digest.js) ──

const FUSEAU_AGENCE = 'Africa/Douala';
const TYPES_SUITE_REQUISE = ['visit', 'meeting', 'whatsapp'];
const JOURNAL_AUTO_NOTE = 'Contact initié depuis le CRM';
const SANS_SUITE_DELAI_JOURS = 1;
const FENETRE_BRIEFING_JOURS = 30;

/* Limite Telegram : 4096 caractères. Marge pour les balises. */
const MESSAGE_MAX = 3900;
/* Au-delà, une liste est coupée : « … et 4 autres ». Un message qu'il faut
   faire défiler sur trois écrans n'est plus lu au réveil. */
const LISTE_MAX = 8;

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const TYPE_FR = { visit: 'Visite', call: 'Appel', meeting: 'Rendez-vous', email: 'E-mail', whatsapp: 'WhatsApp' };
const ISSUE_FR = { done: 'abouti', pending: 'en attente d’un retour', failed: 'n’a pas abouti', no_show: 'ne s’est pas tenu' };

/* Le serveur est en UTC : à 00h30 à Douala, il serait encore « hier ». */
function dateLocale(now) {
  const d = now instanceof Date ? now : new Date();
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU_AGENCE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

function ajouterJours(ymd, n) {
  const t = Date.parse(String(ymd || '').slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(t) ? new Date(t + n * 86400000).toISOString().slice(0, 10) : null;
}

function ageJours(date, today) {
  return Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(String(date).slice(0, 10) + 'T12:00:00Z')) / 86400000);
}

function jourEnLettres(ymd) {
  const t = Date.parse(String(ymd || '').slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return JOURS_FR[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS_FR[d.getUTCMonth()];
}

function suiteRequise(type) { return TYPES_SUITE_REQUISE.includes(type); }
function suiteOuverte(a) { return !!(a && a.next_step && !a.next_done_at); }
function estLigneAutomatique(a) {
  const n = String((a && a.notes) || '');
  return n.indexOf(JOURNAL_AUTO_NOTE) === 0 || n.indexOf('Progression pipeline') === 0;
}

/* Le même calcul que briefingDuJour (app.js), pour ce que le message dit. */
function reglesDigest(activities, clients, tasks, today) {
  const acts = activities || [];
  const date = acts.reduce((m, a) => (a.date && a.date < today && a.date > m ? a.date : m), '') || null;
  const derniere = { date, activites: date ? acts.filter((a) => a.date === date) : [] };

  const items = acts.filter((a) => suiteOuverte(a) && a.next_date).map((a) => ({
    kind: 'suite', id: a.id, quoi: a.next_step, quand: a.next_date, client_id: a.client_id
  })).concat((tasks || []).filter((t) => t.status !== 'completed' && t.due_date).map((t) => ({
    kind: 'task', id: t.id, quoi: t.title, quand: t.due_date, client_id: null
  })));
  const aujourdhui = items.filter((x) => x.quand === today);
  const enRetard = items.filter((x) => x.quand < today).sort((x, y) => x.quand.localeCompare(y.quand));

  const derniereReelle = new Map();
  acts.forEach((a) => {
    if (a.client_id == null || !a.date || estLigneAutomatique(a)) return;
    const k = String(a.client_id);
    const b = derniereReelle.get(k);
    if (!b || a.date > b.date || (a.date === b.date && String(a.created_at || '') > String(b.created_at || ''))) {
      derniereReelle.set(k, a);
    }
  });
  const suivis = new Set(acts.filter(suiteOuverte).map((a) => String(a.client_id)));
  const sansSuite = (clients || [])
    .filter((c) => c.status !== 'signé' && !suivis.has(String(c.id)))
    .map((c) => ({ client: c, activite: derniereReelle.get(String(c.id)) }))
    .filter((x) => {
      const a = x.activite;
      return a && suiteRequise(a.type) && !a.next_step && (!a.outcome || a.outcome === 'pending')
        && ageJours(a.date, today) >= SANS_SUITE_DELAI_JOURS && ageJours(a.date, today) <= FENETRE_BRIEFING_JOURS;
    })
    .sort((x, y) => y.activite.date.localeCompare(x.activite.date));

  const visitesDuJourSansIssue = acts.filter((a) => a.type === 'visit' && !a.outcome && a.date === today && !estLigneAutomatique(a));
  const duJour = acts.filter((a) => a.date === today && !estLigneAutomatique(a));

  return { derniere, aujourdhui, enRetard, sansSuite, visitesDuJourSansIssue, duJour };
}

/* « Paul Essomba » → « Paul E. » ; « M. Dicka » reste « M. Dicka ».
   Assez pour se souvenir, pas assez pour identifier qui lirait par-dessus
   l'épaule. */
function nomCourt(nom) {
  const mots = String(nom || '').replace(/[0-9+]/g, '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return 'Sans nom';
  if (/^(m|mr|mme|mlle|dr|pr)\.?$/i.test(mots[0])) return mots.slice(0, 2).join(' ');
  return mots.length > 1 ? mots[0] + ' ' + mots[mots.length - 1].charAt(0).toUpperCase() + '.' : mots[0];
}

/* Un intitulé d'action peut contenir un montant ou un numéro (« Relancer
   pour les 350 000 », « appeler au 699… ») : toute suite de trois chiffres
   ou plus est masquée. */
function nettoyer(texte) {
  const s = String(texte || '').replace(/\d[\d\s.,]*\d/g, (m) => (m.replace(/\D/g, '').length >= 3 ? '…' : m));
  return s.length > 80 ? s.slice(0, 79) + '…' : s;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function liste(items, ligne) {
  const out = items.slice(0, LISTE_MAX).map((x) => '• ' + ligne(x));
  if (items.length > LISTE_MAX) out.push('… et ' + (items.length - LISTE_MAX) + ' autre' + (items.length - LISTE_MAX > 1 ? 's' : ''));
  return out.join('\n');
}

/* « 1 visite », « 2 visites » ; « rendez-vous » et « WhatsApp » ne
   prennent pas de s. Un message mal accordé se lit comme un message
   automatique, et finit par ne plus être lu du tout. */
const TYPE_PLURIEL = { visit: ['visite', 'visites'], call: ['appel', 'appels'], meeting: ['rendez-vous', 'rendez-vous'],
  email: ['e-mail', 'e-mails'], whatsapp: ['WhatsApp', 'WhatsApp'] };
function accord(n, singulier, pluriel) { return n + ' ' + (n > 1 ? pluriel : singulier); }

function compteParType(acts) {
  const n = {};
  acts.forEach((a) => { n[a.type] = (n[a.type] || 0) + 1; });
  return Object.keys(n).map((t) => accord(n[t], ...(TYPE_PLURIEL[t] || [t, t]))).join(', ');
}

/* Coupe un message trop long à la dernière ligne entière, avec le lien
   toujours en fin : c'est lui qui compte. */
function borner(corps, lien) {
  const fin = '\n\n' + lien;
  if (corps.length + fin.length <= MESSAGE_MAX) return corps + fin;
  const coupe = corps.slice(0, MESSAGE_MAX - fin.length - 20);
  return coupe.slice(0, coupe.lastIndexOf('\n')) + '\n…' + fin;
}

function messageMatin(b, nomDe, crmUrl, today) {
  const parts = ['<b>Bonjour — ' + esc(jourEnLettres(today)) + '</b>'];
  if (b.derniere.date) {
    const jour = jourEnLettres(b.derniere.date);
    parts.push('<b>' + esc(jour.charAt(0).toUpperCase() + jour.slice(1)) + '</b> : ' + b.derniere.activites.length
      + ' activité' + (b.derniere.activites.length > 1 ? 's' : '') + ' (' + esc(compteParType(b.derniere.activites)) + ').\n'
      + liste(b.derniere.activites.filter((a) => !estLigneAutomatique(a)), (a) => esc((TYPE_FR[a.type] || a.type)
        + (a.client_id != null ? ' — ' + nomCourt(nomDe(a.client_id)) : '')
        + (a.outcome ? ' (' + ISSUE_FR[a.outcome] + ')' : ''))));
  } else {
    parts.push('Aucune activité notée ces ' + FENETRE_BRIEFING_JOURS + ' derniers jours.');
  }
  if (b.sansSuite.length) {
    parts.push('<b>Sans suite (' + b.sansSuite.length + ')</b> — vus, et rien de prévu :\n'
      + liste(b.sansSuite, (x) => esc(nomCourt(x.client.name) + ' — ' + (TYPE_FR[x.activite.type] || '').toLowerCase()
        + ' du ' + jourEnLettres(x.activite.date))));
  }
  const ligneAFaire = (x) => esc(nettoyer(x.quoi) + (x.client_id != null ? ' — ' + nomCourt(nomDe(x.client_id)) : ''));
  if (b.enRetard.length) {
    parts.push('<b>En retard (' + b.enRetard.length + ')</b>\n'
      + liste(b.enRetard, (x) => ligneAFaire(x) + ' (' + esc(jourEnLettres(x.quand)) + ')'));
  }
  parts.push(b.aujourdhui.length
    ? '<b>Aujourd’hui (' + b.aujourdhui.length + ')</b>\n' + liste(b.aujourdhui, ligneAFaire)
    : (b.enRetard.length || b.sansSuite.length ? 'Rien d’autre de prévu aujourd’hui.'
      : 'Rien en retard, rien de prévu : une journée pour prospecter.'));
  return borner(parts.join('\n\n'), esc(crmUrl + '/index.html#aujourdhui'));
}

function messageSoir(b, nomDe, crmUrl, today) {
  const parts = ['<b>Qui as-tu vu aujourd’hui ?</b>'];
  parts.push(b.duJour.length
    ? b.duJour.length + ' activité' + (b.duJour.length > 1 ? 's' : '') + ' notée' + (b.duJour.length > 1 ? 's' : '')
      + ' aujourd’hui (' + esc(compteParType(b.duJour)) + '). Il manque quelqu’un ? Dix secondes, avec le lien en bas.'
    : 'Rien de noté aujourd’hui. Une visite, un appel, un WhatsApp ? Dix secondes, avec le lien en bas.');
  if (b.visitesDuJourSansIssue.length) {
    parts.push('<b>Visites du jour sans issue (' + b.visitesDuJourSansIssue.length + ')</b>\n'
      + liste(b.visitesDuJourSansIssue, (a) => esc(a.client_id != null ? nomCourt(nomDe(a.client_id)) : 'Sans client')));
  }
  return borner(parts.join('\n\n'), esc(crmUrl + '/index.html#saisie-rapide'));
}

// ── Bilan de la semaine (kind « semaine ») — copie de bilanSemaine(),
//    app.js, section « BILAN DE LA SEMAINE ». Sans montant ni refroidis :
//    le message ne porte aucun chiffre d'argent, et les refroidis exigent
//    tout l'historique, que la fonction ne lit pas.

function debutSemaine(ymd) {
  const t = Date.parse(String(ymd).slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(t) ? ajouterJours(ymd, -((new Date(t).getUTCDay() + 6) % 7)) : null;
}

function dateDeHorodatage(ts) {
  if (!ts) return null;
  let s = String(ts).replace(' ', 'T');
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? dateLocale(d) : null;
}

function reglesBilan(activities, clients, payments, lundi, today) {
  const acts = activities || [];
  const samedi = ajouterJours(lundi, 5);
  const ref = today && today < samedi ? today : samedi;
  const dans = (d) => !!d && d >= lundi && d <= samedi;
  const reelles = acts.filter((a) => dans(a.date) && !estLigneAutomatique(a));
  const parType = {};
  reelles.forEach((a) => { parType[a.type] = (parType[a.type] || 0) + 1; });
  const vis = reelles.filter((a) => a.type === 'visit');
  const dues = acts.filter((a) => a.next_step && dans(a.next_date));
  const b = reglesDigest(acts, clients, [], ajouterJours(lundi, 7));
  return {
    lundi, samedi,
    interactions: reelles.length, parType,
    contactsCrm: acts.filter((a) => dans(a.date) && String(a.notes || '').indexOf(JOURNAL_AUTO_NOTE) === 0).length,
    nouveauxClients: (clients || []).filter((c) => dans(dateDeHorodatage(c.created_at))).length,
    visites: {
      total: vis.length,
      abouties: vis.filter((a) => a.outcome === 'done').length,
      enAttente: vis.filter((a) => a.outcome === 'pending').length,
      echouees: vis.filter((a) => a.outcome === 'failed' || a.outcome === 'no_show').length,
      sansIssue: vis.filter((a) => !a.outcome).length
    },
    suites: {
      dues: dues.length,
      fermees: dues.filter((a) => a.next_done_at).length,
      ouvertes: dues.filter(suiteOuverte).length,
      enRetard: dues.filter((a) => suiteOuverte(a) && a.next_date < ref).length
    },
    signatures: acts.filter((a) => dans(a.date) && /^Progression pipeline:\s*signé/.test(String(a.notes || ''))).length,
    encaissements: (payments || []).filter((p) => p.status === 'paid' && dans(p.payment_date)).length,
    aReprendre: { suites: b.enRetard.concat(b.aujourdhui), sansSuite: b.sansSuite }
  };
}

function messageSemaine(b, nomDe, crmUrl) {
  const v = b.visites, s = b.suites;
  const parts = ['<b>Bilan de la semaine — du ' + esc(jourEnLettres(b.lundi)) + ' au ' + esc(jourEnLettres(b.samedi)) + '</b>'];
  parts.push(b.interactions + ' interaction' + (b.interactions > 1 ? 's' : '') + ' notée' + (b.interactions > 1 ? 's' : '')
    + (b.interactions ? ' (' + esc(compteParType(Object.keys(b.parType).flatMap((t) => Array(b.parType[t]).fill({ type: t })))) + ')' : '')
    + (b.contactsCrm ? ', et ' + b.contactsCrm + ' contact' + (b.contactsCrm > 1 ? 's' : '') + ' lancé' + (b.contactsCrm > 1 ? 's' : '') + ' depuis le CRM' : '') + '.\n'
    + '• Nouveaux clients : ' + b.nouveauxClients + '\n'
    + '• Visites : ' + v.total + (v.total ? ' — ' + accord(v.abouties, 'aboutie', 'abouties') + ', ' + v.enAttente + ' en attente, '
      + accord(v.echouees, 'échouée', 'échouées') + ', ' + v.sansIssue + ' sans issue' : '') + '\n'
    + '• Suites de la semaine : ' + accord(s.fermees, 'faite', 'faites') + ', ' + accord(s.ouvertes, 'ouverte', 'ouvertes')
      + (s.enRetard ? ' dont ' + s.enRetard + ' en retard' : '') + '\n'
    + '• Signatures : ' + b.signatures + ' · Encaissements : ' + b.encaissements);
  const n = b.aReprendre.suites.length + b.aReprendre.sansSuite.length;
  parts.push(n
    ? '<b>À reprendre lundi (' + n + ')</b>\n'
      + liste(b.aReprendre.suites.map((x) => esc(nettoyer(x.quoi) + (x.client_id != null ? ' — ' + nomCourt(nomDe(x.client_id)) : '')))
        .concat(b.aReprendre.sansSuite.map((x) => esc(nomCourt(x.client.name) + ' — sans suite'))), (l) => l)
    : 'Rien en suspens : lundi part de zéro. Bon week-end.');
  return borner(parts.join('\n\n'), esc(crmUrl + '/index.html#bilan'));
}

// ── FIN DES RÈGLES ──

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/* Comparaison à temps constant : la durée de la réponse ne doit rien
   apprendre sur le secret à qui le cherche. */
function memeSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  console.log('[daily-digest] version', VERSION);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', version: VERSION }, 405);

  /* ── Authentification : un secret partagé avec pg_cron, pas un jeton
        utilisateur. L'adresse de la fonction est publique. ── */
  const attendu = Deno.env.get('CRON_SECRET') ?? '';
  if (!attendu) return json({ error: 'config_incomplete', detail: 'secret CRON_SECRET absent', version: VERSION }, 500);
  if (!memeSecret(req.headers.get('x-cron-secret') ?? '', attendu)) {
    return json({ error: 'secret_invalide', version: VERSION }, 401);
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const crmUrl = (Deno.env.get('CRM_URL') ?? '').replace(/\/+$/, '');
  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !crmUrl || !url || !cleService) {
    return json({ error: 'config_incomplete', detail: 'TELEGRAM_BOT_TOKEN, CRM_URL, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY', version: VERSION }, 500);
  }

  let body: { kind?: unknown; apercu?: unknown; essai?: unknown };
  try { body = await req.json(); } catch (_e) { body = {}; }
  const kind = String(body.kind ?? '');
  if (kind !== 'matin' && kind !== 'soir' && kind !== 'semaine') {
    return json({ error: 'kind_inconnu', detail: 'matin, soir ou semaine', version: VERSION }, 400);
  }
  /* apercu : rend les textes sans rien envoyer ni noter.
     essai   : envoie, mais sans noter — pour tester sans bloquer le vrai envoi du jour. */
  const apercu = body.apercu === true;
  const essai = body.essai === true;

  /* La clé service ignore le RLS : CHAQUE requête ci-dessous filtre par
     owner_id, explicitement. Sans ce filtre, le jour où six agents
     arriveront, chacun recevrait les clients de tous. */
  const db = createClient(url, cleService, { auth: { persistSession: false } });
  const today = dateLocale();
  const depuis = ajouterJours(today, -(FENETRE_BRIEFING_JOURS + 1));

  const { data: prefs, error: ePrefs } = await db.from('notif_prefs')
    .select('owner_id, telegram_chat_id').eq('actif', true);
  if (ePrefs) return json({ error: 'lecture_prefs', detail: ePrefs.message, version: VERSION }, 500);

  const resultats = [];
  for (const p of prefs ?? []) {
    const qui = String(p.owner_id).slice(0, 8);
    try {
      const champs = 'id,type,client_id,date,created_at,notes,outcome,next_step,next_date,next_done_at';
      /* Deux lectures : la fenêtre récente (dernière journée, sans suite,
         visites du jour), et TOUTES les suites ouvertes — une relance en
         retard depuis deux mois doit rester dans le message. */
      const lundi = debutSemaine(today);
      const [recentes, ouvertes, taches, nouveaux, payes] = await Promise.all([
        db.from('activities').select(champs).eq('owner_id', p.owner_id).gte('date', depuis),
        db.from('activities').select(champs).eq('owner_id', p.owner_id)
          .not('next_step', 'is', null).is('next_done_at', null),
        db.from('tasks').select('id,title,due_date,status').eq('owner_id', p.owner_id)
          .neq('status', 'completed').not('due_date', 'is', null).lte('due_date', today),
        /* Bilan du samedi seulement : les clients créés depuis la veille du
           lundi (created_at est en UTC, la date est recalculée à Douala), et
           les encaissements — leur NOMBRE : le montant n'est même pas lu. */
        kind === 'semaine'
          ? db.from('clients').select('id,name,status,created_at').eq('owner_id', p.owner_id).gte('created_at', ajouterJours(lundi, -1))
          : Promise.resolve({ data: [], error: null }),
        kind === 'semaine'
          ? db.from('payments').select('id,status,payment_date').eq('owner_id', p.owner_id)
              .eq('status', 'paid').gte('payment_date', lundi).lte('payment_date', ajouterJours(lundi, 5))
          : Promise.resolve({ data: [], error: null })
      ]);
      const erreur = recentes.error || ouvertes.error || taches.error || nouveaux.error || payes.error;
      if (erreur) throw new Error('lecture : ' + erreur.message);

      const parId = new Map();
      [...(recentes.data ?? []), ...(ouvertes.data ?? [])].forEach((a) => parId.set(a.id, a));
      const activites = [...parId.values()];
      const ids = [...new Set(activites.map((a) => a.client_id).filter((x) => x != null))];
      const cl = ids.length
        ? await db.from('clients').select('id,name,status').eq('owner_id', p.owner_id).in('id', ids)
        : { data: [], error: null };
      if (cl.error) throw new Error('lecture clients : ' + cl.error.message);
      const tousClients = new Map([...(cl.data ?? []), ...(nouveaux.data ?? [])].map((c) => [String(c.id), c]));
      const noms = new Map([...tousClients.values()].map((c) => [String(c.id), c.name]));
      const nomDe = (id: unknown) => noms.get(String(id)) ?? '';

      const b = reglesDigest(activites, cl.data ?? [], taches.data ?? [], today);
      const texte = kind === 'matin' ? messageMatin(b, nomDe, crmUrl, today)
        : kind === 'soir' ? messageSoir(b, nomDe, crmUrl, today)
        : messageSemaine(reglesBilan(activites, [...tousClients.values()], payes.data ?? [], lundi, today), nomDe, crmUrl);
      if (apercu) { resultats.push({ agent: qui, apercu: texte }); continue; }

      /* Réserver l'envoi AVANT de l'envoyer : si le cron part deux fois,
         la seconde réservation échoue sur l'index d'unicité et rien ne part. */
      let reservation: number | null = null;
      if (!essai) {
        const r = await db.from('notif_log')
          .insert({ owner_id: p.owner_id, kind, for_date: today }).select('id').single();
        if (r.error) {
          if (r.error.code === '23505') { resultats.push({ agent: qui, envoye: false, motif: 'deja_envoye' }); continue; }
          throw new Error('journal : ' + r.error.message);
        }
        reservation = r.data.id;
      }

      const t = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: p.telegram_chat_id, text: texte, parse_mode: 'HTML', disable_web_page_preview: true })
      });
      const tr = await t.json().catch(() => ({}));
      if (!t.ok || !tr.ok) {
        /* Échec d'envoi : la réservation est levée, pour qu'un nouvel appel
           (à la main, ou le lendemain) puisse réessayer. Ce n'est pas une
           donnée métier : rien d'utile n'est perdu. */
        if (reservation !== null) await db.from('notif_log').delete().eq('id', reservation);
        throw new Error('Telegram ' + t.status + ' : ' + (tr.description ?? 'réponse illisible'));
      }
      resultats.push({ agent: qui, envoye: true, essai });
    } catch (e) {
      /* Une erreur réseau de fetch cite l'adresse appelée — qui contient le
         jeton du bot. Il ne doit sortir ni dans les journaux ni dans la
         réponse. */
      const motif = String(e).split(token).join('***');
      console.error('[daily-digest]', qui, motif);
      resultats.push({ agent: qui, envoye: false, motif });
    }
  }

  console.log('[daily-digest]', kind, today, JSON.stringify(resultats.map((r) => ({ ...r, apercu: undefined }))));
  return json({ version: VERSION, kind, for_date: today, agents: resultats.length, resultats });
});
