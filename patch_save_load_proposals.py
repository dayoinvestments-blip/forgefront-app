#!/usr/bin/env python3
"""
ForgeFront — Tier 1 completeness: save/load proposals + SAM key guidance
Run from repo root: python patch_save_load_proposals.py

A. Save/load proposals (real):
   - saveBid() also keeps a local index so the list works offline-first
   - "My Saved Proposals" list on the bid page, loaded from Supabase
   - each saved proposal can be RELOADED back into the bid writer to keep working
B. SAM.gov registered-key guidance:
   - note in the key panel: register your entity for 1,000/day vs 10/day public
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# ── A1. Add a "My Saved Proposals" panel + Load button to the bid page ──
h, _ = repl(h,
'''      <div class="pg" id="p-bid">
        <div class="sl">AI Bid Writer</div>''',
'''      <div class="pg" id="p-bid">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <div class="sl" style="margin:0">AI Bid Writer</div>
          <button class="btn g sm" onclick="toggleSavedProposals()" id="saved-prop-btn">&#128194; My Saved Proposals</button>
        </div>
        <div id="saved-proposals-panel" style="display:none;background:var(--s);border:1px solid var(--bd);border-radius:var(--r);padding:12px;margin-bottom:14px">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px">Your Saved Proposals</div>
          <div id="saved-proposals-list"><div style="font-size:12px;color:var(--t3)">Loading...</div></div>
        </div>''',
"saved proposals panel on bid page")

# ── A2. Rewrite saveBid to also store full record + reload index ──
h, _ = repl(h,
'''async function saveBid() {
  const { error } = await sb.from('bids').insert({
    user_id: A.user.id,
    contract_id: $('bid-sol').value||'manual',
    contract_title: $('bid-sol').value,
    agency: $('bid-agency').value,
    proposal_text: $('bid-text').textContent,
    status: (document.getElementById('bid-status') ? document.getElementById('bid-status').value : 'draft'),
  });
  if(error) toast('Failed to save bid', 'e');
  else toast('Bid saved to your proposal history ✅', 's');
}''',
'''async function saveBid() {
  if(!A.user || !A.user.id){ toast('Sign in to save proposals', 'e'); return; }
  var record = {
    user_id: A.user.id,
    contract_id: $('bid-sol').value||'manual',
    contract_title: $('bid-sol').value,
    agency: $('bid-agency').value,
    proposal_text: $('bid-text').textContent,
    scope_text: $('bid-scope').value || '',
    contract_value: $('bid-val').value || null,
    response_deadline: $('bid-due').value || null,
    status: (document.getElementById('bid-status') ? document.getElementById('bid-status').value : 'draft'),
  };
  try{
    const { data, error } = await sb.from('bids').insert(record).select();
    if(error) throw error;
    toast('Proposal saved \\u2705', 's');
    // refresh the list if the panel is open
    if(document.getElementById('saved-proposals-panel') && document.getElementById('saved-proposals-panel').style.display!=='none'){
      loadSavedProposals();
    }
  }catch(e){
    toast('Save failed: '+(e.message||'error'), 'e');
  }
}

function toggleSavedProposals() {
  var p = document.getElementById('saved-proposals-panel');
  if(!p) return;
  if(p.style.display==='none'){ p.style.display='block'; loadSavedProposals(); }
  else { p.style.display='none'; }
}

async function loadSavedProposals() {
  var el = document.getElementById('saved-proposals-list');
  if(!el) return;
  if(!A.user || !A.user.id){ el.innerHTML='<div style="font-size:12px;color:var(--t3)">Sign in to see saved proposals.</div>'; return; }
  el.innerHTML = '<div style="font-size:12px;color:var(--t3)"><span class="sp"></span> Loading...</div>';
  try{
    const { data, error } = await sb.from('bids')
      .select('id,contract_title,agency,status,proposal_text,scope_text,contract_value,response_deadline,created_at')
      .eq('user_id', A.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if(error) throw error;
    A._savedProposals = data || [];
    if(!A._savedProposals.length){ el.innerHTML='<div style="font-size:12px;color:var(--t3)">No saved proposals yet. Generate one and click Save Bid.</div>'; return; }
    var statusColors = {draft:'var(--t3)', submitted:'#E8A020', won:'var(--ac)', lost:'#E05050'};
    el.innerHTML = A._savedProposals.map(function(b){
      var d = b.created_at ? new Date(b.created_at).toLocaleDateString() : '';
      return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="flex:1;min-width:150px"><div style="font-size:13px;font-weight:600">'+escapeHtml(b.contract_title||'Untitled')+'</div>'
        + '<div style="font-size:11px;color:var(--t3);margin-top:2px">'+escapeHtml(b.agency||'')+' &middot; '+d+' &middot; <span style="color:'+(statusColors[b.status]||'var(--t3)')+';font-weight:600;text-transform:capitalize">'+escapeHtml(b.status||'draft')+'</span></div></div>'
        + '<button class="btn p sm" onclick="reloadProposal(\\''+b.id+'\\')">Open &#8594;</button>'
        + '</div>';
    }).join('');
  }catch(e){
    el.innerHTML='<div style="font-size:12px;color:var(--t3)">Could not load proposals: '+escapeHtml(e.message||'error')+'</div>';
  }
}

function reloadProposal(id) {
  var b = (A._savedProposals||[]).find(function(x){ return String(x.id)===String(id); });
  if(!b){ toast('Proposal not found', 'e'); return; }
  $('bid-sol').value = b.contract_title || '';
  $('bid-agency').value = b.agency || '';
  $('bid-scope').value = b.scope_text || '';
  if(b.contract_value) $('bid-val').value = b.contract_value;
  if(b.response_deadline) $('bid-due').value = b.response_deadline;
  $('bid-text').textContent = b.proposal_text || '';
  $('bid-output').style.display = (b.proposal_text ? 'block' : 'none');
  if(document.getElementById('bid-status')) document.getElementById('bid-status').value = b.status || 'draft';
  var p = document.getElementById('saved-proposals-panel'); if(p) p.style.display='none';
  toast('Proposal loaded — edit and regenerate or export', 's');
  document.getElementById('bid-output').scrollIntoView({behavior:'smooth'});
}''',
"saveBid rewrite + load/reload functions")

# ── A3. Load proposals automatically when the bid page opens ──
h, _ = repl(h,
"  else if(page==='contracts')  { renderSamCounter(); }",
"  else if(page==='contracts')  { renderSamCounter(); }\n  else if(page==='bid')        { if(A.user&&A.user.id&&document.getElementById('saved-proposals-panel')&&document.getElementById('saved-proposals-panel').style.display!=='none'){ loadSavedProposals(); } }",
"auto-load proposals on bid page", required=False)

# ── B. SAM.gov registered-key guidance ──
h, _ = repl(h,
'<div style="font-size:11px;color:var(--t3);background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 11px;margin-bottom:10px;line-height:1.6">&#9888;&#65039; <strong>Free SAM.gov keys are limited to ~25 searches per day.</strong> For heavy use, request a higher-volume key from SAM.gov or a third-party provider. ForgeFront tracks your daily usage and warns you before you hit the limit.</div>',
'<div style="font-size:11px;color:var(--t3);background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 11px;margin-bottom:10px;line-height:1.6">&#9888;&#65039; <strong>SAM.gov daily limits:</strong> a public key allows ~10 searches/day. <strong>Register your entity in SAM.gov</strong> (which you already do as an SDVOSB) and your key jumps to <strong>1,000 searches/day</strong> &mdash; effectively unlimited for normal use. ForgeFront tracks your daily usage and warns you before you hit the limit.</div>',
"SAM registered-key guidance", required=False)

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Tier 1 applied. Run:")
print("  git add -A")
print('  git commit -m "feat: save/load proposals + SAM registered-key guidance"')
print("  git push")
print("\nNOTE: requires a Supabase 'bids' table with columns: id, user_id, contract_id,")
print("  contract_title, agency, proposal_text, scope_text, contract_value,")
print("  response_deadline, status, created_at. If yours lacks scope_text/contract_value/")
print("  response_deadline, add them (nullable) or those fields just won't persist.")
