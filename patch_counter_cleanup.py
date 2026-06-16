#!/usr/bin/env python3
"""
ForgeFront -- Clean up stale SAM.gov API-counter messaging
Run from repo root: python patch_counter_cleanup.py

Now that search reads from the cached database (no API calls), the old
"X SAM.gov searches today (your key) - add a paid key" counter and the
"SAM.gov API connected" banner are misleading. This updates them to
reflect cache-first reality:
  - the counter only shows API usage when the user actually does a LIVE
    refresh (source = federal_live); otherwise it shows the database status
  - the top banner explains the data is from the daily database, keyless
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

hits = 0

# 1. Update the "SAM.gov API connected" banner to reflect cached data
OLD1 = '<div class="ib">\u2139\ufe0f <strong>SAM.gov API connected</strong> \u2014 Showing real federal opportunities nationwide. <span id="sam-status">Loading...</span></div>'
NEW1 = '<div class="ib">\u2139\ufe0f <strong>Live contract database</strong> \u2014 ~78,000 federal opportunities, updated daily. No API key needed to search. <span id="sam-status">Loading...</span></div>'
if OLD1 in h:
    h = h.replace(OLD1, NEW1, 1)
    print("  OK  connected banner updated")
    hits += 1
else:
    print("  WARN connected banner not found (text may differ)")

# 2. Rewrite renderSamCounter so it doesn't imply every search burns the key
OLD2 = """function renderSamCounter() {
  var el = document.getElementById('sam-counter');
  if (!el) return;
  // Counter only meaningful for the free-tier cap; if user has their own key, show their usage
  var used = samCallsToday();
  var cap  = SAM_DAILY_CAP;
  var pct  = Math.min(100, Math.round(used/cap*100));
  var color = used >= cap ? '#E05050' : used >= 20 ? '#E8A020' : 'var(--t3)';
  var label = samUsingOwnKey()
    ? (used + ' SAM.gov searches today (your key)')
    : (used + ' of ' + cap + ' free searches today');
  el.innerHTML = '<span style="color:'+color+';font-weight:600">'+label+'</span>'
    + (used >= 20 ? ' &middot; <a href="#" onclick="go(\\'bizprofile\\',null);return false;" style="color:var(--ac)">add a paid key</a>' : '');
}"""
NEW2 = """function renderSamCounter() {
  var el = document.getElementById('sam-counter');
  if (!el) return;
  // Searches run off the cached database (no API). The key is only used for
  // the optional live-refresh source, so only surface usage if a key exists
  // AND it has actually been used today.
  var used = samCallsToday();
  if (!samUsingOwnKey() || used === 0) {
    el.innerHTML = '<span style="color:var(--t3)">Searching the daily-updated database \u00b7 no API key used</span>';
    return;
  }
  var color = used >= 30 ? '#E8A020' : 'var(--t3)';
  el.innerHTML = '<span style="color:'+color+';font-weight:600">'
    + used + ' live SAM.gov refresh' + (used === 1 ? '' : 'es') + ' today (your key)</span>';
}"""
if OLD2 in h:
    h = h.replace(OLD2, NEW2, 1)
    print("  OK  renderSamCounter rewritten")
    hits += 1
else:
    print("  WARN renderSamCounter not found exactly")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print(f"\n{hits}/2 changes applied.")
print("\n\u2713 Counter cleanup done. Run:")
print("  git add -A")
print('  git commit -m "cleanup: counter reflects cache-first search (no stale API messaging)"')
print("  git push")
