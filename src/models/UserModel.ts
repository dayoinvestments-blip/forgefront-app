import { query, withTransaction } from '../db/pool';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

export interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  role: 'superuser' | 'admin' | 'support' | 'user';
  tier: 'free' | 'base' | 'pro';
  tierExpiresAt: string | null;
  sdvosb: boolean;
  naicsCodes: string[];
  setAsides: string[];
  preferredStates: string[];
  status: 'active' | 'suspended' | 'deleted';
  stripeCustomerId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

// ─── Row → User ───────────────────────────────────────────────────────────────
function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    phone: row.phone,
    role: row.role,
    tier: row.tier,
    tierExpiresAt: row.tier_expires_at,
    sdvosb: row.sdvosb,
    naicsCodes: row.naics_codes || [],
    setAsides: row.set_asides || [],
    preferredStates: row.preferred_states || [],
    status: row.status,
    stripeCustomerId: row.stripe_customer_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

const SELECT_COLS = `
  id, email, name, company, phone, role, tier, tier_expires_at,
  sdvosb, naics_codes, set_asides, preferred_states, status,
  stripe_customer_id, last_login_at, created_at
`;

// ─── Queries ──────────────────────────────────────────────────────────────────
export const UserModel = {

  async findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const { rows } = await query(
      `SELECT ${SELECT_COLS}, password_hash FROM users WHERE email = $1 AND status != 'deleted'`,
      [email.toLowerCase().trim()]
    );
    if (!rows[0]) return null;
    return { ...rowToUser(rows[0]), passwordHash: rows[0].password_hash };
  },

  async findById(id: string): Promise<User | null> {
    const { rows } = await query(
      `SELECT ${SELECT_COLS} FROM users WHERE id = $1 AND status != 'deleted'`,
      [id]
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async create(data: {
    email: string; password: string; name: string;
    company: string; sdvosb?: boolean;
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const { rows } = await query(
      `INSERT INTO users (id,email,password_hash,name,company,sdvosb,naics_codes,set_asides)
       VALUES ($1,$2,$3,$4,$5,$6,ARRAY['332312'],ARRAY['SDVOSB'])
       RETURNING ${SELECT_COLS}`,
      [uuid(), data.email.toLowerCase().trim(), passwordHash, data.name, data.company, data.sdvosb ?? true]
    );
    return rowToUser(rows[0]);
  },

  async verifyPassword(user: { passwordHash: string }, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  },

  async updateLastLogin(id: string): Promise<void> {
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
  },

  async updateProfile(id: string, data: Partial<{
    name: string; company: string; phone: string;
    naicsCodes: string[]; setAsides: string[]; preferredStates: string[];
  }>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (data.name)             { fields.push(`name=$${i++}`);              values.push(data.name); }
    if (data.company)          { fields.push(`company=$${i++}`);           values.push(data.company); }
    if (data.phone !== undefined) { fields.push(`phone=$${i++}`);          values.push(data.phone); }
    if (data.naicsCodes)       { fields.push(`naics_codes=$${i++}`);       values.push(data.naicsCodes); }
    if (data.setAsides)        { fields.push(`set_asides=$${i++}`);        values.push(data.setAsides); }
    if (data.preferredStates)  { fields.push(`preferred_states=$${i++}`);  values.push(data.preferredStates); }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${i} RETURNING ${SELECT_COLS}`,
      values
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async changePassword(id: string, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
  },

  async updateRole(id: string, role: User['role']): Promise<void> {
    await query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
  },

  async updateTier(id: string, tier: User['tier'], expiresAt?: Date): Promise<void> {
    await query(
      'UPDATE users SET tier=$1, tier_expires_at=$2 WHERE id=$3',
      [tier, expiresAt || null, id]
    );
  },

  async updateStatus(id: string, status: User['status']): Promise<void> {
    await query('UPDATE users SET status=$1 WHERE id=$2', [status, id]);
  },

  async updateStripeCustomer(id: string, stripeCustomerId: string): Promise<void> {
    await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [stripeCustomerId, id]);
  },

  async list(opts: { limit?: number; offset?: number; role?: string; tier?: string; search?: string } = {}): Promise<{ users: User[]; total: number }> {
    const { limit = 50, offset = 0, role, tier, search } = opts;
    const where: string[] = ["status != 'deleted'"];
    const vals: any[] = [];
    let i = 1;
    if (role)   { where.push(`role=$${i++}`);   vals.push(role); }
    if (tier)   { where.push(`tier=$${i++}`);   vals.push(tier); }
    if (search) { where.push(`(name ILIKE $${i} OR email ILIKE $${i} OR company ILIKE $${i})`); vals.push(`%${search}%`); i++; }
    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await query(`SELECT COUNT(*) FROM users ${whereStr}`, vals);
    const { rows } = await query(
      `SELECT ${SELECT_COLS} FROM users ${whereStr} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...vals, limit, offset]
    );
    return { users: rows.map(rowToUser), total: parseInt(countRes.rows[0].count) };
  },

  async getMetrics(): Promise<{
    total: number; byTier: Record<string, number>; byRole: Record<string, number>;
    newLast30d: number; activeToday: number;
  }> {
    const [total, byTier, byRole, newUsers, activeToday] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE status='active'`),
      query(`SELECT tier, COUNT(*) as count FROM users WHERE status='active' GROUP BY tier`),
      query(`SELECT role, COUNT(*) as count FROM users WHERE status='active' GROUP BY role`),
      query(`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
      query(`SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '24 hours'`),
    ]);
    const tierMap: Record<string, number> = { free: 0, base: 0, pro: 0 };
    byTier.rows.forEach((r: any) => { tierMap[r.tier] = parseInt(r.count); });
    const roleMap: Record<string, number> = { user: 0, support: 0, admin: 0, superuser: 0 };
    byRole.rows.forEach((r: any) => { roleMap[r.role] = parseInt(r.count); });
    return {
      total: parseInt(total.rows[0].count),
      byTier: tierMap,
      byRole: roleMap,
      newLast30d: parseInt(newUsers.rows[0].count),
      activeToday: parseInt(activeToday.rows[0].count),
    };
  },
};
