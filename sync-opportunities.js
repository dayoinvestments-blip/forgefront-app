/**
 * Netlify Function: /.netlify/functions/sync-opportunities
 * Pulls SAM.gov opportunities and upserts them into Supabase opportunities_cache.
 * Designed to run on a schedule (daily) using ONE key (yours), so users never
 * hit the live API. Syncs broadly across the key set-aside types.
 *
 * Env vars required:
 *   SAM_SYNC_KEY              - your SAM.gov API key (the sync key)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Trigger: scheduled (netlify.toml) OR manual GET with ?key=<SYNC_SECRET>
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Set-aside codes most relevant to ForgeFront's audience (broad sync).
// Empty string '' = no set-aside filter (pulls ALL opportunities) — used last if time allows.
const SET_ASIDES = ['SDVOSBC','SDVOSBS','VSA','VSS','SBA','SBP','8A','8AN','HZC','HZS','WOSB','WOSBSS','EDWOSB','EDWOSBSS'];

function mmddyyyy(d) {
  return [String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0'), d.getFullYear()].join('/');
}

function mapRecord(o) {
  var poc = (o.pointOfContact && o.pointOfContact[0]) || {};
  var pop = o.placeOfPerformance || {};
  var st  = (pop.state && (pop.state.code || pop.state.name)) || '';
  var city= (pop.city && (pop.city.name)) || '';
  return {
    notice_id:           o.noticeId,
    title:               o.title || '',
    solicitation_number: o.solicitationNumber || '',
    agency:              o.fullParentPathName || o.department || '',
    naics_code:          o.naicsCode || '',
    set_aside_code:      o.typeOfSetAside || '',
    set_aside_desc:      o.typeOfSetAsideDescription || '',
    ptype:               o.type || o.baseType || '',
    posted_date:         o.postedDate || null,
    response_deadline:   o.responseDeadLine || o.responseDeadline || null,
    state:               st,
    city:                city,
    description_url:      (typeof o.description === 'string' && o.description.indexOf('http')===0) ? o.description : '',
    ui_link:             o.uiLink && o.uiLink !== 'null' ? o.uiLink : (o.noticeId ? ('https://sam.gov/opp/'+o.noticeId+'/view') : ''),
    poc_name:            poc.fullName || '',
    poc_email:           poc.email || '',
    poc_phone:           poc.phone || '',
    active:              (o.active === 'Yes' || o.active === true),
    raw:                 o,
    synced_at:           new Date().toISOString(),
  };
}

async function upsertBatch(SB, KEY, rows) {
  if (!rows.length) return;
  await fetch(SB + '/rest/v1/opportunities_cache?on_conflict=notice_id', {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  var SB  = process.env.SUPABASE_URL || '';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  var SAMKEY = process.env.SAM_SYNC_KEY || '';

  // If invoked manually (not scheduled), require a secret to prevent abuse
  var params = event.queryStringParameters || {};
  var isScheduled = !!event.headers['x-nf-event'] || event.headers['user-agent'] === 'Netlify Scheduled Functions';
  if (!isScheduled && params.key !== (process.env.SYNC_SECRET || 'forgefront-sync')) {
    // allow manual run only with the secret
    if (params.key !== process.env.SYNC_SECRET) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'unauthorized' }) };
    }
  }

  if (!SB || !KEY || !SAMKEY) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'missing env vars', haveSB: !!SB, haveKey: !!KEY, haveSam: !!SAMKEY }) };
  }

  // date window: last 90 days of postings
  var to = new Date();
  var from = new Date(Date.now() - 90*86400000);
  var postedFrom = mmddyyyy(from), postedTo = mmddyyyy(to);

  // Budget: stay within Netlify time + API limits. Cap total API calls per run.
  var MAX_CALLS = parseInt(params.maxcalls || '12', 10);
  var calls = 0, totalRecords = 0, pages = 0;
  var startedAt = new Date().toISOString();

  try {
    for (var i = 0; i < SET_ASIDES.length && calls < MAX_CALLS; i++) {
      var sa = SET_ASIDES[i];
      var offset = 0;
      var more = true;
      while (more && calls < MAX_CALLS) {
        var url = 'https://api.sam.gov/opportunities/v2/search'
          + '?api_key=' + encodeURIComponent(SAMKEY)
          + '&postedFrom=' + postedFrom + '&postedTo=' + postedTo
          + '&limit=1000&offset=' + offset
          + '&ptype=o,k,p'                       // solicitations, combined, presol
          + (sa ? ('&typeOfSetAside=' + sa) : '');
        var controller = new AbortController();
        var tid = setTimeout(function(){ controller.abort(); }, 15000);
        var res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        clearTimeout(tid);
        calls++;

        if (res.status === 429) { more = false; break; }     // rate limited — stop gracefully
        if (!res.ok) { more = false; break; }

        var data = await res.json();
        var recs = data.opportunitiesData || [];
        if (recs.length) {
          var rows = recs.map(mapRecord).filter(function(r){ return r.notice_id; });
          await upsertBatch(SB, KEY, rows);
          totalRecords += rows.length;
          pages++;
        }
        var total = data.totalRecords || 0;
        offset += 1000;
        more = offset < total && recs.length > 0;
      }
    }

    // log the run
    await fetch(SB + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ started_at: startedAt, finished_at: new Date().toISOString(), records: totalRecords, pages: pages, status: 'success', message: 'calls=' + calls }),
    }).catch(function(){});

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, records: totalRecords, pages: pages, apiCalls: calls }) };
  } catch (err) {
    await fetch(SB + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ started_at: startedAt, finished_at: new Date().toISOString(), records: totalRecords, status: 'error', message: err.message }),
    }).catch(function(){});
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: err.message, records: totalRecords, apiCalls: calls }) };
  }
};
