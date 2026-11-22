/* Style Spy – popup */
const $ = (s, r = document) => r.querySelector(s);
const { esc } = SS;

const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

const state = { tab: 'colors', filter: 'all', scan: null, tokens: null, kit: null, tabId: null, inspecting: false, error: null };
const view = $('#view');

/* ---------- boot ---------- */
async function init() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('#openDash').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));
  $('#saveKit').addEventListener('click', openSaveModal);
  $('#exportBtn').addEventListener('click', () => setTab('export'));
  view.addEventListener('click', onViewClick);
  refreshKitCount();
  renderLoading();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab.id;
    $('#sitePill').innerHTML = `Inspecting <b>${esc(new URL(tab.url).hostname || tab.url)}</b>`;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const [probe] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__styleSpy.isActive() });
    state.inspecting = !!(probe && probe.result);
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__styleSpy.scan() });
    state.scan = res.result;
    state.tokens = SS.deriveTokens(state.scan);
    state.kit = SS.makeKit(state.scan, state.scan.page.hostname);
  } catch (e) {
    state.error = e;
  }
  render();
}

async function refreshKitCount() {
  $('#kitCount').textContent = (await SS.getKits()).length;
}

function setTab(t) {
  state.tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  render();
}

function render() {
  if (state.error) return renderError();
  if (!state.scan) return renderLoading();
  ({ colors: renderColors, type: renderType, inspect: renderInspect, export: renderExport })[state.tab]();
  view.scrollTop = 0;
}

function renderLoading() {
  view.innerHTML = '<div class="notice"><div class="spinner"></div><h3>Reading the page</h3>Collecting colours and fonts…</div>';
}
function renderError() {
  document.querySelectorAll('footer .btn').forEach(b => (b.disabled = true));
  view.innerHTML = `<div class="notice"><h3>Can't inspect this page</h3>
    Chrome blocks extensions on internal pages (chrome://, the Web Store, PDF viewers). Open a regular website and try again.
    <p style="margin-top:12px;font-size:11px;opacity:.7">${esc((state.error && state.error.message) || '')}</p></div>`;
}

/* ---------- colours ---------- */
function roleBadges(c) {
  const b = [];
  const T = state.tokens.colors;
  if (c.hex === T.primary) b.push('<span class="badge p">Primary</span>');
  else if (c.hex === T.secondary) b.push('<span class="badge p">Secondary</span>');
  if (c.roles.text) b.push('<span class="badge">Text</span>');
  if (c.roles.background) b.push('<span class="badge">Background</span>');
  if (c.roles.border) b.push('<span class="badge">Border</span>');
  if (c.roles.fill && !c.roles.text && !c.roles.background) b.push('<span class="badge">Icon</span>');
  if (SS.isVibrant(c.hex)) b.push('<span class="badge a">Accent</span>');
  return b.join('');
}

function filteredColors() {
  const f = state.filter;
  return state.scan.colors.filter(c => {
    if (f === 'all') return true;
    if (f === 'accent') return SS.isVibrant(c.hex);
    return c.roles[f] > 0;
  });
}

