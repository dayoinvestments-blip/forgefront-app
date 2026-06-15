#!/usr/bin/env python3
"""
ForgeFront — BUILDS 1+2: Per-user SAM.gov key + daily call counter + limit warning
Run from repo root: python patch_userkey_counter.py

Build 1 — Per-user key:
  - frontend passes the user's saved key to the contracts + sow-fetch functions
  - contracts.js / sow-fetch.js prefer the user-supplied key, fall back to env var
  - "how to get a free key" helper text + link in the profile

Build 2 — Counter + warning:
  - tracks SAM.gov calls per day in localStorage (resets daily)
  - live "X of 25 used today" indicator on the contracts page
  - warning toast at 20 calls; hard-stop message at 25 with upgrade guidance
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

# ════════════════════════════════════════════════════════════════════════════
# contracts.js — accept user key param, prefer it over env var
# ════════════════════════════════════════════════════════════════════════════
print("\n[1] netlify/functions/contracts.js — accept per-user key")
cp = os.path.join('netlify','functions','contracts.js')
with open(cp,'r',encoding='utf-8') as f: c = f.read()

c, _ = repl(c,
"  var samKey  = process.env.SAM_GOV_API_KEY || '';",
"""  // Prefer the user's own SAM.gov key (passed per-request); fall back to env var
  var samKey  = (params.userkey && params.userkey.trim()) || process.env.SAM_GOV_API_KEY || '';""",
"contracts.js prefers user key")

with open(cp,'w',encoding='utf-8') as f: f.write(c)

# ════════════════════════════════════════════════════════════════════════════
# sow-fetch.js — accept user key param too
# ════════════════════════════════════════════════════════════════════════════
print("\n[2] netlify/functions/sow-fetch.js — accept per-user key")
sp = os.path.join('netlify','functions','sow-fetch.js')
if os.path.exists(sp):
    with open(sp,'r',encoding='utf-8') as f: s = f.read()
    s, _ = repl(s,
    "  var samKey   = process.env.SAM_GOV_API_KEY || '';",
    "  var samKey   = (p.userkey && p.userkey.trim()) || process.env.SAM_GOV_API_KEY || '';",
    "sow-fetch.js prefers user key")
    with open(sp,'w',encoding='utf-8') as f: f.write(s)
else:
    print("  WARN sow-fetch.js not found (run patch_sow_flow.py first)")

# ════════════════════════════════════════════════════════════════════════════
# index.html — pass key + counter + warnings
# ════════════════════════════════════════════════════════════════════════════
print("\n[3] index.html — pass key, add counter + warnings")
with open('index.html','r',encoding='utf-8') as f: h = f.read()

# 3a. Add the daily-counter helper functions right after getSamKey()
h, _ = repl(h,
"""function getSamKey() {
  return localStorage.getItem('ff_sam_key') || SAM_KEY_DEFAULT;
}""",
"""function getSamKey() {
  return localStorage.getItem('ff_sam_key') || SAM_KEY_DEFAULT;
}

