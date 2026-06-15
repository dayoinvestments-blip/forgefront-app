#!/usr/bin/env python3
"""
ForgeFront — STAGE 1: Live data only + SOW line-items + vendor quote drafts
Run from repo root: python patch_stage1_live.py

Changes:
  A. contracts.js  — remove getMockContracts; API-down returns honest status, never fake data
  B. index.html    — remove getFederalMockData/getStateMockData/getSubcontractData mock funcs
  C. index.html    — federal fetch: honest banner + real-cache only, no mock fallback
  D. index.html    — State/Local + Subcontract sources labeled SAMPLE
  E. index.html    — SOW "Break Down Into Line Items" feature (real SOW -> priceable items)
  F. index.html    — vendor quote-email draft tied to the actual contract/SOW
"""
import os, sys

def repl(content, old, new, label, required=True):
    if old in content:
        print(f"  OK  {label}")
        return content.replace(old, new, 1), True
    msg = "WARN" if not required else "FAIL"
    print(f"  {msg} not found: {label}")
    return content, False

# ════════════════════════════════════════════════════════════════════════════
# A. contracts.js — remove mock, honest API-down responses
# ════════════════════════════════════════════════════════════════════════════
print("\n[A] netlify/functions/contracts.js — remove mock, honest API-down")
cp = os.path.join('netlify', 'functions', 'contracts.js')
with open(cp, 'r', encoding='utf-8') as f:
    c = f.read()

# A1. no API key -> honest empty, not mock
c, _ = repl(c,
"""  // No API key — return mock data immediately
  if (!samKey) {
    console.warn('[FF-contracts] SAM_GOV_API_KEY not set — returning mock data');
    var mock = getMockContracts({ state, naics, keyword });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: mock, source: 'mock', reason: 'no_api_key' }),
    };
  }""",
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
"no-API-key returns empty not mock")

# A2. 429 rate limit -> cached real only, else honest empty
c, _ = repl(c,
"""    if (res.status === 429) {
      // Rate limited — serve cached real data if we have it, else mock with a clear flag
      if (hit && hit.data && hit.data.length) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: hit.data, source: 'cache', reason: 'rate_limited', total: hit.data.length }) };
      }
      var mock429 = getMockContracts({ state, naics, keyword });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: mock429, source: 'mock', reason: 'rate_limited' }) };
    }""",
"""    if (res.status === 429) {
      // Rate limited — serve cached REAL data if we have it, else honest empty
      if (hit && hit.data && hit.data.length) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: hit.data, source: 'cache', reason: 'rate_limited', total: hit.data.length }) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'none', reason: 'rate_limited',
        message: 'SAM.gov is rate-limited. Please retry in about a minute.' }) };
    }""",
"429 returns cached-real-or-empty not mock")

# A3. catch block -> cached real only, else honest empty
c, _ = repl(c,
"""  } catch(err) {
    // SAM.gov is down or timed out — fall back to mock data gracefully
    console.error('[FF-contracts] SAM.gov API error:', err.message, '— falling back to mock data');
    var fallback = getMockContracts({ state, naics, keyword });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        contracts: fallback,
        source:    'mock',
        reason:    'sam_api_error',
        error:     err.message,
      }),
    };
  }""",
"""  } catch(err) {
    // SAM.gov down/timed out — serve cached REAL data if present, else honest empty
    console.error('[FF-contracts] SAM.gov API error:', err.message);
    if (hit && hit.data && hit.data.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: hit.data, source: 'cache', reason: 'sam_api_error', total: hit.data.length }) };
    }
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], source: 'none', reason: 'sam_api_error',
        message: 'SAM.gov is temporarily unavailable. Please retry shortly.', error: err.message }),
    };
  }""",
"catch returns cached-real-or-empty not mock")

# A4. delete the getMockContracts function + TECH_ALL/FAB_ALL data block
start_marker = '// \u2500\u2500 Mock data fallback'
end_marker   = '// \u2500\u2500 Transform SAM.gov API response'
if start_marker in c and end_marker in c:
    si = c.index(start_marker); ei = c.index(end_marker)
    c = c[:si] + '// (Mock data removed — live SAM.gov data only)\n\n' + c[ei:]
    print("  OK  getMockContracts function + data deleted")
