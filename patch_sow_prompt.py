#!/usr/bin/env python3
"""
ForgeFront -- Smart SOW prompt on contract detail page
Run from repo root: python patch_sow_prompt.py

Flow on the detail page:
  1. App silently tries to auto-pull the SOW via the user's API key
  2. If that works -> SOW loads, Write Bid hint shows "SOW loaded"
  3. If rate-limited / no key / no text -> show two-option prompt:
       A) Open on SAM.gov (real listing link from the CSV)
       B) Use available description -> pre-fills bid writer and opens it
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

hits = 0

# 1. Replace the SOW failure branch with smart prompt
OLD1 = """    var el = document.getElementById('cdetail-sow');
    if(d.sow && d.sow.length > 20){
      c.description = d.sow; // cache on the contract object
      if(el){ el.style.color='var(--t2)'; el.style.whiteSpace='pre-wrap'; el.style.maxHeight='400px'; el.style.overflowY='auto'; el.textContent = d.sow; }
    } else {
      if(el){ el.style.color='var(--t3)'; el.textContent = 'Full SOW not available via API for this listing. Open on SAM.gov to view the complete solicitation and any attached documents.'; }
    }
  }catch(e){
    var el2 = document.getElementById('cdetail-sow');
    if(el2){ el2.style.color='var(--t3)'; el2.textContent = 'Could not load SOW text. Open on SAM.gov to view the full solicitation.'; }
  }"""
NEW1 = """    var el = document.getElementById('cdetail-sow');
    if(d.sow && d.sow.length > 20){
      c.description = d.sow;
      if(el){ el.style.color='var(--t2)'; el.style.whiteSpace='pre-wrap'; el.style.maxHeight='400px'; el.style.overflowY='auto'; el.textContent = d.sow; }
      var wbHint = document.getElementById('cdetail-wb-hint');
      if(wbHint) wbHint.textContent = 'SOW loaded \u2714 Ready to write bid';
    } else {
      if(el) renderSOWPrompt(el, c, d.reason || 'none');
    }
  }catch(e){
    var el2 = document.getElementById('cdetail-sow');
    if(el2) renderSOWPrompt(el2, c, 'error');
  }"""
if OLD1 in h:
    h = h.replace(OLD1, NEW1, 1)
    print("  OK  fetchContractSOW failure -> smart prompt")
    hits += 1
else:
    print("  FAIL fetchContractSOW block not found")

# 2. Add renderSOWPrompt + helpers before openContractDetail
ANCHOR2 = "function openContractDetail(id) {"
RENDER = r"""function renderSOWPrompt(el, c, reason) {
  var hasInline = c.description && c.description.length > 20;
  var samUrl = c.url || ('https://sam.gov/opp/' + (c.noticeId||'') + '/view');
  var isRateLimit = reason === 'rate_limited' || reason === 'no_user_key';
  var msg = isRateLimit
    ? 'Your SAM.gov API key has reached its daily limit, so the full SOW could not be fetched automatically.'
    : 'The full SOW could not be retrieved automatically for this listing.';
  var html = '<div style="background:var(--s);border:1px solid var(--bd);border-radius:var(--r);padding:16px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--t);margin-bottom:6px">&#9888; SOW not auto-loaded</div>';
  html += '<div style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:14px">' + msg + '</div>';
  html += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:12px;margin-bottom:8px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--t);margin-bottom:3px">Option A &mdash; Get the full SOW from SAM.gov</div>';
  html += '<div style="font-size:11px;color:var(--t3);margin-bottom:8px">Opens the official listing. Copy the SOW text, then paste it into the Bid Writer scope field for the best proposal quality.</div>';
  html += '<a href="' + samUrl + '" target="_blank" rel="noopener" class="btn g sm" onclick="sowOptionAClicked(\'' + (c.id||'') + '\')" style="display:inline-flex">Open on SAM.gov &#8599;</a>';
  html += '</div>';
  html += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--rs);padding:12px">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--t);margin-bottom:3px">Option B &mdash; Use the available description and start now</div>';
  if(hasInline){
    html += '<div style="font-size:11px;color:var(--t3);margin-bottom:8px">The short description from the listing will pre-fill the Bid Writer. You can paste in the full SOW later for a stronger proposal.</div>';
    html += '<div style="font-size:11px;background:var(--ad);border:1px solid var(--ab);border-radius:var(--rs);padding:8px;margin-bottom:8px;color:var(--t2);max-height:100px;overflow-y:auto">' + escapeHtml(c.description) + '</div>';
    html += '<button class="btn p sm" onclick="useInlineDescForBid(\'' + (c.id||'') + '\')">Use This &amp; Write Bid &#8594;</button>';
  } else {
    html += '<div style="font-size:11px;color:var(--t3)">No inline description available for this listing. Use Option A to get the full SOW from SAM.gov.</div>';
  }
  html += '</div></div>';
  el.innerHTML = html;
}

function sowOptionAClicked(contractId) {
  toast('Get the full SOW from SAM.gov, then paste it into the Bid Writer scope field', 'i');
}

function useInlineDescForBid(contractId) {
  var c = (A.contracts||[]).find(function(x){ return x.id===contractId; }) || A._currentContract;
  if(!c||!c.description){ toast('No description available', 'e'); return; }
  preFillBid(c.id);
  toast('Bid Writer pre-filled with the available description. Add the full SOW for a stronger proposal.', 'i');
}

"""
if ANCHOR2 in h:
    h = h.replace(ANCHOR2, RENDER + ANCHOR2, 1)
    print("  OK  renderSOWPrompt + helpers added")
    hits += 1
else:
    print("  FAIL openContractDetail anchor not found")

# 3. Add Write Bid SOW status hint
OLD3 = "  h += '<button class=\"btn p\" onclick=\"preFillBid(\\''+c.id+'\\')\">" + "&#9997; Write Bid &#8594;</button>';"
NEW3 = """  h += '<button class="btn p" onclick="preFillBid(\\''+c.id+'\\')">&#9997; Write Bid &#8594;</button>';
  h += '<div id="cdetail-wb-hint" style="font-size:11px;color:var(--t3);margin-top:6px">'
    + (c.description ? 'SOW loaded &#10004; Ready to write bid' : 'Loading SOW... Write Bid works best with a full SOW.')
    + '</div>';"""
if OLD3 in h:
    h = h.replace(OLD3, NEW3, 1)
    print("  OK  Write Bid SOW status hint added")
    hits += 1
else:
    print("  WARN Write Bid hint anchor not found (non-blocking)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print(f"\n{hits}/3 changes applied.")
if hits >= 2:
    print("\n\u2713 SOW prompt ready. Run:")
    print("  git add -A")
    print('  git commit -m "feat: smart SOW prompt - auto-pull, then Option A (SAM.gov) or Option B (use description)"')
    print("  git push")
