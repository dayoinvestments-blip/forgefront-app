import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const Schema = z.object({
    email:    z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name:     z.string().min(2),
    company:  z.string().min(2),
    sdvosb:   z.boolean().default(true),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { email, password, name, company, sdvosb } = parsed.data;
  try {
    // Create auth user via Supabase — handles hashing, sessions, email confirm
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email confirmation for now (enable later)
      user_metadata: { name, company, sdvosb },
    });
    if (error) {
      if (error.message.includes('already registered')) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      return res.status(400).json({ error: error.message });
    }

    // Profile is auto-created by the Supabase trigger we set up in the SQL schema
    // Update it with additional fields
    await supabaseAdmin.from('profiles').update({
      name, company, sdvosb,
      naics_codes: ['332312'],
      set_asides: ['SDVOSB'],
    }).eq('id', data.user.id);

    // Sign them in and return a session token
    const { data: session, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email, password,
    });
    if (signInError) return res.status(500).json({ error: 'Account created but sign-in failed' });

    const profile = await supabaseAdmin.from('profiles').select('*').eq('id', data.user.id).single();

    res.status(201).json({
      user: {
        id: data.user.id,
        email,
        name,
        company,
        role: profile.data?.role ?? 'user',
        tier: profile.data?.tier ?? 'free',
      },
      token: session.session?.access_token,
      refreshToken: session.session?.refresh_token,
    });
  } catch (err: any) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const Schema = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password required' });

  const { email, password } = parsed.data;
  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Fetch profile for role/tier/name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    // Check suspension
    if (profile?.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Contact support.' });
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name ?? '',
        company: profile?.company ?? '',
        role: profile?.role ?? 'user',
        tier: profile?.tier ?? 'free',
        sdvosb: profile?.sdvosb ?? true,
        naicsCodes: profile?.naics_codes ?? ['332312'],
        setAsides: profile?.set_asides ?? ['SDVOSB'],
        preferredStates: profile?.preferred_states ?? ['LA'],
      },
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .single();
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        name: profile.name,
        company: profile.company,
        phone: profile.phone,
        role: profile.role,
        tier: profile.tier,
        sdvosb: profile.sdvosb,
        naicsCodes: profile.naics_codes,
        setAsides: profile.set_asides,
        preferredStates: profile.preferred_states,
        createdAt: profile.created_at,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── PATCH /api/auth/me ───────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req: AuthRequest, res) => {
  const Schema = z.object({
    name:            z.string().min(2).optional(),
    company:         z.string().optional(),
    phone:           z.string().optional(),
    naicsCodes:      z.array(z.string()).optional(),
    setAsides:       z.array(z.string()).optional(),
    preferredStates: z.array(z.string()).optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  try {
    const updates: any = {};
    if (d.name)             updates.name             = d.name;
    if (d.company)          updates.company          = d.company;
    if (d.phone !== undefined) updates.phone         = d.phone;
    if (d.naicsCodes)       updates.naics_codes      = d.naicsCodes;
    if (d.setAsides)        updates.set_asides       = d.setAsides;
    if (d.preferredStates)  updates.preferred_states = d.preferredStates;
    const { data, error } = await supabaseAdmin
      .from('profiles').update(updates).eq('id', req.user!.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err: any) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  // Supabase handles the reset email automatically
  await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
  });
  // Always return success (don't leak whether email exists)
  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    if (error) return res.status(401).json({ error: 'Invalid refresh token' });
    res.json({
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  // Supabase invalidates the token server-side
  await supabaseAdmin.auth.admin.signOut(req.token!);
  res.json({ message: 'Logged out successfully' });
});

export { router as authRouter };
