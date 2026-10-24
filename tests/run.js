#!/usr/bin/env node
/* Lance tous les contrôles.  →  node tests/run.js
 *
 * Aucune dépendance : Node seul. Sort en code 1 si un contrôle échoue, pour
 * qu'un jour une intégration continue puisse s'y accrocher sans rien changer.
 *
 * Chaque module expose run() → { title, checks: [[libellé, booléen]] }.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
let failed = 0;

/* ── Syntaxe : `node --check` sur chaque fichier livré au navigateur ── */
console.log('\n' + DIM + 'Syntaxe' + OFF);
for (const f of fs.readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, 'assets/js', f)], { stdio: 'pipe' });
    console.log(`  ${GREEN}ok${OFF}     ${f}`);
  } catch (e) {
    console.log(`  ${RED}ÉCHEC${OFF}  ${f}\n${String(e.stderr || e.message).trim()}`);
    failed++;
  }
}

/* ── Syntaxe des scripts EN LIGNE des pages HTML ──
 *
 * Raison d'être : `facture.html` porte ~1 800 lignes de JavaScript dans une
 * balise <script>, et la boucle ci-dessus ne lit que `assets/js/`. Ce code
 * n'avait donc JAMAIS été vérifié. Le 15/10/2026 une chaîne contenant un vrai
 * saut de ligne y a été introduite — faute de frappe invisible à la lecture,
 * page entièrement morte au chargement, et toute la suite restait verte.
 *
 * On écrit dans le dossier temporaire du système : `node --check` veut un
 * fichier, et le dépôt n'a pas à porter ces extraits.
 */
const os = require('os');
console.log(`
${DIM}Syntaxe des pages${OFF}`);
for (const page of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const blocs = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (!blocs.length) { console.log(`  ${GREEN}ok${OFF}     ${page} (aucun script en ligne)`); continue; }
  let souci = null;
  blocs.forEach((m, i) => {
    if (souci) return;
    const tmp = path.join(os.tmpdir(), 'slcm-' + page.replace(/\W/g, '_') + '-' + i + '.js');
    fs.writeFileSync(tmp, m[1]);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { souci = String(e.stderr || e.message).trim(); }
    finally { try { fs.unlinkSync(tmp); } catch (_e) {} }
  });
  if (souci) { console.log(`  ${RED}ÉCHEC${OFF}  ${page}
${souci}`); failed++; }
  else console.log(`  ${GREEN}ok${OFF}     ${page} (${blocs.length} script(s) en ligne)`);
}

/* ── Caractères de contrôle dans les sources ──
 *
 * Raison d'être : éditer ces fichiers depuis un script dont les chaînes ne
 * sont pas brutes transforme le `\b` d'une regex JavaScript en VRAI caractère
 * backspace (0x08), et le `\n` d'une chaîne en saut de ligne réel.
 *
 * Les deux sont invisibles — à la lecture, dans un diff, et pour `grep`. Le
 * 15/10/2026 un `\b` ainsi corrompu a rendu une regex silencieusement fausse
 * (elle capturait six blocs au lieu d'un), et un `\n` corrompu a tué toute la
 * page facture.html au chargement pendant que la suite restait verte.
 *
 * Ce contrôle coûte quelques millisecondes et ferme la famille entière.
 */
console.log(`\n${DIM}Caractères de contrôle${OFF}`);
{
  /* backspace, tabulation verticale, saut de page, NUL. La tabulation (0x09)
     et les sauts de ligne sont évidemment exclus : ils sont légitimes. */
  const interdits = [0x08, 0x0b, 0x0c, 0x00];
  const vus = [];

  const parcourir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { parcourir(f); continue; }
      if (!/\.(js|html|css|sql)$/.test(e.name)) continue;
      const t = fs.readFileSync(f, 'utf8');
      for (const c of interdits) {
        if (t.indexOf(String.fromCharCode(c)) === -1) continue;
        const avant = t.slice(0, t.indexOf(String.fromCharCode(c)));
        vus.push(path.relative(ROOT, f) + ':' + (avant.split('\n').length)
                 + ' (0x' + c.toString(16).padStart(2, '0') + ')');
      }
    }
  };
  parcourir(ROOT);

  if (vus.length) {
    console.log(`  ${RED}ÉCHEC${OFF}  caractère de contrôle : ${vus.join(', ')}`);
    failed++;
  } else {
    console.log(`  ${GREEN}ok${OFF}     aucun caractère de contrôle dans les sources`);
  }
}

/* ── Les modules de contrôle ──
   run() peut être asynchrone : certains contrôles doivent laisser passer un
   tour de boucle pour voir les promesses rejetées. */
(async () => {
for (const mod of ['check-migrations', 'test-dates', 'check-columns', 'check-invoice', 'check-handlers', 'test-escaping', 'test-matching', 'test-duplicates', 'test-suggestions', 'test-followups', 'test-covers', 'test-screens', 'test-confreres', 'test-demandes-site']) {
  let result;
  try {
    result = await require('./' + mod).run();
  } catch (e) {
    console.log('\n' + DIM + mod + OFF + `\n  ${RED}ÉCHEC${OFF}  ${e.message}`);
    failed++;
    continue;
  }
  console.log('\n' + DIM + result.title + OFF);
  for (const [label, pass] of result.checks) {
    console.log(`  ${pass ? GREEN + 'ok' + OFF + '    ' : RED + 'ÉCHEC' + OFF + ' '} ${label}`);
    if (!pass) failed++;
  }
}

console.log(failed
  ? `\n${RED}${failed} contrôle(s) en échec.${OFF}\n`
  : `\n${GREEN}Tout passe.${OFF}\n`);
process.exit(failed ? 1 : 0);
})();
