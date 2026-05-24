/**
 * Netlify Function: /.netlify/functions/ai-assist
 * Powers the "AI Improve" buttons in the Business Profile section.
 * Uses Anthropic API to improve/generate professional federal contractor content.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { prompt, field } = JSON.parse(event.body || '{}');
    if (!prompt) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'prompt required' }) };
    }

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ text: null, error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You are an expert federal contracting consultant specializing in SDVOSB (Service-Disabled Veteran-Owned Small Business) proposals. Write professional, concise, compelling content for federal contracting officers. Be specific, avoid generic language. Use active voice. Keep responses under 200 words unless asked for more.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err.slice(0, 200));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ text: null, error: 'AI service error' }) };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || null;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ text, field }),
    };
  } catch (err) {
    console.error('[ai-assist]', err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ text: null, error: err.message }),
    };
  }
};
