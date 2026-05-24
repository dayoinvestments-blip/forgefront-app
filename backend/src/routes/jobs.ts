import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';

const router = Router();
router.use(requireAuth);

const JobSchema = z.object({
  name:         z.string().min(1),
  client:       z.string().min(1),
  value:        z.number().min(0).default(0),
  status:       z.enum(['active','pending','review','complete']).default('pending'),
  phase:        z.string().default(''),
  start_date:   z.string().optional(),
  estimated_end:z.string().optional(),
  notes:        z.string().default(''),
});

// GET /api/jobs
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('jobs').select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const stats = {
      total: data.length,
      active: data.filter(j => j.status === 'active').length,
      pipeline: data.reduce((s, j) => s + Number(j.value), 0),
      invoiced: data.reduce((s, j) => s + Number(j.invoiced), 0),
    };
    res.json({ jobs: data, stats });
  } catch (err: any) { res.status(500).json({ error: 'Failed to fetch jobs' }); }
});

// GET /api/jobs/:id
router.get('/:id', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin.from('jobs').select('*')
    .eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (error || !data) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: data });
});

// POST /api/jobs
router.post('/', async (req: AuthRequest, res) => {
  const parsed = JobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('jobs')
    .insert({ ...parsed.data, user_id: req.user!.id }).select().single();
  if (error) return res.status(500).json({ error: 'Failed to create job' });
  res.status(201).json({ job: data });
});

// PATCH /api/jobs/:id
router.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = JobSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('jobs')
    .update(parsed.data).eq('id', req.params.id).eq('user_id', req.user!.id).select().single();
  if (error || !data) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: data });
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin.from('jobs')
    .delete().eq('id', req.params.id).eq('user_id', req.user!.id);
  if (error) return res.status(500).json({ error: 'Failed to delete job' });
  res.json({ message: 'Job deleted' });
});

export { router as jobsRouter };
