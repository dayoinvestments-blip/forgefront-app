// Syntax-checks every inline <script> in an HTML file WITHOUT executing it.
// Usage: node check-inline.js app.html
const fs = require('fs');
const vm = require('vm');

const file = process.argv[2] || 'app.html';
const html = fs.readFileSync(file, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;                                  // external script
  if (/type\s*=\s*["']?(application\/json|text\/template|text\/html)/i.test(attrs)) continue; // data/template
  const code = m[2];
  i++;
  try {
    // Wrap in a function so legal top-level `return` in handlers doesn't false-fail.
    new vm.Script('(function(){' + code + '\n})', { filename: file + ' :: inline #' + i });
    console.log('OK   inline #' + i + ' (' + code.length + ' chars)');
  } catch (e) {
    bad++;
    console.error('FAIL inline #' + i + ': ' + e.message);
  }
}
console.log('\nChecked ' + i + ' inline script(s); ' + bad + ' with syntax errors.');
process.exit(bad ? 1 : 0);
