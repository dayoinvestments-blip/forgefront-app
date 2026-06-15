#!/usr/bin/env python3
"""
ForgeFront — Contract Detail + SOW Flow patch
Run from repo root: python patch_sow_flow.py

Builds the seamless View -> Detail -> Write Bid -> Generate SOW flow:
  1. contracts.js — capture SAM.gov description + descriptionLink for SOW
  2. index.html  — new in-app contract detail page (View button target)
  3. index.html  — preFillBid carries SOW/description into bid builder
  4. index.html  — "Generate SOW Analysis" button inline in bid builder
  5. netlify/functions/sow-fetch.js — new function to pull full SOW text from SAM.gov
"""
import os, sys

def must_replace(content, old, new, label):
    if old in content:
        return content.replace(old, new, 1), True
    print(f"  WARN not found: {label}")
    return content, False

# ════════════════════════════════════════════════════════════════════════════
# 1. contracts.js — capture description from SAM.gov
# ════════════════════════════════════════════════════════════════════════════
print("\n[1/5] netlify/functions/contracts.js — capture SAM.gov description")
cjs_path = os.path.join('netlify', 'functions', 'contracts.js')
with open(cjs_path, 'r', encoding='utf-8') as f:
    cjs = f.read()

OLD = """    url:      opp.uiLink || ('https://sam.gov/opp/' + (opp.noticeId || '')),
    score:    score,
  };
}"""
NEW = """    url:      opp.uiLink || ('https://sam.gov/opp/' + (opp.noticeId || '')),
    score:    score,
    noticeId: opp.noticeId || '',
    description:     (typeof opp.description === 'string' && opp.description.indexOf('http') !== 0) ? opp.description : '',
    descriptionLink:(typeof opp.description === 'string' && opp.description.indexOf('http') === 0) ? opp.description : '',
    naicsDesc:      opp.naicsDescription || '',
    office:         opp.officeAddress ? [opp.officeAddress.city, opp.officeAddress.state].filter(Boolean).join(', ') : '',
    pocName:        (opp.pointOfContact && opp.pointOfContact[0] && opp.pointOfContact[0].fullName) || '',
    pocEmail:       (opp.pointOfContact && opp.pointOfContact[0] && opp.pointOfContact[0].email) || '',
  };
}"""
cjs, ok = must_replace(cjs, OLD, NEW, "contracts.js description capture")
if ok: print("  OK  description/descriptionLink/POC captured")
with open(cjs_path, 'w', encoding='utf-8') as f:
    f.write(cjs)

# ════════════════════════════════════════════════════════════════════════════
# 2. sow-fetch.js — new Netlify function to pull full SOW text
# ════════════════════════════════════════════════════════════════════════════
print("\n[2/5] netlify/functions/sow-fetch.js — new SOW text fetcher")
SOW_FETCH = r"""/**
 * Netlify Function: /api/sow-fetch
 * Fetches the full description / SOW text for a SAM.gov opportunity.
 * SAM.gov returns the description as a separate authenticated URL;
 * this function fetches it server-side with the API key.
 *
 * Query: ?link=<descriptionLink>  OR  ?noticeId=<id>
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  var p        = event.queryStringParameters || {};
  var link     = p.link || '';
  var noticeId = p.noticeId || '';
  var samKey   = process.env.SAM_GOV_API_KEY || '';

  if (!samKey) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'no_api_key' }) };
  }

  // Build the description URL
  var url = '';
  if (link && link.indexOf('http') === 0) {
    url = link + (link.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(samKey);
  } else if (noticeId) {
    url = 'https://api.sam.gov/opportunities/v2/opportunities/' + encodeURIComponent(noticeId) +
          '/description?api_key=' + encodeURIComponent(samKey);
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ sow: '', error: 'link or noticeId required' }) };
  }

  try {
    var controller = new AbortController();
    var timeout    = setTimeout(function(){ controller.abort(); }, 12000);
    var res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timeout);

    if (!res.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'sam_' + res.status }) };
    }

    var raw = await res.text();
    var sow = '';
    // Response may be JSON {description:"..."} or raw HTML/text
    try {
      var j = JSON.parse(raw);
      sow = j.description || j.body || j.text || raw;
    } catch (e) {
      sow = raw;
    }
    sow = stripHtml(sow);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: sow, source: 'sam_gov' }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'error', error: err.message }) };
  }
};
"""
sf_path = os.path.join('netlify', 'functions', 'sow-fetch.js')
with open(sf_path, 'w', encoding='utf-8') as f:
    f.write(SOW_FETCH)
