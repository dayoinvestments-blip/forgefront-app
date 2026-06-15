#!/usr/bin/env python3
"""
ForgeFront — Protect AI functions with Supabase auth (cost protection)
Run from repo root: python patch_function_auth.py
(Requires netlify/functions/_verify-auth.js — included separately.)

Adds JWT verification to the 5 functions that spend YOUR Anthropic credits:
  bid-proposal, sow-lineitems, sow-analyzer, ai-assist, executive-report
The SAM contracts/sow-fetch functions are left open (they use the USER's key).

Frontend: attaches the user's Supabase access token to each AI call.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

FUNCS = ['bid-proposal','sow-lineitems','sow-analyzer','ai-assist','executive-report']

# ── Add auth gate to each function ────────────────────────────────────────────
print("\n[functions] adding auth gate")
for name in FUNCS:
    p = os.path.join('netlify','functions', name + '.js')
    if not os.path.exists(p):
        print(f"  WARN {name}.js not found")
        continue
    with open(p,'r',encoding='utf-8') as f: fn = f.read()

    # Skip if already protected
    if '_verify-auth' in fn:
        print(f"  SKIP {name} (already protected)")
        continue

    # 1. Add require at top (after first line / comment block). Insert before 'const CORS'
    if "const { verifyUser, unauthorized } = require('./_verify-auth');" not in fn:
        if 'const CORS' in fn:
            fn = fn.replace('const CORS', "const { verifyUser, unauthorized } = require('./_verify-auth');\n\nconst CORS", 1)
        else:
            fn = "const { verifyUser, unauthorized } = require('./_verify-auth');\n\n" + fn

    # 2. Add the auth check right after the OPTIONS preflight handler.
    # Most functions have: if (event.httpMethod === 'OPTIONS') return {...};
    # Insert the gate immediately after that line's statement.
    inserted = False
    import re
    # Find the OPTIONS return and insert after it
    m = re.search(r"if \(event\.httpMethod === 'OPTIONS'\)[^\n]*\n", fn)
    if m:
        gate = ("\n  // Cost protection: require a signed-in user before spending Anthropic credits\n"
                "  const _authedUser = await verifyUser(event.headers);\n"
                "  if (!_authedUser) return unauthorized(CORS);\n")
        idx = m.end()
        fn = fn[:idx] + gate + fn[idx:]
        inserted = True

    with open(p,'w',encoding='utf-8') as f: f.write(fn)
    print(f"  OK  {name}.js {'gated' if inserted else '(require added, gate anchor not found — check manually)'}")

# ── Fix multi-line OPTIONS case (ai-assist): gate landed inside the if block ──
aip = os.path.join('netlify','functions','ai-assist.js')
if os.path.exists(aip):
    with open(aip,'r',encoding='utf-8') as f: ai = f.read()
    bad = """  if (event.httpMethod === 'OPTIONS') {

  // Cost protection: require a signed-in user before spending Anthropic credits
  const _authedUser = await verifyUser(event.headers);
  if (!_authedUser) return unauthorized(CORS);
    return { statusCode: 200, headers: CORS, body: '' };
  }"""
    good = """  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // Cost protection: require a signed-in user before spending Anthropic credits
  const _authedUser = await verifyUser(event.headers);
  if (!_authedUser) return unauthorized(CORS);"""
    if bad in ai:
        ai = ai.replace(bad, good, 1)
        with open(aip,'w',encoding='utf-8') as f: f.write(ai)
        print("  FIX ai-assist.js gate moved outside OPTIONS block")

# ── Frontend: attach token to each AI call ────────────────────────────────────
print("\n[index.html] attaching auth token to AI calls")
with open('index.html','r',encoding='utf-8') as f: h = f.read()

# Ensure there's a helper that returns the bearer token (admToken already exists).
# Add a tiny aiHeaders() helper near admToken for clarity.
if 'async function aiHeaders(' not in h:
    h, _ = repl(h,
"""async function admToken() {
  var session = await sb.auth.getSession();
  return session && session.data && session.data.session && session.data.session.access_token || '';
}""",
"""async function admToken() {
  var session = await sb.auth.getSession();
  return session && session.data && session.data.session && session.data.session.access_token || '';
}

