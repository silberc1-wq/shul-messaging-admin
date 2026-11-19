import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* ============================================================
   CommunityConnect admin — talks directly to Supabase.
   Security is enforced by the database (row level security):
   this page can only ever see/change what the signed-in admin is allowed to.
   ============================================================ */

const cfg = window.SHUL_CONFIG;
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } });

// ---------- tiny helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id, on) => $(id).classList.toggle('hidden', !on);
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); const t = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : (p || ''); };
const fmtDT = v => v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtD = v => v ? new Date(v + (String(v).length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const money = n => n == null || n === '' ? '' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num = n => n == null ? '' : Number(n).toLocaleString();
document.querySelectorAll('[data-brand]').forEach(el => (el.textContent = cfg.brandName));

function toast(msg, isError) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 4000);
}
function check(res, okMsg) {
  if (res.error) { toast(res.error.message, true); throw res.error; }
  if (okMsg) toast(okMsg);
  return res.data;
}

// ---------- state ----------
const S = { user: null, isPlatform: false, orgs: [], org: null, groups: [], view: 'overview', badges: {}, perms: {} };

// ---------- status colors ----------
const STATUS = {
  ok: ['SENT', 'YES', 'ACTIVE', 'APPROVED', 'PAID', 'DONE', 'COMPLETE', 'COMPLETED', 'HANDLED', 'PASS', 'CAMPAIGN APPROVED', 'FORWARDED'],
  warn: ['PENDING', 'PENDING CONFIRMATION', 'PENDING APPROVAL', 'SCHEDULED', 'SENDING', 'NEW', 'PARTIAL', 'UNPAID', 'OPEN', 'IN PROGRESS',
    'NOT STARTED', 'SUBMITTED', 'BRAND APPROVED', 'AWAITING PAYMENT', 'HOT', 'NEXT', 'BUILD', 'MEDIUM'],
  bad: ['FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED', 'REMOVED', 'SUSPENDED', 'NO RECIPIENTS', 'FAIL', 'HIGH', 'OVERDUE', 'REPLACED'],
};
const pill = v => { if (v == null || v === '') return ''; const u = String(v).toUpperCase();
  const c = STATUS.ok.includes(u) ? 'ok' : STATUS.warn.includes(u) ? 'warn' : STATUS.bad.includes(u) ? 'bad' : ''; return `<span class="pill ${c}">${esc(v)}</span>`; };

