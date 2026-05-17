/**
 * VAPEX Control Center — Dashboard JS
 * Professional Edition  ·  All options wired
 */

'use strict';

/* ─── Config ─── */
const API             = '/api/v1';
const DEMO_EMAIL      = 'ahmed@vapex.app';
const DEMO_PASSWORD   = 'vapex123';
const DAILY_NIC_LIMIT = 5;          // mg
const DEFAULT_LIMIT   = 200;        // puffs
const RING_CIRC       = 289;        // 2π×46 ≈ 289

const FLAVOR_PRESETS = [
  { name: 'Mint Ice',        blend: '70/30', nicotineStrength: 3,  totalCapacity: 30, icon: 'mint'    },
  { name: 'Blueberry Frost', blend: '70/30', nicotineStrength: 3,  totalCapacity: 30, icon: 'berry'   },
  { name: 'Mango Chill',     blend: '60/40', nicotineStrength: 2,  totalCapacity: 30, icon: 'mango'   },
  { name: 'Vanilla Cream',   blend: '50/50', nicotineStrength: 6,  totalCapacity: 30, icon: 'cream'   },
  { name: 'Watermelon Wave', blend: '80/20', nicotineStrength: 3,  totalCapacity: 50, icon: 'melon'   },
  { name: 'Classic Tobacco', blend: '50/50', nicotineStrength: 12, totalCapacity: 30, icon: 'classic' },
];

/* ─── State ─── */
let token         = '';
let deviceId      = '';
let userData      = null;
let puffLimit     = parseInt(localStorage.getItem('vx_limit') || '0', 10) || DEFAULT_LIMIT;
let pollTimer     = null;
let activeTab     = 'home';

/* ─── DOM helpers ─── */
const $      = id  => document.getElementById(id);
const qs     = sel => document.querySelector(sel);
const qsa    = sel => document.querySelectorAll(sel);

function setText(id, val) { const el = $(id); if (el) el.textContent = val; }
function setWidth(id, pct) {
  const el = $(id);
  if (el) el.style.width = `${clamp(pct, 0, 100)}%`;
}
function setRing(pathId, pct) {
  const el = $(pathId);
  if (!el) return;
  const offset = RING_CIRC - (RING_CIRC * clamp(pct, 0, 100)) / 100;
  el.style.strokeDashoffset = offset;
}
function clamp(v, lo, hi) { return Math.min(Math.max(Number(v) || 0, lo), hi); }
function fmt(v, d = 0)    { return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }

