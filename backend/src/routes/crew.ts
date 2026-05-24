import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';

const router = Router();
router.use(requireAuth);

// GET /api/crew
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { data: members, error } = await supabaseAdmin
      .from('crew_members').select('*, certifications(*)')
      .eq('user_id', req.user!.id).order('name');
    if (error) throw error;
    const allCerts = members.flatMap((m: any) => m.certifications || []);
    const expiringSoon = allCerts.filter((c: any) => {
      const days = Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    }).length;
    const crew = members.map((m: any) => ({
      ...m,
      certifications: (m.certifications || []).map((c: any) => ({
        ...c,
        daysLeft: Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000),
      })),
    }));
    res.json({ crew, stats: { total: crew.length, expiringSoon } });
  } catch (err: any) { res.status(500).json({ error: 'Failed to fetch crew' }); }
});

// POST /api/crew
router.post('/', async (req: AuthRequest, res) => {
  const Schema = z.object({
    name: z.string().min(1), role: z.string().default('Crew Member'),
    phone: z.string().default(''), email: z.string().default(''), notes: z.string().default(''),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('crew_members')
    .insert({ ...parsed.data, user_id: req.user!.id }).select().single();
  if (error) return res.status(500).json({ error: 'Failed to add crew member' });
  res.status(201).json({ member: data });
});

// PATCH /api/crew/:id
router.patch('/:id', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin.from('crew_members')
    .update(req.body).eq('id', req.params.id).eq('user_id', req.user!.id).select().single();
  if (error || !data) return res.status(404).json({ error: 'Member not found' });
  res.json({ member: data });
});

// DELETE /api/crew/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  await supabaseAdmin.from('crew_members').delete()
    .eq('id', req.params.id).eq('user_id', req.user!.id);
  res.json({ message: 'Crew member removed' });
});

// POST /api/crew/:id/certifications
router.post('/:id/certifications', async (req: AuthRequest, res) => {
  const Schema = z.object({
    name: z.string().min(1), issuer: z.string().default(''),
    issued_date: z.string().optional(), expires_at: z.string(), cert_number: z.string().default(''),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // Verify crew member belongs to user
  const { data: member } = await supabaseAdmin.from('crew_members')
    .select('id').eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const { data, error } = await supabaseAdmin.from('certifications')
    .insert({ ...parsed.data, crew_member_id: req.params.id }).select().single();
  if (error) return res.status(500).json({ error: 'Failed to add certification' });
  res.status(201).json({ certification: data });
});

// DELETE /api/crew/:memberId/certifications/:certId
router.delete('/:memberId/certifications/:certId', async (req: AuthRequest, res) => {
  await supabaseAdmin.from('certifications').delete().eq('id', req.params.certId);
  res.json({ message: 'Certification removed' });
});

export { router as crewRouter };