// ---------- field rendering ----------
function cell(col, row) {
  const v = row[col.f];
  if (col.render) return col.render(v, row);
  switch (col.type) {
    case 'bool': return v ? '<span class="pill ok">Yes</span>' : '<span class="pill">No</span>';
    case 'phone': return `<span class="nowrap">${esc(fmtPhone(v))}</span>`;
    case 'groups': return (v || []).map(g => `<span class="chip">${esc(g)}</span>`).join('') || '<span class="muted small">none</span>';
    case 'datetime': return `<span class="nowrap">${esc(fmtDT(v))}</span>`;
    case 'date': return `<span class="nowrap">${esc(fmtD(v))}</span>`;
    case 'money': return esc(money(v));
    case 'number': return esc(num(v));
    case 'status': return pill(v);
    case 'longtext': return `<div class="clip">${esc(v)}</div>`;
    case 'list': return esc((v || []).join(', '));
    default: return esc(v);
  }
}
function toLocalInput(v) { if (!v) return ''; const d = new Date(v); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function input(col, v) {
  const name = `name="${esc(col.f)}"`, req = col.req ? 'required' : '';
  switch (col.type) {
    case 'bool': return `<select ${name}><option value="true" ${v ? 'selected' : ''}>Yes</option><option value="false" ${!v ? 'selected' : ''}>No</option></select>`;
    case 'longtext': return `<textarea ${name} ${req}>${esc(v)}</textarea>`;
    case 'number': case 'money': return `<input type="number" step="any" ${name} value="${esc(v)}" ${req}>`;
    case 'date': return `<input type="date" ${name} value="${esc(v ? String(v).slice(0, 10) : '')}" ${req}>`;
    case 'datetime': return `<input type="datetime-local" ${name} value="${esc(toLocalInput(v))}" ${req}>`;
    case 'time': return `<input type="time" ${name} value="${esc(v ? String(v).slice(0, 5) : '')}" ${req}>`;
    case 'phone': return `<input type="tel" ${name} value="${esc(fmtPhone(v))}" ${req}>`;
    case 'email': return `<input type="email" ${name} value="${esc(v)}" ${req}>`;
    case 'select': case 'status': {
      const opts = typeof col.opts === 'function' ? col.opts() : (col.opts || []);
      const list = v && !opts.includes(v) ? [v, ...opts] : opts;
      return `<select ${name}>${col.req ? '' : '<option value=""></option>'}${list.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    case 'groups': {
      const codes = S.groups.filter(g => g.active).map(g => g.code);
      const all = [...new Set([...codes, ...(v || [])])];
      return `<div class="groups-pick" data-groups="${esc(col.f)}">${all.map(c =>
        `<label><input type="checkbox" value="${esc(c)}" ${(v || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('') || '<span class="muted small">Add groups on the Groups page first.</span>'}</div>`;
    }
    case 'list': return `<input ${name} value="${esc((v || []).join(', '))}"><div class="hint">Separate with commas</div>`;
    default: return `<input ${name} value="${esc(v)}" ${req} maxlength="${col.max || 500}">`;
  }
}
function readForm(form, cols) {
  const out = {};
  for (const col of cols) {
    if (col.type === 'groups') { out[col.f] = $$(`[data-groups="${col.f}"] input:checked`, form).map(i => i.value); continue; }
    const el = form.elements[col.f]; if (!el) continue;
    let v = el.value.trim();
    if (col.type === 'bool') v = v === 'true';
    else if (col.type === 'number' || col.type === 'money') v = v === '' ? null : Number(v);
    else if (col.type === 'datetime') v = v ? new Date(v).toISOString() : null;
    else if (col.type === 'list') v = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    else if (v === '') v = null;
    out[col.f] = v;
  }
  return out;
}

// ---------- modal ----------
function modal(title, bodyHtml, { saveText = 'Save', onSave, danger, wide } = {}) {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<form class="modal" style="${wide ? 'max-width:820px' : ''}" novalidate>
    <header><h3>${esc(title)}</h3><button type="button" class="btn ghost" data-close>✕</button></header>
    <div class="body">${bodyHtml}</div>
    <footer><button type="button" class="btn secondary" data-close>${onSave ? 'Cancel' : 'Close'}</button>
      ${onSave ? `<button class="btn ${danger ? 'danger' : ''}" type="submit">${esc(saveText)}</button>` : ''}</footer></form>`;
  document.body.appendChild(back);
  const form = $('form', back);
  const close = () => back.remove();
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $$('[data-close]', back).forEach(b => b.addEventListener('click', close));
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (!onSave) return close();
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try { if (await onSave(form) !== false) close(); } catch (err) { console.error(err); } finally { btn.disabled = false; }
  });
  setTimeout(() => $('input,select,textarea', form)?.focus(), 30);
  return form;
}
const confirmBox = (title, text, saveText = 'Yes', danger = true) =>
  new Promise(res => { const f = modal(title, `<p>${text}</p>`, { saveText, danger, onSave: () => res(true) });
    $$('[data-close]', f.parentElement).forEach(b => b.addEventListener('click', () => res(false))); });

/* ============================================================
   VIEW DEFINITIONS — one per tab from the old Google Sheets
   ============================================================ */
const ROLE_OPTS = ['FULL ADMIN', 'GROUP ADMIN'];
const METHOD_OPTS = ['TEXT', 'CALL'];
const groupOpts = () => ['ALL', ...S.groups.filter(g => g.active && g.code !== 'ALL').map(g => g.code)];

const VIEWS = {
  // ----- organization -----
  contacts: { title: 'Contacts', perm: 'contacts', icon: '👥', table: 'contacts', scope: 'org', order: ['name', true], soft: true,
    desc: 'Everyone who receives announcements. Choose TEXT or CALL for each person.',
    cols: [
      { f: 'name', label: 'Name', req: true }, { f: 'phone', label: 'Phone', type: 'phone' },
      { f: 'method', label: 'Method', type: 'select', opts: METHOD_OPTS, req: true },
      { f: 'groups', label: 'Groups', type: 'groups' }, { f: 'active', label: 'Active', type: 'bool' },
      { f: 'language', label: 'Language', type: 'select', opts: ['English', 'Yiddish', 'Hebrew', 'Russian', 'Spanish', 'French'], table: false },
      { f: 'is_test', label: 'Test contact', type: 'bool', table: false, hint: 'When Test Mode is on, only test contacts receive messages.' },
      { f: 'signup_source', label: 'Source', table: false }, { f: 'notes', label: 'Notes', type: 'longtext', table: false },
      { f: 'created_at', label: 'Added', type: 'date', edit: false },
    ], defaults: { method: 'TEXT', active: true, language: 'English', signup_source: 'Website' } },

  groups: { title: 'Groups', perm: 'contacts', icon: '🗂️', table: 'groups', scope: 'org', order: ['code', true], soft: true,
    desc: 'Departments and lists. Texters can send to a group by its code, e.g. SEND WOMEN …',
    cols: [
      { f: 'code', label: 'Code', req: true, hint: 'One word, e.g. WOMEN, BOARD, YOUTH' }, { f: 'name', label: 'Name' },
      { f: 'description', label: 'Description', type: 'longtext' }, { f: 'active', label: 'Active', type: 'bool' },
      { f: 'default_send_type', label: 'Default send', type: 'select', opts: ['SEND', 'TEXT', 'CALL'] },
      { f: 'members', label: 'Members', edit: false, render: (v, r) => num(r._members) },
    ], defaults: { active: true, default_send_type: 'SEND' },
    after: async rows => { const { data } = await sb.from('contacts').select('groups').eq('org_id', S.org.id).eq('active', true).is('deleted_at', null);
      rows.forEach(r => r._members = r.code === 'ALL' ? (data || []).length : (data || []).filter(c => (c.groups || []).includes(r.code)).length); } },

  controllers: { title: 'Texters', perm: 'texters', icon: '📱', table: 'controllers', scope: 'org', order: ['name', true], soft: true,
    desc: 'Phones allowed to send announcements by text. FULL ADMIN can send to every group; GROUP ADMIN only to the allowed groups.',
    cols: [
      { f: 'name', label: 'Name', req: true }, { f: 'phone', label: 'Phone', type: 'phone', req: true },
      { f: 'role', label: 'Role', type: 'select', opts: ROLE_OPTS, req: true, render: v => pill(v) },
      { f: 'allowed_groups', label: 'Allowed groups', type: 'groups', hint: 'Only used for GROUP ADMIN.' },
      { f: 'active', label: 'Active', type: 'bool' }, { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ], defaults: { role: 'GROUP ADMIN', active: true } },

  pending: { title: 'Pending', perm: 'send', icon: '⏳', table: 'pending_messages', scope: 'org', order: ['created_at', false], soft: true, noAdd: true, noEdit: true,
    desc: 'Commands waiting for a YES, plus everything confirmed or cancelled.',
    cols: [
      { f: 'created_at', label: 'Received', type: 'datetime' }, { f: 'sender_name', label: 'Sender' }, { f: 'command', label: 'Command', type: 'status' },
      { f: 'group_name', label: 'Group', render: v => `<span class="chip">${esc(v)}</span>` }, { f: 'message', label: 'Message', type: 'longtext' },
      { f: 'recipient_count', label: 'Recipients', type: 'number' }, { f: 'status', label: 'Status', type: 'status' },
    ],
    rowActions: r => r.status === 'PENDING CONFIRMATION' ? [{ label: 'Cancel', danger: true, run: async () => {
      check(await sb.from('pending_messages').update({ status: 'CANCELLED', confirmed_at: new Date().toISOString() }).eq('id', r.id), 'Cancelled'); } }] : [] },

  scheduled: { title: 'Scheduled', perm: 'send', icon: '⏰', table: 'scheduled_messages', scope: 'org', order: ['scheduled_for', false], soft: true,
    desc: 'Messages that go out automatically at a set time (checked every 5 minutes).',
    cols: [
      { f: 'scheduled_for', label: 'Send at', type: 'datetime', req: true },
      { f: 'group_name', label: 'Group', type: 'select', opts: groupOpts, req: true, render: v => `<span class="chip">${esc(v)}</span>` },
      { f: 'message', label: 'Message', type: 'longtext', req: true },
      { f: 'method_override', label: 'Send as', type: 'select', opts: ['PREF', 'TEXT', 'CALL'], table: false, hint: 'PREF = each member\'s own preference' },
      { f: 'status', label: 'Status', type: 'status', edit: false }, { f: 'sender_name', label: 'By', edit: false },
      { f: 'recipient_count', label: 'Recipients', type: 'number', edit: false },
    ], defaults: { method_override: 'PREF' },
    beforeSave: (row, isNew) => { if (isNew) { row.status = 'SCHEDULED'; row.sender_name = S.user.email; row.ref = 'S-WEB'; }
      if (row.scheduled_for && new Date(row.scheduled_for) < new Date()) { toast('Pick a time in the future', true); return false; } },
    canEdit: r => ['SCHEDULED', 'PENDING'].includes(r.status) },

  history: { title: 'History', needs: 'history', icon: '📜', table: 'message_history', scope: 'org', order: ['created_at', false], readOnly: true,
    desc: 'Every announcement that went out.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime' }, { f: 'sender_name', label: 'Sender' }, { f: 'command', label: 'Type', type: 'status' },
      { f: 'group_name', label: 'Group', render: v => `<span class="chip">${esc(v)}</span>` }, { f: 'message', label: 'Message', type: 'longtext' },
      { f: 'recipient_count', label: 'Recipients', type: 'number' }, { f: 'sent_count', label: 'Texts', type: 'number' },
      { f: 'calls_made', label: 'Calls', type: 'number' }, { f: 'failed_count', label: 'Failed', type: 'number' }, { f: 'status', label: 'Status', type: 'status' },
    ] },

  replies: { title: 'Replies', perm: 'contacts', icon: '↩️', table: 'replies', scope: 'org', order: ['created_at', false], soft: true, noAdd: true,
    desc: 'Messages members texted back. They are also forwarded to the office phone in Settings.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'name', label: 'Name', edit: false }, { f: 'phone', label: 'Phone', type: 'phone', edit: false },
      { f: 'message', label: 'Message', type: 'longtext', edit: false }, { f: 'status', label: 'Status', type: 'select', opts: ['NEW', 'FORWARDED', 'HANDLED'] },
      { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ],
    rowActions: r => r.status !== 'HANDLED' ? [{ label: 'Mark handled', run: async () => check(await sb.from('replies').update({ status: 'HANDLED' }).eq('id', r.id), 'Marked handled') }] : [] },

  signup_requests: { title: 'Signup Requests', perm: 'contacts', icon: '🙋', table: 'signup_requests', scope: 'org', order: ['created_at', false], soft: true, noAdd: true,
    desc: 'People who texted JOIN (when auto-signup is off). Approve to add them to Contacts.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'name_given', label: 'Name' }, { f: 'phone', label: 'Phone', type: 'phone' },
      { f: 'requested_groups', label: 'Groups', type: 'groups' }, { f: 'method', label: 'Method', type: 'select', opts: METHOD_OPTS },
      { f: 'status', label: 'Status', type: 'status', edit: false }, { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ],
    rowActions: r => r.status === 'PENDING APPROVAL' ? [
      { label: 'Approve', run: async () => check(await sb.rpc('approve_signup', { p_request_id: r.id }), 'Added to contacts') },
      { label: 'Reject', danger: true, run: async () => check(await sb.from('signup_requests').update({ status: 'REJECTED' }).eq('id', r.id), 'Rejected') }] : [] },

  opt_outs: { title: 'Opt-outs', icon: '✋', table: 'opt_outs', scope: 'org', order: ['created_at', false], readOnly: true,
    desc: 'People who texted STOP. They are marked inactive automatically. If they text START they are re-activated.',
    cols: [{ f: 'created_at', label: 'When', type: 'datetime' }, { f: 'name', label: 'Name' }, { f: 'phone', label: 'Phone', type: 'phone' },
      { f: 'original_groups', label: 'Groups they were in' }, { f: 'status', label: 'Status', type: 'status' }] },

  inbound: { title: 'Inbound Log', needs: 'history', icon: '📥', table: 'inbound_messages', scope: 'org', order: ['created_at', false], readOnly: true,
    desc: 'Every text the system received and what it did.',
    cols: [{ f: 'created_at', label: 'When', type: 'datetime' }, { f: 'from_phone', label: 'From', type: 'phone' }, { f: 'body', label: 'Message', type: 'longtext' },
      { f: 'route', label: 'Result', type: 'status' }, { f: 'reply', label: 'Reply sent', type: 'longtext' }] },

  admins: { title: 'Website Admins', perm: 'owner', icon: '🔑', table: 'org_admins', scope: 'org', order: ['email', true], soft: true,
    desc: 'Who can sign in for this organization. The owner (main login) can do everything and can add employees with only the rights you choose.',
    cols: [{ f: 'email', label: 'Email', type: 'email', req: true }, { f: 'name', label: 'Name' },
      { f: 'role', label: 'Role', type: 'select', opts: ['admin', 'owner'], req: true, render: v => pill(v), hint: 'Owners can send to every group and manage admins.' },
      { f: 'perm_contacts', label: 'Manage contacts & groups', type: 'bool', table: false },
      { f: 'perm_texters', label: 'Manage texters (who can text-send)', type: 'bool', table: false },
      { f: 'perm_settings', label: 'Change settings', type: 'bool', table: false },
      { f: 'perm_history', label: 'See history & logs', type: 'bool', table: false },
      { f: 'can_send', label: 'Can send from website', type: 'bool' },
      { f: 'allowed_groups', label: 'May send to', type: 'groups', hint: 'Tick ALL for every group. Ignored for owners.' },
      { f: 'rights', label: 'Can do', edit: false, render: (v, r) => r.role === 'owner' ? '<span class="pill gold">Everything</span>' :
          [r.perm_contacts && 'Contacts', r.perm_texters && 'Texters', r.perm_settings && 'Settings', r.perm_history && 'History'].filter(Boolean).map(x => `<span class="chip">${x}</span>`).join('') || '<span class="muted small">View only</span>' },
      { f: 'created_at', label: 'Added', type: 'date', edit: false }],
    defaults: { role: 'admin', can_send: false, allowed_groups: [], perm_contacts: true, perm_texters: false, perm_settings: false, perm_history: true } },

  numbers: { title: 'Phone Numbers', icon: '☎️', table: 'twilio_numbers', scope: 'org', order: ['is_primary', false], readOnly: true,
    desc: 'Your organization\'s numbers. Texting any of them reaches this system. Contact us to add a number.',
    cols: [{ f: 'number', label: 'Number', type: 'phone' }, { f: 'label', label: 'Label' }, { f: 'is_primary', label: 'Main', type: 'bool' }, { f: 'status', label: 'Status', type: 'status' }] },

  audit: { title: 'Change Log', needs: 'history', icon: '🕓', table: 'audit_log', scope: 'org', order: ['changed_at', false], readOnly: true,
    desc: 'Every change ever made, with who made it and the old value. Nothing is lost.',
    cols: [{ f: 'changed_at', label: 'When', type: 'datetime' }, { f: 'changed_by', label: 'By' }, { f: 'table_name', label: 'What', render: v => esc(TABLE_NAMES[v] || v) },
      { f: 'action', label: 'Action', render: (v, r) => pill(r.new_data?.deleted_at && !r.old_data?.deleted_at ? 'DELETED' : v === 'INSERT' ? 'ADDED' : 'CHANGED') },
      { f: 'diff', label: 'Details', render: (v, r) => diffHtml(r) }],
    rowActions: r => r.action === 'UPDATE' && RESTORABLE.includes(r.table_name) && r.old_data ? [{ label: 'Undo', run: () => undoChange(r) }] : [] },

  // ----- platform owner -----
  p_orgs: { title: 'All Organizations', icon: '🏛️', table: 'organizations', scope: 'platform', order: ['name', true], soft: true, platform: true,
    desc: 'Every customer, their plan, billing and limits.',
    cols: [
      { f: 'name', label: 'Name', req: true }, { f: 'org_code', label: 'Code' }, { f: 'twilio_number', label: 'Main number', type: 'phone', req: true },
      { f: 'plan', label: 'Plan', type: 'select', opts: () => S.plans.map(p => p.code), render: v => pill(v) },
      { f: 'plan_id', label: 'Plan (link)', type: 'select', table: false, opts: () => S.plans.map(p => p.id), hint: 'Pick the matching plan id' },
      { f: 'billing_period', label: 'Billing', type: 'select', opts: ['MONTHLY', 'YEARLY'] },
      { f: 'status', label: 'Status', type: 'select', opts: ['ACTIVE', 'AWAITING PAYMENT', 'HOLD', 'SUSPENDED', 'CANCELLED'], render: v => pill(v) },
      { f: 'paid_until', label: 'Paid until', type: 'date' }, { f: 'monthly_fee', label: 'Monthly fee', type: 'money' }, { f: 'setup_fee', label: 'Setup fee', type: 'money', table: false },
      { f: 'contact_limit', label: 'Contact limit', type: 'number', table: false }, { f: 'notification_limit', label: 'Monthly notifications', type: 'number', table: false },
      { f: 'voice_minute_limit', label: 'Voice minutes', type: 'number', table: false },
      { f: 'contact_person', label: 'Contact person', table: false }, { f: 'contact_phone', label: 'Contact phone', type: 'phone', table: false },
      { f: 'contact_email', label: 'Contact email', type: 'email' }, { f: 'go_live_date', label: 'Go-live', type: 'date', table: false },
      { f: 'billing_day', label: 'Billing day', table: false }, { f: 'active', label: 'Active', type: 'bool', table: false },
      { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ], defaults: { status: 'ACTIVE', billing_period: 'MONTHLY', active: true, timezone: 'America/New_York' },
    rowActions: r => [{ label: 'Open', run: () => { switchOrg(r.id); go('overview'); return 'nav'; } }],
    afterSave: () => loadOrgs() },

  p_signups: { title: 'New Signups', icon: '✨', table: 'signups', scope: 'platform', order: ['created_at', false], soft: true, platform: true, noAdd: true,
    desc: 'People who signed up on the pricing page. Approve to create their organization and admin login.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'org_name', label: 'Organization' }, { f: 'contact_name', label: 'Contact' },
      { f: 'email', label: 'Email', type: 'email' }, { f: 'phone', label: 'Phone', type: 'phone' },
      { f: 'plan_id', label: 'Plan', edit: false, render: v => esc(S.plans.find(p => p.id === v)?.name || '') },
      { f: 'billing_period', label: 'Billing', type: 'select', opts: ['MONTHLY', 'YEARLY'] }, { f: 'extra_numbers', label: 'Extra #s', type: 'number' },
      { f: 'status', label: 'Status', type: 'status', edit: false }, { f: 'amount_paid', label: 'Paid', type: 'money', edit: false },
      { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ],
    rowActions: r => [{ label: 'Details', run: () => signupDetails(r) },
      ...(r.status !== 'APPROVED' && r.status !== 'REJECTED' ? [{ label: 'Approve', run: () => approveSignup(r) },
        { label: 'Reject', danger: true, run: async () => check(await sb.from('signups').update({ status: 'REJECTED' }).eq('id', r.id), 'Rejected') }] : [])] },

  p_plans: { title: 'Plans & Pricing', icon: '🏷️', table: 'plans', scope: 'platform', order: ['sort_order', true], soft: true, platform: true,
    desc: 'These tiers appear on the public pricing page. Paste a Stripe Payment Link (or PayPal link) per plan to take payment.',
    cols: [
      { f: 'sort_order', label: '#', type: 'number' }, { f: 'code', label: 'Code', req: true }, { f: 'name', label: 'Name', req: true },
      { f: 'tagline', label: 'Tagline', table: false }, { f: 'monthly_price', label: 'Monthly', type: 'money' }, { f: 'yearly_price', label: 'Yearly', type: 'money' },
      { f: 'setup_fee', label: 'Setup', type: 'money' }, { f: 'contact_limit', label: 'Contacts', type: 'number' },
      { f: 'notification_limit', label: 'Msgs / month', type: 'number' }, { f: 'voice_minute_limit', label: 'Voice min', type: 'number' },
      { f: 'extra_number_monthly', label: 'Extra # / mo', type: 'money', table: false },
      { f: 'sending_enabled', label: 'Can send', type: 'bool' }, { f: 'is_public', label: 'On website', type: 'bool' },
      { f: 'features', label: 'Bullet points', type: 'list', table: false },
      { f: 'checkout_url_monthly', label: 'Monthly payment link', table: false, hint: 'Stripe Payment Link URL, e.g. https://buy.stripe.com/…' },
      { f: 'checkout_url_yearly', label: 'Yearly payment link', table: false },
    ], defaults: { sending_enabled: true, is_public: true, extra_number_monthly: 3 } },

  p_invoices: { title: 'Billing', icon: '💳', table: 'invoices', scope: 'platform', order: ['charge_date', false], soft: true, platform: true,
    cols: [
      { f: 'invoice_no', label: 'Invoice' }, { f: 'org_id', label: 'Organization', type: 'select', opts: () => S.orgs.map(o => o.id), render: v => esc(orgName(v)) },
      { f: 'charge_date', label: 'Date', type: 'date' }, { f: 'charge_type', label: 'Type', type: 'select', opts: ['Setup Fee', 'Monthly Fee', 'Yearly Fee', 'Subscription', 'Extra Number', 'Overage', 'Other'] },
      { f: 'description', label: 'Description' }, { f: 'qty', label: 'Qty', type: 'number' }, { f: 'rate', label: 'Rate', type: 'money' },
      { f: 'amount', label: 'Amount', type: 'money', edit: false }, { f: 'due_date', label: 'Due', type: 'date' },
      { f: 'status', label: 'Status', type: 'select', opts: ['UNPAID', 'PAID', 'OVERDUE', 'VOID'], render: v => pill(v) }, { f: 'paid_date', label: 'Paid', type: 'date' },
      { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ], defaults: { qty: 1, status: 'UNPAID' } },

  p_usage: { title: 'Usage & Tiers', icon: '📈', table: 'org_usage_status', scope: 'platform', order: ['name', true], readOnly: true, platform: true, noDeletedCol: true,
    desc: 'Who is close to or over their plan. "Recommended" is the smallest tier that fits their current usage.',
    cols: [{ f: 'name', label: 'Organization' }, { f: 'plan_name', label: 'Plan' }, { f: 'active_contacts', label: 'Contacts', render: (v, r) => usage(v, r.contact_limit) },
      { f: 'notifications_this_month', label: 'Msgs this month', render: (v, r) => usage(v, r.notification_limit) },
      { f: 'recommended_plan', label: 'Recommended', render: (v, r) => v && v !== r.plan_name ? `<span class="pill warn">Move to ${esc(v)}</span>` : pill(v ? 'OK' : '') },
      { f: 'paid_until', label: 'Paid until', type: 'date' }] },

  p_leads: { title: 'Leads', icon: '🎯', table: 'leads', scope: 'platform', order: ['created_at', false], soft: true, platform: true,
    cols: [{ f: 'organization', label: 'Organization', req: true }, { f: 'contact_person', label: 'Contact' }, { f: 'phone', label: 'Phone', type: 'phone' },
      { f: 'email', label: 'Email', type: 'email' }, { f: 'type', label: 'Type', type: 'select', opts: ['Organization', 'School', 'Nonprofit', 'Other'] },
      { f: 'interest_level', label: 'Interest', type: 'select', opts: ['HOT', 'WARM', 'COLD'], render: v => pill(v) },
      { f: 'estimated_contacts', label: 'Est. contacts', type: 'number' }, { f: 'quoted_setup', label: 'Quoted setup', type: 'money', table: false },
      { f: 'quoted_monthly', label: 'Quoted monthly', type: 'money' }, { f: 'follow_up_date', label: 'Follow up', type: 'date' },
      { f: 'status', label: 'Status', type: 'select', opts: ['NEW', 'CONTACTED', 'DEMO', 'WON', 'LOST'], render: v => pill(v) }, { f: 'notes', label: 'Notes', type: 'longtext', table: false }] },

  p_support: { title: 'Support', icon: '🛟', table: 'support_tickets', scope: 'platform', order: ['created_at', false], soft: true, platform: true,
    cols: [{ f: 'ticket_no', label: 'Ticket' }, { f: 'org_id', label: 'Organization', type: 'select', opts: () => S.orgs.map(o => o.id), render: v => esc(orgName(v)) },
      { f: 'opened_on', label: 'Opened', type: 'date' }, { f: 'issue', label: 'Issue', type: 'longtext', req: true },
      { f: 'status', label: 'Status', type: 'select', opts: ['OPEN', 'IN PROGRESS', 'RESOLVED'], render: v => pill(v) },
      { f: 'priority', label: 'Priority', type: 'select', opts: ['LOW', 'MEDIUM', 'HIGH'], render: v => pill(v) },
      { f: 'assigned_to', label: 'Assigned' }, { f: 'resolved_date', label: 'Resolved', type: 'date' }, { f: 'notes', label: 'Notes', type: 'longtext', table: false }],
    defaults: { status: 'OPEN', priority: 'MEDIUM' } },

  p_setup: { title: 'Setup Checklist', icon: '✅', table: 'setup_tasks', scope: 'platform', order: ['sort_order', true], soft: true, platform: true,
    cols: [{ f: 'org_id', label: 'Organization', type: 'select', opts: () => S.orgs.map(o => o.id), render: v => esc(orgName(v)) }, { f: 'sort_order', label: '#', type: 'number' },
      { f: 'task', label: 'Task', req: true }, { f: 'required', label: 'Required', type: 'bool' },
      { f: 'status', label: 'Status', type: 'select', opts: ['NOT STARTED', 'IN PROGRESS', 'DONE'], render: v => pill(v) },
      { f: 'owner', label: 'Owner' }, { f: 'completed_date', label: 'Done on', type: 'date' }, { f: 'notes', label: 'Notes', type: 'longtext', table: false }],
    rowActions: r => r.status !== 'DONE' ? [{ label: 'Done ✓', run: async () => check(await sb.from('setup_tasks').update({ status: 'DONE', completed_date: new Date().toISOString().slice(0, 10) }).eq('id', r.id), 'Marked done') }] : [] },

  p_compliance: { title: 'Carrier Registration', icon: '🪪', table: 'org_compliance', scope: 'platform', order: ['a2p_status', true], soft: true, platform: true, noAdd: true,
    desc: 'A2P 10DLC: one Brand + one Campaign per organization. Copy these details into Twilio → Messaging → Regulatory Compliance.',
    cols: complianceCols(true),
    rowActions: r => [{ label: 'Copy for Twilio', run: () => copyCompliance(r) }] },

  p_tests: { title: 'Testing Log', icon: '🧪', table: 'test_log', scope: 'platform', order: ['test_code', true], soft: true, platform: true,
    cols: [{ f: 'test_code', label: 'Test' }, { f: 'org_id', label: 'Organization', type: 'select', opts: () => S.orgs.map(o => o.id), render: v => esc(orgName(v)) },
      { f: 'tested_on', label: 'Date', type: 'date' }, { f: 'feature', label: 'Feature' }, { f: 'command', label: 'Command' }, { f: 'expected', label: 'Expected', type: 'longtext' },
      { f: 'actual', label: 'Actual', type: 'longtext' }, { f: 'result', label: 'Result', type: 'select', opts: ['PASS', 'FAIL'], render: v => pill(v) }, { f: 'notes', label: 'Notes', type: 'longtext', table: false }] },

  p_roadmap: { title: 'Roadmap', icon: '🗺️', table: 'roadmap', scope: 'platform', order: ['sort_order', true], soft: true, platform: true,
    cols: [{ f: 'sort_order', label: '#', type: 'number' }, { f: 'feature', label: 'Feature', req: true }, { f: 'phase', label: 'Phase', type: 'select', opts: ['Phase 1', 'Phase 2', 'Phase 3', 'Future'] },
      { f: 'status', label: 'Status', type: 'select', opts: ['BUILD', 'NEXT', 'FUTURE', 'DONE'], render: v => pill(v) }, { f: 'required_for_launch', label: 'Launch?', type: 'bool' }, { f: 'notes', label: 'Notes' }] },

  p_costs: { title: 'Costs', icon: '🧮', table: 'cost_assumptions', scope: 'platform', order: ['item', true], soft: true, platform: true,
    cols: [{ f: 'item', label: 'Item', req: true }, { f: 'value', label: 'Value', type: 'money' }, { f: 'unit', label: 'Unit' }, { f: 'notes', label: 'Notes' }] },

  p_settings: { title: 'System Settings', icon: '🔧', table: 'app_settings', scope: 'platform', order: ['key', true], platform: true, noAdd: true, idField: 'key',
    desc: 'Connection between the website and n8n. Paste the Production URL of the "Send Now (from website)" node here.',
    cols: [{ f: 'key', label: 'Setting', edit: false }, { f: 'value', label: 'Value', render: (v, r) => r.key === 'dispatch_secret' ? '<span class="muted">•••••• (click Edit to view)</span>' : esc(v) },
      { f: 'notes', label: 'Notes', edit: false }] },

  p_staff: { title: 'Staff', icon: '🧑‍💼', table: 'platform_admins', scope: 'platform', order: ['email', true], platform: true, perm: 'platform_owner', hardDelete: true,
    desc: 'You and your team. Staff can see and manage every organization; only owners can add or remove staff.',
    cols: [{ f: 'email', label: 'Email', type: 'email', req: true }, { f: 'name', label: 'Name' },
      { f: 'role', label: 'Role', type: 'select', opts: ['staff', 'owner'], req: true, render: v => pill(v) }, { f: 'created_at', label: 'Added', type: 'date', edit: false }],
    defaults: { role: 'staff' } },

  p_numbers: { title: 'All Phone Numbers', icon: '☎️', table: 'twilio_numbers', scope: 'platform', order: ['number', true], soft: true, platform: true,
    desc: 'Every Twilio number. Point each one\'s Messaging webhook at your n8n URL.',
    cols: [{ f: 'number', label: 'Number', type: 'phone', req: true }, { f: 'org_id', label: 'Organization', type: 'select', opts: () => S.orgs.map(o => o.id), req: true, render: v => esc(orgName(v)) },
      { f: 'label', label: 'Label' }, { f: 'is_primary', label: 'Main', type: 'bool' }, { f: 'twilio_sid', label: 'Twilio SID', table: false },
      { f: 'status', label: 'Status', type: 'select', opts: ['ACTIVE', 'RELEASED'], render: v => pill(v) }, { f: 'monthly_cost', label: 'Cost / mo', type: 'money' },
      { f: 'purchased_on', label: 'Bought', type: 'date' }, { f: 'notes', label: 'Notes', table: false }], defaults: { status: 'ACTIVE', monthly_cost: 1.15 } },
};
const TABLE_NAMES = { contacts: 'Contact', controllers: 'Texter', groups: 'Group', organizations: 'Settings', pending_messages: 'Pending',
  scheduled_messages: 'Scheduled', message_history: 'History', org_admins: 'Website admin', replies: 'Reply', signup_requests: 'Signup request',
  org_compliance: 'Registration', twilio_numbers: 'Phone number' };
const RESTORABLE = ['contacts', 'controllers', 'groups', 'org_admins', 'scheduled_messages', 'replies', 'signup_requests', 'org_compliance'];
const HIDE_DIFF = ['updated_at', 'created_at', 'id', 'org_id'];
const orgName = id => S.orgs.find(o => o.id === id)?.name || '';
const usage = (v, lim) => { if (lim == null) return esc(num(v)); const pct = lim ? Math.min(100, Math.round(v / lim * 100)) : 100;
  return `${esc(num(v))} / ${esc(num(lim))}<div class="bar ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}" style="width:120px"><span style="width:${pct}%"></span></div>`; };

function complianceCols(platform) {
  return [
    ...(platform ? [{ f: 'org_id', label: 'Organization', edit: false, render: v => esc(orgName(v)) }] : []),
    { f: 'legal_name', label: 'Legal name (as on IRS records)' },
    { f: 'entity_type', label: 'Organization type', type: 'select', opts: ['NON_PROFIT', 'PRIVATE_PROFIT', 'SOLE_PROPRIETOR', 'GOVERNMENT'] },
    { f: 'ein', label: 'EIN (Tax ID)' }, { f: 'website', label: 'Website', table: false },
    { f: 'street', label: 'Street', table: false }, { f: 'city', label: 'City', table: false }, { f: 'state', label: 'State', table: false }, { f: 'zip', label: 'ZIP', table: false },
    { f: 'rep_first_name', label: 'Contact first name', table: false }, { f: 'rep_last_name', label: 'Contact last name', table: false },
    { f: 'rep_title', label: 'Contact title', table: false }, { f: 'rep_email', label: 'Contact email', type: 'email', table: !platform ? false : true },
    { f: 'rep_phone', label: 'Contact phone', type: 'phone', table: false },
    { f: 'use_case', label: 'What messages you send', type: 'longtext', table: false },
    { f: 'opt_in_method', label: 'How members agree to receive messages', type: 'longtext', table: false },
    { f: 'sample_message_1', label: 'Sample message 1', type: 'longtext', table: false }, { f: 'sample_message_2', label: 'Sample message 2', type: 'longtext', table: false },
    { f: 'a2p_status', label: 'Registration status', type: platform ? 'select' : 'status', edit: platform,
      opts: ['NOT STARTED', 'SUBMITTED', 'BRAND APPROVED', 'CAMPAIGN APPROVED', 'REJECTED'], render: v => pill(v) },
    ...(platform ? [{ f: 'brand_sid', label: 'Brand SID', table: false }, { f: 'campaign_sid', label: 'Campaign SID', table: false },
      { f: 'messaging_service_sid', label: 'Messaging Service SID', table: false }, { f: 'notes', label: 'Notes', type: 'longtext', table: false }] : []),
  ];
}

/* ============================================================
   NAV
   ============================================================ */
const NAV_ORG = [
  ['overview', '🏠', 'Overview'], ['send', '✉️', 'Send Message'], ['contacts'], ['groups'], ['controllers'], ['h', 'Messages'], ['pending'], ['scheduled'], ['history'], ['replies'],
  ['signup_requests'], ['opt_outs'], ['inbound'], ['h', 'Organization'], ['settings', '⚙️', 'Settings'], ['registration', '🪪', 'Texting Registration'],
  ['admins'], ['numbers'], ['audit'],
];
const NAV_PLATFORM = [['h', 'Platform owner'], ['p_orgs'], ['p_signups'], ['p_usage'], ['p_invoices'], ['p_plans'], ['p_compliance'], ['p_numbers'],
  ['p_setup'], ['p_leads'], ['p_support'], ['p_tests'], ['p_roadmap'], ['p_costs'], ['p_staff'], ['p_settings']];

const canWrite = v => !v.readOnly && (!v.perm || !!S.perms[v.perm]);
function renderNav() {
  const items = [...NAV_ORG, ...(S.isPlatform ? NAV_PLATFORM : [])].filter(([k]) => !VIEWS[k]?.needs || S.perms[VIEWS[k].needs]);
  $('#nav').innerHTML = items.map(([k, icon, label]) => {
    if (k === 'h') return `<div class="nav-h">${esc(icon)}</div>`;
    const v = VIEWS[k] || {}; const b = S.badges[k];
    const t = label || v.title;
    return `<a href="#${k}" class="${S.view === k ? 'on' : ''}" title="${esc(t)}"><span class="ni">${icon || v.icon}</span><span class="nl">${esc(t)}</span>${b ? `<span class="badge">${b}</span>` : ''}</a>`;
  }).join('');
}
function go(v) { if (location.hash !== '#' + v) location.hash = v; else render(); }
window.addEventListener('hashchange', () => { $('#side').classList.remove('open'); render(); });
$('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
// desktop: collapse the side menu to icons only (remembered on this computer)
function setCollapsed(on) {
  $('#app').classList.toggle('collapsed', on); localStorageSet('cc_side_collapsed', on ? '1' : '');
  const b = $('[data-collapse]'); b.textContent = on ? '»' : '«'; b.title = on ? 'Expand menu' : 'Collapse menu'; b.setAttribute('aria-label', b.title);
}
setCollapsed(localStorageGet('cc_side_collapsed') === '1');
// mobile menu: open with the Menu button, close by tapping outside it
document.addEventListener('click', e => {
  const side = $('#side');
  if (e.target.closest('[data-collapse]')) { setCollapsed(!$('#app').classList.contains('collapsed')); return; }
  if (e.target.closest('[data-menu]')) { e.stopPropagation(); side.classList.add('open'); return; }
  if (side.classList.contains('open') && !e.target.closest('#side')) side.classList.remove('open');
});

/* ============================================================
   IMPORT CONTACTS (Excel or CSV)
   ============================================================ */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
async function readSheet(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(x => String(x).trim() !== ''));
  }
  return parseCSV(await file.text());
}
const phoneDigits = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 && !/^[01]/.test(d) ? d : null; };
function mapColumns(rows) {
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z]/g, '');
  const pick = (hdr, keys) => hdr.findIndex(h => keys.includes(norm(h)));
  const hdr = rows[0] || [];
  const m = {
    name: pick(hdr, ['name', 'fullname', 'contact', 'contactname', 'member', 'membername']),
    first: pick(hdr, ['first', 'firstname', 'fname', 'given', 'givenname']),
    last: pick(hdr, ['last', 'lastname', 'lname', 'surname', 'familyname']),
    phone: pick(hdr, ['phone', 'phonenumber', 'mobile', 'mobilephone', 'cell', 'cellphone', 'cellnumber', 'number', 'tel', 'telephone', 'whatsapp']),
    method: pick(hdr, ['method', 'type', 'preference', 'contactmethod', 'textorcall', 'via']),
    groups: pick(hdr, ['groups', 'group', 'lists', 'list', 'department', 'departments', 'tags', 'category']),
    language: pick(hdr, ['language', 'lang']),
    notes: pick(hdr, ['notes', 'note', 'comments', 'comment']),
  };
  let header = m.phone >= 0 || m.name >= 0 || m.first >= 0;
  if (m.phone < 0) { // no recognizable header: find the column that is mostly phone numbers
    const sample = rows.slice(header ? 1 : 0, 30); const width = Math.max(...rows.map(r => r.length));
    let best = -1, bestN = 0;
    for (let c = 0; c < width; c++) { const n = sample.filter(r => phoneDigits(r[c])).length; if (n > bestN) { best = c; bestN = n; } }
    m.phone = best;
    if (!header && m.name < 0) { for (let c = 0; c < width; c++) if (c !== best && sample.some(r => /[a-z]/i.test(r[c] || ''))) { m.name = c; break; } }
  }
  return { m, header };
}
function importContacts() {
  const groupOptions = S.groups.filter(g => g.active && g.code !== 'ALL').map(g => `<option>${esc(g.code)}</option>`).join('');
  let parsed = [];
  const f = modal('Import contacts', `
    <p class="muted" style="margin-top:0">Upload an Excel (.xlsx) or CSV file with one person per row. Columns we recognize:
      <b>Name</b> (or First / Last), <b>Phone</b>, and optionally <b>Method</b> (Text or Call), <b>Groups</b> (separated by commas), Language, Notes.
      <a href="#" id="imp-sample">Download a sample file</a>.</p>
    <div class="field"><input type="file" name="file" accept=".csv,.xlsx,.xls,.txt" required></div>
    <div class="grid2">
      <div class="field"><label>If Method is blank</label><select name="defmethod"><option value="TEXT">Text message</option><option value="CALL">Phone call</option></select></div>
      <div class="field"><label>Also add everyone to group</label><select name="addgroup"><option value="">(none)</option>${groupOptions}</select></div>
    </div>
    <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;margin-bottom:10px"><input type="checkbox" name="update" checked style="margin-top:3px">
      Update people who are already in my contacts (matched by phone; their groups are added to, never removed)</label>
    <div id="imp-preview"></div>
    <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;margin-top:12px"><input type="checkbox" name="consent" style="margin-top:3px">
      I confirm everyone on this list agreed to receive messages from our organization. People who texted STOP are skipped automatically.</label>`,
  { saveText: 'Import', wide: true, onSave: async form => {
    if (!parsed.length) { toast('Choose a file first.', true); return false; }
    if (!form.consent.checked) { toast('Please confirm these people agreed to receive messages.', true); return false; }
    const def = form.defmethod.value, add = form.addgroup.value;
    const rows = parsed.map(r => ({ ...r, method: r.method || def, groups: add ? [...new Set([...r.groups, add])] : r.groups }));
    const tot = { added: 0, updated: 0, unchanged: 0, skipped_optout: 0, invalid: 0, duplicates: 0, new_groups: [] };
    for (let i = 0; i < rows.length; i += 1000) {
      const { data, error } = await sb.rpc('import_contacts', { p_org: S.org.id, p_rows: rows.slice(i, i + 1000), p_update: form.update.checked });
      if (error) { toast(error.message, true); return false; }
      for (const k in tot) tot[k] = k === 'new_groups' ? [...tot[k], ...(data[k] || [])] : tot[k] + (data[k] || 0);
    }
    const parts = [`${num(tot.added)} added`, `${num(tot.updated)} updated`];
    if (tot.unchanged) parts.push(`${num(tot.unchanged)} already there`);
    if (tot.skipped_optout) parts.push(`${num(tot.skipped_optout)} skipped (texted STOP)`);
    if (tot.invalid + tot.duplicates) parts.push(`${num(tot.invalid + tot.duplicates)} skipped (bad or repeated number)`);
    toast('Import done: ' + parts.join(' · ') + (tot.new_groups.length ? ` · new groups: ${tot.new_groups.join(', ')}` : ''));
    await loadGroups(); tablePage('contacts');
  } });
  $('#imp-sample', f).addEventListener('click', e => {
    e.preventDefault();
    const csv = 'Name,Phone,Method,Groups\nMoshe Klein,(845) 555-0101,Text,"MEN, BOARD"\nSarah Klein,845-555-0102,Text,WOMEN\nYosef Gold,8455550103,Call,MEN\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'contacts-sample.csv'; a.click();
  });
  f.file.addEventListener('change', async () => {
    const box = $('#imp-preview', f); parsed = [];
    const file = f.file.files[0]; if (!file) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="muted">Reading file…</p>';
    let rows;
    try { rows = await readSheet(file); } catch (err) { console.error(err); box.innerHTML = '<p style="color:var(--bad)">Could not read that file. Try saving it as CSV (in Excel: File → Save As → CSV) and upload again.</p>'; return; }
    const { m, header } = mapColumns(rows);
    if (m.phone < 0) { box.innerHTML = '<p style="color:var(--bad)">We couldn\'t find a phone number column. Make sure the file has a column named <b>Phone</b>.</p>'; return; }
    const existing = new Set(T.rows.filter(r => !r.deleted_at).map(r => String(r.phone || '').replace(/\D/g, '').slice(-10)));
    const seen = new Set(); let bad = [], dup = 0, upd = 0;
    for (const r of rows.slice(header ? 1 : 0)) {
      const cellv = i => i >= 0 ? String(r[i] ?? '').trim() : '';
      const d = phoneDigits(cellv(m.phone));
      const name = cellv(m.name) || [cellv(m.first), cellv(m.last)].filter(Boolean).join(' ');
      if (!d) { bad.push(name || cellv(m.phone) || '(blank)'); continue; }
      if (seen.has(d)) { dup++; continue; } seen.add(d);
      if (existing.has(d)) upd++;
      const mt = cellv(m.method).toLowerCase();
      parsed.push({ name, phone: d, method: /call|voice|phone|landline/.test(mt) ? 'CALL' : mt ? 'TEXT' : '',
        groups: cellv(m.groups).split(/[,;|/]+/).map(x => x.trim().toUpperCase().replace(/\s+/g, '_')).filter(x => x && x !== 'ALL'),
        language: cellv(m.language), notes: cellv(m.notes) });
    }
    const known = new Set(S.groups.map(g => g.code));
    const newGroups = [...new Set(parsed.flatMap(p => p.groups))].filter(g => !known.has(g) && /^[A-Z0-9_]{1,30}$/.test(g));
    const limit = S.plans?.find(p => p.id === S.org.plan_id)?.contact_limit;
    const after = existing.size + parsed.length - upd;
    box.innerHTML = `<div class="card" style="padding:14px 16px;box-shadow:none;background:#fcfbf8">
      <b>${num(parsed.length)} people ready</b>: ${num(parsed.length - upd)} new${upd ? `, ${num(upd)} already in your contacts` : ''}.
      ${bad.length ? `<br><span style="color:var(--bad)">${num(bad.length)} row${bad.length > 1 ? 's' : ''} skipped, missing or bad phone number: ${esc(bad.slice(0, 5).join(', '))}${bad.length > 5 ? '…' : ''}</span>` : ''}
      ${dup ? `<br><span class="muted">${num(dup)} repeated number${dup > 1 ? 's' : ''} in the file will be added once.</span>` : ''}
      ${newGroups.length ? `<br><span class="muted">New groups will be created: ${esc(newGroups.join(', '))}</span>` : ''}
      ${limit && after > limit ? `<br><span style="color:var(--warn)">Your plan includes ${num(limit)} contacts; after this import you'll have about ${num(after)}.</span>` : ''}
      </div>
      <div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>Name</th><th>Phone</th><th>Method</th><th>Groups</th></tr></thead><tbody>
      ${parsed.slice(0, 6).map(p => `<tr><td>${esc(p.name)}</td><td class="nowrap">${esc(fmtPhone(p.phone))}</td><td>${esc(p.method || f.defmethod.value)}</td><td>${p.groups.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</td></tr>`).join('')}
      </tbody></table></div>${parsed.length > 6 ? `<p class="small muted">…and ${num(parsed.length - 6)} more</p>` : ''}`;
  });
}

/* ============================================================
   GENERIC TABLE PAGE
   ============================================================ */
const T = { rows: [], q: '', showDeleted: false, sort: null };

async function tablePage(key) {
  const v = VIEWS[key];
  T.sort = T.sortKey === key ? T.sort : v.order; T.sortKey = key;
  const main = $('#main');
  main.innerHTML = `${head(v.title, v.desc, `${key === 'contacts' && canWrite(v) ? '<button class="btn secondary" id="import">Import contacts</button>' : ''}${canWrite(v) && !v.noAdd ? '<button class="btn" id="add">+ Add</button>' : ''}`)}
    <div class="toolbar"><input type="search" id="q" placeholder="Search…" value="${esc(T.q)}">
      ${v.soft ? `<label class="inline"><input type="checkbox" id="showdel" ${T.showDeleted ? 'checked' : ''}> Show deleted</label>` : ''}
      <span class="spacer"></span><span class="muted small" id="count"></span><button class="btn secondary sm" id="csv">Export CSV</button></div>
    <div class="card table-wrap" id="tbl"><div class="empty">Loading…</div></div>`;
  $('#q').addEventListener('input', e => { T.q = e.target.value; drawTable(key); });
  $('#showdel')?.addEventListener('change', e => { T.showDeleted = e.target.checked; tablePage(key); });
  $('#add')?.addEventListener('click', () => editRow(key, null));
  $('#import')?.addEventListener('click', () => importContacts());
  $('#csv').addEventListener('click', () => exportCsv(key));

  let q = sb.from(v.table).select('*').limit(5000);
  if (v.scope === 'org') q = q.eq('org_id', S.org.id);
  if (v.soft && !T.showDeleted) q = q.is('deleted_at', null);
  const res = await q;
  if (res.error) { $('#tbl').innerHTML = `<div class="empty">${esc(res.error.message)}</div>`; return; }
  T.rows = res.data || [];
  if (v.after) await v.after(T.rows);
  drawTable(key);
}

function drawTable(key) {
  const v = VIEWS[key]; const cols = v.cols.filter(c => c.table !== false);
  const q = T.q.toLowerCase();
  let rows = T.rows.filter(r => !q || Object.values(r).some(x => x != null && String(Array.isArray(x) ? x.join(' ') : typeof x === 'object' ? JSON.stringify(x) : x).toLowerCase().includes(q)));
  if (T.sort) { const [f, asc] = T.sort; rows.sort((a, b) => { const x = a[f] ?? '', y = b[f] ?? ''; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); }); }
  $('#count').textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  if (!rows.length) { $('#tbl').innerHTML = `<div class="empty">${T.q ? 'No matches.' : 'Nothing here yet.'}</div>`; return; }
  const canEdit = r => canWrite(v) && !v.noEdit && !r.deleted_at && (!v.canEdit || v.canEdit(r));
  $('#tbl').innerHTML = `<table class="data"><thead><tr>${cols.map(c => `<th data-sort="${esc(c.f)}">${esc(c.label)}${T.sort && T.sort[0] === c.f ? (T.sort[1] ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.deleted_at ? 'deleted' : ''}" data-id="${esc(r[v.idField || 'id'] ?? r.org_id)}">${cols.map(c => `<td>${cell(c, r)}</td>`).join('')}
      <td class="actions">${(v.rowActions && (canWrite(v) || v.readOnly || v.platform) ? v.rowActions(r) : []).map((a, i) => `<button class="btn ${a.danger ? 'danger' : 'secondary'} sm" data-act="${i}">${esc(a.label)}</button>`).join(' ')}
      ${r.deleted_at ? '<button class="btn secondary sm" data-restore>Restore</button>' : ''}
      ${canEdit(r) ? '<button class="btn ghost sm" data-edit>Edit</button>' : ''}
      ${(v.soft || v.hardDelete) && canWrite(v) && !r.deleted_at ? '<button class="btn ghost sm" data-del title="Delete">🗑</button>' : ''}</td></tr>`).join('')}</tbody></table>`;
  $('#tbl thead').onclick = e => { const th = e.target.closest('[data-sort]'); if (!th) return; const f = th.dataset.sort;
    T.sort = T.sort && T.sort[0] === f ? [f, !T.sort[1]] : [f, true]; drawTable(key); };
  $('#tbl tbody').onclick = async e => {
    const tr = e.target.closest('tr'); if (!tr) return; const r = rows.find(x => String(x[v.idField || 'id'] ?? x.org_id) === tr.dataset.id);
    const btn = e.target.closest('button');
    if (!btn) { if (canEdit(r)) editRow(key, r); return; }
    if (btn.dataset.edit !== undefined) return editRow(key, r);
    if (btn.dataset.del !== undefined) {
      if (!(await confirmBox('Delete?', v.hardDelete ? 'This removes their access (the change log keeps a record).' : 'It will be hidden but can always be restored from "Show deleted".', 'Delete'))) return;
      check(await sb.from(v.table).delete().eq('id', r.id), 'Deleted'); return tablePage(key);
    }
    if (btn.dataset.restore !== undefined) { check(await sb.from(v.table).update({ deleted_at: null }).eq('id', r.id), 'Restored'); return tablePage(key); }
    if (btn.dataset.act !== undefined) { const a = v.rowActions(r)[+btn.dataset.act]; btn.disabled = true;
      try { const out = await a.run(); if (out !== 'nav' && out !== 'keep') tablePage(key); } catch (err) { btn.disabled = false; } }
  };
}

function editRow(key, row) {
  const v = VIEWS[key]; const isNew = !row; const cols = v.cols.filter(c => c.edit !== false);
  const data = row || { ...(v.defaults || {}) };
  const html = `<div class="grid2">${cols.map(c => `<div class="field" style="${['longtext', 'groups', 'list'].includes(c.type) ? 'grid-column:1/-1' : ''}">
    <label>${esc(c.label)}${c.req ? ' *' : ''}</label>${input(c, data[c.f])}${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}</div>`).join('')}</div>`;
  modal(isNew ? `Add ${v.title.replace(/s$/, '').toLowerCase()}` : 'Edit', html, { wide: cols.length > 8, onSave: async form => {
    const vals = readForm(form, cols);
    for (const c of cols) if (c.req && (vals[c.f] == null || vals[c.f] === '')) { toast(`${c.label} is required`, true); return false; }
    if (v.beforeSave && v.beforeSave(vals, isNew) === false) return false;
    if (isNew) { if (v.scope === 'org') vals.org_id = S.org.id; check(await sb.from(v.table).insert(vals), 'Added'); }
    else check(await sb.from(v.table).update(vals).eq(v.idField || 'id', row[v.idField || 'id']), 'Saved');
    if (key === 'groups') await loadGroups();
    if (v.afterSave) await v.afterSave();
    tablePage(key);
  } });
}

function exportCsv(key) {
  const v = VIEWS[key]; const cols = v.cols.filter(c => !['diff', 'members'].includes(c.f));
  const val = x => x == null ? '' : Array.isArray(x) ? x.join(', ') : typeof x === 'object' ? JSON.stringify(x) : String(x);
  const lines = [cols.map(c => c.label), ...T.rows.map(r => cols.map(c => val(r[c.f])))]
    .map(l => l.map(x => /^[=+\-@]/.test(x) ? "'" + x : x).map(x => `"${x.replace(/"/g, '""')}"`).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `${(S.org?.name || 'organization').replace(/\W+/g, '-')}-${key}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

function diffHtml(r) {
  if (r.action === 'INSERT') { const n = r.new_data || {}; return `<div class="diff">${esc(n.name || n.code || n.email || n.message || n.task || '')}</div>`; }
  const o = r.old_data || {}, n = r.new_data || {};
  const keys = Object.keys(n).filter(k => !HIDE_DIFF.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  const label = n.name || n.code || n.email || n.phone || '';
  const show = x => x == null || x === '' ? '∅' : Array.isArray(x) ? x.join(', ') : typeof x === 'object' ? JSON.stringify(x) : String(x);
  return `<div class="diff">${label ? `<b>${esc(label)}</b><br>` : ''}${keys.slice(0, 5).map(k =>
    `${esc(k.replace(/_/g, ' '))}: <span class="old">${esc(show(o[k]).slice(0, 60))}</span> → <span class="new">${esc(show(n[k]).slice(0, 60))}</span>`).join('<br>')}</div>`;
}
async function undoChange(r) {
  if (!(await confirmBox('Undo this change?', 'This puts back the values from before this change.', 'Undo', false))) return 'keep';
  const o = r.old_data, n = r.new_data, patch = {};
  Object.keys(n).filter(k => !HIDE_DIFF.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).forEach(k => (patch[k] = o[k]));
  check(await sb.from(r.table_name).update(patch).eq('id', r.row_id), 'Change undone');
}

/* ============================================================
   CUSTOM PAGES
   ============================================================ */
function head(title, desc, actions = '') {
  return `<div class="main-head"><div><button class="btn secondary sm menu-btn" type="button" data-menu>☰ Menu</button>
    <h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}</div><div style="display:flex;gap:8px">${actions}</div></div>`;
}

async function overviewPage() {
  const o = S.org; const main = $('#main');
  main.innerHTML = head(o.name, 'Overview') + '<div class="empty">Loading…</div>';
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const [contacts, texters, hist, pend, rep, sreq, usageRes, comp] = await Promise.all([
    sb.from('contacts').select('active,method', { count: 'exact' }).eq('org_id', o.id).is('deleted_at', null),
    sb.from('controllers').select('id', { count: 'exact', head: true }).eq('org_id', o.id).eq('active', true).is('deleted_at', null),
    sb.from('message_history').select('*').eq('org_id', o.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
    sb.from('pending_messages').select('id', { count: 'exact', head: true }).eq('org_id', o.id).eq('status', 'PENDING CONFIRMATION').is('deleted_at', null),
    sb.from('replies').select('id', { count: 'exact', head: true }).eq('org_id', o.id).neq('status', 'HANDLED').is('deleted_at', null),
    sb.from('signup_requests').select('id', { count: 'exact', head: true }).eq('org_id', o.id).eq('status', 'PENDING APPROVAL').is('deleted_at', null),
    sb.from('usage_monthly').select('*').eq('org_id', o.id).order('month', { ascending: false }).limit(1),
    sb.from('org_compliance').select('a2p_status').eq('org_id', o.id).maybeSingle(),
  ]);
  const cs = contacts.data || []; const active = cs.filter(c => c.active).length; const calls = cs.filter(c => c.active && c.method === 'CALL').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const u = (usageRes.data || [])[0]; const used = u && u.month === thisMonth ? Number(u.notifications) : 0;
  const lim = o.notification_limit; const pct = lim ? Math.min(100, Math.round(used / lim * 100)) : 0;
  const cpct = o.contact_limit ? Math.min(100, Math.round(active / o.contact_limit * 100)) : 0;
  const plan = S.plans.find(p => p.id === o.plan_id);
  const warn = [];
  if (o.test_mode) warn.push('<b>Test Mode is ON</b>: only contacts marked "Test contact" receive messages. Turn it off in Settings.');
  if (comp.data && comp.data.a2p_status !== 'CAMPAIGN APPROVED') warn.push(`Texting registration: ${pill(comp.data.a2p_status)}. <a href="#registration">Complete your registration details</a> so carriers deliver your texts.`);
  if (o.paid_until && new Date(o.paid_until) < new Date()) warn.push(`Payment was due ${esc(fmtD(o.paid_until))}.`);
  if (lim && pct >= 80) warn.push(`You've used ${pct}% of this month's messages.`);
  main.innerHTML = head(o.name, [plan ? plan.name + ' plan' : '', o.paid_until ? 'Paid until ' + fmtD(o.paid_until) : ''].filter(Boolean).join(' · '),
      '<a class="btn secondary" href="#scheduled">Schedule</a><a class="btn" href="#send">✉️ Send a message</a>') +
    (warn.length ? `<div class="card panel" style="margin-bottom:16px;border-color:#efd9a8;background:#fffaf0">${warn.map(w => `<div style="padding:3px 0">⚠️ ${w}</div>`).join('')}</div>` : '') +
    `<div class="stats">
      <div class="card stat"><div class="k">Active contacts</div><div class="v">${num(active)}</div>${o.contact_limit ? `<div class="bar ${cpct >= 100 ? 'bad' : cpct >= 80 ? 'warn' : ''}"><span style="width:${cpct}%"></span></div><div class="small muted" style="margin-top:6px">${num(active)} of ${num(o.contact_limit)} · ${num(calls)} by phone call</div>` : ''}</div>
      <div class="card stat"><div class="k">Messages this month</div><div class="v">${num(used)}</div>${lim ? `<div class="bar ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}"><span style="width:${pct}%"></span></div><div class="small muted" style="margin-top:6px">${num(used)} of ${num(lim)} texts + calls</div>` : ''}</div>
      <div class="card stat"><div class="k">Texters</div><div class="v">${num(texters.count)}</div><div class="small muted"><a href="#controllers">Manage who can send</a></div></div>
      <div class="card stat"><div class="k">Needs attention</div><div class="v">${num((pend.count || 0) + (rep.count || 0) + (sreq.count || 0))}</div>
        <div class="small muted">${pend.count || 0} pending · <a href="#replies">${rep.count || 0} replies</a> · <a href="#signup_requests">${sreq.count || 0} signups</a></div></div>
    </div>
    <div class="two">
      <div class="card panel"><h3>Recent announcements</h3>
        ${(hist.data || []).map(h => `<div class="list-row"><div><span class="chip">${esc(h.group_name)}</span> ${esc(h.message?.slice(0, 80))}<div class="small muted">${esc(h.sender_name || '')} · ${esc(fmtDT(h.created_at))}</div></div>
          <div style="text-align:right">${pill(h.status)}<div class="small muted">${num(h.sent_count)} texts · ${num(h.calls_made)} calls</div></div></div>`).join('') || '<p class="muted">No announcements yet.</p>'}
        <p style="margin:12px 0 0"><a href="#history">See full history →</a></p></div>
      <div class="card panel"><h3>Text these commands to ${esc(fmtPhone(o.twilio_number))}</h3>
        <pre class="cmd">SEND MEN Mincha today at 6:45 PM
TEXT ALL Please pay membership dues
CALL ALL Important announcement
EMERGENCY ALL Building closed today
SCHEDULE BOARD 2026-12-01 19:00 Board meeting
YES   → confirm      NO → cancel
COMMANDS → list commands</pre>
        <p class="small muted" style="margin-bottom:0">SEND uses each member's preference (text or call). Members can text STOP, START, or JOIN.</p></div>
    </div>`;
}

const SETTINGS_COLS = [
  { f: 'name', label: 'Organization name', req: true },
  { f: 'timezone', label: 'Time zone', type: 'select', opts: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Toronto', 'Europe/London', 'Asia/Jerusalem'] },
  { f: 'confirmation_required', label: 'Require YES confirmation', type: 'bool', hint: 'Recommended. If off, SEND goes out immediately.' },
  { f: 'pending_expiry_minutes', label: 'YES must arrive within (minutes)', type: 'number' },
  { f: 'test_mode', label: 'Test mode', type: 'bool', hint: 'Only contacts marked "Test contact" receive messages.' },
  { f: 'duplicate_window_minutes', label: 'Warn about duplicates within (minutes)', type: 'number' },
  { f: 'dnd_start', label: 'Quiet hours start (no calls)', type: 'time' }, { f: 'dnd_end', label: 'Quiet hours end', type: 'time', hint: 'EMERGENCY ignores quiet hours.' },
  { f: 'sms_prefix', label: 'Texts start with', hint: 'Shown before every text. Leave empty for "[Your organization] via CommunityConnect", which matches the registered carrier campaign. Carriers require texts to say who they are from.' },
  { f: 'sms_stop_footer', label: 'Add "Reply STOP to opt out." to texts', type: 'bool', hint: 'Recommended by carriers. Skipped automatically if your message already mentions STOP.' },
  { f: 'forward_replies_phone', label: 'Forward member replies to phone', type: 'phone' },
  { f: 'forward_replies_email', label: 'Forward replies to email', type: 'email', hint: 'Saved for email forwarding (coming soon).' },
  { f: 'allow_auto_signup', label: 'Auto-add people who text JOIN', type: 'bool', hint: 'If off, they appear in Signup Requests for approval.' },
  { f: 'allow_callback_voicemail', label: 'Allow callback voicemail', type: 'bool' },
  { f: 'default_voice', label: 'Default voice', type: 'select', opts: ['Standard', 'Male', 'Female'] },
  { f: 'contact_person', label: 'Main contact person' }, { f: 'contact_phone', label: 'Main contact phone', type: 'phone' }, { f: 'contact_email', label: 'Main contact email', type: 'email' },
];

function recordForm({ title, desc, cols, row, table, idField = 'id', readonly = '', extra = '', locked = false }) {
  $('#main').innerHTML = head(title, desc) + readonly + `<form class="card panel" id="rec" novalidate><div class="grid2">${cols.filter(c => c.edit !== false).map(c => `<div class="field" style="${['longtext'].includes(c.type) ? 'grid-column:1/-1' : ''}">
      <label>${esc(c.label)}</label>${input(c, row[c.f])}${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}</div>`).join('')}</div>
    ${locked ? '<p class="muted small" style="margin:6px 0 0">View only: ask your organization\'s owner if you need to change these.</p>' : '<div style="display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:16px;margin-top:6px"><button class="btn" type="submit">Save changes</button></div>'}</form>${extra}`;
  if (locked) $$('#rec input, #rec select, #rec textarea').forEach(el => (el.disabled = true));
  $('#rec').addEventListener('submit', async e => {
    e.preventDefault(); const vals = readForm(e.target, cols.filter(c => c.edit !== false));
    check(await sb.from(table).update(vals).eq(idField, row[idField]), 'Saved');
    if (table === 'organizations') { await loadOrgs(); }
  });
}

async function settingsPage() {
  const o = (await sb.from('organizations').select('*').eq('id', S.org.id).single()).data;
  const plan = S.plans.find(p => p.id === o.plan_id);
  recordForm({ title: 'Settings', desc: 'How your organization\'s messaging behaves.', cols: SETTINGS_COLS, row: o, table: 'organizations', locked: !S.perms.settings,
    readonly: `<div class="card panel" style="margin-bottom:16px"><div class="kv">
      <div>Organization number</div><div><b>${esc(fmtPhone(o.twilio_number))}</b></div>
      <div>Plan</div><div>${esc(plan?.name || o.plan || '—')} · ${esc((o.billing_period || '').toLowerCase())}</div>
      <div>Status</div><div>${pill(o.status)}${o.paid_until ? ` · paid until ${esc(fmtD(o.paid_until))}` : ''}</div>
      <div>Limits</div><div>${num(o.contact_limit)} contacts · ${num(o.notification_limit)} messages/month · ${num(o.voice_minute_limit)} voice minutes</div>
    </div><p class="small muted" style="margin:10px 0 0">To change your plan or add a phone number, email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p></div>` });
}

async function registrationPage() {
  let row = (await sb.from('org_compliance').select('*').eq('org_id', S.org.id).maybeSingle()).data;
  if (!row && S.perms.settings) { check(await sb.from('org_compliance').insert({ org_id: S.org.id, legal_name: S.org.name })); row = (await sb.from('org_compliance').select('*').eq('org_id', S.org.id).single()).data; }
  recordForm({ title: 'Texting Registration', desc: 'US phone carriers require every organization that sends texts to register (A2P 10DLC). Fill this in once and we\'ll submit it for you.',
    cols: complianceCols(S.isPlatform).filter(c => c.f !== 'org_id'), row, table: 'org_compliance', locked: !S.perms.settings,
    readonly: `<div class="card panel" style="margin-bottom:16px">Status: ${pill(row.a2p_status)} <span class="muted small">· Approval usually takes 1–3 weeks after submission.</span></div>` });
}


/* ============================================================
   SEND MESSAGE + SMS SEGMENT CALCULATOR
   ============================================================ */
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';
const SMART = { '‘': "'", '’': "'", '‚': "'", '‛': "'", '“': '"', '”': '"', '„': '"', '″': '"', '′': "'", '–': '-', '—': '-', '−': '-',
  '…': '...', ' ': ' ', ' ': ' ', '​': '', '•': '-', '·': '-', '«': '"', '»': '"', '´': "'", '`': "'" };

function segInfo(text) {
  const chars = [...text];
  let septets = 0, gsm = true; const bad = new Set();
  for (const c of chars) {
    if (GSM_BASIC.includes(c)) septets += 1;
    else if (GSM_EXT.includes(c)) septets += 2;
    else { gsm = false; bad.add(c); }
  }
  const units = text.length; // UTF-16 code units (emoji = 2)
  if (!text) return { encoding: 'GSM-7', chars: 0, segments: 0, perSeg: 160, remaining: 160, bad: [], units: 0 };
  if (gsm) {
    const single = septets <= 160, per = single ? 160 : 153, segs = single ? 1 : Math.ceil(septets / 153);
    return { encoding: 'GSM-7', chars: septets, segments: segs, perSeg: per, remaining: segs * per - septets, bad: [], units };
  }
  const single = units <= 70, per = single ? 70 : 67, segs = single ? 1 : Math.ceil(units / 67);
  return { encoding: 'UCS-2 (Unicode)', chars: units, segments: segs, perSeg: per, remaining: segs * per - units, bad: [...bad], units };
}
const fixSmart = t => [...t].map(c => SMART[c] ?? c).join('');

async function sendPage() {
  const o = S.org;
  const { data: myGroups } = await sb.rpc('my_send_groups', { p_org: o.id });
  const allowed = myGroups || [];
  const groups = allowed.includes('ALL') ? groupOpts() : allowed;
  const main = $('#main');
  if (!groups.length) {
    main.innerHTML = head('Send Message') + `<div class="card panel"><p>You don't have permission to send messages from the website.</p>
      <p class="muted">Ask an owner to turn on <b>Can send from website</b> for you on the Website Admins page.</p></div>`; return;
  }
  main.innerHTML = head('Send Message', 'Send an announcement right now. Texts and calls go out within seconds.') + `
  <div class="two">
    <form class="card panel" id="sendf" novalidate>
      <div class="grid2">
        <div class="field"><label>To group</label><select name="group">${groups.map(g => `<option>${esc(g)}</option>`).join('')}</select></div>
        <div class="field"><label>How</label><select name="mode">
          <option value="PREF">By each member's preference (text or call)</option><option value="TEXT">Text only</option>
          <option value="CALL">Phone call only</option><option value="EMERGENCY">🚨 Emergency (ignores quiet hours)</option></select></div>
      </div>
      <div class="field"><label>Message</label><textarea name="msg" id="msg" rows="6" maxlength="1600" placeholder="Mincha today is at 6:45 PM."></textarea>
        <div class="hint" id="callnote" style="display:none">📞 Calls read this message aloud twice.</div></div>
      <div id="badchars" class="small" style="display:none;margin:-4px 0 12px;padding:10px 12px;border-radius:10px;background:var(--warn-soft);color:var(--warn)"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="muted small">${o.confirmation_required ? 'You\'ll confirm before it goes out.' : ''}</span>
        <button class="btn gold" type="submit" id="sendbtn">Review & send</button></div>
    </form>
    <div class="card panel">
      <h3>Message calculator</h3>
      <div class="kv" id="calc"></div>
      <div style="margin:14px 0 6px;font-weight:600;font-size:13px;color:var(--ink-2)">Who will receive it</div>
      <div class="kv" id="reach"><div>Recipients</div><div class="muted">…</div></div>
      <p class="small muted" style="margin:14px 0 0">Carriers bill texts per <b>segment</b>. A segment is 160 plain characters, or 70 if the message has an emoji or special character. Long messages are split into 153 / 67-character parts.</p>
    </div>
  </div>`;
  const f = $('#sendf'); let reach = null;
  const draw = () => {
    const raw = f.msg.value; const mode = f.mode.value;
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const t = raw.trim() ? (raw.trim().toLowerCase().startsWith(pre.replace(/: $/, '').toLowerCase()) && pre ? '' : pre) + raw.trim() + (/stop/i.test(raw) ? '' : foot) : '';
    const i = segInfo(t);
    const sms = reach ? reach.sms : 0, calls = reach ? reach.calls : 0;
    $('#calc').innerHTML = `
      <div>Encoding</div><div>${i.encoding === 'GSM-7' ? '<span class="pill ok">GSM-7 (standard)</span>' : '<span class="pill warn">Unicode</span>'}</div>
      <div>Characters</div><div>${num(i.chars)}${i.encoding !== 'GSM-7' ? ` <span class="muted small">(${num([...t].length)} typed)</span>` : ''}</div>
      <div>Segments per text</div><div><b style="font-size:20px">${i.segments}</b> <span class="muted small">· up to ${i.perSeg} chars each</span></div>
      <div>Remaining</div><div>${num(i.remaining)} characters before the next segment</div>
      <div>Members will see</div><div class="small" style="white-space:pre-wrap;background:#f4f2ec;padding:6px 9px;border-radius:8px">${esc(t) || '<span class="muted">…</span>'}</div>
      <div>Non-GSM characters</div><div>${i.bad.length ? i.bad.map(c => `<code style="background:#fff3d6;padding:0 5px;border-radius:4px">${esc(c === ' ' ? '␠' : c)}</code>`).join(' ') : '<span class="muted">None detected</span>'}</div>`;
    $('#reach').innerHTML = reach ? `
      <div>Texts</div><div><b>${num(sms)}</b> people</div>
      <div>Phone calls</div><div><b>${num(calls)}</b> people</div>
      ${reach.skipped_dnd ? `<div>Skipped</div><div class="small" style="color:var(--warn)">${num(reach.skipped_dnd)} call-only (quiet hours)</div>` : ''}
      <div>Total segments</div><div><b>${num(sms * i.segments)}</b> <span class="muted small">(${num(sms)} × ${i.segments})</span></div>
      ${reach.test_mode ? '<div>Note</div><div class="small" style="color:var(--warn)">Test mode: only test contacts</div>' : ''}` : '<div>Recipients</div><div class="muted">…</div>';
    const bc = $('#badchars');
    if (i.bad.length && i.bad.some(c => SMART[c] !== undefined)) {
      bc.style.display = ''; bc.innerHTML = `Some characters (like curly quotes) force Unicode and can double the cost.
        <button type="button" class="btn secondary sm" id="fixbtn" style="margin-left:8px">Fix characters</button>`;
      $('#fixbtn').onclick = () => { f.msg.value = fixSmart(f.msg.value); draw(); };
    } else if (i.bad.length) { bc.style.display = ''; bc.textContent = 'This message has emoji or special characters, so each segment holds 70 characters instead of 160.'; }
    else bc.style.display = 'none';
    $('#callnote').style.display = mode === 'CALL' || (calls > 0 && mode !== 'TEXT') ? '' : 'none';
  };
  const loadReach = async () => {
    const mode = f.mode.value;
    const { data, error } = await sb.rpc('web_preview', { p_org: o.id, p_group: f.group.value, p_mode: mode === 'EMERGENCY' ? 'PREF' : mode, p_emergency: mode === 'EMERGENCY' });
    reach = error ? null : data; draw();
  };
  f.msg.addEventListener('input', draw);
  f.group.addEventListener('change', loadReach); f.mode.addEventListener('change', loadReach);
  loadReach();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const t = f.msg.value.trim(); if (!t) return toast('Write a message first', true);
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const full = (pre && t.toLowerCase().startsWith(pre.replace(/: $/, '').toLowerCase()) ? '' : pre) + t + (/stop/i.test(t) ? '' : foot);
    if (!reach || !reach.total) return toast('Nobody in this group would receive it', true);
    const i = segInfo(full), mode = f.mode.value;
    const ok = await confirmBox(mode === 'EMERGENCY' ? '🚨 Send emergency message?' : 'Send this message?',
      `<b>${esc(f.group.value)}</b> · ${num(reach.sms)} texts${reach.calls ? ` + ${num(reach.calls)} calls` : ''} · ${num(reach.sms * i.segments)} segments<br><br>
       <span style="white-space:pre-wrap;display:block;background:#f4f2ec;padding:10px 12px;border-radius:10px">${esc(full)}</span>`, 'Send now', false);
    if (!ok) return;
    $('#sendbtn').disabled = true;
    const res = await sb.rpc('web_send', { p_org: o.id, p_group: f.group.value, p_message: t,
      p_mode: mode === 'EMERGENCY' ? 'PREF' : mode, p_emergency: mode === 'EMERGENCY' });
    $('#sendbtn').disabled = false;
    if (res.error) return toast(res.error.message, true);
    toast('Sending now. It will appear in History in a moment.');
    f.msg.value = ''; draw();
  });
}

/* ----- platform helpers ----- */
function signupDetails(r) {
  const c = r.compliance || {};
  const rows = Object.entries({ Organization: r.org_name, Contact: r.contact_name, Email: r.email, Phone: fmtPhone(r.phone),
    Plan: S.plans.find(p => p.id === r.plan_id)?.name, Billing: r.billing_period, 'Extra numbers': r.extra_numbers, 'Est. contacts': r.estimated_contacts,
    'Legal name': c.legal_name, Type: c.entity_type, EIN: c.ein, Website: c.website, Address: [c.street, c.city, c.state, c.zip].filter(Boolean).join(', '),
    Representative: [c.rep_first_name, c.rep_last_name, c.rep_title && `(${c.rep_title})`].filter(Boolean).join(' '), 'Opt-in': c.opt_in_method,
    Status: r.status, Paid: r.amount_paid ? money(r.amount_paid) + ' via ' + (r.payment_provider || '') : '—', Notes: r.notes });
  modal('Signup details', `<div class="kv">${rows.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v ?? '')}</div>`).join('')}</div>`);
  return 'keep';
}
function approveSignup(r) {
  return new Promise(res => modal(`Approve ${r.org_name}`, `<p>This creates the organization, gives <b>${esc(r.email)}</b> an owner login, adds default groups and a setup checklist.</p>
    <div class="field"><label>Twilio phone number for this organization *</label><input name="num" type="tel" placeholder="(845) 555-1234" required>
    <div class="hint">Buy it in Twilio first, then paste it here.</div></div>${r.paid_at ? '<p class="pill ok">Paid</p>' : '<p class="pill warn">Not paid yet: the organization will start as AWAITING PAYMENT</p>'}`,
    { saveText: 'Create organization', onSave: async f => { const n = f.num.value.trim(); if (!n) { toast('Enter the Twilio number', true); return false; }
      check(await sb.rpc('approve_org_signup', { p_signup_id: r.id, p_twilio_number: n }), 'Organization created 🎉'); await loadOrgs(); res(); } }));
}
function copyCompliance(r) {
  const o = S.orgs.find(x => x.id === r.org_id) || {};
  const txt = [`Legal name: ${r.legal_name || ''}`, `Type: ${r.entity_type || ''}`, `EIN: ${r.ein || ''}`, `Website: ${r.website || ''}`,
    `Address: ${[r.street, r.city, r.state, r.zip, r.country].filter(Boolean).join(', ')}`,
    `Authorized rep: ${[r.rep_first_name, r.rep_last_name].join(' ')} ${r.rep_title ? '(' + r.rep_title + ')' : ''}`, `Rep email: ${r.rep_email || ''}`, `Rep phone: ${r.rep_phone || ''}`,
    `Phone number(s): ${o.twilio_number || ''}`, '', `Campaign use case: ${r.use_case || ''}`, `Opt-in: ${r.opt_in_method || ''}`,
    `Opt-out: Members reply STOP to unsubscribe, START to resubscribe. HELP keyword supported by Twilio.`,
    `Sample 1: ${r.sample_message_1 || ''}`, `Sample 2: ${r.sample_message_2 || ''}`].join('\n');
  navigator.clipboard?.writeText(txt).then(() => toast('Copied, now paste into Twilio')).catch(() => {});
  modal('Registration details', `<pre class="cmd">${esc(txt)}</pre>`);
  return 'keep';
}

/* ============================================================
   ROUTER / BOOT
   ============================================================ */
async function render() {
  const key = (location.hash || '#overview').slice(1);
  const known = ['overview', 'settings', 'registration', 'send'].includes(key) || VIEWS[key];
  S.view = known && (!VIEWS[key]?.platform || S.isPlatform) ? key : 'overview';
  renderNav();
  if (!S.org && !VIEWS[S.view]?.platform) { $('#main').innerHTML = head('Welcome', 'No organization yet. Create one under All Organizations.'); return; }
  T.q = T.sortKey === S.view ? T.q : '';
  if (S.view === 'overview') return overviewPage();
  if (S.view === 'settings') return settingsPage();
  if (S.view === 'send') return sendPage();
  if (S.view === 'registration') return registrationPage();
  return tablePage(S.view);
}

async function loadOrgs() {
  const { data } = await sb.from('organizations').select('*').is('deleted_at', null).order('name');
  S.orgs = data || [];
  const sel = $('#org-select');
  sel.innerHTML = S.orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
  const saved = localStorageGet('shul_org');
  const pick = S.orgs.find(o => o.id === (S.org?.id || saved)) || S.orgs[0] || null;
  S.org = pick; if (pick) sel.value = pick.id;
  sel.parentElement.classList.toggle('hidden', S.orgs.length < 2);
}
async function loadPerms() {
  S.perms = { platform: S.isPlatform };
  if (S.org) { const { data } = await sb.rpc('my_perms', { p_org: S.org.id }); S.perms = data || S.perms; }
  else if (S.isPlatform) { const { data } = await sb.rpc('is_platform_owner'); S.perms.platform_owner = !!data; }
}
async function loadGroups() {
  if (!S.org) { S.groups = []; return; }
  const { data } = await sb.from('groups').select('code,active').eq('org_id', S.org.id).is('deleted_at', null).order('code');
  S.groups = data || [];
}
async function loadBadges() {
  S.badges = {};
  if (S.org) {
    const [r, s] = await Promise.all([
      sb.from('replies').select('id', { count: 'exact', head: true }).eq('org_id', S.org.id).eq('status', 'FORWARDED').is('deleted_at', null),
      sb.from('signup_requests').select('id', { count: 'exact', head: true }).eq('org_id', S.org.id).eq('status', 'PENDING APPROVAL').is('deleted_at', null)]);
    S.badges.replies = (r.count || 0) || ''; S.badges.signup_requests = s.count || '';
  }
  if (S.isPlatform) { const n = await sb.from('signups').select('id', { count: 'exact', head: true }).in('status', ['NEW', 'PAID']).is('deleted_at', null); S.badges.p_signups = n.count || ''; }
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { } }
async function switchOrg(id) {
  S.org = S.orgs.find(o => o.id === id) || S.org; localStorageSet('shul_org', S.org?.id || '');
  $('#org-select').value = S.org?.id || ''; await Promise.all([loadGroups(), loadPerms()]); await loadBadges(); render();
}
$('#org-select').addEventListener('change', e => switchOrg(e.target.value));

async function startApp(session) {
  S.user = session.user;
  $('#me').textContent = S.user.email; $('#na-email').textContent = S.user.email;
  const [pa, plans] = await Promise.all([sb.rpc('is_platform_admin'), sb.from('plans').select('*').is('deleted_at', null).order('sort_order')]);
  S.isPlatform = !!pa.data; S.plans = plans.data || [];
  await loadOrgs();
  if (!S.orgs.length && !S.isPlatform) { show('#login', false); show('#app', false); show('#noaccess', true); return; }
  await Promise.all([loadGroups(), loadPerms()]); await loadBadges();
  show('#login', false); show('#noaccess', false); show('#app', true);
  render();
}

// ---- auth ----
const loginErr = msg => { const n = $('#login-error'); n.textContent = msg || ''; n.classList.toggle('hidden', !msg); };
const backTo = () => location.origin + location.pathname;
function loginSent(html) { $('#login-sent-text').innerHTML = html; show('#login-form', false); show('#login-sent', true); loginErr(''); }
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); loginErr('');
  const email = $('#email').value.trim(), password = $('#password').value;
  if (!email) return loginErr('Enter your email.');
  if (!password) return loginErr('Enter your password, or use "Email me a sign-in link".');
  const btn = $('button[type=submit]', e.target); btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) loginErr(/invalid login/i.test(error.message)
    ? 'Wrong email or password. First time, or never set a password? Use "Email me a sign-in link" and you\'ll be asked to create one.'
    : error.message);
});
$('#login-link').addEventListener('click', async e => {
  const email = $('#email').value.trim(); if (!email) return loginErr('Enter your email first.');
  e.target.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: backTo(), shouldCreateUser: true } });
  e.target.disabled = false;
  if (error) return loginErr(error.message);
  loginSent('✅ Check your inbox for the sign-in email and click the link. Open it in this same browser. It can take a minute; check Spam if you don\'t see it.');
});
$('#login-forgot').addEventListener('click', async e => {
  const email = $('#email').value.trim(); if (!email) return loginErr('Enter your email above, then click "Forgot password?" again.');
  e.target.disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: backTo() });
  e.target.disabled = false;
  if (error) return loginErr(error.message);
  loginSent('✅ If that email has an account, we sent a link to reset your password. Open it in this same browser, then choose a new password.');
});
$('#login-again').addEventListener('click', () => { show('#login-form', true); show('#login-sent', false); });

// ---- set / change password (from the menu, or after a "Forgot password" link) ----
function passwordModal(title = 'Set your password', intro = '') {
  modal(title, `${intro}<p class="muted" style="margin-top:0">From now on you can sign in with <b>${esc(S.user?.email || '')}</b> and this password.</p>
    <input type="email" autocomplete="username" value="${esc(S.user?.email || '')}" hidden>
    <div class="field"><label>New password</label><input name="pw" type="password" autocomplete="new-password" minlength="8" required>
      <div class="hint">At least 8 characters.</div></div>
    <div class="field"><label>Type it again</label><input name="pw2" type="password" autocomplete="new-password" required></div>`,
  { saveText: 'Save password', onSave: async f => {
    const pw = f.pw.value, pw2 = f.pw2.value;
    if (pw.length < 8) { toast('Use at least 8 characters.', true); return false; }
    if (pw !== pw2) { toast("The two passwords don't match.", true); return false; }
    const { error } = await sb.auth.updateUser({ password: pw, data: { password_set: true } });
    if (error) { toast(error.message, true); return false; }
    if (S.user) S.user.user_metadata = { ...(S.user.user_metadata || {}), password_set: true };
    toast('Password saved. You can now sign in with it.');
  } });
}
document.addEventListener('click', e => { if (e.target.closest('[data-setpw]')) passwordModal(); });
let pendingRecovery = false;
$$('[data-signout]').forEach(b => b.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); }));

// Expired or already-used sign-in link: say so plainly instead of showing a blank login.
(() => {
  const h = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const err = h.get('error_code') || h.get('error');
  if (!err) return;
  const msg = /expired|otp/i.test(err + h.get('error_description'))
    ? 'That sign-in link has expired or was already used. Enter your email to get a new one.'
    : 'Sign-in failed: ' + (h.get('error_description') || err).replace(/\+/g, ' ');
  history.replaceState(null, '', location.pathname);
  setTimeout(() => { show('#login', true); const n = $('#login-error'); n.textContent = msg; n.classList.remove('hidden'); }, 0);
})();
let started = false;
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === 'PASSWORD_RECOVERY') pendingRecovery = true;
  if (session && !started) { started = true; startApp(session).then(() => {
    if (pendingRecovery) { pendingRecovery = false; passwordModal('Choose a new password'); }
    // first sign-in (email link = verification): ask them to create a password right away
    else if (!session.user?.user_metadata?.password_set) passwordModal('Create your password',
      '<p style="margin-top:0">✅ Your email is verified. Create a password so next time you can sign in without waiting for an email.</p>');
  }); }
  else if (evt === 'PASSWORD_RECOVERY' && started) { pendingRecovery = false; passwordModal('Choose a new password'); }
  if (!session) { started = false; show('#app', false); show('#noaccess', false); show('#login', true); }
});