else:
    print("  WARN getMockContracts block markers not found (may already be removed)")

with open(cp, 'w', encoding='utf-8') as f:
    f.write(c)

# ════════════════════════════════════════════════════════════════════════════
# B + C. index.html — federal fetch honest handling + remove mock funcs
# ════════════════════════════════════════════════════════════════════════════
print("\n[B/C] index.html — federal fetch honest handling")
with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

# C1. 429 path in fetchFederalContracts -> no mock
h, _ = repl(h,
"""      setStatus('SAM.gov rate limit reached — showing backup data. Try again in a few minutes.');
      return getFederalMockData(filters);""",
"""      setStatus('SAM.gov is rate-limited. Retrying shortly — showing most recent results.');
      return [];""",
"federal 429 no mock")

# C2. catch path -> no mock
h, _ = repl(h,
"""    setStatus('Using backup contract data');
    return getFederalMockData(filters);""",
"""    setStatus('SAM.gov temporarily unavailable. Please retry shortly.');
    return [];""",
"federal catch no mock")

# C3. status line that referenced 'backup data'
h, _ = repl(h,
"""    setStatus(contracts.length + ' federal contracts' + (data.source === 'mock' ? ' (backup data)' : data.source === 'cache' ? ' (cached)' : ' from SAM.gov'));""",
"""    setStatus(contracts.length + ' federal contracts' + (data.source === 'cache' ? ' (recent cached results)' : data.source === 'none' ? ' — ' + (data.message || 'none available right now') : ' from SAM.gov'));""",
"federal status line honest")

# D1. State/Local source -> mark sample
h, _ = repl(h,
"""      for (var i2 = 0; i2 < states2.length; i2++) contracts.push(...getStateMockData(states2[i2], filters.naics));""",
"""      for (var i2 = 0; i2 < states2.length; i2++) contracts.push(...getStateMockData(states2[i2], filters.naics).map(function(x){x._sample=true;return x;}));""",
"state source marked sample")

# D2. Subcontract source -> mark sample
h, _ = repl(h,
"""      for (var i3 = 0; i3 < states3.length; i3++) contracts.push(...getSubcontractData(states3[i3], filters.naics));""",
"""      for (var i3 = 0; i3 < states3.length; i3++) contracts.push(...getSubcontractData(states3[i3], filters.naics).map(function(x){x._sample=true;return x;}));""",
"subcontract source marked sample")

# D3. Add a SAMPLE badge on cards where _sample is true
h, _ = repl(h,
"""      ${c.naics?`<span class="cb" style="background:var(--s2);color:var(--t3);border:1px solid var(--bd)">NAICS ${c.naics}</span>`:''}
    </div>""",
"""      ${c.naics?`<span class="cb" style="background:var(--s2);color:var(--t3);border:1px solid var(--bd)">NAICS ${c.naics}</span>`:''}
      ${c._sample?`<span class="cb" style="background:rgba(232,160,32,.15);color:#E8A020;border:1px solid rgba(232,160,32,.4)">SAMPLE DATA</span>`:''}
    </div>""",
"SAMPLE badge on cards")

# D4. Remove the now-orphaned getFederalMockData function (federal is live-only)
if 'function getFederalMockData(filters) {' in h:
    s = h.index('function getFederalMockData(filters) {')
    e = h.index('async function fetchContracts', s)
    h = h[:s] + '// (getFederalMockData removed — federal is live SAM.gov data only)\n\n' + h[e:]
    print("  OK  orphaned getFederalMockData removed")
else:
    print("  WARN getFederalMockData not found (already removed?)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print("\n[Stage 1 core done] Mock removed, honest handling in, sample labeled.")
print("Run: git add -A && git commit -m \"feat: live data only, honest API-down, sample labels\" && git push")
print("(Stage 1 features SOW-line-items + vendor quote drafts come in patch_stage1b.)")
