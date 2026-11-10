/* Le tableau de bord opérationnel (10/11/2026).
 *
 * Raison d'être : à la demande d'Armand, le financier quitte le tableau de
 * bord — chiffre d'affaires, paiements en retard. Un retour en arrière
 * silencieux (une carte recopiée d'une ancienne version) se verrait ici.
 *
 * Et les nouveaux chiffres ont leurs pièges : comparer trois jours de cette
 * semaine à sept jours de la précédente ferait croire chaque lundi à un
 * effondrement ; compter le clic WhatsApp ET la conversation notée ensuite
 * doublerait l'activité.
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
    grab(/function ajouterJours[\s\S]*?\n}/, 'ajouterJours'),
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
    grab(/const DEUXIEME_CONTACT_JOURS[^\n]*/, 'DEUXIEME_CONTACT_JOURS'),
    grab(/const ETAPES_PIPELINE[^\n]*/, 'ETAPES_PIPELINE'),
    grab(/function debutSemaine[\s\S]*?\n}/, 'debutSemaine'),
    grab(/function indicateursTableau[\s\S]*?\n}/, 'indicateursTableau')
  ].join('\n') + '\nreturn { indicateursTableau, debutSemaine, JOURNAL_AUTO_NOTE };')();
  const { indicateursTableau, debutSemaine, JOURNAL_AUTO_NOTE } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  const MERCREDI = '2026-11-11';
  ok('le lundi d’un mercredi', debutSemaine(MERCREDI) === '2026-11-09');
  ok('le lundi d’un dimanche est celui d’avant', debutSemaine('2026-11-15') === '2026-11-09');
  ok('un lundi est son propre lundi', debutSemaine('2026-11-09') === '2026-11-09');

  const clients = [
    { id: 1, name: 'A', status: 'nouvelle demande' }, { id: 2, name: 'B', status: 'visite' },
    { id: 3, name: 'C', status: 'négociation' }, { id: 4, name: 'D', status: 'signé' },
    { id: 5, name: 'E', status: null }, { id: 6, name: 'F', status: 'visite' }
  ];
  const A = (o) => Object.assign({ outcome: null, next_step: null, next_date: null, next_done_at: null, notes: 'x' }, o);
  const acts = [
    /* Cette semaine (lundi 9 → mercredi 11) : 3 réelles + 1 clic automatique. */
    A({ id: 1, client_id: 2, type: 'visit', date: '2026-11-09', next_step: 'R', next_date: '2026-11-12' }),
    A({ id: 2, client_id: 3, type: 'call', date: '2026-11-10' }),
    A({ id: 3, client_id: 3, type: 'whatsapp', date: '2026-11-11', notes: JOURNAL_AUTO_NOTE + ' (WhatsApp).' }),
    A({ id: 4, client_id: 3, type: 'whatsapp', date: '2026-11-11', next_step: 'R', next_date: '2026-11-13' }),
    /* Semaine dernière : lundi 2 → mercredi 4 = 1 ; jeudi 5 et vendredi 6 hors comparaison. */
    A({ id: 5, client_id: 1, type: 'call', date: '2026-11-03' }),
    A({ id: 6, client_id: 6, type: 'visit', date: '2026-11-05', outcome: 'done' }),
    A({ id: 7, client_id: 4, type: 'meeting', date: '2026-11-06', notes: 'Progression pipeline: signé' }),
    /* Il y a trois semaines. */
    A({ id: 8, client_id: 4, type: 'visit', date: '2026-10-20', outcome: 'done' })
  ];
  const k = indicateursTableau(acts, clients, [], MERCREDI);

  ok('cette semaine : 3 interactions (le clic automatique ne compte pas en double)', k.semaine === 3);
  ok('semaine dernière À LA MÊME DATE : 1 (pas 2 : jeudi et vendredi sont hors comparaison)', k.semainePrecedente === 1);
  ok('quatre semaines, la courante en dernier', k.semaines.length === 4 && k.semaines[3].debut === '2026-11-09'
     && k.semaines[0].debut === '2026-10-19');
  ok('par type : cette semaine 1 visite, 1 appel, 1 WhatsApp',
     k.semaines[3].parType.visit === 1 && k.semaines[3].parType.call === 1 && k.semaines[3].parType.whatsapp === 1);
  ok('la semaine d’il y a trois semaines porte sa visite', k.semaines[0].parType.visit === 1);
  ok('le changement de colonne du pipeline n’est pas une interaction', !k.semaines[2].parType.meeting);

  ok('pipeline : un statut vide compte comme nouvelle demande', k.pipeline.join(',') === '2,2,1,1');
  ok('en cours : visites + négociations', k.enCours === 3);
  ok('taux de signature arrondi à l’unité (1 sur 6)', k.tauxSignature === 17);

  /* Vus une fois, jamais recontactés. */
  const ids = k.sansDeuxieme.map(x => x.client.id);
  ok('un seul appel il y a 8 jours, rien de prévu → signalé', ids.includes(1));
  ok('une seule visite, mais une suite prévue → non', !ids.includes(2));
  ok('plusieurs échanges → non', !ids.includes(3));
  ok('un client signé → non', !ids.includes(4));
  ok('aucune interaction → non (rien à relancer)', !ids.includes(5));
  ok('une seule visite il y a 6 jours, issue notée, rien de prévu → signalé (trois jours passés)', ids.includes(6));
  const frais = indicateursTableau([A({ id: 9, client_id: 1, type: 'call', date: '2026-11-10' })], clients, [], MERCREDI);
  ok('un premier contact d’hier n’est pas encore « jamais recontacté »', frais.sansDeuxieme.length === 0);

  ok('à traiter = en retard + sans suite, comme « Aujourd’hui »', k.aTraiter === k.enRetard + k.sansSuite);

  /* ── Le financier est sorti ── */
  const dash = grab(/async function showDashboard[\s\S]*?\n}/, 'showDashboard');
  ok('plus de chiffre d’affaires', !/Chiffre d|formatMoney|FCFA/.test(dash));
  ok('les paiements ne sont plus lus', !dash.includes("getAll('payments')"));
  ok('plus d’alerte de paiement en retard', !/paiement/i.test(dash));
  ok('plus de graphique des origines', !src.includes('sourceChart'));

  /* ── Chaque carte mène à un écran qui existe ── */
  const table = grab(/const ECRANS_FRAGMENT = \{[\s\S]*?\n\};/, 'ECRANS_FRAGMENT');
  const liens = [...dash.matchAll(/href="#([\w-]+)"/g)].map(m => m[1]);
  ok('quatre cartes cliquables', liens.length === 4);
  ok('chaque carte mène à un écran déclaré dans ECRANS_FRAGMENT',
     liens.every(l => table.includes("'" + l + "':")));

  return { title: 'Tableau de bord opérationnel', checks };
}

module.exports = { run };
