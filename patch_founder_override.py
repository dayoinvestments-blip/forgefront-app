#!/usr/bin/env python3
"""
ForgeFront -- Restore founder superuser access
Run from repo root: python patch_founder_override.py

Problem: loadProfile() falls back to {role:'user',tier:'free'} whenever the
Supabase profile row is missing/empty or the query is slow, which demotes the
founder to a regular free user (losing admin + command access).

Fix: hardcode the founder email(s) as superuser/command in loadProfile, so the
founder ALWAYS has full access regardless of what Supabase returns.
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

OLD = """async function loadProfile() {
  const {data}=await sb.from('profiles').select('*').eq('id',A.user.id).single();
  A.profile=data||{role:'user',tier:'free',name:A.user.email,company:''};
}"""

NEW = """async function loadProfile() {
  const {data}=await sb.from('profiles').select('*').eq('id',A.user.id).single();
  A.profile=data||{role:'user',tier:'free',name:A.user.email,company:''};
  // Founder override — these accounts always get superuser + command access,
  // regardless of what the profiles table returns.
  var FOUNDER_EMAILS = ['darrelltwillis@hotmail.com','darrelltwillis@gmail.com','dayoinvestments@gmail.com'];
  var email = (A.user && A.user.email || '').toLowerCase();
  if (FOUNDER_EMAILS.indexOf(email) !== -1) {
    A.profile = A.profile || {};
    A.profile.role = 'superuser';
    A.profile.tier = 'command';
    if (!A.profile.name) A.profile.name = A.user.email;
  }
}"""

if OLD in h:
    h = h.replace(OLD, NEW, 1)
    print("  OK  founder superuser override added")
else:
    print("  FAIL loadProfile not found exactly")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print("\n\u2713 Founder access restored. Run:")
print("  git add -A")
print('  git commit -m "fix: founder email override restores superuser/command access"')
print("  git push")
