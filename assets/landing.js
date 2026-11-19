import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// A sign-in link that lands on the home page (Supabase falls back to the Site URL) goes on to the admin app.
if (/access_token=|error_description=|[?&]code=/.test(location.hash + location.search)) {
  location.replace('app.html' + location.search + location.hash);
  throw new Error('redirecting to sign-in');
}

const cfg = window.SHUL_CONFIG;
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null ? '' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const num = n => n == null ? '' : Number(n).toLocaleString();

document.querySelectorAll('[data-brand]').forEach(el => (el.textContent = cfg.brandName));
$('#year').textContent = new Date().getFullYear();
['#support-link', '#support-link-2'].forEach(id => { const a = $(id); if (a) a.href = 'mailto:' + cfg.supportEmail; });

function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 4200);
}

let plans = [];
let period = 'MONTHLY';

async function loadPlans() {
  const { data, error } = await sb.rpc('public_plans');
  if (error) { $('#prices').innerHTML = '<p class="muted">Could not load plans right now.</p>'; return; }
  plans = data || [];
  renderPlans();
}

function renderPlans() {
  $('#prices').innerHTML = plans.map((p, i) => {
    const yearly = period === 'YEARLY';
    const price = yearly ? p.yearly_price : p.monthly_price;
    const hold = p.monthly_price == null;
    const shown = hold ? p.yearly_price : price;
    const unit = hold || yearly ? '/year' : '/month';
    return `<div class="card price ${i === 1 ? 'featured' : ''}">
      <h3>${esc(p.name)}</h3>
      <div class="muted small">${esc(p.tagline || '')}</div>
      <div class="amt">${shown == null ? '—' : money(shown)} <small>${unit}</small></div>
      ${p.setup_fee ? `<div class="small muted">+ ${money(p.setup_fee)} one-time setup</div>` : '<div class="small muted">&nbsp;</div>'}
      <ul>${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <button class="btn ${i === 1 ? 'gold' : 'secondary'}" data-plan="${esc(p.code)}">${hold ? 'Hold my number' : 'Get started'}</button>
    </div>`;
  }).join('');
}

document.querySelectorAll('.toggle button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.toggle button').forEach(x => x.classList.toggle('on', x === b));
  period = b.dataset.period; renderPlans();
}));

$('#prices').addEventListener('click', e => {
  const b = e.target.closest('[data-plan]');
  if (b) openSignup(b.dataset.plan);
});

