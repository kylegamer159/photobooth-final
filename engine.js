'use strict';
/* =====================================================================
   Snap & Style – layout + render engine (no DOM needed except bg cache)
   Canvas is a 1080 x 1920 "story" page. Every slot is defined by its
   window CENTER (cx, cy), window size (w, h) and rotation r (degrees),
   so photos are always cropped to the window and rotated with the frame.
   ===================================================================== */
const W = 1080, H = 1920;
const D2R = Math.PI / 180;
const EF = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function seeded(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function rrect(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

/* ---------------- shared state ---------------- */
const ST = { li: 0, theme: 'blue', sel: null, items: [], sd: [], filter: 'none', wm: '', user: null };

const FILTERS = {
  none: 'none',
  warm: 'sepia(.25) saturate(1.2) brightness(1.05)',
  cool: 'hue-rotate(-12deg) saturate(1.1) brightness(1.05)',
  bw: 'grayscale(1) contrast(1.1)',
  vintage: 'sepia(.5) contrast(.9) brightness(1.05) saturate(.9)',
  soft: 'brightness(1.08) contrast(.92) saturate(1.1)',
  vivid: 'saturate(1.5) contrast(1.1)'
};

/* ---------------- background layers ---------------- */
const BL = {
  fill: col => c => { c.fillStyle = col; c.fillRect(0, 0, W, H); },
  grad: stops => c => { const g = c.createLinearGradient(0, 0, W * .6, H); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); c.fillStyle = g; c.fillRect(0, 0, W, H); },
  gingham: (col, sz, a = .5) => c => { c.globalAlpha = a; c.fillStyle = col; for (let y = 0; y < H; y += sz * 2) c.fillRect(0, y, W, sz); for (let x = 0; x < W; x += sz * 2) c.fillRect(x, 0, sz, H); c.globalAlpha = 1; },
  dots: (col, gap, r, a = .35) => c => { c.globalAlpha = a; c.fillStyle = col; let row = 0; for (let y = gap / 2; y < H; y += gap, row++) for (let x = gap / 2 + (row % 2 ? gap / 2 : 0); x < W; x += gap) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } c.globalAlpha = 1; },
  grid: (col, gap) => c => {
    c.strokeStyle = col; c.lineWidth = 4;
    for (let x = 0; x <= W + gap; x += gap) { c.beginPath(); for (let y = 0; y <= H; y += 20) { const xx = x + Math.sin(y / 140 + x / 90) * 16; if (y) c.lineTo(xx, y); else c.moveTo(xx, y); } c.stroke(); }
    for (let y = 0; y <= H + gap; y += gap) { c.beginPath(); for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x / 160 + y / 110) * 16; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); } c.stroke(); }
  },
  noise: (col, n, a) => c => { const r = seeded(11); c.strokeStyle = col; c.globalAlpha = a; c.lineWidth = 2; for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H, l = 10 + r() * 40, an = r() * 6.28; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); c.stroke(); } c.globalAlpha = 1; },
  twill: () => c => { const r = seeded(21); c.lineWidth = 3; for (let i = 0; i < 6000; i++) { const x = r() * W, y = r() * H, l = 14 + r() * 26; c.strokeStyle = r() < .5 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + l * .9); c.stroke(); } },
  water: () => c => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#3fa7a3'); g.addColorStop(.5, '#7fd0c2'); g.addColorStop(1, '#3a9fb0'); c.fillStyle = g; c.fillRect(0, 0, W, H); const r = seeded(4); for (let i = 0; i < 260; i++) { c.fillStyle = 'rgba(255,255,255,' + (.04 + r() * .1) + ')'; c.beginPath(); c.ellipse(r() * W, r() * H, 30 + r() * 90, 12 + r() * 40, r() * 3, 0, 7); c.fill(); } },
  clouds: () => c => { const r = seeded(9); c.fillStyle = '#fff'; c.globalAlpha = .55; for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = 90 + r() * 150; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + (k - 2) * rad * .6, y + Math.sin(k * 2) * rad * .2, rad * .55, 0, 7); c.fill(); } } c.globalAlpha = 1; },
  news: () => c => { c.fillStyle = '#e8e4d8'; c.fillRect(0, 0, W, H); const r = seeded(5); c.fillStyle = '#2b2b2b'; for (let y = 30; y < H; y += 24) { if (r() < .06) { c.font = '900 70px "Playfair Display",serif'; c.fillText(['NEWS', 'Times', 'Daily', "You don't", 'Brit'][(r() * 5) | 0], r() * 600, y + 40); y += 70; } else { c.globalAlpha = .3; for (let x = 20; x < W; x += 110 + r() * 80) c.fillRect(x, y, 60 + r() * 90, 8); c.globalAlpha = 1; } } },
  lights: () => c => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0b0d'); g.addColorStop(1, '#1a1015'); c.fillStyle = g; c.fillRect(0, 0, W, H); for (let k = 0; k < 4; k++) { const y0 = 200 + k * 470; c.strokeStyle = '#e9b9b0'; c.lineWidth = 4; c.beginPath(); for (let x = 0; x <= W; x += 20) { const y = y0 + Math.sin(x / W * Math.PI) * 40; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); for (let x = 30; x < W; x += 90) { const y = y0 + Math.sin(x / W * Math.PI) * 40 + 12; c.save(); c.shadowColor = '#ffe9b0'; c.shadowBlur = 30; c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); c.restore(); } } },
  wanted: () => c => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#e6d3ae'); g.addColorStop(1, '#c9a874'); c.fillStyle = g; c.fillRect(0, 0, W, H); const r = seeded(3); for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(120,80,40,' + (.04 + r() * .07) + ')'; c.beginPath(); c.arc(r() * W, r() * H, 20 + r() * 90, 0, 7); c.fill(); } }
};

const CAM = { silver: ['#ececec', '#a0a0a4'], pink: ['#f8cfe0', '#d98bb0'], red: ['#b3283f', '#600f21'], white: ['#fafafa', '#cfcfd2'], dark: ['#4a4a4e', '#141416'], blue: ['#bcd3f2', '#7c9ccf'] };

