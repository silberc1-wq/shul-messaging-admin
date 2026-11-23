import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cfg = window.SHUL_CONFIG;
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

const code = new URLSearchParams(location.search).get('org') || '';

function consentText(org, method = 'TEXT', withEmail = false) {
  if (method === 'EMAIL') return `Yes, I agree to receive announcement emails from ${org} via CommunityConnect at the email address provided (for example schedules, event reminders, closures and emergency alerts). I can unsubscribe at any time using the link in every email.`;
  return `Yes, I agree to receive recurring announcement text messages and/or automated phone calls from ${org} via CommunityConnect at the number provided (for example schedules, event reminders, closures and emergency alerts). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any purchase.${withEmail ? ' I also agree to receive these announcements by email and can unsubscribe at any time.' : ''}`;
}

async function init() {
  const { data, error } = await sb.rpc('public_org_page', { p_code: code });
  const org = data && data[0];
  if (error || !org) {
    $('#card').innerHTML = '<h1>Sign-up page not found</h1><p class="muted">Please check the link you were given.</p>';
    return;
  }
  document.title = `Join ${org.name} announcements`;
  const num = fmtPhone(org.twilio_number);
  $('#card').innerHTML = `
    <span class="pill gold">Announcements by text or phone call</span>
    <h1 style="margin-top:12px">Get ${esc(org.name)} announcements</h1>
    <p class="muted" style="font-size:16px">Prayer times, event reminders, closures and emergency alerts, sent by ${esc(org.name)}'s office.</p>

    <div class="card" style="padding:18px 20px;margin:20px 0;background:#fffaf0;border-color:#efd9a8">
      <b style="font-size:17px">Option 1: Text <span style="color:var(--brand)">JOIN</span> to <a href="sms:${esc(org.twilio_number)}?body=JOIN">${esc(num)}</a></b>
      <p class="small muted" style="margin:6px 0 0">You'll get a confirmation text. Msg frequency varies. Msg &amp; data rates may apply. Reply HELP for help, STOP to cancel.</p>
    </div>

    <h3 style="margin-bottom:12px">Option 2: Sign up here</h3>
    <form id="f" novalidate>
      <div class="grid2">
        <div class="field"><label>Name</label><input name="name" maxlength="120" autocomplete="name"></div>
        <div class="field"><label>How should we reach you?</label>
          <select name="method"><option value="TEXT">Text message</option><option value="CALL">Phone call (for phones that don't text)</option><option value="EMAIL">Email only</option></select></div>
      </div>
      <div class="grid2">
        <div class="field" id="phonef"><label>Phone number *</label><input name="phone" type="tel" autocomplete="tel" placeholder="(845) 555-1234"></div>
        <div class="field"><label id="emaillab">Email (optional, to also get announcements by email)</label><input name="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
      </div>
      ${org.groups.length ? `<div class="field"><label>Lists (optional)</label><div class="groups-pick">${org.groups.map(g =>
        `<label><input type="checkbox" value="${esc(g)}">${esc(g.charAt(0) + g.slice(1).toLowerCase())}</label>`).join('')}</div></div>` : ''}
      <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500;color:var(--ink);margin:16px 0">
        <input type="checkbox" name="consent" style="margin-top:4px">
        <span id="consent-text">${esc(consentText(org.name))}</span></label>
      <p class="small muted">See our <a href="privacy.html">Privacy Policy</a> and <a href="terms.html">SMS Terms</a>. Mobile numbers are never shared or sold.</p>
      <button class="btn gold" type="submit" style="width:100%">Sign me up</button>
    </form>`;

  const fm = $('#f');
  const syncMethod = () => {
    const em = fm.method.value === 'EMAIL';
    $('#phonef').style.display = em ? 'none' : '';
    $('#emaillab').textContent = em ? 'Email *' : 'Email (optional, to also get announcements by email)';
    $('#consent-text').textContent = consentText(org.name, fm.method.value, !!fm.email.value.trim());
  };
  fm.method.addEventListener('change', syncMethod); fm.email.addEventListener('input', syncMethod);
  $('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const em = f.method.value === 'EMAIL';
    if (em && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.value.trim())) return alertMsg('Please enter your email address.');
    if (!em && !f.phone.value.trim()) return alertMsg('Please enter your phone number.');
    if (!f.consent.checked) return alertMsg('Please check the box to agree to receive announcements.');
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing you up…';
    const groups = [...f.querySelectorAll('.groups-pick input:checked')].map(i => i.value);
    const { data: res, error: err } = await sb.rpc('public_join', {
      p_code: code, p_name: f.name.value, p_phone: em ? null : f.phone.value, p_groups: groups, p_method: f.method.value, p_email: f.email.value.trim() || null,
      p_consent_text: $('#consent-text').textContent,
    });
    if (err) { btn.disabled = false; btn.textContent = 'Sign me up'; return alertMsg(err.message); }
    $('#card').innerHTML = `<h1>${res === 'joined' ? "You're signed up! 🎉" : 'Thank you!'}</h1>
      <p style="font-size:16px">${res === 'joined'
        ? `You'll now receive ${esc(org.name)} announcements.`
        : `Your request was sent to ${esc(org.name)}'s office for approval.`}</p>
      <p class="muted">${em ? 'Every email has an unsubscribe link at the bottom.' : 'Reply STOP to any message to opt out, or HELP for help. Msg &amp; data rates may apply.'}</p>`;
  });
}
function alertMsg(m) { const t = $('#toast'); t.textContent = m; t.className = 'show error'; clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 4000); }
init();