print("  OK  sow-fetch.js written")

# ════════════════════════════════════════════════════════════════════════════
# 3-5. index.html
# ════════════════════════════════════════════════════════════════════════════
print("\n[3/5] index.html — contract detail page + View button rewire")
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# --- 3a. Rewire the View button: was <a href=url>, now opens in-app detail ---
OLD_VIEW = """        <button class="btn go2 sm" onclick="event.stopPropagation();preFillBid('${c.id}')">✍ Write Bid</button>
        <a href="${c.url}" target="_blank" onclick="event.stopPropagation()" class="btn g sm">View ↗</a>"""
NEW_VIEW = """        <button class="btn go2 sm" onclick="event.stopPropagation();preFillBid('${c.id}')">✍ Write Bid</button>
        <button class="btn g sm" onclick="event.stopPropagation();viewContractDetail('${c.id}')">View →</button>"""
html, ok = must_replace(html, OLD_VIEW, NEW_VIEW, "View button rewire")
if ok: print("  OK  View button now opens in-app detail")

# --- 3b. Change card click to open detail (not jump to bid) ---
OLD_CARD_CLICK = """  return `<div class="cc${locked?' locked':''}" onclick="${locked?'showUpgrade()':'openContractDetail(\\''+c.id+'\\')'}\">"""
NEW_CARD_CLICK = """  return `<div class="cc${locked?' locked':''}" onclick="${locked?'showUpgrade()':'viewContractDetail(\\''+c.id+'\\')'}\">"""
html, ok = must_replace(html, OLD_CARD_CLICK, NEW_CARD_CLICK, "card click rewire")
if ok: print("  OK  card click opens detail page")

# --- 3c. Add the contract detail page div after the contracts page ---
# Insert a new page <div class="pg" id="p-cdetail"> right before the bid page
DETAIL_PAGE = """      <!-- CONTRACT DETAIL PAGE -->
      <div class="pg" id="p-cdetail">
        <button class="btn g sm" onclick="go('contracts',document.querySelector('[onclick*=contracts]'))" style="margin-bottom:12px">&#8592; Back to Contracts</button>
        <div id="cdetail-body"></div>
      </div>

      <div class="pg" id="p-bid">"""
html, ok = must_replace(html, '      <div class="pg" id="p-bid">', DETAIL_PAGE, "detail page div")
if ok: print("  OK  contract detail page div added")

# --- 3d. Register p-cdetail in the go() page list ---
# Find go() and add cdetail to the pages array if present
print("\n[4/5] index.html — viewContractDetail + SOW carry-through functions")

