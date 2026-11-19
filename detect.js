'use strict';
/* =====================================================================
   Frame auto-detect: finds the "photo windows" in an uploaded frame design
   Modes: auto | alpha (transparent holes) | green / magenta (chroma-key) | flat (plain-colour boxes)
   ===================================================================== */
function fitBox(idx, aw, ah) {
  const n = idx.length; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const rowMin = new Map(), rowMax = new Map(), colMin = new Map(), colMax = new Map();
  for (const p of idx) {
    const x = p % aw, y = (p / aw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (!rowMin.has(y) || x < rowMin.get(y)) rowMin.set(y, x); if (!rowMax.has(y) || x > rowMax.get(y)) rowMax.set(y, x);
    if (!colMin.has(x) || y < colMin.get(x)) colMin.set(x, y); if (!colMax.has(x) || y > colMax.get(x)) colMax.set(x, y);
  }
  const pts = []; rowMin.forEach((x, y) => { pts.push(x, y, rowMax.get(y), y); }); colMin.forEach((y, x) => { pts.push(x, y, x, colMax.get(x)); });
  const ext = deg => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) { const u = pts[i] * c + pts[i + 1] * s, v = -pts[i] * s + pts[i + 1] * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    return { deg, u0, u1, v0, v1, area: (u1 - u0 + 1) * (v1 - v0 + 1) }; };
  let best = ext(0);
  for (let d = -45; d < 45; d += 1.5) { const e = ext(d); if (e.area < best.area * .985) best = e; }
  const c0 = best.deg; for (let d = c0 - 1.5; d <= c0 + 1.5; d += .25) { const e = ext(d); if (e.area < best.area) best = e; }
  if (Math.abs(best.deg) < 1) best = ext(0);
  const a = best.deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), uc = (best.u0 + best.u1) / 2, vc = (best.v0 + best.v1) / 2;
  const box = { cx: uc * c - vc * s, cy: uc * s + vc * c, w: best.u1 - best.u0 + 1, h: best.v1 - best.v0 + 1, r: best.deg, fill: n / best.area };
  box.area = n; box.idx = idx; box.bb = [x0, y0, x1, y1]; box.edge = x0 === 0 || y0 === 0 || x1 === aw - 1 || y1 === ah - 1;
  return box;
}

