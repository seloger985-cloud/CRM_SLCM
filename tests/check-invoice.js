/* Le module Facture face à la base.
 *
 * Raison d'être : `facture.html` écrit en base sans passer par `TABLE_COLS`,
 * donc `check-columns` ne le voyait pas. Or c'est exactement le terrain du
 * défaut le plus coûteux de ce projet — `TABLE_COLS.payments` demandait des
 * colonnes `accompte`/`reste` inexistantes, et PostgREST rejetait TOUTE
 * lecture de la table : écran Paiements vide, CA du tableau de bord à zéro,
 * relances muettes. Aucune erreur visible.
 *
 * L'encaissement rouvre ce terrain : il écrit dans `invoices` ET dans
 * `payments`, avec des valeurs soumises à des contraintes CHECK. Un `<option>`
 * qui dérive de son CHECK ne se voit pas en relisant le code — ça casse au
 * moment où l'agent clique, devant le client, un reçu à la main.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* Les valeurs listées par une contrainte CHECK ... = ANY (ARRAY[...]). */
function checkValues(sql, constraintName) {
  const re = new RegExp('constraint\\s+' + constraintName + '[\\s\\S]*?ARRAY\\s*\\[([^\\]]*)\\]', 'i');
  const m = sql.match(re);
  if (!m) return null;
  return m[1].split(',')
    .map(s => (s.match(/'([^']*)'/) || [])[1])
    .filter(Boolean);
}

/* Le source DÉBARRASSÉ de ses commentaires.
 *
 * Indispensable, et appris deux fois le même jour : un contrôle qui cherche
 * `.neq('status','payee')` dans le fichier entier le trouve dans le
 * COMMENTAIRE qui explique la garde, juste au-dessus du code. Il passe donc
 * même quand la garde a disparu — et un contrôle qui ne peut pas échouer
 * rassure à tort. Même piège plus tôt avec `strict: true`.
 */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function run() {
  const facture = fs.readFileSync(path.join(ROOT, 'facture.html'), 'utf8');
  const code = codeOnly(facture);
  /* Le SEUL script en ligne de la page. Analyser le HTML entier ferait passer
     l'URL `.../umd/supabase.js` du <head> pour un usage de `supabase.` — un
     faux positif qui a coûté un aller-retour. */
  const script = codeOnly((facture.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '');
  const sql = ['01_schema.sql', '07_invoice_receipt.sql', '08_invoice_columns.sql']
    .map(f => fs.readFileSync(path.join(ROOT, 'sql', f), 'utf8')).join('\n');

  const checks = [];
  const ok = (label, cond) => checks.push([label, !!cond]);

  /* ── Le moyen de paiement : <option> contre CHECK ──
     Les deux listes sont écrites à deux endroits, dans deux langages. Rien
     ne les relie, donc rien ne signale une divergence avant l'échec. */
  const bloc = (facture.match(/<select id="cashMethod">([\s\S]*?)<\/select>/) || [])[1] || '';
  const options = [...bloc.matchAll(/value="([^"]*)"/g)].map(m => m[1]);
  const autorises = checkValues(sql, 'invoices_payment_method_check') || [];

  ok('le <select> des moyens de paiement est trouvé', options.length > 0);
  ok('la contrainte invoices_payment_method_check existe', autorises.length > 0);
  ok(`les ${options.length} moyens proposés sont tous acceptés par la base`,
     options.length > 0 && options.every(o => autorises.indexOf(o) !== -1));

  /* ── Les statuts écrits ── */
  const statutsFacture = checkValues(sql, 'invoices_status_check') || [];
  ok("le statut 'payee' écrit à l'encaissement est accepté",
     statutsFacture.indexOf('payee') !== -1);
  ok("facture.html écrit bien 'payee' quelque part — sinon l'encaissement est mort",
     /status:\s*'payee'/.test(code));

  const statutsPaiement = checkValues(sql, 'payments_status_check') || [];
  const statutUtilise = (code.match(/status:\s*'(\w+)',\s*\n\s*payment_date/) || [])[1];
  ok(`le statut '${statutUtilise}' inséré dans payments est accepté par la base`,
     !!statutUtilise && statutsPaiement.indexOf(statutUtilise) !== -1);

  /* ── Les colonnes écrites existent ──
     C'est ce contrôle qui aurait signalé que sql/01_schema.sql ne liste pas
     `property_id` sur `invoices` alors que facture.html l'écrit depuis le
     début : le fichier de schéma a été complété à la main, et il a dérivé. */
  const bodyInvoices = (sql.match(/create table public\.invoices \(([\s\S]*?)\n\);/) || [])[1] || '';
  const colsInvoices = new Set(
    bodyInvoices.split('\n')
      .map(l => (l.trim().match(/^([a-z_]+)\s/) || [])[1])
      .filter(Boolean)
  );
  /* Plus celles ajoutées par une migration ultérieure. */
  [...sql.matchAll(/alter table public\.invoices\s+add column if not exists\s+([a-z_]+)/g)]
    .forEach(m => colsInvoices.add(m[1]));

  const ecrites = ['status', 'payment_date', 'payment_method'];
  const manquantes = ecrites.filter(c => !colsInvoices.has(c));
  ok(manquantes.length
      ? `colonne écrite mais absente du schéma : ${manquantes.join(', ')}`
      : `les ${ecrites.length} colonnes de l'encaissement sont au schéma`,
     manquantes.length === 0);

  /* ── La migration est-elle bien dans le dépôt ? ──
     Le code serait inopérant sans elle, et l'échec se produirait en
     production, au clic. */
  ok('sql/07_invoice_receipt.sql existe',
     fs.existsSync(path.join(ROOT, 'sql', '07_invoice_receipt.sql')));

  /* ── Pas de double comptage ──
     Encaisser deux fois la même facture créerait deux lignes dans payments,
     donc gonflerait le chiffre d'affaires du tableau de bord. La garde est
     le `.neq('status','payee')` sur l'update : si rien n'est mis à jour, on
     n'insère pas le paiement. */
  ok("la garde contre le double encaissement est en place (.neq status payee)",
     /\.neq\(\s*'status'\s*,\s*'payee'\s*\)/.test(code));

  /* ── Le duplicata se distingue ──
     Deux exemplaires indiscernables du même reçu pourraient justifier deux
     encaissements auprès d'un tiers. */
  ok('un reçu réimprimé porte la mention DUPLICATA', /DUPLICATA/.test(facture));

  /* ── Le reçu renvoie à sa facture ── */
  ok('le numéro de reçu se déduit de celui de la facture',
     /function receiptNumber/.test(code) && /'REC-'/.test(code));

  /* ── TOUTE colonne écrite doit exister ──
   *
   * Raison d'être : le 15/10/2026 la sauvegarde échouait en HTTP 400 parce que
   * `facture.html` écrivait `property_id`, absent de `invoices`. PostgREST
   * refuse l'insertion ENTIÈRE pour une seule colonne inconnue, et le
   * navigateur n'affiche qu'un « 400 » opaque. Même famille que le défaut
   * `accompte`/`reste` qui avait vidé l'écran Paiements.
   *
   * Les trois contrôles ci-dessus ne regardaient que les colonnes de
   * l'encaissement. Celui-ci couvre le payload entier. */
  const payloadBlock = (code.match(/const payload = \{([\s\S]*?)\n        \};/) || [])[1] || '';
  const ecritesToutes = new Set(
    [...payloadBlock.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1])
  );
  [...code.matchAll(/payload\.([a-z_]+)\s*=/g)].forEach(m => ecritesToutes.add(m[1]));

  const absentes = [...ecritesToutes].filter(c => !colsInvoices.has(c));
  ok('le payload de saveInvoice est bien analysé (' + ecritesToutes.size + ' colonnes)',
     ecritesToutes.size > 5);
  ok(absentes.length
      ? `écrite(s) dans invoices mais absente(s) du schéma : ${absentes.join(', ')}`
      : `les ${ecritesToutes.size} colonnes écrites dans invoices existent toutes`,
     absentes.length === 0);

  /* ── Aucun `supabase` sans client ──
   *
   * Raison d'être : cinq fonctions utilisaient une variable `supabase` qui
   * n'était déclarée NULLE PART. L'appel tombait donc sur `window.supabase`,
   * c'est-à-dire la BIBLIOTHÈQUE supabase-js — qui expose `createClient`, pas
   * `from`. Résultat : « supabase.from is not a function », autocomplétion
   * client et bien mortes depuis toujours, bouton « + Créer ce client »
   * inerte, et `invoices.client_id` qui restait nul sans que rien ne le dise.
   *
   * Le défaut ne se voit qu'à l'exécution, dans une fonction qu'il faut avoir
   * déclenchée. D'où ce contrôle statique. */
  const fonctions = script.split(/\n(?=    (?:async )?function )/);
  const orphelines = [];
  for (const f of fonctions) {
    if (!/\bsupabase\s*\./.test(f)) continue;
    const sig = f.match(/^\s*(?:async )?function (\w+)\s*\(([^)]*)\)/) || [];
    const declare = /(?:const|let|var)\s+supabase\s*=/.test(f);
    const parametre = /\bsupabase\b/.test(sig[2] || '');
    if (!declare && !parametre) orphelines.push(sig[1] || '(anonyme)');
  }
  ok(orphelines.length
      ? `utilise supabase sans client : ${orphelines.join(', ')}`
      : 'toute fonction qui appelle supabase en obtient un (déclaré ou reçu)',
     orphelines.length === 0);

  return { title: 'Module Facture et encaissement', checks };
}

module.exports = { run };
