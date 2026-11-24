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
// Jewish features (Hebrew dates, Hebrew calendar, zmanim) are turned on per organization by the platform owner
const JEW = () => !!S.org?.jewish_features;
// ---------- Hebrew dates (built into the browser: no internet lookup) ----------
const HEB_PREF = () => { try { return localStorage.getItem('cc_hebdates') || 'en'; } catch { return 'en'; } };
let _hfEn;
const HEB_MONTHS = { Tishri: 'תשרי', Heshvan: 'חשון', Kislev: 'כסלו', Tevet: 'טבת', Shevat: 'שבט', Adar: 'אדר', 'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳',
  Nisan: 'ניסן', Iyar: 'אייר', Sivan: 'סיון', Tamuz: 'תמוז', Av: 'אב', Elul: 'אלול' };
function gematria(n) { // 12 → י״ב, 787 → תשפ״ז
  n = n % 1000; let out = '';
  const H = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']], T = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], U = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  for (const [v, l] of H) while (n >= v) { out += l; n -= v; }
  if (n === 15) out += 'טו'; else if (n === 16) out += 'טז'; else { out += T[Math.floor(n / 10)] + U[n % 10]; }
  return out.length > 1 ? out.slice(0, -1) + '״' + out.slice(-1) : out + '׳';
}
function hebParts(d) {
  _hfEn ||= new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const p = Object.fromEntries(_hfEn.formatToParts(d).map(x => [x.type, x.value]));
  return { day: +p.day, month: p.month, year: +String(p.year || p.relatedYear || '').replace(/\D/g, '') };
}
function hebDate(d, style = HEB_PREF(), withYear = true) {
  if (!d || style === 'off') return '';
  try {
    const h = hebParts(d);
    if (style === 'he') return `${gematria(h.day)} ${HEB_MONTHS[h.month] || h.month}${withYear ? ' ' + gematria(h.year) : ''}`;
    return `${h.day} ${h.month}${withYear ? ' ' + h.year : ''}`;
  } catch { return ''; }
}
function hebDay(d, style) { const n = hebParts(d).day; return style === 'he' ? gematria(n).replace(/[׳״]/g, '') : String(n); }
// a calendar day as a UTC-noon Date, so the Hebrew date never slips a day
const dayUTC = (y, m, dd) => new Date(Date.UTC(y, m, dd, 12));
const asDayUTC = v => { if (!v) return null; const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return dayUTC(y, m - 1, d); }
  const x = new Date(v); return isNaN(x) ? null : dayUTC(x.getFullYear(), x.getMonth(), x.getDate()); };
const hebLine = v => { if (!JEW()) return ''; const t = hebDate(asDayUTC(v)); return t ? `<div class="hebd" ${HEB_PREF() === 'he' ? 'dir="rtl"' : ''}>${esc(t)}</div>` : ''; };
const money = n => n == null || n === '' ? '' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num = n => n == null ? '' : Number(n).toLocaleString();
document.querySelectorAll('[data-brand]').forEach(el => (el.textContent = cfg.brandName));

