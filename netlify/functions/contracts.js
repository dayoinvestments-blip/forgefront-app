/**
 * Netlify Function: /api/contracts
 *
 * Proxies SAM.gov API calls server-side so the API key
 * is never exposed to the browser. Results are cached in
 * Supabase for 6 hours to minimize API quota usage.
 *
 * Called from the browser as:
 *   fetch('/.netlify/functions/contracts?naics=332312&state=LA&setaside=SDVOSBC')
 */

const SUPABASE_URL      = 'https://ycadicxcwcgdiefdqbrn.supabase.co';
const SUPABASE_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljYWRpY3hjd2NnZGllZmRxYnJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ5ODI0NCwiZXhwIjoyMDk1MDc0MjQ0fQ.6M_jrAF9WH-HRbHaxvWgDa-dCiY043VbDI12fCB5OaU';
const SAM_API_KEY       = process.env.SAM_GOV_API_KEY;
const SAM_BASE          = 'https://api.sam.gov/opportunities/v2/search';
const CACHE_TTL_HOURS   = 6;

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

// ── Supabase REST helper (no SDK needed in functions) ─────────────────────────
async function supabaseQuery(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateFrom(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}

// ── Score a contract for match relevance ──────────────────────────────────────
function scoreContract(o) {
  let s = 50;
  const sa = (o.typeOfSetAsideDescription || '').toLowerCase();
  if (sa.includes('service-disabled') || sa.includes('sdvosb')) s += 35;
  else if (sa.includes('veteran') || sa.includes('vosb'))       s += 25;
  else if (sa.includes('8(a)') || sa.includes('8a'))            s += 15;
  else if (sa.includes('small business'))                        s += 10;
  const naics = o.naicsCode || '';
  if (['332312','238190','332313','332999','236220','237310'].includes(naics)) s += 10;
  return Math.min(s, 99);
}

// ── Build cache key ───────────────────────────────────────────────────────────
function cacheKey(params) {
  return `fed_${params.naics||'any'}_${params.state||'all'}_${params.setaside||'any'}_${params.days||90}`;
}

// ── Check Supabase cache ──────────────────────────────────────────────────────
async function getCached(key) {
  try {
    const rows = await supabaseQuery(
      `/contracts_cache?id=like.${key}%25&expires_at=gt.${new Date().toISOString()}&select=*&order=cached_at.desc&limit=200`
    );
    return rows?.length ? rows : null;
  } catch { return null; }
}

// ── Store in Supabase cache ───────────────────────────────────────────────────
async function storeCache(contracts, baseKey) {
  if (!contracts?.length) return;
  const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600000).toISOString();
  const rows = contracts.map((c, i) => ({
    id:                  `${baseKey}_${i}_${c.noticeId || i}`,
    source:              'federal',
    title:               c.title || '',
    agency:              c.fullParentPathName || c.organizationName || '',
    naics_code:          c.naicsCode || '',
    set_aside:           c.typeOfSetAsideDescription || '',
    value:               parseFloat(c.award?.amount || 0) || null,
    response_deadline:   c.responseDeadLine || null,
    posted_date:         c.postedDate ? new Date(c.postedDate).toISOString() : null,
    status:              'open',
    location_state:      c.placeOfPerformance?.state?.code || '',
    location_city:       c.placeOfPerformance?.city?.name || '',
    solicitation_number: c.solicitationNumber || '',
    contact_email:       c.pointOfContact?.[0]?.email || '',
    external_url:        `https://sam.gov/opp/${c.noticeId}/view`,
    description:         c.description || '',
    raw_data:            c,
    cached_at:           new Date().toISOString(),
    expires_at:          expires,
  }));

  // Upsert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    await supabaseQuery('/contracts_cache', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const p      = event.queryStringParameters || {};
  const naics  = p.naics    || '332312';
  const state  = p.state    || '';
  const sa     = p.setaside || 'SDVOSBC';
  const days   = parseInt(p.days || '90');
  const kw     = p.keyword  || '';
  const limit  = parseInt(p.limit || '100');
  const key    = cacheKey({ naics, state, setaside: sa, days });

  try {
    // 1. Check cache first
    const cached = await getCached(key);
    if (cached) {
      const contracts = cached.map(r => ({
        id:       r.id,
        source:   'federal',
        title:    r.title,
        agency:   r.agency,
        value:    r.value,
        naics:    r.naics_code,
        setAside: r.set_aside,
        status:   r.status,
        state:    r.location_state,
        city:     r.location_city,
        deadline: r.response_deadline,
        solNum:   r.solicitation_number,
        posted:   r.posted_date,
        contact:  r.contact_email,
        url:      r.external_url,
        score:    r.raw_data ? scoreContract(r.raw_data) : 75,
        fromCache: true,
      }));
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ contracts, total: contracts.length, source: 'cache' }),
      };
    }

    // 2. Cache miss — call SAM.gov
    if (!SAM_API_KEY) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ contracts: [], total: 0, error: 'SAM_GOV_API_KEY not configured' }),
      };
    }

    const params = new URLSearchParams({
      api_key:    SAM_API_KEY,
      limit:      Math.min(limit, 1000),
      active:     'Yes',
      postedFrom: dateFrom(days),
      naicsCode:  naics,
    });
    if (sa)    params.set('typeOfSetAside', sa);
    if (state) params.set('state', state);
    if (kw)    params.set('keyword', kw);

    const samRes = await fetch(`${SAM_BASE}?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!samRes.ok) {
      const errText = await samRes.text();
      console.error(`SAM.gov error ${samRes.status}:`, errText.slice(0, 200));
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ contracts: [], total: 0, error: `SAM.gov ${samRes.status}` }),
      };
    }

    const data = await samRes.json();
    const opps = data.opportunitiesData || [];

    // 3. Store in cache (async — don't block response)
    storeCache(opps, key).catch(e => console.warn('Cache store failed:', e.message));

    // 4. Format and return
    const contracts = opps.map(o => ({
      id:       o.noticeId || o.solicitationNumber || Math.random().toString(36).slice(2),
      source:   'federal',
      title:    o.title || 'Untitled',
      agency:   o.fullParentPathName || o.organizationName || 'Federal Agency',
      value:    parseFloat(o.award?.amount || 0) || 0,
      naics:    o.naicsCode || naics,
      setAside: o.typeOfSetAsideDescription || '',
      status:   'open',
      state:    o.placeOfPerformance?.state?.code || state,
      city:     o.placeOfPerformance?.city?.name || '',
      deadline: o.responseDeadLine || o.archiveDate || '',
      solNum:   o.solicitationNumber || '',
      posted:   o.postedDate || '',
      contact:  o.pointOfContact?.[0]?.email || '',
      url:      `https://sam.gov/opp/${o.noticeId}/view`,
      score:    scoreContract(o),
      fromCache: false,
    }));

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        contracts,
        total: contracts.length,
        totalRecords: data.totalRecords,
        source: 'live',
      }),
    };

  } catch (err) {
    console.error('[contracts function]', err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], total: 0, error: err.message }),
    };
  }
};
