#!/usr/bin/env python3
"""
ForgeFront — No shared key + onboarding prompt + bring-your-own-data
Run from repo root: python patch_nokey_byod.py

Part A — Remove shared key:
  - contracts.js / sow-fetch.js: require user key, no env-var fallback
  - frontend: if no key saved, show "add your key to search" prompt, don't call API

Part B — Bring-your-own-data:
  - paste solicitation numbers (comma/newline separated) -> fetch those contracts
  - upload CSV of saved searches -> parse and load
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

# ════════════════════════════════════════════════════════════════════════════
# A1. contracts.js — require user key, no env fallback
# ════════════════════════════════════════════════════════════════════════════
print("\n[A1] contracts.js — require user key (no shared fallback)")
cp = os.path.join('netlify','functions','contracts.js')
with open(cp,'r',encoding='utf-8') as f: c = f.read()

c, _ = repl(c,
"""  // Prefer the user's own SAM.gov key (passed per-request); fall back to env var
  var samKey  = (params.userkey && params.userkey.trim()) || process.env.SAM_GOV_API_KEY || '';""",
"""  // Require the user's own SAM.gov key — no shared fallback
  var samKey  = (params.userkey && params.userkey.trim()) || '';""",
"contracts.js requires user key")

c, _ = repl(c,
"""  // No API key — honest empty response, never fabricated data
  if (!samKey) {
    console.warn('[FF-contracts] SAM_GOV_API_KEY not set');
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], source: 'none', reason: 'no_api_key',
        message: 'SAM.gov API key not configured.' }),
    };
  }""",
"""  // No user key — instruct the user to add one
  if (!samKey) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], source: 'none', reason: 'no_user_key',
        message: 'Add your SAM.gov API key in Business Profile to search live contracts.' }),
    };
  }""",
"contracts.js no-user-key message")

with open(cp,'w',encoding='utf-8') as f: f.write(c)

# ════════════════════════════════════════════════════════════════════════════
# A2. sow-fetch.js — require user key
# ════════════════════════════════════════════════════════════════════════════
print("\n[A2] sow-fetch.js — require user key")
sp = os.path.join('netlify','functions','sow-fetch.js')
with open(sp,'r',encoding='utf-8') as f: s = f.read()
s, _ = repl(s,
"  var samKey   = (p.userkey && p.userkey.trim()) || process.env.SAM_GOV_API_KEY || '';",
"  var samKey   = (p.userkey && p.userkey.trim()) || '';",
"sow-fetch.js requires user key")
with open(sp,'w',encoding='utf-8') as f: f.write(s)

# ════════════════════════════════════════════════════════════════════════════
# B. index.html
# ════════════════════════════════════════════════════════════════════════════
print("\n[B] index.html — onboarding prompt + BYOD")
with open('index.html','r',encoding='utf-8') as f: h = f.read()

# B1. SAM_KEY_DEFAULT comment update (it's already '' so behavior is fine; just clarify)
h, _ = repl(h,
"const SAM_KEY_DEFAULT = ''; // key is server-side in Netlify env vars",
"const SAM_KEY_DEFAULT = ''; // no shared key — each user supplies their own",
"SAM_KEY_DEFAULT comment", required=False)

# B2. Gate fetchContracts: if no key, show onboarding prompt instead of searching
h, _ = repl(h,
"""async function fetchContracts() {
  if(A.contractsLoading) return;
  if(!samPreflightOK()) { return; }
  A.contractsLoading = true;""",
"""async function fetchContracts() {
  if(A.contractsLoading) return;
  if(!getSamKey()) { showNoKeyPrompt(); return; }
  if(!samPreflightOK()) { return; }
  A.contractsLoading = true;""",
"fetchContracts gated on key")

# B3. Add showNoKeyPrompt() function (renders into contracts-list)
h, _ = repl(h,
"function getSamKey() {\n  return localStorage.getItem('ff_sam_key') || SAM_KEY_DEFAULT;\n}",
"""function getSamKey() {
  return localStorage.getItem('ff_sam_key') || SAM_KEY_DEFAULT;
}

function showNoKeyPrompt() {
  var el = document.getElementById('contracts-list');
  if(!el) return;
  el.innerHTML = '<div style="text-align:center;padding:48px 20px;max-width:480px;margin:0 auto">'
    + '<div style="font-size:40px;margin-bottom:14px">&#128273;</div>'
    + '<div style="font-size:18px;font-weight:700;margin-bottom:8px">Add your SAM.gov API key to start searching</div>'
    + '<div style="font-size:13px;color:var(--t2);line-height:1.7;margin-bottom:18px">ForgeFront pulls live federal contracts directly from SAM.gov using your own free API key. This keeps your searches private and gives you your own daily limit. It takes about two minutes to get a key.</div>'
    + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'
    + '<button class="btn p" onclick="go(\\'bizprofile\\',null)">Add my SAM.gov key &#8594;</button>'
    + '<a class="btn g" href="https://sam.gov/profile/details" target="_blank" rel="noopener">Get a free key &#8599;</a>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--t3);margin-top:16px">Already have a key? Paste it in Business Profile &#8594; SAM.gov API Key.</div>'
    + '</div>';
  var status = document.getElementById('sam-status');
  if(status) status.textContent = 'No SAM.gov key set — add yours to search live contracts.';
}""",
"showNoKeyPrompt function")

# B4. Add BYOD UI block into the contracts page (paste + upload), after the search row
# Anchor: the sam-counter div we added earlier
h, _ = repl(h,
"""            <button class="btn p sm" onclick="fetchContracts()" id="search-btn">Search</button>
            <div id="sam-counter" style="font-size:11px;margin-top:6px;text-align:right"></div>""",
"""            <button class="btn p sm" onclick="fetchContracts()" id="search-btn">Search</button>
            <button class="btn g sm" onclick="toggleByod()" id="byod-btn" title="Load your own list of solicitation numbers">&#128229; Load My List</button>
            <div id="sam-counter" style="font-size:11px;margin-top:6px;text-align:right"></div>""",
"Load My List button")

# B5. Add the BYOD panel right before the contracts-list div
h, _ = repl(h,
"""        <div id="contracts-list"><div class="sk" style="height:300px;border-radius:var(--rl)"></div></div>""",
"""        <div id="byod-panel" style="display:none;background:var(--s);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-bottom:14px">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">&#128229; Load Your Own Searches</div>
          <div style="font-size:12px;color:var(--t2);margin-bottom:12px">Have solicitation numbers from your own pipeline? Paste them or upload a CSV. ForgeFront pulls each one from SAM.gov and runs its analysis.</div>
          <div class="fd" style="margin-bottom:10px">
            <label class="fla">Paste solicitation numbers (comma or line separated)</label>
            <textarea id="byod-text" rows="4" placeholder="W912DR-25-R-0041&#10;36C24825R0112&#10;FA7014-25-R-0033"></textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
            <button class="btn p sm" onclick="byodRunPaste()">Search These &#8594;</button>
            <label class="btn g sm" style="cursor:pointer;margin:0">
              &#128206; Upload CSV
              <input type="file" id="byod-file" accept=".csv,.txt" style="display:none" onchange="byodHandleFile(event)"/>
            </label>
            <span id="byod-status" style="font-size:11px;color:var(--t3)"></span>
          </div>
          <div style="font-size:10px;color:var(--t3)">CSV: any column containing solicitation numbers works. Each lookup uses one SAM.gov call against your daily limit.</div>
        </div>
        <div id="contracts-list"><div class="sk" style="height:300px;border-radius:var(--rl)"></div></div>""",
"BYOD panel HTML")

# B6. Add BYOD JS functions (toggle, paste search, file parse)
h, _ = repl(h,
"function setStateFilter(state) {\n  $('f-state').value = state;\n  fetchContracts();\n}",
"""function setStateFilter(state) {
  $('f-state').value = state;
  fetchContracts();
}

// ── Bring-your-own-data: paste / upload solicitation numbers ─────────────────
function toggleByod() {
  var p = document.getElementById('byod-panel');
  if(!p) return;
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function byodParseList(raw) {
  // Split on commas, newlines, tabs, semicolons; keep tokens that look like sol numbers
  return (raw || '')
    .split(/[\\n,;\\t]+/)
    .map(function(x){ return x.trim().replace(/^["']|["']$/g,''); })
    .filter(function(x){ return x.length >= 4 && /[A-Za-z0-9]/.test(x); });
}

async function byodRunPaste() {
  if(!getSamKey()) { showNoKeyPrompt(); return; }
  var raw = (document.getElementById('byod-text')||{value:''}).value;
  var list = byodParseList(raw);
  if(!list.length){ toast('Paste at least one solicitation number', 'e'); return; }
  if(list.length > SAM_DAILY_CAP - samCallsToday()){
    toast('That list ('+list.length+') exceeds your remaining SAM.gov calls today. Trim it or add a paid key.', 'e');
    return;
  }
  byodSearch(list);
}

function byodHandleFile(ev) {
  var file = ev.target.files && ev.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    var text = e.target.result || '';
    var list = byodParseList(text);
    var st = document.getElementById('byod-status');
    if(list.length){
      document.getElementById('byod-text').value = list.join('\\n');
      if(st) st.textContent = list.length + ' solicitation numbers loaded from file';
    } else {
      if(st) st.textContent = 'No solicitation numbers found in that file';
    }
  };
  reader.readAsText(file);
}

async function byodSearch(list) {
  var status = document.getElementById('byod-status');
  var listEl = document.getElementById('contracts-list');
  listEl.innerHTML = '<div class="sk" style="height:300px;border-radius:var(--rl)"></div>';
  var found = [];
  var key = getSamKey();
  for(var i=0;i<list.length;i++){
    if(status) status.textContent = 'Looking up '+(i+1)+' of '+list.length+'...';
    try{
      var params = new URLSearchParams();
      params.set('keyword', list[i]);
      params.set('userkey', key);
      samIncrement();
      var r = await fetch('/.netlify/functions/contracts?'+params.toString());
      var d = await r.json();
      if(d.contracts && d.contracts.length){
        // Prefer exact solicitation-number match if present
        var exact = d.contracts.filter(function(x){ return (x.solNum||'').toUpperCase() === list[i].toUpperCase(); });
        found = found.concat(exact.length ? exact : d.contracts.slice(0,1));
      }
    }catch(e){ /* skip this one */ }
  }
  if(status) status.textContent = found.length + ' of ' + list.length + ' found on SAM.gov';
  if(!found.length){
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--t3)">None of those solicitation numbers returned active SAM.gov results. They may be closed, awarded, or archived.</div>';
    return;
  }
  A.contracts = found;
  found.sort(function(a,b){ return b.score-a.score; });
  listEl.innerHTML = found.map(function(c){ return contractCard(c, false); }).join('');
}""",
"BYOD JS functions")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Applied. Run:")
print("  git add -A")
print('  git commit -m "feat: per-user key required + onboarding + bring-your-own-data"')
print("  git push")
print("\n\u26a0\ufe0f  IMPORTANT: After deploy, REMOVE the SAM_GOV_API_KEY variable from")
print("    Netlify (Site settings > Environment variables) so no shared key remains.")