// ── SAM.gov daily call counter (free key cap is ~25/day) ─────────────────────
var SAM_DAILY_CAP = 25;
function samCounterKey() {
  var d = new Date();
  return 'ff_sam_calls_' + d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function samCallsToday() {
  return parseInt(localStorage.getItem(samCounterKey()) || '0', 10) || 0;
}
function samIncrement() {
  var n = samCallsToday() + 1;
  try { localStorage.setItem(samCounterKey(), String(n)); } catch(e) {}
  renderSamCounter();
  return n;
}
function samUsingOwnKey() {
  return !!localStorage.getItem('ff_sam_key');
}
function renderSamCounter() {
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
}
function samPreflightOK() {
  var used = samCallsToday();
  if (used >= SAM_DAILY_CAP) {
    toast('Daily SAM.gov free limit reached ('+SAM_DAILY_CAP+'). Add your own paid key in Business Profile for unlimited searches.', 'e');
    return false;
  }
  if (used === 20) {
    toast('Heads up: '+used+' of '+SAM_DAILY_CAP+' free SAM.gov searches used today. Consider adding a paid key.', 'i');
  }
  return true;
}""",
"counter helpers added")

# 3b. Pass the user's key + increment counter in fetchFederalContracts
h, _ = repl(h,
"""    if (filters.keyword)  params.set('keyword',  filters.keyword || '');
    var controller = new AbortController();
    var tid = setTimeout(function() { controller.abort(); }, 12000);
    var res = await fetch('/.netlify/functions/contracts?' + params.toString(), {signal: controller.signal});""",
"""    if (filters.keyword)  params.set('keyword',  filters.keyword || '');
    var _uk = getSamKey(); if (_uk) params.set('userkey', _uk);
    var controller = new AbortController();
    var tid = setTimeout(function() { controller.abort(); }, 12000);
    samIncrement();
    var res = await fetch('/.netlify/functions/contracts?' + params.toString(), {signal: controller.signal});""",
"federal fetch passes key + counts")

# 3c. Preflight check in fetchContracts (the orchestrator) before searching
h, ok = repl(h,
"""async function fetchContracts() {
  if(A.contractsLoading) return;
  A.contractsLoading = true;""",
"""async function fetchContracts() {
  if(A.contractsLoading) return;
  if(!samPreflightOK()) { return; }
  A.contractsLoading = true;""",
"preflight gate before search", required=False)

# 3d. Add the counter display element on the contracts search bar (near Search button)
h, ok = repl(h,
"""            <button class="btn p sm" onclick="fetchContracts()" id="search-btn">Search</button>""",
"""            <button class="btn p sm" onclick="fetchContracts()" id="search-btn">Search</button>
            <div id="sam-counter" style="font-size:11px;margin-top:6px;text-align:right"></div>""",
"counter display element", required=False)

# 3e. Pass key into the SOW fetch calls (detail page + bid)
h, _ = repl(h,
"""    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    var el = document.getElementById('cdetail-sow');""",
"""    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var _uk = getSamKey(); if(_uk) q += '&userkey='+encodeURIComponent(_uk);
    samIncrement();
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    var el = document.getElementById('cdetail-sow');""",
"detail SOW fetch passes key + counts")

h, _ = repl(h,
"""    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    if(d.sow && d.sow.length > 20){
      c.description = d.sow;
      var el = document.getElementById('bid-scope');""",
"""    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var _uk = getSamKey(); if(_uk) q += '&userkey='+encodeURIComponent(_uk);
    samIncrement();
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    if(d.sow && d.sow.length > 20){
      c.description = d.sow;
      var el = document.getElementById('bid-scope');""",
"bid SOW fetch passes key + counts")

# 3f. Render the counter when the contracts page opens
h, ok = repl(h,
"""  else if(page==='sow')        { document.getElementById('sow-results').innerHTML = ''; sowInit(); }""",
"""  else if(page==='contracts')  { renderSamCounter(); }
  else if(page==='sow')        { document.getElementById('sow-results').innerHTML = ''; sowInit(); }""",
"render counter on contracts page", required=False)

# 3g. Improve saveSamKey with validation + "how to get a key" guidance
h, _ = repl(h,
"""function saveSamKey() {
  const k=($('pr-samkey').value||'').trim();
  if(!k){toast('Enter your SAM.gov API key','e');return;}
  localStorage.setItem('ff_sam_key',k);
  $('samkey-status').textContent='✅ SAM.gov API key saved — searches will use your key';
  $('samkey-status').style.color='var(--ac)';
  toast('SAM.gov key saved — reload contracts to apply','s');
}""",
"""function saveSamKey() {
  const k=($('pr-samkey').value||'').trim();
  if(!k){toast('Enter your SAM.gov API key','e');return;}
  if(k.length < 20){toast('That does not look like a valid SAM.gov key — check and re-enter','e');return;}
  localStorage.setItem('ff_sam_key',k);
  $('samkey-status').innerHTML='&#9989; Your SAM.gov key is saved. All searches now use your key and your own daily limit.';
  $('samkey-status').style.color='var(--ac)';
  renderSamCounter();
  toast('SAM.gov key saved — your searches now use your key','s');
}

function removeSamKey() {
  localStorage.removeItem('ff_sam_key');
  if($('pr-samkey')) $('pr-samkey').value='';
  if($('samkey-status')){ $('samkey-status').textContent='Key removed. Searches use the shared free key (limited).'; $('samkey-status').style.color='var(--t3)'; }
  renderSamCounter();
  toast('SAM.gov key removed','i');
}""",
"saveSamKey hardened + removeSamKey")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n[4] index.html — SAM key section guidance + remove button")
with open('index.html','r',encoding='utf-8') as f: h = f.read()

OLD_KEYSEC = """          <div style="font-size:12px;color:var(--t2);margin-bottom:12px">Your key is stored in your browser. Get yours free at <a href="https://sam.gov/profile/details" target="_blank" style="color:var(--ac)">sam.gov/profile/details</a>.</div>
          <div style="display:flex;gap:8px">
            <input id="pr-samkey" type="password" placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="flex:1"/>
            <button class="btn p" onclick="saveSamKey()">Save Key</button>
          </div>"""
NEW_KEYSEC = """          <div style="font-size:12px;color:var(--t2);margin-bottom:8px">Your key is stored in your browser and used for all contract searches. Get yours free at <a href="https://sam.gov/profile/details" target="_blank" style="color:var(--ac)">sam.gov/profile/details</a>.</div>
          <div style="font-size:11px;color:var(--t3);background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 11px;margin-bottom:10px;line-height:1.6">&#9888;&#65039; <strong>Free SAM.gov keys are limited to ~25 searches per day.</strong> For heavy use, request a higher-volume key from SAM.gov or a third-party provider. ForgeFront tracks your daily usage and warns you before you hit the limit.</div>
          <div style="display:flex;gap:8px">
            <input id="pr-samkey" type="password" placeholder="SAM-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="flex:1"/>
            <button class="btn p" onclick="saveSamKey()">Save Key</button>
            <button class="btn g" onclick="removeSamKey()">Remove</button>
          </div>"""
h, _ = repl(h, OLD_KEYSEC, NEW_KEYSEC, "SAM key section guidance + remove button", required=False)

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Builds 1+2 applied. Run:")
print("  git add -A")
print('  git commit -m "feat: per-user SAM.gov key + daily call counter + limit warnings"')
print("  git push")
