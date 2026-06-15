#!/usr/bin/env python3
"""
ForgeFront — Per-user AI rate limiting (last cost-safety item)
Run from repo root: python patch_rate_limit.py
(Requires the updated netlify/functions/_verify-auth.js — included separately.)
(Requires Supabase table ai_usage — SQL provided separately.)

Adds an hourly per-user cap on AI calls to each of the 5 AI functions, right
after the existing auth check. Caps scale by tier and are generous (abuse guard).
"""
import os, re

FUNCS = ['bid-proposal','sow-lineitems','sow-analyzer','ai-assist','executive-report']

print("\n[functions] adding rate-limit check")
for name in FUNCS:
    p = os.path.join('netlify','functions', name + '.js')
    if not os.path.exists(p):
        print(f"  WARN {name}.js not found")
        continue
    with open(p,'r',encoding='utf-8') as f: fn = f.read()

    if 'checkRateLimit' in fn:
        print(f"  SKIP {name} (already rate-limited)")
        continue

    # 1. Update the require to include checkRateLimit + rateLimited
    fn2 = fn.replace(
        "const { verifyUser, unauthorized } = require('./_verify-auth');",
        "const { verifyUser, checkRateLimit, unauthorized, rateLimited } = require('./_verify-auth');",
        1)
    if fn2 == fn:
        print(f"  WARN {name}: auth require line not found — is it auth-protected?")
        continue
    fn = fn2

    # 2. Insert the rate-limit check right after the auth gate
    gate = ("  const _authedUser = await verifyUser(event.headers);\n"
            "  if (!_authedUser) return unauthorized(CORS);\n")
    if gate in fn:
        rl = ("  const _authedUser = await verifyUser(event.headers);\n"
              "  if (!_authedUser) return unauthorized(CORS);\n"
              "  const _rl = await checkRateLimit(_authedUser.id, '" + name + "');\n"
              "  if (!_rl.ok) return rateLimited(CORS, _rl);\n")
        fn = fn.replace(gate, rl, 1)
        print(f"  OK  {name}.js rate-limit added")
    else:
        print(f"  WARN {name}: auth gate anchor not found — check manually")

    with open(p,'w',encoding='utf-8') as f: f.write(fn)

# Frontend: surface the 429 message nicely where proposals/line items are generated.
print("\n[index.html] friendly 429 handling")
with open('index.html','r',encoding='utf-8') as f: h = f.read()

# bid-proposal handler: it throws on !d.proposal; add explicit 429 check
old = """    const d = await r.json();
    if(!d.proposal) throw new Error(d.error || 'Proposal generation failed');"""
new = """    if(r.status === 429){ const e429 = await r.json(); toast(e429.error || 'Hourly AI limit reached — try again shortly', 'e'); throw new Error('rate_limited'); }
    const d = await r.json();
    if(!d.proposal) throw new Error(d.error || 'Proposal generation failed');"""
if old in h:
    h = h.replace(old, new, 1)
    print("  OK  bid-proposal 429 message")
else:
    print("  WARN bid-proposal 429 anchor not found")

# line items handler
old2 = """    const d = await r.json();
    if(d.error && !(d.items||[]).length) throw new Error(d.error);"""
new2 = """    if(r.status === 429){ const e429 = await r.json(); toast(e429.error || 'Hourly AI limit reached — try again shortly', 'e'); throw new Error('rate_limited'); }
    const d = await r.json();
    if(d.error && !(d.items||[]).length) throw new Error(d.error);"""
if old2 in h:
    h = h.replace(old2, new2, 1)
    print("  OK  sow-lineitems 429 message")
else:
    print("  WARN sow-lineitems 429 anchor not found")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Rate limiting applied. Run:")
print("  git add -A")
print('  git commit -m "feat: per-user hourly AI rate limiting (abuse guard)"')
print("  git push")
print("\nReminders:")
print("  1. Upload the updated netlify/functions/_verify-auth.js")
print("  2. Run the ai_usage table SQL in Supabase first")
