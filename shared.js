/* Style Spy – shared helpers (popup + dashboard) */
const SS = (() => {
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
    'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial']);

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ----- colour ----- */
  const isHex = v => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((v || '').trim());
  function normHex(v) {
    let h = v.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return '#' + h.toUpperCase();
  }
  function hexToRgb(hex) {
    const n = parseInt(normHex(hex).slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function hexToHsl(hex) {
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  const fmtRgb = hex => { const c = hexToRgb(hex); return `rgb(${c.r}, ${c.g}, ${c.b})`; };
  const fmtHsl = hex => { const c = hexToHsl(hex); return `hsl(${c.h}, ${c.s}%, ${c.l}%)`; };
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  const textOn = hex => (luminance(hex) > 0.45 ? '#0B1020' : '#FFFFFF');
  const hueDist = (a, b) => { const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h); return Math.min(d, 360 - d); };
  const isVibrant = hex => { const h = hexToHsl(hex); return h.s >= 30 && h.l >= 10 && h.l <= 92; };

  /* ----- fonts ----- */
  function fmtStack(raw) {
    if (!raw) return '';
    return raw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).slice(0, 5)
      .map(n => (GENERIC.has(n.toLowerCase()) ? n : `'${n}'`)).join(', ');
  }
  const firstFont = raw => (raw || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  const styleCss = s => [
    `font-family: ${fmtStack(s.stack)};`,
    `font-weight: ${s.weight};`,
    `font-size: ${s.size};`,
    `line-height: ${s.lineHeight};`,
    `letter-spacing: ${s.letterSpacing};`
  ].join('\n');

  /* ----- clipboard / toast / download ----- */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fallback */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    return ok;
  }
  let toastTimer;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 1600);
  }
  async function copyWithToast(text, what) {
    const ok = await copy(text);
    toast(ok ? `Copied ${what || text}` : 'Copy failed – clipboard blocked', ok ? '' : 'err');
  }
  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/css' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ----- storage ----- */
  const getKits = () => new Promise(res => chrome.storage.local.get({ kits: [] }, d => res(d.kits || [])));
  const setKits = kits => new Promise(res => chrome.storage.local.set({ kits }, res));
  const uid = () => 'kit_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ----- design token derivation ----- */
  function deriveTokens(scan) {
    const cs = scan.colors.map(c => ({ ...c, hsl: hexToHsl(c.hex) }));
    const bg = scan.pageBg || '#FFFFFF';
    const byRole = r => cs.filter(c => c.roles[r] > 0).sort((a, b) => b.roles[r] - a.roles[r]);

    const text = (byRole('text')[0] || {}).hex || (luminance(bg) > 0.5 ? '#111111' : '#FFFFFF');
    const border = (byRole('border').find(c => c.hex !== bg) || {}).hex || (luminance(bg) > 0.5 ? '#E5E7EB' : '#374151');

    const vibrant = cs
      .filter(c => c.hsl.s >= 25 && c.hsl.l > 8 && c.hsl.l < 92 && c.hex !== bg && c.hex !== text)
      .sort((a, b) => (b.count + b.accent * 4) - (a.count + a.accent * 4));
    const others = cs.filter(c => c.hex !== bg && c.hex !== text);

    const primary = (vibrant[0] || others[0] || { hex: text }).hex;
    const accent = (vibrant.find(c => c.hex !== primary && hueDist(c.hex, primary) > 25) || { hex: primary }).hex;
    const secondary = (others.filter(c => c.hex !== primary && c.roles.background > 0)[0] ||
      vibrant.find(c => c.hex !== primary) || { hex: text }).hex;
    const surface = (byRole('background').find(c => ![bg, primary, secondary].includes(c.hex)) || { hex: bg }).hex;
    const textMuted = (byRole('text').find(c => c.hex !== text && !isVibrant(c.hex)) || { hex: text }).hex;

    const g = name => scan.styles.filter(s => s.group === name).sort((a, b) => b.count - a.count);
    const hs = scan.headingScale || {};
    const h = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(t => hs[t]).find(Boolean) || g('heading')[0];
    const p = g('paragraph')[0] || g('other')[0] || scan.styles[0];
    const b = g('button')[0];

    return {
      colors: { primary, secondary, accent, background: bg, surface, text, textMuted, border },
      type: {
        headingFont: h ? h.stack : '', bodyFont: p ? p.stack : '', buttonFont: b ? b.stack : '',
        headingSize: h ? h.size : '', bodySize: p ? p.size : '', buttonSize: b ? b.size : '',
        headingWeight: h ? String(h.weight) : '', bodyWeight: p ? String(p.weight) : '',
        headingLineHeight: h ? h.lineHeight : '', bodyLineHeight: p ? p.lineHeight : ''
      }
    };
  }

  function makeKit(scan, name) {
    const t = deriveTokens(scan);
    const now = Date.now();
    return {
      id: uid(), name,
      site: scan.page,
      createdAt: now, updatedAt: now,
      tokens: t.colors,
      type: t.type,
      palette: scan.colors.slice(0, 60).map(c => ({ hex: c.hex, count: c.count, roles: c.roles })),
      fonts: scan.fonts.slice(0, 12),
      styles: scan.styles.slice(0, 40),
      headingScale: scan.headingScale || {}
    };
  }

  /* ----- CSS export ----- */
  function buildCSS(kit) {
    const out = [];
    const add = (n, v, c) => { if (v) out.push(`  --${n}: ${v};${c ? ' /* ' + c + ' */' : ''}`); };
    const sec = t => { if (out.length) out.push(''); out.push(`  /* ${t} */`); };
    const T = kit.tokens || {}, Y = kit.type || {};

    sec('Core colours');
    add('color-primary', T.primary);
    add('color-secondary', T.secondary);
    add('color-accent', T.accent);
    add('color-background', T.background);
    add('color-surface', T.surface);
    add('color-text', T.text);
    add('color-text-muted', T.textMuted);
    add('color-border', T.border);

    sec('Full colour palette, most used first');
    (kit.palette || []).forEach((c, i) => add('color-palette-' + String(i + 1).padStart(2, '0'), c.hex, c.count ? c.count + ' uses' : ''));

    sec('Typography');
    add('font-heading', fmtStack(Y.headingFont));
    add('font-body', fmtStack(Y.bodyFont));
    if (Y.buttonFont && Y.buttonFont !== Y.bodyFont) add('font-button', fmtStack(Y.buttonFont));
    add('font-size-heading', Y.headingSize);
    add('font-size-body', Y.bodySize);
    add('font-size-button', Y.buttonSize);
    add('font-weight-heading', Y.headingWeight);
    add('font-weight-body', Y.bodyWeight);
    if (Y.headingLineHeight) add('line-height-heading', Y.headingLineHeight);
    if (Y.bodyLineHeight) add('line-height-body', Y.bodyLineHeight);

    const hs = kit.headingScale || {};
    const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].filter(t => hs[t]);
    if (tags.length) {
      sec('Heading scale');
      tags.forEach(t => {
        add('font-size-' + t, hs[t].size);
        add('font-weight-' + t, String(hs[t].weight));
        if (hs[t].letterSpacing !== 'normal') add('letter-spacing-' + t, hs[t].letterSpacing);
      });
    }

    if ((kit.fonts || []).length) {
      sec('All font families found');
      kit.fonts.forEach((f, i) => add('font-family-' + (i + 1), fmtStack(f.stack), f.count + ' elements'));
    }

    const sizes = new Map();
    (kit.fonts || []).forEach(f => f.sizes.forEach(s => sizes.set(s.s, (sizes.get(s.s) || 0) + s.count)));
    const sorted = [...sizes.keys()].sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 20);
    if (sorted.length) {
      sec('Font sizes in use, smallest to largest');
      sorted.forEach((s, i) => add('font-size-scale-' + String(i + 1).padStart(2, '0'), s));
    }
    const weights = [...new Set((kit.fonts || []).flatMap(f => f.weights.map(w => w.w)))].sort((a, b) => a - b);
    if (weights.length) {
      sec('Font weights in use');
      weights.forEach(w => add('font-weight-' + w, String(w)));
    }

    const site = kit.site || {};
    return `/* Style Spy export: ${kit.name}\n   Source: ${site.url || site.hostname || 'n/a'}\n   Generated: ${new Date().toISOString().slice(0, 10)} */\n:root {\n${out.join('\n')}\n}\n`;
  }

  const slug = s => (s || 'design-kit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design-kit';

  return { esc, clamp, isHex, normHex, hexToRgb, hexToHsl, fmtRgb, fmtHsl, luminance, textOn, hueDist, isVibrant,
    fmtStack, firstFont, styleCss, copy, copyWithToast, toast, download, getKits, setKits, uid,
    deriveTokens, makeKit, buildCSS, slug };
})();
