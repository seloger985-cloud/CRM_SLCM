/* Issue et suite d'une activité.
 *
 * Raison d'être : « Echec : pas disponible », « en attente retour clt sur
 * négo demandé » — l'agent écrivait ces deux informations en prose dans les
 * notes, donc le CRM ne pouvait pas savoir qu'une visite avait échoué ni
 * qu'un client attendait une réponse. Les règles d'automatisation tournaient
 * en étant aveugles à l'essentiel.
 *
 * Une suite ouverte doit remonter, une suite close doit disparaître, et
 * l'ordre doit mettre l'urgent devant. C'est tout ce que ces contrôles
 * vérifient — mais s'ils cèdent, le tableau de bord ment.
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
    grab(/const OUTCOME_FR = \{[\s\S]*?\n\};/, 'OUTCOME_FR'),
    grab(/function outcomeLabel[\s\S]*?\n}/, 'outcomeLabel'),
    grab(/function hasOpenFollowUp[\s\S]*?\n}/, 'hasOpenFollowUp'),
    grab(/function openFollowUps[\s\S]*?\n}/, 'openFollowUps')
  ].join('\n') + '\nreturn { OUTCOME_FR, outcomeLabel, hasOpenFollowUp, openFollowUps };')();
  const { OUTCOME_FR, outcomeLabel, hasOpenFollowUp, openFollowUps } = scope;

  const ACTIVITES = [
    { id: 1, type: 'visit', outcome: 'failed',
      next_step: 'Proposer Bonapriso', next_date: '2026-09-03', next_done_at: null },
    { id: 2, type: 'meeting', outcome: 'pending',
      next_step: 'Relancer sur la négo', next_date: '2026-09-01', next_done_at: null },
    { id: 3, type: 'call', outcome: 'done',
      next_step: null, next_date: null, next_done_at: null },
    { id: 4, type: 'visit', outcome: 'failed',
      next_step: 'Déjà rappelé', next_date: '2026-08-20',
      next_done_at: '2026-08-21T09:00:00Z' },
    { id: 5, type: 'call', outcome: null,
      next_step: 'Sans échéance', next_date: null, next_done_at: null }
  ];

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);
  const ouvertes = openFollowUps(ACTIVITES);

  ok('une activité sans suite n’attend rien', !hasOpenFollowUp(ACTIVITES[2]));
  ok('une suite déjà faite n’attend plus rien', !hasOpenFollowUp(ACTIVITES[3]));
  ok('une suite non close attend', hasOpenFollowUp(ACTIVITES[0]));

  ok('trois suites restent ouvertes', ouvertes.length === 3);
  ok('la suite close est écartée', !ouvertes.some(a => a.id === 4));
  ok('la plus urgente arrive en tête', ouvertes[0].id === 2);
  ok('une suite sans échéance passe en dernier',
     ouvertes[ouvertes.length - 1].id === 5);

  ok('les quatre issues ont un libellé', Object.keys(OUTCOME_FR).length === 4);
  ok('une issue inconnue ne casse rien', outcomeLabel('inexistant') === '');
  ok('une issue vide ne casse rien', outcomeLabel(null) === '');
  ok('« failed » se lit en français', outcomeLabel('failed').length > 3);

  return { title: 'Issue et suite d’une activité', checks };
}

module.exports = { run };