# --- 4a. Add viewContractDetail() and helpers right before openContractDetail ---
DETAIL_FUNCS = """function viewContractDetail(id) {
  const c = A.contracts.find(x=>x.id===id);
  if(!c) return;
  A._currentContract = c;
  const dl = c.deadline ? Math.ceil((new Date(c.deadline)-Date.now())/86400000) : null;
  const isReal = c.source === 'federal' && c.noticeId;

  let h = '';
  h += '<div class="cl" style="margin-bottom:14px">';
  h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">';
  h += '<span class="cb sdv">&#128737; '+(c.setAside||'SDVOSB')+'</span>';
  if(c.naics) h += '<span class="cb" style="background:var(--s2);color:var(--t3);border:1px solid var(--bd)">NAICS '+c.naics+'</span>';
  h += '<span class="cb" style="background:var(--s2);color:var(--t3);border:1px solid var(--bd)">'+(c.source==='federal'?'Federal':c.source==='state_local'?'State/Local':'Subcontract')+'</span>';
  h += '</div>';
  h += '<div style="font-size:19px;font-weight:700;color:var(--t);line-height:1.4;margin-bottom:6px">'+c.title+'</div>';
  h += '<div style="font-size:13px;color:var(--t2);margin-bottom:14px">'+c.agency+(c.city?' &middot; '+c.city+', '+c.state:c.state?' &middot; '+c.state:'')+'</div>';

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:14px">';
  h += '<div><div style="font-size:9px;letter-spacing:.8px;color:var(--t3);font-weight:700">VALUE</div><div style="font-size:17px;font-weight:700">'+(c.value?fmt(c.value):'See solicitation')+'</div></div>';
  h += '<div><div style="font-size:9px;letter-spacing:.8px;color:var(--t3);font-weight:700">DEADLINE</div><div style="font-size:15px;font-weight:600">'+(dl!==null?dl+' days left':'See listing')+'</div></div>';
  h += '<div><div style="font-size:9px;letter-spacing:.8px;color:var(--t3);font-weight:700">SOLICITATION</div><div style="font-size:13px;font-weight:600">'+(c.solNum||'&#8212;')+'</div></div>';
  h += '<div><div style="font-size:9px;letter-spacing:.8px;color:var(--t3);font-weight:700">MATCH</div><div style="font-size:15px;font-weight:700;color:var(--ac)">'+c.score+'%</div></div>';
  h += '</div>';

  if(c.pocName||c.pocEmail){
    h += '<div style="font-size:12px;color:var(--t2);margin-bottom:14px">&#128231; <strong>POC:</strong> '+(c.pocName||'')+(c.pocEmail?' &middot; '+c.pocEmail:'')+'</div>';
  }

  h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += '<button class="btn p" onclick="preFillBid(\\''+c.id+'\\')">&#9997; Write Bid &#8594;</button>';
  if(isReal && c.url){
    h += '<a href="'+c.url+'" target="_blank" rel="noopener" class="btn g">Open on SAM.gov &#8599;</a>';
  }
  h += '</div>';
  h += '</div>';

  // SOW / Description section
  h += '<div class="cl"><div class="sl" style="margin-bottom:8px">Statement of Work / Description</div>';
  if(c.description){
    h += '<div id="cdetail-sow" style="font-size:13px;line-height:1.7;color:var(--t2);white-space:pre-wrap;max-height:400px;overflow-y:auto">'+escapeHtml(c.description)+'</div>';
  } else if(isReal && (c.descriptionLink || c.noticeId)){
    h += '<div id="cdetail-sow" style="font-size:13px;color:var(--t3);padding:20px;text-align:center"><span class="sp"></span> Loading full SOW from SAM.gov...</div>';
  } else {
    h += '<div id="cdetail-sow" style="font-size:13px;color:var(--t3);padding:16px">Full SOW text is available on the SAM.gov listing. For mock/sample contracts, no SOW is attached. Click "Write Bid" to draft a proposal using the contract details above.</div>';
  }
  h += '</div>';

  document.getElementById('cdetail-body').innerHTML = h;
  go('cdetail', null);

  // Lazy-load real SOW text
  if(!c.description && isReal && (c.descriptionLink || c.noticeId)){
    fetchContractSOW(c);
  }
}

function escapeHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchContractSOW(c){
  try{
    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    var el = document.getElementById('cdetail-sow');
    if(d.sow && d.sow.length > 20){
      c.description = d.sow; // cache on the contract object
      if(el){ el.style.color='var(--t2)'; el.style.whiteSpace='pre-wrap'; el.style.maxHeight='400px'; el.style.overflowY='auto'; el.textContent = d.sow; }
    } else {
      if(el){ el.style.color='var(--t3)'; el.textContent = 'Full SOW not available via API for this listing. Open on SAM.gov to view the complete solicitation and any attached documents.'; }
    }
  }catch(e){
    var el2 = document.getElementById('cdetail-sow');
    if(el2){ el2.style.color='var(--t3)'; el2.textContent = 'Could not load SOW text. Open on SAM.gov to view the full solicitation.'; }
  }
}

function openContractDetail(id) {"""
html, ok = must_replace(html, "function openContractDetail(id) {", DETAIL_FUNCS, "viewContractDetail functions")
if ok: print("  OK  viewContractDetail + fetchContractSOW added")

