/* Une visite ou un rendez-vous ne s'enregistre plus sans suite décidée.
 *
 * Raison d'être : le 09/11/2026, un gros client a été perdu. Rencontré en
 * visite, il n'a jamais été relancé : le formulaire acceptait une visite sans
 * rien prévoir après, et rien ne l'a rappelé à l'agent. L'absence de suite
 * doit être un choix explicite (« Aucune suite nécessaire »), jamais un oubli.
 *
 * Et la date du lendemain doit être celle de DOUALA : `toISOString()` rend la
 * date UTC, donc la veille entre minuit et une heure du matin — une relance
 * « pour demain » notée à 00h30 tombait le jour même.
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
    grab(/const FUSEAU_AGENCE[^\n]*/, 'FUSEAU_AGENCE'),
    grab(/function dateLocale[\s\S]*?\n}/, 'dateLocale'),
    grab(/function ajouterJours[\s\S]*?\n}/, 'ajouterJours'),
    grab(/const TYPES_SUITE_REQUISE[^\n]*/, 'TYPES_SUITE_REQUISE'),
    grab(/const SUITE_VISITE_DEFAUT[^\n]*/, 'SUITE_VISITE_DEFAUT'),
    grab(/function suiteRequise[\s\S]*?\n}/, 'suiteRequise'),
    grab(/function suiteParDefaut[\s\S]*?\n}/, 'suiteParDefaut'),
    grab(/function verifierSuite[\s\S]*?\n}/, 'verifierSuite')
  ].join('\n') + '\nreturn { dateLocale, ajouterJours, suiteRequise, suiteParDefaut, verifierSuite, SUITE_VISITE_DEFAUT };')();
  const { dateLocale, ajouterJours, suiteRequise, suiteParDefaut, verifierSuite, SUITE_VISITE_DEFAUT } = scope;

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const eq = (label, got, attendu) =>
    checks.push([`${label} → ${attendu}` + (got === attendu ? '' : ` (obtenu ${got})`), got === attendu]);

  /* ── La date de Douala ── */
  eq('23h30 UTC, c’est déjà le lendemain à Douala',
     dateLocale(new Date('2026-11-09T23:30:00Z')), '2026-11-10');
  eq('en pleine journée, rien ne change', dateLocale(new Date('2026-11-10T10:00:00Z')), '2026-11-10');
  eq('la nuit du réveillon change d’année', dateLocale(new Date('2026-12-31T23:10:00Z')), '2027-01-01');
  eq('demain, en fin de mois', ajouterJours('2026-11-30', 1), '2026-12-01');
  eq('demain, en fin d’année', ajouterJours('2026-12-31', 1), '2027-01-01');
  ok('une date illisible ne produit rien', ajouterJours('pas une date', 1) === null);

  /* ── Quels types exigent une suite ── */
  ok('une visite exige une suite', suiteRequise('visit'));
  ok('un rendez-vous exige une suite', suiteRequise('meeting'));
  ok('un appel reste libre', !suiteRequise('call'));
  ok('un e-mail reste libre', !suiteRequise('email'));
  ok('un type absent ne bloque rien', !suiteRequise(undefined));

  /* ── La suite proposée d'office ── */
  const d = suiteParDefaut('visit', '2026-11-09');
  ok('une visite propose « Relancer pour avoir son retour »', d.next_step === SUITE_VISITE_DEFAUT);
  eq('pour le lendemain de la visite', d.next_date, '2026-11-10');
  ok('un appel ne propose aucune suite',
     suiteParDefaut('call', '2026-11-09').next_step === '' && suiteParDefaut('call', '2026-11-09').next_date === '');
  ok('un rendez-vous ne pré-remplit rien (la suite dépend de ce qui s’y dit)',
     suiteParDefaut('meeting', '2026-11-09').next_step === '');

  /* ── Ce qui bloque l'enregistrement ── */
  ok('le cas du client perdu : visite sans suite → refusée',
     verifierSuite({ type: 'visit', next_step: null, next_date: null }, false) !== null);
  ok('un rendez-vous sans suite → refusé',
     verifierSuite({ type: 'meeting', next_step: '', next_date: null }, false) !== null);
  ok('une suite faite d’espaces ne compte pas',
     verifierSuite({ type: 'visit', next_step: '   ', next_date: '2026-11-10' }, false) !== null);
  ok('une suite sans date → refusée (elle ne passerait jamais en retard)',
     verifierSuite({ type: 'visit', next_step: 'Rappeler', next_date: null }, false) !== null);
  ok('suite et date → acceptée',
     verifierSuite({ type: 'visit', next_step: 'Rappeler', next_date: '2026-11-10' }, false) === null);
  ok('« Aucune suite nécessaire » cochée → acceptée',
     verifierSuite({ type: 'visit', next_step: null, next_date: null }, true) === null);
  ok('un appel sans suite → accepté',
     verifierSuite({ type: 'call', next_step: null, next_date: null }, false) === null);
  ok('le refus explique comment s’en sortir',
     String(verifierSuite({ type: 'visit' }, false)).includes('Aucune suite nécessaire'));

  /* ── Le formulaire s'en sert vraiment ──
     Une règle juste mais jamais appelée ne protège rien : c'est le défaut
     le plus probable d'une prochaine refonte du formulaire. */
  const save = grab(/async function saveActivity[\s\S]*?\n}/, 'saveActivity');
  ok('saveActivity vérifie la suite AVANT d’écrire en base',
     save.includes('verifierSuite(') && save.indexOf('verifierSuite(') < save.indexOf('.insert('));
  const form = grab(/function showActivityForm[\s\S]*?\n}/, 'showActivityForm');
  ok('le formulaire porte la case « Aucune suite nécessaire »',
     form.includes('id="activity-no-suite"') && form.includes('Aucune suite nécessaire'));
  ok('le formulaire pré-remplit la suite à la création seulement',
     /editing \? \{[^}]*\} : suiteParDefaut\(/.test(form));

  return { title: 'Suite obligatoire après une visite', checks };
}

module.exports = { run };
