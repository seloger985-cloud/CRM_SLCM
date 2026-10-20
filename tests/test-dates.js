/* Arithmétique des dates de bail.
 *
 * Raison d'être : la fin du bail de Yepmo était fausse à l'écran. La première
 * version réutilisait `addMonths`, écrite pour les PÉRIODES de loyer, qui rend
 * toujours un 1er du mois — un bail du 15 avril sur 12 mois affichait donc
 * « 01/04/2027 » au lieu du 14 avril. Deux fautes dans une seule ligne : le
 * jour du mois jeté, et le « moins un jour » absent.
 *
 * Ces fonctions sont PURES : rien n'empêchait de les vérifier, et rien ne
 * l'avait été. Les valeurs ci-dessous ont été obtenues en exécutant le code,
 * pas en les déduisant — c'est précisément ce qui avait manqué.
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
    grab(/function firstOfMonth[\s\S]*?\n}/, 'firstOfMonth'),
    grab(/function addMonths[\s\S]*?\n}/, 'addMonths'),
    grab(/function leaseEnd[\s\S]*?\n}/, 'leaseEnd'),
    grab(/function daysUntil[\s\S]*?\n}/, 'daysUntil'),
    grab(/function periodLabel[\s\S]*?\n}/, 'periodLabel'),
    grab(/const MOIS_FR = \[[\s\S]*?\];/, 'MOIS_FR')
  ].join('\n') + '\nreturn { addMonths, leaseEnd, daysUntil, periodLabel };')();

  const { addMonths, leaseEnd, daysUntil, periodLabel } = scope;
  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const eq = (label, got, attendu) =>
    checks.push([`${label} → ${attendu}` + (got === attendu ? '' : ` (obtenu ${got})`), got === attendu]);

  /* ── leaseEnd : la règle du quantième ── */
  eq('le cas Yepmo : 15/04/2026 + 12 mois', leaseEnd('2026-04-15', 12), '2027-04-14');
  eq('une année pleine depuis le 1er janvier', leaseEnd('2026-01-01', 12), '2026-12-31');
  eq('chevauche le changement d’année', leaseEnd('2026-12-15', 3), '2027-03-14');
  eq('vingt-quatre mois', leaseEnd('2026-05-01', 24), '2028-04-30');

  /* Quand le quantième n'existe pas dans le mois d'arrivée, le bail court
     jusqu'au dernier jour du mois — la veille d'un « 31 février » tombe APRÈS
     le 28, pas avant. Ces trois cas valaient un jour de moins avant correction. */
  eq('31 janvier + 1 mois (pas de 31 février)', leaseEnd('2026-01-31', 1), '2026-02-28');
  eq('31 mars + 1 mois (avril a 30 jours)', leaseEnd('2026-03-31', 1), '2026-04-30');
  eq('29 février bissextile + 12 mois', leaseEnd('2024-02-29', 12), '2025-02-28');
  eq('30 juin + 6 mois (décembre a 31 jours)', leaseEnd('2026-06-30', 6), '2026-12-29');

  /* Une durée absente signifie « durée indéterminée », pas une erreur. */
  ok('une durée nulle ne produit pas de date', leaseEnd('2026-04-15', 0) === null);
  ok('une durée absente ne produit pas de date', leaseEnd('2026-04-15', null) === null);
  ok('une date absente ne produit pas de date', leaseEnd(null, 12) === null);
  ok('une date illisible ne lève pas', leaseEnd('pas une date', 12) === null);

  /* ── La frontière entre les deux fonctions ──
     addMonths sert aux PÉRIODES de loyer et doit continuer de rendre un 1er
     du mois. Les confondre est exactement ce qui a produit le défaut. */
  eq('addMonths reste sur le 1er du mois', addMonths('2026-04-01', 12), '2027-04-01');
  ok('leaseEnd et addMonths ne rendent pas la même chose',
     leaseEnd('2026-04-15', 12) !== addMonths('2026-04-01', 12));

  /* ── daysUntil ── */
  eq('cinq jours avant', String(daysUntil('2026-10-25', '2026-10-20')), '5');
  eq('le jour même', String(daysUntil('2026-10-20', '2026-10-20')), '0');
  eq('cinq jours de retard', String(daysUntil('2026-10-15', '2026-10-20')), '-5');
  eq('par-dessus le changement d’année', String(daysUntil('2027-01-01', '2026-12-27')), '5');
  ok('une date absente ne lève pas', daysUntil(null, '2026-10-20') === null);

  /* ── periodLabel : le mois en toutes lettres ── */
  eq('octobre', periodLabel('2026-10-01'), 'octobre 2026');
  eq('janvier', periodLabel('2027-01-01'), 'janvier 2027');
  ok('une période absente ne lève pas', periodLabel(null) === '—');

  /* ── Les rappels ──
   *
   * Fonction pure, à qui on passe la date du jour : elle est donc vérifiable
   * sans attendre le calendrier. Les trois cadences demandées le 20/10/2026 —
   * 5 jours avant une échéance ou une fin de bail, relance tous les 7 jours —
   * ne valent que si elles excluent AUSSI ce qu'il faut : un bail terminé, un
   * loyer déjà payé, un paiement qui n'est pas un loyer, et surtout une
   * relance envoyée il y a deux jours.
   */
  const alertScope = new Function([
    grab(/function leaseEnd[\s\S]*?\n}/, 'leaseEnd'),
    grab(/function daysUntil[\s\S]*?\n}/, 'daysUntil'),
    grab(/const RENEWAL_NOTICE_DAYS[^\n]*/, 'RENEWAL_NOTICE_DAYS'),
    grab(/const RELANCE_EVERY_DAYS[^\n]*/, 'RELANCE_EVERY_DAYS'),
    grab(/function geranceAlerts[\s\S]*?\n}/, 'geranceAlerts')
  ].join('\n') + '\nreturn { geranceAlerts, RENEWAL_NOTICE_DAYS, RELANCE_EVERY_DAYS };')();

  ok('le délai de préavis est bien de 5 jours', alertScope.RENEWAL_NOTICE_DAYS === 5);
  ok('la cadence de relance est bien de 7 jours', alertScope.RELANCE_EVERY_DAYS === 7);

  const AUJ = '2026-10-20';
  const baux = [
    { id: 1, status: 'active', start_date: '2025-10-25', duration_months: 12 },  // finit J+4
    { id: 2, status: 'active', start_date: '2026-01-01', duration_months: 12 },  // loin
    { id: 3, status: 'ended',  start_date: '2025-10-25', duration_months: 12 },  // clos
    { id: 4, status: 'active', start_date: '2026-01-01', duration_months: null },// indéterminée
    { id: 5, status: 'active', start_date: '2025-06-01', duration_months: 12 }   // déjà échu
  ];
  const pay = [
    { id: 1, lease_id: 1, status: 'pending', payment_date: '2026-10-01', last_reminder_at: null },
    { id: 2, lease_id: 1, status: 'pending', payment_date: '2026-09-01', last_reminder_at: '2026-10-18' },
    { id: 3, lease_id: 1, status: 'pending', payment_date: '2026-08-01', last_reminder_at: '2026-10-10' },
    { id: 4, lease_id: 1, status: 'paid',    payment_date: '2026-10-01', last_reminder_at: null },
    { id: 5, lease_id: 1, status: 'pending', payment_date: '2026-10-23', last_reminder_at: null },
    { id: 6, lease_id: 1, status: 'pending', payment_date: '2026-11-30', last_reminder_at: null },
    { id: 7, lease_id: null, status: 'pending', payment_date: '2026-09-01', last_reminder_at: null }
  ];
  const a = alertScope.geranceAlerts(baux, pay, AUJ);
  const ids = (liste, cle) => liste.map(x => x[cle].id).join(',');

  eq('deux baux à renouveler, le plus urgent en tête', ids(a.renouvellements, 'lease'), '5,1');
  ok('un bail qui finit dans 72 jours ne remonte pas',
     !a.renouvellements.some(x => x.lease.id === 2));
  ok('un bail terminé ne remonte pas',
     !a.renouvellements.some(x => x.lease.id === 3));
  ok('un bail à durée indéterminée ne remonte pas',
     !a.renouvellements.some(x => x.lease.id === 4));
  ok('un bail déjà échu est signalé en négatif',
     (a.renouvellements.find(x => x.lease.id === 5) || {}).jours < 0);

  eq('deux loyers à relancer, le plus en retard en tête', ids(a.relances, 'payment'), '3,1');
  ok('un loyer relancé il y a 2 jours attend son tour',
     !a.relances.some(x => x.payment.id === 2));
  ok('un loyer payé ne se relance pas',
     !a.relances.some(x => x.payment.id === 4));
  ok('un paiement sans bail n’est pas un loyer',
     !a.relances.some(x => x.payment.id === 7));
  ok('un loyer jamais relancé est marqué comme tel',
     (a.relances.find(x => x.payment.id === 1) || {}).depuis === null);

  eq('une seule échéance dans les 5 jours', ids(a.echeances, 'payment'), '5');
  ok('une échéance à 41 jours n’est pas annoncée',
     !a.echeances.some(x => x.payment.id === 6));

  /* Rien à signaler ne doit produire aucun bandeau : une alerte toujours
     présente cesse d'être lue. */
  const calme = alertScope.geranceAlerts([], [], AUJ);
  ok('aucune alerte quand il n’y a rien à signaler',
     !calme.renouvellements.length && !calme.relances.length && !calme.echeances.length);

  return { title: 'Dates et rappels de gérance', checks };
}

module.exports = { run };
