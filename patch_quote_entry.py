#!/usr/bin/env python3
"""
ForgeFront — Complete the quote loop: vendor + price entry per line item
Run from repo root: python patch_quote_entry.py
(Run AFTER patch_lineitems_quotes.py and patch_proposal_engine.py.)

Adds a Vendor field and a Quoted Price field to each line item row. Values save
onto the line item (_vendor / _price) which the proposal engine already reads,
so collected quotes flow into the Pricing Summary instead of showing TBD.
Also shows a running quoted total.
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# Replace renderLineItems with a version that has vendor + price inputs and a total
OLD = """function renderLineItems(c) {
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
}"""

NEW = """function renderLineItems(c) {
  const out = document.getElementById('lineitem-results');
  if(!out) return;
  const items = c._lineItems || [];
  if(!items.length){ out.innerHTML = '<div style="padding:12px;color:var(--t3)">No distinct line items found in this SOW.</div>'; return; }

  let html = '<div style="background:var(--ad);border:1px solid var(--ab);border-radius:var(--rs);padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--t2)">&#128161; Draft a quote email to a vendor for each item. When the vendor replies, enter their <strong>price</strong> below &mdash; it flows straight into your proposal pricing.</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="text-align:left;color:var(--t3);border-bottom:1px solid var(--bd)">'
       + '<th style="padding:7px 6px">Item</th><th style="padding:7px 6px">Spec</th><th style="padding:7px 6px">Unit / Qty</th><th style="padding:7px 6px">Vendor</th><th style="padding:7px 6px">Quoted Price</th><th style="padding:7px 6px"></th></tr>';
  items.forEach(function(it, i){
    html += '<tr style="border-bottom:1px solid var(--bd2,rgba(255,255,255,.05))">';
    html += '<td style="padding:7px 6px;font-weight:600;color:var(--t);min-width:120px">'+escapeHtml(it.name||'')+'<div style="font-size:10px;color:var(--t3);font-weight:400">'+escapeHtml(it.category||'')+'</div></td>';
    html += '<td style="padding:7px 6px;color:var(--t2);min-width:150px">'+escapeHtml(it.spec||'')+(it.notes?'<div style="color:var(--t3);font-size:11px;margin-top:2px">'+escapeHtml(it.notes)+'</div>':'')+'</td>';
    html += '<td style="padding:7px 6px;color:var(--t2);white-space:nowrap">'+escapeHtml(it.estQty||'TBD')+' '+escapeHtml(it.unit||'')+'</td>';
    html += '<td style="padding:7px 6px"><input type="text" value="'+escapeHtml(it._vendor||'')+'" placeholder="Vendor name" style="width:110px;font-size:12px;padding:4px 6px" oninput="setLineItemField(\\''+c.id+'\\','+i+',\\'_vendor\\',this.value)"></td>';
    html += '<td style="padding:7px 6px"><input type="text" value="'+escapeHtml(it._price||'')+'" placeholder="$0.00" style="width:90px;font-size:12px;padding:4px 6px" oninput="setLineItemField(\\''+c.id+'\\','+i+',\\'_price\\',this.value);recalcQuoteTotal(\\''+c.id+'\\')"></td>';
    html += '<td style="padding:7px 6px"><button class="btn g sm" onclick="draftQuoteEmail(\\''+c.id+'\\','+i+')" title="Draft an RFQ email for this item">&#9993; RFQ</button></td>';
    html += '</tr>';
  });
  html += '</table></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">';
  html += '<div style="font-size:12px;color:var(--t3)">Enter prices as vendors reply. <span id="quote-fill-count">0</span> of '+items.length+' priced.</div>';
  html += '<div style="font-size:14px;font-weight:700">Quoted total: <span id="quote-total" style="color:var(--ac)">$0.00</span></div>';
  html += '</div>';
  out.innerHTML = html;
  recalcQuoteTotal(c.id);
}

function setLineItemField(contractId, idx, field, value) {
  const c = (A.contracts || []).find(function(x){return x.id===contractId;}) || A._currentContract;
  if(!c || !c._lineItems || !c._lineItems[idx]) return;
  c._lineItems[idx][field] = value;
}

function recalcQuoteTotal(contractId) {
  const c = (A.contracts || []).find(function(x){return x.id===contractId;}) || A._currentContract;
  if(!c || !c._lineItems) return;
  var total = 0, filled = 0;
  c._lineItems.forEach(function(it){
    if(it._price){
      var n = parseFloat(String(it._price).replace(/[^0-9.\\-]/g,''));
      if(!isNaN(n)){ total += n; filled++; }
    }
  });
  var tEl = document.getElementById('quote-total');
  var cEl = document.getElementById('quote-fill-count');
  if(tEl) tEl.textContent = '$' + total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if(cEl) cEl.textContent = filled;
}"""

h, ok = repl(h, OLD, NEW, "renderLineItems with vendor+price entry")

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Quote entry added. Run:")
print("  git add -A")
print('  git commit -m "feat: vendor + price entry on line items, flows into proposal"')
print("  git push")
