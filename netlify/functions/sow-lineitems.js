/**
 * Netlify Function: /.netlify/functions/sow-lineitems
 * Extracts priceable line items from a SOW.
 *
 * Flow:
 *   1. Receive sow, title, naics, notice_id, description_url from frontend.
 *   2. If inline SOW text is short (<500 chars) and description_url is provided,
 *      fetch the full description from SAM.gov (with SAM_SYNC_KEY if available).
 *   3. Run Haiku on the best available text and return structured line items.
 */
const { verifyUser, checkRateLimit, unauthorized, rateLimited } = require('./_verify-auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

async function fetchFullDescription(description_url) {
  const samKey = process.env.SAM_SYNC_KEY;
  try {
    let url = description_url.trim();
    if (samKey && !url.includes('api_key=')) {
      url += (url.includes('?') ? '&' : '?') + 'api_key=' + samKey;
    }
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      const text = data.description || data.content || data.body
        || (data.opportunityDescription && data.opportunityDescription.content)
        || null;
      return text && text.length > 80 ? text : null;
    } else {
      const text = await res.text();
      const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return stripped.length > 80 ? stripped : null;
    }
  } catch (e) {
    console.error('fetchFullDescription error:', e.message);
    return null;
  }
}

exports.handler = async (event) => {
  const t0 = Date.now();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const _authedUser = await verifyUser(event.headers);
  console.log('[timing] verifyUser done', Date.now() - t0, 'ms');
  if (!_authedUser) return unauthorized(CORS);
  const _rl = await checkRateLimit(_authedUser.id, 'sow-lineitems');
  console.log('[timing] checkRateLimit done', Date.now() - t0, 'ms');
  if (!_rl.ok) return rateLimited(CORS, _rl);
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body            = JSON.parse(event.body || '{}');
    let   sow             = (body.sow || '').trim();
    const title           = body.title           || '';
    const naics           = body.naics           || '';
    const description_url = body.description_url || '';

    if (sow.length < 500 && description_url && description_url.startsWith('http')) {
      console.log('SOW short (' + sow.length + ' chars). Fetching from:', description_url.split('?')[0]);
      const full = await fetchFullDescription(description_url);
      if (full && full.length > sow.length) {
        console.log('Full description fetched: ' + full.length + ' chars');
        sow = full;
      }
    }

    if (sow.length < 50) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'SOW text too short to extract line items.' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    // Strip front-matter noise before truncating so the window contains real scope.
    let cleaned = sow
      .replace(/\.{3,}/g, ' ')        // table-of-contents dot leaders  (……… → space)
      .replace(/\n{3,}/g, '\n\n')     // collapse excessive blank lines
      .trim();
    const truncated = cleaned.length > 24000 ? cleaned.slice(0, 24000) + '\n\n[... truncated]' : cleaned;

    const SYSTEM_PROMPT = `You are a federal contracting estimator. Read a Statement of Work or contract description and extract the concrete deliverables, tasks, and requirements a contractor must fulfill to execute this contract.

Focus on concrete deliverables, labor categories, operational tasks, equipment, materials, compliance requirements, and services — anything a contractor must staff, source, subcontract, or perform.

Respond with valid JSON only. No markdown, no backticks, no preamble. Exact structure:

{
  "items": [
    {
      "id": "1",
      "name": "short line item name",
      "spec": "specific requirement or standard from the SOW",
      "category": "Material | Labor | Equipment | Service | Subcontract | Compliance",
      "unit": "unit of measure (each, LF, SF, hours, lot, month, etc.)",
      "estQty": "estimated quantity if derivable, else 'TBD'",
      "notes": "anything a vendor needs to quote accurately"
    }
  ],
  "summary": "1 sentence on what the contractor is sourcing or performing overall"
}

Extract 3-12 items. For services contracts, include labor categories, operational tasks, and compliance requirements. For construction or supply contracts, include materials, equipment, and technical specs. Do not invent items with no basis in the provided text.`;

    const USER_PROMPT = 'Extract priceable line items from this SOW'
      + (title ? ' for contract: ' + title : '')
      + (naics ? ' (NAICS ' + naics + ')' : '')
      + '.\n\nSOW TEXT:\n' + truncated;

    console.log('[timing] pre-Anthropic fetch', Date.now() - t0, 'ms');
    console.log('[sow-lineitems] sending', truncated.length, 'chars to Haiku');
    console.log('[sow-lineitems] first 200 chars:', truncated.slice(0, 200).replace(/\n/g, '\\n'));
    let aiRes;
    try {
      aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: USER_PROMPT }],
        }),
        signal: AbortSignal.timeout(9500),
      });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        console.error('[sow-lineitems] Anthropic call timed out after 8.5s');
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: 'AI timed out — try again' }) };
      }
      throw e;
    }
    console.log('[timing] Anthropic responded', Date.now() - t0, 'ms', '| status:', aiRes.status);

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err.slice(0, 200));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: 'AI service error' }) };
    }

    const data = await aiRes.json();
    let raw = (data.content && data.content[0] && data.content[0].text) || '{}';
    let parsed;
    try {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (_) { parsed = { items: [] }; } }
      else parsed = { items: [] };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ items: parsed.items || [], summary: parsed.summary || '' }),
    };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: err.message }) };
  }
};
