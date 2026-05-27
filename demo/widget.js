// human-token · browser demo
// No Tauri, no rdev. Listens to in-page keyboard / mouse / clicks and simulates
// the production widget's token accounting. Fold is implemented as DOM movement
// within the stage, not OS-level window moves.

const $stage      = document.getElementById('demo-stage');
const $widget     = document.getElementById('widget');
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
const $stripFill  = document.getElementById('folded-fill');
const $ctaText    = document.getElementById('cta-text');

const NUM_BARS = 12;
const PROGRESS_WIDTH = 20;
const BAR_SCALE = 15;
const BAR_SHIFT_INTERVAL_MS = 400;
const CAP = 200_000;

const STATUS_WORDS = [
  'Flibbertigibbeting', 'Razzmatazzing', 'Yawnsmithing', 'Mulling',
  'Snickerdoodling', 'Bumbershooting', 'Lollygagging', 'Jabberwocking',
  'Razzledazzling', 'Hobnobbing', 'Doodling', 'Tinkering'
];

for (let i = 0; i < NUM_BARS; i++) {
  const b = document.createElement('div');
  b.className = 'mini-bar';
  b.innerHTML = '<i style="height:0%"></i>';
  $bars.appendChild(b);
}

const history = new Array(NUM_BARS).fill(0);
let tokens = 0;
let displayed = 0;
let rate = 0;
let sessionStart = Date.now() / 1000;
let lastFrame = performance.now();
let lastBarShift = 0;
let lastInputAt = performance.now();
let state = 'idle';
let pctUsed = 0;
let cooldown = false;
let statusWord = 'Idling';
let statusWordIdx = 0;

// ─── input ingestion ─────────────────────────────────────────
function bump(amount, rateBoost) {
  if (cooldown) return;
  tokens = Math.min(CAP, tokens + amount);
  rate = Math.min(20, rate + rateBoost);
  lastInputAt = performance.now();
  if (tokens >= CAP) { cooldown = true; state = 'cooldown'; }
}

document.addEventListener('keydown', (e) => {
  // Don't double-count if focus is in a form input (none here, but defensive)
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  bump(1, 0.7);
  fadeCta();
});

let lastMousePos = null;
let mouseAccumPx = 0;
document.addEventListener('mousemove', (e) => {
  if (!lastMousePos) { lastMousePos = { x: e.clientX, y: e.clientY }; return; }
  const dx = e.clientX - lastMousePos.x;
  const dy = e.clientY - lastMousePos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  lastMousePos = { x: e.clientX, y: e.clientY };
  if (d < 0.5) return;
  mouseAccumPx += d;
  while (mouseAccumPx >= 100) {
    bump(1, 0.12);
    mouseAccumPx -= 100;
  }
});

document.addEventListener('click', (e) => {
  // Ignore clicks on the widget's own UI buttons
  if (e.target.closest('#btn-reset')) return;
  bump(2, 1.0);
});

function fadeCta() {
  if (!$ctaText) return;
  $ctaText.style.opacity = '0.4';
}

// ─── reset button ────────────────────────────────────────────
$btnReset.addEventListener('click', (e) => {
  e.stopPropagation();
  tokens = 0;
  displayed = 0;
  rate = 0;
  cooldown = false;
  state = 'idle';
  sessionStart = Date.now() / 1000;
  history.fill(0);
  mouseAccumPx = 0;
});

// ─── decay + state machine ───────────────────────────────────
setInterval(() => {
  rate *= 0.78; // ~22% decay per 200ms
  if (rate < 0.01) rate = 0;

  const idleS = (performance.now() - lastInputAt) / 1000;
  pctUsed = Math.min(100, (tokens / CAP) * 100);

  if (cooldown) {
    state = 'cooldown';
    statusWord = 'cooldown · usage limit reached';
  } else if (pctUsed >= 80) {
    state = 'warn';
    statusWord = 'wind down';
  } else if (idleS > 6) {
    state = 'idle';
    statusWord = 'Idling';
  } else if (rate > 8) {
    state = 'burst';
    if (Math.random() < 0.18) {
      statusWordIdx = (statusWordIdx + 1) % STATUS_WORDS.length;
      statusWord = STATUS_WORDS[statusWordIdx];
    }
  } else {
    state = 'live';
    if (Math.random() < 0.08) {
      statusWordIdx = (statusWordIdx + 1) % STATUS_WORDS.length;
      statusWord = STATUS_WORDS[statusWordIdx];
    }
  }
  applyState();
}, 200);

