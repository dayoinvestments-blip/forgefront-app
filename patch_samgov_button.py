#!/usr/bin/env python3
"""
ForgeFront — SAM.gov link button on contract cards
Run from repo root: python patch_samgov_button.py

Adds a "SAM.gov" link button directly on each REAL federal contract card,
so users can open the actual listing without going through the detail page.
Sample/state/subcontract cards do NOT get the button (they have no real listing).
"""
import os

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

# 1. Add SAM.gov button on the card, next to View. Only for real federal listings.
OLD = """        <button class="btn go2 sm" onclick="event.stopPropagation();preFillBid('${c.id}')">✍ Write Bid</button>
        <button class="btn g sm" onclick="event.stopPropagation();viewContractDetail('${c.id}')">View →</button>"""
NEW = """        <button class="btn go2 sm" onclick="event.stopPropagation();preFillBid('${c.id}')">✍ Write Bid</button>
        <button class="btn g sm" onclick="event.stopPropagation();viewContractDetail('${c.id}')">View →</button>
        ${(c.source==='federal' && c.noticeId && c.url)?`<a href="${c.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="btn g sm" title="Open the actual listing on SAM.gov">SAM.gov ↗</a>`:''}"""
if OLD in h:
    h = h.replace(OLD, NEW, 1)
    print("  OK  SAM.gov link button added to contract cards")
else:
    print("  FAIL card button anchor not found")

# 2. Harden the detail-page SAM.gov button: always build a valid URL for real federal
OLD2 = """  h += '<button class="btn p" onclick="preFillBid(\\''+c.id+'\\')">&#9997; Write Bid &#8594;</button>';
  if(isReal && c.url){
    h += '<a href="'+c.url+'" target="_blank" rel="noopener" class="btn g">Open on SAM.gov &#8599;</a>';
  }"""
NEW2 = """  h += '<button class="btn p" onclick="preFillBid(\\''+c.id+'\\')">&#9997; Write Bid &#8594;</button>';
  if(isReal){
    var samUrl = c.url || ('https://sam.gov/opp/' + c.noticeId + '/view');
    h += '<a href="'+samUrl+'" target="_blank" rel="noopener" class="btn g">Open on SAM.gov &#8599;</a>';
  }"""
if OLD2 in h:
    h = h.replace(OLD2, NEW2, 1)
    print("  OK  detail-page SAM.gov button hardened (always valid URL)")
else:
    print("  WARN detail-page button block not found (may differ)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print("\nDone. Run:")
print("  git add -A")
print('  git commit -m "feat: direct SAM.gov listing button on contract cards"')
print("  git push")
