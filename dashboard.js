/* Style Spy – design kit dashboard */
const $ = (s, r = document) => r.querySelector(s);
const { esc } = SS;
let kits = [];
let query = '';

const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

async function load() {
  kits = await SS.getKits();
  render();
}

function render() {
  const q = query.trim().toLowerCase();
  const list = kits.filter(k => !q || k.name.toLowerCase().includes(q) || (k.site.hostname || '').toLowerCase().includes(q) || (k.site.url || '').toLowerCase().includes(q));
  $('#summary').innerHTML = kits.length
    ? `<b>${kits.length}</b> saved ${kits.length === 1 ? 'kit' : 'kits'}${q ? ` · ${list.length} matching “${esc(query)}”` : ''}`
    : 'Your design kits live here.';

  if (!list.length) {
    $('#grid').innerHTML = kits.length
      ? '<div class="empty"><h2>No kits match that search</h2>Try a different name or website.</div>'
      : `<div class="empty"><h2>No design kits yet</h2>Open any website, click the Style Spy icon and choose “Save as kit”.<br>Colours and typography are saved together and show up here.</div>`;
    return;
  }

  $('#grid').innerHTML = list.map(k => {
    const pal = (k.palette || []).slice(0, 8);
    const heading = SS.firstFont(k.type.headingFont || k.type.bodyFont);
    const body = SS.firstFont(k.type.bodyFont);
    return `<article class="kit" data-id="${k.id}">
      <div class="pal">${pal.map(c => `<i style="background:${c.hex}" title="${c.hex}"></i>`).join('') || '<i style="background:#1a2450"></i>'}</div>
      <div class="body">
        <h2 title="${esc(k.name)}">${esc(k.name)}</h2>
        <div class="site">${esc(k.site.title || '')}</div>
        <a href="${esc(k.site.url)}" target="_blank" rel="noopener noreferrer" title="${esc(k.site.url)}">${esc(k.site.hostname)} · ${esc(k.site.url)}</a>
        <div class="specimen" style="margin-top:12px">
          <span class="aa" style="font-family:${esc(k.type.headingFont || 'inherit')}">Aa</span>
          <div><b style="font-family:${esc(k.type.headingFont || 'inherit')}">${esc(heading || 'No heading font')}</b>Body: ${esc(body || '–')} · ${esc(k.type.bodySize || '–')}</div>
        </div>
        <div class="tags">
          <span class="tag w">${(k.palette || []).length} colours</span>
          <span class="tag s">${(k.fonts || []).length} fonts</span>
          <span class="tag">${fmtDate(k.updatedAt)}</span>
        </div>
      </div>
      <div class="acts">
        <button class="btn small primary" data-act="export">Export CSS</button>
        <button class="btn small" data-act="copy">Copy CSS</button>
        <button class="btn small" data-act="edit">Edit</button>
        <button class="btn small" data-act="rename">Rename</button>
        <button class="btn small" data-act="dup">Duplicate</button>
        <button class="btn small danger" data-act="delete">Delete</button>
      </div></article>`;
  }).join('');
}

/* ---------- modals ---------- */
function modal(html, wide) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  return { o, close };
}

