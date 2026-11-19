'use strict';
/* =====================================================================
   Snap & Style – UI, auth (Supabase), camera, gallery
   Requires engine.js (loaded first).
   ===================================================================== */
const SUPABASE_URL = 'https://erkpmaxlankdkchvnbol.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WbYj-RnCF4tD03hyS8aEyQ_p2itl3pv'; // publishable key – safe in front-end code
const BUCKET = 'booth';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let sb = null;
try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.warn('Supabase not available – guest mode only', e); }

function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

/* =====================================================================
   LOGIN
   ===================================================================== */
let signup = false, guest = false;
function authMsg(text, kind = '') { const m = $('#authMsg'); m.textContent = text; m.className = kind; }

(function floaters() {
  const em = ['💖', '⭐', '✨', '🎀', '🌸', '🦋', '🐾', '❄️', '🍓', '☁️'], box = $('#floaters');
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = em[i % em.length];
    s.style.left = Math.random() * 100 + '%';
    s.style.fontSize = 18 + Math.random() * 26 + 'px';
    s.style.animationDuration = 12 + Math.random() * 14 + 's';
    s.style.animationDelay = -Math.random() * 20 + 's';
    box.appendChild(s);
  }
})();

$('#togglePass').onclick = () => { const p = $('#pass'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#togglePass').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
$('#switchMode').onclick = () => {
  signup = !signup;
  $('#switchMode').textContent = signup ? 'Have an account? Sign in' : 'New here? Create account';
  $('#btnEmail').textContent = signup ? 'Create account ✨' : "Let's Snap! ✨";
  $('#pass').autocomplete = signup ? 'new-password' : 'current-password';
  authMsg('');
};
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  if (!sb) return authMsg('Cloud login is unavailable right now – try Guest.', 'err');
  const email = $('#email').value.trim(), password = $('#pass').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return authMsg('Please enter a valid email.', 'err');
  if (password.length < 6) return authMsg('Password needs at least 6 characters.', 'err');
  $('#btnEmail').disabled = true; authMsg('One sec…');
  try {
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) authMsg('Almost there! Check your inbox to verify your email ✉️', 'ok');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) { authMsg(err.message || 'Something went wrong.', 'err'); }
  $('#btnEmail').disabled = false;
};
$('#btnForgot').onclick = async () => {
  const email = $('#email').value.trim();
  if (!sb || !email) return authMsg('Type your email above first, then tap “Forgot password?”.', 'err');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? error.message : 'Reset link sent – check your email 💌', error ? 'err' : 'ok');
};
$('#btnGoogle').onclick = async () => {
  if (!sb) return authMsg('Cloud login is unavailable right now – try Guest.', 'err');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) authMsg(error.message + ' (Enable the Google provider in Supabase → Authentication → Providers.)', 'err');
};
$('#btnGuest').onclick = () => { guest = true; ST.user = null; enterApp(); };

$('#pwForm').onsubmit = async e => {
  e.preventDefault();
  const a = $('#newPass').value, b = $('#newPass2').value, m = $('#pwMsg');
  if (a.length < 6) { m.textContent = 'Password needs at least 6 characters.'; return; }
  if (a !== b) { m.textContent = 'The two passwords don’t match.'; return; }
  m.textContent = 'Saving…';
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) { m.textContent = error.message; return; }
  $('#pwModal').hidden = true; $('#newPass').value = $('#newPass2').value = ''; m.textContent = '';
  toast('Password updated ✨');
};
$('#pwCancel').onclick = () => { $('#pwModal').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['pwModal', 'galModal', 'home'].forEach(id => { $('#' + id).hidden = true; }); });

function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#home').hidden = true; }
let appStarted = false;
function enterApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  const u = ST.user;
  $('#userChip').textContent = u ? (u.email || 'Signed in') : 'Guest';
  $('#btnAuth').textContent = u ? 'Sign out' : 'Sign in';
  const wm = $('#wm'); wm.disabled = !u; wm.placeholder = u ? 'Your name or @handle' : 'Sign in to unlock';
  if (!u) { wm.value = ''; ST.wm = ''; }
  if (!appStarted) { appStarted = true; initStudio(); } else if (u) syncCloudFrames();
  $('#home').hidden = false; dirty();
}
$('#btnAuth').onclick = async () => {
  if (ST.user && sb) { await sb.auth.signOut(); }
  guest = false; ST.user = null; showLogin();
};
async function initAuth() {
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) { ST.user = data.session.user; enterApp(); }
  } catch (e) { console.warn(e); }
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { if (session) { ST.user = session.user; enterApp(); } $('#pwModal').hidden = false; $('#newPass').focus(); return; }
    if (session && (!ST.user || ST.user.id !== session.user.id)) { ST.user = session.user; enterApp(); }
    else if (!session && ev === 'SIGNED_OUT' && !guest) { ST.user = null; showLogin(); }
  });
}

/* =====================================================================
   STUDIO
   ===================================================================== */
const cv = $('#cv');
let needDraw = false;
function dirty() { if (needDraw) return; needDraw = true; requestAnimationFrame(() => { needDraw = false; draw(); }); }
function draw() { const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); render(c, cv.width / W, { preview: true }); }

let groupFilter = 'All', q = '';
const COMMON = ['⭐', '💖', '✨', '🎀', '🦋', '🌸', '🍓', '🐻', '🌈', '💋', '🪩', '📸', '🎞️', '🎵', '☁️', '🔥', '🐱', '🐶', '🌻', '💜', '🧸', '🍒', '👑', '🥰'];