// Headers for AI function calls — includes the user's auth token (cost protection)
async function aiHeaders() {
  var t = await admToken();
  var hdr = { 'Content-Type': 'application/json' };
  if (t) hdr['Authorization'] = 'Bearer ' + t;
  return hdr;
}""",
"aiHeaders helper added")

# Now swap the headers in each of the 5 AI calls.
# bid-proposal
h, _ = repl(h,
"""    const r = await fetch('/.netlify/functions/bid-proposal', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: scope, company: company, profile: profile, quotes: quotes, contract: contract }),
    });""",
"""    const r = await fetch('/.netlify/functions/bid-proposal', {
      method:'POST', headers: await aiHeaders(),
      body:JSON.stringify({ sow: scope, company: company, profile: profile, quotes: quotes, contract: contract }),
    });""",
"bid-proposal sends token")

# sow-lineitems
h, _ = repl(h,
"""    const r = await fetch('/.netlify/functions/sow-lineitems', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: sow, title: c.title, naics: c.naics }),
    });""",
"""    const r = await fetch('/.netlify/functions/sow-lineitems', {
      method:'POST',
      headers: await aiHeaders(),
      body:JSON.stringify({ sow: sow, title: c.title, naics: c.naics }),
    });""",
"sow-lineitems sends token")

# ai-assist
h, _ = repl(h,
"""    var res = await fetch('/.netlify/functions/ai-assist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt: prompt, field: fieldType})
    });""",
"""    var res = await fetch('/.netlify/functions/ai-assist', {
      method: 'POST',
      headers: await aiHeaders(),
      body: JSON.stringify({prompt: prompt, field: fieldType})
    });""",
"ai-assist sends token")

# sow-analyzer (appears twice — line ~3395 and ~5738). Replace both occurrences.
old_sow = """    var r = await fetch('/.netlify/functions/sow-analyzer', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sow: sowText, company: company, certs: certs, naics: naics }),
    });"""
new_sow = """    var r = await fetch('/.netlify/functions/sow-analyzer', {
      method:  'POST',
      headers: await aiHeaders(),
      body:    JSON.stringify({ sow: sowText, company: company, certs: certs, naics: naics }),
    });"""
cnt = h.count(old_sow)
h = h.replace(old_sow, new_sow)
print(f"  OK  sow-analyzer sends token ({cnt} occurrence(s) updated)")

# The other sow-analyzer call (generateSOWForBid) uses a slightly different body
h, _ = repl(h,
"""    const r = await fetch('/.netlify/functions/sow-analyzer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: scope, company: company, certs: certs, naics: naics }),
    });""",
"""    const r = await fetch('/.netlify/functions/sow-analyzer', {
      method:'POST',
      headers: await aiHeaders(),
      body:JSON.stringify({ sow: scope, company: company, certs: certs, naics: naics }),
    });""",
"sow-analyzer (bid) sends token", required=False)

# executive-report
h, _ = repl(h,
"""    var r = await fetch('/.netlify/functions/executive-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, naics, agency, state, role, sow, company, certs }),
    });""",
"""    var r = await fetch('/.netlify/functions/executive-report', {
      method:  'POST',
      headers: await aiHeaders(),
      body:    JSON.stringify({ title, naics, agency, state, role, sow, company, certs }),
    });""",
"executive-report sends token")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Function auth applied. Run:")
print("  git add -A")
print('  git commit -m "feat: Supabase auth on AI functions (cost protection)"')
print("  git push")
print("\nReminder: also upload netlify/functions/_verify-auth.js (new shared helper).")
print("Confirm SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Netlify env vars.")