const THEMES = {
  blue:     { n: 'Blue Gingham', sw: '#8fb0e8', layers: [BL.fill('#f4f8ff'), BL.gingham('#8fb0e8', 90)], cam: 'blue', ink: '#27406e', st: ['🦋', '⭐', '🐚', '🪼', '💙', '🎀', '🌊', '🐠', '🫧', '🤍'] },
  ocean:    { n: 'Ocean', sw: '#4fb3a9', layers: [BL.water()], cam: 'silver', ink: '#ffffff', st: ['🐚', '⭐', '🌺', '🐢', '🐬', '🪸', '🌊', '🦀', '🫧'] },
  sky:      { n: 'Sky', sw: '#b8cce4', layers: [BL.grad(['#cfe0f5', '#b7cbe6', '#e9f1fb']), BL.clouds()], cam: 'white', ink: '#35527d', st: ['☁️', '🪼', '🦋', '💙', '✨', '🎀', '🌷', '🫧'] },
  denim:    { n: 'Denim', sw: '#4a678a', layers: [BL.fill('#5d7899'), BL.twill()], cam: 'silver', ink: '#ffffff', st: ['⭐', '🎀', '🦋', '💙', '🧵', '📞', '🎱', '🤍'] },
  pink:     { n: 'Pink Grid', sw: '#f4a6c6', layers: [BL.fill('#fbeff3'), BL.grid('#c2487a', 100)], cam: 'pink', ink: '#a0295f', st: ['🎀', '💗', '🌸', '💋', '✨', '🍓', '🧸', '🌷', '💕'] },
  red:      { n: 'Cherry Red', sw: '#c0283c', layers: [BL.fill('#f6e8d8'), BL.gingham('#c0283c', 80, .6)], cam: 'red', ink: '#8c1226', st: ['🍒', '🍓', '💋', '❤️', '🎀', '🥤', '🎲', '🎱', '🌹'] },
  lavender: { n: 'Lavender', sw: '#b9a5e0', layers: [BL.grad(['#e7dcf7', '#cdbbea', '#f4ecfb']), BL.dots('#ffffff', 60, 5, .45)], cam: 'white', ink: '#4e3a85', st: ['💜', '🦋', '🪻', '✨', '🔮', '🌷', '🫐', '🌙'] },
  yellow:   { n: 'Sunflower', sw: '#f4cf45', layers: [BL.fill('#fffaf0'), BL.gingham('#f4cf45', 90, .45)], cam: 'silver', ink: '#7a5a05', st: ['🌻', '🐝', '🦋', '☀️', '🌼', '💛', '🍯', '🌷'] },
  brown:    { n: 'Teddy Brown', sw: '#b8856a', layers: [BL.fill('#b8856a'), BL.noise('#ffffff', 1800, .06)], cam: 'silver', ink: '#fff6ea', st: ['🧸', '🎀', '🍂', '⭐', '🤎', '🌿', '🐻', '☕'] },
  bw:       { n: 'Newsprint', sw: '#d9d5c9', layers: [BL.news()], cam: 'silver', ink: '#111111', st: ['✨', '⭐', '🖤', '🎀', '🪩', '📸', '🎞️', '🤍'] },
  dark:     { n: 'Night Lights', sw: '#1c1417', layers: [BL.lights()], cam: 'dark', ink: '#ffffff', st: ['❤️', '✨', '💡', '🎞️', '⭐', '🌙'] },
  cream:    { n: 'Cream', sw: '#fbf6ee', layers: [BL.fill('#fbf6ee'), BL.noise('#b59f85', 900, .07)], cam: 'silver', ink: '#5a4636', st: ['✨', '💖', '⭐', '🌈', '🎀', '🌸', '🦋'] },
  noir:     { n: 'Black', sw: '#000000', layers: [BL.fill('#050506')], cam: 'dark', ink: '#ffffff', st: [], hidden: true },
  wanted:   { n: 'Wanted', sw: '#d3b98a', layers: [BL.wanted()], cam: 'silver', ink: '#2b1d10', st: [], hidden: true }
};

/* ---------------- slot geometry per frame kind ---------------- */
function geom(s) {
  const m = Math.min(s.w, s.h);
  switch (s.k) {
    case 'polaroid': case 'pin': { const p = m * .07, b = m * .2; return { x0: -s.w / 2 - p, y0: -s.h / 2 - p - (s.k === 'pin' ? 60 : 0), x1: s.w / 2 + p, y1: s.h / 2 + p + b, p, b }; }
    case 'film': { const sd = s.w * .15; return { x0: -s.w / 2 - sd, y0: -s.h / 2 - 16, x1: s.w / 2 + sd, y1: s.h / 2 + 16, sd }; }
    case 'filmh': { const t = s.h * .17; return { x0: -s.w / 2 - 14, y0: -s.h / 2 - t, x1: s.w / 2 + 14, y1: s.h / 2 + t, t }; }
    case 'camera': return { x0: -s.w / 2 - 70, y0: -s.h / 2 - 100, x1: s.w * 1.45, y1: s.h / 2 + 90 };
    case 'camerap': return { x0: -s.w / 2 - 60, y0: -s.h / 2 - s.h * .95 - 40, x1: s.w / 2 + 60, y1: s.h / 2 + 90 };
    case 'phone': { const f = s.w / 400; return { x0: -s.w / 2 - 35, y0: -s.h / 2 - 35, x1: s.w / 2 + 35, y1: s.h / 2 + 300 * f, f }; }
    case 'insta': return { x0: -s.w / 2 - 30, y0: -s.h / 2 - 110, x1: s.w / 2 + 30, y1: s.h / 2 + 220 };
    case 'round': return { x0: -s.w / 2 - 22, y0: -s.h / 2 - 22, x1: s.w / 2 + 22, y1: s.h / 2 + 22 };
    case 'slide': return { x0: -s.w / 2 - 95, y0: -s.h / 2 - 46, x1: s.w / 2 + 22, y1: s.h / 2 + 46 };
    case 'tape': return { x0: -s.w / 2 - 14, y0: -s.h / 2 - 40, x1: s.w / 2 + 14, y1: s.h / 2 + 14 };
    case 'contact': return { x0: -s.w / 2, y0: -s.h / 2, x1: s.w / 2, y1: s.h / 2 + 34 };
    default: return { x0: -s.w / 2, y0: -s.h / 2, x1: s.w / 2, y1: s.h / 2 };
  }
}
const winRadius = s => ({ film: 6, filmh: 6, camera: 10, camerap: 10, phone: 28, round: 28, polaroid: 0, pin: 0 }[s.k] || 0);
function slotAABB(s) {
  const g = geom(s), a = s.r * D2R, co = Math.cos(a), si = Math.sin(a);
  const pts = [[g.x0, g.y0], [g.x1, g.y0], [g.x1, g.y1], [g.x0, g.y1]].map(([x, y]) => [s.cx + x * co - y * si, s.cy + x * si + y * co]);
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}

