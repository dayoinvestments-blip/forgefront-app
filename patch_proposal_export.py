#!/usr/bin/env python3
"""
ForgeFront — Proposal export: Word (.doc) download + clean PDF/print
Run from repo root: python patch_proposal_export.py

Adds:
  - "Download Word" button -> downloads a Word-openable .doc of the proposal
    (includes the compliance checklist as an appendix). Dependency-free.
  - Fixes the broken printBid() so PDF/print shows ONLY the proposal, cleanly,
    and relabels it "Save as PDF".
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# 1. Add a "Download Word" button next to the existing export buttons
h, _ = repl(h,
"""              <button class="btn g sm" onclick="copyBid()">📋 Copy</button>
              <button class="btn g sm" onclick="printBid()">🖨 Print</button>
              <button class="btn p sm" onclick="saveBid()">💾 Save Bid</button>""",
"""              <button class="btn g sm" onclick="copyBid()">📋 Copy</button>
              <button class="btn g sm" onclick="downloadBidWord()">📄 Download Word</button>
              <button class="btn g sm" onclick="printBid()">🖨 Save as PDF</button>
              <button class="btn p sm" onclick="saveBid()">💾 Save Bid</button>""",
"Download Word button added")

# 2. Replace the broken printBid() with a clean one (proposal text only)
# The old one accidentally captured page HTML via the template literal.
old_print_start = "function printBid() {"
si = h.index(old_print_start)
# the old function ends at "  w.document.close(); w.print();\n}"
end_anchor = "w.document.close(); w.print();\n}"
ei = h.index(end_anchor) + len(end_anchor)
old_print = h[si:ei]

new_print = '''function bidPlainText() {
  var t = (document.getElementById('bid-text') ? document.getElementById('bid-text').textContent : '') || '';
  // Append the compliance checklist as an appendix if present
  var cl = document.getElementById('bid-checklist');
  if (cl && cl.textContent.trim()) {
    var items = cl.querySelectorAll('label');
    if (items.length) {
      t += '\\n\\n\\n========================================\\nCOMPLIANCE CHECKLIST (verify before submitting)\\n========================================\\n';
      items.forEach(function(li, i){
        var head = li.querySelector('div > div');
        var why  = li.querySelectorAll('div > div')[1];
        t += '\\n[ ] ' + (head ? head.textContent : li.textContent.trim());
        if (why) t += '\\n      ' + why.textContent;
      });
    }
  }
  return t;
}

function printBid() {
  var text = bidPlainText();
  var w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to use Save as PDF', 'e'); return; }
  var esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  w.document.write('<!DOCTYPE html><html><head><title>Proposal — ' +
    ((document.getElementById('bid-sol')||{value:'Proposal'}).value || 'Proposal') +
    '</title><style>' +
    'body{font-family:Georgia,\\'Times New Roman\\',serif;font-size:12pt;line-height:1.6;max-width:800px;margin:40px auto;padding:0 24px;color:#111}' +
    'pre{white-space:pre-wrap;font-family:inherit;margin:0}' +
    '@media print{body{margin:0.6in}}' +
    '</style></head><body><pre>' + esc + '</pre>' +
    '<script>window.onload=function(){setTimeout(function(){window.print();},250);}<\\/script>' +
    '</body></html>');
  w.document.close();
}

function downloadBidWord() {
  var text = bidPlainText();
  if (!text.trim()) { toast('Generate a proposal first', 'e'); return; }
  var sol = (document.getElementById('bid-sol')||{value:''}).value || 'Proposal';
  var safe = sol.replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,60) || 'Proposal';

  // Word-openable HTML document (dependency-free). Word opens and lets user Save As .docx.
  var esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>' + safe + '</title>' +
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>' +
    '<w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->' +
    '<style>@page{size:8.5in 11in;margin:1in}' +
    'body{font-family:Georgia,\\'Times New Roman\\',serif;font-size:12pt;line-height:1.5;color:#111}' +
    '</style></head><body>' + esc + '</body></html>';

  var blob = new Blob(['\\ufeff', html], { type: 'application/msword' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = safe + '.doc';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  toast('Word document downloaded — open and Save As .docx to finalize', 's');
}'''

h = h.replace(old_print, new_print, 1)
print("  OK  printBid replaced (clean) + bidPlainText + downloadBidWord added")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Export added. Run:")
print("  git add -A")
print('  git commit -m "feat: proposal export to Word + clean PDF"')
print("  git push")