function toast(msg, isError) {
  const nc = /NO_CREDITS:(\d+):(\d+)/.exec(String(msg || ''));
  if (nc) { creditsModal(+nc[1], +nc[2]); return; }
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
const CMD_LABEL = { SEND: 'Text or call', TEXT: 'Text', CALL: 'Call', VOICE: 'Recording', EMERGENCY: 'Emergency', SCHEDULE: 'Scheduled', FLYER: 'Flyer', EMAIL: 'Email', POLL: 'Poll' };
const cmdPill = (v, r) => { if (!v) return ''; const u = String(v).toUpperCase(); const poll = /(^|\s)Reply 1 for /.test(r?.message || '');
  const lab = u === 'EMERGENCY' ? 'Emergency' : poll ? 'Poll' : r?.media_url && u !== 'VOICE' ? 'Flyer' : CMD_LABEL[u] || v;
  return `<span class="pill ${u === 'EMERGENCY' ? 'bad' : ''}" title="${esc(u)}">${esc(lab)}</span>`; };
const pill = v => { if (v == null || v === '') return ''; const u = String(v).toUpperCase();
  const c = STATUS.ok.includes(u) ? 'ok' : STATUS.warn.includes(u) ? 'warn' : STATUS.bad.includes(u) ? 'bad' : ''; return `<span class="pill ${c}">${esc(v)}</span>`; };

// recordings made by phone live at Twilio (password-protected) until they're copied to our storage
const isTwilioRec = u => /^https:\/\/api\.twilio\.com\//.test(u || '');
const audioLink = (u, label) => !/^https:\/\//.test(u || '') ? '' : isTwilioRec(u) ? '<span class="small muted">⏳ Saving recording…</span>'
  : `<a class="small" href="${esc(u)}" target="_blank" rel="noopener">${label}</a>`;
const audioPlayer = u => !/^https:\/\//.test(u || '') ? '' : isTwilioRec(u) ? '<span class="small muted">⏳ Saving recording…</span>'
  : `<audio controls preload="none" src="${esc(u)}" style="height:34px;width:220px;max-width:100%"></audio><div><a class="small" href="${esc(u)}" target="_blank" rel="noopener" download>Download</a></div>`;

// ---------- field rendering ----------
function cell(col, row) {
  const v = row[col.f];
  if (col.render) return col.render(v, row);
  switch (col.type) {
    case 'bool': return v ? '<span class="pill ok">Yes</span>' : '<span class="pill">No</span>';
    case 'phone': return `<span class="nowrap">${esc(fmtPhone(v))}</span>`;
    case 'groups': return (v || []).map(g => `<span class="chip">${esc(g)}</span>`).join('') || '<span class="muted small">none</span>';
    case 'datetime': return `<span class="nowrap">${esc(fmtDT(v))}</span>${hebLine(v)}`;
    case 'date': return `<span class="nowrap">${esc(fmtD(v))}</span>${hebLine(v)}`;
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
    case 'map': return `<div class="mapbox" data-map><div class="muted small">Type an address above to see it on the map.</div></div>`;
    default: return `<input ${name} value="${esc(v)}" ${req} maxlength="${col.max || 500}">`;
  }
}
function readForm(form, cols) {
  const out = {};
  for (const col of cols) {
    if (col.type === 'groups') { out[col.f] = $$(`[data-groups="${col.f}"] input:checked`, form).map(i => i.value); continue; }
    if (col.type === 'map') continue;
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
      { f: 'name', label: 'Name', edit: false }, { f: 'first_name', label: 'First name', req: true, table: false }, { f: 'last_name', label: 'Last name', table: false },
      { f: 'phone', label: 'Phone', type: 'phone', hint: 'Needed for TEXT and CALL.' },
      { f: 'method', label: 'Method', type: 'select', opts: METHOD_OPTS, req: true,
        render: (v, r) => `${esc(v)}${r.also_email && v !== 'EMAIL' ? ' <span class="muted small">+ email</span>' : ''}` },
      { f: 'email', label: 'Email', type: 'email', render: (v, r) => v ? `<span class="small">${esc(v)}</span>${r.email_opt_out_at ? ' <span class="pill bad">unsubscribed</span>' : ''}` : '',
        hint: 'Needed for EMAIL. Each person can have their own email address.' },
      { f: 'also_email', label: 'Also send by email', type: 'bool', table: false, hint: 'For TEXT and CALL members: they also get every announcement by email (free).' },
      { f: 'address_street', label: 'Street address', table: false, max: 200 }, { f: 'address_city', label: 'City', table: false, max: 100 },
      { f: 'address_state', label: 'State', table: false, max: 20 }, { f: 'address_zip', label: 'ZIP', table: false, max: 10 },
      { f: '_map', label: 'Map', type: 'map', export: false, render: (v, r) => addrLine(r) ? `<a class="small nowrap" href="${esc(mapsUrl(r))}" target="_blank" rel="noopener">📍 ${esc(r.address_city || 'Map')}</a>` : '' },
      { f: 'groups', label: 'Groups', type: 'groups', hint: 'With no group checked, this person only gets messages sent to ALL.' }, { f: 'active', label: 'Active', type: 'bool' },
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

  pending: { title: 'Waiting for YES', perm: 'send', icon: '⏳', table: 'pending_messages', scope: 'org', order: ['created_at', false], soft: true, noAdd: true, noEdit: true,
    desc: 'When someone texts in a message from their phone, it waits here until they reply YES. If no YES comes within the time set in Settings (30 minutes unless changed), it expires and nothing is sent.',
    toggle: { label: 'Show confirmed and cancelled', keep: r => r.status === 'PENDING CONFIRMATION' && !(r.expires_at && new Date(r.expires_at) < new Date()) },
    empty: 'Nothing is waiting for a YES right now. Messages texted in from a phone show here until the sender confirms them.',
    cols: [
      { f: 'created_at', label: 'Received', type: 'datetime' }, { f: 'sender_name', label: 'Sender' }, { f: 'command', label: 'Type', type: 'status', render: (v, r) => cmdPill(v, r) },
      { f: 'group_name', label: 'Group', render: v => `<span class="chip">${esc(v)}</span>` }, { f: 'message', label: 'Message', type: 'longtext', render: v => `<div class="small" style="min-width:160px;max-width:260px">${esc((v || '').slice(0, 90))}${(v || '').length > 90 ? '…' : ''}</div>` },
      { f: 'recipient_count', label: 'Recipients', type: 'number' }, { f: 'status', label: 'Status', type: 'status', render: (v, r) => { let u = String(v || '').toUpperCase(); if (u === 'PENDING CONFIRMATION' && r?.expires_at && new Date(r.expires_at) < new Date()) u = 'EXPIRED';
        const m = { YES: ['Sent', 'ok'], SENT: ['Sent', 'ok'], CONFIRMED: ['Sent', 'ok'], 'PENDING CONFIRMATION': ['Waiting for YES', 'warn'], NO: ['Cancelled', 'bad'], CANCELLED: ['Cancelled', 'bad'], EXPIRED: ['Expired', ''] }[u];
        return m ? `<span class="pill ${m[1]}" title="${esc(u)}">${m[0]}</span>` : pill(v); } },
    ],
    rowActions: r => r.status === 'PENDING CONFIRMATION' ? [{ label: 'Cancel', danger: true, run: async () => {
      check(await sb.from('pending_messages').update({ status: 'CANCELLED', confirmed_at: new Date().toISOString() }).eq('id', r.id), 'Cancelled'); } }] : [] },

  scheduled: { title: 'Scheduled', addTitle: 'Schedule a message', perm: 'send', icon: '⏰', table: 'scheduled_messages', scope: 'org', order: ['scheduled_for', false], soft: true,
    desc: 'Messages waiting to go out at a set time (checked every 5 minutes). Once sent, they move to History.',
    toggle: { label: 'Show already sent', keep: r => r.status === 'SCHEDULED' }, canEdit: r => r.status === 'SCHEDULED',
    rowActions: r => [{ label: '↻ Use again', run: () => reuseMessage(r) }],
    empty: 'Nothing is scheduled right now. Click + Add to schedule a message, or see sent messages in History.',
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

  history: { title: 'History', needs: 'history', icon: '📜', table: 'message_history', scope: 'org', order: ['created_at', false], readOnly: true, query: q => q.is('onetime_job', null),
    desc: 'Every announcement that went out.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime' }, { f: 'sender_name', label: 'Sender' }, { f: 'command', label: 'Type', type: 'status', render: (v, r) => cmdPill(v, r) },
      { f: 'group_name', label: 'Group', render: v => `<span class="chip">${esc(v)}</span>` },
      { f: 'message', label: 'Message', render: (v, r) => `<div class="small" style="min-width:150px;max-width:220px;overflow-wrap:anywhere">${esc((v || '').slice(0, 90))}${(v || '').length > 90 ? '…' : ''}</div>`
          + [audioLink(r.audio_url, '▶ Play recording'),
             /^https:\/\//.test(r.media_url || '') ? `<a class="small" href="${esc(r.media_url)}" target="_blank" rel="noopener">🖼 View flyer</a>` : ''].filter(Boolean).join(' · ') },
      { f: 'audio_url', label: 'Recording', table: false }, { f: 'media_url', label: 'Flyer', table: false },
      { f: 'recipient_count', label: 'Recipients', type: 'number' }, { f: '_rep', label: 'Delivery', render: (v, r) => `<div style="min-width:150px">${deliveryLine(r._rep)}</div><div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px">${VIEWS.history.rowActions(r).map((a, i) => `<button class="btn ${a.label.includes('Report') ? '' : 'secondary'} sm" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` },
      { f: 'sent_count', label: 'Texts', type: 'number', table: false }, { f: 'calls_made', label: 'Calls', type: 'number', table: false },
      { f: 'failed_count', label: 'Failed', type: 'number', table: false }, { f: 'status', label: 'Status', type: 'status', table: false },
    ],
    after: async rows => {
      const ids = rows.slice(0, 300).map(r => r.id); if (!ids.length) return;
      const { data } = await sb.rpc('delivery_summary', { p_org: S.org.id, p_ids: ids });
      const m = Object.fromEntries((data || []).map(x => [x.history_id, x])); rows.forEach(r => { r._rep = m[r.id] || null; });
    },
    actionsInCell: true,
    rowActions: r => [...(r._rep && r._rep.tracked ? [{ label: '📊 Report', run: () => deliveryReport(r) }] : []), ...(S.perms.send ? [{ label: '↻ Use again', run: () => reuseMessage(r) }] : [])] },

  replies: { title: 'Replies', perm: 'contacts', icon: '↩️', table: 'replies', scope: 'org', order: ['created_at', false], soft: true, noAdd: true,
    desc: 'Texts members sent back, and voicemails left on the phone line (typed out when "Turn voicemails into text" is on). They are also forwarded to the phones and email in Settings. Private voicemails (press 6) show only to the person they are for.',
    cols: [
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'name', label: 'Name', edit: false }, { f: 'phone', label: 'Phone', type: 'phone', edit: false },
      { f: 'message', label: 'Message', type: 'longtext', edit: false },
      { f: 'audio_url', label: 'Voicemail', edit: false, render: v => audioPlayer(v) }, { f: 'is_private', label: 'Private', edit: false, render: v => v ? '<span class="pill warn">🔒 Private</span>' : '' }, { f: 'status', label: 'Status', type: 'select', opts: ['NEW', 'FORWARDED', 'HANDLED'] },
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
      { f: 'jewish_features', label: 'Jewish features', type: 'bool', table: false, hint: 'Hebrew dates and Hebrew calendar, Shabbos times and zmanim in repeating messages, Jewish examples. Off for non-Jewish customers.' },
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
      { f: 'created_at', label: 'When', type: 'datetime', edit: false }, { f: 'account_type', label: 'Type', type: 'select', opts: ['COMMUNITY', 'FAMILY'] },
      { f: 'org_name', label: 'Name' }, { f: 'contact_name', label: 'Contact' },
      { f: 'email', label: 'Email', type: 'email' }, { f: 'phone', label: 'Phone', type: 'phone' }, { f: 'phone2', label: 'Phone 2', type: 'phone', table: false },
      { f: 'est_texts', label: 'Texts / month', type: 'number' }, { f: 'est_calls', label: 'Calls / month', type: 'number' }, { f: 'est_emails', label: 'Emails / month', type: 'number' },
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

  p_packs: { title: 'Credit packs', icon: '➕', table: 'credit_packs', scope: 'platform', order: ['sort_order', true], platform: true, idField: 'code', noDeletedCol: true,
    desc: 'Extra credits a customer can buy for the current month. Paste a Stripe Payment Link (one-time price) for each pack. For the "Upgrade my plan" button, put your Stripe customer portal link in System Settings → stripe_portal_url.',
    cols: [{ f: 'sort_order', label: '#', type: 'number' }, { f: 'code', label: 'Code', req: true }, { f: 'credits', label: 'Credits', type: 'number', req: true },
      { f: 'price', label: 'Price', type: 'money', req: true }, { f: 'checkout_url', label: 'Payment link', render: v => v ? '✅ set' : '<span class="muted">not set</span>', hint: 'https://buy.stripe.com/…' },
      { f: 'active', label: 'Offered', type: 'bool' }] },
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
const orgNumber = o => o?.is_demo ? (S.demoNumber || '') : o?.twilio_number;
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
// The side menu: a few main items; related pages sit together as tabs at the top of the page
const NAV_ORG = [
  ['overview', '🏠', 'Overview'], ['send', '✉️', 'Send Message'],
  { g: 'messages', icon: '📨', label: 'Messages', tabs: [['history', 'History'], ['scheduled', 'Scheduled'], ['repeating', 'Repeating'], ['polls', 'Polls'], ['samples', 'Sample messages'], ['pending', 'Waiting for YES']] },
  { g: 'inbox', icon: '📥', label: 'Inbox', tabs: [['replies', 'Replies & voicemails'], ['signup_requests', 'Signup requests'], ['inbound', 'All incoming texts']] },
  { g: 'people', icon: '👥', label: 'People', tabs: [['contacts', 'Contacts'], ['groups', 'Groups'], ['controllers', 'Texters'], ['opt_outs', 'Opted out']] },
  { g: 'org', icon: '⚙️', label: 'Settings', tabs: [['settings', 'Settings'], ['credits', 'Plan & credits'], ['pronunciation', 'Pronunciation'], ['admins', 'Website admins'], ['numbers', 'Phone numbers'], ['registration', 'Texting registration'], ['audit', 'Change log']] },
];
const NAV_PLATFORM = [['h', 'Platform owner'],
  { g: 'p_cust', icon: '🏛️', label: 'Customers', tabs: [['p_orgs', 'Organizations'], ['p_signups', 'New signups'], ['p_onetime', 'One-time sends'], ['p_usage', 'Usage'], ['p_invoices', 'Invoices']] },
  { g: 'p_setup', icon: '🧰', label: 'Setup', tabs: [['p_setup', 'Setup tasks'], ['p_compliance', 'Compliance'], ['p_numbers', 'Numbers'], ['p_tests', 'Tests']] },
  { g: 'p_biz', icon: '💼', label: 'Business', tabs: [['p_plans', 'Plans & pricing'], ['p_packs', 'Credit packs'], ['p_leads', 'Leads'], ['p_support', 'Support'], ['p_roadmap', 'Roadmap'], ['p_costs', 'Costs'], ['p_staff', 'Staff'], ['p_settings', 'Platform settings']] }];
const navAllowed = k => !VIEWS[k]?.needs || S.perms[VIEWS[k].needs];
const groupOf = k => [...NAV_ORG, ...NAV_PLATFORM].find(x => x.g && x.tabs.some(t => t[0] === k));

const canWrite = v => !v.readOnly && (!v.perm || !!S.perms[v.perm]);
function renderDemoBar() {
  const el = $('#demobar'); if (!el) return;
  if (S.org?.is_demo) {
    el.innerHTML = `👋 <b>This is a sample account.</b> The members are made up and show sample results. Add your own phone under <a href="#contacts">People → Contacts</a> and check the groups you'll send to (or send to ALL) to get real texts and calls. Everything resets every night.`;
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}
function renderNav() {
  renderDemoBar();
  // while the owner looks at a sample account, keep the owner menu out of sight (it comes back on any real account)
  const items = [...NAV_ORG, ...(S.isPlatform && !(S.org?.is_demo && !VIEWS[S.view]?.platform && !['p_onetime', 'p_costs'].includes(S.view)) ? NAV_PLATFORM : [])];
  const cur = groupOf(S.view);
  $('#nav').innerHTML = items.map(it => {
    if (it.g) {
      const tabs = it.tabs.filter(([k]) => navAllowed(k) && (VIEWS[k] || ['settings', 'registration', 'send', 'polls', 'repeating'].includes(k)));
      if (!tabs.length) return '';
      const last = localStorageGet('cc_tab_' + it.g), to = tabs.some(t => t[0] === last) ? last : tabs[0][0];
      const b = tabs.reduce((n, [k]) => n + (+S.badges[k] || 0), 0);
      return `<a href="#${to}" class="${cur === it ? 'on' : ''}" title="${esc(it.label)}"><span class="ni">${it.icon}</span><span class="nl">${esc(it.label)}</span>${b ? `<span class="badge">${b}</span>` : ''}</a>`;
    }
    const [k, icon, label] = it;
    if (k === 'h') return `<div class="nav-h">${esc(icon)}</div>`;
    if (!navAllowed(k)) return '';
    const v = VIEWS[k] || {}; const b = S.badges[k];
    const t = label || v.title;
    return `<a href="#${k}" class="${S.view === k ? 'on' : ''}" title="${esc(t)}"><span class="ni">${icon || v.icon}</span><span class="nl">${esc(t)}</span>${b ? `<span class="badge">${b}</span>` : ''}</a>`;
  }).join('');
  // tabs across the top for the pages that belong together
  const st = $('#subtabs');
  if (cur && S.org || cur && cur.g.startsWith('p_')) {
    localStorageSet('cc_tab_' + cur.g, S.view);
    const tabs = cur.tabs.filter(([k]) => navAllowed(k));
    st.innerHTML = tabs.map(([k, l]) => `<a href="#${k}" class="${S.view === k ? 'on' : ''}">${esc(l)}${S.badges[k] ? ` <span class="badge">${S.badges[k]}</span>` : ''}</a>`).join('');
    st.classList.remove('hidden');
  } else st.classList.add('hidden');
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
    street: pick(hdr, ['street', 'address', 'streetaddress', 'address1', 'addressline1', 'addr']),
    city: pick(hdr, ['city', 'town']), state: pick(hdr, ['state', 'st', 'province']), zip: pick(hdr, ['zip', 'zipcode', 'postal', 'postalcode', 'postcode']),
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
      <b>Name</b> (or First / Last), <b>Phone</b> and/or <b>Email</b>, and optionally <b>Method</b> (Text, Call or Email), <b>Groups</b> (separated by commas), Street, City, State, ZIP, Language, Notes.
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
        language: cellv(m.language), notes: cellv(m.notes), first_name: cellv(m.first), last_name: cellv(m.last),
        street: cellv(m.street), city: cellv(m.city), state: cellv(m.state), zip: cellv(m.zip) });
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
      ${v.toggle ? `<label class="inline"><input type="checkbox" id="showall" ${T.showAll?.[key] ? 'checked' : ''}> ${esc(v.toggle.label)}</label>` : ''}
      ${v.soft ? `<label class="inline"><input type="checkbox" id="showdel" ${T.showDeleted ? 'checked' : ''}> Show deleted</label>` : ''}
      <span class="spacer"></span><span class="muted small" id="count"></span><button class="btn secondary sm" id="csv">Export CSV</button></div>
    <div class="card table-wrap" id="tbl"><div class="empty">Loading…</div></div>`;
  $('#q').addEventListener('input', e => { T.q = e.target.value; drawTable(key); });
  $('#showdel')?.addEventListener('change', e => { T.showDeleted = e.target.checked; tablePage(key); });
  $('#showall')?.addEventListener('change', e => { T.showAll = { ...(T.showAll || {}), [key]: e.target.checked }; drawTable(key); });
  $('#add')?.addEventListener('click', () => editRow(key, null));
  $('#import')?.addEventListener('click', () => importContacts());
  $('#csv').addEventListener('click', () => exportCsv(key));

  let q = sb.from(v.table).select('*').limit(5000);
  if (v.scope === 'org') q = q.eq('org_id', S.org.id);
  if (v.soft && !T.showDeleted) q = q.is('deleted_at', null);
  if (v.query) q = v.query(q);
  const res = await q;
  if (res.error) { $('#tbl').innerHTML = `<div class="empty">${esc(res.error.message)}</div>`; return; }
  T.rows = res.data || [];
  if (v.after) await v.after(T.rows);
  drawTable(key);
}

function drawTable(key) {
  const v = VIEWS[key]; const cols = v.cols.filter(c => c.table !== false);
  const q = T.q.toLowerCase();
  let rows = T.rows.filter(r => !v.toggle || T.showAll?.[key] || v.toggle.keep(r)).filter(r => !q || Object.values(r).some(x => x != null && String(Array.isArray(x) ? x.join(' ') : typeof x === 'object' ? JSON.stringify(x) : x).toLowerCase().includes(q)));
  if (T.sort) { const [f, asc] = T.sort; rows.sort((a, b) => { const x = a[f] ?? '', y = b[f] ?? ''; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); }); }
  $('#count').textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  if (!rows.length) { $('#tbl').innerHTML = `<div class="empty">${T.q ? 'No matches.' : esc(v.empty || 'Nothing here yet.')}</div>`; return; }
  const canEdit = r => canWrite(v) && !v.noEdit && !r.deleted_at && (!v.canEdit || v.canEdit(r));
  $('#tbl').innerHTML = `<table class="data"><thead><tr>${cols.map(c => `<th data-sort="${esc(c.f)}">${esc(c.label)}${T.sort && T.sort[0] === c.f ? (T.sort[1] ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.deleted_at ? 'deleted' : ''}" data-id="${esc(r[v.idField || 'id'] ?? r.org_id)}">${cols.map(c => `<td>${cell(c, r)}</td>`).join('')}
      <td class="actions">${(v.rowActions && !v.actionsInCell && (canWrite(v) || v.readOnly || v.platform) ? v.rowActions(r) : []).map((a, i) => `<button class="btn ${a.danger ? 'danger' : 'secondary'} sm" data-act="${i}">${esc(a.label)}</button>`).join(' ')}
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
      try { const out = await a.run(); if (out === 'keep') btn.disabled = false; else if (out !== 'nav') tablePage(key); } catch (err) { btn.disabled = false; } }
  };
}

function editRow(key, row) {
  const v = VIEWS[key]; const isNew = !row; const cols = v.cols.filter(c => c.edit !== false);
  const data = row || { ...(v.defaults || {}) };
  const html = `<div class="grid2">${cols.map(c => `<div class="field" style="${['longtext', 'groups', 'list', 'map'].includes(c.type) ? 'grid-column:1/-1' : ''}">
    <label>${esc(c.label)}${c.req ? ' *' : ''}</label>${input(c, data[c.f])}${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}</div>`).join('')}</div>`;
  modal(isNew ? (v.addTitle || `Add ${v.title.replace(/s$/, '').toLowerCase()}`) : 'Edit', html, { wide: cols.length > 8, onSave: async form => {
    const vals = readForm(form, cols);
    for (const c of cols) if (c.req && (vals[c.f] == null || vals[c.f] === '')) { toast(`${c.label} is required`, true); return false; }
    if (v.beforeSave && v.beforeSave(vals, isNew) === false) return false;
    if (isNew) { if (v.scope === 'org') vals.org_id = S.org.id; check(await sb.from(v.table).insert(vals), 'Added'); }
    else check(await sb.from(v.table).update(vals).eq(v.idField || 'id', row[v.idField || 'id']), 'Saved');
    if (key === 'groups') await loadGroups();
    if (v.afterSave) await v.afterSave();
    tablePage(key);
  } });
  if (key === 'scheduled') scheduleZmanim($('.modal form, form.modal'));
  const box = $('[data-map]');
  if (box) {
    const form = box.closest('form'); let t, last = '';
    const draw = () => {
      const r = { address_street: form.address_street.value, address_city: form.address_city.value, address_state: form.address_state.value, address_zip: form.address_zip.value };
      const a = addrLine(r); if (a === last) return; last = a;
      box.innerHTML = a ? `<iframe title="Map" loading="lazy" referrerpolicy="no-referrer" src="https://maps.google.com/maps?q=${encodeURIComponent(a)}&z=15&output=embed"></iframe>
        <a class="small" href="${esc(mapsUrl(r))}" target="_blank" rel="noopener">Open in Google Maps ↗</a>` : '<div class="muted small">Type an address above to see it on the map.</div>';
    };
    ['address_street', 'address_city', 'address_state', 'address_zip'].forEach(n => form[n].addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 700); }));
    draw();
    addressSuggest(form, draw);
  }
}
// ---------- address suggestions while typing (Photon / OpenStreetMap, free, no key) ----------
const US_STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
let _addrBias;
async function addrBias() { // search near the organization (its zmanim location), if known
  if (_addrBias !== undefined) return _addrBias;
  try { const { data } = await sb.from('zmanim_cache').select('zmanim').eq('org_id', S.org.id).maybeSingle(); const l = data?.zmanim?.location;
    _addrBias = l?.latitude ? `&lat=${l.latitude}&lon=${l.longitude}` : ''; } catch { _addrBias = ''; }
  return _addrBias;
}
function addressSuggest(form, onPick) {
  const inp = form.address_street; if (!inp) return;
  inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocorrect', 'off'); inp.setAttribute('spellcheck', 'false');
  inp.setAttribute('placeholder', 'Start typing, e.g. 12 Main St, Monsey');
  const box = document.createElement('div'); box.className = 'addr-sug hidden'; inp.parentNode.style.position = 'relative'; inp.after(box);
  let t, list = [], at = -1, seq = 0;
  const close = () => { box.classList.add('hidden'); at = -1; };
  const pick = i => {
    const a = list[i]; if (!a) return;
    form.address_street.value = a.street; if (a.city) form.address_city.value = a.city; if (a.state) form.address_state.value = a.state; if (a.zip) form.address_zip.value = a.zip;
    close(); onPick && onPick(); form.address_city.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const show = () => {
    if (!list.length) return close();
    box.innerHTML = list.map((a, i) => `<button type="button" data-i="${i}" class="${i === at ? 'on' : ''}"><b>${esc(a.street)}</b><span>${esc([a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</span></button>`).join('')
      + '<div class="addr-src">Addresses from OpenStreetMap</div>';
    box.classList.remove('hidden');
  };
  const search = async () => {
    const q = inp.value.trim(); if (q.length < 4) return close();
    const my = ++seq;
    try {
      const res = await fetch(`https://photon.komoot.io/api/?limit=8&lang=en&q=${encodeURIComponent(q)}${await addrBias()}`);
      if (my !== seq) return; const j = await res.json();
      const typedNo = (q.match(/^\s*(\d+[a-zA-Z]?)\b/) || [])[1];
      const seen = new Set();
      list = (j.features || []).map(f => f.properties || {}).filter(p => p.countrycode === 'US' && (p.street || p.housenumber || p.osm_key === 'highway'))
        .map(p => {
          const road = p.street || (p.osm_key === 'highway' ? p.name : '');
          const no = p.housenumber || typedNo || '';
          return { street: [no, road].filter(Boolean).join(' '), city: p.city || p.town || p.village || p.locality || p.district || '', state: US_STATES[p.state] || p.state || '', zip: (p.postcode || '').slice(0, 5) };
        })
        .filter(a => a.street && !seen.has(a.street + a.city) && seen.add(a.street + a.city)).slice(0, 6);
      at = -1; show();
    } catch { close(); }
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 350); });
  inp.addEventListener('keydown', e => {
    if (box.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(list.length - 1, at + 1); show(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); show(); }
    else if (e.key === 'Enter' && at >= 0) { e.preventDefault(); pick(at); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  box.addEventListener('mousedown', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); pick(+b.dataset.i); } });
  inp.addEventListener('blur', () => setTimeout(close, 150));
}
// Schedule form: time chips + "it will read" preview for that day
function scheduleZmanim(form) {
  if (!form || !form.message) return;
  const ta = form.message, wrap = document.createElement('div');
  wrap.innerHTML = (JEW() ? `<details class="zdet"><summary>🕯️ Add a time: candle lighting, shkia, zmanim…</summary>${zmanChips(true)}<div class="hint">Times are for the day it goes out. Add -10 or +5 for minutes before/after.</div></details>` : '')
    + '<div class="small" id="schprev" style="white-space:pre-wrap;background:var(--cream);padding:8px 10px;border-radius:8px;margin-top:6px;display:none"></div>';
  ta.after(wrap);
  const det = wrap.querySelector('.zdet'); if (det) wireChips(det, ta);
  let t;
  const upd = () => { clearTimeout(t); t = setTimeout(async () => {
    const pv = $('#schprev'); if (!pv) return;
    if (!hasZTags(ta.value)) { pv.style.display = 'none'; return; }
    const when = form.scheduled_for?.value; const day = when ? when.slice(0, 10) : null;
    const { data } = await sb.rpc('preview_recurring', { p_org: S.org.id, p_message: ta.value, p_date: day });
    if (!data) return; pv.style.display = 'block';
    pv.innerHTML = `<div class="muted small" style="margin-bottom:2px">On ${esc(day || 'that day')} it will read:</div>${esc(data.message)}${data.missing.length ? `<div style="color:var(--warn)">${day && (new Date(day) - new Date()) > 7 * 864e5 ? 'The times are filled in closer to that day (this preview only knows the coming week).' : data.loaded ? 'Unknown: ' + esc(data.missing.map(m => '{' + m + '}').join(' ')) : 'Loading times…'}</div>` : ''}`;
  }, 400); };
  ta.addEventListener('input', upd); form.scheduled_for?.addEventListener('change', upd); upd();
}
const addrLine = r => [r.address_street, r.address_city, [r.address_state, r.address_zip].filter(Boolean).join(' ')].map(x => (x || '').trim()).filter(Boolean).join(', ');
const mapsUrl = r => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addrLine(r));

function exportCsv(key) {
  const v = VIEWS[key]; const cols = v.cols.filter(c => !['diff', 'members', '_rep'].includes(c.f) && c.export !== false);
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
  const phone = esc(fmtPhone(orgNumber(o)));
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
        <span>Write a message, choose who gets it, and send it by text, phone call or email. Send now or schedule it.</span>
      </a>
      <a class="ov-action" href="#send" data-sendmode="VOICE">
        <span class="ov-ic">${ic('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>')}</span>
        <b>Record a voice message</b>
        <span>Record on this website, or call in and record by phone. Everyone in the group gets a call that plays it.</span>
      </a>
      <a class="ov-action" href="#contacts">
        <span class="ov-ic">${ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>')}</span>
        <b>Add people</b>
        <span>Add members one at a time, or upload your list from Excel.</span>
      </a>
      <a class="ov-action" href="#polls">
        <span class="ov-ic">${ic('<path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M12 10v8"/><path d="M17 6v12"/>')}</span>
        <b>Ask a question</b>
        <span>Send a poll. Members answer by replying 1, 2 or 3, and you see the results live.</span>
      </a>
      <a class="ov-action" href="#repeating">
        <span class="ov-ic">${ic('<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>')}</span>
        <b>Repeating messages</b>
        <span>Set a message to go out by itself every day, week or month${JEW() ? ', with zmanim filled in' : ''}.</span>
      </a>
      <a class="ov-action" href="#history">
        <span class="ov-ic">${ic('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>')}</span>
        <b>See who got it</b>
        <span>Open History and click Report to see who got each message, who answered and who replied.</span>
      </a>
    </div>

    <h2 class="ov-h2">How it works</h2>
    <p class="ov-sub">There are three ways to send an announcement. Use whichever is easiest.</p>
    <div class="ov-how">
      <div><span class="ov-num">1</span><b>From this website</b>
        <p>Click <a href="#send">Send an announcement</a>, pick a group, and write your message. Add a flyer, a recording or a poll if you like. You'll see exactly how many people get it before you press send, and you can send now or schedule it.</p></div>
      <div><span class="ov-num">2</span><b>By texting from your phone</b>
        <p>Text <b>${phone}</b> something like <i>${JEW() ? 'SEND MEN Mincha at 6:45' : 'SEND ALL Meeting tonight at 7 PM'}</i>. You'll get a text back asking you to reply <b>YES</b> to send it.</p>
        <details class="ov-more"><summary>Show all text commands</summary>
          <ul>
            <li><b>SEND</b> group message: each person gets it the way they prefer (text, call or email)</li>
            <li><b>TEXT</b> group message: texts only</li>
            <li><b>CALL</b> group message: phone calls only</li>
            <li><b>EMERGENCY</b> group message: sends right away, even at night</li>
            <li><b>SCHEDULE</b> group 2026-12-01 19:00 message: sends later</li>
            <li><b>YES</b> / <b>NO</b>: confirm or cancel</li>
            <li><b>GROUPS</b>: lists your groups. Each group has a number, so <i>TEXT 1 …</i> is the same as <i>TEXT ALL …</i></li>
          </ul></details></div>
      <div><span class="ov-num">3</span><b>By calling in</b>
        <p>Call <b>${phone}</b> from your phone. Choose the group on the keypad, record your message, listen to it, and press <b>1</b> to send.</p></div>
      ${o.is_demo ? `<p class="small muted" style="grid-column:1/-1;margin:0">In this sample account, sending by text or by calling in isn't switched on. In your own account it works with your own number.</p>` : ''}
    </div>

    <div class="ov-members">
      <b>What your members can do</b>
      <p>Reply to any text: the reply is sent on to the office. Answer a poll by replying with a number. Call <b>${phone}</b> to hear the latest announcement, reach the office, leave a message, or sign up.
         They can stop anytime by texting <b>STOP</b>, pressing <b>9</b> when they call, or clicking unsubscribe in an email.</p>
    </div>

    <div class="ov-foot">
      <span><a href="#contacts">${num(contacts.count || 0)} members</a></span>
      <span><a href="#credits">${num(used)}${o.notification_limit && !o.is_demo ? ' of ' + num(o.notification_limit) : ''} credits used this month</a></span>
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
  { f: 'keypad_join', label: 'Callers can pick a list to join (press 4)', type: 'bool', hint: 'After pressing 4, callers hear your groups ("For Women, press 1…") and join the one they pick. Members can also add themselves to another list this way.' },
  { f: 'transcribe_voicemail', label: 'Turn voicemails into text', type: 'bool', hint: 'Voicemails are typed out automatically (English, Hebrew or Yiddish) a minute after they come in. The text is emailed to you and shown under Replies.' },
  { f: 'private_vm_label', label: 'Private voicemail box for (press 6)', hint: 'Optional, e.g. "the Rabbi". Callers press 6 to leave a message only this person sees. Leave empty to turn off.' },
  { f: 'private_vm_email', label: 'Private voicemails go to email', type: 'email', hint: 'Only this person sees private voicemails on the admin site, when they log in with this email.' },
  { f: 'private_vm_phone', label: 'Private voicemails go to phone', type: 'phone', hint: 'Optional. Gets a text with a link to listen.' },
  { f: 'conference_pin', label: 'Conference line PIN (press 7)', pattern: /^\d{3,8}$/, patternMsg: 'The conference PIN must be 3 to 8 digits', hint: 'Optional. Callers press 7 and enter this PIN to join one shared conference call (up to 100 people). Leave empty to turn off.' },
  { f: 'pin_code', label: 'PIN-protected announcements (press 8)', pattern: /^\d{3,8}$/, patternMsg: 'The PIN must be 3 to 8 digits', hint: 'Optional. Callers press 8 and enter this PIN to hear the latest message sent to the group below. Leave empty to turn off.' },
  { f: 'pin_group', label: 'PIN plays messages sent to group', type: 'select', opts: () => S.groups.filter(g => g.active && g.code !== 'ALL').map(g => g.code), hint: 'Messages to this group are only played to callers who enter the PIN (and to members of the group).' },
  { f: 'phone_voting', label: 'Call-only members can vote on polls by keypad', type: 'bool', hint: 'When you send a poll, members set to phone calls get a call and press 1, 2, 3… to vote. Each call uses 1 credit.' },
  { f: 'detect_voicemail', label: 'Leave the whole message on voicemail', type: 'bool', hint: 'Waits for the voicemail beep, so the full message is saved on the member\'s voicemail, and the delivery report shows "Answered" vs "Voicemail". People who pick up hear it 2 to 3 seconds later. Costs about ¾ cent extra per call.' },
  { f: 'retry_calls', label: 'Call again if there\'s no answer', type: 'bool', hint: 'Members who didn\'t pick up or were busy get one more call about 15 minutes later (never during quiet hours, unless it\'s an emergency).' },
  { f: 'allow_auto_signup', label: 'Add new signups automatically', type: 'bool', hint: 'Applies to text JOIN and phone signups. If off, they appear in Signup Requests for approval.' },
  { f: 'contact_person', label: 'Main contact person' }, { f: 'contact_phone', label: 'Main contact phone', type: 'phone' }, { f: 'contact_email', label: 'Main contact email', type: 'email' },
];

function recordForm({ title, desc, cols, row, table, idField = 'id', readonly = '', extra = '', locked = false }) {
  $('#main').innerHTML = head(title, desc) + readonly + `<form class="card panel" id="rec" novalidate><div class="grid2">${cols.filter(c => c.edit !== false).map(c => `<div class="field" style="${['longtext'].includes(c.type) ? 'grid-column:1/-1' : ''}">
      <label>${esc(c.label)}</label>${input(c, row[c.f])}${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}</div>`).join('')}</div>
    ${locked ? '<p class="muted small" style="margin:6px 0 0">View only: ask your organization\'s owner if you need to change these.</p>' : '<div style="display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:16px;margin-top:6px"><button class="btn" type="submit">Save changes</button></div>'}</form>${extra}`;
  if (locked) $$('#rec input, #rec select, #rec textarea').forEach(el => (el.disabled = true));
  $('#rec').addEventListener('submit', async e => {
    e.preventDefault(); const vals = readForm(e.target, cols.filter(c => c.edit !== false));
    const bad = cols.find(c => c.pattern && vals[c.f] != null && !c.pattern.test(vals[c.f])); if (bad) return toast(bad.patternMsg || bad.label + ' is not valid', true);
    check(await sb.from(table).update(vals).eq(idField, row[idField]), 'Saved');
    if (table === 'organizations') { await loadOrgs(); }
  });
}

async function settingsPage() {
  const o = (await sb.from('organizations').select('*').eq('id', S.org.id).single()).data;
  const plan = S.plans.find(p => p.id === o.plan_id);
  recordForm({ title: 'Settings', desc: 'How your organization\'s messaging behaves.', cols: SETTINGS_COLS, row: o, table: 'organizations', locked: !S.perms.settings,
    readonly: `<div class="card panel" style="margin-bottom:16px"><div class="kv">
      <div>Organization number</div><div><b>${esc(fmtPhone(orgNumber(o)))}</b>${o.is_demo ? ' <span class="muted small">(shared sample number)</span>' : ''}</div>
      <div>Plan</div><div>${esc(plan?.name || o.plan || '—')} · ${esc((o.billing_period || '').toLowerCase())}</div>
      <div>Status</div><div>${pill(o.status)}${o.paid_until ? ` · paid until ${esc(fmtD(o.paid_until))}` : ''}</div>
      <div>Limits</div><div>${o.contact_limit ? num(o.contact_limit) + ' contacts' : 'Unlimited contacts'} · ${num(o.notification_limit)} credits/month · ${num(o.voice_minute_limit)} voice minutes</div>
    </div><p class="small muted" style="margin:10px 0 0">To change your plan or add credits, open <a href="#credits">Plan &amp; credits</a>. To add a phone number, email <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p></div>` });
  // logo for emails
  const card = document.createElement('div'); card.className = 'card panel'; card.style.marginTop = '16px';
  const draw = () => {
    card.innerHTML = `<h3 style="margin-top:0">Logo</h3>
      <p class="small muted" style="margin-top:0">Shown at the top of every announcement email. A PNG or JPG works best, ideally wide and on a white or clear background.</p>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="border:1px solid var(--line);border-radius:12px;padding:14px;min-width:200px;text-align:center;background:#fff">
          ${o.logo_url ? `<img src="${esc(o.logo_url)}" alt="Logo" style="max-height:70px;max-width:240px">` : '<span class="muted small">No logo yet</span>'}
          <div style="margin-top:6px;font-weight:700;color:#1e3a64">${esc(o.name)}</div></div>
        ${S.perms.settings ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn secondary" style="cursor:pointer">${o.logo_url ? 'Change logo' : '⬆️ Upload logo'}
          <input type="file" id="logofile" accept="image/png,image/jpeg,image/gif" hidden></label>
          ${o.logo_url ? '<button type="button" class="btn ghost" id="logorm">Remove</button>' : ''}</div>` : ''}
      </div>`;
    $('#logofile', card)?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpeg|gif)$/.test(file.type)) return toast('Please choose a PNG, JPG or GIF picture.', true);
      if (file.size > 2 * 1024 * 1024) return toast('That picture is too big. Please use one under 2 MB.', true);
      const path = `${o.id}/logo-${Date.now()}.${file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : 'jpg'}`;
      const up = await sb.storage.from('flyers').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) return toast('Upload failed: ' + up.error.message, true);
      o.logo_url = sb.storage.from('flyers').getPublicUrl(path).data.publicUrl;
      check(await sb.from('organizations').update({ logo_url: o.logo_url }).eq('id', o.id), 'Logo saved. It will show on the next email.');
      draw();
    });
    $('#logorm', card)?.addEventListener('click', async () => {
      o.logo_url = null; check(await sb.from('organizations').update({ logo_url: null }).eq('id', o.id), 'Logo removed'); draw();
    });
  };
  draw(); $('#main').appendChild(card);
}

/* ---------- how a phone call will sound ---------- */
function speakParts(parts) {
  if (!('speechSynthesis' in window)) return toast('This browser can\'t play a preview. Use "Call me" instead.', true);
  speechSynthesis.cancel();
  const voices = speechSynthesis.getVoices();
  const pick = lang => voices.find(v => v.lang.startsWith(lang) && /male|david|guy|daniel|mark|matthew|asaf/i.test(v.name)) || voices.find(v => v.lang.startsWith(lang));
  (parts || []).forEach(p => { const u = new SpeechSynthesisUtterance(p.text); u.lang = p.lang === 'he' ? 'he-IL' : 'en-US'; const v = pick(u.lang.slice(0, 2)); if (v) u.voice = v; u.rate = 0.95; speechSynthesis.speak(u); });
}
function callSoundBox(el, getText, opts = {}) {
  let last = null, timer = null, seq = 0;
  el.innerHTML = `<div class="small" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <b>📞 How the phone call will sound</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn ghost sm" data-cs-listen>▶ Listen here</button><button type="button" class="btn ghost sm" data-cs-call>📞 Call me to hear it</button></span></div>
    <div class="cs-text" data-cs-text></div><div class="small muted" data-cs-changes></div>
    ${opts.compact ? '' : '<div class="small muted" style="margin-top:6px">"Listen here" uses your computer\'s voice, so it\'s close but not exact. "Call me" calls your phone with exactly what members will hear.</div>'}`;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const txt = getText(); const my = ++seq;
      if (!txt.trim()) { $('[data-cs-text]', el).innerHTML = '<span class="muted">Type a message to see how it will sound.</span>'; $('[data-cs-changes]', el).innerHTML = ''; last = null; return; }
      const { data, error } = await sb.rpc('call_preview', { p_org: S.org.id, p_message: txt });
      if (my !== seq || error) return;
      last = data;
      $('[data-cs-text]', el).innerHTML = (data.parts || []).map(p => `<span class="cs-${p.lang}" ${p.lang === 'he' ? 'dir="rtl" title="Read with the Hebrew voice"' : ''}>${esc(p.text)}</span>`).join(' ') || '<span class="muted">(nothing to read)</span>';
      const ch = (data.changes || []).map(c => `<span class="chip">${esc(c.from)} → <b>${esc(c.to)}</b></span>`).join(' ');
      const gs = (data.guessed || []).map(c => `<span class="chip warn" title="Guessed: add it under Pronunciation to set the right way">${esc(c.from)} → <b>${esc(c.to)}?</b></span>`).join(' ');
      $('[data-cs-changes]', el).innerHTML = (data.mode === 'hebrew' ? 'Read by the Hebrew voice. ' : '')
        + (ch ? 'Said as: ' + ch + ' ' : '')
        + (gs ? `<div style="margin-top:4px">⚠️ Not on your list, so it's a guess: ${gs} · <a href="#pronunciation">set the right way</a></div>` : (ch ? ' · <a href="#pronunciation">change words</a>' : ''));
    }, 500);
  };
  $('[data-cs-listen]', el).addEventListener('click', async () => {
    if (!last) { const { data } = await sb.rpc('call_preview', { p_org: S.org.id, p_message: getText() }); last = data; }
    speakParts(last?.parts);
  });
  $('[data-cs-call]', el).addEventListener('click', async () => {
    if (!getText().trim()) return toast('Type the message first.', true);
    let saved = ''; try { saved = localStorage.getItem('cc_testphone') || ''; } catch {}
    const close = modal('Call me to hear it', `<p style="margin-top:0">We'll call this phone and read the message exactly the way members will hear it.</p>
      <div class="field"><label>Your phone</label><input id="csphone" type="tel" value="${esc(saved)}" placeholder="845-555-1234"></div>`,
      { saveText: '📞 Call me', onSave: async () => {
        const ph = $('#csphone').value.trim(); try { localStorage.setItem('cc_testphone', ph); } catch {}
        const { data, error } = await sb.rpc('preview_call', { p_org: S.org.id, p_message: getText(), p_phone: ph });
        if (error) { toast(friendlyError(error), true); return false; }
        toast(`Calling ${fmtPhone(data)} within a minute…`);
      } });
  });
  refresh();
  return { refresh };
}
async function pronunciationPage() {
  const o = (await sb.from('organizations').select('*').eq('id', S.org.id).single()).data;
  const canEdit = S.perms.settings;
  const [own, built] = await Promise.all([
    sb.from('pronunciations').select('*').eq('org_id', o.id).order('word'),
    JEW() ? sb.from('pronunciations').select('*').is('org_id', null).order('word') : Promise.resolve({ data: [] })]);
  const mine = own.data || [], base = (built.data || []).filter(b => !mine.some(m => m.word.toLowerCase() === b.word.toLowerCase()));
  $('#main').innerHTML = head('Pronunciation', 'How words are said on phone calls. Texts and emails stay exactly as you typed them; only the call reads these words the way you set here.')
    + `${JEW() ? `<div class="card panel" style="margin-bottom:16px"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">
        <input type="checkbox" id="ashk" ${o.ashkenazi !== false ? 'checked' : ''} ${canEdit ? '' : 'disabled'} style="margin-top:4px">
        <span><b>Ashkenazi spellings for the parsha and holidays</b><br><span class="small muted">{parsha} and holiday names come out like "Bereishis", "Sukkos" (instead of "Bereshit", "Sukkot"). Takes effect when the times next refresh, within a day.</span></span></label></div>` : ''}
      <div class="card panel" style="margin-bottom:16px"><h3 style="margin-top:0">Voice on phone calls</h3>
        <div class="vchoice">
          <label><input type="radio" name="cv" value="english" ${(o.call_voice || 'english') === 'english' ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> <span><b>One English voice, Ashkenazi words</b><br><span class="small muted">Recommended. Hebrew words are said the way you set below ("Shabbos", "Mincha"). A Hebrew word that isn't on the list is spelled out as a best guess, and the preview warns you so you can add it.</span></span></label>
          <label><input type="radio" name="cv" value="hebrew" ${o.call_voice === 'hebrew' ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> <span><b>One Hebrew voice for everything</b><br><span class="small muted">The whole message is read in Hebrew (Israeli pronunciation). Best when your messages are all in Hebrew.</span></span></label>
          <label><input type="radio" name="cv" value="mixed" ${o.call_voice === 'mixed' ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> <span><b>Switch voices</b><br><span class="small muted">English parts in the English voice, Hebrew parts in the Hebrew voice.</span></span></label>
        </div>
        <div class="grid2" style="margin-top:12px">
          <div class="field"><label>English voice</label><select id="ven" ${canEdit ? '' : 'disabled'}>${[['Polly.Matthew-Neural', 'Matthew (American)'], ['Polly.Joey-Neural', 'Joey (American)'], ['Polly.Stephen-Neural', 'Stephen (American)'], ['Polly.Gregory-Neural', 'Gregory (American)'], ['Google.en-US-Neural2-J', 'James (American)'], ['Google.en-US-Neural2-D', 'David (American)'], ['Polly.Brian-Neural', 'Brian (British)'], ['Polly.Arthur-Neural', 'Arthur (British)']].map(([v, l]) => `<option value="${v}" ${o.voice_en === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Hebrew voice</label><select id="vhe" ${canEdit ? '' : 'disabled'}>${[['Google.he-IL-Standard-B', 'Hebrew man 1'], ['Google.he-IL-Standard-D', 'Hebrew man 2'], ['Google.he-IL-Wavenet-B', 'Hebrew man 3 (more natural)'], ['Google.he-IL-Wavenet-D', 'Hebrew man 4 (more natural)']].map(([v, l]) => `<option value="${v}" ${o.voice_he === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <p class="small muted" style="margin:0">To compare voices, pick one, then use "📞 Call me to hear it" below. Every voice is male.</p>
      </div>
      <div class="card panel" style="margin-bottom:16px"><h3 style="margin-top:0">Try it</h3>
        <textarea id="prtest" rows="3" style="width:100%" placeholder="Type in English, Hebrew, or both, e.g. מנחה בשבת 4:15, Kiddush after davening">מנחה בשבת 4:15. Good Shabbos! מזל טוב to the Cohen family.</textarea>
        <div id="prbox" class="callbox" style="margin-top:10px"></div></div>
      <div class="card panel" style="margin-bottom:16px"><h3 style="margin-top:0">Your words</h3>
        ${canEdit ? `<form id="pradd" class="pr-row" style="margin-bottom:10px"><input name="word" placeholder="Word as you write it (e.g. שבת or Shabbat)" required><input name="say" placeholder="Say it as (e.g. Shabbos)" required><button class="btn sm">+ Add</button></form>` : ''}
        <div id="prmine">${mine.length ? mine.map(m => prRow(m, true)).join('') : '<div class="small muted">None yet. Add words above, or change one from the list below.</div>'}</div></div>
      ${JEW() ? `<details class="card panel"><summary><b>Built-in words (${base.length})</b> <span class="small muted">common Hebrew words, said the Ashkenazi way</span></summary>
        <div style="margin-top:10px">${base.map(b => prRow(b, false)).join('')}</div></details>` : ''}`;
  function prRow(r, isMine) {
    return `<div class="pr-item ${r.active === false ? 'muted' : ''}" data-id="${esc(r.id)}" data-word="${esc(r.word)}" data-say="${esc(r.say_as)}">
      <span ${/[֐-׿]/.test(r.word) ? 'dir="rtl"' : ''}><b>${esc(r.word)}</b></span><span>→ ${esc(r.say_as)}${r.active === false ? ' <span class="pill">off</span>' : ''}</span>
      <span style="display:flex;gap:4px;justify-content:flex-end"><button type="button" class="btn ghost sm" data-pr-listen title="Listen">▶</button>
      ${canEdit ? (isMine ? `<button type="button" class="btn ghost sm" data-pr-edit>Change</button><button type="button" class="btn ghost sm" data-pr-del title="Remove">🗑</button>`
                          : `<button type="button" class="btn ghost sm" data-pr-edit>Change</button><button type="button" class="btn ghost sm" data-pr-off>Turn off</button>`) : ''}</span></div>`;
  }
  const box = callSoundBox($('#prbox'), () => $('#prtest').value);
  $('#prtest').addEventListener('input', box.refresh);
  const saveVoice = async (vals) => { const r = await sb.from('organizations').update(vals).eq('id', o.id); if (r.error) return toast(friendlyError(r.error), true); Object.assign(o, vals); toast('Saved'); box.refresh(); };
  $$('input[name=cv]').forEach(x => x.addEventListener('change', () => saveVoice({ call_voice: x.value })));
  $('#ven')?.addEventListener('change', e => saveVoice({ voice_en: e.target.value }));
  $('#vhe')?.addEventListener('change', e => saveVoice({ voice_he: e.target.value }));
  $('#ashk')?.addEventListener('change', async e => check(await sb.from('organizations').update({ ashkenazi: e.target.checked }).eq('id', o.id), 'Saved'));
  $('#pradd')?.addEventListener('submit', async e => {
    e.preventDefault(); const word = e.target.word.value.trim(), say = e.target.say.value.trim(); if (!word || !say) return;
    const ex = mine.find(m => m.word.toLowerCase() === word.toLowerCase());
    const r = ex ? await sb.from('pronunciations').update({ say_as: say, active: true, updated_at: new Date().toISOString() }).eq('id', ex.id)
                 : await sb.from('pronunciations').insert({ org_id: o.id, word, say_as: say });
    if (r.error) return toast(friendlyError(r.error), true);
    toast('Saved'); pronunciationPage();
  });
  $('#main').addEventListener('click', async e => {
    const row = e.target.closest('.pr-item'); if (!row) return;
    const { id, word, say } = row.dataset;
    if (e.target.closest('[data-pr-listen]')) speakParts([{ lang: /[֐-׿]/.test(say) ? 'he' : 'en', text: say }]);
    if (e.target.closest('[data-pr-del]')) { check(await sb.from('pronunciations').delete().eq('id', id), 'Removed'); pronunciationPage(); }
    if (e.target.closest('[data-pr-off]')) { const r = await sb.from('pronunciations').insert({ org_id: o.id, word, say_as: say, active: false }); if (r.error) return toast(friendlyError(r.error), true); toast('Turned off'); pronunciationPage(); }
    if (e.target.closest('[data-pr-edit]')) { const f = $('#pradd'); if (!f) return; f.word.value = word; f.say.value = say; f.say.focus(); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
}

/* ---------- one-time sends (platform owner) ---------- */
const RATE_LABELS = [
  ['sms', 'Text sent (per segment, Twilio)'], ['carrier_us', 'Carrier fee per text, US'], ['carrier_ca', 'Carrier fee per text, Canada'],
  ['mms', 'Picture text sent (Twilio)'], ['mms_carrier_us', 'Carrier fee per picture, US'], ['mms_carrier_ca', 'Carrier fee per picture, Canada'],
  ['failed_msg', 'Failed text fee'], ['sms_in', 'Text received'], ['call_out_min', 'Outgoing call, per minute'], ['call_in_min', 'Incoming call, per minute'],
  ['in_call_minutes_guess', 'Guess: minutes per incoming call'], ['amd_call', 'Voicemail detection, per call'], ['recording_min', 'Voicemail recording, per minute'],
  ['transcribe_min', 'Voicemail to text (Groq), per minute'], ['number_month', 'Phone number, per month'],
  ['tts_neural_100', 'Spoken voice, Neural (per 100 characters)'], ['tts_standard_100', 'Spoken voice, Standard (per 100 characters)'],
  ['tts_generative_100', 'Spoken voice, Generative (per 100 characters)'], ['in_call_tts_chars_guess', 'Guess: characters spoken per incoming call'],
  ['conf_min', 'Conference line, per person per minute'], ['conf_minutes_guess', 'Guess: minutes per conference caller'],
  ['card_pct', 'Card fee, % (Stripe)'], ['card_fixed', 'Card fee, fixed per payment (Stripe)'], ['billing_pct', 'Subscription fee, % (Stripe Billing)']];
const COST_PARTS = [['cost_texts', 'Texts'], ['cost_calls', 'Call minutes'], ['cost_voice', 'Spoken voice'], ['cost_incoming', 'Incoming texts, calls & conference'],
  ['cost_voicemail', 'Voicemail & typing it out'], ['cost_numbers', 'Phone numbers'], ['cost_card', 'Card fees (Stripe)']];
async function costsPage() {
  if (!S.isPlatform) { $('#main').innerHTML = head('Costs', '') + '<div class="card panel">Only the platform owner can see this.</div>'; return; }
  // costs are rounded UP once, only for showing; small amounts keep their fraction of a cent ($0.008)
  const usd = (n, d = 2, down = false) => { n = +n || 0; const f = 10 ** d, v = (down ? Math.floor : Math.ceil)(Math.round(n * f * 1e6) / 1e6) / f;
    return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const usdFine = n => Math.abs(+n || 0) < 1 && Math.round((+n || 0) * 100) !== (+n || 0) * 100 ? usd(n, 4).replace(/0+$/, '').replace(/\.(\d)$/, '.$10') : usd(n);
  const months = [...Array(12)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7) + '-01'; });
  const pick = sessionStorage.getItem('cc_cost_month') || months[0];
  $('#main').innerHTML = head('Costs', 'What each account costs you this month, and what it pays: texts, calls, the spoken voice, incoming calls, voicemail, phone numbers and card fees. Worked out from what was actually sent, using the prices at the bottom. Fractions of a cent are kept and only the amount shown is rounded up, so small costs are not inflated. Your Twilio and Stripe statements are the final word; incoming call length is a guess.')
    + `<div class="toolbar" style="padding:0;margin:0 0 12px"><select id="cm">${months.map(m => `<option value="${m}" ${m === pick ? 'selected' : ''}>${new Date(m + 'T12:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>`).join('')}</select></div><div id="cbody"><p class="muted">Loading…</p></div>`;
  $('#cm').addEventListener('change', e => { sessionStorage.setItem('cc_cost_month', e.target.value); costsPage(); });
  const { data, error } = await sb.rpc('platform_costs', { p_month: pick });
  if (error) { $('#cbody').innerHTML = `<div class="card panel">${esc(error.message)}</div>`; return; }
  const rates = data.rates || {}, fixed = rates.fixed || {};
  const rows = (data.rows || []).map(r => { const rev = +r.plan_revenue + +r.pack_revenue + +r.onetime_revenue, cost = COST_PARTS.reduce((a, [k]) => a + (+r[k] || 0), 0);
    return { ...r, rev, cost, profit: rev - cost }; }).sort((a, b) => b.cost - a.cost);
  const T = k => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const fixedTotal = Object.values(fixed).reduce((a, v) => a + (+v || 0), 0);
  const profit = T('profit') - fixedTotal;
  const stat = (n, l, c = '') => `<div class="rep-stat ${c}"><b>${n}</b><span>${l}</span></div>`;
  $('#cbody').innerHTML = `
    <div class="rep-stats" style="margin-bottom:14px">${stat(usd(T('rev')), 'customers pay', 'ok')}${stat(usd(T('cost')), 'Twilio, Stripe & services')}${stat(usd(fixedTotal), 'fixed costs')}${stat(usd(profit, 2, true), 'left for you', profit < 0 ? 'bad' : 'ok')}</div>
    <div class="table-wrap card"><table class="data"><thead><tr><th>Account</th><th>Plan</th><th>Pays</th><th>Texts</th><th>Calls</th><th>Incoming</th><th>Numbers</th><th>Costs you</th><th>Left</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-i="${i}" style="cursor:pointer"><td><b>${esc(r.name)}</b>${r.status && r.status !== 'ACTIVE' ? ` <span class="muted small">${esc(r.status)}</span>` : ''}</td>
      <td>${esc(r.plan || '—')}${r.period === 'yearly' ? ' <span class="muted small">(yearly ÷ 12)</span>' : ''}</td>
      <td>${usd(r.rev)}${+r.pack_revenue ? `<div class="muted small">incl. ${usd(r.pack_revenue)} credit packs</div>` : ''}${+r.onetime_revenue ? `<div class="muted small">incl. ${usd(r.onetime_revenue)} one-time</div>` : ''}</td>
      <td>${num(+r.texts_us + +r.texts_ca)}${+r.texts_ca ? `<div class="muted small">${num(r.texts_ca)} to Canada</div>` : ''}${+r.pictures_us + +r.pictures_ca ? `<div class="muted small">+ ${num(+r.pictures_us + +r.pictures_ca)} pictures</div>` : ''}</td>
      <td>${num(r.call_minutes)} min<div class="muted small">${num(r.calls)} calls</div></td>
      <td>${num(r.texts_in)} texts<div class="muted small">${num(r.calls_in)} calls</div></td>
      <td>${num(r.numbers)}</td><td>${usd(r.cost)}</td>
      <td style="white-space:nowrap;color:var(${r.profit < 0 ? '--bad' : '--ok'})"><b>${usd(r.profit, 2, true)}</b>${r.rev ? `<div class="muted small">${Math.round(r.profit / r.rev * 100)}%</div>` : ''}</td></tr>
      <tr class="hidden" data-d="${i}"><td colspan="9" class="small" style="background:var(--cream)">
        ${COST_PARTS.map(([k, l]) => `${l} <b>${usdFine(r[k])}</b>`).join(' · ')} · Credits used ${num(r.credits_used)}<br>
        ${num(r.texts_us)} US text segments, ${num(r.texts_ca)} Canadian, ${num(r.pictures_us)} + ${num(r.pictures_ca)} pictures, ${num(r.failed)} failed · ${num(r.call_minutes)} call minutes${+r.amd_calls ? `, ${num(r.amd_calls)} with voicemail detection` : ''} · ${num(r.calls_in)} incoming calls, ${num(r.office_forwards)} put through to the office${+r.conference_joins ? `, ${num(r.conference_joins)} conference callers` : ''} · ${num(r.voicemail_minutes)} voicemail min (${num(r.transcribed_minutes)} typed out) · ${esc(r.voice_tier || '')} voice${+r.preview_calls ? ` · ${num(r.preview_calls)} test calls` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No accounts.</td></tr>'}
    </tbody><tfoot><tr><th>Total</th><th></th><th>${usd(T('rev'))}</th><th>${num(T('texts_us') + T('texts_ca'))}</th><th>${num(T('call_minutes'))} min</th><th></th><th>${num(T('numbers'))}</th><th>${usd(T('cost'))}</th><th>${usd(T('profit'), 2, true)}</th></tr></tfoot></table></div>
    <p class="muted small">Click an account for the details. Sample (demo) accounts are left out.</p>
    <form class="card panel" id="crates" style="margin-top:18px"><h3 style="margin-top:0">Prices used (USD)</h3>
      <div class="grid2">${RATE_LABELS.map(([k, l]) => `<div class="field"><label>${esc(l)}</label><input type="number" step="any" name="${k}" value="${esc(rates[k] ?? '')}"></div>`).join('')}</div>
      <h3>Fixed monthly costs</h3><p class="muted small" style="margin-top:-6px">Costs that don't depend on any one account: Supabase, the n8n server, the texting campaign fee, and so on.</p>
      <div id="cfixed">${Object.entries(fixed).map(([k, v]) => `<div class="cfx" style="display:flex;gap:8px;margin-bottom:6px"><input value="${esc(k)}" placeholder="What" style="flex:2"><input type="number" step="any" value="${esc(v)}" placeholder="$ / month" style="flex:1"></div>`).join('')}</div>
      <button type="button" class="btn secondary sm" id="cfadd">+ Add a fixed cost</button>
      <div style="display:flex;justify-content:flex-end;border-top:1px solid var(--line);padding-top:14px;margin-top:14px"><button class="btn">Save prices</button></div></form>`;
  $$('#cbody tr[data-i]').forEach(tr => tr.addEventListener('click', () => $(`#cbody tr[data-d="${tr.dataset.i}"]`).classList.toggle('hidden')));
  const addFx = () => { const d = document.createElement('div'); d.className = 'cfx'; d.style.cssText = 'display:flex;gap:8px;margin-bottom:6px';
    d.innerHTML = '<input placeholder="What, e.g. Supabase Pro" style="flex:2"><input type="number" step="any" placeholder="$ / month" style="flex:1">'; $('#cfixed').appendChild(d); };
  if (!Object.keys(fixed).length) addFx();
  $('#cfadd').addEventListener('click', addFx);
  $('#crates').addEventListener('submit', async e => {
    e.preventDefault(); const out = {};
    for (const [k] of RATE_LABELS) { const v = e.target.elements[k].value.trim(); if (v !== '') out[k] = Number(v); }
    out.fixed = {}; $$('#cfixed .cfx').forEach(d => { const [a, b] = d.querySelectorAll('input'); if (a.value.trim() && b.value !== '') out.fixed[a.value.trim()] = Number(b.value); });
    check(await sb.from('app_settings').update({ value: JSON.stringify(out) }).eq('key', 'cost_rates'), 'Prices saved');
    costsPage();
  });
}

async function onetimePage() {
  if (!S.isPlatform) { $('#main').innerHTML = head('One-time sends', '') + '<div class="card panel">Only the platform owner can use this.</div>'; return; }
  const [{ data: orgs }, { data: sets }, { data: jobs }] = await Promise.all([
    sb.from('organizations').select('id,name,twilio_number,is_demo').is('deleted_at', null).eq('active', true).order('name'),
    sb.from('app_settings').select('key,value').in('key', ['onetime_rate_text', 'onetime_rate_call']),
    sb.from('onetime_jobs').select('*').order('created_at', { ascending: false }).limit(50)]);
  const rate = k => parseFloat((sets || []).find(x => x.key === k)?.value || (k.endsWith('text') ? '0.05' : '0.10'));
  let recips = [], audio = null, editing = null;
  const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);
  $('#main').innerHTML = head('One-time sends', 'Send to a list someone gives you, once, and charge them for it. The numbers are kept only inside the job: they never become contacts, so there is nothing to delete afterwards. It does not use any organization\'s monthly credits.')
    + `<form class="card panel" id="otf" novalidate style="max-width:880px">
      <div class="grid2">
        <div class="field"><label>Client (who it's for)</label><input name="client" required placeholder="e.g. Cohen family, Bais Yaakov dinner"><div class="hint">Texts start with "<b>this name</b> via CommunityConnect:".</div></div>
        <div class="field"><label>Client phone or email</label><input name="contact" placeholder="For the bill"></div>
        <div class="field"><label>Send from the number of</label><select name="org">${(orgs || []).filter(o => !o.is_demo).map(o => `<option value="${o.id}">${esc(o.name)} · ${esc(fmtPhone(o.twilio_number))}</option>`).join('')}</select><div class="hint">Replies to the texts arrive at that organization.</div></div>
        <div class="field"><label>How</label><select name="mode"><option value="TEXT">Text</option><option value="CALL">Phone call (read aloud)</option><option value="BOTH">Text and phone call</option><option value="VOICE">Voice recording (call)</option></select></div>
      </div>
      <div class="field"><label>The list</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><label class="btn secondary sm" style="cursor:pointer">📄 Upload Excel or CSV<input type="file" id="otfile" accept=".csv,.xlsx,.xls,.txt" hidden></label><span class="small muted">or paste below, one per line: phone, name (name is optional)</span></div>
        <textarea name="list" rows="5" style="width:100%" placeholder="845-555-1234, Moshe Klein&#10;718-555-9876"></textarea>
        <div style="margin-top:6px"><button type="button" class="btn secondary sm" id="otcheck">✔ Check the list</button> <span id="otsum" class="small"></span></div></div>
      <div class="field" id="otmsgf"><label>Message</label><textarea name="msg" rows="4" style="width:100%" placeholder="Type the message. {name} = each person's first name, if the list has names."></textarea></div>
      <div class="field hidden" id="otvoice"><label>Recording</label><input type="file" id="otaudio" accept="audio/*"> <span class="small muted">or link:</span> <input name="audio" placeholder="https://…" style="min-width:260px"></div>
      <div class="grid2">
        <div class="field"><label>Price per text ($)</label><input name="rt" type="number" step="0.01" min="0" value="${rate('onetime_rate_text')}"></div>
        <div class="field"><label>Price per call ($)</label><input name="rc" type="number" step="0.01" min="0" value="${rate('onetime_rate_call')}"></div>
      </div>
      <div class="card" style="padding:12px 14px;background:#fbfaf6;margin-bottom:12px"><div id="otcalc" class="small">Check the list to see the total.</div>
        <div class="field" style="margin:8px 0 0"><label>Charge the client ($)</label><input name="price" type="number" step="0.01" min="0" style="max-width:180px"> <span class="small muted">Filled in from the prices above; change it if you like.</span></div></div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:14px"><input type="checkbox" name="consent" style="margin-top:3px"> <span>The client confirms the people on this list agreed to get messages from them. <span class="muted small">(Required by phone carriers and calling rules.)</span></span></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn secondary" id="otsave">💾 Save</button><button type="submit" class="btn gold">Send now</button></div>
    </form>
    <h3 style="margin:26px 0 10px">Past one-time sends</h3><div id="otjobs"></div>`;
  const f = $('#otf');
  const syncMode = () => { const v = f.mode.value === 'VOICE'; $('#otvoice').classList.toggle('hidden', !v); $('#otmsgf').classList.toggle('hidden', v); calc(); };
  function calc() {
    const n = recips.length, mode = f.mode.value;
    if (!n) { $('#otcalc').innerHTML = 'Check the list to see the total.'; return; }
    const body = `${f.client.value || 'Client'} via CommunityConnect:\n${f.msg.value}\nReply STOP to opt out.`;
    const seg = Math.max(1, segInfo(body).segments);
    const texts = ['TEXT', 'BOTH'].includes(mode) ? n : 0, calls = ['CALL', 'BOTH', 'VOICE'].includes(mode) ? n : 0;
    const total = texts * seg * (+f.rt.value || 0) + calls * (+f.rc.value || 0);
    $('#otcalc').innerHTML = `<b>${num(n)}</b> people · ${texts ? `${num(texts)} texts × ${seg} part${seg > 1 ? 's' : ''} × ${money(f.rt.value)}` : ''}${texts && calls ? ' + ' : ''}${calls ? `${num(calls)} calls × ${money(f.rc.value)}` : ''} = <b>${money(total)}</b>`;
    if (!f.price.dataset.touched) f.price.value = (Math.round(total * 100) / 100).toFixed(2);
  }
  const rowsFromSheet = rows => rows.map(r => { const cells = r.map(x => String(x ?? '').trim()); const pi = cells.findIndex(c => c.replace(/\D/g, '').length >= 10);
    return pi < 0 ? null : { phone: cells[pi], name: cells.filter((c, i) => i !== pi && c && c.replace(/\D/g, '').length < 7).join(' ') }; }).filter(Boolean);
  async function check(rows) {
    const { data, error } = await sb.rpc('onetime_prepare', { p_rows: rows });
    if (error) return toast(friendlyError(error), true);
    recips = data.recipients || [];
    $('#otsum').innerHTML = `<b>${num(recips.length)}</b> numbers ready${data.invalid?.length ? ` · <span style="color:var(--bad)">${data.invalid.length} not valid</span> (${esc(data.invalid.slice(0, 5).join(', '))}${data.invalid.length > 5 ? '…' : ''})` : ''}${data.duplicates ? ` · ${data.duplicates} duplicates removed` : ''}`;
    calc();
  }
  $('#otcheck').addEventListener('click', () => check(rowsFromSheet(f.list.value.split(/\r?\n/).map(l => l.split(/[,\t;]/)))));
  $('#otfile').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { const rows = await readSheet(file); f.list.value = rows.map(r => r.join(', ')).join('\n'); await check(rowsFromSheet(rows)); } catch (err) { toast('Could not read that file.', true); } });
  $('#otaudio').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const path = `${f.org.value}/onetime-${Date.now()}.${(file.name.split('.').pop() || 'mp3').toLowerCase()}`;
    const up = await sb.storage.from('recordings').upload(path, file, { contentType: file.type || 'audio/mpeg' });
    if (up.error) return toast('Upload failed: ' + up.error.message, true);
    audio = sb.storage.from('recordings').getPublicUrl(path).data.publicUrl; f.audio.value = audio; toast('Recording uploaded');
  });
  ['input', 'change'].forEach(ev => f.addEventListener(ev, e => { if (e.target === f.price) f.price.dataset.touched = '1'; else if (['msg', 'rt', 'rc', 'client', 'mode'].includes(e.target.name)) calc(); }));
  f.mode.addEventListener('change', syncMode);
  async function save() {
    if (!f.client.value.trim()) { toast('Type who the send is for.', true); return null; }
    if (!recips.length) { toast('Add the list and press "Check the list".', true); return null; }
    const row = { from_org: f.org.value, client_name: f.client.value.trim(), client_contact: f.contact.value.trim() || null, message: f.msg.value, mode: f.mode.value,
      audio_url: f.audio.value.trim() || null, recipients: recips, recipient_count: recips.length, rate_text: +f.rt.value || 0, rate_call: +f.rc.value || 0,
      price: f.price.value === '' ? null : +f.price.value, consent: f.consent.checked, updated_at: new Date().toISOString() };
    const r = editing ? await sb.from('onetime_jobs').update(row).eq('id', editing).select('id').single() : await sb.from('onetime_jobs').insert(row).select('id').single();
    if (r.error) { toast(friendlyError(r.error), true); return null; }
    editing = r.data?.id || editing; return editing;
  }
  $('#otsave').addEventListener('click', async () => { if (await save()) { toast('Saved. Send it any time from the list below.'); drawJobs(); } });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.consent.checked) return toast('Check the box confirming the people agreed to get messages.', true);
    const id = await save(); if (!id) return;
    if (!await confirmBox('Send this one-time message?', `${esc(f.client.value)} · ${num(recips.length)} people · charge ${money(f.price.value)}`, 'Send now', false)) return;
    const { error } = await sb.rpc('onetime_send', { p_job: id });
    if (error) return toast(friendlyError(error), true);
    toast('Sending. Calls wait until quiet hours end.'); editing = null; recips = []; f.reset(); delete f.price.dataset.touched; $('#otsum').innerHTML = ''; calc(); drawJobs();
  });
  async function drawJobs() {
    const { data } = await sb.from('onetime_jobs').select('*').order('created_at', { ascending: false }).limit(50);
    const list = data || [];
    $('#otjobs').innerHTML = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Client</th><th>From</th><th>People</th><th>How</th><th>Charge</th><th>Paid</th><th>Status</th><th></th></tr></thead><tbody>${list.map(j => `<tr data-id="${j.id}">
        <td>${esc(fmtDT(j.sent_at || j.created_at))}</td><td><b>${esc(j.client_name)}</b><div class="small muted">${esc(j.client_contact || '')}</div></td>
        <td class="small">${esc((orgs || []).find(o => o.id === j.from_org)?.name || '')}</td><td>${num(j.recipient_count)}</td>
        <td>${{ TEXT: 'Text', CALL: 'Call', BOTH: 'Text + call', VOICE: 'Recording' }[j.mode]}</td><td>${j.price != null ? money(j.price) : '—'}</td>
        <td><input type="checkbox" data-paid ${j.paid ? 'checked' : ''} title="Mark paid"></td><td>${pill(j.status)}</td>
        <td style="white-space:nowrap">${j.history_id ? '<button type="button" class="btn sm" data-rep>📊 Report</button> ' : ''}${j.status === 'DRAFT' ? '<button type="button" class="btn secondary sm" data-open>Open</button> <button type="button" class="btn ghost sm" data-del>🗑</button> ' : ''}<button type="button" class="btn ghost sm" data-bill>📋 Bill</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No one-time sends yet.</div>';
  }
  $('#otjobs').addEventListener('click', async e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const { data: j } = await sb.from('onetime_jobs').select('*').eq('id', tr.dataset.id).single(); if (!j) return;
    if (e.target.closest('[data-paid]')) { check2(await sb.from('onetime_jobs').update({ paid: e.target.checked, updated_at: new Date().toISOString() }).eq('id', j.id), e.target.checked ? 'Marked paid' : 'Marked unpaid'); }
    if (e.target.closest('[data-rep]')) { const { data: h } = await sb.from('message_history').select('*').eq('id', j.history_id).single(); const { data: s2 } = await sb.rpc('delivery_summary', { p_org: h.org_id, p_ids: [h.id] }); h._rep = (s2 || [])[0]; deliveryReport(h); }
    if (e.target.closest('[data-del]')) { check2(await sb.from('onetime_jobs').delete().eq('id', j.id), 'Deleted'); drawJobs(); }
    if (e.target.closest('[data-bill]')) {
      const seg = Math.max(1, segInfo(`${j.client_name} via CommunityConnect:\n${j.message}\nReply STOP to opt out.`).segments);
      const texts = ['TEXT', 'BOTH'].includes(j.mode) ? j.recipient_count : 0, calls = ['CALL', 'BOTH', 'VOICE'].includes(j.mode) ? j.recipient_count : 0;
      const txt = `CommunityConnect (Nivolink) - one-time announcement\nFor: ${j.client_name}\nDate: ${fmtDT(j.sent_at || j.created_at)}\n`
        + (texts ? `Texts: ${texts} x ${seg} part(s) x ${money(j.rate_text)}\n` : '') + (calls ? `Phone calls: ${calls} x ${money(j.rate_call)}\n` : '')
        + `Total: ${money(j.price)}\n\nThank you!`;
      try { await navigator.clipboard.writeText(txt); toast('Bill copied. Paste it into an email or text to the client.'); } catch { modal('Bill', `<pre class="cmd" style="white-space:pre-wrap">${esc(txt)}</pre>`, {}); }
    }
    if (e.target.closest('[data-open]')) {
      editing = j.id; recips = j.recipients || []; f.client.value = j.client_name; f.contact.value = j.client_contact || ''; f.org.value = j.from_org; f.mode.value = j.mode;
      f.msg.value = j.message; f.audio.value = j.audio_url || ''; f.rt.value = j.rate_text; f.rc.value = j.rate_call; f.price.value = j.price ?? ''; f.price.dataset.touched = '1'; f.consent.checked = j.consent;
      f.list.value = recips.map(r => [r.phone, r.name].filter(Boolean).join(', ')).join('\n'); $('#otsum').innerHTML = `<b>${num(recips.length)}</b> numbers ready`; syncMode(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  const check2 = (r, ok) => r.error ? toast(friendlyError(r.error), true) : toast(ok);
  syncMode(); drawJobs();
}

/* ---------- sample messages ---------- */
const SAMPLES = [
  ['Reminders', '📅', 'Event reminder', 'PREF', 'Reminder: our community dinner is tomorrow at 7 PM in the main hall. See you there!'],
  ['Reminders', '📅', 'Personal reminder', 'TEXT', 'Hi {name}, just a reminder that the meeting is tonight at 8 PM. Reply if you can\'t make it.'],
  ['Reminders', '📅', 'RSVP deadline', 'PREF', 'Last day to sign up for Sunday\'s brunch! Reply YES with how many people are coming.'],
  ['Changes', '🔄', 'Time change', 'PREF', 'Please note: tonight\'s program starts at 8:00 PM instead of 7:30 PM.'],
  ['Changes', '🔄', 'Location change', 'PREF', 'Change of location: today\'s class will be in Room 3 downstairs.'],
  ['Changes', '🔄', 'Cancelled', 'PREF', 'Tonight\'s event is cancelled. We\'ll let you know the new date soon. Sorry for the inconvenience.'],
  ['Emergency', '🚨', 'Snow closing', 'EMERGENCY', 'Because of the snowstorm, the building is closed today. All programs are cancelled. Stay safe!'],
  ['Emergency', '🚨', 'Power outage', 'EMERGENCY', 'We have a power outage. The building is closed until further notice. We will update you as soon as we know more.'],
  ['Emergency', '🚨', 'Road closed', 'EMERGENCY', 'Heads up: the main road in front of the building is closed. Please use the back entrance on the side street.'],
  ['Events', '🎉', 'New event', 'PREF', 'Save the date! Our annual dinner is on Sunday, March 8 at 6 PM. More details soon.'],
  ['Events', '🎉', 'Kids program', 'PREF', 'Kids program this Sunday at 10 AM: crafts, games and snacks. Ages 4 to 10. Free!'],
  ['Volunteers', '🙋', 'Need volunteers', 'TEXT', 'We need 5 volunteers this Sunday from 9 to 11 AM to set up. Reply if you can help. Thank you!'],
  ['Volunteers', '🙋', 'Thank you', 'TEXT', 'Thank you {name} for volunteering this week! We couldn\'t do it without you.'],
  ['Polls', '📊', 'Pick a date', 'POLL', 'Which day works best for the next event?', ['Sunday', 'Monday', 'Tuesday']],
  ['Polls', '📊', 'Will you come?', 'POLL', 'Are you coming to the dinner on Sunday?', ['Yes', 'No', 'Maybe']],
  ['Polls', '📊', 'Food choice', 'POLL', 'What would you like for the dinner?', ['Chicken', 'Fish', 'Vegetarian']],
  ['Members', '👋', 'Welcome', 'TEXT', 'Welcome {name}! You\'ll now get our announcements here. Reply STOP anytime to opt out.'],
  ['Members', '💳', 'Dues reminder', 'TEXT', 'Hi {name}, a friendly reminder that yearly dues are due by the end of the month. Thank you for your support!'],
  ['Members', '📎', 'Flyer', 'FLYER', 'Please see the attached flyer for this week\'s schedule.'],
  ['Shul', '🕯️', 'Shabbos times', 'PREF', 'Shabbos Parshas {parsha}\nCandle lighting {candles}\nMincha {shkia_friday-10}\nShabbos ends {havdalah}\nGood Shabbos!', null, true],
  ['Shul', '🕯️', 'שבת זמנים (Hebrew)', 'PREF', '{parsha_hebrew}\nהדלקת נרות {candles}\nמנחה {shkia_friday-10}\nמוצאי שבת {havdalah}\nגוט שבת!', null, true],
  ['Shul', '🙏', 'Mincha time', 'TEXT', 'Mincha today at {shkia-15}, Maariv at {tzeis}.', null, true],
  ['Shul', '🎉', 'Mazel tov', 'PREF', 'Mazel tov to the Cohen family on the birth of a baby boy! Kiddush this Shabbos after davening.', null, true],
  ['Shul', '😢', 'Levaya', 'PREF', 'With great sadness we announce the passing of _____. The levaya will be at _____. Shiva at _____. Hamakom yenachem.', null, true],
  ['Shul', '📖', 'Shiur', 'PREF', 'The weekly shiur is tonight at 8:30 PM. Everyone is welcome!', null, true],
];
function samplesPage() {
  const list = SAMPLES.filter(x => JEW() || !x[6]);
  const cats = [...new Set(list.map(x => x[0]))];
  $('#main').innerHTML = head('Sample messages', 'Ready-made messages to start from. Press "Use this" and it opens on Send Message, where you can change it, choose the group, and send now or schedule it.')
    + `<div class="toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:6px">${['All', ...cats].map((c, i) => `<button type="button" class="chip${i ? '' : ' on'}" data-cat="${esc(c)}">${esc(c === 'Shul' ? 'Shul' : c)}</button>`).join('')}</div>
      <div class="samples">${list.map((x, i) => `<div class="card panel sample" data-c="${esc(x[0])}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${x[1]} ${esc(x[2])}</b>
          <span class="pill">${x[3] === 'POLL' ? 'Poll' : x[3] === 'EMERGENCY' ? 'Emergency' : x[3] === 'TEXT' ? 'Text' : x[3] === 'FLYER' ? 'Flyer' : 'Text or call'}</span></div>
        <div class="small" ${/[֐-׿]/.test(x[4]) ? 'dir="rtl"' : ''} style="white-space:pre-wrap;background:var(--cream, #f7f4ee);padding:10px 12px;border-radius:10px;margin:10px 0;flex:1">${esc(x[4])}${x[5] ? '\n' + x[5].map((o, k) => `Reply ${k + 1} for ${o}`).join('\n') : ''}</div>
        <button type="button" class="btn sm" data-use="${SAMPLES.indexOf(x)}">Use this</button></div>`).join('')}</div>`;
  $$('[data-cat]').forEach(b => b.addEventListener('click', () => {
    $$('[data-cat]').forEach(x => x.classList.toggle('on', x === b));
    $$('.sample').forEach(c => c.classList.toggle('hidden', b.dataset.cat !== 'All' && c.dataset.c !== b.dataset.cat));
  }));
  $$('[data-use]').forEach(b => b.addEventListener('click', () => {
    const x = SAMPLES[+b.dataset.use];
    const payload = { message: x[4], group: 'ALL', mode: x[3] === 'POLL' || x[3] === 'FLYER' ? 'TEXT' : x[3], poll: x[5] || null };
    try { sessionStorage.setItem('cc_reuse', JSON.stringify(payload)); } catch {}
    go('send');
  }));
}

/* ---------- credits ---------- */
async function creditsInfo() { const { data } = await sb.rpc('credits_status', { p_org: S.org.id }); return data || {}; }
function creditChoices(c) {
  const packs = (c.packs || []).map(k => `<button type="button" class="btn secondary" data-pack="${esc(k.code)}" style="justify-content:space-between;width:100%;margin:0 0 8px">
      <span>➕ <b>${num(k.credits)} extra credits</b> <span class="muted small">for the rest of this month</span></span><b>$${num(k.price)}</b></button>`).join('');
  return `<div style="margin:6px 0 4px"><b>Add credits for this month</b></div>${packs}
    <div style="margin:14px 0 4px"><b>Or move up a plan</b> <span class="muted small">(more credits every month)</span></div>
    <button type="button" class="btn" data-upgrade style="width:100%">⬆️ Upgrade my plan</button>`;
}
function wireCreditChoices(root, c, after) {
  $$('[data-pack]', root).forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const { data, error } = await sb.rpc('start_credit_purchase', { p_org: S.org.id, p_pack: b.dataset.pack });
    b.disabled = false;
    if (error) return toast(friendlyError(error), true);
    window.open(data, '_blank', 'noopener'); after && after();
    toast('Finish the payment in the new tab. The credits are added as soon as it goes through.');
  }));
  $$('[data-upgrade]', root).forEach(b => b.addEventListener('click', () => {
    if (c.portal) { const u = new URL(c.portal); if (S.user?.email) u.searchParams.set('prefilled_email', S.user.email); window.open(u.toString(), '_blank', 'noopener'); }
    else location.href = 'mailto:hello@nivolink.com?subject=' + encodeURIComponent('Upgrade plan for ' + (S.org?.name || ''));
    after && after();
  }));
}
async function creditsModal(need, left, overAfterEmergency = false) {
  const c = await creditsInfo();
  const close = modal(overAfterEmergency ? 'You went over your credits' : 'Not enough credits',
    `<p style="margin-top:0">${overAfterEmergency
      ? `The emergency message went out. It used more credits than you had left, so please add credits or upgrade.`
      : `This message needs <b>${num(need)}</b> credits and you have <b>${num(left)}</b> left this month. Nothing was sent.`}</p>
     <p class="small muted">Plan: ${esc(c.plan_name || '')} · ${num(c.plan || 0)} credits a month${c.extra ? ` + ${num(c.extra)} extra` : ''} · ${num(c.used || 0)} used</p>
     ${creditChoices(c)}`, {});
  const root = $$('.modal-back').pop(); wireCreditChoices(root, c, () => root.remove());
  return close;
}
async function creditsPage() {
  $('#main').innerHTML = head('Plan & credits', 'Every text, picture text and phone call uses credits. Email is free. Credits start fresh on the 1st of each month.') + '<div class="card panel">Loading…</div>';
  const c = await creditsInfo();
  if (c.demo || c.left == null) { $('#main .panel').innerHTML = 'This account has unlimited credits.'; return; }
  const total = (c.plan || 0) + (c.extra || 0), pct = total ? Math.min(100, Math.round((c.used || 0) * 100 / total)) : 0;
  const { data: buys } = await sb.from('credit_purchases').select('*').eq('org_id', S.org.id).eq('status', 'PAID').order('paid_at', { ascending: false }).limit(12);
  $('#main .panel').outerHTML = `<div class="card panel" style="max-width:720px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><b>${esc(c.plan_name || 'Your plan')}</b><span>${num(c.used)} of ${num(total)} credits used this month</span></div>
      <div style="height:12px;background:var(--line);border-radius:8px;margin:10px 0;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 90 ? 'var(--red, #c0392b)' : 'var(--navy, #1d3a6e)'}"></div></div>
      <p class="small muted" style="margin:0">${num(c.plan)} from your plan${c.extra ? ` + ${num(c.extra)} extra you added` : ''} · <b>${num(Math.max(c.left, 0))} left</b>. Before anything goes out, the system checks there are enough credits. Emergencies always go out.</p>
    </div>
    <div class="card panel" style="max-width:720px;margin-top:16px">${creditChoices(c)}</div>
    ${(buys || []).length ? `<div class="card panel" style="max-width:720px;margin-top:16px"><b>Credits you bought</b><ul class="small" style="margin:8px 0 0">${buys.map(b => `<li>${esc(fmtDT(b.paid_at))}: ${num(b.credits)} credits${b.amount_paid != null ? ' · $' + num(b.amount_paid) : ''}</li>`).join('')}</ul></div>` : ''}`;
  wireCreditChoices($('#main'), c);
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
/* ----- use a past message again ----- */
const MODE_FROM_CMD = { TEXT: 'TEXT', CALL: 'CALL', EMERGENCY: 'EMERGENCY', VOICE: 'VOICE' };
function reusePayload(r) {
  let msg = r.message || '', poll = null;
  if (r.media_url && msg === 'Please see the attached flyer.') msg = '';
  if (r.audio_url && msg === '[Voice recording]') msg = '';
  const m = msg.match(/^([\s\S]*?)\n((?:Reply \d for .+\n?)+)$/);
  if (m) { poll = m[2].trim().split('\n').map(l => l.replace(/^Reply \d for /, '').trim()).filter(Boolean); msg = m[1]; }
  return { message: msg, group: r.group_name, mode: r.audio_url ? 'VOICE' : (MODE_FROM_CMD[r.command] || (r.method_override === 'TEXT' || r.method_override === 'TEXTERS' ? 'TEXT' : r.method_override === 'CALL' ? 'CALL' : 'PREF')),
    media_url: r.media_url || null, audio_url: r.audio_url || null, poll };
}
function reuseMessage(r) { try { sessionStorage.setItem('cc_reuse', JSON.stringify(reusePayload(r))); } catch {} go('send'); return 'nav'; }

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
const caExtra = (reach, per) => reach && reach.sms_ca ? Math.ceil(reach.sms_ca * per * ((+reach.ca_rate || 1) - 1)) : 0;
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
  modal('Delivery report', `<div class="rep-share"><button type="button" class="btn secondary sm" data-rs="copy">📋 Copy summary</button>
      <button type="button" class="btn secondary sm" data-rs="csv">⬇ Download (Excel)</button><button type="button" class="btn secondary sm" data-rs="print">🖨 Print / PDF</button>
      ${navigator.share ? '<button type="button" class="btn secondary sm" data-rs="share">📤 Share</button>' : ''}<button type="button" class="btn secondary sm" data-rs="link">🔗 Share link</button><div id="replink" class="hidden" style="flex-basis:100%;padding:10px 12px;border-radius:10px;background:var(--sky-soft)"></div></div>` + body, { wide: true });
  // ---- sharing ----
  const when = fmtDT(h.created_at), title = `Delivery report: ${when} · ${h.group_name || ''}`;
  const sumLines = () => {
    const L = [title, `Message: ${h.message || ''}`, ''];
    if (x.delivered + x.failed + x.pending) L.push(`Texts: ${x.delivered} delivered${x.failed ? `, ${x.failed} failed` : ''}${x.pending ? `, ${x.pending} waiting` : ''}`);
    if (callsTotal) L.push(`Calls: ${x.answered} answered${x.voicemail ? `, ${x.voicemail} voicemail` : ''}${x.no_answer ? `, ${x.no_answer} no answer` : ''}${x.call_failed ? `, ${x.call_failed} failed` : ''}, ${Math.round((x.listen_seconds || 0) / 60)} min listened`);
    if (x.emailed) L.push(`Emails: ${x.emailed} sent`);
    L.push(`Replied: ${x.replies}`);
    return L.join('\n');
  };
  const rowsOut = () => rows.map(r => { const [l] = RESULT_LABEL[r.result] || [r.result];
    return { Name: r.name || '', 'Phone / email': r.phone ? fmtPhone(r.phone) : (r.email || ''), How: r.channel === 'call' ? 'Call' : r.channel === 'email' ? 'Email' : 'Text',
      Result: l, Reason: r.error_code ? (ERR_LABEL[r.error_code] || 'Error ' + r.error_code) : '', Listened: r.channel === 'call' && r.duration ? secs(r.duration) : '', Reply: r.replied || '' }; });
  $('.rep-share').addEventListener('click', async e => {
    const k = e.target.closest('[data-rs]')?.dataset.rs; if (!k) return;
    if (k === 'copy') { try { await navigator.clipboard.writeText(sumLines()); toast('Summary copied. Paste it into an email or text.'); } catch { toast('Could not copy', true); } }
    if (k === 'share') { try { await navigator.share({ title, text: sumLines() }); } catch {} }
    if (k === 'link' || k === 'linkcopy' || k === 'linkstop') {
      const box = $('#replink');
      if (k === 'linkstop') { const r2 = await sb.rpc('stop_share_report', { p_history: h.id }); if (r2.error) return toast(r2.error.message, true); box.classList.add('hidden'); return toast('The link no longer works.'); }
      if (k === 'linkcopy') { try { await navigator.clipboard.writeText($('#replinkurl').value); toast('Link copied'); } catch { $('#replinkurl').select(); } return; }
      const r2 = await sb.rpc('share_report', { p_history: h.id }); if (r2.error) return toast(r2.error.message, true);
      box.innerHTML = `<div class="small" style="margin-bottom:6px">Anyone with this link can see this report (names show as first name and last initial, phone numbers are hidden). It works until <b>${esc(fmtDT(r2.data.expires))}</b>.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="replinkurl" readonly value="${esc(r2.data.url)}" style="flex:1;min-width:220px"><button type="button" class="btn sm" data-rs="linkcopy">Copy</button><button type="button" class="btn secondary sm" data-rs="linkstop">Stop sharing</button></div>`;
      box.classList.remove('hidden'); try { await navigator.clipboard.writeText(r2.data.url); toast('Link copied'); } catch {}
    }
    if (k === 'csv') {
      const data = rowsOut(), cols = ['Name', 'Phone / email', 'How', 'Result', 'Reason', 'Listened', 'Reply'];
      const q = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = '\ufeff' + sumLines().split('\n').map(l => q(l)).join('\n') + '\n\n' + cols.join(',') + '\n' + data.map(d => cols.map(c => q(d[c])).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `delivery-report-${(h.created_at || '').slice(0, 10)}-${(h.group_name || 'all').toLowerCase()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    if (k === 'print') {
      const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', true);
      const data = rowsOut();
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#1b2a41;margin:28px}h1{font-size:20px;margin:0 0 4px}
        .sum{white-space:pre-wrap;background:#eef4fb;border-radius:10px;padding:12px 14px;margin:12px 0 18px;font-size:14px}table{border-collapse:collapse;width:100%;font-size:12.5px}
        th,td{border-bottom:1px solid #dde5f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f6fb}.foot{margin-top:16px;font-size:11px;color:#6b7a90}</style></head><body>
        <h1>${esc(S.org.name)}</h1><div class="sum">${esc(sumLines())}</div>
        <table><thead><tr>${Object.keys(data[0] || { Name: '' }).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.map(d => `<tr>${Object.values(d).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <div class="foot">CommunityConnect · printed ${esc(new Date().toLocaleString())}</div></body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    }
  });
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

/* ----- repeating messages (weekly zmanim etc.) ----- */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZMAN_TAGS = [
  ['Shabbos', [['{parsha}', 'Parsha'], ['{parsha_he}', 'Parsha in Hebrew (וישלח)'], ['{parsha_hebrew}', 'פרשת + Parsha in Hebrew'], ['{candles}', 'Candle lighting'], ['{shkia_friday}', 'Shkia Friday'], ['{shma_shabbos}', 'Sof zman shma Shabbos (GRA)'],
    ['{shma_mga_shabbos}', 'Shma Shabbos (MGA)'], ['{shkia_shabbos}', 'Shkia Shabbos'], ['{havdalah}', 'Havdalah'], ['{shabbos_date}', 'Shabbos date']]],
  ['Today', [['{alos}', 'Alos'], ['{sunrise}', 'Netz'], ['{shma}', 'Shma (GRA)'], ['{shma_mga}', 'Shma (MGA)'], ['{tefila}', 'Tefila'], ['{chatzos}', 'Chatzos'],
    ['{mincha_gedola}', 'Mincha gedola'], ['{plag}', 'Plag'], ['{shkia}', 'Shkia'], ['{tzeis}', 'Tzeis'], ['{date}', 'Date']]],
  ['People', [['{name}', 'First name']]]];
// chips that put a {time} into a message box (only for organizations with Jewish features)
const hasZTags = t => /\{(?!name\}|first\}|fullname\})[a-z_0-9]+([+-]\d{1,3})?\}/.test(t || '');
function zmanChips(withName = true) {
  if (!JEW()) return withName ? '<div class="zchips"><button type="button" class="chip" data-tag="{name}">First name</button></div>' : '';
  const own = (S.org.custom_zmanim || []);
  return `<div class="zchips">${own.length ? `<div class="small"><b>Your times</b></div>${own.map(c => `<button type="button" class="chip" data-tag="{${esc(c.key)}}">${esc(c.label)}</button>`).join('')}` : ''}
    ${ZMAN_TAGS.filter(([h]) => withName || h !== 'People').map(([h, tags]) => `<div class="small"><b>${h}</b></div>${tags.map(([t, l]) => `<button type="button" class="chip" data-tag="${t}">${esc(l)}</button>`).join('')}`).join('')}</div>`;
}
function wireChips(box, ta, after) {
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return; const tag = b.dataset.tag;
    const s0 = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s0) + tag + ta.value.slice(ta.selectionEnd ?? s0);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + tag.length; ta.dispatchEvent(new Event('input', { bubbles: true })); after && after();
  });
}
const ORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const nthDay = n => n === -1 ? 'last day' : n + ([, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
function repeatText(r) {
  const at = ' at ' + fmtTime(r.send_time);
  switch (r.freq || 'weekly') {
    case 'daily': return 'Every day' + at;
    case 'every_n_weeks': return `Every ${r.every_n} weeks on ${(r.weekdays || []).map(d => DAYS[d]).join(', ')}${at}`;
    case 'monthly_day': return `Every month on the ${nthDay(r.month_day)}${at}`;
    case 'monthly_nth': return `Every month on the ${ORD[r.nth]} ${DAYS_LONG[r.nth_weekday]}${at}`;
    default: return `Every ${(r.weekdays || []).map(d => DAYS[d]).join(', ')}${at}`;
  }
}
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const ZBASES = [['shkia', 'Shkia (that day)'], ['shkia_friday', 'Shkia Friday'], ['shkia_shabbos', 'Shkia Shabbos'], ['candles', 'Candle lighting'], ['havdalah', 'Havdalah (Shabbos ends)'],
  ['sunrise', 'Netz (that day)'], ['sunrise_shabbos', 'Netz Shabbos'], ['alos', 'Alos (that day)'], ['shma', 'Sof zman shma (that day)'], ['shma_shabbos', 'Sof zman shma Shabbos'],
  ['chatzos', 'Chatzos (that day)'], ['chatzos_shabbos', 'Chatzos Shabbos'], ['mincha_gedola', 'Mincha gedola (that day)'], ['mincha_gedola_shabbos', 'Mincha gedola Shabbos'],
  ['plag', 'Plag (that day)'], ['plag_friday', 'Plag Friday'], ['plag_shabbos', 'Plag Shabbos'], ['tzeis', 'Tzeis (that day)'], ['tzeis_shabbos', 'Tzeis Shabbos'], ['tzeis72_shabbos', '72 min Shabbos']];
const zLabel = k => (ZBASES.find(b => b[0] === k) || [k, k])[1];
const roundText = (n, d) => !n ? 'exact' : `rounded ${d === 'down' ? 'down (earlier)' : d === 'up' ? 'up (later)' : 'to the nearest'} ${n} min`;
async function loadOrgZ() {
  const { data } = await sb.from('organizations').select('zmanim_zip,candle_minutes,candle_round,havdalah_minutes,havdalah_round,custom_zmanim').eq('id', S.org.id).single();
  if (data) Object.assign(S.org, data); return S.org;
}
async function zmanimSettings() {
  const o = await loadOrgZ(); let custom = JSON.parse(JSON.stringify(o.custom_zmanim || []));
  const sel = (name, opts, v) => `<select name="${name}">${opts.map(([val, l]) => `<option value="${val}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const roundOpts = [['0|nearest', 'Exact'], ['5|down', '5 min, earlier'], ['5|up', '5 min, later'], ['5|nearest', '5 min, nearest'], ['10|down', '10 min, earlier'], ['10|up', '10 min, later'], ['15|nearest', '15 min, nearest']];
  const f = modal('Zmanim settings', `
    <div class="grid2">
      <div class="field"><label>Location (ZIP code)</label><input name="zip" maxlength="10" value="${esc(o.zmanim_zip || '')}" placeholder="10952"><div class="hint">Times come from Hebcal.com for this ZIP.</div></div>
      <div></div>
      <div class="field"><label>Candle lighting: minutes before shkia</label>${sel('cmin', [[15, '15 min'], [18, '18 min (most common)'], [20, '20 min'], [22, '22 min'], [24, '24 min'], [30, '30 min'], [40, '40 min (Jerusalem)']].concat([15, 18, 20, 22, 24, 30, 40].includes(o.candle_minutes) ? [] : [[o.candle_minutes, o.candle_minutes + ' min']]), o.candle_minutes)}</div>
      <div class="field"><label>Candle lighting rounding</label>${sel('cround', [[0, 'Exact'], [5, 'Round down to 5 min (earlier)'], [10, 'Round down to 10 min']], o.candle_round)}<div class="hint">Before Shabbos always rounds earlier, never later.</div></div>
      <div class="field"><label>Shabbos ends (havdalah)</label>${sel('hmin', [['', 'Tzeis (8.5°)'], [40, '40 min after shkia'], [42, '42 min'], [45, '45 min'], [50, '50 min'], [60, '60 min'], [72, '72 min (Rabbeinu Tam)']].concat(o.havdalah_minutes && ![40, 42, 45, 50, 60, 72].includes(o.havdalah_minutes) ? [[o.havdalah_minutes, o.havdalah_minutes + ' min']] : []), o.havdalah_minutes ?? '')}</div>
      <div class="field"><label>Havdalah rounding</label>${sel('hround', [[0, 'Exact'], [5, 'Round up to 5 min (later)'], [10, 'Round up to 10 min']], o.havdalah_round)}<div class="hint">After Shabbos always rounds later, never earlier.</div></div>
    </div>
    <h4 style="margin:10px 0 4px">Your own times</h4>
    <p class="muted small" style="margin:0 0 8px">For example: <b>Mincha</b> = 15 min before shkia Friday, rounded down to 5. <b>Shiur</b> = 1 hour before shkia, nearest 5. Then use them in messages as {mincha}, {shiur}.</p>
    <div id="zcustom"></div>
    <button type="button" class="btn secondary sm" id="zadd">+ Add a time</button>
    <div id="zprev" class="small muted" style="margin-top:12px"></div>`, { wide: true, onSave: async form => {
      if ($$('#zcustom .zrow[data-i] input[data-k=label]').some(i => !i.value.trim())) { toast('Type a name for each of your own times (or remove it with ✕).', true); return false; }
      readRows();
      const [cr] = [form.cround.value];
      const res = await sb.rpc('save_zmanim_settings', { p_org: S.org.id, p_zip: form.zip.value, p_candle_minutes: +form.cmin.value, p_candle_round: +cr,
        p_havdalah_minutes: form.hmin.value === '' ? null : +form.hmin.value, p_havdalah_round: +form.hround.value, p_custom: custom });
      if (res.error) { toast(friendlyError(res.error), true); return false; }
      toast('Zmanim settings saved. New times load within a minute.'); await loadOrgZ(); if (S.view === 'repeating') repeatingPage(); return true;
    } });
  const rowHtml = (c, i) => `<div class="zrow" data-i="${i}">
      <input data-k="label" placeholder="Name, e.g. Mincha" value="${esc(c.label || '')}">
      <select data-k="base">${ZBASES.map(([k, l]) => `<option value="${k}" ${k === c.base ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <input data-k="mins" type="number" min="0" max="720" value="${Math.abs(c.offset || 0)}" title="Minutes">
      <select data-k="side"><option value="-" ${(c.offset || 0) < 0 ? 'selected' : ''}>before</option><option value="+" ${(c.offset || 0) >= 0 ? 'selected' : ''}>after</option></select>
      <select data-k="round">${roundOpts.map(([v, l]) => `<option value="${v}" ${v === `${c.round || 0}|${c.dir || 'nearest'}` ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <button type="button" class="btn ghost sm" data-rm title="Remove">✕</button></div>`;
  const draw = () => { $('#zcustom').innerHTML = custom.length ? `<div class="small muted zrow zhead"><span>Name</span><span>Based on</span><span>Minutes</span><span></span><span>Rounding</span><span></span></div>` + custom.map(rowHtml).join('') : '<div class="small muted" style="margin-bottom:8px">None yet.</div>'; };
  const readRows = (keepEmpty = false) => {
    custom = $$('#zcustom .zrow[data-i]').map(r => { const g = k => $(`[data-k="${k}"]`, r).value; const [n, d] = g('round').split('|');
      const label = g('label').trim(); return { label, key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''), base: g('base'),
        offset: (g('side') === '-' ? -1 : 1) * Math.abs(parseInt(g('mins') || '0', 10)), round: +n, dir: d }; }).filter(c => keepEmpty || c.label);
  };
  draw();
  $('#zadd').addEventListener('click', () => { readRows(true); custom.push({ label: '', base: 'shkia_friday', offset: -15, round: 5, dir: 'down' }); draw(); $$('#zcustom .zrow input[data-k=label]').pop().focus(); });
  $('#zcustom').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; readRows(true); custom.splice(+b.closest('.zrow').dataset.i, 1); draw(); });
}
async function repeatingPage() {
  const o = await loadOrgZ(), main = $('#main');
  main.innerHTML = head('Repeating messages', JEW() ? 'Messages that go out by themselves every day, week or month, like Shabbos zmanim. Times such as candle lighting are filled in fresh each time.' : 'Messages that go out by themselves on the days and time you choose, like a weekly reminder.',
    S.perms.send ? '<button class="btn" id="newrep">+ New repeating message</button>' : '') + (!JEW() ? '<div id="reps"><div class="card panel empty">Loading…</div></div>' : `<div class="card panel" style="margin-bottom:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div class="small"><b>Zmanim:</b> ${o.zmanim_zip ? esc(o.zmanim_zip) : '<span style="color:var(--bad)">no location set</span>'} · candles ${o.candle_minutes} min before shkia${o.candle_round ? ', rounded down to ' + o.candle_round : ''}
        · Shabbos ends ${o.havdalah_minutes ? o.havdalah_minutes + ' min after shkia' : 'at tzeis'}${o.havdalah_round ? ', rounded up to ' + o.havdalah_round : ''}
        ${(o.custom_zmanim || []).length ? `<br>Your times: ${o.custom_zmanim.map(c => `<span class="chip">{${esc(c.key)}}</span> ${esc(c.label)} = ${Math.abs(c.offset)} min ${c.offset < 0 ? 'before' : 'after'} ${esc(zLabel(c.base))}, ${esc(roundText(c.round, c.dir))}`).join(' · ')}` : ''}</div>
      ${S.perms.settings ? '<button class="btn secondary sm" id="zset">⚙ Zmanim settings</button>' : ''}</div><div id="reps"><div class="card panel empty">Loading…</div></div>`);
  $('#zset')?.addEventListener('click', zmanimSettings);
  const { data, error } = await sb.from('recurring_messages').select('*').eq('org_id', o.id).is('deleted_at', null).order('created_at');
  if (error) { $('#reps').innerHTML = `<div class="card panel empty">${esc(error.message)}</div>`; return; }
  $('#newrep')?.addEventListener('click', () => repeatingForm(null));
  if (!data.length) {
    $('#reps').innerHTML = `<div class="card panel"><h3 style="margin-top:0">No repeating messages yet</h3>
      ${JEW() ? `<p>For example, every <b>Friday at 10:00 AM</b> to <b>ALL</b>:</p>
      <div class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;max-width:440px">Shabbos Parshas {parsha}\nCandle lighting {candles}\nMincha {shkia_friday-10}\nSof zman Shma {shma_shabbos}\nShabbos ends {havdalah}</div>
      <p class="muted small">The times in { } are filled in for that week. {shkia_friday-10} means 10 minutes before shkia.${o.zmanim_zip ? '' : ' First set your location under <b>⚙ Zmanim settings</b> above.'}</p>`
      : `<p>For example, every <b>Monday at 9:00 AM</b> to <b>VOLUNTEERS</b>:</p>
      <div class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;max-width:440px">Hi {name}, a reminder that volunteer shifts for this week are posted. Reply with any questions.</div>`}
      ${S.perms.send ? '<button class="btn" id="newrep2">Create one now</button>' : ''}</div>`;
    $('#newrep2')?.addEventListener('click', () => repeatingForm(null, true));
    return;
  }
  $('#reps').innerHTML = data.map(r => `<div class="card panel" style="margin-bottom:14px" data-id="${esc(r.id)}">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div><h3 style="margin:0 0 4px">${esc(r.name)} ${r.active ? '<span class="pill ok">On</span>' : '<span class="pill">Paused</span>'}</h3>
        <div class="muted small">${esc(repeatText(r))} · <span class="chip">${esc(r.group_name)}</span> · ${esc({ PREF: 'by preference', TEXT: 'text only', CALL: 'call only' }[r.mode])}</div>
        ${r.last_result ? `<div class="small" style="margin-top:4px;color:${/^Not sent/.test(r.last_result) ? 'var(--bad)' : 'var(--ink-2)'}">Last: ${esc(r.last_result)}</div>` : ''}</div>
      ${S.perms.send ? `<div style="display:flex;gap:8px"><button class="btn secondary sm" data-edit>Edit</button><button class="btn secondary sm" data-toggle>${r.active ? 'Pause' : 'Turn on'}</button><button class="btn secondary sm" data-del>🗑</button></div>` : ''}</div>
    <div class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;margin-top:10px" data-prev>${esc(r.message)}</div></div>`).join('');
  data.forEach(async r => { // show this week's filled-in version
    const { data: pv } = await sb.rpc('preview_recurring', { p_org: o.id, p_message: r.message });
    const el = $(`[data-id="${r.id}"] [data-prev]`); if (el && pv) el.innerHTML = `<div class="muted small" style="margin-bottom:4px">This week it reads:</div>${esc(pv.message)}`;
  });
  $('#reps').onclick = async e => {
    const card = e.target.closest('[data-id]'); if (!card) return; const r = data.find(x => x.id === card.dataset.id);
    if (e.target.closest('[data-edit]')) return repeatingForm(r);
    if (e.target.closest('[data-toggle]')) {
      check(await sb.rpc('save_recurring', { p_org: o.id, p_id: r.id, p_name: r.name, p_group: r.group_name, p_message: r.message, p_mode: r.mode, p_weekdays: r.weekdays, p_time: r.send_time, p_active: !r.active,
        p_freq: r.freq, p_month_day: r.month_day, p_nth: r.nth, p_nth_weekday: r.nth_weekday, p_every_n: r.every_n }), r.active ? 'Paused' : 'Turned on');
      return repeatingPage();
    }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Delete this repeating message?', `"${r.name}" will stop going out.`, 'Delete'))) return;
      check(await sb.rpc('delete_recurring', { p_id: r.id }), 'Deleted'); return repeatingPage();
    }
  };
}
async function repeatingForm(r, example = false) {
  const o = S.org;
  const { data: groups } = await sb.rpc('my_send_groups', { p_org: o.id });
  const { data: glist } = await sb.from('groups').select('code,number,name').eq('org_id', o.id).eq('active', true).is('deleted_at', null).order('number');
  const allowed = (groups || []).includes('ALL') ? ['ALL', ...(glist || []).map(g => g.code).filter(c => c !== 'ALL')] : (groups || []);
  const ex = example && JEW();
  const v = r || { name: ex ? 'Shabbos zmanim' : '', group_name: 'ALL', mode: 'PREF', weekdays: [JEW() ? 5 : 1], send_time: JEW() ? '10:00' : '09:00', active: true,
    message: ex ? 'Shabbos Parshas {parsha}\nCandle lighting {candles}\nMincha {shkia_friday-10}\nSof zman Shma {shma_shabbos}\nShabbos ends {havdalah}\nGood Shabbos!' : '' };
  const f = modal(r ? 'Edit repeating message' : 'New repeating message', `
    <div class="grid2">
      <div class="field"><label>Name (for you)</label><input name="name" maxlength="80" value="${esc(v.name)}" placeholder="${JEW() ? 'Shabbos zmanim' : 'Weekly reminder'}"></div>
      <div class="field"><label>Send to group</label><select name="group">${allowed.map(g => `<option ${g === v.group_name ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="field"><label>Repeat</label><select name="freq">
        <option value="weekly">Every week, on certain days</option><option value="daily">Every day</option><option value="every_n_weeks">Every few weeks</option>
        <option value="monthly_day">Every month, on a date (e.g. the 1st)</option><option value="monthly_nth">Every month, on a weekday (e.g. first Sunday)</option></select></div>
      <div class="field" id="f_everyn"><label>How often</label><select name="every_n">${[2, 3, 4, 6, 8].map(n => `<option value="${n}" ${+v.every_n === n ? 'selected' : ''}>Every ${n} weeks</option>`).join('')}</select><div class="hint">Counted from the week you save it.</div></div>
      <div class="field" id="f_mday"><label>Day of the month</label><select name="month_day">${Array.from({ length: 31 }, (_, i) => i + 1).map(n => `<option value="${n}" ${+v.month_day === n ? 'selected' : ''}>The ${nthDay(n)}</option>`).join('')}<option value="-1" ${+v.month_day === -1 ? 'selected' : ''}>The last day</option></select><div class="hint">In shorter months, a day past the end (e.g. the 31st) goes out on the last day.</div></div>
      <div class="field" id="f_nth"><label>Which</label><div style="display:flex;gap:8px"><select name="nth">${[1, 2, 3, 4, -1].map(n => `<option value="${n}" ${+v.nth === n ? 'selected' : ''}>${ORD[n]}</option>`).join('')}</select>
        <select name="nth_weekday">${DAYS_LONG.map((d, i) => `<option value="${i}" ${+v.nth_weekday === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
      <div class="field" style="grid-column:1/-1" id="f_days"><label>Days</label><div class="groups-pick" id="rdays">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${(v.weekdays || []).includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
      <div class="field"><label>Time</label><input name="time" type="time" value="${esc((v.send_time || '10:00').slice(0, 5))}"></div>
      <div class="field"><label>How</label><select name="mode"><option value="PREF">By each member's preference</option><option value="TEXT">Text only</option><option value="CALL">Phone call only</option></select></div>
      <div class="field" style="grid-column:1/-1"><label>Message</label><textarea name="msg" rows="6" maxlength="1600">${esc(v.message)}</textarea>
        <div class="hint">${JEW() ? 'Click to add a time. Add -10 or +5 inside the braces for minutes before/after, e.g. {shkia_friday-10}.' : 'Click to add each person\'s first name.'}</div>
        <div id="ztags" style="margin-top:6px">${!JEW() ? '<button type="button" class="chip" data-tag="{name}" style="cursor:pointer">First name</button>' : (o.custom_zmanim || []).length ? `<div class="small" style="margin:6px 0 2px"><b>Your times</b></div>${o.custom_zmanim.map(c => `<button type="button" class="chip" data-tag="{${esc(c.key)}}" style="cursor:pointer;margin:0 4px 4px 0">${esc(c.label)}</button>`).join('')}` : ''}${!JEW() ? '' : ZMAN_TAGS.map(([h, tags]) => `<div class="small" style="margin:6px 0 2px"><b>${h}</b></div>${tags.map(([t, l]) => `<button type="button" class="chip" data-tag="${t}" style="cursor:pointer;margin:0 4px 4px 0">${esc(l)}</button>`).join('')}`).join('')}</div></div>
      <div class="field" style="grid-column:1/-1"><label>This week it would read</label><div id="rprev" class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;min-height:60px">…</div></div>
    </div>`, { wide: true, saveText: r ? 'Save' : 'Create', onSave: async form => {
      const days = $$('#rdays input:checked').map(i => +i.value), fq = form.freq.value;
      const res = await sb.rpc('save_recurring', { p_org: o.id, p_id: r?.id || null, p_name: form.name.value, p_group: form.group.value, p_message: form.msg.value,
        p_mode: form.mode.value, p_weekdays: ['weekly', 'every_n_weeks'].includes(fq) ? days : null, p_time: form.time.value, p_active: r ? r.active : true,
        p_freq: fq, p_month_day: fq === 'monthly_day' ? +form.month_day.value : null, p_nth: fq === 'monthly_nth' ? +form.nth.value : null,
        p_nth_weekday: fq === 'monthly_nth' ? +form.nth_weekday.value : null, p_every_n: fq === 'every_n_weeks' ? +form.every_n.value : null });
      if (res.error) { toast(friendlyError(res.error), true); return false; }
      toast(r ? 'Saved' : 'Created. It will go out by itself at the set time.'); repeatingPage(); return true;
    } });
  f.mode.value = v.mode; f.freq.value = v.freq || 'weekly';
  const syncFreq = () => { const q = f.freq.value;
    $('#f_days').classList.toggle('hidden', !['weekly', 'every_n_weeks'].includes(q)); $('#f_everyn').classList.toggle('hidden', q !== 'every_n_weeks');
    $('#f_mday').classList.toggle('hidden', q !== 'monthly_day'); $('#f_nth').classList.toggle('hidden', q !== 'monthly_nth'); };
  f.freq.addEventListener('change', syncFreq); syncFreq();
  let t;
  const prev = async () => {
    const { data: pv, error } = await sb.rpc('preview_recurring', { p_org: o.id, p_message: f.msg.value || '' });
    const box = $('#rprev'); if (!box) return;
    if (error) { box.textContent = error.message; return; }
    let note = '';
    if (!JEW()) note = '';
    else if (!pv.zip) note = '<div style="color:var(--bad)">Set your location under ⚙ Zmanim settings to fill in the times.</div>';
    else if (pv.missing.length) note = `<div style="color:var(--warn)">${pv.loaded ? 'Unknown: ' + esc(pv.missing.map(m => '{' + m + '}').join(' ')) : 'Loading times for ' + esc(pv.zip) + '… this takes a minute.'}</div>`;
    box.innerHTML = esc(pv.message) + note;
    if (pv.zip && !pv.loaded) { clearTimeout(t); t = setTimeout(prev, 20000); }
  };
  f.msg.addEventListener('input', () => { clearTimeout(t); t = setTimeout(prev, 500); });
  $('#ztags').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return; const ta = f.msg, tag = b.dataset.tag;
    const s0 = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s0) + tag + ta.value.slice(ta.selectionEnd ?? s0);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + tag.length; prev();
  });
  prev();
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
    <div class="small" style="white-space:pre-wrap;background:var(--cream);padding:10px 12px;border-radius:10px;max-width:420px">${JEW() ? 'Kiddush this week, which day works?\nReply 1 for Friday night\nReply 2 for Shabbos morning' : 'Picnic this week, which day works?\nReply 1 for Saturday\nReply 2 for Sunday'}</div>
    <p class="muted small">If someone replies again, their answer is changed. Polls close after the number of days you choose.</p></div>`; return; }
  const byPoll = {}; (votes || []).forEach(v => (byPoll[v.poll_id] = byPoll[v.poll_id] || []).push(v));
  const open = p => new Date(p.closes_at) > new Date();
  $('#polls').innerHTML = polls.map(p => {
    const vs = byPoll[p.id] || [], total = vs.length;
    const counts = p.options.map((_, i) => vs.filter(v => v.choice === i + 1).length), max = Math.max(1, ...counts);
    return `<div class="card panel poll" data-id="${esc(p.id)}" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1 1 260px;min-width:0"><h3 style="margin:0 0 4px">${esc(p.question)}</h3>
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
  main.innerHTML = head('Send Message', 'Send an announcement now, or schedule it for later. Texts, calls and emails go out within seconds.') + `
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
      <div class="field"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px"><label id="msglabel">Message</label><span style="display:flex;gap:4px"><button type="button" class="btn ghost sm" id="draftsbtn" style="margin-bottom:4px">📝 Drafts</button><button type="button" class="btn ghost sm" id="pastmsg" style="margin-bottom:4px">↻ Use a past message</button></span></div><textarea name="msg" id="msg" rows="6" maxlength="1600" placeholder="${JEW() ? 'Mincha today is at 6:45 PM.' : 'Meeting tonight at 7 PM.'}"></textarea>
        <div class="hint" id="namehint">Tip: type <b>{name}</b> to greet each person by their first name, e.g. "Dear {name}, …"</div>
        ${JEW() ? `<details class="zdet" id="zdet"><summary>🕯️ Add a time: candle lighting, shkia, zmanim…</summary>${zmanChips(false)}<div class="hint">Times are for the day it goes out. Add -10 or +5 for minutes before/after, e.g. {shkia-10}.</div></details><div id="zwarn" class="small" style="color:var(--warn)"></div>` : ''}
        <div class="hint" id="callnote" style="display:none">📞 Calls read this message aloud twice.</div>
        <div id="linkwarn" class="small" style="display:none;margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--bad-soft);color:var(--bad)">⚠️ Your message has a web address or phone number. Your texting registration doesn't allow these, so carriers may block it. Please remove it.</div></div>
      <div id="callbox" class="callbox hidden"></div>
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
      <div class="field" id="whenbox"><label>When</label>
        <div class="groups-pick"><label><input type="radio" name="when" value="now" checked> ⚡ Send now</label><label><input type="radio" name="when" value="later"> ⏰ Schedule for later</label></div>
        <div id="laterbox" class="hidden" style="margin-top:10px;max-width:360px"><input type="datetime-local" name="sendat">
          <div class="hint">It goes out within 5 minutes of this time. Until then it waits under <b>Messages → Scheduled</b>, where you can change or delete it.</div></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="muted small">${o.confirmation_required ? 'You\'ll confirm before it goes out.' : ''}</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" type="button" id="savedraft">💾 Save draft</button><button class="btn gold" type="submit" id="sendbtn">Review & send</button></span></div>
    </form>
    <div class="card panel">
      <h3 id="calch">Message calculator</h3>
      <div class="kv" id="calc"></div>
      <div style="margin:14px 0 6px;font-weight:600;font-size:13px;color:var(--ink-2)">Who will receive it</div>
      <div class="kv" id="reach"><div>Recipients</div><div class="muted">…</div></div>
      <p class="small muted" id="segnote" style="margin:14px 0 0"><b>Credits:</b> each text uses 1 credit per segment: 160 plain characters, or 70 if it has Hebrew, Yiddish, emoji or special characters. Longer messages use more. A picture text (flyer) uses 3. Each phone call uses 1 credit. Emails are free.</p>
    </div>
  </div>`;
  const f = $('#sendf'); let reach = null;
  // ---- send now, or schedule for later ----
  const later = () => f.querySelector('input[name=when]:checked')?.value === 'later';
  const sendAt = () => { const v = f.sendat.value; const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
  const sendDay = () => later() && f.sendat.value ? f.sendat.value.slice(0, 10) : null;
  const syncWhen = () => {
    $('#laterbox').classList.toggle('hidden', !later());
    if (later() && !f.sendat.value) { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); f.sendat.value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); f.sendat.dispatchEvent(new Event('change')); }
    $('#sendbtn').textContent = later() ? 'Review & schedule' : 'Review & send';
  };
  f.querySelectorAll('input[name=when]').forEach(r => r.addEventListener('change', () => { syncWhen(); loadReach(); zload(); }));
  f.sendat.addEventListener('change', () => zload());
  // ---- {candles}, {shkia}… filled in for today, for the counter and preview ----
  let zc = { src: null, out: null }, zt;
  const zf = t => hasZTags(t) && zc.src === t ? zc.out : t;
  const zload = () => {
    const t = f.msg.value; if (!hasZTags(t)) { zc = { src: null, out: null }; if ($('#zwarn')) $('#zwarn').textContent = ''; return; }
    clearTimeout(zt); zt = setTimeout(async () => {
      // keep {name} as is (each person gets their own); fill only the times
      const { data } = await sb.rpc('preview_recurring', { p_org: o.id, p_message: t.replace(/\{(name|first|fullname)\}/g, '\u0001$1\u0002'), p_date: sendDay() });
      if (!data || f.msg.value !== t) return;
      zc = { src: t, out: data.message.replace(/\u0001(\w+)\u0002/g, '{$1}'), missing: data.missing || [] };
      const w = $('#zwarn'); if (w) w.textContent = !data.zip ? 'Set your location under Messages → Repeating → ⚙ Zmanim settings to fill in times.' : data.missing.length ? (data.loaded ? 'Unknown: ' + data.missing.map(m => '{' + m + '}').join(' ') : 'Loading times… one moment.') : '';
      draw();
    }, 400);
  };
  f.msg.addEventListener('input', zload);
  if ($('#zdet')) wireChips($('#zdet'), f.msg);
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
    const raw0 = withPoll(zf(f.msg.value)); const mode = f.mode.value;
    $('#linkwarn').style.display = mode !== 'VOICE' && (LINK_RE.test(raw0) || PHONE_RE.test(raw0)) ? '' : 'none'; const hasName = NAME_RE.test(raw0) || FULL_RE.test(raw0); NAME_RE.lastIndex = 0; FULL_RE.lastIndex = 0;
    const raw = personalize(raw0, 'Sarah Cohen');
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const msg = raw.trim();
    const usePre = !(pre && msg && msg.toLowerCase().startsWith(pre.replace(/:\s*$/, '').toLowerCase())), useFoot = !/stop/i.test(msg);
    const t = (usePre ? pre : '') + msg + (useFoot ? foot : '');          // what is actually sent (heading + message + STOP line)
    const fixed = segInfo((usePre ? pre : '') + (useFoot ? foot : '')).chars; // the part added automatically
    const i = segInfo(t); const mine = Math.max(0, i.chars - fixed);
    const sms = reach ? reach.sms : 0, calls = reach && (!pollOn() || reach.poll_calls) ? reach.calls : 0, emails = reach && ['PREF', 'EMERGENCY'].includes(mode) && !pollOn() ? (reach.email || 0) : 0;
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
      ${pollOn() && reach.poll_calls ? `<div>Phone voting</div><div class="small muted">${num(reach.poll_calls)} call-only members get a call and vote by pressing 1, 2, 3…</div>` : ''}
      <div>Credits this uses</div><div><b>${num(sms * (asPicture() ? 3 : i.segments) + calls + caExtra(reach, asPicture() ? 3 : i.segments))}</b> <span class="muted small">(${num(sms)} ${asPicture() ? 'picture texts × 3' : 'texts × ' + i.segments}${calls ? ` + ${num(calls)} calls` : ''}${caExtra(reach, asPicture() ? 3 : i.segments) ? ` + ${num(caExtra(reach, asPicture() ? 3 : i.segments))} for ${num(reach.sms_ca)} Canadian phones` : ''})</span>${flyer && calls ? `<div class="small muted">${msg ? 'Call members hear your typed message only, never the flyer.' : 'No message typed: only texting members get the flyer, so call members won\'t be called.'}</div>` : ''}</div>
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
    f.msg.rows = voice ? 2 : 6; f.msg.placeholder = voice ? (JEW() ? 'e.g. Shabbos schedule announcement' : 'e.g. Weekly schedule announcement') : (JEW() ? 'Mincha today is at 6:45 PM.' : 'Meeting tonight at 7 PM.');
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
    const { data, error } = await sb.rpc('web_preview', { p_org: o.id, p_group: f.group.value, p_mode: pollOn() ? 'POLL' : mode === 'EMERGENCY' ? 'PREF' : mode === 'VOICE' ? 'CALL' : mode, p_emergency: mode === 'EMERGENCY' || later() || (!pollOn() && f.vdnd.checked) });
    reach = error ? null : data; draw();
  };
  try { const m = sessionStorage.getItem('cc_send_mode'); sessionStorage.removeItem('cc_send_mode'); if (m === 'VOICE') f.mode.value = 'VOICE'; } catch {}
  // ---- fill the form from a past message (words, group, how, flyer, recording, poll) ----
  async function applyReuse(p) {
    if (!p) return;
    if (p.group && [...f.group.options].some(x => x.value === p.group)) f.group.value = p.group;
    if (p.mode && [...f.mode.options].some(x => x.value === p.mode)) f.mode.value = p.mode;
    f.msg.value = p.message || '';
    $('#pollon').checked = !!p.poll; $('#pollopts').classList.toggle('hidden', !p.poll); $('#pollanswers').innerHTML = '';
    (p.poll && p.poll.length ? p.poll : ['', '']).slice(0, 5).forEach(v => pollRow(v));
    if (p.audio_url && p.mode === 'VOICE') {
      f.querySelector('input[name=vsrc][value=url]').checked = true; f.querySelector('input[name=vsrc][value=url]').dispatchEvent(new Event('change'));
      f.vurl.value = p.audio_url; f.vurl.dispatchEvent(new Event('change'));
    }
    flyer = null;
    if (p.media_url) {
      try { const b = await (await fetch(p.media_url)).blob(); flyer = { image: b, file: null, name: 'flyer.jpg', kind: 'image' }; }
      catch { toast('The old flyer could not be loaded. Upload it again if you need it.', true); }
    }
    showFlyer(); f.mode.dispatchEvent(new Event('change')); draw();
    toast('Filled in from the past message. Check it, change anything, then send.');
    f.msg.focus();
  }
  try { const r = sessionStorage.getItem('cc_reuse'); sessionStorage.removeItem('cc_reuse'); if (r) setTimeout(() => applyReuse(JSON.parse(r)), 0); } catch {}
  // ----- drafts -----
  let curDraft = null;
  async function countDrafts() {
    const { count } = await sb.from('message_drafts').select('id', { count: 'exact', head: true }).eq('org_id', o.id);
    $('#draftsbtn').textContent = count ? `📝 Drafts (${count})` : '📝 Drafts';
  }
  countDrafts();
  $('#savedraft').addEventListener('click', async () => {
    const poll = $('#pollon').checked ? pollOpts() : null;
    const row = { org_id: o.id, message: f.msg.value, group_name: f.group.value, mode: f.mode.value, poll: poll && poll.length ? poll : null, updated_at: new Date().toISOString() };
    if (!row.message.trim() && !row.poll) return toast('Type something first, then save it as a draft.', true);
    const r = curDraft ? await sb.from('message_drafts').update(row).eq('id', curDraft).select('id').single()
                       : await sb.from('message_drafts').insert(row).select('id').single();
    if (r.error) return toast(friendlyError(r.error), true);
    curDraft = r.data?.id || curDraft; countDrafts();
    toast('Draft saved. Open it any time from 📝 Drafts.' + (typeof flyer !== 'undefined' && flyer ? ' The flyer and recording aren\'t saved with drafts, so attach them again when you send.' : ''));
  });
  $('#draftsbtn').addEventListener('click', async () => {
    const { data } = await sb.from('message_drafts').select('*').eq('org_id', o.id).order('updated_at', { ascending: false }).limit(100);
    const list = data || [];
    const m = modal('Drafts', `<div id="drl" style="max-height:60vh;overflow:auto"></div>`, { wide: true });
    const drawD = () => {
      $('#drl').innerHTML = list.map(r => `<div class="pm-item" style="display:flex;gap:10px;align-items:flex-start;cursor:default">
          <div style="flex:1;min-width:0"><div class="small muted">${esc(fmtDT(r.updated_at))} · ${esc(r.created_by || '')} · <span class="chip">${esc(r.group_name || '')}</span>${r.poll ? ' 📊' : ''}</div>
          <div class="pm-text">${esc((r.message || '').slice(0, 240)) || '<span class="muted">(no text)</span>'}</div></div>
          <button type="button" class="btn sm" data-use="${esc(r.id)}">Open</button><button type="button" class="btn ghost sm" data-del="${esc(r.id)}" title="Delete draft">🗑</button></div>`).join('')
        || '<div class="empty">No drafts yet. Write a message and press 💾 Save draft to keep it for later.</div>';
    };
    $('#drl').addEventListener('click', async e => {
      const u = e.target.closest('[data-use]'), d = e.target.closest('[data-del]');
      if (u) { const r = list.find(x => x.id === u.dataset.use); m.closest('.modal-back')?.remove();
        await applyReuse({ message: r.message, group: r.group_name, mode: r.mode, poll: r.poll }); curDraft = r.id;
        toast('Draft opened. Press 💾 Save draft again to keep your changes.'); }
      if (d) { await sb.from('message_drafts').delete().eq('id', d.dataset.del); list.splice(list.findIndex(x => x.id === d.dataset.del), 1);
        if (curDraft === d.dataset.del) curDraft = null; drawD(); countDrafts(); }
    });
    drawD();
  });
  $('#pastmsg').addEventListener('click', async () => {
    const { data } = await sb.from('message_history').select('id,created_at,group_name,command,message,media_url,audio_url,recipient_count')
      .eq('org_id', o.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    const list = data || [];
    const m = modal('Use a past message', `<input type="search" id="pmq" placeholder="Search past messages…" style="width:100%;margin-bottom:10px">
      <div id="pml" style="max-height:60vh;overflow:auto"></div>`, { wide: true });
    const drawL = () => {
      const q = ($('#pmq').value || '').toLowerCase();
      const rows = list.filter(r => !q || (r.message || '').toLowerCase().includes(q) || (r.group_name || '').toLowerCase().includes(q)).slice(0, 80);
      $('#pml').innerHTML = rows.map(r => `<button type="button" class="pm-item" data-id="${esc(r.id)}">
          <div class="small muted">${esc(fmtDT(r.created_at))} · <span class="chip">${esc(r.group_name || '')}</span> ${r.audio_url ? '🎙️' : ''}${r.media_url ? '🖼' : ''}</div>
          <div class="pm-text">${esc((r.message || '').slice(0, 240))}</div></button>`).join('') || '<div class="empty">No past messages found.</div>';
    };
    $('#pmq').addEventListener('input', drawL); $('#pmq').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    $('#pml').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return;
      const r = list.find(x => x.id === b.dataset.id); m.closest('.modal-back')?.remove(); applyReuse(reusePayload(r)); });
    drawL();
  });
  f.msg.addEventListener('input', draw);
  f.group.addEventListener('change', loadReach); f.mode.addEventListener('change', loadReach);
  const cbox = callSoundBox($('#callbox'), () => f.msg.value, { compact: true });
  const syncCall = () => { const on = ['PREF', 'CALL', 'EMERGENCY'].includes(f.mode.value) && f.msg.value.trim(); $('#callbox').classList.toggle('hidden', !on); if (on) cbox.refresh(); };
  f.msg.addEventListener('input', syncCall); f.mode.addEventListener('change', syncCall); setTimeout(syncCall, 300);
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
    const textOnly = flyerOnly || (poll && !reach?.poll_calls);
    if (flyerOnly) t = 'Please see the attached flyer.';
    const pre = reach?.sms_prefix || '', foot = reach?.sms_footer || '';
    const tz = zf(t);
    if (hasZTags(t) && zc.src !== t) return toast('The times are still loading. Wait a moment and try again.', true);
    if (hasZTags(t) && zc.missing?.length) return toast('These times can\'t be filled in: ' + zc.missing.map(m => '{' + m + '}').join(' '), true);
    const full = (pre && tz.toLowerCase().startsWith(pre.replace(/:\s*$/, '').toLowerCase()) ? '' : pre) + tz + (/stop/i.test(tz) ? '' : foot);
    if (!reach || !reach.total) return toast('Nobody in this group would receive it', true);
    if (flyerOnly && !reach.sms && !reach.email) return toast('Everyone in this group gets calls, and a flyer can\'t be heard. Type a message to call them.', true);
    if (poll && !reach.sms) return toast('Nobody in this group gets texts, so nobody could answer the poll.', true);
    const i = segInfo(personalize(full, 'Sarah Cohen')), mode = f.mode.value; const callsOut = textOnly ? 0 : reach.calls;
    const when = later() ? sendAt() : null;
    if (later() && (!when || when < new Date(Date.now() - 60e3))) return toast('Pick a date and time in the future for the scheduled message.', true);
    const needNow = reach.sms * (asPicture() ? 3 : i.segments) + callsOut + caExtra(reach, asPicture() ? 3 : i.segments), cs = await creditsInfo();
    if (cs.left != null && needNow > cs.left && mode !== 'EMERGENCY') return creditsModal(needNow, Math.max(cs.left, 0));
    const whenLine = when ? `<div style="margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--sky-soft)">⏰ Goes out <b>${esc(fmtDT(when.toISOString()))}</b>${JEW() && hebDate(asDayUTC(when.toISOString())) ? ' · ' + esc(hebDate(asDayUTC(when.toISOString()))) : ''}</div>` : '';
    const ok = await confirmBox(when ? (poll ? '📊 Schedule this poll?' : '⏰ Schedule this message?') : poll ? '📊 Send this poll?' : mode === 'EMERGENCY' ? '🚨 Send emergency message?' : 'Send this message?',
      whenLine +
      `<b>${esc(f.group.value)}</b> · ${num(reach.sms)} texts${callsOut ? ` + ${num(callsOut)} calls` : ''}${!poll && ['PREF', 'EMERGENCY'].includes(mode) && reach.email ? ` + ${num(reach.email)} emails` : ''} · ${num(needNow)} credits<br><br>${asPicture() ? `<img src="${esc($('#flyerimg').src)}" style="max-width:120px;max-height:150px;border-radius:8px;border:1px solid var(--line);margin-bottom:8px"><br>` : ''}${flyer && !asPicture() ? `📎 ${esc(flyer.name)} (sent as a link)<br>` : ''}
       <span style="white-space:pre-wrap;display:block;background:#f4f2ec;padding:10px 12px;border-radius:10px">${esc(personalize(full, 'Sarah Cohen'))}</span>`, when ? 'Schedule' : 'Send now', false);
    if (!ok) return;
    $('#sendbtn').disabled = true;
    let up;
    try { up = await uploadFlyer(); } catch (err) { $('#sendbtn').disabled = false; return toast(err.message, true); }
    const msgOut = t;
    let pollId = null;
    if (poll) {
      const pr = await sb.rpc('create_poll', { p_org: o.id, p_question: question, p_options: pollOpts(), p_group: f.group.value, p_days: +$('#polldays').value + (when ? Math.ceil((when - Date.now()) / 864e5) : 0) });
      if (pr.error) { $('#sendbtn').disabled = false; return toast(pr.error.message, true); }
      pollId = pr.data;
    }
    const res = await sb.rpc('web_send', { p_org: o.id, p_group: f.group.value, p_message: msgOut,
      p_mode: poll ? 'TEXTERS' : flyerOnly ? 'FLYER' : mode, p_emergency: mode === 'EMERGENCY' || (!textOnly && f.vdnd.checked), p_media_url: up.media, p_when: when ? when.toISOString() : null });
    $('#sendbtn').disabled = false;
    if (res.error) { if (pollId) await sb.from('polls').update({ deleted_at: new Date().toISOString() }).eq('id', pollId); return toast(res.error.message, true); }
    if (curDraft) { sb.from('message_drafts').delete().eq('id', curDraft).then(() => {}); curDraft = null; countDrafts(); }
    if (mode === 'EMERGENCY' && cs.left != null && needNow > cs.left) setTimeout(() => creditsModal(needNow, Math.max(cs.left, 0), true), 1500);
    toast(when ? `Scheduled for ${fmtDT(when.toISOString())}. It's waiting under Messages → Scheduled.` : poll ? 'Poll sent. Watch the answers come in on the Polls page.' : 'Sending now. It will appear in History in a moment.');
    f.msg.value = ''; flyer = null; showFlyer();
    if (when) { f.querySelector('input[name=when][value=now]').checked = true; f.sendat.value = ''; syncWhen(); loadReach(); }
    if (poll) { $('#pollon').checked = false; $('#pollopts').classList.add('hidden'); $('#pollanswers').innerHTML = ''; pollRow(); pollRow(); loadReach(); }
  });
  async function sendVoice() {
    if (recTimer) return toast('Stop the recording first.', true);
    const file = vsrc() === 'file' ? f.vfile.files[0] : vsrc() === 'rec' ? vRecFile : null, link = vsrc() === 'url' ? f.vurl.value.trim() : '';
    if (!file && !link) return toast(vsrc() === 'rec' ? 'Record your message first.' : vsrc() === 'file' ? 'Choose a recording to upload.' : 'Paste the link to the recording.', true);
    if (link && !/^https:\/\/\S+$/.test(link)) return toast('The link must start with https://', true);
    if (!reach || !reach.calls) return toast(reach?.skipped_dnd ? 'It\'s quiet hours: check "call everyone anyway" to send now.' : 'Nobody in this group would receive a call', true);
    const when = later() ? sendAt() : null;
    if (later() && (!when || when < new Date(Date.now() - 60e3))) return toast('Pick a date and time in the future for the scheduled message.', true);
    const ok = await confirmBox(when ? '⏰ Schedule this voice recording?' : 'Send this voice recording?',
      (when ? `<div style="margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--sky-soft)">⏰ Calls go out <b>${esc(fmtDT(when.toISOString()))}</b></div>` : '') + `<b>${esc(f.group.value)}</b> · ${num(reach.calls)} phone calls<br><br>Each person hears "This is a message from ${esc(o.name)}", then the recording twice.
       <br><br><b>Listen before sending:</b><audio controls src="${esc(vPreview() || '')}" style="width:100%;margin-top:8px"></audio>`, when ? 'Schedule' : 'Call everyone now', false);
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
      const res = await sb.rpc('web_send', { p_org: o.id, p_group: f.group.value, p_message: f.msg.value.trim(), p_mode: 'CALL', p_emergency: f.vdnd.checked, p_audio_url: url, p_when: when ? when.toISOString() : null });
      if (res.error) return toast(res.error.message, true);
      toast(when ? `Scheduled for ${fmtDT(when.toISOString())}. It's waiting under Messages → Scheduled.` : 'Calling now. It will appear in History in a moment.');
      if (when) { f.querySelector('input[name=when][value=now]').checked = true; f.sendat.value = ''; }
      f.msg.value = ''; f.vfile.value = ''; f.vurl.value = ''; if (vObjUrl) URL.revokeObjectURL(vObjUrl); vObjUrl = null;
      if (vRecUrl) URL.revokeObjectURL(vRecUrl); vRecUrl = null; vRecFile = null; recBtn.textContent = '● Start recording';
      recTime.textContent = 'Uses your computer\'s microphone. Up to 3 minutes.'; showPlayer(null); draw();
    } finally { btn.disabled = false; syncWhen(); }
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
  const known = ['overview', 'settings', 'registration', 'send', 'polls', 'repeating', 'credits', 'samples', 'pronunciation', 'p_onetime', 'p_costs'].includes(key) || VIEWS[key];
  S.view = known && (!VIEWS[key]?.platform || S.isPlatform) ? key : 'overview';
  renderNav();
  $$('[data-hebpref]').forEach(b => b.classList.toggle('hidden', !JEW()));
  if (!S.org && !VIEWS[S.view]?.platform) {
    $('#main').innerHTML = S.isPlatform ? head('Welcome', 'No organization yet. Create one under All Organizations.')
      : head('Welcome', '') + `<div class="card panel" style="max-width:620px"><h3 style="margin-top:0">Your account isn't connected to an organization yet</h3>
        <p>You're signed in as <b>${esc(S.user?.email || '')}</b>, but this email hasn't been added to any community or family account.</p>
        <ul style="line-height:1.7"><li><b>New to CommunityConnect?</b> <a href="index.html#start">Create an account</a> for your community or family.</li>
        <li><b>Joining an existing account?</b> Ask its admin to add this email under <b>Website Admins</b>, then sign in again.</li></ul>
        <p class="muted small">Questions? Email <a href="mailto:hello@nivolink.com">hello@nivolink.com</a>.</p></div>`;
    return;
  }
  T.q = T.sortKey === S.view ? T.q : '';
  if (S.view === 'overview') return overviewPage();
  if (S.view === 'settings') return settingsPage();
  if (S.view === 'send') return sendPage();
  if (S.view === 'polls') return pollsPage();
  if (S.view === 'repeating') return repeatingPage();
  if (S.view === 'registration') return registrationPage();
  if (S.view === 'credits') return creditsPage();
  if (S.view === 'samples') return samplesPage();
  if (S.view === 'pronunciation') return pronunciationPage();
  if (S.view === 'p_onetime') return onetimePage();
  if (S.view === 'p_costs') return costsPage();
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
  if (S.orgs.some(o => o.is_demo)) { const { data } = await sb.rpc('demo_number'); S.demoNumber = data || ''; }
  if (/^demo@nivolink\.com$/i.test(S.user.email || '')) $$('[data-setpw]').forEach(b => b.classList.add('hidden'));
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
document.addEventListener('click', e => {
  if (!e.target.closest('[data-hebpref]')) return;
  const cur = HEB_PREF(), d = dayUTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const f = modal('Hebrew dates', `<p style="margin-top:0">Show the Hebrew date next to dates on this website, and in the date picker:</p>
    <div class="groups-pick" style="flex-direction:column;align-items:stretch">${[['en', 'In English letters', hebDate(d, 'en')], ['he', 'In Hebrew (עברית)', hebDate(d, 'he')], ['off', "Don't show", '']].map(([v, l, ex]) =>
      `<label><input type="radio" name="hp" value="${v}" ${v === cur ? 'checked' : ''}> ${l}${ex ? ` <span class="muted small" ${v === 'he' ? 'dir="rtl"' : ''}>(today: ${esc(ex)})</span>` : ''}</label>`).join('')}</div>
    <p class="muted small">This is saved for you on this computer.</p>`, { onSave: form => { try { localStorage.setItem('cc_hebdates', form.hp.value); } catch {} toast('Saved'); render(); return true; } });
});

// ---------- date picker with a Hebrew calendar ----------
// Every <input type="date"> / <input type="datetime-local"> gets a 📅 button and the Hebrew date under it.
const GDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function inputDay(inp) { const v = inp.value; if (!v) return null; return asDayUTC(v.slice(0, 10)); }
function setInputDay(inp, d) {
  const iso = d.toISOString().slice(0, 10);
  inp.value = inp.type === 'datetime-local' ? iso + 'T' + (inp.value.slice(11, 16) || '10:00') : iso;
  inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
}
function enhanceDateInput(inp) {
  if (inp.dataset.heb || !JEW()) return; inp.dataset.heb = '1';
  const wrap = document.createElement('div'); wrap.className = 'dpwrap';
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn secondary sm dpbtn'; btn.title = 'Calendar (with Hebrew dates)'; btn.textContent = '📅';
  wrap.appendChild(btn);
  const line = document.createElement('div'); line.className = 'hebd dpline'; wrap.after(line);
  const upd = () => { const d = inputDay(inp); const t = d ? hebDate(d) : ''; line.textContent = t; line.dir = HEB_PREF() === 'he' ? 'rtl' : 'ltr'; };
  inp.addEventListener('input', upd); inp.addEventListener('change', upd); upd();
  btn.addEventListener('click', () => openCalendar(inp, btn));
}
function openCalendar(inp, anchorEl) {
  document.querySelector('.dpop')?.remove();
  const style = HEB_PREF() === 'off' ? 'en' : HEB_PREF();
  const now = new Date(), today = dayUTC(now.getFullYear(), now.getMonth(), now.getDate());
  let sel = inputDay(inp), cur = sel || today;
  let mode = (() => { try { return localStorage.getItem('cc_calmode') || 'greg'; } catch { return 'greg'; } })();
  const pop = document.createElement('div'); pop.className = 'dpop';
  document.body.appendChild(pop);
  const place = () => { const r = anchorEl.getBoundingClientRect(); const w = 330;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    const below = r.bottom + 6, h = pop.offsetHeight || 380;
    pop.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below) + 'px'; };
  const same = (a, b) => a && b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const addD = (d, n) => new Date(d.getTime() + n * 864e5);
  const hebMonthStart = d => { let x = d; while (hebParts(x).day > 1) x = addD(x, -1); return x; };
  function days() { // the days shown in the grid, plus a title
    if (mode === 'greg') {
      const y = cur.getUTCFullYear(), m = cur.getUTCMonth(), first = dayUTC(y, m, 1), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const list = Array.from({ length: n }, (_, i) => dayUTC(y, m, i + 1));
      const h1 = hebParts(list[0]), h2 = hebParts(list[n - 1]);
      return { list, lead: first.getUTCDay(), title: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        sub: h1.month === h2.month ? `${h1.month} ${h1.year}` : `${h1.month}${h1.year !== h2.year ? ' ' + h1.year : ''} – ${h2.month} ${h2.year}`, };
    }
    const start = hebMonthStart(cur), mon = hebParts(start).month, list = [];
    for (let x = start; hebParts(x).month === mon; x = addD(x, 1)) list.push(x);
    const g1 = list[0], g2 = list[list.length - 1];
    const gm = d => d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
    return { list, lead: start.getUTCDay(), title: style === 'he' ? `${HEB_MONTHS[mon] || mon} ${gematria(hebParts(start).year)}` : `${mon} ${hebParts(start).year}`,
      sub: `${gm(g1)} ${g1.getUTCDate()} – ${gm(g2)} ${g2.getUTCDate()}, ${g2.getUTCFullYear()}` };
  }
  function draw() {
    const { list, lead, title, sub } = days();
    pop.innerHTML = `<div class="dphead"><button type="button" class="btn ghost sm" data-nav="-1" aria-label="Previous month">‹</button>
        <div class="dptitle"><b ${mode === 'heb' && style === 'he' ? 'dir="rtl"' : ''}>${esc(title)}</b><span>${esc(sub)}</span></div>
        <button type="button" class="btn ghost sm" data-nav="1" aria-label="Next month">›</button></div>
      <div class="dptabs"><button type="button" data-mode="greg" class="${mode === 'greg' ? 'on' : ''}">Regular calendar</button><button type="button" data-mode="heb" class="${mode === 'heb' ? 'on' : ''}">Hebrew calendar</button></div>
      <div class="dpgrid">${GDAYS.map((d, i) => `<div class="dpdow ${i === 6 ? 'sh' : ''}">${d}</div>`).join('')}${'<div></div>'.repeat(lead)}${list.map(d => {
        const big = mode === 'greg' ? d.getUTCDate() : hebDay(d, style), small = mode === 'greg' ? hebDay(d, style) : d.getUTCDate();
        return `<button type="button" class="dpday ${same(d, today) ? 'today' : ''} ${same(d, sel) ? 'sel' : ''} ${d.getUTCDay() === 6 ? 'sh' : ''}" data-d="${d.toISOString().slice(0, 10)}"><b>${esc(big)}</b><small>${esc(small)}</small></button>`; }).join('')}</div>
      <div class="dpfoot"><button type="button" class="btn ghost sm" data-today>Today</button><span class="muted small" ${style === 'he' ? 'dir="rtl"' : ''}>${esc(hebDate(sel || today))}</span><button type="button" class="btn ghost sm" data-x>Close</button></div>`;
    place();
  }
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]'), md = e.target.closest('[data-mode]'), day = e.target.closest('[data-d]');
    if (nav) {
      const dir = +nav.dataset.nav;
      if (mode === 'greg') cur = dayUTC(cur.getUTCFullYear(), cur.getUTCMonth() + dir, 1);
      else { const s = hebMonthStart(cur); cur = dir > 0 ? addD(s, 31) : addD(s, -2); cur = hebMonthStart(cur); }
      draw();
    } else if (md) { mode = md.dataset.mode; try { localStorage.setItem('cc_calmode', mode); } catch {} draw(); }
    else if (day) { const [y, m, d] = day.dataset.d.split('-').map(Number); setInputDay(inp, dayUTC(y, m - 1, d)); pop.remove(); }
    else if (e.target.closest('[data-today]')) { cur = today; sel = sel; draw(); }
    else if (e.target.closest('[data-x]')) pop.remove();
  });
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
  draw();
}
new MutationObserver(() => $$('input[type=date]:not([data-heb]),input[type=datetime-local]:not([data-heb])').forEach(enhanceDateInput))
  .observe(document.body, { childList: true, subtree: true });
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
