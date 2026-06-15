#!/usr/bin/env python3
"""
ForgeFront -- Cache-first contract search (THE critical wiring)
Run from repo root: python patch_cache_search.py

Makes the contracts search read from the opportunities_cache Supabase table
FIRST (instant, no API key, no rate limit). The live per-user SAM.gov API
becomes an optional "refresh live" fallback.

This is what makes the bulk-upload architecture actually power user search.

After this:
  - Users do NOT need a SAM.gov key to search (cache is keyless)
  - Search is instant (Supabase query, not live API round-trip)
  - Live API still available as a fallback via source='federal_live'
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

hits = 0

# 1. Add fetchCachedContracts() — reads from opportunities_cache via Supabase
ANCHOR1 = "async function fetchFederalContracts(filters) {"
CACHE_FN = r"""async function fetchCachedContracts(filters) {
  // Reads opportunities from the Supabase cache (synced from SAM.gov bulk CSV).
  // No API key, no rate limit. Returns [] on any error.
  try {
    var q = sb.from('opportunities_cache').select('*').eq('active', true);

    if (filters.naics)    q = q.like('naics_code', filters.naics + '%');
    if (filters.state)    q = q.eq('state', filters.state);
    if (filters.setaside) {
      // map our dropdown values to SAM set-aside codes
      var saMap = { 'SDVOSBC':'SDVOSBC','SDVOSB':'SDVOSBC','SBA':'SBA','8A':'8A','HZC':'HZC','WOSB':'WOSB','VSA':'VSA' };
      var code = saMap[filters.setaside] || filters.setaside;
      q = q.eq('set_aside_code', code);
    }
    if (filters.keyword)  q = q.ilike('title', '%' + filters.keyword + '%');

    // date window
    if (filters.days) {
      var since = new Date(Date.now() - (parseInt(filters.days)||90)*86400000);
      q = q.gte('posted_date', since.toISOString().slice(0,10));
    }

    q = q.order('posted_date', { ascending: false }).limit(500);

    var res = await q;
    if (res.error) { console.error('cache query error', res.error); return []; }
    var rows = res.data || [];

    return rows.map(function(r) {
      // compute a simple match score
      var score = 60;
      if (r.set_aside_code && /SDVOSB|VSA|VSS/.test(r.set_aside_code)) score += 25;
      else if (r.set_aside_code && r.set_aside_code !== 'NONE') score += 12;
      if (filters.naics && r.naics_code === filters.naics) score += 10;

      // days until deadline
      var days = null;
      if (r.response_deadline) {
        var dl = new Date(r.response_deadline);
        if (!isNaN(dl)) days = Math.ceil((dl - Date.now())/86400000);
      }

      return {
        id:              'cache_' + r.notice_id,
        noticeId:        r.notice_id,
        source:          'federal',
        title:           r.title || 'Untitled',
        agency:          r.agency || '',
        naics:           r.naics_code || '',
        setAside:        r.set_aside_desc || r.set_aside_code || '',
        state:           r.state || '',
        city:            r.city || '',
        deadline:        r.response_deadline || '',
        days:            days,
        solNum:          r.solicitation_number || '',
        value:           null,
        description:     (r.raw && r.raw.description_text) ? r.raw.description_text : (r.inline_description || ''),
        descriptionLink: r.description_url || '',
        url:             r.ui_link || ('https://sam.gov/opp/' + r.notice_id + '/view'),
        pocName:         r.poc_name || '',
        pocEmail:        r.poc_email || '',
        pocPhone:        r.poc_phone || '',
        score:           Math.min(score, 99),
        _cached:         true,
        _live:           true,
      };
    });
  } catch (e) {
    console.error('fetchCachedContracts failed', e);
    return [];
  }
}

async function fetchFederalContracts(filters) {"""
if ANCHOR1 in h:
    h = h.replace(ANCHOR1, CACHE_FN, 1)
    print("  OK  fetchCachedContracts() added")
    hits += 1
else:
    print("  FAIL fetchFederalContracts anchor not found")

# 2. Rewire fetchContracts to use cache first, live API as fallback
OLD2 = """  // Federal — real SAM.gov API
  if(filters.source==='all'||filters.source==='federal') {
    const fed = await fetchFederalContracts(filters);
    contracts.push(...fed);
    $('sam-status').textContent = `${fed.length} federal contracts loaded from SAM.gov`;
  }"""
NEW2 = """  // Federal — cache-first (instant, no API key), live API as fallback/refresh
  if(filters.source==='all'||filters.source==='federal') {
    const cached = await fetchCachedContracts(filters);
    if(cached.length){
      contracts.push(...cached);
      $('sam-status').textContent = `${cached.length} contracts from database (updated daily \u00b7 no API used)`;
    } else if(getSamKey()) {
      // cache empty — fall back to live API if the user has a key
      const fed = await fetchFederalContracts(filters);
      contracts.push(...fed);
      $('sam-status').textContent = `${fed.length} federal contracts (live SAM.gov)`;
    } else {
      $('sam-status').textContent = 'No contracts in database yet. Admin: import the SAM.gov CSV in the Data Import tab.';
    }
  }

  // Federal LIVE — explicit live API refresh (power users who want freshest data)
  if(filters.source==='federal_live' && getSamKey()) {
    const fed = await fetchFederalContracts(filters);
    contracts.push(...fed);
    $('sam-status').textContent = `${fed.length} federal contracts (live SAM.gov)`;
  }"""
if OLD2 in h:
    h = h.replace(OLD2, NEW2, 1)
    print("  OK  fetchContracts rewired cache-first")
    hits += 1
else:
    print("  FAIL fetchContracts federal block not found")

# 3. Remove the hard API-key gate — cache works without a key
OLD3 = """  if(A.contractsLoading) return;
  if(!getSamKey()) { showNoKeyPrompt(); return; }
  if(!samPreflightOK()) { return; }"""
NEW3 = """  if(A.contractsLoading) return;
  // No key required — search reads the cached database. Key only needed for live refresh.
  var _src = $('f-source') ? $('f-source').value : 'all';
  if(_src==='federal_live' && !getSamKey()) { showNoKeyPrompt(); return; }"""
if OLD3 in h:
    h = h.replace(OLD3, NEW3, 1)
    print("  OK  API-key gate removed (cache is keyless)")
    hits += 1
else:
    print("  WARN key gate not found (may differ) — check manually")

# 4. Add a "Live refresh" option to the source dropdown
OLD4 = '''                <option value="subcontract">🤝 SBA SubNet (Subcontracts) — live</option>
              </select>'''
NEW4 = '''                <option value="subcontract">🤝 SBA SubNet (Subcontracts) — live</option>
                <option value="federal_live">⚡ Federal (live SAM.gov refresh — uses your API key)</option>
              </select>'''
if OLD4 in h:
    h = h.replace(OLD4, NEW4, 1)
    print("  OK  live-refresh dropdown option added")
    hits += 1
else:
    print("  WARN source dropdown not found (may already be modified)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print(f"\n{hits}/5 changes applied.")
print("\n\u2713 Cache-first search wired. Run:")
print("  git add -A")
print('  git commit -m "feat: cache-first contract search (keyless, instant, live API fallback)"')
print("  git push")