# --- 4b. preFillBid carries description/SOW + opens bid + offers generate ---
OLD_PREFILL = """function preFillBid(contractId) {
  const c = A.contracts.find(x=>x.id===contractId);
  if(!c) return;
  $('bid-sol').value = c.solNum||c.title;
  $('bid-agency').value = c.agency;
  $('bid-val').value = c.value||'';
  if(c.deadline) $('bid-due').value = c.deadline.split('T')[0];
}"""
NEW_PREFILL = """function preFillBid(contractId) {
  const c = A.contracts.find(x=>x.id===contractId);
  if(!c) return;
  A._currentContract = c;
  $('bid-sol').value = c.solNum||c.title;
  $('bid-agency').value = c.agency;
  $('bid-val').value = c.value||'';
  if(c.deadline) $('bid-due').value = c.deadline.split('T')[0];
  // Carry SOW/description into the scope field
  if(c.description){
    $('bid-scope').value = c.description;
  } else {
    $('bid-scope').value = '';
    // Try to fetch real SOW in the background
    const isReal = c.source === 'federal' && c.noticeId;
    if(isReal && (c.descriptionLink || c.noticeId)){
      $('bid-scope').placeholder = 'Loading SOW from SAM.gov...';
      fetchSOWIntoBid(c);
    }
  }
  go('bid', document.querySelector('[onclick*=bid]'));
  renderAgencyIntel(c.agency, 'cd-agency-intel');
  toast('Bid Writer ready: '+c.title.slice(0,40)+'...', 'i');
}

async function fetchSOWIntoBid(c){
  try{
    var q = c.descriptionLink ? ('link='+encodeURIComponent(c.descriptionLink)) : ('noticeId='+encodeURIComponent(c.noticeId));
    var r = await fetch('/.netlify/functions/sow-fetch?'+q);
    var d = await r.json();
    if(d.sow && d.sow.length > 20){
      c.description = d.sow;
      var el = document.getElementById('bid-scope');
      if(el && !el.value){ el.value = d.sow; }
    }
    var ph = document.getElementById('bid-scope');
    if(ph) ph.placeholder = 'Paste the scope of work or requirements here...';
  }catch(e){
    var ph2 = document.getElementById('bid-scope');
    if(ph2) ph2.placeholder = 'Paste the scope of work or requirements here...';
  }
}"""
html, ok = must_replace(html, OLD_PREFILL, NEW_PREFILL, "preFillBid SOW carry-through")
if ok: print("  OK  preFillBid carries SOW into bid builder")

# --- 5. Add "Generate SOW Analysis" button to the bid builder ---
print("\n[5/5] index.html — inline SOW analysis button in bid builder")
OLD_BIDBTN = """          <button class="btn p" style="width:100%;justify-content:center" id="bid-btn" onclick="runBidWriter()">✍ Generate SDVOSB Proposal</button>
        </div>"""
NEW_BIDBTN = """          <button class="btn g sm" style="width:100%;justify-content:center;margin-bottom:8px" id="bid-sow-btn" onclick="generateSOWForBid()">&#128196; Generate SOW Analysis from Scope</button>
          <div id="bid-sow-out" style="display:none;background:var(--ad);border:1px solid var(--ab);border-radius:var(--rs);padding:12px;margin-bottom:10px;font-size:12px;line-height:1.7;color:var(--t2);white-space:pre-wrap;max-height:300px;overflow-y:auto"></div>
          <button class="btn p" style="width:100%;justify-content:center" id="bid-btn" onclick="runBidWriter()">✍ Generate SDVOSB Proposal</button>
        </div>"""
