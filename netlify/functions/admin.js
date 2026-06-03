/**
 * ForgeFront — Admin API
 * Handles all superuser/admin actions:
 * grant_comp, revoke_comp, extend_comp, suspend,
 * archive, reactivate, cancel_subscription,
 * cancel_immediately, issue_refund, set_tier, set_role
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    STRIPE_SECRET_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

function getSB()     { return process.env.SUPABASE_URL || ''; }
function getSBKey()  { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function getStripe() { return process.env.STRIPE_SECRET_KEY || ''; }

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(getSB() + path, {
    headers: { apikey: getSBKey(), Authorization: 'Bearer ' + getSBKey() },
  });
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(getSB() + path, {
    method: 'PATCH',
    headers: {
      apikey: getSBKey(), Authorization: 'Bearer ' + getSBKey(),
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Stripe helpers ────────────────────────────────────────────────────────────
async function stripePost(path, params) {
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + getStripe(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

async function stripeGet(path) {
  const res = await fetch('https://api.stripe.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + getStripe() },
  });
  return res.json();
}

// ── Auth check: is caller a superuser or admin? ──────────────────────────────
async function requireAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  // Verify JWT via Supabase auth
  const res = await fetch(getSB() + '/auth/v1/user', {
    headers: { apikey: getSBKey(), Authorization: 'Bearer ' + token },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  // Check role in profiles
  const rows = await sbGet('/rest/v1/profiles?id=eq.' + user.id + '&select=id,role,tier');
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return null;
  if (!['superuser', 'admin'].includes(profile.role)) return null;
  return { id: user.id, role: profile.role };
}

// ── Log admin action ──────────────────────────────────────────────────────────
async function auditLog(adminId, targetId, action, detail) {
  try {
    await fetch(getSB() + '/rest/v1/admin_audit_log', {
      method: 'POST',
      headers: {
        apikey: getSBKey(), Authorization: 'Bearer ' + getSBKey(),
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        admin_id: adminId, target_user_id: targetId,
        action, detail: detail || null,
        created_at: new Date().toISOString(),
      }),
    });
  } catch(e) { /* don't fail over audit */ }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const admin = await requireAdmin(event.headers['authorization'] || event.headers['Authorization'] || '');
  if (!admin) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };

  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch(e) {}

  // ── GET /admin?action=list_users ──────────────────────────────────────────
  if (method === 'GET' && params.action === 'list_users') {
    const search  = params.search  || '';
    const tier    = params.tier    || '';
    const status  = params.status  || '';
    const page    = parseInt(params.page || '1');
    const limit   = 25;
    const offset  = (page - 1) * limit;

    let path = '/rest/v1/profiles?select=id,name,email,company,role,tier,stripe_customer_id,is_comp,comp_tier,comp_expires_at,account_status,created_at&order=created_at.desc&limit=' + limit + '&offset=' + offset;
    if (tier)   path += '&tier=eq.' + encodeURIComponent(tier);
    if (status) path += '&account_status=eq.' + encodeURIComponent(status);
    if (search) path += '&or=(email.ilike.*' + encodeURIComponent(search) + '*,name.ilike.*' + encodeURIComponent(search) + '*,company.ilike.*' + encodeURIComponent(search) + '*)';

    const data = await sbGet(path);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ data: Array.isArray(data) ? data : [], page, limit }) };
  }

  // ── GET /admin?action=metrics ─────────────────────────────────────────────
  if (method === 'GET' && params.action === 'metrics') {
    const MRR = { starter: 29, pro: 79, command: 199 };
    const profiles = await sbGet('/rest/v1/profiles?select=id,tier,is_comp,account_status,created_at');
    const all = Array.isArray(profiles) ? profiles : [];
    const now = new Date();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    const d7  = new Date(now - 7  * 86400000).toISOString();

    const paid      = all.filter(p => p.tier !== 'free' && !p.is_comp && p.account_status !== 'suspended' && p.account_status !== 'archived');
    const comp      = all.filter(p => p.is_comp);
    const suspended = all.filter(p => p.account_status === 'suspended');
    const archived  = all.filter(p => p.account_status === 'archived');
    const mrr       = paid.reduce((s, p) => s + (MRR[p.tier] || 0), 0);
    const new7d     = all.filter(p => p.created_at >= d7).length;
    const new30d    = all.filter(p => p.created_at >= d30).length;

    // Tier breakdown — exclude comp from revenue
    const tierBreakdown = {};
    for (const [t, price] of Object.entries(MRR)) {
      const users = paid.filter(p => p.tier === t);
      tierBreakdown[t] = { count: users.length, mrr: users.length * price };
    }

    // Comp accounts
    const compList = await sbGet('/rest/v1/profiles?is_comp=eq.true&select=id,name,email,company,tier,comp_tier,comp_expires_at,comp_note,comp_granted_at&order=comp_granted_at.desc');

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        overview: {
          totalUsers:    all.length,
          paidUsers:     paid.length,
          compUsers:     comp.length,
          suspendedUsers: suspended.length,
          archivedUsers:  archived.length,
          mrr:           Math.round(mrr * 100) / 100,
          new7d, new30d,
        },
        tierBreakdown,
        compList: Array.isArray(compList) ? compList : [],
      }),
    };
  }

  // ── GET /admin?action=refund_info&userId=xxx ──────────────────────────────
  if (method === 'GET' && params.action === 'refund_info') {
    const userId = params.userId;
    if (!userId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'userId required' }) };
    const rows = await sbGet('/rest/v1/profiles?id=eq.' + userId + '&select=stripe_customer_id,email');
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile || !profile.stripe_customer_id) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No Stripe customer on file' }) };
    }
    const invoices = await stripeGet('/invoices?customer=' + profile.stripe_customer_id + '&limit=5&status=paid');
    const list = (invoices.data || []).map(inv => ({
      invoiceId: inv.id,
      amount:    inv.amount_paid,
      currency:  inv.currency,
      chargeId:  typeof inv.charge === 'string' ? inv.charge : inv.charge?.id,
      date:      inv.created,
      description: inv.description || inv.lines?.data?.[0]?.description || '',
    }));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ invoices: list }) };
  }

  // ── PATCH actions ─────────────────────────────────────────────────────────
  if (method === 'PATCH') {
    const { action, userId, value, note, expiresAt, chargeId, amount, reason } = body;
    if (!action || !userId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'action and userId required' }) };

    const rows = await sbGet('/rest/v1/profiles?id=eq.' + userId + '&select=id,name,email,tier,role,is_comp,stripe_customer_id,stripe_subscription_id,account_status');
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'User not found' }) };

    // Protect superusers from being modified by non-superusers
    if (profile.role === 'superuser' && admin.role !== 'superuser') {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Cannot modify superuser accounts' }) };
    }

    let update = {};

    switch (action) {

      case 'grant_comp':
        if (!value) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'tier value required' }) };
        update = {
          is_comp: true, comp_tier: value, tier: value,
          comp_expires_at: expiresAt || null,
          comp_note: note || null,
          comp_granted_by: admin.id,
          comp_granted_at: new Date().toISOString(),
          account_status: 'active',
        };
        break;

      case 'revoke_comp':
        update = {
          is_comp: false, comp_tier: null,
          comp_expires_at: null, comp_note: null,
          comp_granted_by: null, comp_granted_at: null,
          tier: 'free',
        };
        break;

      case 'extend_comp':
        if (!profile.is_comp) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'User is not on comp' }) };
        update = { comp_expires_at: expiresAt || null };
        break;

      case 'set_tier':
        if (!value) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'tier value required' }) };
        const validTiers = ['free', 'starter', 'pro', 'command'];
        if (!validTiers.includes(value)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid tier' }) };
        update = { tier: value };
        break;

      case 'set_role':
        if (!value) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'role value required' }) };
        const validRoles = ['user', 'support', 'admin', 'superuser'];
        if (!validRoles.includes(value)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid role' }) };
        if (admin.role !== 'superuser') return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Only superuser can change roles' }) };
        update = { role: value };
        break;

      case 'suspend':
        update = { account_status: 'suspended', tier: profile.is_comp ? profile.tier : 'free' };
        // Cancel Stripe subscription if active
        if (profile.stripe_subscription_id && getStripe()) {
          await stripePost('/subscriptions/' + profile.stripe_subscription_id + '/cancel', {});
          update.stripe_subscription_id = null;
        }
        break;

      case 'reactivate':
        update = { account_status: 'active' };
        break;

      case 'archive':
        update = {
          account_status: 'archived',
          archived_at:     new Date().toISOString(),
          archived_reason: note || null,
          tier: 'free',
        };
        if (profile.stripe_subscription_id && getStripe()) {
          await stripePost('/subscriptions/' + profile.stripe_subscription_id + '/cancel', {});
          update.stripe_subscription_id = null;
        }
        break;

      case 'cancel_subscription':
        // Cancel at period end (user keeps access until billing cycle ends)
        if (!profile.stripe_subscription_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No active subscription' }) };
        if (!getStripe()) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Stripe not configured' }) };
        const cancelResult = await stripePost('/subscriptions/' + profile.stripe_subscription_id, { cancel_at_period_end: 'true' });
        if (cancelResult.error) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: cancelResult.error.message }) };
        await auditLog(admin.id, userId, 'cancel_subscription', 'At period end');
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, message: 'Subscription will cancel at period end' }) };

      case 'cancel_immediately':
        if (!profile.stripe_subscription_id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No active subscription' }) };
        if (!getStripe()) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Stripe not configured' }) };
        const cancelNow = await stripePost('/subscriptions/' + profile.stripe_subscription_id + '/cancel', {});
        if (cancelNow.error) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: cancelNow.error.message }) };
        update = { tier: 'free', stripe_subscription_id: null };
        break;

      case 'issue_refund':
        if (!chargeId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'chargeId required' }) };
        if (!getStripe()) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Stripe not configured' }) };
        const refundParams = { charge: chargeId };
        if (amount)  refundParams.amount = String(Math.round(amount));
        if (reason)  refundParams.reason = reason;
        const refund = await stripePost('/refunds', refundParams);
        if (refund.error) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: refund.error.message }) };
        await auditLog(admin.id, userId, 'issue_refund', 'chargeId: ' + chargeId + ', amount: ' + (amount || 'full'));
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, refundId: refund.id, amount: refund.amount }) };

      default:
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      const result = await sbPatch('/rest/v1/profiles?id=eq.' + userId, update);
      if (result && result.message && !Array.isArray(result)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: result.message }) };
      }
      await auditLog(admin.id, userId, action, note || value || null);
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