function renderColors() {
  const { colors } = state.scan;
  const T = state.tokens.colors;
  const top = colors.slice(0, 14);
  const strip = top.map(c =>
    `<button style="flex:${c.count};background:${c.hex};color:${SS.textOn(c.hex)}" data-copy="${c.hex}" data-what="${c.hex}" title="${c.hex} · ${c.count} uses"><span>${c.hex.slice(1)}</span></button>`).join('');
  const roles = [['Background', T.background], ['Text', T.text], ['Border', T.border], ['Primary', T.primary], ['Secondary', T.secondary], ['Accent', T.accent]]
    .map(([n, h]) => `<button class="role" data-copy="${h}" data-what="${h}"><i style="background:${h}"></i><div><b>${n}</b><span>${h}</span></div></button>`).join('');
  const filters = [['all', 'All'], ['text', 'Text'], ['background', 'Background'], ['border', 'Border'], ['accent', 'Accent']]
    .map(([k, l]) => `<button class="chip-f ${state.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('');
  const list = filteredColors();
  const max = Math.max(...list.map(c => c.count), 1);
  const rows = list.slice(0, 80).map(c => `
    <div class="color-row" data-copy="${c.hex}" data-what="${c.hex}" title="Click to copy HEX">
      <div class="sw" style="background:${c.hex}"></div>
      <div class="cinfo">
        <div class="hex">${c.hex}</div>
        <div class="vals"><button class="val" data-copy="${SS.fmtRgb(c.hex)}" data-what="RGB">${SS.fmtRgb(c.hex)}</button>
        <button class="val" data-copy="${SS.fmtHsl(c.hex)}" data-what="HSL">${SS.fmtHsl(c.hex)}</button></div>
        <div class="badges">${roleBadges(c)}</div>
      </div>
      <div class="cnt"><b>${c.count}</b><span>uses</span><div class="bar"><i style="width:${Math.max(6, (c.count / max) * 100)}%"></i></div></div>
      <button class="icon-btn" data-copy="${c.hex}" data-what="${c.hex}" title="Copy HEX">${COPY_ICON}</button>
    </div>`).join('');

  view.innerHTML = `
    <div class="section-title">Palette · ${colors.length} colours found on ${state.scan.scanned} elements</div>
    <div class="strip">${strip}</div>
    <div class="section-title">Key roles</div>
    <div class="roles">${roles}</div>
    <div class="chips">${filters}</div>
    ${rows || '<div class="notice">No colours match this filter.</div>'}`;
}

/* ---------- typography ---------- */
const GROUPS = [['heading', 'Headings'], ['paragraph', 'Paragraphs'], ['button', 'Buttons'], ['other', 'Other elements']];

function renderType() {
  const { fonts, styles } = state.scan;
  const fontCards = fonts.map(f => `
    <div class="font-card" data-copy="font-family: ${esc(SS.fmtStack(f.stack))};" data-what="font-family">
      <div class="name" style="font-family:${esc(f.stack)}">${esc(f.family)}</div>
      <div class="stack">${esc(SS.fmtStack(f.stack))}</div>
      <div class="tags">
        <span class="tag">${f.count} elements</span>
        ${f.weights.map(w => `<span class="tag w">${w.w} ×${w.count}</span>`).join('')}
        ${f.sizes.sort((a, b) => b.count - a.count).slice(0, 6).map(s => `<span class="tag s">${s.s} ×${s.count}</span>`).join('')}
      </div>
    </div>`).join('');

  const groups = GROUPS.map(([key, title]) => {
    const list = styles.filter(s => s.group === key);
    if (!list.length) return '';
    const total = list.reduce((n, s) => n + s.count, 0);
    const rows = list.slice(0, 12).map(s => {
      const css = SS.styleCss(s);
      const px = Math.min(parseFloat(s.size), 30);
      return `<div class="style-row" data-copy="${esc(css)}" data-what="CSS">
        <div class="prev" style="font-family:${esc(s.stack)};font-weight:${s.weight};font-size:${px}px;letter-spacing:${s.letterSpacing};line-height:1.2">${key === 'button' ? 'Get started' : 'The quick brown fox'}</div>
        <div class="style-meta"><div class="tags">
          <span class="tag">${esc(s.family)}</span><span class="tag w">${s.weight}</span><span class="tag s">${s.size}</span>
          <span class="tag">lh ${s.lineHeight}</span><span class="tag">ls ${s.letterSpacing}</span></div>
          <div class="cnt" style="min-width:auto"><b>${s.count}</b><span>×</span></div></div></div>`;
    }).join('');
    return `<div class="section-title"><span>${title}</span><span>${list.length} styles · ${total} elements</span></div>${rows}`;
  }).join('');

  view.innerHTML = `<div class="section-title">Fonts · ${fonts.length} families</div>${fontCards || '<div class="notice">No text found.</div>'}${groups}
    <div class="help">Click any card to copy its CSS properties.</div>`;
}

/* ---------- inspect ---------- */
async function renderInspect() {
  const on = state.inspecting;
  view.innerHTML = `
    <button class="btn hero-btn block ${on ? 'on' : 'primary'}" id="inspectBtn">${on ? 'Exit inspection mode' : 'Inspect element'}</button>
    <p class="help">${on ? 'Inspect mode is running on the page. Click any element to read its styles. Press Esc on the page to exit.'
      : 'Turn it on, then hover over anything on the page. Click an element to see its colours, font and borders. The popup closes so you can reach the page.'}</p>
    <div class="section-title">Last inspected element</div>
    <div id="last"></div>`;
  const { lastInspect } = await chrome.storage.local.get('lastInspect');
  const box = $('#last');
  if (!box) return;
  if (!lastInspect) { box.innerHTML = '<div class="card notice" style="padding:24px">Nothing inspected yet.</div>'; return; }
  box.innerHTML = `<div class="card">
    <div class="prop"><div class="k">Element</div><div class="v"><span>${esc(lastInspect.name)}</span></div></div>
    ${lastInspect.props.map(p => `<div class="prop"><div class="k">${esc(p.label)}</div>
      <div class="v">${p.swatch ? `<i class="sw" style="background:${esc(p.swatch)}"></i>` : ''}<span title="${esc(p.value)}">${esc(p.display || p.value)}</span></div>
      <button class="icon-btn" data-copy="${esc(p.value)}" data-what="${esc(p.label.toLowerCase())}" title="Copy">${COPY_ICON}</button></div>`).join('')}
  </div>
  <div class="row" style="margin-top:10px"><button class="btn small" data-copy="${esc(lastInspect.props.map(p => p.css + ': ' + p.value + ';').join('\n'))}" data-what="all properties">Copy all as CSS</button></div>`;
}

async function toggleInspect() {
  const fn = state.inspecting ? () => window.__styleSpy.stop() : () => window.__styleSpy.start();
  await chrome.scripting.executeScript({ target: { tabId: state.tabId }, func: fn });
  state.inspecting = !state.inspecting;
  if (state.inspecting) window.close();
  else renderInspect();
}

/* ---------- export ---------- */
function currentCSS() { return SS.buildCSS(state.kit); }

function renderExport() {
  const css = currentCSS();
  view.innerHTML = `
    <div class="section-title"><span>style-spy-${esc(SS.slug(state.kit.site.hostname))}.css</span><span>${css.split('\n').length} lines</span></div>
    <pre class="code">${esc(css)}</pre>
    <div class="row">
      <button class="btn" id="copyCss">Copy all CSS</button>
      <button class="btn primary" id="dlCss">Download .css</button>
    </div>
    <p class="help">Includes core colours, the full palette, fonts, sizes, weights and the heading scale. Saved kits can be edited and exported from My kits.</p>`;
}

function downloadCSS() {
  SS.download(`style-spy-${SS.slug(state.kit.site.hostname)}.css`, currentCSS());
  SS.toast('CSS file downloaded');
}

/* ---------- save kit modal ---------- */
function openSaveModal() {
  if (!state.scan) return;
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h2>Save design kit</h2>
    <p class="sub">${state.scan.colors.length} colours and ${state.scan.fonts.length} fonts from ${esc(state.scan.page.hostname)} will be saved together.</p>
    <label class="field"><span>Kit name</span><input class="input" id="kitName" maxlength="60" value="${esc(state.scan.page.title.slice(0, 60))}" placeholder="e.g. Stripe landing page"></label>
    <div class="actions"><button class="btn" id="cancelKit">Cancel</button><button class="btn primary" id="confirmKit">Save kit</button></div></div>`;
  document.body.appendChild(o);
  const input = $('#kitName', o);
  input.focus(); input.select();
  const close = () => o.remove();
  const save = async () => {
    const name = input.value.trim();
    if (!name) { input.focus(); SS.toast('Give your kit a name', 'err'); return; }
    const kits = await SS.getKits();
    const kit = SS.makeKit(state.scan, name);
    kits.unshift(kit);
    await SS.setKits(kits);
    close();
    refreshKitCount();
    SS.toast(`Saved “${name}”`);
  };
  $('#cancelKit', o).onclick = close;
  $('#confirmKit', o).onclick = save;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
}

/* ---------- delegated clicks ---------- */
function onViewClick(e) {
  const f = e.target.closest('[data-filter]');
  if (f) { state.filter = f.dataset.filter; return renderColors(); }
  if (e.target.closest('#inspectBtn')) return toggleInspect();
  if (e.target.closest('#copyCss')) return SS.copyWithToast(currentCSS(), 'all CSS');
  if (e.target.closest('#dlCss')) return downloadCSS();
  const c = e.target.closest('[data-copy]');
  if (c) SS.copyWithToast(c.dataset.copy, c.dataset.what);
}

init();
