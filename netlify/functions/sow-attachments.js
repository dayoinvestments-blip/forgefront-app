/**
 * Netlify Function: /.netlify/functions/sow-attachments
 * Retrieves the full scope text for a SAM.gov notice by reading its attachments.
 *
 * SAM.gov v2 search returns a `resourceLinks` array per opportunity — direct
 * download URLs for the posted SOW / PWS / RFQ documents. This function:
 *   1. Looks up the notice via v2 search (noticeid param)
 *   2. Walks resourceLinks, downloading each attachment
 *   3. Extracts text from HTML/plain-text attachments (dependency-free)
 *   4. Returns the combined text, plus the list of attachment links so the
 *      caller can offer direct-download fallback for binary PDFs.
 *
 * Query: ?noticeId=<id>   (SAM_SYNC_KEY env var supplies the API key)
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
    .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function withKey(url, key) {
  if (!key) return url;
  if (url.indexOf('api_key=') >= 0) return url;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(key);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const p        = event.queryStringParameters || {};
  const noticeId = (p.noticeId || '').trim();
  const samKey   = (process.env.SAM_SYNC_KEY || '').trim();

  if (!noticeId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'noticeId required' }) };
  }
  if (!samKey) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'no_api_key' }) };
  }

  try {
    // 1. Look up the notice to get its resourceLinks
    const searchUrl = 'https://api.sam.gov/prod/opportunities/v2/search'
      + '?noticeid=' + encodeURIComponent(noticeId)
      + '&limit=1&api_key=' + encodeURIComponent(samKey);

    const sRes = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!sRes.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'sam_search_' + sRes.status }) };
    }

    const sData = await sRes.json();
    const opp = (sData.opportunitiesData && sData.opportunitiesData[0]) || null;
    if (!opp) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'notice_not_found' }) };
    }

    const links = Array.isArray(opp.resourceLinks) ? opp.resourceLinks.filter(Boolean) : [];
    if (!links.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'no_attachments' }) };
    }

    // 2. Download attachments, extracting text where possible.
    //    Cap at 3 attachments and ~6s total to respect the 10s function limit.
    const collected = [];
    const deadline = Date.now() + 6000;

    for (let i = 0; i < links.length && i < 3; i++) {
      if (Date.now() > deadline) break;
      const link = withKey(links[i], samKey);
      try {
        const aRes = await fetch(link, { signal: AbortSignal.timeout(4000) });
        if (!aRes.ok) continue;
        const ct = (aRes.headers.get('content-type') || '').toLowerCase();

        if (ct.includes('pdf') || ct.includes('officedocument') || ct.includes('msword') || ct.includes('octet-stream')) {
          // Binary document — cannot extract text without a parser library.
          // Skip extraction; the link is returned for direct-download fallback.
          continue;
        }

        // Text or HTML — extract.
        const text = await aRes.text();
        const cleaned = ct.includes('html') ? stripHtml(text) : text.trim();
        if (cleaned && cleaned.length > 100) collected.push(cleaned);
      } catch (_) {
        // skip this attachment, continue to next
      }
    }

    const sow = collected.join('\n\n---\n\n').trim();

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        sow: sow,                 // extracted text ('' if all attachments were binary)
        links: links,             // all attachment URLs (un-keyed) for UI fallback
        reason: sow ? 'ok' : 'binary_only',
      }),
    };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sow: '', links: [], reason: 'error', error: err.message }) };
  }
};
