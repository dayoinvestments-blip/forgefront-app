/**
 * Netlify Function: /.netlify/functions/subnet
 * Fetches REAL subcontracting opportunities from SBA SubNet (live).
 * Source: sba.gov SubNet public listing (HTML, parsed server-side).
 * Query: ?state=California&keyword=plumbing&naics=237310
 *
 * No API key required. Returns [] honestly on any fetch/parse failure —
 * never fabricated data.
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const BASE = 'https://www.sba.gov/federal-contracting/contracting-guide/prime-subcontracting/subcontracting-opportunities';

// US state name list for mapping 2-letter -> full (SubNet filters by full name)
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',
  TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',
  WY:'Wyoming',DC:'District of Columbia'
};

function decode(s) {
  if (!s) return '';
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ')
          .replace(/\s+/g,' ').trim();
}
function stripTags(s){ return decode(String(s||'').replace(/<[^>]+>/g,' ')); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  var p = event.queryStringParameters || {};
  var stateIn = (p.state || '').trim();
  var keyword = (p.keyword || '').trim().toLowerCase();
  var naics   = (p.naics || '').trim();

  var stateFull = '';
  if (stateIn) stateFull = STATE_NAMES[stateIn.toUpperCase()] || stateIn;

  try {
    var url = BASE + '?state=' + encodeURIComponent(stateFull || 'All') + '&keyword=' + encodeURIComponent(keyword);
    var controller = new AbortController();
    var tid = setTimeout(function(){ controller.abort(); }, 12000);
    var res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent':'ForgeFront/1.0', 'Accept':'text/html' } });
    clearTimeout(tid);
    if (!res.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'subnet', reason: 'sba_' + res.status }) };
    }
    var html = await res.text();

    // Each opportunity is a table row in the listing table.
    // Extract the <tbody> rows. Rows contain: Description (with link + prime + blurb),
    // Closing date, Performance start, Place of performance, NAICS, Point of contact.
    var contracts = [];
    var tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
    var scope = tbodyMatch ? tbodyMatch[0] : html;
    var rows = scope.match(/<tr[\s\S]*?<\/tr>/gi) || [];

    rows.forEach(function(row, idx) {
      var cells = row.match(/<td[\s\S]*?<\/td>/gi);
      if (!cells || cells.length < 6) return;

      // Cell 0: description — has an <a href="/opportunity/..."> title </a> + prime + blurb
      var descCell = cells[0];
      var linkMatch = descCell.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      var oppUrl = linkMatch ? linkMatch[1] : '';
      if (oppUrl && oppUrl.indexOf('http') !== 0) oppUrl = 'https://www.sba.gov' + oppUrl;
      var title = linkMatch ? stripTags(linkMatch[2]) : stripTags(descCell).slice(0, 80);
      var descFull = stripTags(descCell);
      // Prime contractor appears between the title link and the <br> blurb.
      var prime = '';
      var brSplit = descCell.split(/<br\s*\/?>/i);
      if (brSplit.length) {
        // first segment = link + prime name; strip the link to get the prime
        var firstSeg = stripTags(brSplit[0].replace(/<a[\s\S]*?<\/a>/i, ''));
        prime = firstSeg.trim();
      }
      if (!prime) prime = descFull.replace(title, '').trim().split('.')[0];

      var closing = stripTags(cells[1]);
      var startDt = stripTags(cells[2]);
      var place   = stripTags(cells[3]);
      var naicsCell = stripTags(cells[4]);
      var naicsCode = (naicsCell.match(/\d{6}/) || [''])[0];

      // Point of contact cell: name + mailto + tel
      var pocCell = cells[5];
      var emailMatch = pocCell.match(/mailto:([^"]+)"/i);
      var telMatch   = pocCell.match(/tel:([^"]+)"/i);
      var pocEmail = emailMatch ? emailMatch[1] : '';
      var pocName  = stripTags(pocCell.replace(/<a[\s\S]*?<\/a>/gi,'')) || '';
      var pocPhone = telMatch ? telMatch[1] : '';

      // NAICS filter (client asked for a specific code)
      if (naics && naicsCode && naicsCode !== naics) {
        // allow 4-digit prefix match (same industry group)
        if (naicsCode.slice(0,4) !== naics.slice(0,4)) return;
      }
      // keyword filter (belt-and-suspenders; SubNet also filters server-side)
      if (keyword && (title + ' ' + descFull).toLowerCase().indexOf(keyword) < 0) return;

      // Parse closing date to ISO if possible
      var deadlineIso = '';
      var dm = closing.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dm) deadlineIso = new Date(dm[3] + '-' + ('0'+dm[1]).slice(-2) + '-' + ('0'+dm[2]).slice(-2)).toISOString();

      contracts.push({
        id: 'subnet_' + (oppUrl.split('/').pop() || idx),
        source: 'subcontract',
        title: title,
        agency: prime || 'Prime Contractor',
        prime: prime,
        value: null,
        naics: naicsCode,
        setAside: 'Subcontract',
        status: 'open',
        state: place,
        city: '',
        deadline: deadlineIso,
        solNum: '',
        description: descFull,
        url: oppUrl,
        pocName: pocName,
        pocEmail: pocEmail,
        pocPhone: pocPhone,
        score: 70,
        _live: true,
      });
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: contracts, source: 'subnet', total: contracts.length }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'subnet', reason: 'error', error: err.message }) };
  }
};
