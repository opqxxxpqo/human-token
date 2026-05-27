// Main dashboard — three tabs + settings.

const { event, core } = window.__TAURI__ || {};

// ─── tab switching ─────────────────────────────────────────
const tabs = document.querySelectorAll('.tab');
const panels = {
  dash: document.getElementById('panel-dash'),
  timeline: document.getElementById('panel-timeline'),
  week: document.getElementById('panel-week'),
  settings: document.getElementById('panel-settings'),
};
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.toggle('active', x === t));
  Object.entries(panels).forEach(([k, p]) => p.classList.toggle('visible', k === t.dataset.tab));
  if (t.dataset.tab === 'timeline') refreshTimeline();
  if (t.dataset.tab === 'week') refreshWeekly();
  if (t.dataset.tab === 'settings') refreshSettings();
}));

// ─── clock ─────────────────────────────────────────────────
function tickClock() {
  const n = new Date();
  document.getElementById('live-time').textContent = n.toTimeString().slice(0, 8);
  document.getElementById('dash-date').textContent =
    n.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' });
}
setInterval(tickClock, 1000); tickClock();

// ─── helpers ───────────────────────────────────────────────
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toLocaleString();
}
function bar20(pct) {
  const filled = Math.round(Math.min(100, pct) / 5);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}
function ratePips(rate) {
  // map 0..16 t/s to 0..20 pips
  const p = Math.min(20, Math.round(rate * 1.25));
  return '▰'.repeat(p) + '▱'.repeat(20 - p);
}

// ─── dashboard live update ─────────────────────────────────
function renderSnap(snap) {
  document.getElementById('s-session').textContent = fmtTokens(snap.session_tokens);
  document.getElementById('s-session-pct').textContent = `${snap.pct_used.toFixed(1)}% of cap`;
  document.getElementById('s-today').textContent = fmtTokens(snap.today_tokens);
  document.getElementById('s-keys').textContent = snap.keystrokes.toLocaleString();
  document.getElementById('s-clicks').textContent = `${snap.clicks.toLocaleString()} clicks · ${fmtTokens(snap.mouse_px)} px`;
  document.getElementById('s-state').textContent = snap.state.toUpperCase();
  document.getElementById('s-gerund').textContent = snap.paused ? 'paused · rest mode' : snap.status_word;
  document.getElementById('s-gerund').className =
    'stat-delta ' + (snap.state === 'cooldown' ? 'down' : (snap.paused || snap.state === 'idle') ? 'dim' : '');

  document.getElementById('r-rate').textContent = snap.rate_per_sec.toFixed(1);
  document.getElementById('r-bar').textContent = ratePips(snap.rate_per_sec);
  document.getElementById('r-cap').textContent = Math.round(snap.cap).toLocaleString();
  document.getElementById('r-used').textContent = fmtTokens(snap.session_tokens);
  document.getElementById('r-pct').textContent = snap.pct_used.toFixed(1) + '%';
  document.getElementById('r-pct').className = snap.pct_used >= 80 ? 'warn' : 'green';
}

if (event) event.listen('activity-tick', e => renderSnap(e.payload));
if (core)  core.invoke('get_widget_snapshot').then(renderSnap).catch(console.error);

// ─── stop / pause controls ──────────────────────────────────
const $stop = document.getElementById('dash-stop');
const $pause = document.getElementById('dash-pause');
const $pauseIcon = document.getElementById('dash-pause-icon');
const $pauseLabel = document.getElementById('dash-pause-label');

function flashBtn($btn, msg) {
  const old = $btn.querySelector('span:last-child').textContent;
  $btn.querySelector('span:last-child').textContent = msg;
  $btn.classList.add('toast');
  setTimeout(() => {
    $btn.querySelector('span:last-child').textContent = old;
    $btn.classList.remove('toast');
  }, 1200);
}

if ($stop) {
  $stop.addEventListener('click', async () => {
    if (!core) return;
    try {
      await core.invoke('reset_session');
      flashBtn($stop, 'stopped');
      const snap = await core.invoke('get_widget_snapshot');
      renderSnap(snap);
    } catch (e) { console.error(e); }
  });
}
if ($pause) {
  $pause.addEventListener('click', async () => {
    if (!core) return;
    try {
      const paused = await core.invoke('toggle_pause');
      $pauseIcon.textContent = paused ? '▶' : '⏸';
      $pauseLabel.textContent = paused ? 'resume' : 'pause';
    } catch (e) { console.error(e); }
  });
}
function syncPauseBtn(snap) {
  if (!$pauseIcon) return;
  $pauseIcon.textContent = snap.paused ? '▶' : '⏸';
  $pauseLabel.textContent = snap.paused ? 'resume' : 'pause';
}
if (event) event.listen('activity-tick', e => syncPauseBtn(e.payload));

