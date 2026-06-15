/**
 * Shared auth verification for AI functions.
 * Verifies a Supabase JWT from the Authorization header before the function
 * spends Anthropic credits. Returns the user object or null.
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
async function verifyUser(headers) {
  try {
    const authHeader = (headers && (headers['authorization'] || headers['Authorization'])) || '';
    if (!authHeader || authHeader.indexOf('Bearer ') !== 0) return null;
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;

    const SB  = process.env.SUPABASE_URL || '';
    const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!SB || !KEY) {
      console.error('[auth] SUPABASE env vars not set');
      return null;
    }

    const res = await fetch(SB + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + token },
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

function unauthorized(CORS) {
  return {
    statusCode: 401,
    headers: CORS,
    body: JSON.stringify({ error: 'Authentication required. Please sign in.' }),
  };
}

module.exports = { verifyUser, unauthorized };
