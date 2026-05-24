import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../db/supabase';

export type AdminRole = 'superuser' | 'admin' | 'support' | 'user';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: 'free' | 'base' | 'pro';
    role: AdminRole;
    name: string;
    company: string;
  };
  token?: string;
}

const ROLE_RANK: Record<AdminRole, number> = {
  superuser: 100, admin: 50, support: 10, user: 0,
};

// ─── Core auth — validates Supabase JWT ───────────────────────────────────────
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);
  try {
    // Verify token with Supabase — returns the user if valid
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Fetch profile (role, tier, name, company) from our profiles table
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, tier, name, company')
      .eq('id', user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email!,
      role: (profile?.role ?? 'user') as AdminRole,
      tier: (profile?.tier ?? 'free') as 'free' | 'base' | 'pro',
      name: profile?.name ?? '',
      company: profile?.company ?? '',
    };
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ─── Role guards ──────────────────────────────────────────────────────────────
export function requireRole(minRole: AdminRole) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const rank = ROLE_RANK[req.user?.role ?? 'user'];
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: `Requires ${minRole} access or higher` });
    }
    next();
  };
}
export const requireAdmin     = requireRole('admin');
export const requireSuperuser = requireRole('superuser');

// ─── Tier guards ──────────────────────────────────────────────────────────────
export function requirePro(req: AuthRequest, res: Response, next: NextFunction) {
  if (ROLE_RANK[req.user?.role ?? 'user'] >= ROLE_RANK['admin']) return next();
  if (req.user?.tier !== 'pro') {
    return res.status(403).json({ error: 'Pro subscription required', upgradeUrl: '/paywall' });
  }
  next();
}
export function requireBase(req: AuthRequest, res: Response, next: NextFunction) {
  if (ROLE_RANK[req.user?.role ?? 'user'] >= ROLE_RANK['admin']) return next();
  if (req.user?.tier === 'free') {
    return res.status(403).json({ error: 'Subscription required', upgradeUrl: '/paywall' });
  }
  next();
}
