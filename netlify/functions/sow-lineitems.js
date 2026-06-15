/**
 * Netlify Function: /.netlify/functions/sow-lineitems
 * Extracts priceable line items from a SOW so the user can collect vendor quotes.
 * Returns structured JSON: each item = what to buy/do, spec, unit, est qty.
 */
const { verifyUser, checkRateLimit, unauthorized, rateLimited } = require('./_verify-auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Cost protection: require a signed-in user before spending Anthropic credits
  const _authedUser = await verifyUser(event.headers);
  if (!_authedUser) return unauthorized(CORS);
  const _rl = await checkRateLimit(_authedUser.id, 'sow-lineitems');
  if (!_rl.ok) return rateLimited(CORS, _rl);
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const sow  = (body.sow || '').trim();
    const title = body.title || '';
    const naics = body.naics || '';
    if (sow.length < 50) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'SOW text too short to extract line items.' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    const truncated = sow.length > 8000 ? sow.slice(0, 8000) + '\n\n[... truncated]' : sow;

    const SYSTEM_PROMPT = `You are a federal contracting estimator. Read a Statement of Work and extract the concrete, priceable line items a contractor must source or perform to deliver the contract. Focus on things that need a vendor or subcontractor quote: materials, equipment, labor categories, services, deliverables.

Respond with valid JSON only. No markdown, no backticks, no preamble. Exact structure:

{
  "items": [
    {
      "id": "1",
      "name": "short line item name",
      "spec": "specific requirement/specification from the SOW (size, grade, standard, code)",
      "category": "Material | Labor | Equipment | Service | Subcontract",
      "unit": "unit of measure (each, LF, SF, hours, lot, etc.)",
      "estQty": "estimated quantity if derivable, else 'TBD'",
      "notes": "anything a vendor needs to quote accurately, or compliance standard referenced"
    }
  ],
  "summary": "1 sentence on what the contractor is sourcing overall"
}

Extract 3-15 items. Be specific and pull real specs/standards from the SOW text (AWS D1.1, ASTM grades, NAICS-relevant requirements). Do not invent items not implied by the SOW.`;

    const USER_PROMPT = 'Extract priceable line items from this SOW'
      + (title ? ' for contract: ' + title : '')
      + (naics ? ' (NAICS ' + naics + ')' : '')
      + '.\n\nSOW TEXT:\n' + truncated;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: USER_PROMPT }],
      }),
    });

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
      if (m) { try { parsed = JSON.parse(m[0]); } catch(_) { parsed = { items: [] }; } }
      else parsed = { items: [] };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: parsed.items || [], summary: parsed.summary || '' }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ items: [], error: err.message }) };
  }
};