// ─── timeline ──────────────────────────────────────────────
async function refreshTimeline() {
  if (!core) return;
  const { day } = await core.invoke('get_today');
  const buckets = day.buckets || new Array(96).fill(0);

  // Aggregate 4 × 15min buckets into hourly rows for readability.
  const hours = [];
  for (let h = 0; h < 24; h++) {
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += buckets[h * 4 + i] || 0;
    hours.push({ h, sum });
  }
  const peak = Math.max(1, ...hours.map(x => x.sum));

  const tlEl = document.getElementById('timeline');
  tlEl.innerHTML = '';
  // Only show hours from first non-zero hour up to current.
  const now = new Date();
  const currentHour = now.getHours();
  const firstActive = hours.findIndex(x => x.sum > 0);
  const startHour = firstActive < 0 ? Math.max(0, currentHour - 6) : firstActive;

  for (let h = startHour; h <= currentHour; h++) {
    const sum = hours[h].sum;
    const pct = Math.round((sum / peak) * 100);
    const cls = pct > 75 ? 'high' : pct > 40 ? 'mid' : pct > 10 ? 'low' : 'idle';
    const lbl = pct > 75 ? '冲刺' : pct > 40 ? '专注' : pct > 10 ? '缓慢' : '休息';
    tlEl.insertAdjacentHTML('beforeend', `
      <div class="tl-row">
        <span class="tl-time">${String(h).padStart(2, '0')}:00</span>
        <div class="tl-track"><div class="tl-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="tl-label">${lbl}</span>
      </div>
    `);
  }

  // Peak summary
  const peakHour = hours.reduce((a, b) => b.sum > a.sum ? b : a, { h: 0, sum: 0 });
  const $peaks = document.getElementById('peaks');
  if (peakHour.sum > 0) {
    $peaks.innerHTML = `
      <div class="log-line"><span class="log-time">peak</span><span class="log-msg">最高强度时段 <span class="hi">${String(peakHour.h).padStart(2,'0')}:00</span> · 消耗 <span class="green">${fmtTokens(peakHour.sum)}</span> tokens</span></div>
      <div class="log-line"><span class="log-time">total</span><span class="log-msg">today total <span class="hi">${fmtTokens(day.total_tokens)}</span> · ${day.keystrokes.toLocaleString()} keys · ${day.clicks.toLocaleString()} clicks</span></div>
    `;
  }
}

// ─── weekly · 24h curves (battery-style) ───────────────────
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// Aggregate 96 × 15min buckets → 24 hourly values for plotting.
function bucketsToHourly(buckets) {
  const arr = new Array(24).fill(0);
  if (!buckets || !buckets.length) return arr;
  for (let h = 0; h < 24; h++) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += buckets[h * 4 + i] || 0;
    arr[h] = s;
  }
  return arr;
}

// Smoothed Catmull-Rom style path through (24+1) points: 0..24.
// peakY: scaling reference so all sparklines/focus share the same scale.
function buildCurvePath(hourly, w, h, peakY) {
  if (!hourly.length) return { line: '', fill: '' };
  const peak = Math.max(peakY, 1);
  const stepX = w / 24;
  const yOf = (v) => h - (Math.min(1, v / peak)) * (h - 4) - 2;
  const pts = hourly.map((v, i) => [i * stepX, yOf(v)]);
  // Anchor at midnight start and end so the curve closes flush with the axis.
  pts.unshift([0, h]);
  pts.push([24 * stepX, h]);

  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    line += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const fill = line + ` L ${w} ${h} L 0 ${h} Z`;
  return { line, fill };
}

let weeklyState = { cols: [], focusedIdx: null, globalPeakHourly: 1 };

async function refreshWeekly() {
  if (!core) return;
  const days = await core.invoke('get_weekly');
  const todayStr = new Date().toISOString().slice(0, 10);
  const map = new Map(days.map(d => [d.date, d]));
  const cols = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const ds = d.toISOString().slice(0, 10);
    const log = map.get(ds);
    const dow = (d.getDay() + 6) % 7;
    const hourly = bucketsToHourly(log ? log.buckets : null);
    cols.push({
      date: ds,
      label: DAY_LABELS_EN[dow],
      labelZh: DAY_LABELS_ZH[dow],
      total: log ? log.total_tokens : 0,
      hourly,
      today: ds === todayStr,
      isFuture: false,
    });
  }
  const globalPeakHourly = Math.max(1, ...cols.flatMap(c => c.hourly));
  weeklyState.cols = cols;
  weeklyState.globalPeakHourly = globalPeakHourly;
  // Default focus: today.
  const todayIdx = cols.findIndex(c => c.today);
  weeklyState.focusedIdx = todayIdx >= 0 ? todayIdx : cols.length - 1;

  renderMiniCards();
  renderFocusCurve();
  renderInsight();
}