/* ─── Toast ─── */
let toastTimer;
function toast(msg, type = '') {
  const el = $('vxToast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.className   = type ? `show ${type}` : 'show';
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

/* ─── Offline Banner ─── */
function showBanner(msg) {
  const b = $('connBanner');
  if (!b) return;
  $('bannerMsg').textContent = msg;
  b.removeAttribute('hidden');
}
function hideBanner() {
  const b = $('connBanner');
  if (b) b.setAttribute('hidden', '');
}

/* ─── Connection indicator ─── */
function setConn(state /* 'live' | 'err' | 'idle' */, label = '') {
  const dot   = $('connDot');
  const lbl   = $('connLabel');
  if (!dot) return;
  dot.className = `conn-dot${state ? ' ' + state : ''}`;
  if (lbl) lbl.textContent = label || (state === 'live' ? 'Online' : state === 'err' ? 'Offline' : '–');
}

/* ─── HTTP helper ─── */
async function api(path, opts = {}) {
  try {
    const res  = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, status: res.status, code: data.code, error: data.error || data.message || `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return { success: false, code: 'NETWORK', error: err.message || 'Network error' };
  }
}

/* ════════════════════════════════
   AUTH
════════════════════════════════ */
async function boot() {
  const stored = localStorage.getItem('vx_token');
  if (stored) {
    token      = stored;
    const me   = await api('/auth/me');
    if (me.success && me.user) { userData = me.user; return startDashboard(); }
    localStorage.removeItem('vx_token');
    token = '';
  }

  const res = await fetch(`${API}/auth/login`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  }).then(r => r.json().then(d => ({ ok: r.ok, d }))).catch(() => null);

  if (!res?.ok || !res.d?.token) {
    setConn('err', 'Offline');
    showBanner('Cannot reach server — start MongoDB, run npm run seed, then refresh.');
    offlineUI();
    return;
  }

  token    = res.d.token;
  userData = res.d.user;
  localStorage.setItem('vx_token', token);
  return startDashboard();
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  localStorage.removeItem('vx_token');
  localStorage.removeItem('vx_limit');
  token = '';
  userData = null;
  deviceId = '';
  clearInterval(pollTimer);
  toast('Signed out', 'ok');
  setTimeout(() => boot(), 800);
}

function offlineUI() {
  setText('dname', 'VAPEX Device');
  setText('deviceStatus', 'Server offline');
  setText('puffNumber', '0');
  setText('fn', 'No server connection');
  setText('fm', 'Dashboard is ready — API must be running.');
  setWidth('bf', 48); setText('bt', '48%'); setText('bp', '48%');
  setWidth('pf', 0);
  updateLimitUI(0);
  $('statusLed')?.classList.remove('online');
  setConn('err', 'Offline');
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
async function startDashboard() {
  hideBanner();
  setConn('live', 'Online');

  const devices = await ensureDevice();
  if (!devices.length) {
    toast('No device — API running but could not create demo device.', 'err');
    return;
  }
  const dev = devices[0];
  deviceId  = dev.id || dev._id;
  hydrateDevice(dev);
  await ensureFlavors();

  await Promise.all([
    refreshHome(),
    refreshAnalytics(),
    refreshGoals(),
    refreshFind(),
    refreshSettings(),
    refreshSmartMode(),
  ]);

  if (!pollTimer) {
    pollTimer = setInterval(() => { if (token) refreshHome(); }, 30_000);
  }
}

async function ensureDevice() {
  const r = await api('/devices');
  if (!r.success) { toast(r.error || 'Could not load devices.', 'err'); return []; }
  if (r.devices?.length) return r.devices;

  const c = await api('/devices', {
    method: 'POST',
    body  : JSON.stringify({ name: 'VAPEX Pulse Pro', serialNumber: `DEMO-${Date.now().toString(36).toUpperCase()}`, model: 'Pulse Pro' }),
  });
  if (!c.success) { toast('Could not create device.', 'err'); return []; }
  const r2 = await api('/devices');
  return r2.devices || [];
}

async function ensureFlavors() {
  if (!deviceId) return;
  const list = await api('/flavors');
  const existing = list.success ? (list.flavors || []) : [];
  const names    = new Set(existing.map(f => f.name));

  await Promise.all(
    FLAVOR_PRESETS
      .filter(p => !names.has(p.name))
      .map(p => api('/flavors', { method: 'POST', body: JSON.stringify({ ...p, deviceId }) }))
  );

  const active = await api('/flavors/active');
  if (active.success && active.hasActiveFlavor) return;

  const fresh = await api('/flavors');
  const first  = fresh.success ? fresh.flavors?.[0] : existing[0];
  if (first) await api(`/flavors/${first.id || first._id}/activate`, { method: 'PATCH' });
}

/* ════════════════════════════════
   DEVICE HYDRATION
════════════════════════════════ */
function hydrateDevice(dev) {
  const bat = clamp(dev.batteryLevel ?? 0, 0, 100);
  setWidth('bf', bat);
  setText('bt', `${bat}%`);
  setText('bp', `${bat}%`);
  setText('dname', dev.name || 'VAPEX Device');

  const statusText = dev.status === 'online' ? `Online · ${dev.estimatedBatteryLife || '--'}` : dev.status || 'Offline';
  setText('deviceStatus', statusText);
  const led = $('statusLed');
  if (led) led.className = `status-led${dev.status === 'online' ? ' online' : ''}`;

  const mode = (dev.currentMode || 'eco').slice(0, 4).toUpperCase();
  setText('modeBadge', mode);

  puffLimit = Number(dev.settings?.puffLimit) || puffLimit || DEFAULT_LIMIT;
  localStorage.setItem('vx_limit', String(puffLimit));
  updateLimitUI();
}

function updateLimitUI(used = null) {
  setText('limitTitle', `${puffLimit} puffs/day`);
  const inp = $('puffLimitInput');
  if (inp) inp.value = puffLimit;
  if (used !== null) {
    setText('limitStatus', `${used} / ${puffLimit}`);
    setWidth('limitFill', (used / puffLimit) * 100);
  }
}

/* ════════════════════════════════
   HOME REFRESH
════════════════════════════════ */
async function refreshHome() {
  if (!deviceId) return;
  const [puffs, flavor, coil, liquid, devices, nic] = await Promise.all([
    api('/puffs/today'),
    api('/flavors/active'),
    api(`/coils/device/${deviceId}/active`),
    api('/liquids/overview'),
    api('/devices'),
    api('/analytics/nicotine'),
  ]);

  if (devices.success && devices.devices?.[0]) hydrateDevice(devices.devices[0]);

  /* Puffs */
  if (puffs.success) {
    const s    = puffs.stats || {};
    const tot  = Number(s.totalPuffs || 0);
    const nic_ = Number(s.totalNicotine || 0);
    setText('puffNumber', fmt(tot));
    setText('sh',  `${fmt((s.totalDuration || 0) / 3600, 1)}h`);
    setText('nm',  `${fmt(nic_, 1)}mg`);
    setText('nicVal', fmt(nic_, 1));
    setText('nicDay', `${fmt(nic_, 1)}mg`);
    setText('liqDay', `${fmt(s.totalLiquid || 0, 1)}ml`);
    setWidth('pf',  (tot / puffLimit) * 100);
    setRing('nicRingPath', (nic_ / DAILY_NIC_LIMIT) * 100);
    updateLimitUI(tot);
  }

  /* Nicotine analytics */
  if (nic.success && nic.data) {
    setText('nicWeek',  `${nic.data.week}mg`);
    setText('nicMonth', `${nic.data.month}mg`);
  }

  /* Flavor */
  if (flavor.success && flavor.hasActiveFlavor && flavor.flavor) {
    const f   = flavor.flavor;
    const rem = f.remaining == null ? '--' : fmt(f.remaining, 1);
    setText('fn', f.name || 'Active liquid');
    setText('fm', `${f.blend || '--'} · ${f.nicotineStrength ?? 0}mg/ml · ${rem}ml left`);
  } else if (flavor.success) {
    setText('fn', 'No active liquid');
    setText('fm', 'Tap Change to pick a bottle.');
  } else {
    setText('fn', 'Liquid unavailable');
    setText('fm', flavor.error || 'Request failed');
  }

  /* Coil */
  if (coil.success && coil.hasCoil && coil.coil) {
    const c    = coil.coil;
    const life = clamp(c.lifePercentage, 0, 100);
    setText('coilVal',   `${life}%`);
    setText('coilPuffs', `${fmt(c.totalPuffs || 0)} / ${fmt(c.maxPuffs || 0)}`);
    setText('coilDays',  c.daysRemaining ?? '--');
    setText('coilType',  c.type ? c.type.replaceAll('_', ' ') : '--');
    setRing('coilRingPath', life);
    setText('coilEstWarn', c.daysRemaining ?? '--');
    const warn  = life <= 30;
    const cw    = $('coilWarn');
    const cb    = $('coilBadge');
    if (cw) warn ? cw.removeAttribute('hidden') : cw.setAttribute('hidden', '');
    if (cb) warn ? cb.removeAttribute('hidden') : cb.setAttribute('hidden', '');
    // Update ring stroke class based on life
    const rf = $('coilRingPath');
    if (rf) {
      rf.className = `rf ${life > 30 ? 'accent-stroke' : 'warn-stroke'}`;
    }
  } else {
    ['coilVal','coilPuffs','coilDays','coilType'].forEach(id => setText(id, '--'));
    setRing('coilRingPath', 0);
    $('coilWarn')?.setAttribute('hidden', '');
    $('coilBadge')?.setAttribute('hidden', '');
  }

  /* Liquid */
  if (liquid.success) {
    setText('liqWeek', `${liquid.consumption?.week || '0.0'}ml`);
    if (liquid.activeFlavor) {
      setText('liqRem', `${liquid.activeFlavor.remaining}ml`);
      setText('liqPct', `${liquid.activeFlavor.percentage}%`);
      setWidth('liqFill', liquid.activeFlavor.percentage);
    } else {
      setText('liqRem', '--');
      setText('liqPct', '--%');
      setWidth('liqFill', 0);
    }
  }
}

/* ════════════════════════════════
   ANALYTICS
════════════════════════════════ */
async function refreshAnalytics() {
  const [weekly, battery] = await Promise.all([
    api('/analytics/weekly'),
    api('/analytics/battery'),
  ]);

  if (weekly.success && weekly.data?.chart?.length) {
    const chart = weekly.data.chart;
    const max   = Math.max(1, ...chart.map(d => d.puffs || 0));
    const bars  = $('bars');
    if (bars) {
      bars.innerHTML = chart.map(d => `
        <div class="bitem">
          <div class="bar${d.isToday ? ' on' : ''}" style="height:${Math.max(4, (( d.puffs || 0) / max) * 100)}%" title="${d.puffs || 0} puffs"></div>
          <span class="bl">${d.day}</span>
        </div>
      `).join('');
    }
    const s = weekly.data.summary;
    setText('tp', s.today);
    setText('da', s.average);
    setText('wt', s.total);
    const trendEl = $('trendLabel');
    if (trendEl) {
      trendEl.textContent = s.trend === 'up' ? '↑ Above avg' : '↓ Below avg';
      trendEl.className   = `mode-chip${s.trend === 'up' ? ' warn' : ''}`;
    }
  }

  if (battery.success && battery.analytics?.[0]) {
    setText('baCycles', battery.analytics[0].chargeCycles ?? 0);
  }
}

/* ════════════════════════════════
   GOALS
════════════════════════════════ */
async function refreshGoals() {
  const [goal, limit] = await Promise.all([
    api('/goals/nicotine-reduction/active'),
    api('/goals/puff-limit/status'),
  ]);

  if (goal.success && goal.hasGoal && goal.goal) {
    const g  = goal.goal;
    const pc = g.progress || 0;
    setText('goalTitle',   `${g.currentValue}mg  →  ${g.targetValue}mg`);
    setText('goalCurrent', `${g.currentValue}mg`);
    setText('goalDays',    g.daysActive || 0);
    setText('goalSaved',   `${g.amountChanged || 0}mg`);
    setText('goalNext',    `Next step: ${Math.max(g.targetValue, g.currentValue - 2)}mg`);
    setWidth('goalFill', pc);
    const pctEl = $('goalPct');
    if (pctEl) pctEl.textContent = `${Math.round(pc)}%`;
    const gs = $('goalStatus');
    if (gs) {
      gs.textContent = g.isOnTrack ? 'On track' : 'Off track';
      gs.className   = `mode-chip${g.isOnTrack ? '' : ' warn'}`;
    }
  } else {
    setText('goalTitle', 'No active plan');
    setText('goalNext',  'Set a goal from the API to start tracking.');
  }

  if (limit.success && limit.limit) {
    const l   = limit.limit;
    puffLimit = Number(l.total) || puffLimit;
    localStorage.setItem('vx_limit', String(puffLimit));
    updateLimitUI(l.used);
    setText('limitStatus', `${l.used} / ${l.total}`);
    setWidth('limitFill', l.percentage || 0);
  }
}

/* ════════════════════════════════
   FIND
════════════════════════════════ */
async function refreshFind() {
  if (!deviceId) return;
  const r = await api(`/find/${deviceId}/location`);
  if (!r.success || !r.device) {
    setText('findStatus', r.error || 'Location unavailable.');
    return;
  }
  const place = r.device.currentLocation?.name || 'Unknown location';
  setText('findStatus', `Last seen: ${r.device.timeAgo || 'Unknown'} — ${place}`);
}

async function ringDevice() {
  if (!deviceId) return;
  const btn = $('ringDeviceBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ringing…'; }
  const r  = await api(`/find/${deviceId}/ring`, { method: 'POST' });
  const st = $('ringStatus');
  if (st) {
    st.textContent = r.success ? 'Ring command sent to device.' : (r.error || 'Could not ring device.');
    st.removeAttribute('hidden');
    setTimeout(() => st.setAttribute('hidden', ''), 4000);
  }
  if (r.success) toast('Ring sent!', 'ok'); else toast(r.error || 'Ring failed', 'err');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> Ring device`;
  }
}

/* ════════════════════════════════
   SETTINGS / PROFILE
════════════════════════════════ */
async function refreshSettings() {
  const r = await api('/auth/me');
  if (!r.success || !r.user) return;
  userData = r.user;
  const name = r.user.name || 'VAPEX User';
  setText('pname', name);
  setText('pmeta', r.user.memberSince
    ? `Member since ${new Date(r.user.memberSince).toLocaleString(undefined, { month: 'long', year: 'numeric' })}`
    : 'Member profile');
  setText('ava', name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  setText('cloudStatus',
    r.user.cloudSync?.lastSync
      ? `Last sync: ${new Date(r.user.cloudSync.lastSync).toLocaleString()}`
      : 'Last sync: never');

  const prefs = r.user.preferences || {};
  const prefMap = { notif: 'notifications', lock: 'childLock', health: 'healthMode' };
  qsa('[data-toggle]').forEach(row => {
    const sw = row.querySelector('.toggle-sw');
    if (!sw) return;
    const on = !!prefs[prefMap[row.dataset.toggle]];
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

async function togglePref(row) {
  const sw   = row.querySelector('.toggle-sw');
  if (!sw) return;
  const was  = sw.classList.contains('on');
  sw.classList.toggle('on', !was);
  sw.setAttribute('aria-checked', (!was).toString());
  const prefMap = { notif: 'notifications', lock: 'childLock', health: 'healthMode' };
  const r = await api('/settings/preferences', {
    method: 'PATCH',
    body  : JSON.stringify({ [prefMap[row.dataset.toggle]]: !was }),
  });
  if (!r.success) {
    sw.classList.toggle('on', was);
    sw.setAttribute('aria-checked', was.toString());
    toast(r.error || 'Could not update setting.', 'err');
  } else {
    toast(!was ? 'Enabled' : 'Disabled', 'ok');
  }
}

async function syncCloud() {
  const btn = $('syncCloudBtn');
  if (btn) { btn.disabled = true; btn.querySelector('svg')?.classList.add('spin'); }
  setText('cloudStatus', 'Syncing…');
  const r = await api('/cloud/sync', { method: 'POST' });
  setText('cloudStatus', r.success ? `Last sync: ${new Date().toLocaleString()}` : (r.error || 'Sync failed'));
  if (r.success) toast('Cloud sync complete', 'ok'); else toast(r.error || 'Sync failed', 'err');
  if (btn) { btn.disabled = false; btn.querySelector('svg')?.classList.remove('spin'); }
}

/* ════════════════════════════════
   SMART MODES
════════════════════════════════ */
async function refreshSmartMode() {
  if (!deviceId) return;
  const r = await api(`/smart-modes/${deviceId}/current`);
  if (r.success && r.currentMode?.id) setActiveMode(r.currentMode.id);
}

function setActiveMode(mode) {
  qsa('[data-mode]').forEach(card => {
    const on = card.dataset.mode === mode;
    card.classList.toggle('active', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  setText('modeBadge', mode.slice(0, 4).toUpperCase());
}

async function setMode(mode) {
  if (!deviceId) return;
  // Optimistic UI
  setActiveMode(mode);
  const r = await api(`/smart-modes/${deviceId}/set`, {
    method: 'POST',
    body  : JSON.stringify({ mode }),
  });
  if (!r.success) {
    toast(r.error || 'Could not change mode.', 'err');
    refreshSmartMode(); // Revert
    return;
  }
  toast(`Mode: ${mode}`, 'ok');
  refreshHome();
}

/* ════════════════════════════════
   PUFF ACTIONS
════════════════════════════════ */
async function recordPuff() {
  if (!deviceId) return;
  const btn = $('pc');
  if (btn) btn.style.pointerEvents = 'none';
  const r = await api('/puffs', {
    method: 'POST',
    body  : JSON.stringify({ deviceId, duration: 2, power: 20 }),
  });
  if (!r.success) toast(r.error || 'Could not record puff.', 'err');
  await refreshHome();
  if (btn) btn.style.pointerEvents = '';
}

async function resetPuffs() {
  const btn = $('resetPuffsBtn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const r = await api('/puffs/today', { method: 'DELETE' });
  if (!r.success) toast(r.error || 'Could not reset puffs.', 'err');
  await Promise.all([refreshHome(), refreshAnalytics(), refreshGoals()]);
  if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
}

/* ════════════════════════════════
   FLAVOR
════════════════════════════════ */
async function changeFlavor() {
  setText('fn', 'Switching…');
  setText('fm', 'Loading bottles…');
  const list = await api('/flavors');
  if (!list.success || !list.flavors?.length) {
    await ensureFlavors();
    return refreshHome();
  }
  const flavors  = list.flavors;
  const cur      = flavors.findIndex(f => f.isActive);
  const next     = flavors[(cur + 1) % flavors.length];
  const r        = await api(`/flavors/${next.id || next._id}/activate`, { method: 'PATCH' });
  if (!r.success) {
    setText('fn', 'Could not switch');
    setText('fm', r.error || 'Activation failed');
    toast(r.error || 'Activation failed', 'err');
    return;
  }
  toast(`Now: ${next.name}`, 'ok');
  refreshHome();
}

/* ════════════════════════════════
   PUFF LIMIT
════════════════════════════════ */
async function savePuffLimit() {
  if (!deviceId) return;
  const inp  = $('puffLimitInput');
  const next = clamp(inp?.value, 50, 1000);
  const r    = await api(`/settings/device/${deviceId}`, {
    method: 'PATCH',
    body  : JSON.stringify({ puffLimit: next }),
  });
  if (!r.success) { toast(r.error || 'Could not save limit.', 'err'); return; }
  puffLimit = next;
  localStorage.setItem('vx_limit', String(puffLimit));
  updateLimitUI();
  toast('Limit saved', 'ok');
  refreshGoals();
}

/* ════════════════════════════════
   TAB NAVIGATION
════════════════════════════════ */
function switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;

  qsa('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  qsa('.nav-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  if (tab === 'analytics') refreshAnalytics();
  if (tab === 'goals')     refreshGoals();
  if (tab === 'find')      refreshFind();
  if (tab === 'settings')  refreshSettings();
  if (tab === 'smart')     refreshSmartMode();
}

/* ════════════════════════════════
   WEBSOCKET (real-time updates)
════════════════════════════════ */
function initSocket() {
  if (typeof io === 'undefined') return;
  try {
    const socket = io({ auth: { token } });
    socket.on('connect', () => setConn('live', 'Live'));
    socket.on('disconnect', () => setConn('err', 'Reconnecting…'));
    socket.on('puff:new',   () => { if (activeTab === 'home') refreshHome(); });
    socket.on('puff:reset', () => { if (activeTab === 'home') refreshHome(); });
    socket.on('settings:updated', data => {
      if (data?.preferences) {
        const prefMap = { notif: 'notifications', lock: 'childLock', health: 'healthMode' };
        qsa('[data-toggle]').forEach(row => {
          const sw = row.querySelector('.toggle-sw');
          if (!sw) return;
          const on = !!data.preferences[prefMap[row.dataset.toggle]];
          sw.classList.toggle('on', on);
          sw.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      }
    });
  } catch (_) {}
}

/* ════════════════════════════════
   EVENT BINDING
════════════════════════════════ */
function bindEvents() {
  /* Navigation */
  qsa('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  /* Home actions */
  $('pc')?.addEventListener('click', recordPuff);
  $('resetPuffsBtn')?.addEventListener('click', resetPuffs);
  $('changeFlavorBtn')?.addEventListener('click', changeFlavor);

  /* Smart modes */
  qsa('[data-mode]').forEach(card => card.addEventListener('click', () => setMode(card.dataset.mode)));

  /* Goals */
  $('savePuffLimitBtn')?.addEventListener('click', savePuffLimit);

  /* Find */
  $('ringDeviceBtn')?.addEventListener('click', ringDevice);

  /* Settings */
  $('syncCloudBtn')?.addEventListener('click', syncCloud);
  qsa('[data-toggle]').forEach(row => row.addEventListener('click', () => togglePref(row)));
  $('logoutBtn')?.addEventListener('click', logout);

  /* Banner close */
  $('bannerClose')?.addEventListener('click', hideBanner);

  /* Puff limit — save on Enter */
  $('puffLimitInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') savePuffLimit();
  });

  /* Keyboard nav */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const tabs = ['home', 'analytics', 'smart', 'goals', 'find', 'settings'];
    const idx  = tabs.indexOf(activeTab);
    if (e.key === 'ArrowRight' && idx < tabs.length - 1) switchTab(tabs[idx + 1]);
    if (e.key === 'ArrowLeft'  && idx > 0)               switchTab(tabs[idx - 1]);
  });
}

/* ════════════════════════════════
   BOOT
════════════════════════════════ */
bindEvents();
initSocket();
boot();
