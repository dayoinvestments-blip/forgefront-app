#!/usr/bin/env python3
"""
ForgeFront — BUILDS 4+5: SOW line items + vendor quote emails
Run from repo root: python patch_lineitems_quotes.py
(Run AFTER patch_nokey_byod.py — depends on the contract detail page.)

Build 4: "Break Down Into Line Items" on the contract detail page.
         AI extracts priceable items from the SOW; rendered as a table.
Build 5: each line item has "Draft Quote Email" -> opens mail client with a
         contract-specific RFQ the user sends to a vendor of their choice.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# ── 1. Add "Break Down Into Line Items" button into the detail page SOW section ──
# Anchor on the SOW section header we built in patch_sow_flow
h, _ = repl(h,
"""  // SOW / Description section
  h += '<div class="cl"><div class="sl" style="margin-bottom:8px">Statement of Work / Description</div>';""",
"""  // SOW / Description section
  h += '<div class="cl"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px"><div class="sl" style="margin:0">Statement of Work / Description</div>';
  h += '<button class="btn p sm" onclick="breakdownLineItems(\\''+c.id+'\\')" id="lineitem-btn">&#128203; Break Down Into Line Items</button></div>';
  h += '<div id="lineitem-results" style="margin-bottom:10px"></div>';""",
"line items button in detail page")

# ── 2. Add breakdownLineItems() + rendering + quote email functions ──
# Insert before viewContractDetail
h, _ = repl(h,
"function viewContractDetail(id) {",
"""async function breakdownLineItems(id) {
  const c = (A.contracts || []).find(function(x){return x.id===id;}) || A._currentContract;
  if(!c) return;
  const sow = c.description || (document.getElementById('cdetail-sow') ? document.getElementById('cdetail-sow').textContent : '');
  if(!sow || sow.trim().length < 50){
    toast('No SOW text available yet to break down. Open the SOW first or use Open on SAM.gov.', 'e');
    return;
  }
  const tier = getTier();
  if(tier==='free'){ ppuGate('sow_analyzer','Line Item Breakdown'); return; }

  const btn = document.getElementById('lineitem-btn');
  const out = document.getElementById('lineitem-results');
  if(btn){ btn.disabled=true; btn.textContent='Extracting line items...'; }
  if(out) out.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3)"><span class="sp"></span> Reading the SOW and pulling out priceable items...</div>';

  try{
    const r = await fetch('/.netlify/functions/sow-lineitems', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sow: sow, title: c.title, naics: c.naics }),
    });
    const d = await r.json();
    if(d.error && !(d.items||[]).length) throw new Error(d.error);
    c._lineItems = d.items || [];
    renderLineItems(c);
    toast('Found '+(d.items||[]).length+' priceable line items', 's');
  }catch(e){
    if(out) out.innerHTML = '<div style="padding:16px;color:var(--t3)">Could not extract line items: '+e.message+'</div>';
    toast('Line item extraction failed: '+e.message, 'e');
  }finally{
    if(btn){ btn.disabled=false; btn.innerHTML='\\u{1F4CB} Break Down Into Line Items'; }
  }
}

function renderLineItems(c) {
  const out = document.getElementById('lineitem-results');
  if(!out) return;
  const items = c._lineItems || [];
  if(!items.length){ out.innerHTML = '<div style="padding:12px;color:var(--t3)">No distinct line items found in this SOW.</div>'; return; }

  let html = '<div style="background:var(--ad);border:1px solid var(--ab);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--t2)">&#128161; These are the items to collect vendor quotes on. Click <strong>Draft Quote Email</strong> on any item to send an RFQ to a vendor of your choice.</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="text-align:left;color:var(--t3);border-bottom:1px solid var(--bd)">'
       + '<th style="padding:7px 6px">Item</th><th style="padding:7px 6px">Spec</th><th style="padding:7px 6px">Category</th><th style="padding:7px 6px">Unit</th><th style="padding:7px 6px">Est Qty</th><th style="padding:7px 6px"></th></tr>';
  items.forEach(function(it, i){
    html += '<tr style="border-bottom:1px solid var(--bd2,rgba(255,255,255,.05))">';
    html += '<td style="padding:7px 6px;font-weight:600;color:var(--t)">'+escapeHtml(it.name||'')+'</td>';
    html += '<td style="padding:7px 6px;color:var(--t2)">'+escapeHtml(it.spec||'')+(it.notes?'<div style="color:var(--t3);font-size:11px;margin-top:2px">'+escapeHtml(it.notes)+'</div>':'')+'</td>';
    html += '<td style="padding:7px 6px"><span class="cb" style="background:var(--s2);color:var(--t3);border:1px solid var(--bd)">'+escapeHtml(it.category||'')+'</span></td>';
    html += '<td style="padding:7px 6px;color:var(--t2)">'+escapeHtml(it.unit||'')+'</td>';
    html += '<td style="padding:7px 6px;color:var(--t2)">'+escapeHtml(it.estQty||'TBD')+'</td>';
    html += '<td style="padding:7px 6px"><button class="btn g sm" onclick="draftQuoteEmail(\\''+c.id+'\\','+i+')">&#9993; Draft Quote Email</button></td>';
    html += '</tr>';
  });
  html += '</table></div>';
  out.innerHTML = html;
}

function draftQuoteEmail(contractId, itemIndex) {
  const c = (A.contracts || []).find(function(x){return x.id===contractId;}) || A._currentContract;
  if(!c || !c._lineItems || !c._lineItems[itemIndex]) return;
  const it = c._lineItems[itemIndex];

  var _bp={}; try{_bp=JSON.parse(localStorage.getItem('ff_bp')||'{}');}catch(e){}
  const company = _bp['bp-coname'] || 'W4X Technologies LLC';
  const principal = _bp['bp-principal'] || '';
  const phone = _bp['bp-bphone'] || '';
  const email = _bp['bp-bemail'] || '';

  const subject = 'Request for Quote — ' + (it.name||'Line Item') + ' (' + (c.solNum||c.title||'Federal Opportunity') + ')';
  const lines = [
    'Hello,',
    '',
    company + ' is preparing a bid on a federal opportunity and would like a quote for the following:',
    '',
    'Item: ' + (it.name||''),
    'Specification: ' + (it.spec||'See attached/contract'),
    'Category: ' + (it.category||''),
    'Unit: ' + (it.unit||''),
    'Estimated quantity: ' + (it.estQty||'TBD'),
    (it.notes ? 'Notes: ' + it.notes : ''),
    '',
    'Contract reference: ' + (c.title||'') + (c.solNum?(' — Solicitation ' + c.solNum):''),
    (c.agency ? 'Agency: ' + c.agency : ''),
    (c.deadline ? 'Our proposal is due ' + (new Date(c.deadline)).toLocaleDateString() + ', so a prompt quote is appreciated.' : ''),
    '',
    'Please include unit pricing, lead time, and any minimum order requirements. Let me know if you need additional details.',
    '',
    'Thank you,',
    principal,
    company,
    phone,
    email,
  ].filter(function(x){ return x !== undefined && x !== null; });

  const body = lines.join('\\n');
  // Recipient left blank — user picks the vendor and fills it in their mail client
  const mailto = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  window.location.href = mailto;
  toast('Quote email drafted — add your vendor\\'s address and send', 'i');
}

function viewContractDetail(id) {""",
"breakdownLineItems + renderLineItems + draftQuoteEmail")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Builds 4+5 applied. Run:")
print("  git add -A")
print('  git commit -m "feat: SOW line-item breakdown + vendor quote email drafts"')
print("  git push")
