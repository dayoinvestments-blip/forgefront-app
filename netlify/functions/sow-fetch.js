/**
 * Netlify Function: /api/sow-fetch
 * Fetches the full description / SOW text for a SAM.gov opportunity.
 * SAM.gov returns the description as a separate authenticated URL;
 * this function fetches it server-side with the API key.
 *
 * Query: ?link=<descriptionLink>  OR  ?noticeId=<id>
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  var p        = event.queryStringParameters || {};
  var link     = p.link || '';
  var noticeId = p.noticeId || '';
  var samKey   = (p.userkey && p.userkey.trim()) || '';

  if (!samKey) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'no_api_key' }) };
  }

  // Build the description URL — SAM.gov serves SOW text via /v1/noticedesc
  var url = '';
  if (link && link.indexOf('http') === 0) {
    // descriptionUrl from the opportunity record, e.g. .../opportunities/v1/noticedesc?noticeid=...
    url = link + (link.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(samKey);
  } else if (noticeId) {
    url = 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=' + encodeURIComponent(noticeId) +
          '&api_key=' + encodeURIComponent(samKey);
  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ sow: '', error: 'link or noticeId required' }) };
  }

  try {
    var controller = new AbortController();
    var timeout    = setTimeout(function(){ controller.abort(); }, 12000);
    var res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timeout);

    if (!res.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'sam_' + res.status }) };
    }

    var raw = await res.text();
    var sow = '';
    // Response may be JSON {description:"..."} or raw HTML/text
    try {
      var j = JSON.parse(raw);
      // /v1/noticedesc returns { "description": "..." }
      sow = j.description || j.descriptionText || j.body || j.text || raw;
    } catch (e) {
      sow = raw;
    }
    sow = stripHtml(sow);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: sow, source: 'sam_gov' }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', reason: 'error', error: err.message }) };
  }
};
