#!/usr/bin/env python3
"""
ForgeFront — Admin bulk upload: SAM.gov ContractOpportunitiesFullCSV.csv
Run from repo root: python patch_bulk_upload.py

Adds a "Data" tab to the admin page with a drag-and-drop bulk importer.
Drop the daily SAM.gov CSV in and it upserts all 80k+ opportunities into
the opportunities_cache Supabase table in 500-row chunks.

PREREQUISITE: run opportunities_cache.sql in Supabase first.
"""
import os, re

def repl(s, old, new, label, required=True):
    if old in s:
        print(f"  OK  {label}")
        return s.replace(old, new, 1), True
    print(f"  {'FAIL' if required else 'WARN'} not found: {label}")
    return s, False

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

# 1. Add a "Data" tab to the admin tab bar
h, _ = repl(h,
'<button class="admin-tab" onclick="adminTab(\'audit\',this)"',
'<button class="admin-tab" onclick="adminTab(\'data\',this)" style="padding:10px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--t3);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;white-space:nowrap">Data Import</button>\n          <button class="admin-tab" onclick="adminTab(\'audit\',this)"',
"Data Import tab added to admin")

# 4. Add bulk upload JS functions (before the SAM counter section)
BULK_JS = r"""
// ── Bulk CSV uploader ─────────────────────────────────────────────────────────
var BULK_COL_MAP = {
  'NoticeId':               'notice_id',
  'Title':                  'title',
  'Sol#':                   'solicitation_number',
  'Department/Ind.Agency':  'agency',
  'Sub-Tier':               'sub_tier',
  'Office':                 'office',
  'PostedDate':             'posted_date',
  'Type':                   'ptype',
  'SetASideCode':           'set_aside_code',
  'SetASide':               'set_aside_desc',
  'ResponseDeadLine':       'response_deadline',
  'NaicsCode':              'naics_code',
  'PopState':               'state',
  'PopCity':                'city',
  'Active':                 'active',
  'PrimaryContactFullname': 'poc_name',
  'PrimaryContactEmail':    'poc_email',
  'PrimaryContactPhone':    'poc_phone',
  'Link':                   'ui_link',
  'Description':            'inline_desc'
};

function bulkHandleDrop(ev) {
  ev.preventDefault();
  document.getElementById('bulk-drop-zone').style.borderColor = 'var(--bd)';
  var file = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (file) bulkProcess(file);
}
function bulkHandleFile(ev) {
  var file = ev.target.files && ev.target.files[0];
  if (file) bulkProcess(file);
}

function bulkParseCSV(text) {
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r' && n === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (c === '\n' || c === '\r') { row.push(field); field = ''; rows.push(row); row = []; }
      else { field += c; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function bulkProcess(file) {
  var prog = document.getElementById('bulk-progress');
  var bar  = document.getElementById('bulk-bar');
  var stat = document.getElementById('bulk-status');
  var pct  = document.getElementById('bulk-pct');
  var det  = document.getElementById('bulk-detail');
  var res  = document.getElementById('bulk-result');
  prog.style.display = 'block'; res.innerHTML = '';
  bar.style.width = '0%'; pct.textContent = '0%';
  stat.textContent = 'Reading file...';

  try {
    var buf = await file.arrayBuffer();
    var bytes = new Uint8Array(buf);
    // SAM.gov CSV is latin-1 encoded
    var latin1 = '';
    var CHUNK_SIZE = 65536;
    for (var b = 0; b < bytes.length; b += CHUNK_SIZE) {
      var slice = bytes.subarray(b, Math.min(b + CHUNK_SIZE, bytes.length));
      latin1 += String.fromCharCode.apply(null, slice);
    }
    stat.textContent = 'Parsing CSV (' + (bytes.length / 1024 / 1024).toFixed(1) + ' MB)...';
    bar.style.width = '5%'; pct.textContent = '5%';

    var rows = bulkParseCSV(latin1);
    if (rows.length < 2) { throw new Error('No data rows found'); }

    var headers = rows[0].map(function(hdr) { return hdr.trim().replace(/^\uFEFF/, ''); });
    var colIdx = {};
    headers.forEach(function(hdr, i) { colIdx[hdr] = i; });

    var missing = ['NoticeId', 'Title', 'SetASideCode'].filter(function(c) { return colIdx[c] === undefined; });
    if (missing.length) { throw new Error('Wrong file format — missing: ' + missing.join(', ')); }

    var dataRows = rows.slice(1).filter(function(r) {
      return r.length > 1 && r[colIdx['NoticeId']] && r[colIdx['NoticeId']].trim();
    });
    var total = dataRows.length;
    det.textContent = total.toLocaleString() + ' rows found';
    bar.style.width = '10%'; pct.textContent = '10%';

    function mapRow(r) {
      var rec = { synced_at: new Date().toISOString() };
      Object.keys(BULK_COL_MAP).forEach(function(csvCol) {
        var dbCol = BULK_COL_MAP[csvCol];
        var idx = colIdx[csvCol];
        if (idx === undefined) return;
        var val = (r[idx] || '').trim();
        if (!val || val === 'nan' || val === 'NULL' || val === 'null') { rec[dbCol] = null; return; }
        if (dbCol === 'active') { rec[dbCol] = val.toLowerCase() === 'yes'; return; }
        rec[dbCol] = val;
      });
      // Map inline_desc to description_url only if it looks like a URL
      var desc = rec['inline_desc'] || '';
      delete rec['inline_desc'];
      if (desc && desc.indexOf('http') === 0) { rec['description_url'] = desc; }
      else { rec['description_url'] = ''; }
      return rec.notice_id ? rec : null;
    }

    var records = dataRows.map(mapRow).filter(Boolean);
    var CHUNK = 400;
    var inserted = 0;
    var errors = 0;

    for (var start = 0; start < records.length; start += CHUNK) {
      var chunk = records.slice(start, Math.min(start + CHUNK, records.length));
      var pctDone = Math.round(10 + (start / records.length) * 85);
      bar.style.width = pctDone + '%'; pct.textContent = pctDone + '%';
      stat.textContent = 'Uploading ' + (start + 1).toLocaleString() + '\u2013' +
        Math.min(start + CHUNK, records.length).toLocaleString() + ' of ' + records.length.toLocaleString();

      var result = await sb.from('opportunities_cache').upsert(chunk, { onConflict: 'notice_id', ignoreDuplicates: false });
      if (result.error) {
        errors++;
        det.textContent = 'Warning on batch ' + (start + 1) + ': ' + result.error.message;
      } else {
        inserted += chunk.length;
      }
    }

    bar.style.width = '100%'; pct.textContent = '100%';
    stat.textContent = 'Complete';
    det.textContent = '';
    res.innerHTML = '<div style="color:var(--ac);font-weight:600;font-size:13px;padding:10px 0">' +
      '\u2705 ' + inserted.toLocaleString() + ' contracts loaded' +
      (errors ? ' (' + errors + ' batch warnings — check console)' : '') + '. ' +
      'Users now search the cached database.</div>';
    toast('Bulk upload complete: ' + inserted.toLocaleString() + ' contracts loaded', 's');

  } catch (e) {
    bar.style.width = '0%'; pct.textContent = '0%';
    stat.textContent = 'Error';
    res.innerHTML = '<div style="color:#E05050;font-size:12px">\u274C ' + e.message + '</div>';
    toast('Bulk upload failed: ' + e.message, 'e');
  }
}

"""