function initStudio() {
  // fonts → redraw once they are ready
  Promise.all(['Fredoka', 'Pacifico', 'Rye', '"Special Elite"', 'Caveat', '"Playfair Display"'].map(f => document.fonts.load('40px ' + f).catch(() => 0))).then(dirty);
  buildGroups(); buildTemplates(); buildThemes(); buildTray();
  setLayout(0, true);
  restoreFrames().then(syncCloudFrames);
}

function buildGroups() {
  const gs = ['All', ...new Set(LAYOUTS.map(l => l.group))];
  const box = $('#groups'); box.innerHTML = '';
  gs.forEach(g => { const b = document.createElement('button'); b.textContent = g; b.className = g === groupFilter ? 'on' : ''; b.onclick = () => { groupFilter = g; buildGroups(); buildTemplates(); }; box.appendChild(b); });
}
function buildTemplates() {
  const grid = $('#tplGrid'); grid.innerHTML = '';
  LAYOUTS.forEach((L, i) => {
    if (groupFilter !== 'All' && L.group !== groupFilter) return;
    if (q && !(L.name + ' ' + L.group).toLowerCase().includes(q)) return;
    const b = document.createElement('button'); b.title = L.name; b.className = i === ST.li ? 'on' : ''; b.dataset.i = i;
    const c = document.createElement('canvas'); c.width = 90; c.height = 160;
    render(c.getContext('2d'), 90 / W, { thumb: true, L, theme: L.lock || L.theme });
    b.appendChild(c); const sp = document.createElement('span'); sp.textContent = L.name; b.appendChild(sp);
    b.onclick = () => setLayout(i);
    grid.appendChild(b);
  });
}
$('#search').oninput = e => { q = e.target.value.trim().toLowerCase(); buildTemplates(); };

function buildThemes() {
  const box = $('#themes'); box.innerHTML = '';
  Object.entries(THEMES).forEach(([k, t]) => {
    if (t.hidden) return;
    const b = document.createElement('button'); b.style.background = t.sw; b.title = t.n; b.dataset.k = k; b.setAttribute('aria-label', t.n);
    b.onclick = () => { ST.theme = k; regenDeco(); markThemes(); dirty(); };
    box.appendChild(b);
  });
  markThemes();
}
function markThemes() {
  const L = LAYOUTS[ST.li], lock = !!L.lock;
  $$('#themes button').forEach(b => { b.classList.toggle('on', !lock && b.dataset.k === ST.theme); b.disabled = lock; });
  $('#lockNote').hidden = !lock;
}
function buildTray() {
  const box = $('#tray'); box.innerHTML = '';
  const th = THEMES[ST.theme];
  [...new Set([...th.st, ...COMMON])].forEach(e => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => addItem({ type: 'emoji', e, size: 150 }); box.appendChild(b); });
}

function setLayout(i, first) {
  ST.li = i; ST.sel = null;
  const L = LAYOUTS[i];
  if (!L.lock && first) ST.theme = L.theme;
  else if (!L.lock && !first && !ST.themeTouched) ST.theme = L.theme;
  regenDeco(); markThemes(); buildTray();
  $$('#tplGrid button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  $('#btnEditFrame').hidden = !L.custom; $('#btnDelFrame').hidden = !L.custom;
  updatePanel(); dirty();
}
function regenDeco() {
  const L = LAYOUTS[ST.li], th = THEMES[L.lock || ST.theme];
  const mine = ST.items.filter(x => !x.auto);
  ST.items = [...autoDeco(L, th, ST.li * 13 + 1), ...mine];
  if (ST.sel && ST.sel.t === 'item') ST.sel = null;
}
$('#btnRespark').onclick = () => { const L = LAYOUTS[ST.li], th = THEMES[L.lock || ST.theme]; const mine = ST.items.filter(x => !x.auto); ST.items = [...autoDeco(L, th, Math.floor(Math.random() * 9999)), ...mine]; ST.sel = null; updatePanel(); dirty(); };

/* ---------- photos ---------- */
async function loadFile(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    try { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
    catch (e2) {
      if (/hei[cf]/i.test(file.type + ' ' + file.name)) { toast('HEIC photos aren’t supported in this browser – export as JPG or use Safari 📱', 5000); e2.heic = true; }
      throw e2;
    }
  }
  const m = Math.max(bmp.width, bmp.height);
  if (m <= 2600) return bmp;
  const k = 2600 / m, c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c;
}
function setSlotImg(i, img) { ST.sd[i] = { img, z: 1, ox: 0, oy: 0, flip: false }; }
async function fillFiles(files, targetIdx) {
  const L = LAYOUTS[ST.li]; files = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!files.length) return toast('Please choose image files 🖼️');
  try {
    if (targetIdx != null && files.length === 1) { setSlotImg(targetIdx, await loadFile(files[0])); ST.sel = { t: 'slot', i: targetIdx }; }
    else {
      const order = [...L.slots.keys()].sort((a, b) => ((ST.sd[a] && ST.sd[a].img) ? 1 : 0) - ((ST.sd[b] && ST.sd[b].img) ? 1 : 0) || a - b);
      let n = 0; for (const f of files) { if (n >= order.length) break; setSlotImg(order[n++], await loadFile(f)); }
      if (files.length > order.length) toast(`Only ${order.length} frames here – extra photos skipped`);
    }
  } catch (e) { if (!e.heic) toast('Could not read that image 😢'); console.error(e); }
  updatePanel(); dirty();
}
$('#fileMulti').onchange = e => { fillFiles(e.target.files); e.target.value = ''; };
let slotTarget = null;
$('#fileSlot').onchange = e => { if (slotTarget != null) fillFiles(e.target.files, slotTarget); e.target.value = ''; };
const pickMulti = () => $('#fileMulti').click();
$('#btnUpload').onclick = pickMulti; $('#tbUpload').onclick = pickMulti;
$('#btnClear').onclick = () => { ST.sd = []; ST.sel = null; updatePanel(); dirty(); };
$('#btnShuffle').onclick = () => { const L = LAYOUTS[ST.li]; const imgs = L.slots.map((_, i) => ST.sd[i] && ST.sd[i].img).filter(Boolean); for (let i = imgs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[imgs[i], imgs[j]] = [imgs[j], imgs[i]]; } ST.sd = []; imgs.forEach((im, i) => setSlotImg(i, im)); dirty(); };
$('#filter').onchange = e => { ST.filter = e.target.value; dirty(); };
$('#wm').oninput = e => { ST.wm = e.target.value; };