function applyState() {
  $cap.textContent = '/ 200k';
  $rate.textContent = `· ${rate.toFixed(2)} t/s`;

  $widget.classList.toggle('cooldown', state === 'cooldown');
  $status.classList.remove('cooldown', 'warn');
  $dot.classList.remove('cooldown', 'warn', 'idle');

  if (state === 'cooldown') {
    $dot.classList.add('cooldown');
    $status.classList.add('cooldown');
    $stateLbl.textContent = 'LIMIT';
    $stateLbl.style.color = 'var(--danger)';
    $gerund.textContent = 'usage limit reached · 5h cooldown';
  } else if (state === 'warn') {
    $dot.classList.add('warn');
    $status.classList.add('warn');
    $stateLbl.textContent = 'WIND DOWN';
    $stateLbl.style.color = 'var(--warn)';
    $gerund.textContent = statusWord;
  } else if (state === 'idle') {
    $dot.classList.add('idle');
    $stateLbl.textContent = 'IDLE';
    $stateLbl.style.color = 'var(--fg-deep)';
    $gerund.textContent = statusWord;
  } else if (state === 'burst') {
    $stateLbl.textContent = 'BURST';
    $stateLbl.style.color = 'var(--accent)';
    $gerund.textContent = statusWord;
  } else {
    $stateLbl.textContent = 'LIVE';
    $stateLbl.style.color = 'var(--accent)';
    $gerund.textContent = statusWord;
  }

  if ($stripFill) {
    $stripFill.style.setProperty('--fill-pct', pctUsed.toFixed(1) + '%');
    $stripFill.classList.toggle('warn', state === 'warn');
    $stripFill.classList.toggle('cooldown', state === 'cooldown');
  }

  // Bars
  const now = performance.now();
  const scaled = Math.min(100, rate * BAR_SCALE);
  if (now - lastBarShift > BAR_SHIFT_INTERVAL_MS) {
    history.shift();
    history.push(scaled);
    lastBarShift = now;
  } else if (scaled > history[history.length - 1]) {
    history[history.length - 1] = scaled;
  }
  const bars = $bars.querySelectorAll('.mini-bar');
  const warnFlag = pctUsed >= 80;
  for (let i = 0; i < bars.length; i++) {
    const h = history[i];
    bars[i].querySelector('i').style.height = h + '%';
    bars[i].classList.toggle('hot', h > 60);
    bars[i].classList.toggle('warn', warnFlag);
  }

  // Progress
  const filled = Math.min(PROGRESS_WIDTH, Math.round((pctUsed / 100) * PROGRESS_WIDTH));
  $progFill.textContent  = '#'.repeat(filled);
  $progEmpty.textContent = '-'.repeat(PROGRESS_WIDTH - filled);
  $progPct.textContent   = pctUsed.toFixed(0) + '%';
}

// ─── token-display tween + spinner + elapsed ─────────────────
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

