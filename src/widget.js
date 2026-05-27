// Widget — lives in the corner, reads activity-tick events from the backend.
// We use the global __TAURI__ since `withGlobalTauri: true`.

const { event, core, window: tauriWindow } = window.__TAURI__ || {};

const $tokens     = document.getElementById('tokens');
const $cap        = document.getElementById('cap');
const $gerund     = document.getElementById('gerund');
const $rate       = document.getElementById('rate');
const $dot        = document.getElementById('dot');
const $stateLbl   = document.getElementById('state-label');
const $status     = document.getElementById('status');
const $bars       = document.getElementById('bars');
const $elapsed    = document.getElementById('elapsed');
const $spinner    = document.getElementById('spinner');
const $progFill   = document.getElementById('progress-fill');
const $progEmpty  = document.getElementById('progress-empty');
const $progPct    = document.getElementById('progress-pct');
const $btnReset   = document.getElementById('btn-reset');
const $btnPause   = document.getElementById('btn-pause');
const $close      = document.getElementById('widget-close');
const $widget     = document.getElementById('widget');
const $exitOv     = document.getElementById('exit-confirm');
const $exitToday  = document.getElementById('exit-today');
const $exitCancel = document.getElementById('exit-cancel');
const $exitOk     = document.getElementById('exit-confirm-btn');
const $stripFill  = document.getElementById('folded-fill');
const $stripPulse = document.getElementById('folded-pulse');

const NUM_BARS = 12;
const PROGRESS_WIDTH = 20;
const history = new Array(NUM_BARS).fill(0);
const BAR_SCALE = 15;
const BAR_SHIFT_INTERVAL_MS = 400;
let lastBarShift = 0;
let warnFlag = false;

for (let i = 0; i < NUM_BARS; i++) {
  const b = document.createElement('div');
  b.className = 'mini-bar';
  b.innerHTML = '<i style="height:0%"></i>';
  $bars.appendChild(b);
}

// ─── token display: monotonic smooth tween ───────────────────
let displayed   = 0;
let target      = 0;
let capValue    = 200000;
let sessionStart = Date.now() / 1000;
let lastFrame   = performance.now();
let currentRate = 0;
let currentState = 'active';
let isPaused = false;
let todayTokens = 0;
let warnFold = false;