/* drag & drop onto a frame */
cv.addEventListener('dragover', e => e.preventDefault());
cv.addEventListener('drop', e => { e.preventDefault(); const p = toCanvas(e), h = hit(p); fillFiles(e.dataTransfer.files, h && h.t === 'slot' ? h.i : undefined); });

/* ---------- items (stickers / text) ---------- */
function addItem(it) {
  it.x = W / 2 + (Math.random() - .5) * 200; it.y = H / 2 + (Math.random() - .5) * 300; it.r = (Math.random() - .5) * 20;
  ST.items.push(it); ST.sel = { t: 'item', i: ST.items.length - 1 }; updatePanel(); dirty();
}
$('#btnAddTxt').onclick = () => { const t = $('#txtIn').value.trim(); if (!t) return toast('Type something first ✍️'); addItem({ type: 'text', t, size: 110, color: $('#txtColor').value, font: $('#txtFont').value }); $('#txtIn').value = ''; };
$('#btnStickerImg').onclick = () => $('#fileSticker').click();
$('#fileSticker').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const img = await loadFile(f); addItem({ type: 'img', img, size: 360, ar: img.height / img.width }); } catch (er) { toast('Could not read that image'); } };

/* ---------- selection panel ---------- */
function updatePanel() {
  const s = ST.sel, slotCtl = $('#slotCtl'), itemCtl = $('#itemCtl');
  slotCtl.hidden = !(s && s.t === 'slot'); itemCtl.hidden = !(s && s.t === 'item');
  if (s && s.t === 'slot') { const d = ST.sd[s.i]; $('#zoom').value = d ? d.z : 1; $('#zoom').disabled = !(d && d.img); }
  if (s && s.t === 'item') { const it = ST.items[s.i]; if (it) { $('#iSize').value = it.size; $('#iRot').value = it.r || 0; } }
}
$('#zoom').oninput = e => { const s = ST.sel; if (s && s.t === 'slot' && ST.sd[s.i]) { ST.sd[s.i].z = +e.target.value; dirty(); } };
$('#btnFlip').onclick = () => { const s = ST.sel; if (s && ST.sd[s.i]) { ST.sd[s.i].flip = !ST.sd[s.i].flip; dirty(); } };
$('#btnRemove').onclick = () => { const s = ST.sel; if (s && s.t === 'slot') { delete ST.sd[s.i]; updatePanel(); dirty(); } };
$('#btnReplace').onclick = () => { const s = ST.sel; if (s && s.t === 'slot') { slotTarget = s.i; $('#fileSlot').click(); } };
$('#iSize').oninput = e => { const s = ST.sel; if (s && s.t === 'item') { ST.items[s.i].size = +e.target.value; ST.items[s.i].auto = false; dirty(); } };
$('#iRot').oninput = e => { const s = ST.sel; if (s && s.t === 'item') { ST.items[s.i].r = +e.target.value; ST.items[s.i].auto = false; dirty(); } };
$('#btnDelItem').onclick = () => { const s = ST.sel; if (s && s.t === 'item') { ST.items.splice(s.i, 1); ST.sel = null; updatePanel(); dirty(); } };
$('#btnFront').onclick = () => { const s = ST.sel; if (s && s.t === 'item') { const [it] = ST.items.splice(s.i, 1); it.auto = false; ST.items.push(it); ST.sel = { t: 'item', i: ST.items.length - 1 }; dirty(); } };
document.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && ST.sel && ST.sel.t === 'item' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) $('#btnDelItem').click(); });