html, ok = must_replace(html, OLD_BIDBTN, NEW_BIDBTN, "bid SOW button")
if ok: print("  OK  Generate SOW button added to bid builder")

# --- 5b. Add generateSOWForBid() function (reuses sow-analyzer) ---
GEN_SOW_FUNC = """async function generateSOWForBid() {
  const scope = $('bid-scope').value.trim();
  if(scope.length < 50){ toast('Need at least 50 characters of scope text to analyze', 'e'); return; }
  const tier = getTier();
  if(tier==='free'||tier==='starter'){ ppuGate('sow_analyzer','SOW Analyzer'); return; }

  var _bp={}; try{_bp=JSON.parse(localStorage.getItem('ff_bp')||'{}');}catch(e){}
  const company = _bp['bp-coname'] || 'W4X Technologies LLC';
  const certs   = 'SDVOSB';
  const naics   = _bp['bp-naics'] || '541511';

  const btn = $('bid-sow-btn');
  const out = $('bid-sow-out');
  btn.disabled = true; btn.textContent = 'Analyzing SOW... (~30s)';
  out.style.display='block';
  out.textContent = 'Reading the scope, extracting requirements, evaluating fit...';

  try{
    const r = await fetch('/.netlify/functions/sow-analyzer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: scope, company: company, certs: certs, naics: naics }),
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error||'Analysis failed');
    const a = data.analysis || {};
    let txt = '';
    if(a.goNoGo){ txt += 'RECOMMENDATION: '+(a.goNoGo.recommendation||'CONSIDER')+'\\n'+(a.goNoGo.reasoning||'')+'\\n\\n'; }
    if(a.summary){ txt += 'SUMMARY:\\n'+a.summary+'\\n\\n'; }
    if(a.keyRequirements && a.keyRequirements.length){ txt += 'KEY REQUIREMENTS:\\n'+a.keyRequirements.map(function(x,i){return (i+1)+'. '+(typeof x==='string'?x:(x.requirement||JSON.stringify(x)));}).join('\\n')+'\\n\\n'; }
    if(a.redFlags && a.redFlags.length){ txt += 'RED FLAGS:\\n'+a.redFlags.map(function(x){return '- '+x;}).join('\\n'); }
    if(!txt) txt = JSON.stringify(a, null, 2);
    out.textContent = txt;
    if(tier==='pro') incUsage('sow_analyzer');
    toast('SOW analysis complete — review before generating your proposal', 's');
  }catch(e){
    out.textContent = 'Analysis error: '+e.message+'. You can still generate the proposal directly.';
    toast('SOW analysis failed: '+e.message, 'e');
  }finally{
    btn.disabled=false; btn.textContent='\\u{1F4C4} Generate SOW Analysis from Scope';
  }
}

function viewContractDetail2_placeholder(){}"""
# Insert before viewContractDetail (already added earlier in file)
html, ok = must_replace(html, "function viewContractDetail(id) {", GEN_SOW_FUNC + "\n\nfunction viewContractDetail(id) {", "generateSOWForBid")
if ok: print("  OK  generateSOWForBid added")

# --- 5c. Add Contract Detail title to go() page-title map ---
OLD_TMAP = "const T={dash:'Dashboard',contracts:'Contracts',jobs:'Job Tracker',"
NEW_TMAP = "const T={dash:'Dashboard',contracts:'Contracts',cdetail:'Contract Detail',jobs:'Job Tracker',"
html, ok = must_replace(html, OLD_TMAP, NEW_TMAP, "go() title map")
if ok: print("  OK  Contract Detail title registered in go()")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n\u2713 All patches applied. Now run:")
print("  git add -A")
print('  git commit -m "feat: contract detail page + seamless SOW-to-bid flow"')
print("  git push")
print("\nNOTE: Full SOW auto-pull only works for REAL SAM.gov contracts (federal source")
print("with a noticeId). Mock/sample contracts have no SOW and will show a notice instead.")