function frame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000);
  lastFrame = t;
  if (tokens < displayed - 0.5) displayed = tokens;
  else {
    displayed += (tokens - displayed) * Math.min(1, dt * 12);
    if (Math.abs(tokens - displayed) < 0.005) displayed = tokens;
  }
  $tokens.textContent = fmtTokens(displayed);
  $elapsed.textContent = `⏱ ${fmtElapsed(Math.max(0, Date.now() / 1000 - sessionStart))}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const SPINNER_CHARS = ['─', '╲', '│', '╱'];
let spinnerIdx = 0;
function spinnerTick() {
  spinnerIdx = (spinnerIdx + 1) % SPINNER_CHARS.length;
  $spinner.textContent = SPINNER_CHARS[spinnerIdx];
  let ms;
  if (state === 'cooldown') ms = 9999;
  else ms = Math.max(60, 900 - rate * 100);
  setTimeout(spinnerTick, ms);
}
setTimeout(spinnerTick, 200);

// ─── drag widget within stage + fold to edge ─────────────────
const SNAP_PX = 28;
const FOLD_DELAY_MS = 600;
const HOVER_LEAVE_MS = 280;

let folded = null; // null | 'left' | 'right' | 'top'
let preFoldRect = null; // { left, top, width, height }
let foldTimer = null;
let leaveTimer = null;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getStageRect() {
  return $stage.getBoundingClientRect();
}

function setWidgetPos(left, top) {
  $widget.style.left = left + 'px';
  $widget.style.top = top + 'px';
  $widget.style.right = 'auto';
}

// Convert default `right: 48px` to explicit `left/top` so we have one coord system.
function normalizeWidgetPos() {
  const stage = getStageRect();
  const wr = $widget.getBoundingClientRect();
  setWidgetPos(wr.left - stage.left, wr.top - stage.top);
}

let dragging = null;
$widget.addEventListener('mousedown', (e) => {
  if (e.target.closest('button, a')) return;
  // If currently folded, expand first; user can drag immediately after release.
  if (folded) {
    expandFold(true);
    e.preventDefault();
    return;
  }
  if (foldTimer) { clearTimeout(foldTimer); foldTimer = null; }
  normalizeWidgetPos();
  const stage = getStageRect();
  const wr = $widget.getBoundingClientRect();
  dragging = {
    offX: e.clientX - wr.left,
    offY: e.clientY - wr.top,
    stage
  };
  $widget.classList.add('dragging');
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const stage = dragging.stage;
  const w = $widget.offsetWidth;
  const h = $widget.offsetHeight;
  let nx = e.clientX - stage.left - dragging.offX;
  let ny = e.clientY - stage.top - dragging.offY;
  nx = clamp(nx, 0, stage.width - w);
  ny = clamp(ny, 0, stage.height - h);
  setWidgetPos(nx, ny);
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  $widget.classList.remove('dragging');
  dragging = null;
  maybeSnap();
});

function maybeSnap() {
  const stage = getStageRect();
  const wr = $widget.getBoundingClientRect();
  const lx = wr.left - stage.left;
  const ty = wr.top - stage.top;
  const rx = stage.width - (lx + wr.width);
  let edge = null;
  if (lx < SNAP_PX) edge = 'left';
  else if (rx < SNAP_PX) edge = 'right';
  else if (ty < SNAP_PX) edge = 'top';
  // bottom omitted by design — same constraint as the desktop app
  if (!edge) return;
  // Snap flush to edge first
  if (edge === 'left') setWidgetPos(0, ty);
  else if (edge === 'right') setWidgetPos(stage.width - wr.width, ty);
  else if (edge === 'top') setWidgetPos(lx, 0);
  if (foldTimer) clearTimeout(foldTimer);
  foldTimer = setTimeout(() => collapseTo(edge), FOLD_DELAY_MS);
}

function collapseTo(edge) {
  const stage = getStageRect();
  const wr = $widget.getBoundingClientRect();
  preFoldRect = {
    left: wr.left - stage.left,
    top:  wr.top - stage.top,
    width: wr.width,
    height: wr.height
  };
  folded = edge;
  document.documentElement.classList.add('folded', 'folded-' + edge);
  if (edge === 'left' || edge === 'right') {
    const stripH = Math.round(preFoldRect.height * 0.66);
    const cy = preFoldRect.top + preFoldRect.height / 2;
    const newTop = clamp(Math.round(cy - stripH / 2), 0, stage.height - stripH);
    $widget.style.width = '8px';
    $widget.style.height = stripH + 'px';
    setWidgetPos(edge === 'left' ? 0 : stage.width - 8, newTop);
  } else { // top
    const stripW = Math.round(preFoldRect.width * 0.66);
    const cx = preFoldRect.left + preFoldRect.width / 2;
    const newLeft = clamp(Math.round(cx - stripW / 2), 0, stage.width - stripW);
    $widget.style.width = stripW + 'px';
    $widget.style.height = '8px';
    setWidgetPos(newLeft, 0);
  }
}

function expandFold(keepHovered) {
  if (!folded) return;
  document.documentElement.classList.remove('folded', 'folded-left', 'folded-right', 'folded-top');
  $widget.style.width = preFoldRect.width + 'px';
  $widget.style.height = preFoldRect.height + 'px';
  setWidgetPos(preFoldRect.left, preFoldRect.top);
  const oldEdge = folded;
  folded = null;
  if (!keepHovered) {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => collapseTo(oldEdge), HOVER_LEAVE_MS);
  }
}

$widget.addEventListener('mouseenter', () => {
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
  if (folded) expandFold(true);
});
$widget.addEventListener('mouseleave', () => {
  if (!preFoldRect) return;
  // Re-fold only if we'd previously folded at an edge and we're not currently being dragged
  if (dragging) return;
  // Need to remember which edge to re-collapse to. Use last known edge from preFoldRect proximity.
  const stage = getStageRect();
  const wr = $widget.getBoundingClientRect();
  const lx = wr.left - stage.left;
  const ty = wr.top - stage.top;
  const rx = stage.width - (lx + wr.width);
  let edge = null;
  if (lx < SNAP_PX) edge = 'left';
  else if (rx < SNAP_PX) edge = 'right';
  else if (ty < SNAP_PX) edge = 'top';
  if (!edge) return;
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => collapseTo(edge), HOVER_LEAVE_MS);
});

// Recompute on resize so layout stays sane in iframes.
window.addEventListener('resize', () => {
  if (folded) {
    // Snap back to edge after resize.
    const edge = folded;
    document.documentElement.classList.remove('folded', 'folded-left', 'folded-right', 'folded-top');
    folded = null;
    collapseTo(edge);
  }
});

// Apply initial state pass so the widget doesn't render blank.
applyState();