/* ---------------- frame bodies (drawn under the photo) ---------------- */
function body(c, s, th) {
  const g = geom(s), m = Math.min(s.w, s.h);
  c.save();
  switch (s.k) {
    case 'polaroid': case 'pin': {
      const top = s.k === 'pin' ? g.y0 + 60 : g.y0;
      c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 20; c.shadowOffsetY = 6; c.fillStyle = '#fcfcf9';
      c.fillRect(g.x0, top, g.x1 - g.x0, g.y1 - top);
      c.shadowColor = 'transparent';
      if (s.k === 'pin') { c.fillStyle = '#d8b48a'; rrect(c, -18, g.y0 - 6, 36, 110, 8); c.fill(); c.fillStyle = '#b88f64'; c.fillRect(-2, g.y0 + 10, 4, 90); }
      break;
    }
    case 'film': {
      c.fillStyle = '#161212'; c.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
      const n = Math.max(3, Math.round(s.h / 44)), st = s.h / n, hw = g.sd * .42, hh = st * .5;
      c.fillStyle = '#fbfbfb';
      for (let i = 0; i < n; i++) { const y = -s.h / 2 + st * (i + .5) - hh / 2; rrect(c, -s.w / 2 - g.sd / 2 - hw / 2, y, hw, hh, 5); c.fill(); rrect(c, s.w / 2 + g.sd / 2 - hw / 2, y, hw, hh, 5); c.fill(); }
      break;
    }
    case 'filmh': {
      c.fillStyle = '#161212'; c.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
      const n = Math.max(4, Math.round(s.w / 40)), st = s.w / n, hw = st * .5, hh = g.t * .45;
      c.fillStyle = '#fbfbfb';
      for (let i = 0; i < n; i++) { const x = -s.w / 2 + st * (i + .5) - hw / 2; rrect(c, x, -s.h / 2 - g.t / 2 - hh / 2, hw, hh, 4); c.fill(); rrect(c, x, s.h / 2 + g.t / 2 - hh / 2, hw, hh, 4); c.fill(); }
      break;
    }
    case 'camera': {
      const cm = CAM[th.cam || 'silver'], x0 = g.x0, y0 = g.y0, bw = g.x1 - g.x0, bh = g.y1 - g.y0;
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
      const gr = c.createLinearGradient(0, y0, 0, y0 + bh); gr.addColorStop(0, cm[0]); gr.addColorStop(1, cm[1]);
      c.fillStyle = gr; rrect(c, x0, y0, bw, bh, 34); c.fill(); c.shadowColor = 'transparent';
      c.fillStyle = '#0d0d0f'; rrect(c, -s.w / 2 - 26, -s.h / 2 - 26, s.w + 52, s.h + 52, 16); c.fill();
      c.fillStyle = '#18181a'; c.beginPath(); c.arc(x0 + 70, y0 + 48, 26, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.stroke();
      c.fillStyle = 'rgba(0,0,0,.25)'; rrect(c, g.x1 - 170, y0 - 12, 100, 16, 6); c.fill();
      const left = s.w / 2 + 26, dx = left + (g.x1 - left) / 2, r = Math.min(s.h * .3, (g.x1 - left) * .36);
      const dg = c.createLinearGradient(dx - r, -r, dx + r, r); dg.addColorStop(0, '#fff'); dg.addColorStop(1, '#8a8a90');
      c.fillStyle = dg; c.beginPath(); c.arc(dx, 0, r, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#d7d7dc'; c.beginPath(); c.arc(dx, 0, r * .55, 0, 7); c.fill();
      c.fillStyle = '#444'; c.font = `700 ${r * .38}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OK', dx, 0);
      c.fillStyle = 'rgba(0,0,0,.18)'; [[-1.15, -1.1], [-1.15, 1.1]].forEach(([a, b]) => { c.beginPath(); c.arc(dx + a * r, b * r, r * .22, 0, 7); c.fill(); });
      c.fillStyle = 'rgba(0,0,0,.4)'; c.font = '700 24px sans-serif'; c.fillText(th.brand || 'SNAPCAM', 0, s.h / 2 + 62);
      break;
    }
    case 'camerap': {
      const cm = CAM[th.cam || 'silver'], x0 = g.x0, y0 = g.y0, bw = g.x1 - g.x0, bh = g.y1 - g.y0;
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
      const gr = c.createLinearGradient(0, y0, 0, y0 + bh); gr.addColorStop(0, cm[0]); gr.addColorStop(1, cm[1]);
      c.fillStyle = gr; rrect(c, x0, y0, bw, bh, 40); c.fill(); c.shadowColor = 'transparent';
      c.fillStyle = '#0d0d0f'; rrect(c, -s.w / 2 - 26, -s.h / 2 - 26, s.w + 52, s.h + 52, 16); c.fill();
      const areaH = -s.h / 2 - 26 - y0, cy = y0 + areaH / 2 + 8, r = Math.min(areaH * .4, s.w * .22);
      const dg = c.createLinearGradient(-r, cy - r, r, cy + r); dg.addColorStop(0, '#fff'); dg.addColorStop(1, '#8a8a90');
      c.fillStyle = dg; c.beginPath(); c.arc(0, cy, r, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#d7d7dc'; c.beginPath(); c.arc(0, cy, r * .55, 0, 7); c.fill();
      c.fillStyle = '#18181a'; c.beginPath(); c.arc(x0 + 80, y0 + 70, 34, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.stroke();
      c.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(x1(g) - 110 + (i % 3) * 22, y0 + 60 + ((i / 3) | 0) * 22, 6, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,.4)'; c.font = '700 26px sans-serif'; c.textAlign = 'center'; c.fillText(th.brand || 'SNAPCAM', 0, s.h / 2 + 58);
      break;
    }
    case 'phone': {
      const f = g.f;
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
      const gr = c.createLinearGradient(0, g.y0, 0, g.y1); gr.addColorStop(0, '#76767b'); gr.addColorStop(1, '#5f5f64');
      c.fillStyle = gr; rrect(c, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, 46 * f + 10); c.fill(); c.shadowColor = 'transparent';
      const y0 = s.h / 2 + 40 * f, L = -s.w / 2, R = s.w / 2;
      c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `${20 * f}px sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('iPhone', L, y0 + 22 * f);
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 5 * f; c.beginPath(); c.moveTo(L, y0 + 90 * f); c.lineTo(R, y0 + 90 * f); c.stroke();
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(L, y0 + 90 * f); c.lineTo(L + s.w * .5, y0 + 90 * f); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(L + s.w * .5, y0 + 90 * f, 8 * f, 0, 7); c.fill();
      c.font = `${16 * f}px sans-serif`; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('1:53', L, y0 + 118 * f); c.textAlign = 'right'; c.fillText('-1:20', R, y0 + 118 * f);
      const by = y0 + 170 * f, t = 26 * f; c.fillStyle = '#fff';
      [-.28, .28].forEach(sg => { const x = sg * s.w; c.beginPath(); c.moveTo(x + sg * -t * .1, by); c.lineTo(x + t * (sg < 0 ? .5 : -.5), by - t * .5); c.lineTo(x + t * (sg < 0 ? .5 : -.5), by + t * .5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x + t * (sg < 0 ? .5 : -.5), by); c.lineTo(x + t * (sg < 0 ? 1.2 : -1.2), by - t * .5); c.lineTo(x + t * (sg < 0 ? 1.2 : -1.2), by + t * .5); c.closePath(); c.fill(); });
      c.fillRect(-t * .55, by - t * .6, t * .4, t * 1.2); c.fillRect(t * .15, by - t * .6, t * .4, t * 1.2);
      const vy = y0 + 235 * f; c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 5 * f; c.beginPath(); c.moveTo(L + 40 * f, vy); c.lineTo(R - 40 * f, vy); c.stroke();
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(L + 40 * f, vy); c.lineTo(R - 70 * f, vy); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(R - 70 * f, vy, 12 * f, 0, 7); c.fill();
      break;
    }
    case 'insta': {
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 26; c.shadowOffsetY = 10; c.fillStyle = '#fafafa'; c.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0); c.shadowColor = 'transparent';
      const hy = -s.h / 2 - 55, L = -s.w / 2;
      const ag = c.createLinearGradient(L, hy - 30, L + 60, hy + 30); ag.addColorStop(0, '#f9a33a'); ag.addColorStop(1, '#d6249f'); c.fillStyle = ag; c.beginPath(); c.arc(L + 30, hy, 28, 0, 7); c.fill();
      c.fillStyle = '#d9d9de'; rrect(c, L + 76, hy - 18, 190, 12, 6); c.fill(); rrect(c, L + 76, hy + 4, 120, 10, 5); c.fill();
      const fy = s.h / 2 + 52; c.fillStyle = '#e53935'; c.font = '700 60px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('♥', L, fy);
      c.strokeStyle = '#333'; c.lineWidth = 5; c.beginPath(); c.arc(L + 100, fy, 20, 0, 7); c.stroke(); c.beginPath(); c.moveTo(L + 150, fy - 20); c.lineTo(L + 190, fy); c.lineTo(L + 150, fy + 20); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-L - 36, fy - 22); c.lineTo(-L - 36, fy + 22); c.lineTo(-L - 20, fy + 8); c.lineTo(-L - 4, fy + 22); c.lineTo(-L - 4, fy - 22); c.closePath(); c.fillStyle = '#111'; c.fill();
      c.fillStyle = '#111'; c.font = '700 30px sans-serif'; c.fillText('1000 likes', L, fy + 62);
      c.fillStyle = '#2b4a9b'; c.font = '26px sans-serif'; c.fillText('#like #shares #comments', L, fy + 104);
      c.fillStyle = '#999'; c.font = '20px sans-serif'; c.fillText('1 HOUR AGO', L, fy + 142);
      break;
    }
    case 'round':
      c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 24; c.shadowOffsetY = 8; c.fillStyle = '#fff'; rrect(c, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, 50); c.fill(); break;
    case 'slide': {
      c.fillStyle = '#141010'; c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 16; c.shadowOffsetY = 6; c.fillRect(-s.w / 2 - 22, g.y0, s.w + 44, g.y1 - g.y0); c.shadowColor = 'transparent';
      const n = Math.round(s.w / 40), st = s.w / n; c.fillStyle = '#f5f5f5';
      for (let i = 0; i < n; i++) { rrect(c, -s.w / 2 + st * i + st * .2, -s.h / 2 - 34, st * .6, 20, 4); c.fill(); rrect(c, -s.w / 2 + st * i + st * .2, s.h / 2 + 14, st * .6, 20, 4); c.fill(); }
      c.fillStyle = '#1c1c1e'; rrect(c, -s.w / 2 - 95, -70, 78, 140, 10); c.fill();
      c.strokeStyle = '#cfcfd4'; c.lineWidth = 7; c.beginPath(); c.arc(-s.w / 2 - 98, -34, 24, 0, 7); c.stroke(); c.beginPath(); c.arc(-s.w / 2 - 98, 34, 24, 0, 7); c.stroke();
      break;
    }
    case 'tape':
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 24; c.shadowOffsetY = 8; c.fillStyle = '#f7f3ea'; c.fillRect(-s.w / 2 - 14, -s.h / 2 - 14, s.w + 28, s.h + 28); break;
    default: break;
  }
  c.restore();
}
function x1(g) { return g.x1; }

