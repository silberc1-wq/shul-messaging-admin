import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cfg = window.SHUL_CONFIG;
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
const card = document.getElementById('card');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.search).get('t') || '';
const LABEL = { delivered: ['Delivered', 'ok'], failed: ['Failed', 'bad'], pending: ['Waiting', 'warn'], answered: ['Answered', 'ok'],
  voicemail: ['Voicemail', 'warn'], no_answer: ['No answer', 'bad'], call_failed: ['Call failed', 'bad'], call_pending: ['Calling', 'warn'], emailed: ['Emailed', 'ok'] };
const secs = n => !n ? '' : n < 60 ? `${n} sec` : `${Math.floor(n / 60)} min ${n % 60} sec`;

(async () => {
  const { data, error } = token.length >= 16 ? await sb.rpc('public_report', { p_token: token }) : { data: null };
  if (error || !data) {
    card.innerHTML = `<h1 style="margin-top:0">This link doesn't work</h1><p>The report may have expired, or sharing was turned off. Ask the person who sent it for a new link.</p>`;
    return;
  }
  const tz = data.timezone || undefined;
  const when = new Date(data.sent_at).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const rows = data.rows || [];
  const count = (k, ch) => rows.filter(r => r.result === k && (!ch || r.channel === ch)).length;
  const stat = (n, l, c = '') => n ? `<div class="rep-stat ${c}"><b>${n.toLocaleString()}</b><span>${l}</span></div>` : '';
  const listened = Math.round(rows.reduce((a, r) => a + (r.channel === 'call' ? r.duration || 0 : 0), 0) / 60);
  document.title = `Delivery report · ${data.org}`;
  card.innerHTML = `
    ${data.logo ? `<img src="${esc(data.logo)}" alt="" style="max-height:56px;max-width:200px;margin-bottom:10px">` : ''}
    <h1 style="margin:0 0 4px">Delivery report</h1>
    <p class="muted" style="margin:0 0 14px">${esc(data.org)} · ${esc(when)} · ${esc(data.group || '')}</p>
    <div style="white-space:pre-wrap;background:var(--cream,#f4f2ec);padding:10px 12px;border-radius:10px;margin-bottom:14px">${esc(data.message || '')}</div>
    <div class="rep-stats">
      ${stat(count('delivered'), 'texts delivered', 'ok')}${stat(count('failed', 'sms'), 'texts failed', 'bad')}${stat(count('pending'), 'waiting')}
      ${stat(count('answered'), 'calls answered', 'ok')}${stat(count('voicemail'), 'went to voicemail')}${stat(count('no_answer'), 'no answer', 'bad')}${stat(count('failed', 'call'), 'calls failed', 'bad')}
      ${stat(listened, 'minutes listened')}${stat(count('emailed'), 'emails sent', 'ok')}
    </div>
    <div class="toolbar" style="padding:0;margin:12px 0 8px"><input type="search" id="q" placeholder="Search name…"></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>How</th><th>Result</th><th>Listened</th></tr></thead><tbody id="body"></tbody></table></div>
    <p class="small muted" style="margin:12px 0 0">Names show as first name and last initial, and phone numbers are hidden. This link works until ${esc(new Date(data.expires).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}.</p>`;
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    document.getElementById('body').innerHTML = rows.filter(r => !q || String(r.who).toLowerCase().includes(q)).map(r => {
      const [l, c] = LABEL[r.result] || [r.result || '', ''];
      return `<tr><td>${esc(r.who)}</td><td>${r.channel === 'call' ? 'Call' : r.channel === 'email' ? 'Email' : 'Text'}</td><td><span class="pill ${c}">${esc(l)}</span></td><td>${r.channel === 'call' ? secs(r.duration) : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">Nobody matches.</td></tr>';
  };
  document.getElementById('q').addEventListener('input', draw);
  draw();
})();
