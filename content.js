/* Style Spy – page engine. Injected on demand into the active tab. */
(() => {
  if (window.__styleSpy) return;

  const HOST_ID = '__style-spy-host__';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'BR', 'TEMPLATE', 'BASE']);

  /* ---------- colour helpers ---------- */
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();

  function parseColor(str) {
    if (!str || str === 'transparent') return null;
    if (cache.has(str)) return cache.get(str);
    let res = null;
    const m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      res = { r: +m[1], g: +m[2], b: +m[3], a };
    } else if (/^(#|color\(|oklch|oklab|lab\(|lch\(|hsl|hwb|color-mix)/i.test(str)) {
      try {
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = '#000';
        cx.fillStyle = str;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        res = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      } catch (e) { res = null; }
    }
    cache.set(str, res);
    return res;
  }
  const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const px = v => (Math.round(parseFloat(v) * 100) / 100) + 'px';
  const firstFamily = s => (s.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');

  function directText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  const TEXT_INPUT = /^(text|search|email|password|url|tel|number|submit|button|reset)$/i;

  /* ---------- full-page scan ---------- */
  function scan() {
    const colors = new Map();
    const fonts = new Map();
    const styles = new Map();
    const headingCounts = {};

    const addColor = (str, role, accent) => {
      const c = parseColor(str);
      if (!c || c.a < 0.05) return null;
      const hex = toHex(c);
      let e = colors.get(hex);
      if (!e) {
        e = { hex, count: 0, roles: { text: 0, background: 0, border: 0, fill: 0 }, accent: 0 };
        colors.set(hex, e);
      }
      e.count++;
      e.roles[role]++;
      if (accent) e.accent++;
      return hex;
    };

    const all = document.querySelectorAll('*');
    const limit = Math.min(all.length, 12000);
    let scanned = 0;

    for (let i = 0; i < limit; i++) {
      const el = all[i];
      if (SKIP.has(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      scanned++;

      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === 'string' ? el.className : '';
      const isControl = tag === 'button' || tag === 'select' || tag === 'textarea' ||
        (tag === 'input' && TEXT_INPUT.test(el.type || 'text'));
      const isButtonish = tag === 'button' || el.getAttribute('role') === 'button' ||
        (tag === 'input' && /^(submit|button|reset)$/i.test(el.type)) ||
        (tag === 'a' && /btn|button|cta/i.test(cls));
      const isAccentEl = isButtonish || tag === 'a' || /btn|button|cta/i.test(cls);
      const visible = cs.visibility !== 'hidden';
      const hasText = visible && (isControl || directText(el));

      /* colours */
      if (hasText) addColor(cs.color, 'text', isAccentEl);
      addColor(cs.backgroundColor, 'background', isButtonish);
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        const found = cs.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || [];
        found.forEach(f => addColor(f, 'background', false));
      }
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none') {
          addColor(cs['border' + side + 'Color'], 'border', false);
          break;
        }
      }
      if (el instanceof SVGElement && /^(path|circle|rect|polygon|ellipse|polyline)$/.test(tag) && cs.fill && cs.fill !== 'none') {
        addColor(cs.fill, 'fill', isAccentEl);
      }

      /* typography */
      if (hasText) {
        const stack = cs.fontFamily;
        const family = firstFamily(stack);
        let weight = parseInt(cs.fontWeight, 10);
        if (isNaN(weight)) weight = cs.fontWeight === 'bold' ? 700 : 400;
        const size = px(cs.fontSize);
        const lineHeight = cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight);
        const letterSpacing = cs.letterSpacing === 'normal' ? 'normal' : px(cs.letterSpacing);

        const headEl = el.closest('h1,h2,h3,h4,h5,h6');
        let group = 'other';
        if (headEl) group = 'heading';
        else if (isButtonish || el.closest('button,[role="button"]')) group = 'button';
        else if (el.closest('p,li,blockquote,dd,dt,td,th,figcaption')) group = 'paragraph';

        const key = [family, weight, size, lineHeight, letterSpacing, group].join('|');
        let s = styles.get(key);
        if (!s) {
          s = { family, stack, weight, size, lineHeight, letterSpacing, group, count: 0 };
          styles.set(key, s);
        }
        s.count++;
        if (headEl) {
          const ht = headEl.tagName.toLowerCase();
          (headingCounts[ht] = headingCounts[ht] || new Map()).set(key, (headingCounts[ht].get(key) || 0) + 1);
        }

        let f = fonts.get(family);
        if (!f) {
          f = { family, stack, count: 0, weights: new Map(), sizes: new Map() };
          fonts.set(family, f);
        }
        f.count++;
        f.weights.set(weight, (f.weights.get(weight) || 0) + 1);
        f.sizes.set(size, (f.sizes.get(size) || 0) + 1);
      }
    }

    /* page background */
    const bodyBg = parseColor(getComputedStyle(document.body || document.documentElement).backgroundColor);
    const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    const pageBg = bodyBg && bodyBg.a > 0.95 ? toHex(bodyBg) : htmlBg && htmlBg.a > 0.95 ? toHex(htmlBg) : '#FFFFFF';
    if (!colors.has(pageBg)) {
      colors.set(pageBg, { hex: pageBg, count: 1, roles: { text: 0, background: 1, border: 0, fill: 0 }, accent: 0 });
    }

    const headingScale = {};
    Object.keys(headingCounts).forEach(tag => {
      let best = null, n = 0;
      headingCounts[tag].forEach((c, k) => { if (c > n) { n = c; best = k; } });
      if (best) headingScale[tag] = styles.get(best);
    });

    return {
      page: { title: document.title || location.hostname, url: location.href, hostname: location.hostname },
      scanned,
      pageBg,
      colors: [...colors.values()].sort((a, b) => b.count - a.count),
      fonts: [...fonts.values()]
        .map(f => ({
          family: f.family,
          stack: f.stack,
          count: f.count,
          weights: [...f.weights].map(([w, count]) => ({ w, count })).sort((a, b) => a.w - b.w),
          sizes: [...f.sizes].map(([s, count]) => ({ s, count })).sort((a, b) => parseFloat(a.s) - parseFloat(b.s))
        }))
        .sort((a, b) => b.count - a.count),
      styles: [...styles.values()].sort((a, b) => b.count - a.count).slice(0, 80),
      headingScale
    };
  }

  /* ---------- inspect mode ---------- */
  let active = false, hl = null, label = null, host = null, shadow = null, current = null;
  let dock = 'right', lastProps = null, styleTag = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function effectiveBg(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.05) return { hex: toHex(c), from: n === el ? '' : n.tagName.toLowerCase() };
      n = n.parentElement;
    }
    return { hex: '#FFFFFF', from: 'page' };
  }

  function getProps(el) {
    const cs = getComputedStyle(el);
    const tc = parseColor(cs.color);
    const bg = effectiveBg(el);
    let border = 'none';
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none') {
        const bc = parseColor(cs['border' + side + 'Color']);
        if (bc) border = toHex(bc);
        break;
      }
    }
    return [
      { label: 'Text colour', css: 'color', value: tc ? toHex(tc) : cs.color, swatch: tc ? toHex(tc) : null },
      { label: 'Background', css: 'background-color', value: bg.hex, swatch: bg.hex, note: bg.from ? 'from ' + bg.from : '' },
      { label: 'Font family', css: 'font-family', value: cs.fontFamily, display: firstFamily(cs.fontFamily) },
      { label: 'Font size', css: 'font-size', value: px(cs.fontSize) },
      { label: 'Font weight', css: 'font-weight', value: String(cs.fontWeight) },
      { label: 'Border colour', css: 'border-color', value: border, swatch: border === 'none' ? null : border },
      { label: 'Border radius', css: 'border-radius', value: cs.borderRadius }
    ];
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/)[0];
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.documentElement.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    return ok;
  }

  const PANEL_CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif}
    .p{position:fixed;bottom:16px;width:316px;max-height:calc(100vh - 32px);overflow:auto;background:#0f1630;color:#e8ecff;
       border:1px solid #2b3868;border-radius:14px;box-shadow:0 18px 50px rgba(3,6,20,.6);z-index:2147483647;font-size:13px}
    .p.right{right:16px}.p.left{left:16px}
    .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #222d57;
        background:linear-gradient(135deg,rgba(139,92,246,.25),rgba(45,156,255,.18))}
    .dot{width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,.22)}
    .t{font-weight:700;flex:1;min-width:0}.t small{display:block;font-weight:500;color:#9aa6d6;font-size:11px;margin-top:1px;
       white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    button{cursor:pointer;border:0;font:inherit}
    .mv{background:#1a2450;color:#b9c3f0;border-radius:8px;padding:5px 8px}
    .mv:hover{background:#24316b}
    .hint{padding:14px;color:#a9b4de;line-height:1.5}
    .r{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #1b2549}
    .r .k{width:92px;flex:none;color:#8f9bc7;font-size:12px}
    .r .v{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-weight:600}
    .r .v span.txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .r .v em{font-style:normal;font-weight:500;color:#7480ad;font-size:11px}
    .sw{width:16px;height:16px;border-radius:5px;border:1px solid rgba(255,255,255,.25);flex:none}
    .cp{background:#1a2450;color:#c9d2ff;border-radius:7px;padding:4px 9px;font-size:12px;flex:none}
    .cp:hover{background:#7c4dff;color:#fff}
    .ft{display:flex;gap:8px;padding:12px 14px}
    .ft button{flex:1;padding:9px;border-radius:9px;font-weight:600}
    .all{background:linear-gradient(135deg,#8b5cf6,#2d9cff);color:#fff}
    .ex{background:#2a1a3f;color:#ffb4c8;border:1px solid #5a2b57}
    .ex:hover{background:#4a1f4d}
  `;

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.addEventListener('click', onPanelClick);
    document.documentElement.appendChild(host);
  }

  function renderPanel() {
    ensureHost();
    const props = lastProps;
    const rows = props
      ? props.props.map((p, i) => `
          <div class="r">
            <div class="k">${esc(p.label)}</div>
            <div class="v">${p.swatch ? `<i class="sw" style="background:${esc(p.swatch)}"></i>` : ''}
              <span class="txt" title="${esc(p.value)}">${esc(p.display || p.value)}</span>${p.note ? `<em>${esc(p.note)}</em>` : ''}</div>
            <button class="cp" data-i="${i}">Copy</button>
          </div>`).join('')
      : `<div class="hint">Hover any element to outline it, then click to read its styles. Press Esc to leave inspect mode.</div>`;
    shadow.innerHTML = `<style>${PANEL_CSS}</style>
      <div class="p ${dock}">
        <div class="hd"><i class="dot"></i>
          <div class="t">Style Spy inspector<small>${props ? esc(props.name) : 'Waiting for a click'}</small></div>
          <button class="mv" data-act="move" title="Move panel">⇄</button></div>
        ${rows}
        <div class="ft">
          ${props ? '<button class="all" data-act="all">Copy all CSS</button>' : ''}
          <button class="ex" data-act="exit">Exit inspect mode</button>
        </div>
      </div>`;
  }

  async function onPanelClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const flash = (txt) => { const o = b.textContent; b.textContent = txt; setTimeout(() => { if (b.isConnected) b.textContent = o; }, 1100); };
    if (b.dataset.act === 'exit') return stop();
    if (b.dataset.act === 'move') { dock = dock === 'right' ? 'left' : 'right'; return renderPanel(); }
    if (b.dataset.act === 'all') {
      const css = lastProps.props.map(p => `${p.css}: ${p.value};`).join('\n');
      return flash((await copyText(css)) ? 'Copied' : 'Copy failed');
    }
    if (b.dataset.i !== undefined) {
      const p = lastProps.props[+b.dataset.i];
      flash((await copyText(p.value)) ? 'Copied' : 'Failed');
    }
  }

  function position(t) {
    if (!hl || !t || !t.getBoundingClientRect) return;
    const r = t.getBoundingClientRect();
    hl.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
      'outline:2px solid #8b5cf6;outline-offset:-1px;background:rgba(45,156,255,.16);box-shadow:0 0 0 1px #2d9cff;' +
      'pointer-events:none;z-index:2147483646;box-sizing:border-box;';
    label.textContent = `${describe(t)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    const nearTop = r.top < 28;
    label.style.cssText = 'position:absolute;left:-2px;background:#7c4dff;color:#fff;font:600 11px/1 system-ui,sans-serif;' +
      `padding:5px 8px;border-radius:6px;white-space:nowrap;${nearTop ? 'bottom:-26px;' : 'top:-26px;'}`;
  }

  const blocked = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'auxclick', 'touchstart', 'touchend', 'submit'];
  const onMove = e => { if (e.target === host || e.target === hl) return; current = e.target; position(current); };
  const onScroll = () => position(current);
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); } };
  const onBlock = e => { if (e.target === host) return; e.preventDefault(); e.stopImmediatePropagation(); };
  const onClick = e => {
    if (e.target === host) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const el = e.target;
    current = el;
    position(el);
    lastProps = { name: describe(el), props: getProps(el) };
    renderPanel();
    try {
      chrome.storage.local.set({ lastInspect: { name: lastProps.name, props: lastProps.props, url: location.href, ts: Date.now() } });
    } catch (err) { /* storage unavailable */ }
  };

  function start() {
    if (active) return true;
    active = true;
    lastProps = null;
    hl = document.createElement('div');
    hl.id = '__style-spy-hl__';
    label = document.createElement('div');
    hl.appendChild(label);
    hl.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
    document.documentElement.appendChild(hl);
    styleTag = document.createElement('style');
    styleTag.textContent = 'html, html * { cursor: crosshair !important; }';
    document.documentElement.appendChild(styleTag);
    renderPanel();
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    blocked.forEach(t => window.addEventListener(t, onBlock, true));
    return true;
  }

  function stop() {
    if (!active) return false;
    active = false;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    blocked.forEach(t => window.removeEventListener(t, onBlock, true));
    [hl, host, styleTag].forEach(n => n && n.remove());
    hl = host = shadow = label = styleTag = current = null;
    return true;
  }

  window.__styleSpy = { scan, start, stop, isActive: () => active };
})();
