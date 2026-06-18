/**
 * delete-account.js — permanently deletes the authenticated user's account.
 *
 * Flow:
 *   1. Verify the caller's Supabase JWT (so a user can only delete THEIR OWN account).
 *   2. Hard-delete that auth user via the Supabase admin API.
 *      All data rows (profiles, jobs, crew_members, certifications, invoices,
 *      invoice_line_items, bids) are removed automatically by the
 *      ON DELETE CASCADE foreign keys to auth.users(id).
 *
 * Required env vars (already set for the other functions):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Call: POST /.netlify/functions/delete-account
 *   Header: Authorization: Bearer <the signed-in user's access token>
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, obj) {
  return { statusCode, headers: CORS, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  // CORS preflight (needed for the native app, which calls cross-origin).
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const SB = process.env.SUPABASE_URL || '';
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SB || !KEY) {
    console.error('[delete-account] SUPABASE env vars not set');
    return json(500, { error: 'Server not configured' });
  }

  // 1. Identify the caller from their JWT.
  const authHeader =
    (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  if (authHeader.indexOf('Bearer ') !== 0) {
    return json(401, { error: 'Not authenticated' });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return json(401, { error: 'Not authenticated' });
  }

  let userId = null;
  try {
    const r = await fetch(SB + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      return json(401, { error: 'Invalid or expired session' });
    }
    const user = await r.json();
    userId = user && user.id;
  } catch (e) {
    console.error('[delete-account] auth check failed:', e.message);
    return json(502, { error: 'Auth check failed' });
  }
  if (!userId) {
    return json(401, { error: 'Not authenticated' });
  }

  // 2. Hard-delete the auth user. Cascade removes all of their data.
  try {
    const del = await fetch(SB + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
      method: 'DELETE',
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json',
      },
      // Force a hard delete so the ON DELETE CASCADE foreign keys actually fire.
      body: JSON.stringify({ should_soft_delete: false }),
      signal: AbortSignal.timeout(8000),
    });

    // 404 = already gone; treat as success (idempotent).
    if (!del.ok && del.status !== 404) {
      const txt = await del.text().catch(() => '');
      console.error('[delete-account] admin delete failed', del.status, txt);
      return json(500, { error: 'Could not delete account' });
    }
  } catch (e) {
    console.error('[delete-account] delete request failed:', e.message);
    return json(502, { error: 'Delete request failed' });
  }

  return json(200, { ok: true });
};