function fmtCap(n) {
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return Math.round(n).toString();
}

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtElapsed(secs) {
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(secs % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderProgress(pct) {
  const filled = Math.min(PROGRESS_WIDTH, Math.round((pct / 100) * PROGRESS_WIDTH));
  $progFill.textContent  = '#'.repeat(filled);
  $progEmpty.textContent = '-'.repeat(PROGRESS_WIDTH - filled);
  $progPct.textContent   = pct.toFixed(0) + '%';
}

function applySnapshot(snap) {
  target       = snap.session_tokens;
  capValue     = snap.cap;
  sessionStart = snap.session_started_at;
  warnFlag     = snap.pct_used >= 80;
  currentRate  = snap.rate_per_sec;
  currentState = snap.state;
  isPaused     = snap.paused;
  todayTokens  = snap.today_tokens;
  warnFold     = snap.pct_used >= 80;

  // Mirror activity into the folded strip (visible only when collapsed).
  if ($stripFill) {
    const pct = Math.min(100, snap.pct_used);
    $stripFill.style.setProperty('--fill-pct', pct + '%');
    $stripFill.classList.toggle('warn', snap.pct_used >= 80 && snap.state !== 'cooldown');
    $stripFill.classList.toggle('cooldown', snap.state === 'cooldown');
    $stripFill.classList.toggle('paused', snap.paused);
  }
  if ($stripPulse) {
    // Pulse intensity reflects current rate (0..16 t/s → 0..1 opacity)
    const intensity = isPaused || snap.state === 'cooldown' ? 0 : Math.min(1, snap.rate_per_sec / 12);
    $stripPulse.style.setProperty('--p', intensity.toFixed(2));
  }

  $cap.textContent  = `/ ${fmtCap(snap.cap)}`;
  $rate.textContent = `· ${snap.rate_per_sec.toFixed(2)} t/s`;

  // Pause button reflects state.
  $btnPause.textContent = isPaused ? '▶' : '⏸';
  $btnPause.title = isPaused ? 'resume' : 'pause';

  // Gerund / message line
  $widget.classList.toggle('cooldown', snap.state === 'cooldown');
  $widget.classList.toggle('paused', snap.paused);
  $status.classList.remove('cooldown', 'warn', 'paused');
  $dot.classList.remove('cooldown', 'warn', 'idle', 'paused');

  if (snap.paused) {
    $dot.classList.add('paused');
    $status.classList.add('paused');
    $stateLbl.textContent = 'PAUSED';
    $stateLbl.style.color = 'var(--fg-deep)';
    $gerund.textContent = 'paused · rest mode';
  } else if (snap.state === 'cooldown') {
    $dot.classList.add('cooldown');
    $status.classList.add('cooldown');
    $stateLbl.textContent = 'LIMIT';
    $stateLbl.style.color = 'var(--danger)';
    $gerund.textContent = 'usage limit reached · 5h cooldown';
  } else if (snap.pct_used >= 80) {
    $dot.classList.add('warn');
    $status.classList.add('warn');
    $stateLbl.textContent = 'WIND DOWN';
    $stateLbl.style.color = 'var(--warn)';
    $gerund.textContent = snap.status_word;
  } else if (snap.state === 'idle') {
    $dot.classList.add('idle');
    $stateLbl.textContent = 'IDLE';
    $stateLbl.style.color = 'var(--fg-deep)';
    $gerund.textContent = snap.status_word;
  } else if (snap.state === 'burst') {
    $stateLbl.textContent = 'BURST';
    $stateLbl.style.color = 'var(--accent)';
    $gerund.textContent = snap.status_word;
  } else {
    $stateLbl.textContent = 'LIVE';
    $stateLbl.style.color = 'var(--accent)';
    $gerund.textContent = snap.status_word;
  }

  // Bars
  const now = performance.now();
  const scaled = Math.min(100, snap.rate_per_sec * BAR_SCALE);
  if (now - lastBarShift > BAR_SHIFT_INTERVAL_MS) {
    history.shift();
    history.push(scaled);
    lastBarShift = now;
  } else if (scaled > history[history.length - 1]) {
    history[history.length - 1] = scaled;
  }
  const bars = $bars.querySelectorAll('.mini-bar');
  for (let i = 0; i < bars.length; i++) {
    const h = history[i];
    bars[i].querySelector('i').style.height = h + '%';
    bars[i].classList.toggle('hot', h > 60);
    bars[i].classList.toggle('warn', warnFlag);
  }

  renderProgress(snap.pct_used);
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000);
  lastFrame = t;

  if (target < displayed - 0.5) {
    displayed = target; // explicit reset
  } else {
    displayed += (target - displayed) * Math.min(1, dt * 12);
    if (Math.abs(target - displayed) < 0.005) displayed = target;
  }

  $tokens.textContent = fmtTokens(displayed);

  const elapsed = Math.max(0, Date.now() / 1000 - sessionStart);
  $elapsed.textContent = `⏱ ${fmtElapsed(elapsed)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ─── spinner: faster when active ─────────────────────────────
const SPINNER_CHARS = ['─', '╲', '│', '╱'];
let spinnerIdx = 0;
function spinnerTick() {
  spinnerIdx = (spinnerIdx + 1) % SPINNER_CHARS.length;
  $spinner.textContent = SPINNER_CHARS[spinnerIdx];
  let ms;
  if (isPaused || currentState === 'cooldown') {
    ms = 9999; // effectively frozen
  } else {
    // idle ~ 900ms; at rate=8 t/s ~ 80ms
    ms = Math.max(60, 900 - currentRate * 100);
  }
  setTimeout(spinnerTick, ms);
}
setTimeout(spinnerTick, 200);

// ─── snapshots ───────────────────────────────────────────────
if (core) {
  core.invoke('get_widget_snapshot').then((snap) => {
    displayed = snap.session_tokens;
    applySnapshot(snap);
  }).catch(console.error);
  // Pull accent color from persisted config.
  core.invoke('get_config').then((cfg) => {
    if (cfg && cfg.accent_color) {
      document.documentElement.style.setProperty('--accent', cfg.accent_color);
    }
  }).catch(console.error);
}
if (event) {
  event.listen('activity-tick', (e) => applySnapshot(e.payload));
  event.listen('config-changed', (e) => {
    const p = e.payload || {};
    if (p.accent_color) {
      document.documentElement.style.setProperty('--accent', p.accent_color);
    }
  });
}

// ─── buttons ─────────────────────────────────────────────────
// Double-click anywhere on the widget (except buttons) → open dashboard.
$widget.addEventListener('dblclick', (e) => {
  if (e.target.closest('button, a')) return;
  if (core) core.invoke('open_main_window').catch(console.error);
});

// ─── exit confirmation ───────────────────────────────────────
function fmtTokensShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toLocaleString();
}

async function showExitConfirm() {
  if (!$exitOv) return;
  $exitToday.textContent = fmtTokensShort(todayTokens);
  $exitOv.classList.add('shown');
  // If the widget is folded, expand first so the overlay is reachable.
  if (foldState && foldState.collapsed && expandFold) await expandFold(true);
}
function hideExitConfirm() {
  if ($exitOv) $exitOv.classList.remove('shown');
}

if ($close) {
  $close.addEventListener('click', (e) => {
    e.stopPropagation();
    showExitConfirm();
  });
}
if ($exitCancel) {
  $exitCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    hideExitConfirm();
  });
}
if ($exitOk) {
  $exitOk.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (core) {
        await core.invoke('force_save').catch(console.error);
        await core.invoke('close_widget').catch(console.error);
      }
    } finally {
      hideExitConfirm();
    }
  });
}

$btnReset.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!core) return;
  try {
    await core.invoke('reset_session');
    // Optimistic: zero the display immediately.
    displayed = 0;
    target = 0;
    const snap = await core.invoke('get_widget_snapshot');
    applySnapshot(snap);
  } catch (err) { console.error(err); }
});

$btnPause.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!core) return;
  try {
    await core.invoke('toggle_pause');
    const snap = await core.invoke('get_widget_snapshot');
    applySnapshot(snap);
  } catch (err) { console.error(err); }
});

// ─── edge snapping + auto fold ───────────────────────────────
// State shared with the exit-confirm logic above.
let foldState = null;
let expandFold = null; // assigned inside the IIFE below

(async () => {
  if (!tauriWindow) return;
  const win = tauriWindow.getCurrentWindow ? tauriWindow.getCurrentWindow() : tauriWindow.getCurrent();
  const PhysicalPosition = tauriWindow.PhysicalPosition;
  const PhysicalSize = tauriWindow.PhysicalSize;
  const LogicalSize = tauriWindow.LogicalSize;
  const SNAP_PX = 28;
  const SNAP_PX_BOTTOM = 8;        // 下边吸附距离更短，避免远距离突然被拉过去
  const STRIP_PX = 8;
  const FOLD_DELAY_MS = 600;
  const HOVER_LEAVE_MS = 280;
  const SNAP_SETTLE_MS = 100;
  const POST_EXPAND_IMMUNITY_MS = 1500;
  let moveTimer = null;
  let foldTimer = null;
  let leaveTimer = null;
  let settleTimer = null;
  // True while we're moving/resizing the window from code. onMoved must ignore these to avoid
  // feedback loops where easeTo's per-frame setPosition would re-enter maybeSnap (jitter bug).
  let isSnapping = false;
  // performance.now() threshold; while now < this, maybeSnap is a no-op. Gives the user a
  // grace window to drag a freshly expanded widget out of the snap zone.
  let snapImmuneUntil = 0;
  let fullSize = null;

  function setRootEdgeClass(edge) {
    const root = document.documentElement;
    root.classList.remove('folded', 'folded-left', 'folded-right', 'folded-top', 'folded-bottom');
    if (edge) {
      root.classList.add('folded', 'folded-' + edge);
    }
  }

  async function captureFullSizeIfNeeded() {
    if (fullSize) return fullSize;
    const s = await win.outerSize();
    fullSize = { w: s.width, h: s.height };
    return fullSize;
  }

  function beginProgrammaticMove() {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    isSnapping = true;
  }
  function endProgrammaticMove() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { isSnapping = false; settleTimer = null; }, SNAP_SETTLE_MS);
  }

  async function maybeSnap() {
    if (performance.now() < snapImmuneUntil) return;
    try {
      const monitor = await tauriWindow.currentMonitor();
      if (!monitor) return;
      await captureFullSizeIfNeeded();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const mLeft = monitor.position.x;
      const mTop = monitor.position.y;
      const mRight = mLeft + monitor.size.width;
      const mBottom = mTop + monitor.size.height;
      const winRight = pos.x + size.width;
      const winBottom = pos.y + size.height;

      let nx = pos.x, ny = pos.y;
      let edge = null;
      if (pos.x - mLeft < SNAP_PX) { nx = mLeft; edge = 'left'; }
      else if (mRight - winRight < SNAP_PX) { nx = mRight - size.width; edge = 'right'; }
      if (pos.y - mTop < SNAP_PX) { ny = mTop; if (!edge) edge = 'top'; }
      else if (mBottom - winBottom < SNAP_PX_BOTTOM) { ny = mBottom - size.height; if (!edge) edge = 'bottom'; }

      if (nx !== pos.x || ny !== pos.y) {
        await easeTo({ x: pos.x, y: pos.y }, { x: nx, y: ny }, 160);
      }

      // Sync foldState.edge with current position; otherwise a stale 'right' could cause
      // mouseleave to refold a widget that has since been dragged to the middle.
      if (foldState) foldState.edge = edge;

      // Bottom edge only aligns, never folds (would block taskbar awareness).
      if (edge && edge !== 'bottom') scheduleFold(edge);
      else cancelFold();
    } catch (err) {
      console.error('[snap] failed', err);
    }
  }

  function scheduleFold(edge) {
    cancelFold();
    foldTimer = setTimeout(() => collapseToEdge(edge), FOLD_DELAY_MS);
  }
  function cancelFold() {
    if (foldTimer) { clearTimeout(foldTimer); foldTimer = null; }
  }

  async function collapseToEdge(edge) {
    if ($exitOv && $exitOv.classList.contains('shown')) return;
    try {
      const monitor = await tauriWindow.currentMonitor();
      if (!monitor) return;
      await captureFullSizeIfNeeded();
      const pos = await win.outerPosition();
      const size = await win.outerSize();

      let newW = size.width, newH = size.height;
      let newX = pos.x, newY = pos.y;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (edge === 'left' || edge === 'right') {
        newW = STRIP_PX;
        newH = Math.min(Math.round(fullSize.h * 2 / 3), monitor.size.height);
        const cy = pos.y + size.height / 2;
        newY = clamp(Math.round(cy - newH / 2),
                     monitor.position.y,
                     monitor.position.y + monitor.size.height - newH);
        newX = edge === 'right'
          ? monitor.position.x + monitor.size.width - STRIP_PX
          : monitor.position.x;
      } else if (edge === 'top' || edge === 'bottom') {
        newH = STRIP_PX;
        newW = Math.min(Math.round(fullSize.w * 2 / 3), monitor.size.width);
        const cx = pos.x + size.width / 2;
        newX = clamp(Math.round(cx - newW / 2),
                     monitor.position.x,
                     monitor.position.x + monitor.size.width - newW);
        newY = edge === 'bottom'
          ? monitor.position.y + monitor.size.height - STRIP_PX
          : monitor.position.y;
      }
      foldState = { collapsed: true, edge, fullW: fullSize.w, fullH: fullSize.h, anchorX: pos.x, anchorY: pos.y };
      setRootEdgeClass(edge);
      beginProgrammaticMove();
      try {
        await win.setSize(new PhysicalSize(newW, newH));
        await win.setPosition(new PhysicalPosition(newX, newY));
      } finally {
        endProgrammaticMove();
      }
    } catch (err) {
      console.error('[fold] collapse failed', err);
    }
  }

  expandFold = async function expandFromFold(keepHovered) {
    if (!foldState || !foldState.collapsed) return;
    try {
      const monitor = await tauriWindow.currentMonitor();
      if (!monitor) return;
      const { edge, fullW, fullH, anchorX, anchorY } = foldState;
      let newX, newY;
      if (edge === 'left') {
        newX = monitor.position.x;
        newY = anchorY;
      } else if (edge === 'right') {
        newX = monitor.position.x + monitor.size.width - fullW;
        newY = anchorY;
      } else if (edge === 'top') {
        newX = anchorX;
        newY = monitor.position.y;
      } else {
        newX = anchorX;
        newY = monitor.position.y + monitor.size.height - fullH;
      }
      beginProgrammaticMove();
      try {
        await win.setSize(new PhysicalSize(fullW, fullH));
        await win.setPosition(new PhysicalPosition(newX, newY));
      } finally {
        endProgrammaticMove();
      }
      setRootEdgeClass(null);
      foldState = { collapsed: false, edge, fullW, fullH };
      // Disable snap briefly so the user can drag the freshly expanded widget out of the
      // edge zone — fixes the "folded strip can't be dragged out" bug.
      snapImmuneUntil = performance.now() + POST_EXPAND_IMMUNITY_MS;
      if (!keepHovered) {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => collapseToEdge(edge), HOVER_LEAVE_MS);
      }
    } catch (err) {
      console.error('[fold] expand failed', err);
    }
  };

  async function easeTo(from, to, durationMs) {
    const start = performance.now();
    beginProgrammaticMove();
    return new Promise((resolve) => {
      function step(t) {
        const p = Math.min(1, (t - start) / durationMs);
        const e = 1 - Math.pow(1 - p, 3);
        const x = Math.round(from.x + (to.x - from.x) * e);
        const y = Math.round(from.y + (to.y - from.y) * e);
        win.setPosition(new PhysicalPosition(x, y)).catch(() => {});
        if (p >= 1) { endProgrammaticMove(); resolve(); }
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  document.body.addEventListener('mouseenter', () => {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    if (foldState && foldState.collapsed) {
      expandFold(true);
    }
  });
  document.body.addEventListener('mouseleave', () => {
    if (!foldState || foldState.edge == null) return;
    if ($exitOv && $exitOv.classList.contains('shown')) return;
    if (performance.now() < snapImmuneUntil) return;
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => collapseToEdge(foldState.edge), HOVER_LEAVE_MS);
  });

  // mousedown: cancel any pending fold; if folded, expand immediately so the user is
  // dragging the full widget, not the 8px strip.
  $widget.addEventListener('mousedown', () => {
    cancelFold();
    if (foldState && foldState.collapsed) {
      snapImmuneUntil = performance.now() + POST_EXPAND_IMMUNITY_MS;
      expandFold(true);
    }
  });

  await win.onMoved(() => {
    if (isSnapping) return;
    if (moveTimer) clearTimeout(moveTimer);
    cancelFold();
    moveTimer = setTimeout(maybeSnap, 140);
  });

  // First-time setup: Tauri's dev-mode watcher reuses the OS window across rebuilds, so if
  // a fold was in flight when JS hot-reloads, outerSize would still read 8×N and corrupt
  // our fullSize cache. Force the configured logical size before captureFullSize.
  try {
    beginProgrammaticMove();
    await win.setSize(new LogicalSize(240, 158));
    setRootEdgeClass(null);
    foldState = null;
  } catch (err) {
    console.error('[fold] reset size failed', err);
  } finally {
    endProgrammaticMove();
  }
  fullSize = null;
  await captureFullSizeIfNeeded();
  try {
    const monitor = await tauriWindow.currentMonitor();
    if (monitor) {
      const cx = monitor.position.x + monitor.size.width * 0.72;
      const cy = monitor.position.y + monitor.size.height * 0.62;
      const nx = Math.round(cx - fullSize.w / 2);
      const ny = Math.round(cy - fullSize.h / 2);
      beginProgrammaticMove();
      try {
        await win.setPosition(new PhysicalPosition(nx, ny));
      } finally {
        endProgrammaticMove();
      }
    }
  } catch (err) {
    console.error('[fold] default pos failed', err);
  }
})();