function renderMiniCards() {
  const grid = document.getElementById('week-mini');
  const { cols, focusedIdx, globalPeakHourly } = weeklyState;
  grid.innerHTML = cols.map((c, i) => {
    const w = 100, h = 28;
    const { line, fill } = buildCurvePath(c.hourly, w, h, globalPeakHourly);
    const cls = [
      'day-card',
      c.today ? 'today' : '',
      i === focusedIdx ? 'focused' : '',
      c.total === 0 ? 'empty' : '',
    ].filter(Boolean).join(' ');
    const dateShort = c.date.slice(5);
    return `
      <div class="${cls}" data-i="${i}">
        <div class="day-card-head">
          <span class="dlabel">${c.label}</span>
          <span>${dateShort}</span>
        </div>
        <div class="day-card-total">${fmtTokens(c.total)}</div>
        <svg class="day-card-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <path class="sfill" d="${fill}"/>
          <path class="sline" d="${line}"/>
        </svg>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.day-card').forEach(el => {
    el.addEventListener('click', () => {
      weeklyState.focusedIdx = parseInt(el.dataset.i, 10);
      renderMiniCards();
      renderFocusCurve();
    });
  });
}

function renderFocusCurve() {
  const { cols, focusedIdx, globalPeakHourly } = weeklyState;
  const c = cols[focusedIdx];
  if (!c) return;
  const svg = document.getElementById('focus-curve');
  const W = 600, H = 130;
  const { line, fill } = buildCurvePath(c.hourly, W, H, globalPeakHourly);
  // Vertical grid every 6 hours.
  const gridLines = [6, 12, 18].map(h => {
    const x = (h / 24) * W;
    return `<line class="curve-grid" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  }).join('');
  // "Now" marker for today.
  let nowMarker = '';
  if (c.today) {
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const x = (nowH / 24) * W;
    nowMarker = `<line class="curve-now" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  }
  svg.innerHTML = `
    ${gridLines}
    <path class="curve-fill" d="${fill}"/>
    <path class="curve-line" d="${line}"/>
    ${nowMarker}
  `;
  const peakHour = c.hourly.reduce((best, v, i) => v > best.v ? { v, i } : best, { v: 0, i: 0 });
  document.getElementById('focus-when').textContent =
    c.today ? `today · ${c.labelZh}` : `${c.labelZh} · ${c.date}`;
  document.getElementById('focus-total').textContent = fmtTokens(c.total);
  document.getElementById('focus-peak').textContent =
    peakHour.v > 0 ? `${String(peakHour.i).padStart(2, '0')}:00` : '—';
}

function renderInsight() {
  const $ins = document.getElementById('weekly-insight');
  const active = weeklyState.cols.filter(c => c.total > 0);
  if (active.length < 2) {
    $ins.innerHTML = `Insufficient data — give it a few days. <span class="dim">每天累计后会自动生成节律分析。</span>`;
    return;
  }
  const avg = active.reduce((s, c) => s + c.total, 0) / active.length;
  const peakDay = weeklyState.cols.reduce((a, b) => b.total > a.total ? b : a);
  // Peak-hour mode of week: aggregate all days' hourly into one and find peak.
  const agg = new Array(24).fill(0);
  for (const c of weeklyState.cols) c.hourly.forEach((v, i) => agg[i] += v);
  const peakH = agg.reduce((best, v, i) => v > best.v ? { v, i } : best, { v: 0, i: 0 });
  $ins.innerHTML = `
    <strong>本周共 ${active.length} 天有活动记录。</strong><br>
    平均 <strong style="color:var(--fg)">${fmtTokens(avg)}</strong> tokens/day ·
    峰值日 <strong style="color:var(--accent)">${peakDay.label}</strong> (${fmtTokens(peakDay.total)})·
    全周最活跃时段 <strong style="color:var(--accent)">${String(peakH.i).padStart(2, '0')}:00</strong>
  `;
}

// ─── settings ──────────────────────────────────────────────
async function refreshSettings() {
  if (!core) return;
  const cfg = await core.invoke('get_config');
  document.getElementById('cfg-cap').value = Math.round(cfg.token_cap);
  document.getElementById('cfg-pct').value = Math.round(cfg.rest_reminder_pct);
  document.getElementById('cfg-color').value = cfg.accent_color || '#4cff91';
  document.getElementById('cfg-tray').checked = !!cfg.close_to_tray;
}
document.getElementById('cfg-save').addEventListener('click', async () => {
  if (!core) return;
  const cap = parseFloat(document.getElementById('cfg-cap').value);
  const color = document.getElementById('cfg-color').value;
  const tray = document.getElementById('cfg-tray').checked;
  const $st = document.getElementById('cfg-status');
  try {
    await core.invoke('set_token_cap', { cap });
    await core.invoke('set_accent_color', { color });
    await core.invoke('set_close_to_tray', { enabled: tray });
    document.documentElement.style.setProperty('--accent', color);
    $st.textContent = '✓ saved';
    $st.style.color = 'var(--accent)';
  } catch (e) {
    $st.textContent = '✗ ' + e;
    $st.style.color = 'var(--danger)';
  }
});

// Apply accent color on dashboard load + listen for changes.
(async () => {
  if (!core) return;
  try {
    const cfg = await core.invoke('get_config');
    if (cfg && cfg.accent_color) {
      document.documentElement.style.setProperty('--accent', cfg.accent_color);
    }
  } catch (e) { /* ignore */ }
})();
if (event) {
  event.listen('config-changed', (e) => {
    const p = e.payload || {};
    if (p.accent_color) {
      document.documentElement.style.setProperty('--accent', p.accent_color);
    }
  });
}

// Initial load of all panels (so timeline/week have data when first opened).
refreshTimeline();
refreshWeekly();