/* ---------- pointer interaction on the canvas ---------- */
function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function toLocal(p, cx, cy, rot) { const a = -rot * D2R, dx = p.x - cx, dy = p.y - cy; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; }
function hit(p) {
  for (let i = ST.items.length - 1; i >= 0; i--) { const it = ST.items[i], l = toLocal(p, it.x, it.y, it.r || 0), [hw, hh] = measure(it); if (Math.abs(l.x) <= hw && Math.abs(l.y) <= hh) return { t: 'item', i }; }
  const L = LAYOUTS[ST.li];
  for (let i = L.slots.length - 1; i >= 0; i--) { const s = L.slots[i], l = toLocal(p, s.cx, s.cy, s.r), g = geom(s); if (l.x >= g.x0 && l.x <= g.x1 && l.y >= g.y0 && l.y <= g.y1) return { t: 'slot', i, win: Math.abs(l.x) <= s.w / 2 && Math.abs(l.y) <= s.h / 2 }; }
  return null;
}
const ptrs = new Map(); let drag = null, pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && ST.sel) { const [a, b] = [...ptrs.values()]; const s = ST.sel; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), v: s.t === 'slot' ? (ST.sd[s.i] ? ST.sd[s.i].z : 1) : ST.items[s.i].size }; drag = null; return; }
  const p = toCanvas(e), h = hit(p);
  ST.sel = h ? { t: h.t, i: h.i } : null;
  drag = h ? { ...h, sx: p.x, sy: p.y, moved: false } : null;
  updatePanel(); dirty();
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], k = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, s = ST.sel;
    if (s.t === 'slot' && ST.sd[s.i]) ST.sd[s.i].z = clamp(pinch.v * k, 1, 4); else if (s.t === 'item') { ST.items[s.i].size = clamp(pinch.v * k, 30, 500); ST.items[s.i].auto = false; }
    updatePanel(); dirty(); return;
  }
  if (!drag) return;
  const p = toCanvas(e), dx = p.x - drag.sx, dy = p.y - drag.sy;
  if (Math.hypot(dx, dy) > 6) drag.moved = true;
  if (!drag.moved) return;
  drag.sx = p.x; drag.sy = p.y;
  if (drag.t === 'item') { const it = ST.items[drag.i]; it.x += dx; it.y += dy; it.auto = false; }
  else { const d = ST.sd[drag.i]; if (d && d.img && drag.win) { const s = LAYOUTS[ST.li].slots[drag.i], a = -s.r * D2R; d.ox += dx * Math.cos(a) - dy * Math.sin(a); d.oy += dx * Math.sin(a) + dy * Math.cos(a); } }
  dirty();
});
function endPtr(e) {
  const had = ptrs.delete(e.pointerId); if (!had) return;
  if (ptrs.size < 2) pinch = null;
  if (drag && !drag.moved && drag.t === 'slot' && !(ST.sd[drag.i] && ST.sd[drag.i].img)) { slotTarget = drag.i; $('#fileSlot').click(); }
  if (!ptrs.size) drag = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => {
  const s = ST.sel; if (!s) return; e.preventDefault();
  const k = Math.exp(-e.deltaY * .0015);
  if (s.t === 'slot' && ST.sd[s.i]) ST.sd[s.i].z = clamp(ST.sd[s.i].z * k, 1, 4); else if (s.t === 'item') { ST.items[s.i].size = clamp(ST.items[s.i].size * k, 30, 500); ST.items[s.i].auto = false; }
  updatePanel(); dirty();
}, { passive: false });

/* =====================================================================
   CAMERA / PHOTO BOOTH
   ===================================================================== */
const vid = $('#vid'); let stream = null, facing = 'user', boothRun = false, camOpen = false, camTarget = 0;
async function startStream() {
  stopStream();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    vid.srcObject = stream; await vid.play(); applyMirror();
  } catch (e) { toast('Camera unavailable – check browser permission, or use Upload instead 📁', 4200); closeCam(); }
}
function stopStream() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
function applyMirror() { vid.classList.toggle('mirror', facing === 'user' && $('#mirror').checked); }
/* The camera view takes the exact shape of the frame slot being filled, so what you see is what gets placed. */
function setCamTarget(i, msg) {
  const L = LAYOUTS[ST.li]; camTarget = i; const s = L.slots[i];
  $('#camview').style.setProperty('--ar', (s.w / s.h).toFixed(4));
  $('#camInfo').textContent = msg || `Photo ${i + 1} of ${L.slots.length} – line yourself up in the box`;
}
function openCam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Camera needs https:// or localhost – use Upload for now');
  camOpen = true; $('#camModal').hidden = false; setCamTarget(nextTarget()); startStream();
}
function closeCam() { camOpen = false; boothRun = false; stopStream(); $('#camModal').hidden = true; $('#count').textContent = ''; }
function snap() {
  const s = LAYOUTS[ST.li].slots[camTarget], ar = s.w / s.h, vw = vid.videoWidth, vh = vid.videoHeight;
  let cw, ch; if (vw / vh > ar) { ch = vh; cw = vh * ar; } else { cw = vw; ch = vw / ar; }
  const c = document.createElement('canvas'); c.width = Math.round(cw); c.height = Math.round(ch); const x = c.getContext('2d');
  if (facing === 'user' && $('#mirror').checked) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(vid, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height); return c;
}
async function countdown() {
  const n = +$('#camSecs').value;
  for (let i = n; i > 0; i--) { if (!camOpen) return false; $('#count').textContent = i; await sleep(1000); }
  $('#count').textContent = ''; if (!camOpen) return false;
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); return true;
}
function nextTarget() { const L = LAYOUTS[ST.li]; if (ST.sel && ST.sel.t === 'slot') return ST.sel.i; const e = L.slots.findIndex((_, i) => !(ST.sd[i] && ST.sd[i].img)); return e >= 0 ? e : 0; }
$('#camShot').onclick = async () => {
  if (boothRun) return; boothRun = true;
  if (await countdown()) { const i = camTarget; setSlotImg(i, snap()); ST.sel = { t: 'slot', i }; updatePanel(); dirty(); const L = LAYOUTS[ST.li], e = L.slots.findIndex((_, k) => !(ST.sd[k] && ST.sd[k].img)); setCamTarget(e >= 0 ? e : i, `✓ Photo ${i + 1} saved – ${e >= 0 ? 'next is photo ' + (e + 1) : 'all frames filled!'}`); }
  boothRun = false;
};
$('#camBooth').onclick = async () => {
  if (boothRun) return; boothRun = true;
  const L = LAYOUTS[ST.li]; let idx = L.slots.map((_, i) => i).filter(i => !(ST.sd[i] && ST.sd[i].img)); if (!idx.length) idx = L.slots.map((_, i) => i);
  for (const i of idx) { if (!boothRun || !camOpen) break; setCamTarget(i, `Photo ${idx.indexOf(i) + 1} of ${idx.length} – get ready!`); await sleep(500); if (!(await countdown())) break; setSlotImg(i, snap()); dirty(); await sleep(700); }
  const done = boothRun; boothRun = false; if (done && camOpen) { closeCam(); toast('Booth finished! Drag photos to adjust ✨'); }
};
$('#camSwitch').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startStream(); };
$('#mirror').onchange = applyMirror; $('#camClose').onclick = closeCam;
$('#btnCam').onclick = openCam; $('#tbCam').onclick = openCam;
$('#btnBooth').onclick = openCam; $('#tbBooth').onclick = openCam;

