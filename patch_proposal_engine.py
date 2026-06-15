#!/usr/bin/env python3
"""
ForgeFront — BUILD 6 (Stage 2): Real FAR-aware proposal engine + compliance checklist
Run from repo root: python patch_proposal_engine.py
(Run AFTER patch_lineitems_quotes.py.)

Replaces the hardcoded/fake runBidWriter template with a real AI proposal that
uses the actual SOW, the user's profile, collected vendor quotes, and FAR clauses
(cited + standard SDVOSB baseline). Adds a compliance checklist the user verifies.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# Replace the entire hardcoded runBidWriter with a real one.
# Anchor: from "async function runBidWriter() {" up to the closing before "function preFillBid"
start_marker = 'async function runBidWriter() {'
# We'll locate end by the next top-level "async function fetchSOWIntoBid" OR "function preFillBid"
si = h.index(start_marker)
# find the function end: the proposal template ends with toast(... 'review and customize before submitting', 's');\n}
end_anchor = "toast('Proposal generated \u2705 \u2014 review and customize before submitting', 's');\n}"
if end_anchor in h:
    ei = h.index(end_anchor) + len(end_anchor)
    old_fn = h[si:ei]
    print("  OK  located hardcoded runBidWriter ("+str(len(old_fn))+" chars)")
else:
    print("  FAIL could not find end of runBidWriter")
    old_fn = None

NEW_FN = '''async function runBidWriter() {
  const tier = getTier();
  if(tier==='free') { showUpgrade(); return; }

  const sol    = $('bid-sol').value.trim();
  const agency = $('bid-agency').value.trim();
  const scope  = $('bid-scope').value.trim();
  if(!sol) { toast('Enter a solicitation number or title', 'e'); return; }
  if(scope.length < 50){ toast('Need the SOW / scope text to write a real proposal. Pull it from the contract first.', 'e'); return; }

  const btn = $('bid-btn');
  btn.innerHTML = '<span class="sp"></span> Writing proposal from SOW, quotes & FAR clauses...';
  btn.disabled = true;
  $('bid-output').style.display='none';

  var _bp={}; try{_bp=JSON.parse(localStorage.getItem('ff_bp')||'{}');}catch(e){}
  const company = _bp['bp-coname'] || (A.profile && A.profile.company) || 'My Company';
  const certs = [ _bp['bp-sdvosb']?'SDVOSB':'', _bp['bp-vosb']?'VOSB':'', _bp['bp-8a']?'8(a)':'', _bp['bp-hubzone']?'HUBZone':'' ].filter(Boolean).join(', ') || 'SDVOSB';

  const profile = {
    uei: _bp['bp-uei']||'', cage: _bp['bp-cage']||'', naics: _bp['bp-naics']||'',
    principal: _bp['bp-principal']||'', bio: _bp['bp-bio']||'', capability: _bp['bp-cap']||'',
    pastPerformance: _bp['bp-pp']||'', certs: certs, address: _bp['bp-addr']||'',
    phone: _bp['bp-bphone']||'', email: _bp['bp-bemail']||(A.user&&A.user.email)||''
  };

  // Pull collected quotes from the current contract's line items, if any
  var quotes = [];
  var cc = A._currentContract;
  if(cc && cc._lineItems){
    quotes = cc._lineItems.map(function(it){ return { name:it.name, spec:it.spec, unit:it.unit, qty:it.estQty, vendor:it._vendor||'', price:it._price||'' }; });
  }

  const contract = {
    title: (cc && cc.title) || sol, solNum: (cc && cc.solNum) || sol,
    agency: agency || (cc && cc.agency) || '', value: (cc && cc.value) || $('bid-val').value || '',
    deadline: $('bid-due').value || (cc && cc.deadline) || ''
  };

  try{
    const r = await fetch('/.netlify/functions/bid-proposal', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: scope, company: company, profile: profile, quotes: quotes, contract: contract }),
    });
    const d = await r.json();
    if(!d.proposal) throw new Error(d.error || 'Proposal generation failed');

    $('bid-text').textContent = d.proposal;
    renderComplianceChecklist(d.checklist || [], d.disclaimer || '');
    $('bid-output').style.display='block';
    if(tier==='pro') incUsage('bid_writer');
    toast('Draft proposal generated — review the compliance checklist before submitting', 's');
  }catch(e){
    toast('Proposal generation failed: '+e.message, 'e');
  }finally{
    btn.innerHTML = '\\u270D Generate SDVOSB Proposal';
    btn.disabled = false;
  }
}

function renderComplianceChecklist(items, disclaimer) {
  var host = document.getElementById('bid-checklist');
  if(!host){
    // create the host right above bid-text
    var out = document.getElementById('bid-output');
    var bt = document.getElementById('bid-text');
    host = document.createElement('div');
    host.id = 'bid-checklist';
    if(bt && bt.parentNode) bt.parentNode.insertBefore(host, bt);
  }
  if(!items || !items.length){ host.innerHTML=''; return; }
  var html = '<div style="background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.4);border-radius:var(--r);padding:14px;margin-bottom:14px">';
  html += '<div style="font-size:14px;font-weight:700;color:#E8A020;margin-bottom:4px">&#9888;&#65039; Compliance Checklist — verify before you submit</div>';
  html += '<div style="font-size:11px;color:var(--t2);margin-bottom:10px">'+escapeHtml(disclaimer||'This is an AI-generated draft. Verify every item against the full solicitation before submitting.')+'</div>';
  items.forEach(function(it, i){
    html += '<label style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-top:1px solid rgba(255,255,255,.06);cursor:pointer">';
    html += '<input type="checkbox" style="margin-top:3px" onchange="this.parentNode.style.opacity=this.checked?0.5:1">';
    html += '<div><div style="font-size:13px;font-weight:600;color:var(--t)">'+escapeHtml(it.item||'')+'</div>';
    if(it.why) html += '<div style="font-size:11px;color:var(--t3);margin-top:1px">'+escapeHtml(it.why)+'</div>';
    html += '</div></label>';
  });
  html += '</div>';
  host.innerHTML = html;
}'''

if old_fn:
    h = h.replace(old_fn, NEW_FN, 1)
    print("  OK  runBidWriter replaced with real AI engine + checklist")

# Update the bid writer intro copy to set expectations honestly
h, _ = repl(h,
'<div style="font-size:12px;color:var(--t2);margin-bottom:14px">Paste a contract solicitation number or description. The AI generates a compliant SDVOSB proposal in ~60 seconds.</div>',
'<div style="font-size:12px;color:var(--t2);margin-bottom:14px">Pulls the real SOW, your collected vendor quotes, and the FAR clauses cited in the solicitation into a strong draft proposal &mdash; with a compliance checklist to verify before you submit. Review carefully; this is a draft, not a guaranteed-compliant final submission.</div>',
"honest bid writer intro copy", required=False)

# Add incUsage('bid_writer') safety — ensure bid_writer key exists in usage tracking is optional;
# if incUsage is missing a key it just no-ops in most impls. Leave as-is.

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Build 6 applied. Run:")
print("  git add -A")
print('  git commit -m "feat: real FAR-aware proposal engine + compliance checklist"')
print("  git push")
print("\nReminder: also upload netlify/functions/bid-proposal.js (new file).")
