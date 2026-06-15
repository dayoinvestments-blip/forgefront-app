#!/usr/bin/env python3
"""
ForgeFront — FIX: SAM.gov SOW fetch uses the correct /v1/noticedesc endpoint
Run from repo root: python patch_fix_sowfetch.py

Confirmed via SAM.gov API docs:
  - each opportunity record has descriptionUrl = .../opportunities/v1/noticedesc?noticeid=...
  - the listing URL is samUrl = https://sam.gov/opp/{noticeId}/view
  - there is NO /opportunities/v2/{id} endpoint (my old fallback was dead)

This patch:
  A. sow-fetch.js — use noticedesc endpoint correctly
  B. contracts.js — capture descriptionUrl + correct uiLink, expose as descriptionLink
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

# ── A. sow-fetch.js ───────────────────────────────────────────────────────────
print("\n[A] sow-fetch.js — correct noticedesc endpoint")
sp = os.path.join('netlify','functions','sow-fetch.js')
with open(sp,'r',encoding='utf-8') as f: s = f.read()

s, _ = repl(s,
"""  // Build the description URL
  var url = '';
  if (link && link.indexOf('http') === 0) {
    url = link + (link.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(samKey);
  } else if (noticeId) {
    url = 'https://api.sam.gov/opportunities/v2/opportunities/' + encodeURIComponent(noticeId) +
          '/description?api_key=' + encodeURIComponent(samKey);
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ sow: '', error: 'link or noticeId required' }) };
  }""",
"""  // Build the description URL — SAM.gov serves SOW text via /v1/noticedesc
  var url = '';
  if (link && link.indexOf('http') === 0) {
    // descriptionUrl from the opportunity record, e.g. .../opportunities/v1/noticedesc?noticeid=...
    url = link + (link.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(samKey);
  } else if (noticeId) {
    url = 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=' + encodeURIComponent(noticeId) +
          '&api_key=' + encodeURIComponent(samKey);
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ sow: '', error: 'link or noticeId required' }) };
  }""",
"sow-fetch noticedesc endpoint")

# The noticedesc response is JSON: {"description":"<html or text>"} — existing parse handles it,
# but make the JSON key extraction more robust for this specific shape.
s, _ = repl(s,
"""    try {
      var j = JSON.parse(raw);
      sow = j.description || j.body || j.text || raw;
    } catch (e) {
      sow = raw;
    }""",
"""    try {
      var j = JSON.parse(raw);
      // /v1/noticedesc returns { "description": "..." }
      sow = j.description || j.descriptionText || j.body || j.text || raw;
    } catch (e) {
      sow = raw;
    }""",
"sow-fetch JSON key extraction", required=False)

with open(sp,'w',encoding='utf-8') as f: f.write(s)

# ── B. contracts.js — capture descriptionUrl + correct listing URL ────────────
print("\n[B] contracts.js — capture descriptionUrl + samUrl")
cp = os.path.join('netlify','functions','contracts.js')
with open(cp,'r',encoding='utf-8') as f: c = f.read()

# Replace the description capture block to use descriptionUrl (the real field)
c, _ = repl(c,
"""    noticeId: opp.noticeId || '',
    description:     (typeof opp.description === 'string' && opp.description.indexOf('http') !== 0) ? opp.description : '',
    descriptionLink:(typeof opp.description === 'string' && opp.description.indexOf('http') === 0) ? opp.description : '',""",
"""    noticeId: opp.noticeId || '',
    // SAM.gov puts inline text in 'description' OR a fetch URL in 'description'/'descriptionUrl'
    description:     (typeof opp.description === 'string' && opp.description.indexOf('http') !== 0) ? opp.description : '',
    descriptionLink: opp.descriptionUrl
                     || ((typeof opp.description === 'string' && opp.description.indexOf('http') === 0) ? opp.description : '')
                     || (opp.noticeId ? ('https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=' + opp.noticeId) : ''),""",
"contracts.js descriptionUrl capture")

# Fix the listing URL to prefer uiLink, then samUrl-style /view
c, _ = repl(c,
"    url:      opp.uiLink || ('https://sam.gov/opp/' + (opp.noticeId || '')),",
"    url:      opp.uiLink || opp.samUrl || ('https://sam.gov/opp/' + (opp.noticeId || '') + '/view'),",
"contracts.js correct listing URL")

with open(cp,'w',encoding='utf-8') as f: f.write(c)

print("\n\u2713 SOW fetch fixed. Run:")
print("  git add -A")
print('  git commit -m "fix: SAM.gov SOW fetch uses correct noticedesc endpoint"')
print("  git push")
