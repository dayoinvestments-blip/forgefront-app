#!/usr/bin/env python3
"""
ForgeFront — Federal-only: remove ALL State/Local + Subcontract sample data
Run from repo root: python patch_federal_only.py

Root cause of "drywall search returns metal fab": the state-contracts.js and
subcontracts.js functions are 100% hardcoded mock, and the inline
getStateMockData/getSubcontractData fallbacks dump welding contracts for any
non-tech NAICS, relabeled with whatever NAICS you typed.

Fix: federal-only, real SAM.gov data. Removes the fake sources entirely.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# 1. Remove State & Local + Subcontract options from the source dropdown
h, _ = repl(h,
'''              <select id="f-source">
                <option value="all">All Sources</option>
                <option value="federal">🏛 Federal (SAM.gov)</option>
                <option value="state_local">🏗 State &amp; Local</option>''',
'''              <select id="f-source">
                <option value="federal">🏛 Federal (SAM.gov) — live</option>''',
"source dropdown federal-only")

# Catch a possible trailing subcontract option right after state_local
for opt in [
  '                <option value="subcontract">🤝 Subcontracts (SBA)</option>\n',
  '                <option value="subcontract">🤝 Subcontracts</option>\n',
  '                <option value="subcontract">🤝 Subcontract</option>\n',
  '<option value="subcontract">🤝 Subcontracts (SBA)</option>\n',
  '<option value="subcontract">🤝 Subcontracts</option>\n',
]:
    if opt in h:
        h = h.replace(opt, '', 1)
        print("  OK  removed leftover subcontract option")
        break

# 2. Remove the entire State/Local fetch+fallback block
state_block_start = "  // State/Local — Netlify function, falls back to mock data"
sub_block_marker  = "  // Subcontracts — Netlify function, falls back to mock data"
keyword_marker    = "  // Keyword filter (client-side)"
if state_block_start in h and keyword_marker in h:
    si = h.index(state_block_start)
    ei = h.index(keyword_marker)
    removed = h[si:ei]
    h = h[:si] + "  // (State/Local + Subcontract sample sources removed — federal SAM.gov data only)\n\n" + h[ei:]
    print(f"  OK  removed State/Local + Subcontract fetch blocks ({len(removed)} chars)")
else:
    print("  WARN state/sub block markers not found")

# 3. Delete the inline mock functions getStateMockData + getSubcontractData
gs = "function getStateMockData(state, naics) {"
if gs in h:
    si = h.index(gs)
    # ends right before getFederalMockData removal note OR next function. Find next "function getSubcontractData" then its end.
    # We'll remove from getStateMockData through the end of getSubcontractData.
    sub = "function getSubcontractData(state, naics) {"
    if sub in h:
        # find end of getSubcontractData: next "\nfunction " or "\nasync function " after sub
        subi = h.index(sub)
        rest = h[subi+len(sub):]
        # find the closing — next top-level "function " declaration
        import re
        m = re.search(r"\n(async function |function )", rest)
        endrel = m.start() if m else len(rest)
        end_abs = subi + len(sub) + endrel
        removed2 = h[si:end_abs]
        h = h[:si] + "// (getStateMockData + getSubcontractData removed — no fake data)\n" + h[end_abs:]
        print(f"  OK  deleted getStateMockData + getSubcontractData ({len(removed2)} chars)")
    else:
        print("  WARN getSubcontractData not found")
else:
    print("  WARN getStateMockData not found")

# 4. Default the source filter to 'federal' wherever it reads the dropdown
h, _ = repl(h,
"    source:   $('f-source').value,",
"    source:   'federal',",
"force source=federal in filters", required=False)
h, _ = repl(h,
"source: $('f-source') ? $('f-source').value : 'all',",
"source: 'federal',",
"force source=federal in filters alt", required=False)
h, _ = repl(h,
"var source = $('f-source') ? $('f-source').value : 'all';",
"var source = 'federal';",
"force source=federal var", required=False)

with open('index.html','w',encoding='utf-8') as f: f.write(h)

# 5. Neutralize the two mock Netlify functions so nothing can call them for fake data
for fn_name in ['state-contracts','subcontracts']:
    p = os.path.join('netlify','functions', fn_name + '.js')
    if os.path.exists(p):
        stub = '''/**
 * Netlify Function: /api/%s
 * DISABLED — this previously served sample data. ForgeFront is federal-only
 * (live SAM.gov). Returns empty so no fabricated contracts can appear.
 * Re-enable only when wired to a REAL state/subcontract data API.
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'disabled', reason: 'federal_only' }) };
};
''' % fn_name
        with open(p,'w',encoding='utf-8') as f: f.write(stub)
        print(f"  OK  {fn_name}.js neutralized (returns empty)")

print("\n\u2713 Federal-only applied. Run:")
print("  git add -A")
print('  git commit -m "fix: federal-only live data, remove all state/sub sample contracts"')
print("  git push")
