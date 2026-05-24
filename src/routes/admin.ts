import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireSuperuser } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';

const router = Router();
router.use(requireAuth);

// GET /api/admin/metrics
router.get('/metrics', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const [profiles, jobs, invoices, bids] = await Promise.all([
      supabaseAdmin.from('profiles').select('tier, role, created_at'),
      supabaseAdmin.from('jobs').select('value, invoiced'),
      supabaseAdmin.from('invoices').select('total, status'),
      supabaseAdmin.from('bids').select('id'),
    ]);
    const p = profiles.data || [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    res.json({
      overview: {
        totalUsers: p.length,
        proUsers: p.filter(u => u.tier === 'pro').length,
        baseUsers: p.filter(u => u.tier === 'base').length,
        freeUsers: p.filter(u => u.tier === 'free').length,
        mrrUsd: p.filter(u => u.tier === 'pro').length * 79 + p.filter(u => u.tier === 'base').length * 29,
        newLast30d: p.filter(u => u.created_at > thirtyDaysAgo).length,
        totalJobValue: (jobs.data || []).reduce((s, j) => s + Number(j.value), 0),
        totalInvoiced: (invoices.data || []).reduce((s, i) => s + Number(i.total), 0),
        bidsGenerated: bids.data?.length || 0,
      },
      byTier: { free: p.filter(u => u.tier === 'free').length, base: p.filter(u => u.tier === 'base').length, pro: p.filter(u => u.tier === 'pro').length },
      byRole: { user: p.filter(u => u.role === 'user').length, support: p.filter(u => u.role === 'support').length, admin: p.filter(u => u.role === 'admin').length, superuser: p.filter(u => u.role === 'superuser').length },
    });
  } catch (err: any) { res.status(500).json({ error: 'Failed to fetch metrics' }); }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req: AuthRequest, res) => {
  const { page = '1', limit = '50', search = '', role = '', tier = '' } = req.query as any;
  let query = supabaseAdmin.from('profiles').select('*', { count: 'exact' });
  if (role)   query = query.eq('role', role);
  if (tier)   query = query.eq('tier', tier);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
  const from = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(from, from + parseInt(limit) - 1).order('created_at', { ascending: false });
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch users' });
  res.json({ users: data, total: count, page: parseInt(page), limit: parseInt(limit) });
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireAdmin, async (req: AuthRequest, res) => {
  const Schema = z.object({
    name: z.string().optional(), company: z.string().optional(),
    tier: z.enum(['free','base','pro']).optional(),
    role: z.enum(['user','support','admin','superuser']).optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // Only superusers can assign admin/superuser roles
  if (parsed.data.role && ['admin','superuser'].includes(parsed.data.role) && req.user!.role !== 'superuser') {
    return res.status(403).json({ error: 'Only superusers can assign admin roles' });
  }
  const { data, error } = await supabaseAdmin.from('profiles')
    .update(parsed.data).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Failed to update user' });
  res.json({ user: data });
});

// POST /api/admin/roles/assign
router.post('/roles/assign', requireSuperuser, async (req: AuthRequest, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) return res.status(400).json({ error: 'userId and role required' });
  if (!['user','support','admin','superuser'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
  if (error) return res.status(500).json({ error: 'Failed to assign role' });
  res.json({ success: true, userId, role });
});

export { router as adminRouter };