function openSignup(code) {
  const p = plans.find(x => x.code === code);
  const hold = p.monthly_price == null;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<form class="modal" novalidate>
    <header><h3>Sign up: ${esc(p.name)}</h3><button type="button" class="btn ghost" data-close>✕</button></header>
    <div class="body">
      <p class="muted small" style="margin-top:0">Takes about 3 minutes. The texting-registration details are required by US phone carriers before your organization can send texts. Have your EIN handy.</p>
      <h4 style="margin:6px 0 10px">Your organization</h4>
      <div class="grid2">
        <div class="field"><label>Organization name *</label><input name="org_name" required maxlength="200"></div>
        <div class="field"><label>Legal name (as on IRS records)</label><input name="legal_name" maxlength="200"></div>
        <div class="field"><label>Organization type</label><select name="entity_type">
          <option value="NON_PROFIT">Nonprofit (501c3, church/organization)</option><option value="PRIVATE_PROFIT">Private company</option>
          <option value="SOLE_PROPRIETOR">Sole proprietor (no EIN)</option><option value="GOVERNMENT">Government</option></select></div>
        <div class="field"><label>EIN (Tax ID)</label><input name="ein" placeholder="12-3456789" maxlength="20"></div>
        <div class="field"><label>Website</label><input name="website" placeholder="https://" maxlength="200"></div>
        <div class="field"><label>Approx. number of members to reach</label><input name="estimated_contacts" type="number" min="0"></div>
      </div>
      <div class="field"><label>Street address</label><input name="street" maxlength="200"></div>
      <div class="grid2">
        <div class="field"><label>City</label><input name="city" maxlength="100"></div>
        <div class="grid2" style="gap:0 10px"><div class="field"><label>State</label><input name="state" maxlength="2" placeholder="NY"></div>
          <div class="field"><label>ZIP</label><input name="zip" maxlength="10"></div></div>
      </div>
      <h4 style="margin:6px 0 10px">Main contact (gets the admin login)</h4>
      <div class="grid2">
        <div class="field"><label>First name *</label><input name="rep_first_name" required maxlength="100"></div>
        <div class="field"><label>Last name *</label><input name="rep_last_name" required maxlength="100"></div>
        <div class="field"><label>Title</label><input name="rep_title" placeholder="Rabbi, Executive Director…" maxlength="100"></div>
        <div class="field"><label>Mobile phone</label><input name="phone" type="tel" maxlength="20"></div>
      </div>
      <div class="field"><label>Email *</label><input name="email" type="email" required maxlength="200"><div class="hint">You'll sign in to the admin website with this email.</div></div>
      <h4 style="margin:6px 0 10px">Plan</h4>
      <div class="grid2">
        <div class="field"><label>Billing</label><select name="billing_period">
          ${hold ? '' : `<option value="MONTHLY" ${period === 'MONTHLY' ? 'selected' : ''}>Monthly: ${money(p.monthly_price)}/month</option>`}
          <option value="YEARLY" ${period === 'YEARLY' || hold ? 'selected' : ''}>Yearly: ${money(p.yearly_price)}/year</option></select></div>
        <div class="field"><label>Extra phone numbers</label><input name="extra_numbers" type="number" min="0" max="20" value="0">
          <div class="hint">${money(p.extra_number_monthly)}/month each</div></div>
      </div>
      <div class="field"><label>How do members agree to get messages?</label>
        <textarea name="opt_in_method" maxlength="300" placeholder="Members sign up on our membership form or text JOIN to our number."></textarea></div>
      <div class="field"><label>Anything else?</label><textarea name="notes" maxlength="2000"></textarea></div>
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input type="checkbox" name="agree" required style="margin-top:3px">
        I confirm our members have agreed to receive messages, and we'll honor STOP requests.</label>
    </div>
    <footer><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn gold" type="submit">Continue to payment</button></footer>
  </form>`;
  document.body.appendChild(back);
  const form = $('form', back);
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    if (!f.org_name || !f.rep_first_name || !f.rep_last_name || !f.email) return toast('Please fill in the required fields (*).', true);
    if (!form.agree.checked) return toast('Please confirm member consent.', true);
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Saving…';
    const compliance = {};
    ['legal_name', 'entity_type', 'ein', 'website', 'street', 'city', 'state', 'zip', 'rep_first_name', 'rep_last_name', 'rep_title', 'opt_in_method']
      .forEach(k => { if (f[k]) compliance[k] = f[k]; });
    compliance.rep_email = f.email; if (f.phone) compliance.rep_phone = f.phone;
    const { data: id, error } = await sb.rpc('public_signup', {
      p_org_name: f.org_name, p_contact_name: `${f.rep_first_name} ${f.rep_last_name}`, p_email: f.email, p_phone: f.phone || null,
      p_plan_code: p.code, p_billing_period: f.billing_period, p_extra_numbers: parseInt(f.extra_numbers || '0', 10),
      p_estimated_contacts: f.estimated_contacts ? parseInt(f.estimated_contacts, 10) : null, p_notes: f.notes || null, p_compliance: compliance,
    });
    if (error) { btn.disabled = false; btn.textContent = 'Continue to payment'; return toast(error.message, true); }
    const link = f.billing_period === 'YEARLY' ? p.checkout_url_yearly : p.checkout_url_monthly;
    if (link) {
      const u = new URL(link);
      u.searchParams.set('client_reference_id', id);
      u.searchParams.set('prefilled_email', f.email);
      window.location.href = u.toString();
    } else {
      $('.body', form).innerHTML = `<h3>Thank you! 🎉</h3><p>We received your signup for <b>${esc(p.name)}</b>. We'll email <b>${esc(f.email)}</b> with your payment link and next steps within one business day.</p>
        <p class="muted small">Reference: ${esc(id)}</p>`;
      $('footer', form).innerHTML = '<button type="button" class="btn" data-close>Close</button>';
    }
  });
}

loadPlans();
