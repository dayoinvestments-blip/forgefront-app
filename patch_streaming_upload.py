#!/usr/bin/env python3
"""
ForgeFront -- Streaming CSV uploader (fixes Out of Memory on 218MB file)
Run from repo root: python patch_streaming_upload.py

The old bulkProcess() called file.arrayBuffer() which loads the ENTIRE
218MB file into memory at once, then builds a giant string, then parses
all 80k rows into objects simultaneously -> browser runs out of memory.

This rewrite streams the file:
  - reads the file in 4MB slices via file.slice() + FileReader
  - parses complete CSV rows incrementally, keeping only a small buffer
  - uploads each batch of 400 rows to Supabase, then discards it
  - memory stays flat regardless of file size

Replaces bulkProcess(); keeps bulkHandleDrop/bulkHandleFile and the
BULK_COL_MAP. No HTML changes needed.
"""

with open('index.html', 'r', encoding='utf-8') as f:
    h = f.read()

# Find and replace the entire bulkProcess function.
# We anchor from "async function bulkProcess(file) {" to the matching close
# before the next function. Since braces are hard to match textually, we
# replace from the function start to the start of the next known function.

import re

start_marker = "async function bulkProcess(file) {"
# The function that follows bulkProcess in the bulk JS block is the SAM counter
# section comment. We find bulkProcess start and replace up to that comment.
start_idx = h.find(start_marker)
if start_idx == -1:
    print("  FAIL bulkProcess not found")
    raise SystemExit(1)

# Find the end: the next "// \u2500\u2500 SAM.gov daily call counter" after bulkProcess,
# OR the next top-level "async function" / "function " after it.
after = h[start_idx:]
# End at the SAM counter comment that we inserted the bulk JS before
end_rel = after.find("// \u2500\u2500 SAM.gov daily call counter")
if end_rel == -1:
    # fallback: find next "\nfunction " or "\nasync function " at column 0
    m = re.search(r"\n(async function |function )", after[10:])
    if m:
        end_rel = m.start() + 10
    else:
        print("  FAIL could not find end of bulkProcess")
        raise SystemExit(1)

old_block = h[start_idx:start_idx + end_rel]

