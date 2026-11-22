import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cfg = window.SHUL_CONFIG;
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
const card = document.getElementById('card');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.search).get('t') || '';

function ask() {
  card.innerHTML = `<h1 style="margin-top:0">Unsubscribe from emails?</h1>
    <p style="font-size:16px">You will stop getting announcement emails. Texts or calls you signed up for are not changed. To stop those, reply STOP to a text or press 9 on a call.</p>
    <button class="btn" id="go" style="width:100%">Yes, unsubscribe me</button>`;
  document.getElementById('go').addEventListener('click', run);
}
async function run() {
  const b = document.getElementById('go'); b.disabled = true; b.textContent = 'One moment…';
  const { data, error } = await sb.rpc('public_email_unsubscribe', { p_token: token });
  if (error) { card.innerHTML = `<h1 style="margin-top:0">Something went wrong</h1><p>${esc(error.message)}</p><p class="muted">You can also write to <a href="mailto:hello@nivolink.com">hello@nivolink.com</a> and we will remove you.</p>`; return; }
  card.innerHTML = `<h1 style="margin-top:0">You're unsubscribed</h1><p style="font-size:16px">You won't get any more announcement emails from ${esc(data)}.</p>
    <p class="muted">Changed your mind? Ask the office to turn emails back on.</p>`;
}
if (!/^[0-9a-f-]{36}$/i.test(token)) card.innerHTML = '<h1 style="margin-top:0">Link not complete</h1><p>Please use the full unsubscribe link from the bottom of the email.</p>';
else ask();