function detectFrame(img, mode = 'auto') {
  const iw = img.width, ih = img.height, k = Math.min(1, 640 / Math.max(iw, ih));
  const aw = Math.max(8, Math.round(iw * k)), ah = Math.max(8, Math.round(ih * k)), N = aw * ah;
  const cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, aw, ah);
  const px = cx.getImageData(0, 0, aw, ah).data;
  let nT = 0, nG = 0, nM = 0;
  for (let i = 0; i < N; i++) {
    const a = px[i * 4 + 3], r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    if (a < 40) nT++; else if (g > 170 && r < 110 && b < 110) nG++; else if (r > 200 && b > 200 && g < 90) nM++;
  }
  let used = mode;
  if (mode === 'auto') used = nT > N * .01 ? 'alpha' : Math.max(nG, nM) > N * .01 ? (nG >= nM ? 'green' : 'magenta') : 'flat';

  // edge map: strong brightness changes act as walls so a white window never leaks into a white page
  const lum = new Float32Array(N); for (let i = 0; i < N; i++) lum[i] = px[i * 4] * .3 + px[i * 4 + 1] * .59 + px[i * 4 + 2] * .11;
  const edge = new Uint8Array(N);
  for (let y = 1; y < ah - 1; y++) for (let x = 1; x < aw - 1; x++) { const p = y * aw + x; if (Math.abs(lum[p + 1] - lum[p - 1]) + Math.abs(lum[p + aw] - lum[p - aw]) > 34) edge[p] = 1; }

  const det = { aw, ah, px, edge, mode: used, boxes: [] };
  const minA = N * .01;
  const run = (seeds, test, visited) => {
    const out = [];
    for (const p of seeds) {
      if (visited[p]) continue; const st = [p], idx = []; visited[p] = 1;
      while (st.length) {
        const q = st.pop(); idx.push(q); const x = q % aw;
        if (x > 0 && !visited[q - 1] && test(q - 1, p)) { visited[q - 1] = 1; st.push(q - 1); }
        if (x < aw - 1 && !visited[q + 1] && test(q + 1, p)) { visited[q + 1] = 1; st.push(q + 1); }
        if (q >= aw && !visited[q - aw] && test(q - aw, p)) { visited[q - aw] = 1; st.push(q - aw); }
        if (q < N - aw && !visited[q + aw] && test(q + aw, p)) { visited[q + aw] = 1; st.push(q + aw); }
      }
      if (idx.length >= minA) out.push(idx);
    }
    return out;
  };
  const all = new Uint32Array(N).map((_, i) => i);
  let cands = [];
  if (used === 'flat') {
    for (const tol of [14, 34, 80]) {
      const visited = new Uint8Array(N);
      const test = (q, p) => !edge[q] && px[q * 4 + 3] > 200 && Math.abs(px[q * 4] - px[p * 4]) + Math.abs(px[q * 4 + 1] - px[p * 4 + 1]) + Math.abs(px[q * 4 + 2] - px[p * 4 + 2]) < tol;
      const seeds = all.filter(p => !edge[p] && px[p * 4 + 3] > 200);
      cands.push(...run(seeds, test, visited).map(i => fitBox(i, aw, ah)));
    }
  } else {
    const hole = p => { const a = px[p * 4 + 3], r = px[p * 4], g = px[p * 4 + 1], b = px[p * 4 + 2]; return used === 'alpha' ? a < 40 : used === 'green' ? (a > 40 && g > 170 && r < 110 && b < 110) : (a > 40 && r > 200 && b > 200 && g < 90); };
    cands = run(all.filter(hole), hole, new Uint8Array(N)).map(i => fitBox(i, aw, ah));
  }
  const flat = used === 'flat';
  let boxes = cands.filter(b => {
    if (b.area > N * .7) return false;
    if (b.w < Math.min(aw, ah) * .05 || b.h < Math.min(aw, ah) * .05) return false;
    const ar = Math.max(b.w / b.h, b.h / b.w); if (ar > 5) return false;
    if (b.edge && (b.fill < .9 || b.area > N * .3)) return false;
    return b.fill >= (flat ? .72 : .5);
  });
  // drop duplicates found by both passes, and big cards that merely surround a smaller window
  const inside = (a, b) => b.cx > a.bb[0] && b.cx < a.bb[2] && b.cy > a.bb[1] && b.cy < a.bb[3];
  const dup = (a, b) => inside(a, b) && inside(b, a) && Math.min(a.area, b.area) / Math.max(a.area, b.area) > .7;
  boxes = boxes.filter((a, i) => !boxes.some((b, j) => j !== i && ((dup(a, b) && j < i) || (!dup(a, b) && inside(a, b) && b.area < a.area * .7))));
  boxes.sort((a, b) => b.area - a.area); boxes = boxes.slice(0, 16);
  boxes.forEach(b => { b.w += 3; b.h += 3; b.use = true; b.manual = false; });
  boxes.sort((a, b) => a.cy - b.cy);
  const rows = []; boxes.forEach(b => { const r = rows.find(r => Math.abs(r.cy - b.cy) < Math.min(b.h, r.h) * .5); if (r) r.items.push(b); else rows.push({ cy: b.cy, h: b.h, items: [b] }); });
  det.boxes = rows.flatMap(r => r.items.sort((a, b) => a.cx - b.cx));
  let R = 0, G = 0, B = 0, cnt = 0;
  for (let i = 0; i < aw; i++) for (const y of [0, ah - 1]) { const p = (y * aw + i) * 4; if (px[p + 3] > 200) { R += px[p]; G += px[p + 1]; B += px[p + 2]; cnt++; } }
  det.bg = cnt ? `rgb(${Math.round(R / cnt)},${Math.round(G / cnt)},${Math.round(B / cnt)})` : '#ffffff';
  return det;
}

