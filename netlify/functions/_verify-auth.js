/**
 * Shared auth + rate limiting for AI functions.
 * verifyUser  — verifies a Supabase JWT before a function spends Anthropic credits.
 * checkRateLimit — caps AI calls per user per hour (by tier) to prevent abuse.
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Requires Supabase table: ai_usage(id, user_id, function, created_at)
 */

function sbEnv() {
  return { SB: process.env.SUPABASE_URL || '', KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '' };
}

async function verifyUser(headers) {
  try {
    const authHeader = (headers && (headers['authorization'] || headers['Authorization'])) || '';
    if (!authHeader || authHeader.indexOf('Bearer ') !== 0) return null;
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;

    const { SB, KEY } = sbEnv();
    if (!SB || !KEY) { console.error('[auth] SUPABASE env vars not set'); return null; }

    const res = await fetch(SB + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id, email: user.email || '' };
  } catch (e) {
    console.error('[auth] verify error:', e.message);
    return null;
  }
}

// Hourly AI-call caps by tier. Generous — purely an abuse guard.
const HOURLY_CAPS = { free: 15, starter: 40, base: 40, pro: 80, command: 150, military: 150, officer: 80, staff: 80, unit: 80, superuser: 9999, admin: 9999, founder: 9999 };

async function getUserTier(userId) {
  try {
    const { SB, KEY } = sbEnv();
    const r = await fetch(SB + '/rest/v1/profiles?id=eq.' + userId + '&select=tier,role', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return 'starter';
    const rows = await r.json();
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p) return 'starter';
    if (p.role && ['superuser','admin','founder'].indexOf(p.role) >= 0) return p.role;
    return p.tier || 'starter';
  } catch (e) { return 'starter'; }
}

/**
 * Returns { ok: true } if under the limit, or { ok:false, retryAfter, cap } if over.
 * Also logs this call when allowed.
 */
async function checkRateLimit(userId, fnName) {
  try {
    const { SB, KEY } = sbEnv();
    if (!SB || !KEY) return { ok: true }; // fail open if misconfigured (don't block real users)

    const tier = await getUserTier(userId);
    const cap = HOURLY_CAPS[tier] != null ? HOURLY_CAPS[tier] : 40;
    if (cap >= 9999) { logUsage(userId, fnName); return { ok: true }; }

    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const r = await fetch(
      SB + '/rest/v1/ai_usage?user_id=eq.' + userId + '&created_at=gte.' + encodeURIComponent(since) + '&select=id',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact' }, signal: AbortSignal.timeout(3000) }
    );
    // Prefer count header if present
    let count = 0;
    const cr = r.headers.get('content-range');
    if (cr && cr.indexOf('/') >= 0) {
      count = parseInt(cr.split('/')[1], 10) || 0;
    } else {
      const rows = await r.json();
      count = Array.isArray(rows) ? rows.length : 0;
    }

    if (count >= cap) {
      return { ok: false, cap: cap, retryAfter: 3600 };
    }
    logUsage(userId, fnName); // fire-and-forget
    return { ok: true };
  } catch (e) {
    console.error('[ratelimit] error:', e.message);
    return { ok: true }; // fail open on error — never block a paying user due to our bug
  }
}

function logUsage(userId, fnName) {
  try {
    const { SB, KEY } = sbEnv();
    if (!SB || !KEY) return;
    // fire-and-forget insert
    fetch(SB + '/rest/v1/ai_usage', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, function: fnName || '' }),
    }).catch(function(){});
  } catch (e) {}
}

function unauthorized(CORS) {
  return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Authentication required. Please sign in.' }) };
}

function rateLimited(CORS, info) {
  return {
    statusCode: 429,
    headers: CORS,
    body: JSON.stringify({
      error: 'You have reached the hourly AI usage limit (' + (info && info.cap ? info.cap : '') + ' calls/hour). Please wait a bit and try again.',
      retryAfter: (info && info.retryAfter) || 3600,
    }),
  };
}

module.exports = { verifyUser, checkRateLimit, unauthorized, rateLimited };
