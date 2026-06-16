/**
 * Netlify Function: /.netlify/functions/sow-lineitems
 * Extracts priceable line items from a SOW so the user can collect vendor quotes.
 * Returns structured JSON: each item = what to buy/do, spec, unit, est qty.
 * Uses Haiku for speed (avoids Netlify 10s timeout).
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

    const SYSTEM_PROMPT = `You are a federal contracting estimator. Read a Statement of Work or contract description and extract the concrete deliverables, tasks, and requirements a contractor must fulfill to win and execute this contract.

Focus on concrete deliverables, labor categories, operational tasks, equipment, materials, compliance requirements, and services — anything a contractor must staff, source, subcontract, or perform to fulfill the PWS/SOW.

Respond with valid JSON only. No markdown, no backticks, no preamble. Exact structure:

{
  "items": [
    {
      "id": "1",
      "name": "short line item name",
      "spec": "specific requirement or standard from the SOW (size, grade, regulation, code, or operational requirement)",
      "category": "Material | Labor | Equipment | Service | Subcontract | Compliance",
      "unit": "unit of measure (each, LF, SF, hours, lot, month, etc.)",
      "estQty": "estimated quantity if derivable, else 'TBD'",
      "notes": "anything a vendor or subcontractor needs to quote accurately, or compliance standard referenced"
    }
  ],
  "summary": "1 sentence on what the contractor is sourcing or performing overall"
}

Extract 3-12 items. For services contracts, include labor categories, operational tasks, and compliance requirements. For construction or supply contracts, include materials, equipment, and technical specs. Pull real standards, regulations, or requirements referenced in the SOW text. Do not invent items with no basis in the provided text.`;

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
        model:      'claude-haiku-4-5-20251001',  // Fast model — completes well within Netlify 10s timeout
        max_tokens: 1000,                          // Haiku is concise; 1000 is plenty for structured extraction
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