/* =====================================================================
   MY FRAME – auto-detect photo spots in an uploaded frame design
   ===================================================================== */
let FD = null, fdDrag = null, fdSel = -1;
const fcv = $('#frameCv');
$('#btnFrameUp').onclick = () => $('#fileFrame').click();
$('#fileFrame').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const img = await loadFile(f); FD = { img, file: f, mode: 'auto', det: null, name: (f.name || 'My frame').replace(/\.[^.]+$/, '').slice(0, 24), editIdx: null, trash: [] }; $('#frameMode').value = 'auto'; $('#home').hidden = true; $('#frameModal').hidden = false; runDetect(); }
  catch (er) { toast('Could not read that image 😢'); }
};
$('#btnEditFrame').onclick = () => {
  const L = LAYOUTS[ST.li]; if (!L.src) return;
  const d = L.src.det; FD = { img: L.src.img, file: L.src.file, mode: L.src.mode, name: L.name, editIdx: ST.li, trash: [], det: { ...d, boxes: d.boxes.map(b => ({ ...b })) } };
  $('#frameMode').value = L.src.mode; fdSel = -1; $('#frameModal').hidden = false; frameRefresh();
};
$('#frameMode').onchange = e => { FD.mode = e.target.value; runDetect(); };
function runDetect() {
  const manual = FD.det ? FD.det.boxes.filter(b => b.manual || b.edited) : [];
  FD.det = detectFrame(FD.img, FD.mode); FD.det.boxes.push(...manual); fdSel = -1; frameRefresh();
}
function frameRefresh() {
  const d = FD.det, n = d.boxes.length, m = d.boxes.filter(b => b.use).length;
  $('#frameInfo').textContent = n ? `Found ${n} photo spot${n > 1 ? 's' : ''} · using ${m} → you will need ${m} photo${m === 1 ? '' : 's'}` : 'No photo spots found – tap a spot to detect it, or drag to draw a box.';
  $('#frameOk').disabled = m === 0; $('#restoreSpot').disabled = !FD.trash.length; syncBar(); drawFrameReview();
}
function syncBar() {
  const bar = $('#boxBar'), b = FD.det.boxes[fdSel]; bar.hidden = !b; if (!b) return;
  $('#barTitle').textContent = 'Spot ' + (fdSel + 1); $('#barUse').textContent = b.use ? '✕ Don’t use this' : '✔ Use this';
  const a = Math.round(b.r * 2) / 2; $('#barAng').value = a; $('#barAngN').value = a;
}
const hsz = () => Math.max(8, FD.det.aw / 55);
function handles(b) { const hw = b.w / 2, hh = b.h / 2, rh = hsz() * 3; return [[-hw, -hh, -1, -1], [hw, -hh, 1, -1], [-hw, hh, -1, 1], [hw, hh, 1, 1], [0, -hh, 0, -1], [0, hh, 0, 1], [-hw, 0, -1, 0], [hw, 0, 1, 0], [0, -hh - rh, 'rot', 0]]; }
function drawFrameReview() {
  const d = FD.det; fcv.width = d.aw; fcv.height = d.ah; const c = fcv.getContext('2d');
  const t = 16; for (let y = 0; y < d.ah; y += t) for (let x = 0; x < d.aw; x += t) { c.fillStyle = ((x + y) / t) % 2 ? '#dcdcdc' : '#f4f4f4'; c.fillRect(x, y, t, t); }
  c.drawImage(FD.img, 0, 0, d.aw, d.ah);
  const lw = Math.max(2.5, d.aw / 170), hs = hsz();
  d.boxes.forEach((b, i) => {
    c.save(); c.translate(b.cx, b.cy); c.rotate(b.r * D2R);
    c.fillStyle = b.use ? 'rgba(60,200,120,.28)' : 'rgba(120,120,120,.35)'; c.strokeStyle = b.use ? '#16a34a' : '#666'; c.lineWidth = lw * (i === fdSel ? 1.8 : 1); c.setLineDash(b.use ? [] : [lw * 2.5, lw * 2]);
    c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); c.setLineDash([]);
    const r = Math.max(12, Math.min(b.w, b.h) * .14); c.fillStyle = b.use ? '#16a34a' : '#666'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = `700 ${r * 1.1}px Fredoka, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.use ? i + 1 : '✕', 0, 1);
    if (i === fdSel) {
      c.strokeStyle = '#ff5fa2'; c.lineWidth = lw; c.beginPath(); c.moveTo(0, -b.h / 2); c.lineTo(0, -b.h / 2 - hs * 3); c.stroke();
      handles(b).forEach(h => { c.fillStyle = '#fff'; c.strokeStyle = '#ff5fa2'; c.lineWidth = lw; c.beginPath(); if (h[2] === 'rot') c.arc(h[0], h[1], hs * .9, 0, 7); else c.rect(h[0] - hs / 2, h[1] - hs / 2, hs, hs); c.fill(); c.stroke(); });
    }
    c.restore();
  });
  if (fdDrag && fdDrag.type === 'new' && fdDrag.draw) { c.strokeStyle = '#ff5fa2'; c.lineWidth = lw; c.setLineDash([lw * 2, lw * 2]); c.strokeRect(Math.min(fdDrag.x0, fdDrag.x1), Math.min(fdDrag.y0, fdDrag.y1), Math.abs(fdDrag.x1 - fdDrag.x0), Math.abs(fdDrag.y1 - fdDrag.y0)); }
}
function fPt(e) { const r = fcv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * fcv.width, y: (e.clientY - r.top) / r.height * fcv.height }; }
function fHit(p) { const bs = FD.det.boxes; for (let i = bs.length - 1; i >= 0; i--) { const b = bs[i], l = toLocal(p, b.cx, b.cy, b.r); if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) return i; } return -1; }
function fHandle(p) { const b = FD.det.boxes[fdSel]; if (!b) return null; const l = toLocal(p, b.cx, b.cy, b.r), hs = hsz() * 1.2; return handles(b).find(h => Math.hypot(l.x - h[0], l.y - h[1]) < hs) || null; }
function edited(b) { b.idx = null; b.edited = true; }
fcv.addEventListener('pointerdown', e => {
  fcv.setPointerCapture(e.pointerId); const p = fPt(e), h = fHandle(p);
  if (h) { fdDrag = { type: h[2] === 'rot' ? 'rot' : 'size', hx: h[2] === 'rot' ? 0 : h[2], hy: h[3], i: fdSel }; return; }
  const i = fHit(p);
  if (i >= 0) { fdSel = i; fdDrag = { type: 'move', i, lx: p.x, ly: p.y, moved: false }; syncBar(); drawFrameReview(); return; }
  fdDrag = { type: 'new', x0: p.x, y0: p.y, x1: p.x, y1: p.y, draw: false, sx: e.clientX, sy: e.clientY };
});
fcv.addEventListener('pointermove', e => {
  if (!fdDrag) return; const p = fPt(e), d = fdDrag, b = FD.det.boxes[d.i];
  if (d.type === 'move') { const dx = p.x - d.lx, dy = p.y - d.ly; if (!d.moved && Math.hypot(dx, dy) < 2) return; d.moved = true; edited(b); b.cx += dx; b.cy += dy; d.lx = p.x; d.ly = p.y; }
  else if (d.type === 'rot') { let a = Math.atan2(p.y - b.cy, p.x - b.cx) * 180 / Math.PI + 90; if (a > 180) a -= 360; for (const s of [0, 90, -90, 180, -180]) if (Math.abs(a - s) < 2) a = s; edited(b); b.r = a; }
  else if (d.type === 'size') {
    edited(b); const l = toLocal(p, b.cx, b.cy, b.r); let ox = 0, oy = 0;
    if (d.hx) { const f = -d.hx * b.w / 2; const nw = Math.max(10, d.hx * (l.x - f)); ox = d.hx * (nw / 2 - b.w / 2); b.w = nw; }
    if (d.hy) { const f = -d.hy * b.h / 2; const nh = Math.max(10, d.hy * (l.y - f)); oy = d.hy * (nh / 2 - b.h / 2); b.h = nh; }
    const a = b.r * D2R; b.cx += ox * Math.cos(a) - oy * Math.sin(a); b.cy += ox * Math.sin(a) + oy * Math.cos(a);
  } else { d.x1 = p.x; d.y1 = p.y; if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.draw = true; }
  syncBar(); drawFrameReview();
});
fcv.addEventListener('pointerup', e => {
  const d = fdDrag; fdDrag = null; if (!d) return;
  if (d.type === 'new') {
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (d.draw && w > 12 && h > 12) { FD.det.boxes.push({ cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, w, h, r: 0, idx: null, use: true, manual: true }); fdSel = FD.det.boxes.length - 1; }
    else if (!d.draw) { const b = wandBox(FD.det, d.x0, d.y0); if (b) { FD.det.boxes.push(b); fdSel = FD.det.boxes.length - 1; } else { fdSel = -1; toast('Couldn’t find a shape there – drag to draw a box instead', 3200); } }
    else fdSel = -1;
  }
  frameRefresh();
});
const selBox = () => FD && FD.det.boxes[fdSel];
$('#barUse').onclick = () => { const b = selBox(); if (b) { b.use = !b.use; frameRefresh(); } };
$('#barAng').oninput = e => { const b = selBox(); if (b) { edited(b); b.r = +e.target.value; frameRefresh(); } };
$('#barAngN').oninput = e => { const b = selBox(); if (b && e.target.value !== '') { edited(b); b.r = clamp(+e.target.value, -180, 180); drawFrameReview(); $('#barAng').value = b.r; } };
[['nL', -1, 0], ['nR', 1, 0], ['nU', 0, -1], ['nD', 0, 1]].forEach(([id, dx, dy]) => { $('#' + id).onclick = () => { const b = selBox(); if (b) { edited(b); b.cx += dx; b.cy += dy; drawFrameReview(); } }; });
$('#barDel').onclick = () => { if (!selBox()) return; FD.trash.push(FD.det.boxes.splice(fdSel, 1)[0]); fdSel = -1; frameRefresh(); };
$('#restoreSpot').onclick = () => { const b = FD.trash.pop(); if (b) { b.use = true; FD.det.boxes.push(b); fdSel = FD.det.boxes.length - 1; frameRefresh(); } };
$('#addSpot').onclick = () => { const d = FD.det, w = d.aw * .3; d.boxes.push({ cx: d.aw / 2, cy: d.ah / 2, w, h: w, r: 0, idx: null, use: true, manual: true }); fdSel = d.boxes.length - 1; frameRefresh(); };
$('#frameCancel').onclick = () => { $('#frameModal').hidden = true; FD = null; };
$('#frameOk').onclick = () => {
  const L = buildFrameLayout(FD.img, FD.det, FD.name || 'My frame'); L.src = { img: FD.img, det: FD.det, mode: FD.mode, file: FD.file };
  if (FD.editIdx != null) L.id = LAYOUTS[FD.editIdx].id;
  saveFrame(L); cloudSaveFrame(L);
  $('#frameModal').hidden = true;
  if (FD.editIdx != null) { L.id = LAYOUTS[FD.editIdx].id; LAYOUTS[FD.editIdx] = L; buildTemplates(); setLayout(FD.editIdx); toast('Frame updated ✨'); }
  else { LAYOUTS.push(L); groupFilter = 'My Frames'; buildGroups(); buildTemplates(); setLayout(LAYOUTS.length - 1); ST.sd = []; toast(`Frame ready – add ${L.slots.length} photo${L.slots.length === 1 ? '' : 's'} 📸`, 4200); }
  FD = null;
};
$('#homeFrame').onclick = () => $('#fileFrame').click();

/* ---------- saved frames (IndexedDB) – custom frames survive a refresh ---------- */
const FDB = {
  open() { return this._p || (this._p = new Promise((res, rej) => { const r = indexedDB.open('snapstyle', 1); r.onupgradeneeded = () => r.result.createObjectStore('frames', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async run(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('frames', mode), rq = fn(t.objectStore('frames')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
};
async function saveFrame(L) {
  if (!L.src || !L.src.file) return;
  try {
    const d = L.src.det;
    await FDB.run('readwrite', s => s.put({
      id: L.id, name: L.name, blob: L.src.file, mode: L.src.mode, saved: Date.now(),
      boxes: d.boxes.map(b => ({ cx: b.cx, cy: b.cy, w: b.w, h: b.h, r: b.r, use: b.use, manual: !!b.manual, edited: !!b.edited, idx: b.idx || null }))
    }));
  } catch (e) { console.warn('Could not save frame', e); }
}
/* Build a layout from a saved record { id, name, blob, mode, boxes }. Returns true when added. */
async function addFrameFromRecord(r) {
  if (LAYOUTS.some(l => l.id === r.id)) return false;
  try {
    const img = await loadFile(r.blob), det = detectFrame(img, r.mode);
    const auto = det.boxes;
    det.boxes = r.boxes.map(b => {
      const o = { ...b };
      if (!o.idx && !o.manual && !o.edited) { // cloud copies drop the pixel lists: re-attach them from a fresh detection
        const m = auto.find(a => Math.hypot(a.cx - o.cx, a.cy - o.cy) < 4);
        if (m) o.idx = m.idx;
      }
      return o;
    });
    const L = buildFrameLayout(img, det, r.name); L.id = r.id; L.src = { img, det, mode: r.mode, file: r.blob };
    LAYOUTS.push(L); return true;
  } catch (e) { console.warn('Could not restore frame', r.name, e); return false; }
}
async function restoreFrames() {
  if (!window.indexedDB) return;
  let recs = [];
  try { recs = await FDB.run('readonly', s => s.getAll()); } catch (e) { return; }
  recs.sort((a, b) => a.saved - b.saved);
  let n = 0;
  for (const r of recs) if (await addFrameFromRecord(r)) n++;
  if (n) { buildGroups(); buildTemplates(); toast(`Restored ${n} saved frame${n > 1 ? 's' : ''} 🧩`); }
}

/* ---------- saved frames in your account (Supabase storage bucket "frames", run supabase-frames.sql once) ---------- */
const FBUCKET = 'frames';
const frameMeta = L => {
  const d = L.src.det;
  return { id: L.id, name: L.name, mode: L.src.mode, saved: Date.now(), type: L.src.file.type || 'image/png',
    boxes: d.boxes.map(b => ({ cx: b.cx, cy: b.cy, w: b.w, h: b.h, r: b.r, use: b.use, manual: !!b.manual, edited: !!b.edited })) };
};
async function cloudSaveFrame(L) {
  if (!ST.user || !sb || !L.src || !L.src.file) return;
  try {
    const base = ST.user.id + '/' + L.id, meta = frameMeta(L), st = sb.storage.from(FBUCKET);
    const a = await st.upload(base + '.img', L.src.file, { upsert: true, contentType: meta.type });
    if (a.error) throw a.error;
    const b = await st.upload(base + '.json', new Blob([JSON.stringify(meta)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
    if (b.error) throw b.error;
  } catch (e) { console.warn('Cloud frame save failed', e); toast('Frame saved on this device only – ' + (e.message || 'cloud save failed') + ' (run supabase-frames.sql)', 5000); }
}
async function cloudDeleteFrame(id) {
  if (!ST.user || !sb) return;
  try { await sb.storage.from(FBUCKET).remove([ST.user.id + '/' + id + '.img', ST.user.id + '/' + id + '.json']); } catch (e) { console.warn(e); }
}
let _syncing = false;
async function syncCloudFrames() {
  if (!ST.user || !sb || _syncing) return;
  _syncing = true;
  try {
    const st = sb.storage.from(FBUCKET), uid = ST.user.id;
    const { data, error } = await st.list(uid, { limit: 100 });
    if (error) throw error;
    const ids = (data || []).filter(f => f.name.endsWith('.json')).map(f => f.name.slice(0, -5)).filter(id => !LAYOUTS.some(l => l.id === id));
    let n = 0;
    for (const id of ids) {
      const m = await st.download(uid + '/' + id + '.json'), im = await st.download(uid + '/' + id + '.img');
      if (m.error || im.error) continue;
      const meta = JSON.parse(await m.data.text()), blob = new File([im.data], meta.name || 'frame', { type: meta.type || im.data.type });
      const rec = { ...meta, blob };
      if (await addFrameFromRecord(rec)) { n++; try { await FDB.run('readwrite', s => s.put(rec)); } catch (e) { /* offline cache is optional */ } }
    }
    if (n) { buildGroups(); buildTemplates(); toast(`Loaded ${n} frame${n > 1 ? 's' : ''} from your account ☁️`); }
  } catch (e) { console.warn('Cloud frame sync failed', e); }
  _syncing = false;
}
$('#btnDelFrame').onclick = async () => {
  const L = LAYOUTS[ST.li]; if (!L || !L.custom) return;
  if (!confirm(`Delete frame “${L.name}”?`)) return;
  try { await FDB.run('readwrite', s => s.delete(L.id)); } catch (e) { /* ignore */ }
  cloudDeleteFrame(L.id);
  LAYOUTS.splice(ST.li, 1); ST.sd = []; groupFilter = 'All'; buildGroups(); buildTemplates(); setLayout(0); toast('Frame deleted');
};

/* warn before closing the tab with unsaved photos */
window.addEventListener('beforeunload', e => { if (ST.sd.some(d => d && d.img)) { e.preventDefault(); e.returnValue = ''; } });

/* =====================================================================
   EXPORT / GALLERY
   ===================================================================== */
async function blobOf(scale) { try { await document.fonts.ready; } catch (e) { /* ignore */ } return new Promise(res => exportCanvas(scale).toBlob(res, 'image/png')); }
function confirmEmpty() {
  const L = LAYOUTS[ST.li], empty = L.slots.filter((_, i) => !(ST.sd[i] && ST.sd[i].img)).length;
  if (!empty) return true;
  return confirm(`${empty} photo frame${empty === 1 ? ' is' : 's are'} still empty and will export as blank boxes. Continue anyway?`);
}
async function download() {
  if (!confirmEmpty()) return;
  const prev = ST.sel; ST.sel = null;
  const b = await blobOf(+$('#expSize').value); ST.sel = prev;
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'snap-and-style-' + Date.now() + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Saved to your device 💾');
}
$('#btnDownload').onclick = download; $('#tbDownload').onclick = download;
$('#btnShare').onclick = async () => {
  if (!confirmEmpty()) return;
  const b = await blobOf(1), f = new File([b], 'snap-and-style.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: 'Snap & Style' }); } catch (e) { /* cancelled */ } }
  else { toast('Sharing not supported here – downloading instead'); download(); }
};
$('#btnSave').onclick = async () => {
  if (!ST.user || !sb) return toast('Sign in to save to your gallery 💕');
  if (!confirmEmpty()) return;
  toast('Saving…');
  const b = await blobOf(1), path = ST.user.id + '/' + Date.now() + '.png';
  const { error } = await sb.storage.from(BUCKET).upload(path, b, { contentType: 'image/png' });
  toast(error ? 'Save failed: ' + error.message + ' (run supabase-setup.sql)' : 'Saved to your gallery ✨', 4500);
};
$('#btnGallery').onclick = openGallery;
$('#galClose').onclick = () => { $('#galModal').hidden = true; };
async function openGallery() {
  if (!ST.user || !sb) return toast('Sign in to keep a gallery of your creations 💕');
  $('#galModal').hidden = false; const grid = $('#galGrid'); grid.textContent = 'Loading…';
  const { data, error } = await sb.storage.from(BUCKET).list(ST.user.id, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) { grid.textContent = 'Could not load gallery: ' + error.message; return; }
  const files = (data || []).filter(f => f.name && !f.name.startsWith('.'));
  if (!files.length) { grid.textContent = 'Nothing saved yet – make something cute! 💖'; return; }
  const paths = files.map(f => ST.user.id + '/' + f.name);
  const { data: urls } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  grid.innerHTML = '';
  (urls || []).forEach((u, i) => {
    if (!u.signedUrl) return;
    const fig = document.createElement('figure'), img = document.createElement('img'), cap = document.createElement('figcaption');
    img.src = u.signedUrl; img.loading = 'lazy'; img.alt = 'Saved creation';
    const a = document.createElement('a'); a.href = u.signedUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open';
    const d = document.createElement('button'); d.textContent = 'Delete';
    d.onclick = async () => { if (!confirm('Delete this picture?')) return; const r = await sb.storage.from(BUCKET).remove([paths[i]]); if (r.error) toast(r.error.message); else fig.remove(); };
    cap.append(a, d); fig.append(img, cap); grid.appendChild(fig);
  });
}

/* ---------- home chooser ---------- */
$('#btnHome').onclick = () => { $('#home').hidden = false; };
$('#homeBooth').onclick = () => { $('#home').hidden = true; groupFilter = 'Strips & Film'; buildGroups(); buildTemplates(); const i = LAYOUTS.findIndex(l => l.id === 'film4'); setLayout(i); toast('Pick a frame, then tap “Photo booth” 🎞️', 3600); };
$('#homeCollage').onclick = () => { $('#home').hidden = true; groupFilter = 'All'; buildGroups(); buildTemplates(); toast('Pick a layout, then upload your photos 🖼️', 3600); };
$('#home').addEventListener('click', e => { if (e.target.id === 'home') $('#home').hidden = true; });
$('#galModal').addEventListener('click', e => { if (e.target.id === 'galModal') $('#galModal').hidden = true; });

document.addEventListener('DOMContentLoaded', initAuth);
if (document.readyState !== 'loading') initAuth();
