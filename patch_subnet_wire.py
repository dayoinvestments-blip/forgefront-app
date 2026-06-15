#!/usr/bin/env python3
"""
ForgeFront — Wire live SBA SubNet subcontracts back into the app
Run from repo root: python patch_subnet_wire.py
(Run AFTER patch_federal_only.py. Requires netlify/functions/subnet.js.)

Adds a real "SBA SubNet (Subcontracts)" source: live subcontracting
opportunities parsed from sba.gov, with real POC contacts. Labeled LIVE.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# 1. Add the SubNet option back to the source dropdown (real data now)
h, _ = repl(h,
'''              <select id="f-source">
                <option value="federal">🏛 Federal (SAM.gov) — live</option>
              </select>''',
'''              <select id="f-source">
                <option value="all">All Live Sources</option>
                <option value="federal">🏛 Federal (SAM.gov) — live</option>
                <option value="subcontract">🤝 SBA SubNet (Subcontracts) — live</option>
              </select>''',
"SubNet source option added")

# 2. Restore reading the source from the dropdown (was hardcoded to federal)
h, _ = repl(h,
"    source:   'federal',",
"    source:   $('f-source') ? $('f-source').value : 'all',",
"source read from dropdown")

# 3. Add the SubNet fetch block after the federal fetch.
# Anchor on the note we left when removing the old blocks.
h, _ = repl(h,
"  // (State/Local + Subcontract sample sources removed — federal SAM.gov data only)",
'''  // SBA SubNet — live subcontracting opportunities (real data, parsed from sba.gov)
  if(filters.source==='all'||filters.source==='subcontract') {
    try {
      var ps = new URLSearchParams();
      if (filters.state)   ps.set('state',   filters.state);
      if (filters.naics)   ps.set('naics',   filters.naics);
      if (filters.keyword) ps.set('keyword', filters.keyword || '');
      var rs = await fetch('/.netlify/functions/subnet?' + ps.toString());
      if (rs.ok) { var ds = await rs.json(); contracts.push(...(ds.contracts || [])); }
    } catch(e) { /* SubNet unavailable — show nothing rather than fake data */ }
  }''',
"SubNet fetch block added")

# 4. Make the source label show SubNet correctly + a LIVE badge
h, _ = repl(h,
"  const srcLbl  = {federal:'🏛 Federal',state_local:'🏗 State/Local',subcontract:'🤝 Subcontract'}[c.source];",
"  const srcLbl  = {federal:'🏛 Federal',state_local:'🏗 State/Local',subcontract:'🤝 SBA SubNet'}[c.source];",
"source label SubNet", required=False)

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 SubNet wired. Run:")
print("  git add -A")
print('  git commit -m "feat: live SBA SubNet subcontract source (real data)"')
print("  git push")
print("\nReminder: upload netlify/functions/subnet.js")
