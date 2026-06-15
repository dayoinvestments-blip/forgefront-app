#!/usr/bin/env python3
"""
ForgeFront -- Fix renderAdmin crash blocking the Data Import panel
Run from repo root: python patch_fix_admin_crash.py

Bug: a second renderAdmin() (defined later, so it wins) references element
IDs that don't exist in the current admin HTML (a-users, a-pro, a-mrr,
admin-users). The very first line throws:
  "Cannot set properties of null (setting 'textContent')"
That crash stops execution before the Data Import tab logic runs, so the
panel renders blank.

Fix: guard every element access with a null check so the function can't
crash. Missing elements are simply skipped.
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

# Replace the body of the SECOND renderAdmin (the crashing one) with a guarded version.
OLD = """async function renderAdmin() {
  const {data:p}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
  const pr=p||[];
  $('a-users').textContent=pr.length;
  $('a-pro').textContent=pr.filter(u=>u.tier==='pro').length;
  $('a-mrr').textContent=`$${pr.filter(u=>u.tier==='pro').length*79+pr.filter(u=>u.tier==='base').length*29}`;
  $('admin-users').innerHTML=pr.map(u=>`
    <tr>
      <td><strong>${u.name||'—'}</strong><br><span style="font-size:11px;color:var(--t3)">${u.email}</span></td>
      <td>${u.company||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;color:var(--ac)">${(u.tier||'free').toUpperCase()}</span></td>
      <td><span class="rb ${rc(u.role)}">${(u.role||'user').toUpperCase()}</span></td>
      <td><button class="btn g sm" onclick="editRole('${u.id}','${u.role}')">Edit</button></td>
    </tr>`).join('')||'<tr><td colspan="5" style="color:var(--t3)">No users</td></tr>';
}"""

NEW = """async function renderAdmin() {
  try {
    const {data:p}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
    const pr=p||[];
    var elU=$('a-users'); if(elU) elU.textContent=pr.length;
    var elP=$('a-pro'); if(elP) elP.textContent=pr.filter(u=>u.tier==='pro').length;
    var elM=$('a-mrr'); if(elM) elM.textContent=`$${pr.filter(u=>u.tier==='pro').length*79+pr.filter(u=>u.tier==='base').length*29}`;
    var elList=$('admin-users');
    if(elList) elList.innerHTML=pr.map(u=>`
      <tr>
        <td><strong>${u.name||'—'}</strong><br><span style="font-size:11px;color:var(--t3)">${u.email}</span></td>
        <td>${u.company||'—'}</td>
        <td><span style="font-size:11px;font-weight:600;color:var(--ac)">${(u.tier||'free').toUpperCase()}</span></td>
        <td><span class="rb ${rc(u.role)}">${(u.role||'user').toUpperCase()}</span></td>
        <td><button class="btn g sm" onclick="editRole('${u.id}','${u.role}')">Edit</button></td>
      </tr>`).join('')||'<tr><td colspan="5" style="color:var(--t3)">No users</td></tr>';
  } catch(e) { console.warn('renderAdmin (legacy) skipped:', e.message); }
}"""

if OLD in h:
    h = h.replace(OLD, NEW, 1)
    print("  OK  crashing renderAdmin guarded")
else:
    print("  FAIL renderAdmin block not found exactly")

# 2. Wire the Data Import panel into adminTab() — it isn't in the switcher list,
#    and our panel is id="admin-data" (not "adm-data"), so the loop misses it.
OLD_TAB = """function adminTab(tab, btn) {
  ['overview','users','comps','revenue','audit'].forEach(function(t) {
    var el = document.getElementById('adm-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });"""
NEW_TAB = """function adminTab(tab, btn) {
  ['overview','users','comps','revenue','audit'].forEach(function(t) {
    var el = document.getElementById('adm-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  // Data Import panel (id="admin-data") — show only when its tab is active
  var dataPanel = document.getElementById('admin-data');
  if (dataPanel) dataPanel.style.display = (tab === 'data') ? 'block' : 'none';"""

if OLD_TAB in h:
    h = h.replace(OLD_TAB, NEW_TAB, 1)
    print("  OK  Data Import panel wired into adminTab")
else:
    print("  FAIL adminTab switcher not found")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print("\n\u2713 Admin crash fixed. Run:")
print("  git add -A")
print('  git commit -m "fix: guard renderAdmin so Data Import panel renders"')
print("  git push")