NEW_BLOCK = r"""async function bulkProcess(file) {
  var prog = document.getElementById('bulk-progress');
  var bar  = document.getElementById('bulk-bar');
  var stat = document.getElementById('bulk-status');
  var pct  = document.getElementById('bulk-pct');
  var det  = document.getElementById('bulk-detail');
  var res  = document.getElementById('bulk-result');
  prog.style.display = 'block'; res.innerHTML = '';
  bar.style.width = '0%'; pct.textContent = '0%';
  stat.textContent = 'Starting...';

  var SLICE = 4 * 1024 * 1024;   // read 4MB at a time
  var BATCH = 400;               // upsert 400 rows per request
  var totalSize = file.size;
  var offset = 0;
  var leftover = '';             // partial line carried between slices
  var headers = null;
  var colIdx = {};
  var batch = [];
  var inserted = 0;
  var errors = 0;
  var seenHeader = false;

  // --- incremental CSV line parser state (handles quoted fields) ---
  function parseLine(line) {
    var out = [], field = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i], n = line[i+1];
      if (inQ) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { out.push(field); field = ''; }
        else field += c;
      }
    }
    out.push(field);
    return out;
  }

  // A row may span multiple physical lines if a quoted field contains newlines.
  // We detect an "open quote" carry to join lines correctly.
  var rowBuf = '';
  function quotesBalanced(s) {
    var count = 0;
    for (var i = 0; i < s.length; i++) if (s[i] === '"') count++;
    return count % 2 === 0;
  }

  function mapRow(cells) {
    var rec = { synced_at: new Date().toISOString() };
    Object.keys(BULK_COL_MAP).forEach(function(csvCol) {
      var dbCol = BULK_COL_MAP[csvCol];
      var idx = colIdx[csvCol];
      if (idx === undefined) return;
      var val = (cells[idx] || '').trim();
      if (!val || val === 'nan' || val === 'NULL' || val === 'null') { rec[dbCol] = null; return; }
      if (dbCol === 'active') { rec[dbCol] = val.toLowerCase() === 'yes'; return; }
      rec[dbCol] = val;
    });
    var desc = rec['inline_desc'] || '';
    delete rec['inline_desc'];
    if (desc && desc.indexOf('http') === 0) { rec['description_url'] = desc; rec['inline_description'] = null; }
    else { rec['description_url'] = ''; rec['inline_description'] = desc || null; }
    return rec.notice_id ? rec : null;
  }

  async function flushBatch() {
    if (!batch.length) return;
    var chunk = batch;
    batch = [];
    try {
      var result = await sb.from('opportunities_cache').upsert(chunk, { onConflict: 'notice_id', ignoreDuplicates: false });
      if (result.error) { errors++; det.textContent = 'Batch warning: ' + result.error.message; }
      else inserted += chunk.length;
    } catch (e) { errors++; det.textContent = 'Batch error: ' + e.message; }
  }

  function readSlice(start) {
    return new Promise(function(resolve, reject) {
      var blob = file.slice(start, Math.min(start + SLICE, totalSize));
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error); };
      // read as latin-1 (binary string) to match SAM.gov encoding
      reader.readAsBinaryString(blob);
    });
  }

  async function processLines(textChunk, isLast) {
    var data = leftover + textChunk;
    var lines = data.split(/\r\n|\n|\r/);
    // keep the last (possibly partial) line as leftover unless this is the final chunk
    leftover = isLast ? '' : lines.pop();

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      // join multi-line quoted rows
      if (rowBuf) { rowBuf += '\n' + line; }
      else { rowBuf = line; }
      if (!quotesBalanced(rowBuf)) { continue; } // row continues on next line
      var full = rowBuf; rowBuf = '';
      if (full === '') continue;

      var cells = parseLine(full);
      if (!seenHeader) {
        headers = cells.map(function(x){ return x.trim().replace(/^\uFEFF/, ''); });
        headers.forEach(function(hh, i){ colIdx[hh] = i; });
        var missing = ['NoticeId','Title','SetASideCode'].filter(function(c){ return colIdx[c] === undefined; });
        if (missing.length) { throw new Error('Wrong file format - missing: ' + missing.join(', ')); }
        seenHeader = true;
        continue;
      }
      if (cells.length < 2) continue;
      var rec = mapRow(cells);
      if (rec) batch.push(rec);
      if (batch.length >= BATCH) { await flushBatch(); }
    }
  }

  try {
    while (offset < totalSize) {
      var isLast = (offset + SLICE) >= totalSize;
      var textChunk = await readSlice(offset);
      await processLines(textChunk, isLast);
      offset += SLICE;
      var pctDone = Math.min(99, Math.round((offset / totalSize) * 100));
      bar.style.width = pctDone + '%'; pct.textContent = pctDone + '%';
      stat.textContent = 'Processing ' + (offset/1024/1024).toFixed(0) + ' / ' + (totalSize/1024/1024).toFixed(0) + ' MB';
      det.textContent = inserted.toLocaleString() + ' contracts loaded so far';
      // yield to the browser so the tab stays responsive and memory is reclaimed
      await new Promise(function(r){ setTimeout(r, 0); });
    }
    // process any final leftover line
    if (leftover && seenHeader) { await processLines('', true); }
    await flushBatch();

    bar.style.width = '100%'; pct.textContent = '100%';
    stat.textContent = 'Complete';
    det.textContent = '';
    res.innerHTML = '<div style="color:var(--ac);font-weight:600;font-size:13px;padding:10px 0">'
      + '&#9989; ' + inserted.toLocaleString() + ' contracts loaded'
      + (errors ? ' (' + errors + ' batch warnings)' : '')
      + '. Users now search the cached database.</div>';
    if (typeof toast === 'function') toast('Bulk upload complete: ' + inserted.toLocaleString() + ' contracts', 's');

  } catch (e) {
    stat.textContent = 'Error';
    res.innerHTML = '<div style="color:#E05050;font-size:12px">&#10060; ' + e.message + '</div>';
    if (typeof toast === 'function') toast('Bulk upload failed: ' + e.message, 'e');
  }
}

"""

h = h.replace(old_block, NEW_BLOCK, 1)
print("  OK  bulkProcess rewritten to stream (memory-safe)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(h)

print("\n\u2713 Streaming uploader ready. Run:")
print("  git add -A")
print('  git commit -m "fix: stream CSV upload in chunks to avoid out-of-memory"')
print("  git push")
