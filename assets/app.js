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
function friendlyError(e) {
  const m = e?.message || '';
  if (e?.code === '23505' && /contacts_org_phone/.test(m)) return 'This phone number is already in your contacts. Search for it and edit that person instead.';
  if (e?.code === '23505' && /contacts_org_email/.test(m)) return 'This email address is already in your contacts. Search for it and edit that person instead.';
  if (e?.code === '23505') return 'This is a duplicate: it already exists.';
  return m;
}
function check(res, okMsg) {
  if (res.error) { toast(friendlyError(res.error), true); throw res.error; }
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
const METHOD_OPTS = ['TEXT', 'CALL', 'EMAIL'];
const groupOpts = () => ['ALL', ...S.groups.filter(g => g.active && g.code !== 'ALL').map(g => g.code)];

const VIEWS = {
  // ----- organization -----
  contacts: { title: 'Contacts', perm: 'contacts', icon: '👥', table: 'contacts', scope: 'org', order: ['name', true], soft: true,
    desc: 'Everyone who receives announcements. Choose TEXT, CALL or EMAIL for each person.',
    cols: [
      { f: 'name', label: 'Name', req: true }, { f: 'phone', label: 'Phone', type: 'phone', hint: 'Needed for TEXT and CALL.' },
      { f: 'method', label: 'Method', type: 'select', opts: METHOD_OPTS, req: true,
        render: (v, r) => `${esc(v)}${r.also_email && v !== 'EMAIL' ? ' <span class="muted small">+ email</span>' : ''}` },
      { f: 'email', label: 'Email', type: 'email', render: (v, r) => v ? `<span class="small">${esc(v)}</span>${r.email_opt_out_at ? ' <span class="pill bad">unsubscribed</span>' : ''}` : '',
        hint: 'Needed for EMAIL. Each person can have their own email address.' },
      { f: 'also_email', label: 'Also send by email', type: 'bool', table: false, hint: 'For TEXT and CALL members: they also get every announcement by email (free).' },
      { f: 'groups', label: 'Groups', type: 'groups' }, { f: 'active', label: 'Active', type: 'bool' },
      { f: 'language', label: 'Language', type: 'select', opts: ['English', 'Yiddish', 'Hebrew', 'Russian', 'Spanish', 'French'], table: false },
      { f: 'is_test', label: 'Test contact', type: 'bool', table: false, hint: 'When Test Mode is on, only test contacts receive messages.' },
      { f: 'signup_source', label: 'Source', table: false }, { f: 'notes', label: 'Notes', type: 'longtext', table: false },
      { f: 'created_at', label: 'Added', type: 'date', edit: false },
    ], defaults: { method: 'TEXT', active: true, language: 'English', signup_source: 'Website', also_email: false } },

  groups: { title: 'Groups', perm: 'contacts', icon: '🗂️', table: 'groups', scope: 'org', order: ['number', true], soft: true,
    desc: 'Departments and lists. Texters can send by name or number, e.g. SEND WOMEN … or SEND 7 …, and pick the number on the phone when recording.',
    cols: [
      { f: 'number', label: '#', type: 'number', hint: 'Short number for texting (TEXT 2 …) and the phone keypad. Leave blank to get the next free number.' },
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
      { f: 'group_name', label: 'Group', render: v => `<span class="chip">${esc(v)}</span>` },
      { f: 'message', label: 'Message', render: (v, r) => `<div class="small" style="min-width:160px;max-width:260px;overflow-wrap:anywhere">${esc((v || '').slice(0, 90))}${(v || '').length > 90 ? '…' : ''}</div>`
          + [/^https:\/\//.test(r.audio_url || '') ? `<a class="small" href="${esc(r.audio_url)}" target="_blank" rel="noopener">▶ Play recording</a>` : '',
             /^https:\/\//.test(r.media_url || '') ? `<a class="small" href="${esc(r.media_url)}" target="_blank" rel="noopener">🖼 View flyer</a>` : ''].filter(Boolean).join(' · ') },
      { f: 'audio_url', label: 'Recording', table: false }, { f: 'media_url', label: 'Flyer', table: false },
      { f: 'recipient_count', label: 'Recipients', type: 'number' }, { f: '_rep', label: 'Delivery', render: (v, r) => deliveryLine(r._rep) },
      { f: 'sent_count', label: 'Texts', type: 'number', table: false }, { f: 'calls_made', label: 'Calls', type: 'number', table: false },
      { f: 'failed_count', label: 'Failed', type: 'number', table: false }, { f: 'status', label: 'Status', type: 'status' },
    ],
    after: async rows => {
      const ids = rows.slice(0, 300).map(r => r.id); if (!ids.length) return;
      const { data } = await sb.rpc('delivery_summary', { p_org: S.org.id, p_ids: ids });
      const m = Object.fromEntries((data || []).map(x => [x.history_id, x])); rows.forEach(r => { r._rep = m[r.id] || null; });
    },
    rowActions: r => r._rep && r._rep.tracked ? [{ label: 'Report', run: () => deliveryReport(r) }] : [] },

  replies: { title: 'Replies', perm: 'contacts', icon: '↩️', table: 'replies', scope: 'org', order: ['created_at', false], soft: true, noAdd: true,
    desc: 'Texts members sent back, and voicemails left on the phone line. They are also forwarded to the phones and email in Settings.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'name', label: 'Name', edit: false }, { f: 'phone', label: 'Phone', type: 'phone', edit: false },
      { f: 'message', label: 'Message', type: 'longtext', edit: false },
      { f: 'audio_url', label: 'Voicemail', edit: false, render: v => /^https:\/\//.test(v || '') ? `<a href="${esc(v)}" target="_blank" rel="noopener">▶ Play</a>` : '' }, { f: 'status', label: 'Status', type: 'select', opts: ['NEW', 'FORWARDED', 'HANDLED'] },
      { f: 'notes', label: 'Notes', type: 'longtext', table: false },
    ],
    rowActions: r => r.status !== 'HANDLED' ? [{ label: 'Mark handled', run: async () => check(await sb.from('replies').update({ status: 'HANDLED' }).eq('id', r.id), 'Marked handled') }] : [] },

  signup_requests: { title: 'Signup Requests', perm: 'contacts', icon: '🙋', table: 'signup_requests', scope: 'org', order: ['created_at', false], soft: true, noAdd: true,
    desc: 'People who texted JOIN (when auto-signup is off). Approve to add them to Contacts.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'name_given', label: 'Name' }, { f: 'phone', label: 'Phone', type: 'phone' }, { f: 'email', label: 'Email', type: 'email' },
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
      { f: 'contact_limit', label: 'Contact limit', type: 'number', table: false, hint: 'Leave empty for unlimited contacts.' }, { f: 'notification_limit', label: 'Monthly credits', type: 'number', table: false },
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
      { f: 'setup_fee', label: 'Setup', type: 'money' }, { f: 'contact_limit', label: 'Contacts', type: 'number', render: v => v == null ? 'Unlimited' : esc(num(v)), hint: 'Leave empty for unlimited contacts.' },
      { f: 'notification_limit', label: 'Credits / month', type: 'number' }, { f: 'voice_minute_limit', label: 'Voice min', type: 'number' },
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
      { f: 'notifications_this_month', label: 'Credits this month', render: (v, r) => usage(v, r.notification_limit) },
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
  ['overview', '🏠', 'Overview'], ['send', '✉️', 'Send Message'], ['contacts'], ['groups'], ['controllers'], ['h', 'Messages'], ['pending'], ['scheduled'], ['history'], ['polls', '📊', 'Polls'], ['replies'],
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
    email: pick(hdr, ['email', 'emailaddress', 'mail', 'email1', 'eaddress']),
    method: pick(hdr, ['method', 'type', 'preference', 'contactmethod', 'textorcall', 'via']),
    groups: pick(hdr, ['groups', 'group', 'lists', 'list', 'department', 'departments', 'tags', 'category']),
    language: pick(hdr, ['language', 'lang']),
    notes: pick(hdr, ['notes', 'note', 'comments', 'comment']),
  };
  let header = m.phone >= 0 || m.email >= 0 || m.name >= 0 || m.first >= 0;
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
      <b>Name</b> (or First / Last), <b>Phone</b> and/or <b>Email</b>, and optionally <b>Method</b> (Text, Call or Email), <b>Groups</b> (separated by commas), Language, Notes.
      <a href="#" id="imp-sample">Download a sample file</a>.</p>
    <div class="field"><input type="file" name="file" accept=".csv,.xlsx,.xls,.txt" required></div>
    <div class="grid2">
      <div class="field"><label>If Method is blank</label><select name="defmethod"><option value="TEXT">Text message</option><option value="CALL">Phone call</option><option value="EMAIL">Email</option></select></div>
      <div class="field"><label>Also add everyone to group</label><select name="addgroup"><option value="">(none)</option>${groupOptions}</select></div>
    </div>
    <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;margin-bottom:10px"><input type="checkbox" name="update" checked style="margin-top:3px">
      Update people who are already in my contacts (matched by phone or email; their groups are added to, never removed)</label>
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
    if (tot.invalid + tot.duplicates) parts.push(`${num(tot.invalid + tot.duplicates)} skipped (bad or repeated phone / email)`);
    toast('Import done: ' + parts.join(' · ') + (tot.new_groups.length ? ` · new groups: ${tot.new_groups.join(', ')}` : ''));
    await loadGroups(); tablePage('contacts');
  } });
  $('#imp-sample', f).addEventListener('click', e => {
    e.preventDefault();
    const csv = 'Name,Phone,Email,Method,Groups\nMoshe Klein,(845) 555-0101,,Text,"MEN, BOARD"\nSarah Klein,845-555-0102,sarah@example.com,Text,WOMEN\nYosef Gold,8455550103,,Call,MEN\nRivka Stern,,rivka@example.com,Email,WOMEN\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'contacts-sample.csv'; a.click();
  });
  f.file.addEventListener('change', async () => {
    const box = $('#imp-preview', f); parsed = [];
    const file = f.file.files[0]; if (!file) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="muted">Reading file…</p>';
    let rows;
    try { rows = await readSheet(file); } catch (err) { console.error(err); box.innerHTML = '<p style="color:var(--bad)">Could not read that file. Try saving it as CSV (in Excel: File → Save As → CSV) and upload again.</p>'; return; }
    const { m, header } = mapColumns(rows);
    if (m.phone < 0 && m.email < 0) { box.innerHTML = '<p style="color:var(--bad)">We couldn\'t find a phone or email column. Make sure the file has a column named <b>Phone</b> or <b>Email</b>.</p>'; return; }
    const existing = new Set(T.rows.filter(r => !r.deleted_at).flatMap(r => [String(r.phone || '').replace(/\D/g, '').slice(-10), (r.email || '').toLowerCase()]).filter(Boolean));
    const seen = new Set(); let bad = [], dup = 0, upd = 0;
    for (const r of rows.slice(header ? 1 : 0)) {
      const cellv = i => i >= 0 ? String(r[i] ?? '').trim() : '';
      const d = phoneDigits(cellv(m.phone));
      const em = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i.test(cellv(m.email)) ? cellv(m.email).toLowerCase() : '';
      const name = cellv(m.name) || [cellv(m.first), cellv(m.last)].filter(Boolean).join(' ');
      if (!d && !em) { bad.push(name || cellv(m.phone) || cellv(m.email) || '(blank)'); continue; }
      if ((d && seen.has(d)) || (em && seen.has(em))) { dup++; continue; } if (d) seen.add(d); if (em) seen.add(em);
      if ((d && existing.has(d)) || (em && existing.has(em))) upd++;
      const mt = cellv(m.method).toLowerCase();
      parsed.push({ name, phone: d, email: em, method: !d ? 'EMAIL' : /mail/.test(mt) && em ? 'EMAIL' : /call|voice|phone|landline/.test(mt) ? 'CALL' : mt ? 'TEXT' : '',
        groups: cellv(m.groups).split(/[,;|/]+/).map(x => x.trim().toUpperCase().replace(/\s+/g, '_')).filter(x => x && x !== 'ALL'),
        language: cellv(m.language), notes: cellv(m.notes) });
    }
    const known = new Set(S.groups.map(g => g.code));
    const newGroups = [...new Set(parsed.flatMap(p => p.groups))].filter(g => !known.has(g) && /^[A-Z0-9_]{1,30}$/.test(g));
    const limit = S.plans?.find(p => p.id === S.org.plan_id)?.contact_limit;
    const after = existing.size + parsed.length - upd;
    box.innerHTML = `<div class="card" style="padding:14px 16px;box-shadow:none;background:#fcfbf8">
      <b>${num(parsed.length)} people ready</b>: ${num(parsed.length - upd)} new${upd ? `, ${num(upd)} already in your contacts` : ''}.
      ${bad.length ? `<br><span style="color:var(--bad)">${num(bad.length)} row${bad.length > 1 ? 's' : ''} skipped, no good phone number or email: ${esc(bad.slice(0, 5).join(', '))}${bad.length > 5 ? '…' : ''}</span>` : ''}
      ${dup ? `<br><span class="muted">${num(dup)} repeated number${dup > 1 ? 's' : ''} in the file will be added once.</span>` : ''}
      ${newGroups.length ? `<br><span class="muted">New groups will be created: ${esc(newGroups.join(', '))}</span>` : ''}
      ${limit && after > limit ? `<br><span style="color:var(--warn)">Your plan includes ${num(limit)} contacts; after this import you'll have about ${num(after)}.</span>` : ''}
      </div>
      <div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Method</th><th>Groups</th></tr></thead><tbody>
      ${parsed.slice(0, 6).map(p => `<tr><td>${esc(p.name)}</td><td class="nowrap">${esc(p.phone ? fmtPhone(p.phone) : '')}</td><td class="small">${esc(p.email)}</td><td>${esc(p.method || f.defmethod.value)}</td><td>${p.groups.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</td></tr>`).join('')}
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
  const v = VIEWS[key]; const cols = v.cols.filter(c => !['diff', 'members', '_rep'].includes(c.f));
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
  main.innerHTML = '<div class="empty">Loading…</div>';
  const [contacts, hist, rep, sreq, usageRes, comp] = await Promise.all([
    sb.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', o.id).eq('active', true).is('deleted_at', null),
    sb.from('message_history').select('group_name,message,created_at,audio_url').eq('org_id', o.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1),
    sb.from('replies').select('id', { count: 'exact', head: true }).eq('org_id', o.id).neq('status', 'HANDLED').is('deleted_at', null),
    sb.from('signup_requests').select('id', { count: 'exact', head: true }).eq('org_id', o.id).eq('status', 'PENDING APPROVAL').is('deleted_at', null),
    sb.from('usage_monthly').select('*').eq('org_id', o.id).order('month', { ascending: false }).limit(1),
    sb.from('org_compliance').select('a2p_status').eq('org_id', o.id).maybeSingle(),
  ]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const u = (usageRes.data || [])[0]; const used = u && u.month === thisMonth ? Number(u.notifications) : 0;
  const last = (hist.data || [])[0];
  const phone = esc(fmtPhone(o.twilio_number));
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const ic = d => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  // only the things that really need a person's attention
  const notes = [];
  if (rep.count) notes.push(`<a href="#replies">💬 ${num(rep.count)} new ${rep.count === 1 ? 'reply' : 'replies'} from members</a>`);
  if (sreq.count) notes.push(`<a href="#signup_requests">🙋 ${num(sreq.count)} ${sreq.count === 1 ? 'person wants' : 'people want'} to join</a>`);
  if (o.test_mode) notes.push(`<a href="#settings">🧪 Test mode is on: only test contacts get messages</a>`);
  if (comp.data && comp.data.a2p_status && comp.data.a2p_status !== 'CAMPAIGN APPROVED') notes.push(`<a href="#registration">📋 Finish your texting registration so texts can be delivered</a>`);
  if (o.paid_until && new Date(o.paid_until) < new Date()) notes.push(`<span>💳 Your payment was due ${esc(fmtD(o.paid_until))}</span>`);

  main.innerHTML = `
  <div class="ov">
    <div class="ov-hello">
      <button class="btn secondary sm menu-btn" type="button" data-menu>☰ Menu</button>
      <h1>${hello}</h1>
      <p>${esc(o.name)} · What would you like to do?</p>
    </div>
    ${notes.length ? `<div class="ov-notes">${notes.join('')}</div>` : ''}

    <div class="ov-actions">
      <a class="ov-action" href="#send" data-sendmode="PREF">
        <span class="ov-ic">${ic('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>')}</span>
        <b>Send an announcement</b>
        <span>Type a message, choose who gets it, and send it as a text or a phone call.</span>
      </a>
      <a class="ov-action" href="#send" data-sendmode="VOICE">
        <span class="ov-ic">${ic('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>')}</span>
        <b>Record a voice message</b>
        <span>Record from your computer. Everyone in the group gets a phone call that plays it.</span>
      </a>
      <a class="ov-action" href="#contacts">
        <span class="ov-ic">${ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>')}</span>
        <b>Add people</b>
        <span>Add members one at a time, or upload your list from Excel.</span>
      </a>
    </div>

    <h2 class="ov-h2">How it works</h2>
    <p class="ov-sub">There are three ways to send an announcement. Use whichever is easiest.</p>
    <div class="ov-how">
      <div><span class="ov-num">1</span><b>From this website</b>
        <p>Click <a href="#send">Send an announcement</a>, pick a group, and write your message. You'll see exactly how many people get it before you press send.</p></div>
      <div><span class="ov-num">2</span><b>By texting from your phone</b>
        <p>Text <b>${phone}</b> something like <i>SEND MEN Mincha at 6:45</i>. You'll get a text back asking you to reply <b>YES</b> to send it.</p>
        <details class="ov-more"><summary>Show all text commands</summary>
          <ul>
            <li><b>SEND</b> group message: each person gets it the way they prefer (text or call)</li>
            <li><b>TEXT</b> group message: texts only</li>
            <li><b>CALL</b> group message: phone calls only</li>
            <li><b>EMERGENCY</b> group message: sends right away, even at night</li>
            <li><b>SCHEDULE</b> group 2026-12-01 19:00 message: sends later</li>
            <li><b>YES</b> / <b>NO</b>: confirm or cancel</li>
            <li><b>GROUPS</b>: lists your groups. Each group has a number, so <i>TEXT 1 …</i> is the same as <i>TEXT ALL …</i></li>
          </ul></details></div>
      <div><span class="ov-num">3</span><b>By calling in</b>
        <p>Call <b>${phone}</b> from your phone. Choose the group on the keypad, record your message, listen to it, and press <b>1</b> to send.</p></div>
    </div>

    <div class="ov-members">
      <b>What your members can do</b>
      <p>Reply to any text: the reply is sent on to the office. Call <b>${phone}</b> to hear the latest announcement, reach the office, or leave a message.
         They can stop anytime by texting <b>STOP</b>, or by pressing <b>9</b> when they call.</p>
    </div>

    <div class="ov-foot">
      <span><a href="#contacts">${num(contacts.count || 0)} members</a></span>
      <span>${num(used)} credits used this month</span>
      ${last ? `<span>Last announcement: <a href="#history">${last.audio_url ? '🎙️ voice message' : '“' + esc((last.message || '').slice(0, 40)) + ((last.message || '').length > 40 ? '…' : '') + '”'}</a> to ${esc(last.group_name)}, ${esc(fmtD(last.created_at))}</span>` : '<span>No announcements yet</span>'}
    </div>
  </div>`;
  $$('[data-sendmode]').forEach(a => a.addEventListener('click', () => { try { sessionStorage.setItem('cc_send_mode', a.dataset.sendmode); } catch {} }));
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
  { f: 'forward_replies_phone', label: 'Forward replies & voicemails to phone', type: 'phone', hint: 'Gets a text for every member reply, voicemail and signup request.' },
  { f: 'forward_replies_extra', label: 'Also forward to these phones', hint: 'Optional. Separate several numbers with commas, e.g. 845-555-1234, 718-555-9876' },
  { f: 'forward_replies_email', label: 'Also forward to email', hint: 'Optional. Several addresses can be separated with commas.' },
  { f: 'office_phone', label: 'Office phone (callers press 1)', type: 'phone', hint: 'When someone calls your number, "press 1" connects them here. Leave empty to use the forwarding phone above.' },
  { f: 'allow_callback_voicemail', label: 'Callers can leave a voicemail (press 2)', type: 'bool' },
  { f: 'allow_phone_signup', label: 'Callers can sign up by phone (press 4)', type: 'bool', hint: 'They are added to get announcements by phone call.' },
  { f: 'detect_voicemail', label: 'Tell apart people and answering machines on calls', type: 'bool', hint: 'The delivery report then shows "Answered" vs "Voicemail". Costs about ¾ cent extra per call. If off, a call picked up by voicemail counts as answered.' },
  { f: 'allow_auto_signup', label: 'Add new signups automatically', type: 'bool', hint: 'Applies to text JOIN and phone signups. If off, they appear in Signup Requests for approval.' },
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
      <div>Limits</div><div>${o.contact_limit ? num(o.contact_limit) + ' contacts' : 'Unlimited contacts'} · ${num(o.notification_limit)} credits/month · ${num(o.voice_minute_limit)} voice minutes</div>
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

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|us|io|info|co|me|ly|gl)\b)/i, PHONE_RE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const NAME_RE = /\{\s*(name|first\s*name|firstname|first)\s*\}/gi, FULL_RE = /\{\s*(full\s*name|fullname)\s*\}/gi;
const personalize = (t, name) => t.replace(FULL_RE, name || 'Friend').replace(NAME_RE, (name || '').split(' ')[0] || 'Friend');
/* ----- delivery report ----- */
function deliveryLine(x) {
  if (!x || !x.tracked) return '<span class="muted small">—</span>';
  const parts = [];
  if (x.delivered || x.failed || x.pending) parts.push(`💬 <b>${num(x.delivered)}</b> delivered${x.failed ? ` · <span style="color:var(--bad)">${num(x.failed)} failed</span>` : ''}${x.pending ? ` · ${num(x.pending)} waiting` : ''}`);
  const calls = x.answered + x.voicemail + x.no_answer + x.call_failed + x.call_pending;
  if (calls) parts.push(`📞 <b>${num(x.answered)}</b> answered${x.voicemail ? ` · ${num(x.voicemail)} voicemail` : ''}${x.no_answer ? ` · ${num(x.no_answer)} no answer` : ''}${x.call_failed ? ` · <span style="color:var(--bad)">${num(x.call_failed)} failed</span>` : ''}`);
  if (x.emailed) parts.push(`📧 ${num(x.emailed)} emailed`);
  if (x.replies) parts.push(`↩️ ${num(x.replies)} replied`);
  return `<div class="small" style="line-height:1.5;min-width:190px">${parts.join('<br>')}</div>`;
}
const RESULT_LABEL = { delivered: ['Delivered', 'ok'], failed: ['Failed', 'bad'], pending: ['Waiting', 'warn'], answered: ['Answered', 'ok'],
  voicemail: ['Voicemail', 'warn'], no_answer: ['No answer', 'bad'], emailed: ['Emailed', 'ok'] };
const ERR_LABEL = { '30003': 'Phone off or out of service', '30004': 'Blocked by the person', '30005': 'Number does not exist', '30006': 'Landline or can\'t get texts',
  '30007': 'Blocked by the carrier as spam', '30008': 'Unknown carrier error', '30034': 'Number not registered yet', '21610': 'Person texted STOP' };
const secs = n => n == null ? '' : n < 60 ? `${n} sec` : `${Math.floor(n / 60)} min ${n % 60} sec`;
async function deliveryReport(h) {
  const { data, error } = await sb.rpc('delivery_report', { p_history: h.id });
  if (error) { toast(error.message, true); return 'keep'; }
  const x = h._rep || {}, rows = data || [];
  const callsTotal = x.answered + x.voicemail + x.no_answer + x.call_failed + x.call_pending;
  const stat = (n, label, c = '') => `<div class="rep-stat ${c}"><b>${num(n)}</b><span>${label}</span></div>`;
  const body = `
    <p class="muted small" style="margin:0 0 12px">${esc(fmtDT(h.created_at))} · ${esc(h.group_name || '')} · ${esc((h.message || '').slice(0, 80))}${(h.message || '').length > 80 ? '…' : ''}</p>
    <div class="rep-stats">
      ${x.delivered + x.failed + x.pending ? stat(x.delivered, 'texts delivered', 'ok') + (x.failed ? stat(x.failed, 'texts failed', 'bad') : '') + (x.pending ? stat(x.pending, 'waiting') : '') : ''}
      ${callsTotal ? stat(x.answered, 'calls answered', 'ok') + (x.voicemail ? stat(x.voicemail, 'went to voicemail') : '') + (x.no_answer ? stat(x.no_answer, 'no answer', 'bad') : '') + (x.call_failed ? stat(x.call_failed, 'calls failed', 'bad') : '') : ''}
      ${callsTotal ? stat(Math.round((x.listen_seconds || 0) / 60), 'minutes listened') : ''}
      ${x.emailed ? stat(x.emailed, 'emails sent', 'ok') : ''}
      ${stat(x.replies, 'replied')}
    </div>
    <p class="small muted" style="margin:10px 0">Texts can show <b>delivered</b> to the phone. Phones don't report whether a text was opened.${callsTotal && !S.org.detect_voicemail ? ' Calls picked up by voicemail count as answered. To tell them apart, turn on answering machine detection in Settings.' : ''}</p>
    <div class="toolbar" style="padding:0;margin:0 0 8px"><input type="search" id="repq" placeholder="Search name or number…">
      <select id="repf"><option value="">Everyone</option>${Object.entries(RESULT_LABEL).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}<option value="replied">Replied</option></select></div>
    <div class="table-wrap" style="max-height:50vh;overflow:auto"><table class="data"><thead><tr><th>Name</th><th>Phone / email</th><th>How</th><th>Result</th><th>Listened</th><th>Reply</th></tr></thead><tbody id="repbody"></tbody></table></div>`;
  modal('Delivery report', body, { wide: true });
  $('#repq').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  const drawRows = () => {
    const q = ($('#repq').value || '').toLowerCase(), f = $('#repf').value;
    const list = rows.filter(r => (!q || (r.name || '').toLowerCase().includes(q) || (r.email || '').includes(q) || (r.phone || '').includes(q.replace(/\D/g, '') || '~'))
      && (!f || (f === 'replied' ? !!r.replied : r.result === f)));
    $('#repbody').innerHTML = list.map(r => { const [l, c] = RESULT_LABEL[r.result] || [r.result, ''];
      const why = r.error_code ? ERR_LABEL[r.error_code] || ('Error ' + r.error_code) : '';
      return `<tr><td>${esc(r.name || '—')}</td><td class="nowrap">${r.phone ? esc(fmtPhone(r.phone)) : `<span class="small">${esc(r.email || '')}</span>`}</td><td>${r.channel === 'call' ? '📞 Call' : r.channel === 'email' ? '📧 Email' : '💬 Text'}</td>
        <td><span class="pill ${c}">${esc(l)}</span>${why ? `<div class="small muted">${esc(why)}</div>` : ''}</td>
        <td class="nowrap">${r.channel === 'call' && r.duration ? esc(secs(r.duration)) : ''}</td><td class="small">${esc(r.replied || '')}</td></tr>`; }).join('')
      || '<tr><td colspan="6" class="empty">Nobody matches.</td></tr>';
  };
  $('#repq').addEventListener('input', drawRows); $('#repf').addEventListener('change', drawRows); drawRows();
  return 'keep';
}

/* ----- polls ----- */
async function pollsPage() {
  const o = S.org, main = $('#main');
  main.innerHTML = head('Polls', 'Ask a question by text. Members answer by replying with a number. Results update here as answers come in.',
    S.perms.send ? '<a class="btn" href="#send" id="newpoll">+ New poll</a>' : '') + '<div id="polls"><div class="card panel empty">Loading…</div></div>';
  $('#newpoll')?.addEventListener('click', () => { try { sessionStorage.setItem('cc_send_poll', '1'); } catch {} });
  const [{ data: polls, error }, { data: votes }] = await Promise.all([
    sb.from('polls').select('*').eq('org_id', o.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    sb.from('poll_votes').select('poll_id,phone,name,choice,updated_at').eq('org_id', o.id).limit(20000)]);
  if (error) { $('#polls').innerHTML = `<div class="card panel empty">${esc(error.message)}</div>`; return; }
  if (!polls.length) { $('#polls').innerHTML = `<div class="card panel"><h3 style="margin-top:0">No polls yet</h3>
    <p>On the <a href="#send">Send Message</a> page, check <b>📊 Add a poll</b>, type your question and the answers. Members get:</p>
    <div class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;max-width:420px">Kiddush this week, which day works?\nReply 1 for Friday night\nReply 2 for Shabbos morning</div>
    <p class="muted small">If someone replies again, their answer is changed. Polls close after the number of days you choose.</p></div>`; return; }
  const byPoll = {}; (votes || []).forEach(v => (byPoll[v.poll_id] = byPoll[v.poll_id] || []).push(v));
  const open = p => new Date(p.closes_at) > new Date();
  $('#polls').innerHTML = polls.map(p => {
    const vs = byPoll[p.id] || [], total = vs.length;
    const counts = p.options.map((_, i) => vs.filter(v => v.choice === i + 1).length), max = Math.max(1, ...counts);
    return `<div class="card panel poll" data-id="${esc(p.id)}" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div><h3 style="margin:0 0 4px">${esc(p.question)}</h3>
          <div class="muted small">${esc(fmtDT(p.created_at))}${p.group_name ? ' · ' + esc(p.group_name) : ''} · ${open(p) ? `<span class="pill ok">Open</span> until ${esc(fmtDT(p.closes_at))}` : '<span class="pill">Closed</span>'}</div></div>
        <div style="display:flex;gap:8px">${open(p) && S.perms.send ? '<button class="btn secondary sm" data-close>Close poll</button>' : ''}<button class="btn secondary sm" data-who>Who answered (${num(total)})</button></div></div>
      <div class="poll-bars">${p.options.map((opt, i) => `<div class="poll-row"><div class="poll-lab"><b>${i + 1}</b> ${esc(opt)}</div>
        <div class="poll-bar"><span style="width:${Math.round(counts[i] / max * 100)}%"></span></div>
        <div class="poll-n"><b>${num(counts[i])}</b> <span class="muted small">${total ? Math.round(counts[i] / total * 100) : 0}%</span></div></div>`).join('')}</div>
      <div class="muted small">${num(total)} ${total === 1 ? 'answer' : 'answers'}</div></div>`; }).join('');
  $('#polls').onclick = async e => {
    const card = e.target.closest('.poll'); if (!card) return; const p = polls.find(x => x.id === card.dataset.id);
    if (e.target.closest('[data-close]')) {
      if (!(await confirmBox('Close this poll?', 'Replies with a number will no longer be counted for it.', 'Close poll'))) return;
      check(await sb.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', p.id), 'Poll closed'); return pollsPage();
    }
    if (e.target.closest('[data-who]')) {
      const vs = (byPoll[p.id] || []).sort((a, b) => a.choice - b.choice || (a.name || '').localeCompare(b.name || ''));
      modal('Who answered', `<p style="margin-top:0"><b>${esc(p.question)}</b></p><div class="table-wrap" style="max-height:55vh;overflow:auto"><table class="data"><thead><tr><th>Name</th><th>Phone</th><th>Answer</th><th>When</th></tr></thead><tbody>
        ${vs.map(v => `<tr><td>${esc(v.name || '—')}</td><td class="nowrap">${esc(fmtPhone(v.phone))}</td><td>${v.choice}. ${esc(p.options[v.choice - 1] || '')}</td><td class="nowrap small">${esc(fmtDT(v.updated_at))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No answers yet.</td></tr>'}
        </tbody></table></div>`, { wide: true });
    }
  };
}

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
        <div class="field"><label>To group</label><select name="group">${groups.map(g => { const n = S.groups.find(x => x.code === g)?.number; return `<option value="${esc(g)}">${n ? n + ' · ' : ''}${esc(g)}</option>`; }).join('')}</select></div>
        <div class="field"><label>How</label><select name="mode">
          <option value="PREF">By each member's preference (text, call or email)</option><option value="TEXT">Text only</option>
          <option value="CALL">Phone call only</option><option value="VOICE">🎙️ Voice recording (calls everyone)</option><option value="EMERGENCY">🚨 Emergency (ignores quiet hours)</option></select></div>
      </div>
      <label id="vdndrow" class="hidden" style="display:flex;gap:8px;align-items:flex-start;font-weight:500;margin:0 0 14px;padding:10px 12px;border-radius:10px;background:var(--warn-soft);color:var(--warn)">
          <input type="checkbox" name="vdnd" style="margin-top:3px"> It's quiet hours now, so calls are held back. Check this to call them anyway.</label>
      <div id="voicebox" class="hidden">
        <div class="field"><label>Recording</label>
          <div class="groups-pick" style="margin-bottom:10px"><label><input type="radio" name="vsrc" value="rec" checked> 🎙️ Record now</label><label><input type="radio" name="vsrc" value="file"> Upload a file</label><label><input type="radio" name="vsrc" value="url"> Link to a recording</label></div>
          <div id="vrec" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px">
            <button type="button" class="btn secondary" id="vrecbtn">● Start recording</button>
            <span id="vrectime" class="muted small">Uses your computer's microphone. Up to 3 minutes.</span></div>
          <input type="file" name="vfile" id="vfile" class="hidden" accept=".mp3,.wav,audio/mpeg,audio/wav">
          <input type="url" name="vurl" id="vurl" class="hidden" placeholder="https://…/announcement.mp3">
          <div class="hint hidden" id="vfilehint">MP3 or WAV, up to 15 MB. Phone recordings in other formats (like .m4a) need to be saved as MP3 first.</div></div>
        <audio id="vplayer" controls class="hidden" style="width:100%;margin:0 0 12px"></audio>
        <div class="hint" style="margin:-4px 0 12px">📞 Everyone in the group gets a phone call: "This is a message from ${esc(o.name)}", then the recording plays twice.</div>
      </div>
      <div class="field"><label id="msglabel">Message</label><textarea name="msg" id="msg" rows="6" maxlength="1600" placeholder="Mincha today is at 6:45 PM."></textarea>
        <div class="hint" id="namehint">Tip: type <b>{name}</b> to greet each person by their first name, e.g. "Dear {name}, …"</div>
        <div class="hint" id="callnote" style="display:none">📞 Calls read this message aloud twice.</div>
        <div id="linkwarn" class="small" style="display:none;margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--bad-soft);color:var(--bad)">⚠️ Your message has a web address or phone number. Your texting registration doesn't allow these, so carriers may block it. Please remove it.</div></div>
      <div class="field" id="pollbox"><label style="display:flex;gap:8px;align-items:center;font-weight:600;cursor:pointer"><input type="checkbox" id="pollon"> 📊 Add a poll (members answer by replying with a number)</label>
        <div id="pollopts" class="hidden" style="margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--cream)">
          <div class="hint" style="margin:0 0 8px">Type your question in the message box above, then the answers here.</div>
          <div id="pollanswers"></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">
            <button type="button" class="btn secondary sm" id="polladd">+ Add answer</button>
            <label class="small" style="display:flex;gap:6px;align-items:center">Open for <select id="polldays"><option value="1">1 day</option><option value="3" selected>3 days</option><option value="7">1 week</option><option value="14">2 weeks</option></select></label></div>
          <div class="hint" style="margin-top:8px" id="pollnote">Polls go to texting members only, since people answer by text. Members set to CALL are left out.</div></div></div>
      <div id="badchars" class="small" style="display:none;margin:-4px 0 12px;padding:10px 12px;border-radius:10px;background:var(--warn-soft);color:var(--warn)"></div>
      <div class="field" id="flyerbox"><label>Flyer (optional)</label>
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <label class="btn secondary sm" style="cursor:pointer">📎 Add a flyer<input type="file" id="flyer" accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.pdf,.doc,.docx" hidden></label>
          <div id="flyerinfo" class="small muted" style="flex:1;min-width:200px">Any picture (including iPhone photos), a PDF, or a Word file. It's turned into a JPG picture that shows right inside the text.</div>
        </div>
        <div id="flyerprev" class="hidden" style="margin-top:10px;display:flex;gap:12px;align-items:flex-start">
          <img id="flyerimg" alt="Flyer preview" style="max-width:140px;max-height:180px;border-radius:8px;border:1px solid var(--line)">
          <div style="display:flex;flex-direction:column;gap:8px">
            <label id="flyeropt" class="hidden" style="display:flex;gap:6px;align-items:center;font-size:13px;font-weight:500"><input type="checkbox" id="flyerconv" checked> Send as a picture (recommended)</label>
            <a class="btn secondary sm" id="flyerdl" download="flyer.jpg">⬇ Download JPG</a>
            <button type="button" class="btn ghost sm" id="flyerrm">Remove</button></div></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="muted small">${o.confirmation_required ? 'You\'ll confirm before it goes out.' : ''}</span>
        <button class="btn gold" type="submit" id="sendbtn">Review & send</button></div>
    </form>
    <div class="card panel">
      <h3 id="calch">Message calculator</h3>
      <div class="kv" id="calc"></div>
      <div style="margin:14px 0 6px;font-weight:600;font-size:13px;color:var(--ink-2)">Who will receive it</div>
      <div class="kv" id="reach"><div>Recipients</div><div class="muted">…</div></div>
      <p class="small muted" id="segnote" style="margin:14px 0 0"><b>Credits:</b> each text uses 1 credit per segment: 160 plain characters, or 70 if it has Hebrew, Yiddish, emoji or special characters. Longer messages use more. A picture text (flyer) uses 3. Each phone call uses 1 credit.</p>
    </div>
  </div>`;
  const f = $('#sendf'); let reach = null;
  // ---- poll: answers appended as "Reply 1 for …" ----
  const pollOn = () => f.mode.value !== 'VOICE' && $('#pollon').checked;
  const pollOpts = () => $$('#pollanswers input').map(i => i.value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const withPoll = t => pollOn() && pollOpts().length ? (t.trim() + '\n' + pollOpts().map((x, i) => `Reply ${i + 1} for ${x}`).join('\n')) : t;
  const pollRow = (v = '') => { const n = $$('#pollanswers input').length + 1; if (n > 5) return;
    const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
    d.innerHTML = `<b style="width:18px">${n}</b><input type="text" maxlength="40" placeholder="Answer ${n}" value="${esc(v)}" style="flex:1">`;
    $('#pollanswers').appendChild(d); d.querySelector('input').addEventListener('input', () => draw());
    $('#polladd').classList.toggle('hidden', n >= 5); };
  pollRow(); pollRow();
  $('#polladd').addEventListener('click', () => { pollRow(); $$('#pollanswers input').pop().focus(); });
  $('#pollon').addEventListener('change', () => { $('#pollopts').classList.toggle('hidden', !$('#pollon').checked); loadReach(); });
  try { if (sessionStorage.getItem('cc_send_poll')) { sessionStorage.removeItem('cc_send_poll'); $('#pollon').checked = true; $('#pollopts').classList.remove('hidden'); } } catch {}
  // ---- flyer: picture (compressed), PDF (first page becomes the picture + link), Word (link) ----
  let flyer = null; // { image: Blob|null, file: File|null (sent as link), name, kind }
  const toJpeg = (src, maxSide = 1600, q = .82) => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error('convert')), 'image/jpeg', q);
    }; img.onerror = rej; img.src = src; });
  async function heicToJpeg(file) {
    const heic2any = (await import('https://esm.sh/heic2any@0.0.4')).default;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: .9 });
    return toJpeg(URL.createObjectURL(Array.isArray(out) ? out[0] : out));
  }
  async function docxToJpeg(file) {
    const mammoth = (await import('https://esm.sh/mammoth@1.8.0')).default;
    const html2canvas = (await import('https://esm.sh/html2canvas@1.4.1')).default;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-10000px;top:0;width:816px;padding:48px;background:#fff;color:#111;font:16px/1.5 Georgia,serif';
    box.innerHTML = value; box.querySelectorAll('img').forEach(i => { i.style.maxWidth = '100%'; });
    document.body.appendChild(box);
    try {
      const canvas = await html2canvas(box, { backgroundColor: '#ffffff', scale: 1.5, height: Math.min(box.scrollHeight, 1056 * 1.2), windowWidth: 912 });
      return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('render')), 'image/jpeg', .85));
    } finally { box.remove(); }
  }
  async function pdfFirstPage(file) {
    const pdfjs = await import('https://esm.sh/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1); const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(vp0.width, vp0.height)) });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('render')), 'image/jpeg', .85));
  }
  const asPicture = () => !!(flyer && flyer.image); // carrier registration: no links, so flyers always go as a picture
  const showFlyer = () => {
    const info = $('#flyerinfo'), prev = $('#flyerprev'), opt = $('#flyeropt'), dl = $('#flyerdl');
    if (!flyer) { prev.classList.add('hidden'); info.textContent = "Any picture (including iPhone photos), a PDF, or a Word file. It's turned into a JPG picture that shows right inside the text."; draw(); return; }
    if (flyer.image) {
      const u = URL.createObjectURL(flyer.image); $('#flyerimg').src = u; dl.href = u;
      dl.download = flyer.name.replace(/\.[^.]+$/, '') + '.jpg'; prev.classList.remove('hidden');
      opt.classList.add('hidden');
    } else prev.classList.add('hidden');
    info.innerHTML = !flyer.image
      ? `⚠️ <b>${esc(flyer.name)}</b> can't be sent. ` + (flyer.old ? 'Old Word files (.doc) can\'t be turned into a picture. Save it as .docx, PDF or JPG and upload that.' : 'It couldn\'t be turned into a picture. Save it as a JPG (or take a screenshot) and upload that.')
      : flyer.kind === 'image' ? `✅ <b>${esc(flyer.name)}</b> → JPG picture text.`
      : `✅ <b>${esc(flyer.name)}</b> → first page sent as a JPG picture.`;
    draw();
  };
  $('#flyer').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const n = file.name.toLowerCase(); $('#flyerinfo').textContent = 'Converting the flyer to a picture…';
    const tryConvert = async (fn, kindOk) => { try { return { image: await fn(), file, name: file.name, kind: kindOk }; } catch (err) { console.error(err); return { image: null, file, name: file.name, kind: 'link', failed: true }; } };
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
      if (/\.(heic|heif)$/.test(n) || /heic|heif/.test(file.type)) flyer = await tryConvert(() => heicToJpeg(file), 'image');
      else if (/\.gif$/.test(n)) flyer = { image: file.size < 900000 ? file : await toJpeg(URL.createObjectURL(file)), file: null, name: file.name, kind: 'image' };
      else if (/\.(jpe?g|png|webp|bmp)$/.test(n) || /^image\//.test(file.type)) flyer = await tryConvert(() => toJpeg(URL.createObjectURL(file)), 'image');
      else if (/\.pdf$/.test(n)) flyer = await tryConvert(() => pdfFirstPage(file), 'pdf');
      else if (/\.docx$/.test(n)) flyer = await tryConvert(() => docxToJpeg(file), 'docx');
      else if (/\.doc$/.test(n)) flyer = { image: null, file, name: file.name, kind: 'link', old: true };
      else throw new Error('Please choose a picture, PDF or Word file.');
      if (flyer.kind === 'image' && flyer.image) flyer.file = null; // a picture needs no extra link
    } catch (err) { flyer = null; toast(err.message || 'Could not use that file.', true); }
    showFlyer();
  });
  $('#flyerconv').addEventListener('change', () => showFlyer());
  $('#flyerrm').addEventListener('click', () => { flyer = null; showFlyer(); });
  async function uploadFlyer() {
    if (!flyer) return { media: null, link: null };
    const stamp = Date.now(), base = flyer.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'flyer';
    let media = null, link = null;
    if (flyer.image && asPicture()) {
      const type = flyer.image.type === 'image/gif' ? 'image/gif' : 'image/jpeg', path = `${o.id}/${stamp}-${base}.${type === 'image/gif' ? 'gif' : 'jpg'}`;
      const up = await sb.storage.from('flyers').upload(path, flyer.image, { contentType: type, upsert: false });
      if (up.error) throw new Error('Flyer upload failed: ' + up.error.message);
      media = sb.storage.from('flyers').getPublicUrl(path).data.publicUrl;
    }
    if (false && flyer.file) {
      const ext = flyer.file.name.split('.').pop().toLowerCase(), path = `${o.id}/${stamp}-${base}.${ext}`;
      const type = ({ pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', bmp: 'image/bmp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' })[ext] || flyer.file.type || 'application/octet-stream';
      const up = await sb.storage.from('flyers').upload(path, flyer.file, { contentType: type, upsert: false });
      if (up.error) throw new Error('Flyer upload failed: ' + up.error.message);
      link = sb.storage.from('flyers').getPublicUrl(path).data.publicUrl;
    }
    return { media, link };
  }
  const draw = () => {
    const raw0 = withPoll(f.msg.value); const mode = f.mode.value;
    $('#linkwarn').style.display = mode !== 'VOICE' && (LINK_RE.test(raw0) || PHONE_RE.test(raw0)) ? '' : 'none'; const hasName = NAME_RE.test(raw0) || FULL_RE.test(raw0); NAME_RE.lastIndex = 0; FULL_RE.lastIndex = 0;
    const raw = personalize(raw0, 'Sarah Cohen');
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const msg = raw.trim();
    const usePre = !(pre && msg && msg.toLowerCase().startsWith(pre.replace(/:\s*$/, '').toLowerCase())), useFoot = !/stop/i.test(msg);
    const t = (usePre ? pre : '') + msg + (useFoot ? foot : '');          // what is actually sent (heading + message + STOP line)
    const fixed = segInfo((usePre ? pre : '') + (useFoot ? foot : '')).chars; // the part added automatically
    const i = segInfo(t); const mine = Math.max(0, i.chars - fixed);
    const sms = reach ? reach.sms : 0, calls = reach && !pollOn() ? reach.calls : 0, emails = reach && ['PREF', 'EMERGENCY'].includes(mode) && !pollOn() ? (reach.email || 0) : 0;
    $('#calc').innerHTML = `
      <div>Encoding</div><div>${i.encoding === 'GSM-7' ? '<span class="pill ok">GSM-7 (standard)</span>' : '<span class="pill warn">Unicode</span>'}</div>
      <div>Characters</div><div>${num(i.chars)} <span class="muted small">= ${num(fixed)} heading and STOP line + ${num(mine)} your message</span></div>
      <div>Segments per text</div><div><b style="font-size:20px">${i.segments}</b> <span class="muted small">· up to ${i.perSeg} chars each</span></div>
      <div>Remaining</div><div>${msg ? `${num(i.remaining)} characters before the next segment` : `<b>${num(i.remaining)}</b> characters left for your message in 1 text`}</div>
      <div>Members will see</div><div><div class="small" style="white-space:pre-wrap;background:#f4f2ec;padding:6px 9px;border-radius:8px">${msg ? esc(t) : `${esc(pre)}<span class="muted"><i>your message</i></span>${esc(foot)}`}</div>${hasName ? '<div class="small muted" style="margin-top:4px">Example for a member named Sarah. Each person sees their own first name (or "Friend" if no name is saved).</div>' : ''}</div>
      <div>Non-GSM characters</div><div>${i.bad.length ? i.bad.map(c => `<code style="background:#fff3d6;padding:0 5px;border-radius:4px">${esc(c === ' ' ? '␠' : c)}</code>`).join(' ') : '<span class="muted">None detected</span>'}</div>`;
    $('#reach').innerHTML = reach ? `
      <div>Texts</div><div><b>${num(sms)}</b> people</div>
      <div>Phone calls</div><div><b>${num(calls)}</b> people</div>
      ${emails ? `<div>Emails</div><div><b>${num(emails)}</b> people <span class="muted small">(free)</span></div>` : ''}
      ${reach.skipped_dnd ? `<div>Skipped</div><div class="small" style="color:var(--warn)">${num(reach.skipped_dnd)} call-only (quiet hours)</div>` : ''}
      ${reach.skipped_call_only ? `<div>Left out</div><div class="small" style="color:var(--warn)">${num(reach.skipped_call_only)} set to CALL (polls are text only)</div>` : ''}
      <div>Credits this uses</div><div><b>${num(sms * (asPicture() ? 3 : i.segments) + calls)}</b> <span class="muted small">(${num(sms)} ${asPicture() ? 'picture texts × 3' : 'texts × ' + i.segments}${calls ? ` + ${num(calls)} calls` : ''})</span>${flyer && calls ? `<div class="small muted">${msg ? 'Call members hear your typed message only, never the flyer.' : 'No message typed: only texting members get the flyer, so call members won\'t be called.'}</div>` : ''}</div>
      ${reach.test_mode ? '<div>Note</div><div class="small" style="color:var(--warn)">Test mode: only test contacts</div>' : ''}` : '<div>Recipients</div><div class="muted">…</div>';
    const bc = $('#badchars');
    if (i.bad.length && i.bad.some(c => SMART[c] !== undefined)) {
      bc.style.display = ''; bc.innerHTML = `Some characters (like curly quotes) force Unicode and can double the cost.
        <button type="button" class="btn secondary sm" id="fixbtn" style="margin-left:8px">Fix characters</button>`;
      $('#fixbtn').onclick = () => { f.msg.value = fixSmart(f.msg.value); draw(); };
    } else if (i.bad.length) { bc.style.display = ''; bc.textContent = 'This message has emoji or special characters, so each segment holds 70 characters instead of 160.'; }
    else bc.style.display = 'none';
    $('#callnote').style.display = mode !== 'VOICE' && (mode === 'CALL' || (calls > 0 && mode !== 'TEXT')) ? '' : 'none';
    const voice = mode === 'VOICE';
    $('#voicebox').classList.toggle('hidden', !voice);
    $('#msglabel').textContent = voice ? 'Short description (for History, optional)' : 'Message';
    f.msg.rows = voice ? 2 : 6; f.msg.placeholder = voice ? 'e.g. Shabbos schedule announcement' : 'Mincha today is at 6:45 PM.';
    $('#calc').classList.toggle('hidden', voice); $('#badchars').style.display = voice ? 'none' : $('#badchars').style.display;
    $('#calch').textContent = voice ? 'Voice recording' : 'Message calculator';
    $('#segnote').classList.toggle('hidden', voice); $('#flyerbox').classList.toggle('hidden', voice); $('#pollbox').classList.toggle('hidden', voice); $('#namehint').classList.toggle('hidden', voice);
    $('#vdndrow').classList.toggle('hidden', !(mode !== 'EMERGENCY' && !pollOn() && reach && (reach.skipped_dnd > 0 || f.vdnd.checked)));
    if (voice && reach) $('#reach').innerHTML = `<div>Phone calls</div><div><b>${num(reach.calls)}</b> people</div>
      ${reach.skipped_dnd ? `<div>Skipped</div><div class="small" style="color:var(--warn)">${num(reach.skipped_dnd)} (quiet hours)</div>` : ''}
      ${reach.test_mode ? '<div>Note</div><div class="small" style="color:var(--warn)">Test mode: only test contacts</div>' : ''}`;
  };
  // voice: choose file or link, preview it
  const vplayer = $('#vplayer'); let vObjUrl = null;
  const vsrc = () => f.querySelector('input[name=vsrc]:checked').value;
  const showPlayer = src => { if (src) { vplayer.src = src; vplayer.classList.remove('hidden'); } else { vplayer.removeAttribute('src'); vplayer.classList.add('hidden'); } };
  const vPreview = () => vsrc() === 'file' ? vObjUrl : vsrc() === 'rec' ? vRecUrl : (/^https:\/\//.test(f.vurl.value.trim()) ? f.vurl.value.trim() : null);
  f.querySelectorAll('input[name=vsrc]').forEach(r => r.addEventListener('change', () => {
    if (vsrc() !== 'rec') stopRec();
    $('#vfile').classList.toggle('hidden', vsrc() !== 'file'); $('#vfilehint').classList.toggle('hidden', vsrc() !== 'file');
    $('#vurl').classList.toggle('hidden', vsrc() !== 'url'); $('#vrec').classList.toggle('hidden', vsrc() !== 'rec');
    showPlayer(vPreview());
  }));
  // record from the computer's microphone, then turn it into a WAV file that phone calls can play
  let mediaRec = null, recChunks = [], recTimer = null, recStart = 0, recStream = null, vRecFile = null, vRecUrl = null;
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const recBtn = $('#vrecbtn'), recTime = $('#vrectime');
  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('This browser can\'t record. Please use Chrome or Edge.', true);
    try { recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return toast('The microphone is blocked. Click the icon at the left of the address bar, allow the microphone, and try again.', true); }
    recChunks = []; mediaRec = new MediaRecorder(recStream);
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = finishRec;
    mediaRec.start(); recStart = Date.now();
    recBtn.textContent = '■ Stop recording'; recBtn.classList.add('danger');
    recTimer = setInterval(() => { const t = (Date.now() - recStart) / 1000; recTime.innerHTML = `<b style="color:var(--bad)">● Recording</b> ${mmss(t)} <span class="muted">(max 3:00)</span>`; if (t >= 180) stopRec(); }, 250);
  }
  function stopRec() {
    clearInterval(recTimer); recTimer = null;
    if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    recStream?.getTracks().forEach(t => t.stop()); recStream = null;
    recBtn.classList.remove('danger');
  }
  async function toWav(buf) {
    const rate = 16000, len = Math.max(1, Math.ceil(buf.duration * rate));
    const off = new OfflineAudioContext(1, len, rate); const src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start();
    const d = (await off.startRendering()).getChannelData(0);
    const v = new DataView(new ArrayBuffer(44 + d.length * 2)); const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, d.length * 2, true);
    for (let i = 0; i < d.length; i++) { const x = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([v], { type: 'audio/wav' });
  }
  async function finishRec() {
    recTime.textContent = 'Preparing your recording…';
    try {
      const blob = new Blob(recChunks, { type: mediaRec.mimeType || 'audio/webm' });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close();
      if (buf.duration < 1) { recTime.textContent = 'That was too short. Try again.'; recBtn.textContent = '● Start recording'; return; }
      vRecFile = new File([await toWav(buf)], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
      if (vRecUrl) URL.revokeObjectURL(vRecUrl); vRecUrl = URL.createObjectURL(vRecFile);
      showPlayer(vRecUrl);
      recTime.innerHTML = `✅ Recorded ${mmss(buf.duration)}. <b>Press ▶ below to listen.</b> Not happy? Record again.`;
      recBtn.textContent = '● Record again';
    } catch (e) { console.error(e); recTime.textContent = 'Could not use that recording. Please try again.'; recBtn.textContent = '● Start recording'; }
  }
  recBtn.addEventListener('click', () => { if (recTimer) stopRec(); else startRec(); });
  f.vfile.addEventListener('change', () => {
    const file = f.vfile.files[0]; if (vObjUrl) URL.revokeObjectURL(vObjUrl); vObjUrl = null;
    if (file) {
      if (!/\.(mp3|wav)$/i.test(file.name)) { toast('Please choose an MP3 or WAV file.', true); f.vfile.value = ''; }
      else if (file.size > 15 * 1024 * 1024) { toast('That file is over 15 MB.', true); f.vfile.value = ''; }
      else vObjUrl = URL.createObjectURL(file);
    }
    showPlayer(vObjUrl);
  });
  f.vdnd.addEventListener('change', () => loadReach());
  f.vurl.addEventListener('change', () => showPlayer(/^https:\/\//.test(f.vurl.value.trim()) ? f.vurl.value.trim() : null));
  const loadReach = async () => {
    const mode = f.mode.value;
    const { data, error } = await sb.rpc('web_preview', { p_org: o.id, p_group: f.group.value, p_mode: pollOn() ? 'TEXTERS' : mode === 'EMERGENCY' ? 'PREF' : mode === 'VOICE' ? 'CALL' : mode, p_emergency: mode === 'EMERGENCY' || (!pollOn() && f.vdnd.checked) });
    reach = error ? null : data; draw();
  };
  try { const m = sessionStorage.getItem('cc_send_mode'); sessionStorage.removeItem('cc_send_mode'); if (m === 'VOICE') f.mode.value = 'VOICE'; } catch {}
  f.msg.addEventListener('input', draw);
  f.group.addEventListener('change', loadReach); f.mode.addEventListener('change', loadReach);
  loadReach();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f.mode.value === 'VOICE') return sendVoice();
    let t = f.msg.value.trim(); if (!t && !flyer) return toast('Write a message first', true);
    const poll = pollOn();
    if (poll && !t) return toast('Type the poll question in the message box', true);
    if (poll && pollOpts().length < 2) return toast('A poll needs at least 2 answers', true);
    const question = t; if (poll) t = withPoll(t);
    if (flyer && !flyer.image) return toast('That flyer can\'t be sent. Upload it as a picture (JPG, PNG) or a PDF.', true);
    if (LINK_RE.test(t) || PHONE_RE.test(t)) return toast('Please remove the web address or phone number. Your texting registration doesn\'t allow them in messages.', true);
    const flyerOnly = !t && !!flyer;           // nothing to say on a call: texting members only
    const textOnly = flyerOnly || poll;
    if (flyerOnly) t = 'Please see the attached flyer.';
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const full = (pre && t.toLowerCase().startsWith(pre.replace(/:\s*$/, '').toLowerCase()) ? '' : pre) + t + (/stop/i.test(t) ? '' : foot);
    if (!reach || !reach.total) return toast('Nobody in this group would receive it', true);
    if (flyerOnly && !reach.sms && !reach.email) return toast('Everyone in this group gets calls, and a flyer can\'t be heard. Type a message to call them.', true);
    if (poll && !reach.sms) return toast('Nobody in this group gets texts, so nobody could answer the poll.', true);
    const i = segInfo(personalize(full, 'Sarah Cohen')), mode = f.mode.value; const callsOut = textOnly ? 0 : reach.calls;
    const ok = await confirmBox(poll ? '📊 Send this poll?' : mode === 'EMERGENCY' ? '🚨 Send emergency message?' : 'Send this message?',
      `<b>${esc(f.group.value)}</b> · ${num(reach.sms)} texts${callsOut ? ` + ${num(callsOut)} calls` : ''}${!poll && ['PREF', 'EMERGENCY'].includes(mode) && reach.email ? ` + ${num(reach.email)} emails` : ''} · ${num(reach.sms * (asPicture() ? 3 : i.segments) + callsOut)} credits<br><br>${asPicture() ? `<img src="${esc($('#flyerimg').src)}" style="max-width:120px;max-height:150px;border-radius:8px;border:1px solid var(--line);margin-bottom:8px"><br>` : ''}${flyer && !asPicture() ? `📎 ${esc(flyer.name)} (sent as a link)<br>` : ''}
       <span style="white-space:pre-wrap;display:block;background:#f4f2ec;padding:10px 12px;border-radius:10px">${esc(personalize(full, 'Sarah Cohen'))}</span>`, 'Send now', false);
    if (!ok) return;
    $('#sendbtn').disabled = true;
    let up;
    try { up = await uploadFlyer(); } catch (err) { $('#sendbtn').disabled = false; return toast(err.message, true); }
    const msgOut = t;
    let pollId = null;
    if (poll) {
      const pr = await sb.rpc('create_poll', { p_org: o.id, p_question: question, p_options: pollOpts(), p_group: f.group.value, p_days: +$('#polldays').value });
      if (pr.error) { $('#sendbtn').disabled = false; return toast(pr.error.message, true); }
      pollId = pr.data;
    }
    const res = await sb.rpc('web_send', { p_org: o.id, p_group: f.group.value, p_message: msgOut,
      p_mode: poll ? 'TEXTERS' : flyerOnly ? 'FLYER' : mode === 'EMERGENCY' ? 'PREF' : mode, p_emergency: mode === 'EMERGENCY' || (!textOnly && f.vdnd.checked), p_media_url: up.media });
    $('#sendbtn').disabled = false;
    if (res.error) { if (pollId) await sb.from('polls').update({ deleted_at: new Date().toISOString() }).eq('id', pollId); return toast(res.error.message, true); }
    toast(poll ? 'Poll sent. Watch the answers come in on the Polls page.' : 'Sending now. It will appear in History in a moment.');
    f.msg.value = ''; flyer = null; showFlyer();
    if (poll) { $('#pollon').checked = false; $('#pollopts').classList.add('hidden'); $('#pollanswers').innerHTML = ''; pollRow(); pollRow(); loadReach(); }
  });
  async function sendVoice() {
    if (recTimer) return toast('Stop the recording first.', true);
    const file = vsrc() === 'file' ? f.vfile.files[0] : vsrc() === 'rec' ? vRecFile : null, link = vsrc() === 'url' ? f.vurl.value.trim() : '';
    if (!file && !link) return toast(vsrc() === 'rec' ? 'Record your message first.' : vsrc() === 'file' ? 'Choose a recording to upload.' : 'Paste the link to the recording.', true);
    if (link && !/^https:\/\/\S+$/.test(link)) return toast('The link must start with https://', true);
    if (!reach || !reach.calls) return toast(reach?.skipped_dnd ? 'It\'s quiet hours: check "call everyone anyway" to send now.' : 'Nobody in this group would receive a call', true);
    const ok = await confirmBox('Send this voice recording?',
      `<b>${esc(f.group.value)}</b> · ${num(reach.calls)} phone calls<br><br>Each person hears "This is a message from ${esc(o.name)}", then the recording twice.
       <br><br><b>Listen before sending:</b><audio controls src="${esc(vPreview() || '')}" style="width:100%;margin-top:8px"></audio>`, 'Call everyone now', false);
    if (!ok) return;
    const btn = $('#sendbtn'); btn.disabled = true; btn.textContent = file ? 'Uploading…' : 'Sending…';
    try {
      let url = link;
      if (file) {
        const path = `${o.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_').slice(-60)}`;
        const type = /\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg';
        const up = await sb.storage.from('recordings').upload(path, file, { contentType: type, upsert: false });
        if (up.error) return toast('Upload failed: ' + up.error.message, true);
        url = sb.storage.from('recordings').getPublicUrl(path).data.publicUrl;
      }
      const res = await sb.rpc('web_send', { p_org: o.id, p_group: f.group.value, p_message: f.msg.value.trim(), p_mode: 'CALL', p_emergency: f.vdnd.checked, p_audio_url: url });
      if (res.error) return toast(res.error.message, true);
      toast('Calling now. It will appear in History in a moment.');
      f.msg.value = ''; f.vfile.value = ''; f.vurl.value = ''; if (vObjUrl) URL.revokeObjectURL(vObjUrl); vObjUrl = null;
      if (vRecUrl) URL.revokeObjectURL(vRecUrl); vRecUrl = null; vRecFile = null; recBtn.textContent = '● Start recording';
      recTime.textContent = 'Uses your computer\'s microphone. Up to 3 minutes.'; showPlayer(null); draw();
    } finally { btn.disabled = false; btn.textContent = 'Review & send'; }
  }
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
  const known = ['overview', 'settings', 'registration', 'send', 'polls'].includes(key) || VIEWS[key];
  S.view = known && (!VIEWS[key]?.platform || S.isPlatform) ? key : 'overview';
  renderNav();
  if (!S.org && !VIEWS[S.view]?.platform) { $('#main').innerHTML = head('Welcome', 'No organization yet. Create one under All Organizations.'); return; }
  T.q = T.sortKey === S.view ? T.q : '';
  if (S.view === 'overview') return overviewPage();
  if (S.view === 'settings') return settingsPage();
  if (S.view === 'send') return sendPage();
  if (S.view === 'polls') return pollsPage();
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
  const { data } = await sb.from('groups').select('code,active,number').eq('org_id', S.org.id).is('deleted_at', null).order('number', { nullsFirst: false }).order('code');
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
