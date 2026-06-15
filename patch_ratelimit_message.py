#!/usr/bin/env python3
"""
ForgeFront — Clear "SAM.gov rate limit reached" on-screen message
Run from repo root: python patch_ratelimit_message.py

Root cause: the contracts function returns HTTP 200 with reason:'rate_limited'
in the body, but the frontend only checked res.status===429 (which never fires),
so the user just saw "0 contracts found" with no explanation.

Fix:
  - capture the function's 'reason'/'message' from the response body
  - when rate-limited (or no key) with no contracts, show a clear, prominent
    message in the results area with what to do (wait / get registered key)
"""
import os

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html','r',encoding='utf-8') as f: h = f.read()

# 1. Capture reason/message from the 200-body response in fetchFederalContracts.
#    Store it on a module-level holder so the orchestrator can show it.
h, _ = repl(h,
"""    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.error && !(data.contracts || []).length) throw new Error(data.error);

    var contracts = data.contracts || [];""",
"""    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.error && !(data.contracts || []).length) throw new Error(data.error);

    var contracts = data.contracts || [];
    // Capture an honest status reason from the function body (200 + reason)
    if ((data.reason === 'rate_limited' || data.reason === 'no_user_key' || data.reason === 'sam_api_error') && !contracts.length) {
      A._federalNotice = { reason: data.reason, message: data.message || '' };
    } else {
      A._federalNotice = null;
    }""",
"capture federal notice reason")

# 2. In the orchestrator render, if no contracts AND there's a notice, show it prominently.
h, _ = repl(h,
"""  // Render
  const visible = contracts.slice(0, limit);
  const locked  = showPaywall ? contracts.slice(limit, limit+3) : [];

  $('contracts-list').innerHTML = [""",
"""  // No results + an honest notice (rate limit / no key / API error) -> show clearly
  if (!contracts.length && A._federalNotice) {
    $('contracts-list').innerHTML = renderFederalNotice(A._federalNotice);
    btn.innerHTML = 'Search'; btn.disabled = false; A.contractsLoading = false;
    return;
  }

  // Render
  const visible = contracts.slice(0, limit);
  const locked  = showPaywall ? contracts.slice(limit, limit+3) : [];

  $('contracts-list').innerHTML = [""",
"show notice when empty")

# 3. Add the renderFederalNotice() function (near showNoKeyPrompt for cohesion)
h, _ = repl(h,
"function showNoKeyPrompt() {",
"""function renderFederalNotice(notice) {
  var reason = notice.reason || '';
  var icon, title, body, actions;
  if (reason === 'rate_limited') {
    icon = '\\u23F3';
    title = 'SAM.gov daily search limit reached';
    body = 'Your SAM.gov API key has hit its daily request limit. Public keys allow only ~10 searches/day; a registered-entity key allows 1,000/day. The limit resets within an hour.';
    actions = '<a class="btn p" href="https://sam.gov/profile/details" target="_blank" rel="noopener">Get a registered-entity key &#8599;</a>'
            + '<button class="btn g" onclick="go(\\'bizprofile\\',null)">Update my key</button>';
  } else if (reason === 'no_user_key') {
    icon = '\\u{1F511}';
    title = 'Add your SAM.gov API key to search';
    body = 'ForgeFront pulls live federal contracts using your own free SAM.gov API key. Add yours to begin searching.';
    actions = '<button class="btn p" onclick="go(\\'bizprofile\\',null)">Add my key</button>'
            + '<a class="btn g" href="https://sam.gov/profile/details" target="_blank" rel="noopener">Get a free key &#8599;</a>';
  } else {
    icon = '\\u26A0\\uFE0F';
    title = 'SAM.gov is temporarily unavailable';
    body = (notice.message || 'SAM.gov did not respond. This is usually temporary — please try again in a moment.');
    actions = '<button class="btn p" onclick="fetchContracts()">Retry search</button>';
  }
  return '<div style="text-align:center;padding:44px 20px;max-width:480px;margin:0 auto">'
    + '<div style="font-size:38px;margin-bottom:12px">' + icon + '</div>'
    + '<div style="font-size:18px;font-weight:700;margin-bottom:8px">' + title + '</div>'
    + '<div style="font-size:13px;color:var(--t2);line-height:1.7;margin-bottom:18px">' + body + '</div>'
    + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' + actions + '</div>'
    + '</div>';
}

function showNoKeyPrompt() {""",
"renderFederalNotice function")

# 4. Also surface the rate-limit reason that comes back as HTTP 200 in the 429-style block.
#    (The function returns 200, so the existing res.status===429 check rarely fires; leave it
#     as a fallback but the body-based capture above is the real fix.)

with open('index.html','w',encoding='utf-8') as f: f.write(h)

print("\n\u2713 Rate-limit message applied. Run:")
print("  git add -A")
print('  git commit -m "fix: clear on-screen SAM.gov rate-limit / no-key message"')
print("  git push")