function renameKit(kit) {
  const m = modal(`<h2>Rename kit</h2><p class="sub">Currently “${esc(kit.name)}”</p>
    <label class="field"><span>Kit name</span><input class="input" id="rn" maxlength="60" value="${esc(kit.name)}"></label>
    <div class="actions"><button class="btn" id="no">Cancel</button><button class="btn primary" id="yes">Rename</button></div>`);
  const input = $('#rn', m.o);
  input.focus(); input.select();
  const go = async () => {
    const v = input.value.trim();
    if (!v) { SS.toast('Name can’t be empty', 'err'); return; }
    kit.name = v; kit.updatedAt = Date.now();
    await SS.setKits(kits); m.close(); render(); SS.toast('Renamed');
  };
  $('#no', m.o).onclick = m.close;
  $('#yes', m.o).onclick = go;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

function deleteKit(kit) {
  const m = modal(`<h2>Delete “${esc(kit.name)}”?</h2><p class="sub">This removes the kit from this browser. It can’t be undone.</p>
    <div class="actions"><button class="btn" id="no">Keep kit</button><button class="btn danger" id="yes">Delete kit</button></div>`);
  $('#no', m.o).onclick = m.close;
  $('#yes', m.o).onclick = async () => {
    kits = kits.filter(k => k.id !== kit.id);
    await SS.setKits(kits); m.close(); render(); SS.toast('Kit deleted');
  };
}

async function duplicateKit(kit) {
  const copy = JSON.parse(JSON.stringify(kit));
  copy.id = SS.uid();
  copy.name = kit.name + ' (copy)';
  copy.createdAt = copy.updatedAt = Date.now();
  kits.unshift(copy);
  await SS.setKits(kits);
  render();
  SS.toast('Kit duplicated');
}

const TOKEN_LABELS = [['primary', 'Primary'], ['secondary', 'Secondary'], ['accent', 'Accent'], ['background', 'Background'],
  ['surface', 'Surface'], ['text', 'Text'], ['textMuted', 'Muted text'], ['border', 'Border']];
const TYPE_FIELDS = [['headingFont', 'Heading font'], ['bodyFont', 'Body font'], ['buttonFont', 'Button font'],
  ['headingSize', 'Heading size'], ['bodySize', 'Body size'], ['buttonSize', 'Button size'],
  ['headingWeight', 'Heading weight'], ['bodyWeight', 'Body weight'], ['headingLineHeight', 'Heading line-height'], ['bodyLineHeight', 'Body line-height']];

function editKit(kit) {
  const draft = JSON.parse(JSON.stringify(kit));
  const m = modal(`
    <h2>Edit kit</h2><p class="sub">Changes update the CSS preview live. ${esc(kit.site.hostname)}</p>
    <div class="edit-grid">
      <div class="scroll">
        <label class="field"><span>Kit name</span><input class="input" id="e-name" maxlength="60"></label>
        <h3>Colour variables</h3>
        ${TOKEN_LABELS.map(([k, l]) => `<div class="tok"><label for="c-${k}">${l}</label>
          <input type="color" id="c-${k}" data-tok="${k}" aria-label="${l} colour"><input class="input" data-tokhex="${k}" maxlength="7" spellcheck="false"></div>`).join('')}
        <h3>Typography variables</h3>
        ${TYPE_FIELDS.map(([k, l]) => `<div class="tok"><label>${l}</label><input class="input" data-type="${k}" spellcheck="false"></div>`).join('')}
        <h3>Palette <span style="font-weight:400">(remove colours or add your own)</span></h3>
        <div class="pal-edit" id="pal"></div>
        <div class="tok" style="margin-top:10px"><input type="color" id="newColor" value="#8B5CF6" aria-label="New colour"><button class="btn small" id="addColor">Add to palette</button></div>
      </div>
      <pre class="code" id="prev"></pre>
    </div>
    <div class="actions"><button class="btn" id="no">Cancel</button><button class="btn" id="dl">Export CSS</button><button class="btn primary" id="yes">Save changes</button></div>`, true);
  const o = m.o;
  const prev = () => { $('#prev', o).textContent = SS.buildCSS(draft); };
  const palette = () => {
    $('#pal', o).innerHTML = draft.palette.map((c, i) =>
      `<span class="pchip"><i style="background:${c.hex}"></i>${c.hex}<button data-rm="${i}" aria-label="Remove ${c.hex}">×</button></span>`).join('') || '<span style="color:var(--muted)">No colours</span>';
  };
  const name = $('#e-name', o);
  name.value = draft.name;
  name.oninput = () => { draft.name = name.value; prev(); };

  o.querySelectorAll('[data-tok]').forEach(inp => {
    const k = inp.dataset.tok;
    const hexInp = $(`[data-tokhex="${k}"]`, o);
    inp.value = (draft.tokens[k] || '#000000').toLowerCase();
    hexInp.value = draft.tokens[k] || '';
    inp.oninput = () => { draft.tokens[k] = inp.value.toUpperCase(); hexInp.value = draft.tokens[k]; prev(); };
    hexInp.oninput = () => {
      const v = hexInp.value.trim();
      const full = v.startsWith('#') ? v : '#' + v;
      if (SS.isHex(full)) { draft.tokens[k] = SS.normHex(full); inp.value = draft.tokens[k].toLowerCase(); prev(); }
    };
  });
  o.querySelectorAll('[data-type]').forEach(inp => {
    const k = inp.dataset.type;
    inp.value = draft.type[k] || '';
    inp.oninput = () => { draft.type[k] = inp.value; prev(); };
  });
  o.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { draft.palette.splice(+rm.dataset.rm, 1); palette(); prev(); }
  });
  $('#addColor', o).onclick = () => {
    const hex = $('#newColor', o).value.toUpperCase();
    if (draft.palette.some(c => c.hex === hex)) { SS.toast('Already in palette', 'err'); return; }
    draft.palette.push({ hex, count: 0, roles: {} });
    palette(); prev();
  };
  $('#no', o).onclick = m.close;
  $('#dl', o).onclick = () => SS.download(`style-spy-${SS.slug(draft.name)}.css`, SS.buildCSS(draft));
  $('#yes', o).onclick = async () => {
    if (!draft.name.trim()) { SS.toast('Name can’t be empty', 'err'); return; }
    draft.name = draft.name.trim();
    draft.updatedAt = Date.now();
    const i = kits.findIndex(k => k.id === kit.id);
    if (i > -1) kits[i] = draft;
    await SS.setKits(kits);
    m.close(); render(); SS.toast('Kit updated');
  };
  palette(); prev();
}

/* ---------- events ---------- */
$('#grid').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const kit = kits.find(k => k.id === b.closest('.kit').dataset.id);
  if (!kit) return;
  switch (b.dataset.act) {
    case 'export': SS.download(`style-spy-${SS.slug(kit.name)}.css`, SS.buildCSS(kit)); SS.toast('CSS file downloaded'); break;
    case 'copy': SS.copyWithToast(SS.buildCSS(kit), 'CSS variables'); break;
    case 'edit': editKit(kit); break;
    case 'rename': renameKit(kit); break;
    case 'dup': duplicateKit(kit); break;
    case 'delete': deleteKit(kit); break;
  }
});
$('#search').addEventListener('input', e => { query = e.target.value; render(); });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.kits) { kits = c.kits.newValue || []; render(); } });
load();
