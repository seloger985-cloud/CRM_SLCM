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

/* ── Les modules de contrôle ── */
for (const mod of ['check-columns', 'check-handlers', 'test-escaping', 'test-matching', 'test-duplicates', 'test-suggestions', 'test-followups', 'test-screens']) {
  let result;
  try {
    result = require('./' + mod).run();
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
