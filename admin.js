'use strict';
/* Admin dashboard: sign in with an account whose profiles.is_admin = true.
   Row Level Security (see supabase-analytics.sql) means anyone else's
   sign-in simply sees an empty/denied result here – there is no separate
   secret to protect, the database itself enforces who can read this data. */
const SUPABASE_URL = 'https://erkpmaxlankdkchvnbol.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WbYj-RnCF4tD03hyS8aEyQ_p2itl3pv';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = s => document.querySelector(s);

$('#go').onclick = async () => {
  const email = $('#email').value.trim(), password = $('#pass').value;
  $('#msg').textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $('#msg').textContent = error.message; return; }
  $('#msg').textContent = '';
  await load();
};
$('#out').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function load() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return; // stay on login screen
  const { data: profile, error: perr } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
  if (perr || !profile || !profile.is_admin) {
    $('#msg').textContent = 'This account is not an admin. Run the SQL update in supabase-analytics.sql for your account.';
    await sb.auth.signOut();
    return;
  }
  $('#login').hidden = true; $('#dash').hidden = false;
  $('#who').textContent = session.user.email;

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: events, error } = await sb.from('app_events').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500);
  if (error) { $('#msg').textContent = 'Could not load activity: ' + error.message; return; }

  const byEvent = {}, byUser = new Set(), byFrame = {};
  (events || []).forEach(e => {
    byEvent[e.event] = (byEvent[e.event] || 0) + 1;
    byUser.add(e.user_id);
    if (e.event === 'save_frame' || e.event === 'save_gallery') {
      const key = (e.meta && (e.meta.name || e.meta.layout)) || '(unnamed)';
      byFrame[key] = (byFrame[key] || 0) + 1;
    }
  });

  const cards = $('#cards');
  cards.innerHTML = '';
  const addCard = (label, val) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<b>${val}</b><span>${label}</span>`; cards.appendChild(d); };
  addCard('Active users', byUser.size);
  addCard('Sign-ins', byEvent.sign_in || 0);
  addCard('Pictures saved', byEvent.save_gallery || 0);
  addCard('Frames saved', byEvent.save_frame || 0);

  const top = $('#topFrames'); top.innerHTML = '';
  Object.entries(byFrame).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([name, n]) => {
    const tr = document.createElement('tr'); tr.innerHTML = `<td>${esc(name)}</td><td>${n}</td>`; top.appendChild(tr);
  });
  if (!Object.keys(byFrame).length) top.innerHTML = '<tr><td colspan="2">No saves yet</td></tr>';

  const rows = $('#events'); rows.innerHTML = '';
  (events || []).slice(0, 100).forEach(e => {
    const tr = document.createElement('tr');
    const when = new Date(e.created_at).toLocaleString();
    const detail = e.meta ? Object.entries(e.meta).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
    tr.innerHTML = `<td>${when}</td><td>${esc(e.email || e.user_id || '')}</td><td>${esc(e.event)}</td><td>${esc(detail)}</td>`;
    rows.appendChild(tr);
  });
  if (!events || !events.length) rows.innerHTML = '<tr><td colspan="4">No activity yet</td></tr>';
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

load();