/* ---------------- overlays (drawn over the photo) ---------------- */
function overlay(c, s, i, th, o) {
  c.save();
  switch (s.k) {
    case 'polaroid': case 'pin': c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 3; c.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h); break;
    case 'fav': c.fillStyle = '#fff'; c.font = '700 40px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('♥', -s.w / 2 + 14, s.h / 2 - 28); break;
    case 'camgrid': c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 3; for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(-s.w / 2 + s.w * k / 3, -s.h / 2); c.lineTo(-s.w / 2 + s.w * k / 3, s.h / 2); c.stroke(); c.beginPath(); c.moveTo(-s.w / 2, -s.h / 2 + s.h * k / 3); c.lineTo(s.w / 2, -s.h / 2 + s.h * k / 3); c.stroke(); } break;
    case 'contact': c.fillStyle = '#e8e8e8'; c.font = '600 24px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('▸ ' + (i + 1) + 'A', -s.w / 2 + 4, s.h / 2 + 20); break;
    case 'tape':
      c.fillStyle = 'rgba(240,222,170,.85)';
      [[-s.w / 2 + 30, -s.h / 2 + 6, -32], [s.w / 2 - 30, -s.h / 2 + 6, 32]].forEach(([x, y, a]) => { c.save(); c.translate(x, y); c.rotate(a * D2R); c.fillRect(-80, -22, 160, 44); c.restore(); });
      break;
    default: break;
  }
  if (s.cap && s.k === 'polaroid') { const g = geom(s); c.fillStyle = '#223a6b'; c.font = `${Math.round(Math.min(s.w, s.h) * .12)}px Pacifico, cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.cap, 0, s.h / 2 + g.p + g.b * .5); }
  c.restore();
}

/* ---------------- shapes ---------------- */
function drawShape(c, sh) {
  c.save();
  switch (sh.t) {
    case 'rect': c.translate(sh.cx, sh.cy); c.rotate((sh.r || 0) * D2R); if (sh.shadow !== false) { c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 22; c.shadowOffsetY = 8; } c.fillStyle = sh.fill; rrect(c, -sh.w / 2, -sh.h / 2, sh.w, sh.h, sh.rad || 0); c.fill(); break;
    case 'bar': c.fillStyle = sh.fill; c.fillRect(sh.x, sh.y, sh.w, sh.h); break;
    case 'circle': c.fillStyle = sh.fill || 'transparent'; c.beginPath(); c.arc(sh.cx, sh.cy, sh.r, 0, 7); if (sh.fill) c.fill(); if (sh.stroke) { c.strokeStyle = sh.stroke; c.lineWidth = sh.lw || 6; c.stroke(); } break;
    case 'vinyl': {
      c.translate(sh.cx, sh.cy); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 30; c.fillStyle = '#0d0d0f'; c.beginPath(); c.arc(0, 0, sh.r, 0, 7); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2; for (let r = sh.r * .4; r < sh.r - 6; r += 14) { c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); }
      c.fillStyle = '#f1ece2'; c.beginPath(); c.arc(0, 0, sh.r * .28, 0, 7); c.fill(); c.fillStyle = '#555'; c.font = `700 ${sh.r * .05}px sans-serif`; c.textAlign = 'center'; c.fillText('STEREO', 0, sh.r * .1);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); break;
    }
    case 'line': c.strokeStyle = sh.color || '#8b6b52'; c.lineWidth = sh.lw || 5; c.beginPath(); c.moveTo(sh.pts[0][0], sh.pts[0][1]); c.quadraticCurveTo(sh.pts[1][0], sh.pts[1][1], sh.pts[2][0], sh.pts[2][1]); c.stroke(); break;
    case 'rope': c.strokeStyle = '#6b4a33'; c.lineWidth = 14; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(sh.x, 30); c.lineTo(sh.x, H - 30); c.stroke(); break;
    case 'pocket': {
      const { x, y, w, h } = sh;
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a76a3'); g.addColorStop(1, '#2f5683');
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 24; c.shadowOffsetY = 8; c.fillStyle = g;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h * .78); c.quadraticCurveTo(x + w / 2, y + h * 1.12, x, y + h * .78); c.closePath(); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = '#e3b04b'; c.lineWidth = 5; c.setLineDash([16, 10]);
      c.beginPath(); c.moveTo(x + 24, y + 28); c.lineTo(x + w - 24, y + 28); c.lineTo(x + w - 24, y + h * .72); c.quadraticCurveTo(x + w / 2, y + h * .98, x + 24, y + h * .72); c.closePath(); c.stroke();
      c.setLineDash([]); c.fillStyle = '#d7a64a'; c.beginPath(); c.arc(x + 40, y + 26, 13, 0, 7); c.fill(); break;
    }
    default: break;
  }
  c.restore();
}
function drawLText(c, t, th) {
  c.save(); c.translate(t.x, t.y); c.rotate((t.r || 0) * D2R);
  c.font = `${t.weight || 700} ${t.size}px ${t.font || 'Fredoka, sans-serif'}`; c.fillStyle = t.color || th.ink; c.textAlign = t.align || 'center'; c.textBaseline = 'middle';
  c.fillText(t.t, 0, 0); c.restore();
}

/* ---------------- user items (stickers / text / images) ---------------- */
let _mctx = null;
function measure(it) {
  if (it.type === 'emoji') return [it.size * .6, it.size * .6];
  if (it.type === 'img') return [it.size / 2, it.size * it.ar / 2];
  if (!_mctx) _mctx = (typeof document !== 'undefined') ? document.createElement('canvas').getContext('2d') : null;
  let w = it.size * it.t.length * .3;
  if (_mctx) { _mctx.font = `700 ${it.size}px ${it.font || 'Fredoka, sans-serif'}`; w = _mctx.measureText(it.t).width; }
  return [w / 2 + 10, it.size * .7];
}
function drawItem(c, it) {
  c.save(); c.translate(it.x, it.y); c.rotate((it.r || 0) * D2R);
  if (it.type === 'emoji') { c.font = `${it.size}px ${EF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 8; c.fillText(it.e, 0, 0); }
  else if (it.type === 'text') { c.font = `700 ${it.size}px ${it.font || 'Fredoka, sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = it.size * .14; c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(it.t, 0, 0); c.fillStyle = it.color; c.fillText(it.t, 0, 0); }
  else if (it.type === 'img') { c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 10; c.drawImage(it.img, -it.size / 2, -it.size * it.ar / 2, it.size, it.size * it.ar); }
  c.restore();
}

/* ---------------- layouts ---------------- */
const S = (cx, cy, w, h, r = 0, k = 'polaroid', extra) => Object.assign({ cx, cy, w, h, r, k }, extra);
function vstrip(cx, cy, n, w, h, ang, k = 'film') { const a = ang * D2R, step = h + 32, o = []; for (let i = 0; i < n; i++) { const d = (i - (n - 1) / 2) * step; o.push(S(cx - Math.sin(a) * d, cy + Math.cos(a) * d, w, h, ang, k)); } return o; }
function hstrip(cx, cy, n, w, h, ang) { const a = ang * D2R, step = w + 28, o = []; for (let i = 0; i < n; i++) { const d = (i - (n - 1) / 2) * step; o.push(S(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w, h, ang, 'filmh')); } return o; }
function wstrip(cx, cy, n, w, ang, extra = 60) {
  const pad = 28, bh = n * w + (n + 1) * pad + extra, bw = w + 2 * pad, a = ang * D2R, slots = [];
  for (let i = 0; i < n; i++) { const ly = -bh / 2 + pad + w / 2 + i * (w + pad); slots.push(S(cx - Math.sin(a) * ly, cy + Math.cos(a) * ly, w, w, ang, 'plain')); }
  return { shape: { t: 'rect', cx, cy, w: bw, h: bh, r: ang, fill: '#fff', rad: 6 }, slots };
}
const LAYOUTS = [];
const add = (id, name, group, theme, slots, o = {}) => LAYOUTS.push(Object.assign({ id, name, group, theme, slots, shapes: [], over: [], texts: [] }, o));

/* --- Polaroid --- */
add('pol2', 'Duo Polaroid', 'Polaroid', 'blue', [S(430, 560, 640, 640, -4), S(660, 1360, 640, 640, 5)]);
add('pol2cap', 'Beach Day Duo', 'Polaroid', 'ocean', [S(560, 560, 640, 640, 3), S(520, 1360, 640, 640, -3, 'polaroid', { cap: 'Beach day' })]);
add('pol3', 'Stepped Trio', 'Polaroid', 'lavender', [S(300, 420, 500, 500, -5), S(720, 960, 500, 500, 4), S(340, 1500, 500, 500, -3)]);
add('pol4', 'Four Square', 'Polaroid', 'pink', [S(290, 520, 440, 440, -4), S(790, 560, 440, 440, 5), S(300, 1280, 440, 440, 3), S(780, 1250, 440, 440, -5)]);
add('pol6', 'Six Pack', 'Polaroid', 'yellow', [[300, 380, -3], [780, 380, 3], [300, 960, 2], [780, 960, -2], [300, 1540, -3], [780, 1540, 4]].map(a => S(a[0], a[1], 400, 400, a[2])));
add('pol5', 'Tumbled Five', 'Polaroid', 'cream', [S(650, 330, 500, 500, 8), S(720, 830, 500, 500, -5), S(430, 1250, 500, 500, -9), S(780, 1470, 400, 400, 6), S(330, 1640, 360, 360, -8)]);
add('vinyl3', 'Vinyl Trio', 'Polaroid', 'cream', [S(560, 420, 460, 460, 6), S(700, 980, 460, 460, -6), S(520, 1530, 460, 460, 4)], { shapes: [{ t: 'vinyl', cx: -60, cy: 960, r: 720 }] });
add('stack3', 'Water Stack', 'Polaroid', 'ocean', [S(690, 360, 500, 500, 3), S(700, 940, 500, 500, -3), S(680, 1500, 500, 500, 4)]);
add('cloud3', 'Cloud Trio', 'Polaroid', 'sky', [S(330, 520, 420, 560, -6), S(760, 1000, 420, 560, 4), S(360, 1480, 420, 560, -5)]);
add('instax2', 'Instax Pair', 'Polaroid', 'lavender', [S(410, 600, 520, 760, 0), S(660, 1380, 520, 760, 0)]);
add('starry3', 'Starry Trio', 'Polaroid', 'denim', [S(640, 380, 500, 420, -10), S(540, 1000, 560, 460, 0), S(440, 1560, 520, 440, 8)]);
add('round2', 'Doodle Duo', 'Polaroid', 'blue', [S(350, 560, 640, 640, 0, 'round'), S(720, 1300, 640, 640, 0, 'round')]);
(() => {
  const slots = [], shapes = [], xs = [190, 540, 890], rot = [-4, 3, -2, 4, -3, 2];
  for (let r = 0; r < 4; r++) { const y0 = 170 + r * 440; shapes.push({ t: 'line', pts: [[0, y0 - 10], [540, y0 + 50], [1080, y0 - 10]] }); xs.forEach((x, i) => slots.push(S(x, y0 + 175, 250, 250, rot[(r + i) % 6], 'pin'))); }
  add('line12', 'Clothesline 12', 'Polaroid', 'cream', slots, { shapes });
})();

/* --- Collage --- */
(() => {
  const slots = [], xs = [190, 540, 890], ys = [285, 735, 1185, 1635];
  ys.forEach((y, r) => xs.forEach((x, c) => { if (c === 1 && (r === 1 || r === 2)) return; slots.push(S(x, y, 290, 290, ((r * 3 + c) * 37 % 11) - 5)); }));
  slots.push(S(540, 960, 330, 800, 0, 'round'));
  add('scrap11', 'Teddy Scrapbook 11', 'Collage', 'brown', slots);
})();
(() => {
  const slots = [], xs = [190, 540, 890], ys = [240, 600, 960, 1320, 1680];
  ys.forEach((y, r) => xs.forEach((x, c) => { if (c === 1 && r >= 1 && r <= 3) return; slots.push(S(x, y, 250, 250, ((r * 3 + c) * 29 % 11) - 5)); }));
  slots.push(S(540, 960, 300, 1000, 0, 'round'));
  add('scrap13', 'Scrapbook 13', 'Collage', 'cream', slots);
})();
add('heart18', 'Heart Collage 18', 'Collage', 'cream', [[45, 390, 55, 48], [102, 363, 92, 72], [12, 437, 183, 155], [200, 410, 105, 73], [375, 410, 105, 73], [485, 360, 90, 72], [582, 385, 50, 47], [487, 435, 180, 153], [22, 597, 52, 52], [80, 595, 115, 115], [127, 715, 70, 70], [203, 488, 280, 330], [488, 592, 114, 115], [608, 592, 52, 52], [488, 712, 70, 70], [236, 823, 52, 52], [294, 823, 102, 86], [402, 823, 52, 52]]
  .map(([x, y, w, h]) => S((x + w / 2) * 1.55 + 13, (y + h / 2 - 360) * 1.55 + 534, (w - 4) * 1.55, (h - 4) * 1.55, 0, 'plain')), { noDeco: false });
add('note', 'Scrap Note', 'Collage', 'bw', [S(540, 930, 820, 1300, -1.5, 'tape')]);
add('contact8', 'Contact Sheet 8', 'Collage', 'dark', [360, 780, 1200, 1620].flatMap(y => [290, 790].map(x => S(x, y, 440, 330, 0, 'contact'))));

/* --- Strips & Film --- */
(() => { const a = wstrip(290, 900, 3, 380, 0), b = wstrip(790, 900, 3, 380, 0); add('strips6', 'Photo Strips 3+3', 'Strips & Film', 'blue', [...a.slots, ...b.slots], { shapes: [a.shape, b.shape] }); })();
(() => { const a = wstrip(290, 780, 3, 380, -2), b = wstrip(790, 1060, 3, 380, 2); add('offset6', 'Offset Strips', 'Strips & Film', 'denim', [...a.slots, ...b.slots], { shapes: [a.shape, b.shape] }); })();
add('film4', 'Film Strip 4', 'Strips & Film', 'bw', vstrip(540, 960, 4, 520, 400, 0));
add('film55', 'Double Film 5+5', 'Strips & Film', 'pink', [...vstrip(290, 960, 5, 360, 300, 0), ...vstrip(790, 960, 5, 360, 300, 0)]);
add('filmtilt', 'Tilted Film 4×3', 'Strips & Film', 'cream', [420, 960, 1500].flatMap(y => hstrip(540, y, 4, 240, 320, -6)));
add('memories', 'Memories Strips', 'Strips & Film', 'bw', [...hstrip(540, 450, 3, 300, 380, -10), ...hstrip(540, 980, 3, 300, 380, 8), ...hstrip(540, 1510, 3, 300, 380, -8)], { texts: [{ t: 'MEMORIES', x: 540, y: 110, size: 120, font: '"Special Elite",monospace', color: '#111', r: -3 }] });
add('clips5', 'Clipped Slides 5', 'Strips & Film', 'cream', [[260, 2], [610, -8], [960, 0], [1310, -3], [1660, 2]].map(([y, r]) => S(440, y, 400, 260, r, 'slide')), { shapes: [{ t: 'rope', x: 150 }] });
(() => {
  const w = 330, pad = 28, bh = 3 * w + 4 * pad;
  const mk = (cx, ang) => { const a = ang * D2R, cy = 1420 - bh / 2, sl = []; for (let i = 0; i < 3; i++) { const ly = -bh / 2 + pad + w / 2 + i * (w + pad); sl.push(S(cx - Math.sin(a) * ly, cy + Math.cos(a) * ly, w, w, ang, 'plain')); } return { shape: { t: 'rect', cx, cy, w: w + 2 * pad, h: bh, r: ang, fill: '#fff', rad: 4 }, slots: sl }; };
  const a = mk(400, -5), b = mk(700, 4);
  add('pocket', 'Denim Pocket Strips', 'Strips & Film', 'denim', [...a.slots, ...b.slots], { shapes: [a.shape, b.shape], over: [{ t: 'pocket', x: 210, y: 1330, w: 660, h: 520 }] });
})();

/* --- Cameras --- */
add('cam1', 'Digital Camera', 'Cameras', 'pink', [S(350, 820, 480, 360, 0, 'camera')]);
add('camp', 'Portrait Camera', 'Cameras', 'bw', [S(540, 1150, 520, 400, 0, 'camerap')]);
add('cam2', 'Camera Duo', 'Cameras', 'red', [S(350, 520, 420, 320, -8, 'camera'), S(370, 1250, 420, 320, 8, 'camera')]);
add('cam3', 'Camera Trio', 'Cameras', 'pink', [S(360, 380, 380, 285, -6, 'camera'), S(380, 960, 380, 285, 5, 'camera'), S(360, 1540, 380, 285, -5, 'camera')]);
add('camfilm', 'Film & Camera', 'Cameras', 'bw', [...vstrip(235, 960, 4, 340, 330, 0), S(665, 620, 280, 210, -4, 'camera'), S(675, 1250, 280, 210, 5, 'camera')]);
add('campol', 'Camera + Polaroids', 'Cameras', 'lavender', [S(330, 330, 420, 320, -8, 'camera'), S(700, 1100, 460, 460, 6), S(380, 1500, 460, 460, -6)]);

/* --- Phone UI --- */
add('player1', 'Music Player', 'Phone UI', 'blue', [S(540, 800, 700, 700, 0, 'phone')]);
add('player4', 'Players 2×2', 'Phone UI', 'sky', [[290, 365], [790, 365], [290, 1185], [790, 1185]].map(p => S(p[0], p[1], 380, 380, 0, 'phone')));
add('player9', 'Players 3×3', 'Phone UI', 'cream', [375, 935, 1495].flatMap(y => [190, 540, 890].map(x => S(x, y, 240, 240, 0, 'phone'))));
add('insta1', 'Insta Post', 'Phone UI', 'dark', [S(540, 820, 760, 760, -3, 'insta')]);
add('insta2', 'Insta Duo', 'Phone UI', 'dark', [S(540, 480, 520, 520, -4, 'insta'), S(540, 1400, 520, 520, 4, 'insta')]);
add('fav15', 'Favorites Grid', 'Phone UI', 'noir', [340, 686, 1032, 1378, 1724].flatMap(y => [194, 540, 886].map(x => S(x, y, 340, 340, 0, 'fav'))),
  { lock: 'noir', noDeco: true, shapes: [{ t: 'bar', x: 0, y: 0, w: W, h: 150, fill: '#fff' }], texts: [{ t: 'Favorites', x: 60, y: 85, size: 64, color: '#111', align: 'left', font: 'system-ui,sans-serif' }] });
add('camapp', 'Camera App', 'Phone UI', 'noir', [S(540, 828, 1080, 1470, 0, 'camgrid')],
  { lock: 'noir', noDeco: true, shapes: [{ t: 'bar', x: 0, y: 0, w: W, h: 92, fill: '#000' }, { t: 'bar', x: 0, y: 1563, w: W, h: 357, fill: '#000' }, { t: 'circle', cx: 540, cy: 1770, r: 92, stroke: '#fff', lw: 10 }, { t: 'circle', cx: 540, cy: 1770, r: 74, fill: '#fff' }],
    texts: [{ t: '⚡ Auto', x: 130, y: 46, size: 34, color: '#fff' }, { t: 'HDR Off', x: 540, y: 46, size: 34, color: '#fff' }, { t: 'VIDEO', x: 230, y: 1610, size: 32, color: '#ddd' }, { t: 'PHOTO', x: 430, y: 1610, size: 32, color: '#f5c518' }, { t: 'SQUARE', x: 640, y: 1610, size: 32, color: '#ddd' }, { t: 'PANO', x: 840, y: 1610, size: 32, color: '#777' }] });

/* --- Fun --- */
add('wanted', 'Wanted Poster', 'Fun', 'wanted', [S(540, 930, 920, 900, 0, 'plain')],
  { lock: 'wanted', noDeco: true, texts: [{ t: 'WANTED', x: 540, y: 190, size: 230, font: 'Rye,serif', color: '#2b1d10' }, { t: '★ DEAD OR ALIVE ★', x: 540, y: 355, size: 78, font: 'Rye,serif', color: '#2b1d10' }, { t: '$1,000,000 REWARD', x: 540, y: 1545, size: 112, font: 'Rye,serif', color: '#2b1d10' }, { t: 'Dangerously Cute and', x: 540, y: 1680, size: 60, font: '"Special Elite",monospace', color: '#2b1d10' }, { t: 'Notoriously Good Looking', x: 540, y: 1750, size: 60, font: '"Special Elite",monospace', color: '#2b1d10' }] });

/* ---------------- auto decoration (stickers placed in free space) ---------------- */
function autoDeco(L, th, seed) {
  const out = []; if (L.noDeco || !th.st.length) return out;
  const boxes = L.slots.map(slotAABB), r = seeded(seed + 7);
  for (let t = 0; t < 700 && out.length < 9; t++) {
    const sz = 90 + r() * 70, x = sz / 2 + 20 + r() * (W - sz - 40), y = sz / 2 + 20 + r() * (H - sz - 40);
    if (boxes.some(b => x + sz / 2 > b[0] - 8 && x - sz / 2 < b[2] + 8 && y + sz / 2 > b[1] - 8 && y - sz / 2 < b[3] + 8)) continue;
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < sz * 1.1)) continue;
    out.push({ type: 'emoji', e: th.st[(r() * th.st.length) | 0], x, y, size: sz, r: (r() - .5) * 50, auto: true });
  }
  return out;
}

/* ---------------- renderer ---------------- */
const _bgCache = {};
function drawBG(c, th, key, scale) {
  const k = key + '@' + Math.round(scale * 1000);
  if (!_bgCache[k]) {
    const off = document.createElement('canvas'); off.width = Math.ceil(W * scale); off.height = Math.ceil(H * scale);
    const oc = off.getContext('2d'); oc.scale(scale, scale); th.layers.forEach(fn => fn(oc)); _bgCache[k] = off;
  }
  c.drawImage(_bgCache[k], 0, 0, W, H);
}
function drawPhoto(c, s, d) {
  const img = d.img, iw = img.width, ih = img.height, sc = Math.max(s.w / iw, s.h / ih) * d.z, dw = iw * sc, dh = ih * sc;
  const mx = Math.max(0, (dw - s.w) / 2), my = Math.max(0, (dh - s.h) / 2);
  d.ox = clamp(d.ox, -mx, mx); d.oy = clamp(d.oy, -my, my);
  c.save(); c.translate(d.ox, d.oy); if (d.flip) c.scale(-1, 1);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  let src = img;
  if (ST.filter !== 'none') {
    if (CTX_FILTER) c.filter = FILTERS[ST.filter];
    else src = pixelFiltered(img, ST.filter);
  }
  c.drawImage(src, -dw / 2, -dh / 2, dw, dh); c.restore();
}

/* ---------------- filters for browsers without ctx.filter (iOS Safari) ---------------- */
const CTX_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); if (!('filter' in c)) return false; c.filter = 'grayscale(1)'; return c.filter === 'grayscale(1)'; } catch (e) { return false; } })();
const _pf = new WeakMap();
const PIX = {
  warm: (r, g, b) => { // sepia .25 + saturate 1.2 + brightness 1.05
    let R = r * (1 - .25) + (r * .393 + g * .769 + b * .189) * .25, G = g * .75 + (r * .349 + g * .686 + b * .168) * .25, B = b * .75 + (r * .272 + g * .534 + b * .131) * .25;
    return sat(R, G, B, 1.2, 1.05, 1);
  },
  cool: (r, g, b) => sat(r * .93, g * 1.0, b * 1.1, 1.1, 1.05, 1),
  bw: (r, g, b) => { const y = r * .299 + g * .587 + b * .114; return [(y - 128) * 1.1 + 128, (y - 128) * 1.1 + 128, (y - 128) * 1.1 + 128]; },
  vintage: (r, g, b) => {
    const R = r * .5 + (r * .393 + g * .769 + b * .189) * .5, G = g * .5 + (r * .349 + g * .686 + b * .168) * .5, B = b * .5 + (r * .272 + g * .534 + b * .131) * .5;
    return sat(R, G, B, .9, 1.05, .9);
  },
  soft: (r, g, b) => sat(r, g, b, 1.1, 1.08, .92),
  vivid: (r, g, b) => sat(r, g, b, 1.5, 1, 1.1)
};
function sat(r, g, b, s, br, ct) {
  const y = r * .299 + g * .587 + b * .114;
  r = y + (r - y) * s; g = y + (g - y) * s; b = y + (b - y) * s;
  r *= br; g *= br; b *= br;
  return [(r - 128) * ct + 128, (g - 128) * ct + 128, (b - 128) * ct + 128];
}
function pixelFiltered(img, name) {
  let m = _pf.get(img); if (!m) { m = {}; _pf.set(img, m); }
  if (m[name]) return m[name];
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, cv.width, cv.height);
  const id = x.getImageData(0, 0, cv.width, cv.height), d = id.data, f = PIX[name];
  if (f) for (let i = 0; i < d.length; i += 4) { const o = f(d[i], d[i + 1], d[i + 2]); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; } // Uint8ClampedArray clamps
  x.putImageData(id, 0, 0); m[name] = cv; return cv;
}
function render(c, scale, o = {}) {
  const L = o.L || LAYOUTS[ST.li], th = THEMES[o.theme ? o.theme : (L.lock || ST.theme)];
  c.save(); c.scale(scale, scale);
  if (L.frame) { c.fillStyle = L.frame.bg; c.fillRect(0, 0, W, H); } else drawBG(c, th, o.theme ? o.theme : (L.lock || ST.theme), scale);
  L.shapes.forEach(sh => drawShape(c, sh));
  L.slots.forEach((s, i) => {
    c.save(); c.translate(s.cx, s.cy); c.rotate(s.r * D2R);
    body(c, s, th);
    const d = o.thumb ? null : ST.sd[i];
    c.save(); rrect(c, -s.w / 2, -s.h / 2, s.w, s.h, winRadius(s)); c.clip();
    if (d && d.img) drawPhoto(c, s, d);
    else {
      c.fillStyle = o.thumb ? 'rgba(255,255,255,.8)' : (o.preview ? 'rgba(235,228,245,.92)' : '#ece8f1'); c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
      if (o.preview) { c.fillStyle = 'rgba(120,100,170,.55)'; c.font = `700 ${Math.min(s.w, s.h) * .3}px Fredoka, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', 0, -Math.min(s.w, s.h) * .03); c.font = `600 ${Math.min(s.w, s.h) * .09}px Fredoka, sans-serif`; c.fillText('photo ' + (i + 1), 0, Math.min(s.w, s.h) * .2); }
    }
    c.restore();
    overlay(c, s, i, th, o);
    c.restore();
  });
  if (L.frame) c.drawImage(L.frame.canvas, L.frame.x, L.frame.y, L.frame.w, L.frame.h);
  L.over.forEach(sh => drawShape(c, sh));
  L.texts.forEach(t => drawLText(c, t, th));
  if (!o.thumb) {
    ST.items.forEach(it => drawItem(c, it));
    if (ST.wm && !o.preview) { c.save(); c.font = '600 38px Fredoka, sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.95)'; c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8; c.fillText(ST.wm, W / 2, H - 36); c.restore(); }
    if (o.preview && ST.sel) {
      c.save(); c.setLineDash([14, 10]); c.lineWidth = 5; c.strokeStyle = '#ff5fa2';
      if (ST.sel.t === 'slot') { const s = L.slots[ST.sel.i]; if (s) { const g = geom(s); c.translate(s.cx, s.cy); c.rotate(s.r * D2R); c.strokeRect(g.x0 - 8, g.y0 - 8, g.x1 - g.x0 + 16, g.y1 - g.y0 + 16); } }
      else { const it = ST.items[ST.sel.i]; if (it) { const [hw, hh] = measure(it); c.translate(it.x, it.y); c.rotate((it.r || 0) * D2R); c.strokeRect(-hw, -hh, hw * 2, hh * 2); } }
      c.restore();
    }
  }
  c.restore();
}
function exportCanvas(scale) {
  const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
  const x = cv.getContext('2d'); render(x, scale, { preview: false });
  Object.keys(_bgCache).forEach(k => { if (+k.split('@')[1] > 1000) delete _bgCache[k]; }); // free big export backgrounds
  return cv;
}