/* magic wand: tap a missed spot and its shape is found from the colour under your finger */
function wandBox(det, x, y, tol = 40) {
  const { aw, ah, px, edge } = det, N = aw * ah; x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= aw || y >= ah) return null;
  let p = y * aw + x;
  if (edge[p]) { let found = -1; for (let d = 1; d <= 4 && found < 0; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const q = (y + dy) * aw + x + dx; if (x + dx >= 0 && x + dx < aw && y + dy >= 0 && y + dy < ah && !edge[q]) { found = q; break; } } if (found < 0) return null; p = found; }
  const visited = new Uint8Array(N), st = [p], idx = []; visited[p] = 1;
  const ok = q => !visited[q] && !edge[q] && Math.abs(px[q * 4] - px[p * 4]) + Math.abs(px[q * 4 + 1] - px[p * 4 + 1]) + Math.abs(px[q * 4 + 2] - px[p * 4 + 2]) < tol;
  while (st.length) { const q = st.pop(); idx.push(q); const qx = q % aw; if (qx > 0 && ok(q - 1)) { visited[q - 1] = 1; st.push(q - 1); } if (qx < aw - 1 && ok(q + 1)) { visited[q + 1] = 1; st.push(q + 1); } if (q >= aw && ok(q - aw)) { visited[q - aw] = 1; st.push(q - aw); } if (q < N - aw && ok(q + aw)) { visited[q + aw] = 1; st.push(q + aw); } }
  if (idx.length < 60 || idx.length > N * .7) return null;
  const b = fitBox(idx, aw, ah); b.w += 3; b.h += 3; b.use = true; b.manual = true; return b;
}

function buildFrameLayout(img, det, name) {
  const use = det.boxes.filter(b => b.use);
  const s = Math.min(W / img.width, H / img.height), fw = img.width * s, fh = img.height * s, fx = (W - fw) / 2, fy = (H - fh) / 2;
  const cw = Math.max(2, Math.round(Math.min(img.width, fw * 2))), ch = Math.max(2, Math.round(cw * fh / fw));
  const fc = document.createElement('canvas'); fc.width = cw; fc.height = ch;
  const x = fc.getContext('2d'); x.drawImage(img, 0, 0, cw, ch);
  // punch the selected windows out of the frame so photos show through
  const mc = document.createElement('canvas'); mc.width = det.aw; mc.height = det.ah;
  const mx = mc.getContext('2d'), id = mx.createImageData(det.aw, det.ah), d = id.data, N = det.aw * det.ah;
  const put = p => { if (p >= 0 && p < N) d[p * 4 + 3] = 255; };
  // in transparent-hole mode the PNG already has real holes at full resolution – punching a low-res mask would only add jagged edges
  use.forEach(b => { if (b.idx && det.mode !== 'alpha') for (const p of b.idx) { put(p); put(p - 1); put(p + 1); put(p - det.aw); put(p + det.aw); } });
  mx.putImageData(id, 0, 0);
  x.globalCompositeOperation = 'destination-out'; x.imageSmoothingEnabled = true; x.drawImage(mc, 0, 0, cw, ch);
  const kx = cw / det.aw, ky = ch / det.ah;
  use.filter(b => !b.idx).forEach(b => { x.save(); x.translate(b.cx * kx, b.cy * ky); x.rotate(b.r * D2R); x.fillRect(-b.w / 2 * kx, -b.h / 2 * ky, b.w * kx, b.h * ky); x.restore(); });
  x.globalCompositeOperation = 'source-over';
  const kk = fw / det.aw;
  const slots = use.map(b => S(fx + b.cx * kk, fy + b.cy * kk, b.w * kk, b.h * kk, b.r, 'plain'));
  return { id: 'my' + Date.now(), name, group: 'My Frames', theme: 'blue', slots, shapes: [], over: [], texts: [], lock: 'noir', noDeco: true, custom: true, frame: { canvas: fc, x: fx, y: fy, w: fw, h: fh, bg: det.bg } };
}