# Insert before the SAM counter section
h, _ = repl(h,
'// ── SAM.gov daily call counter',
BULK_JS + '// ── SAM.gov daily call counter',
"bulk upload JS inserted")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print('\n\u2713 Bulk upload patch applied. Run:')
print('  git add -A')
print('  git commit -m "feat: admin bulk upload for SAM.gov ContractOpportunitiesFullCSV"')
print('  git push')
print('\nPREREQUISITE: run opportunities_cache.sql in Supabase first.')

# NOTE: The above script handles the JS and tab button.
# The panel HTML is injected via a separate content-based replacement below.
# This block runs independently and is safe to run on any version of the file.

def inject_panel(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    ANCHOR = '          <div id="adm-audit-list"><div class="sk" style="height:200px;border-radius:var(--rl)"></div></div>\n        </div>\n\n      </div>'
    
    PANEL = '''          <div id="adm-audit-list"><div class="sk" style="height:200px;border-radius:var(--rl)"></div></div>
        </div>

      <!-- DATA IMPORT TAB -->
      <div id="admin-data" class="admin-panel" style="display:none">
        <div class="cl" style="border:2px dashed rgba(232,160,32,.4);background:rgba(232,160,32,.04)">
          <div style="font-size:15px;font-weight:700;color:var(--ac);margin-bottom:4px">&#128229; Bulk Contract Data Import</div>
          <div style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:12px">Download <a href="https://sam.gov/data-services/Contract%20Opportunities/datagov?privacy=Public" target="_blank" style="color:var(--ac)">ContractOpportunitiesFullCSV.csv</a> from SAM.gov (free, ~80k active contracts, no login needed). Drop it here to refresh the full contract database. No API key used &mdash; no rate limits.</div>
          <div id="bulk-drop-zone" style="border:2px dashed var(--bd);border-radius:var(--r);padding:36px;text-align:center;cursor:pointer;margin-bottom:12px" ondragover="event.preventDefault();document.getElementById(\'bulk-drop-zone\').style.borderColor=\'var(--ac)\'" ondragleave="document.getElementById(\'bulk-drop-zone\').style.borderColor=\'var(--bd)\'" ondrop="bulkHandleDrop(event)">
            <div style="font-size:36px;margin-bottom:8px">&#128196;</div>
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Drop ContractOpportunitiesFullCSV.csv here</div>
            <div style="font-size:12px;color:var(--t3)">or <label style="color:var(--ac);cursor:pointer;text-decoration:underline">click to browse<input type="file" accept=".csv" style="display:none" onchange="bulkHandleFile(event)"></label></div>
          </div>
          <div id="bulk-progress" style="display:none;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--t2);margin-bottom:4px"><span id="bulk-status">Processing...</span><span id="bulk-pct">0%</span></div>
            <div style="background:var(--s2);border-radius:4px;height:8px;overflow:hidden"><div id="bulk-bar" style="background:var(--ac);height:100%;width:0%;transition:width .4s"></div></div>
            <div id="bulk-detail" style="font-size:11px;color:var(--t3);margin-top:4px"></div>
          </div>
          <div id="bulk-result"></div>
        </div>
      </div>

      </div>'''
    
    if ANCHOR in content:
        content = content.replace(ANCHOR, PANEL, 1)
        print("  OK  Data Import panel injected into admin section")
    else:
        print("  WARN Data panel anchor not found — panel not injected (add manually)")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

inject_panel('index.html')
