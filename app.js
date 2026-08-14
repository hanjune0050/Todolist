/* =========================================================================
 * 공부 타이머 — 오프라인 PWA
 * 데이터는 전부 브라우저 localStorage 에 저장됩니다 (기기 안, 오프라인).
 * ========================================================================= */
'use strict';

/* ---------- 상수 ---------- */
const EXAM_TIMES = { 국어: 80, 수학: 100, 영어: 50, 탐구: 30 };
const MARKING_REDUCE = { 국어: 3, 수학: 3, 영어: 0, 탐구: 1 };
const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SESSION_MIN_MS = 60 * 1000;   // 1분 이상만 기록
const TT_H0 = 8, TT_H1 = 23;        // 타임테이블 시간 행(08시~23시, 24:00까지)
const ACTIVE_KEY = 'study-timer-active';

/* ---------- 상태 저장/로드 ---------- */
const STORE_KEY = 'study-timer-v1';
let state = normalize(loadRaw());

function loadRaw() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}
function normalize(obj) {
  obj = obj || {};
  obj.tasks = Array.isArray(obj.tasks) ? obj.tasks : [];
  obj.records = obj.records && typeof obj.records === 'object' ? obj.records : {};
  obj.settings = obj.settings && typeof obj.settings === 'object' ? obj.settings : {};
  if (obj.settings.theme === undefined) obj.settings.theme = null; // null=자동
  if (obj.settings.sound === undefined) obj.settings.sound = true;
  return obj;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------- 날짜 유틸 ---------- */
function fmt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { return addDays(d, -d.getDay()); }
function todayStr() { return fmt(new Date()); }

/* ---------- 화면 상태 ---------- */
let selectedDate = todayStr();
let weekStart = startOfWeek(parse(selectedDate));
let monthCursor = new Date();      // 월간 뷰 기준 달
let statsRange = 'week';
let currentView = 'main';

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const weekGrid = $('weekGrid'), weekLabel = $('weekLabel');
const taskListEl = $('taskList'), taskEmpty = $('taskEmpty');
const dayTitle = $('dayTitle'), dayStat = $('dayStat');
const timetableEl = $('timetable');

/* =========================================================================
 * 스케줄 판단
 * ========================================================================= */
function occursOn(task, dateStr) {
  const date = parse(dateStr), start = parse(task.start);
  if (date < start) return false;
  if (task.end && date > parse(task.end)) return false;
  if (task.repeat === 'none') return dateStr === task.start;
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekly') return date.getDay() === start.getDay();
  return false;
}
function tasksForDate(dateStr) {
  return state.tasks.filter(t => occursOn(t, dateStr)).sort((a, b) => (a.created || 0) - (b.created || 0));
}

/* ---------- 기록 헬퍼 ---------- */
function recFor(dateStr, taskId, create) {
  if (!state.records[dateStr]) { if (!create) return null; state.records[dateStr] = {}; }
  if (!state.records[dateStr][taskId]) {
    if (!create) return null;
    state.records[dateStr][taskId] = { done: false, sessions: [] };
  }
  return state.records[dateStr][taskId];
}
function isDone(dateStr, taskId) { const r = recFor(dateStr, taskId, false); return !!(r && r.done); }
function setDone(dateStr, taskId, v) { recFor(dateStr, taskId, true).done = v; save(); }
function addSession(dateStr, taskId, start, end) {
  if (end - start < SESSION_MIN_MS) return;
  recFor(dateStr, taskId, true).sessions.push({ start, end });
  save();
}
function studiedMs(dateStr) {
  const day = state.records[dateStr]; if (!day) return 0;
  let sum = 0;
  for (const tid in day) for (const s of (day[tid].sessions || [])) sum += (s.end - s.start);
  return sum;
}
function fmtDur(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
function minutesOfDay(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }
function hhmm(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/* =========================================================================
 * 주간 캘린더
 * ========================================================================= */
function renderWeek() {
  const wkEnd = addDays(weekStart, 6);
  weekLabel.textContent =
    `${weekStart.getFullYear()}. ${weekStart.getMonth() + 1}. ${weekStart.getDate()} – ` +
    `${wkEnd.getMonth() + 1}. ${wkEnd.getDate()}`;
  weekGrid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const ds = fmt(d);
    const dayTasks = tasksForDate(ds);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (i === 0) cell.classList.add('sun');
    if (i === 6) cell.classList.add('sat');
    if (ds === todayStr()) cell.classList.add('today');
    if (ds === selectedDate) cell.classList.add('selected');
    if (dayTasks.length && dayTasks.every(t => isDone(ds, t.id))) cell.classList.add('all-done');

    const checks = dayTasks.map(t => {
      const done = isDone(ds, t.id);
      return `<span class="mini-check ${done ? 'done' : ''}" style="${done ? `background:${t.color};` : ''}"></span>`;
    }).join('');

    cell.innerHTML =
      `<span class="dow">${DOW[i]}</span><span class="dnum">${d.getDate()}</span>` +
      `<div class="day-checks">${checks}</div>`;
    cell.addEventListener('click', () => { selectedDate = ds; renderAll(); });
    weekGrid.appendChild(cell);
  }
}

/* =========================================================================
 * 할 일 목록
 * ========================================================================= */
function renderTasks() {
  const d = parse(selectedDate);
  dayTitle.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) 할 일`;
  const list = tasksForDate(selectedDate);
  const doneCnt = list.filter(t => isDone(selectedDate, t.id)).length;
  const studied = studiedMs(selectedDate);
  dayStat.textContent = list.length ? `${doneCnt} / ${list.length} 완료${studied ? ` · ${fmtDur(studied)}` : ''}` : '';

  taskListEl.innerHTML = '';
  taskEmpty.classList.toggle('hidden', list.length > 0);

  for (const t of list) {
    const done = isDone(selectedDate, t.id);
    const li = document.createElement('li');
    li.className = 'task-item' + (done ? ' done' : '');
    li.style.setProperty('--c', t.color);

    const tags = [`<span class="tag dur">⏱ ${t.duration}분</span>`];
    if (t.exam) tags.push(`<span class="tag exam">모의고사 · ${t.exam.subject}</span>`);
    if (t.repeat !== 'none') tags.push(`<span class="tag repeat">${t.repeat === 'daily' ? '매일' : '매주'}</span>`);

    li.innerHTML =
      `<div class="task-check ${done ? 'done' : ''}" style="${done ? `background:${t.color};` : ''}"></div>` +
      `<div class="task-main"><div class="task-title">${escapeHtml(t.title)}</div>` +
      `<div class="task-meta">${tags.join('')}</div></div>` +
      `<button class="btn icon task-edit" aria-label="수정">✏️</button>`;

    li.querySelector('.task-check').addEventListener('click', (e) => { e.stopPropagation(); setDone(selectedDate, t.id, !done); renderAll(); });
    li.querySelector('.task-main').addEventListener('click', () => openTimer(t));
    li.querySelector('.task-edit').addEventListener('click', (e) => { e.stopPropagation(); openTaskModal(t); });
    taskListEl.appendChild(li);
  }
}

/* =========================================================================
 * 타임테이블 (세로=시간대, 가로=분 → 지그재그)
 * ========================================================================= */
function renderTimetable() {
  timetableEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'tt-head';
  let marks = '';
  for (let m = 0; m <= 60; m += 10) marks += `<span class="mk" style="left:${(m / 60) * 100}%">${m}</span>`;
  head.innerHTML = `<div class="tt-corner"></div><div class="tt-minmarks">${marks}</div>`;
  timetableEl.appendChild(head);

  const rec = state.records[selectedDate] || {};
  const rowSegs = {};
  for (const t of state.tasks) {
    const r = rec[t.id];
    if (!r || !r.sessions) continue;
    for (const s of r.sessions) {
      const startMin = minutesOfDay(s.start), endMin = minutesOfDay(s.end);
      if (endMin <= startMin) continue;
      const startHour = Math.floor(startMin / 60);
      for (let h = TT_H0; h <= TT_H1; h++) {
        const ovS = Math.max(startMin, h * 60), ovE = Math.min(endMin, h * 60 + 60);
        if (ovE <= ovS) continue;
        (rowSegs[h] = rowSegs[h] || []).push({
          l: ((ovS - h * 60) / 60) * 100, w: ((ovE - ovS) / 60) * 100,
          color: t.color, title: t.title, timeStr: `${hhmm(s.start)}–${hhmm(s.end)}`, isStart: h === startHour,
        });
      }
    }
  }

  for (let h = TT_H0; h <= TT_H1; h++) {
    const row = document.createElement('div'); row.className = 'tt-row';
    const label = document.createElement('div'); label.className = 'tt-hour-label';
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    const track = document.createElement('div'); track.className = 'tt-track';

    for (let m = 10; m < 60; m += 10) {
      const gl = document.createElement('div'); gl.className = 'tt-gl' + (m === 30 ? ' half' : '');
      gl.style.left = ((m / 60) * 100) + '%'; track.appendChild(gl);
    }
    if (h === TT_H0) {
      const dis = document.createElement('div'); dis.className = 'tt-disabled';
      dis.style.left = '0'; dis.style.width = '50%'; track.appendChild(dis);
    }

    const segs = (rowSegs[h] || []).slice().sort((a, b) => a.l - b.l);
    const laneEnds = [];
    segs.forEach(sg => {
      let lane = laneEnds.findIndex(end => sg.l >= end - 0.001);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = sg.l + sg.w; sg._lane = lane;
    });
    const lanes = Math.max(1, laneEnds.length);
    segs.forEach(sg => {
      const el = document.createElement('div'); el.className = 'tt-seg';
      el.style.left = sg.l + '%'; el.style.width = 'calc(' + sg.w + '% - 2px)'; el.style.background = sg.color;
      el.style.top = `calc(${(sg._lane / lanes) * 100}% + 3px)`; el.style.bottom = 'auto';
      el.style.height = `calc(${(1 / lanes) * 100}% - 6px)`;
      if (sg.isStart && sg.w > 12 && lanes === 1) el.innerHTML = `<div>${escapeHtml(sg.title)}</div><div class="tt-time">${sg.timeStr}</div>`;
      else if (sg.isStart && sg.w > 18) el.innerHTML = `<div>${escapeHtml(sg.title)}</div>`;
      el.title = `${sg.title}  ${sg.timeStr}`;
      track.appendChild(el);
    });
    row.appendChild(label); row.appendChild(track); timetableEl.appendChild(row);
  }
}

/* =========================================================================
 * 월간 뷰
 * ========================================================================= */
function renderMonth() {
  const dowEl = $('monthDow');
  if (!dowEl.childElementCount) dowEl.innerHTML = DOW.map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('');
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  $('monthLabel').textContent = `${y}년 ${m + 1}월`;
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const grid = $('monthGrid'); grid.innerHTML = '';
  for (let i = 0; i < first.getDay(); i++) grid.appendChild(document.createElement('div'));
  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(y, m, day), ds = fmt(d);
    const list = tasksForDate(ds);
    const doneCnt = list.filter(t => isDone(ds, t.id)).length;
    const allDone = list.length && doneCnt === list.length;
    const studied = studiedMs(ds);
    const cell = document.createElement('div');
    cell.className = 'm-cell' + (allDone ? ' all-done' : '') + (ds === todayStr() ? ' today' : '');
    const dow = d.getDay();
    const numCls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
    cell.innerHTML =
      `<span class="m-num ${numCls}">${day}</span>` +
      (list.length ? `<span class="m-prog">${allDone ? '✓' : `${doneCnt}/${list.length}`}</span>` : '') +
      (studied ? `<span class="m-time">${fmtDur(studied)}</span>` : '');
    cell.addEventListener('click', () => {
      selectedDate = ds; weekStart = startOfWeek(parse(ds));
      switchView('main'); renderAll();
    });
    grid.appendChild(cell);
  }
}

/* =========================================================================
 * 통계 뷰 (과목/할 일별 누적 공부시간)
 * ========================================================================= */
function rangeBounds(kind) {
  const now = new Date();
  if (kind === 'week') { const s = startOfWeek(now); return [fmt(s), fmt(addDays(s, 6))]; }
  if (kind === 'month') { return [fmt(new Date(now.getFullYear(), now.getMonth(), 1)), fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0))]; }
  return [null, null];
}
function renderStats() {
  const [from, to] = rangeBounds(statsRange);
  // 그룹 키: 모의고사면 과목, 아니면 할 일 제목
  const groups = {}; // key -> {ms, color}
  let total = 0;
  const taskById = {}; state.tasks.forEach(t => taskById[t.id] = t);
  for (const ds in state.records) {
    if (from && ds < from) continue; if (to && ds > to) continue;
    const day = state.records[ds];
    for (const tid in day) {
      const ms = (day[tid].sessions || []).reduce((a, s) => a + (s.end - s.start), 0);
      if (!ms) continue;
      total += ms;
      const t = taskById[tid];
      const key = t ? (t.exam ? t.exam.subject : t.title) : '(삭제된 할 일)';
      const color = t ? t.color : '#94a3b8';
      if (!groups[key]) groups[key] = { ms: 0, color };
      groups[key].ms += ms;
    }
  }
  const arr = Object.entries(groups).map(([k, v]) => ({ name: k, ms: v.ms, color: v.color })).sort((a, b) => b.ms - a.ms);
  const max = arr.length ? arr[0].ms : 1;

  $('statsTotal').innerHTML = `<span class="st-label">총 공부 시간</span><span class="st-value">${fmtDur(total)}</span>`;
  const bars = $('statsBars'); bars.innerHTML = '';
  $('statsEmpty').classList.toggle('hidden', arr.length > 0);
  for (const g of arr) {
    const row = document.createElement('div'); row.className = 'stat-bar';
    row.innerHTML =
      `<div class="sb-top"><span class="sb-name">${escapeHtml(g.name)}</span><span class="sb-val">${fmtDur(g.ms)}</span></div>` +
      `<div class="sb-track"><div class="sb-fill" style="width:${Math.max(4, (g.ms / max) * 100)}%;background:${g.color}"></div></div>`;
    bars.appendChild(row);
  }
}

/* ---------- 뷰 전환 ---------- */
function switchView(v) {
  currentView = v;
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  $('view-' + v).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('addBtn').style.display = v === 'main' ? '' : 'none';
  $('todayBtn').style.display = v === 'stats' ? 'none' : '';
  if (v === 'month') { monthCursor = parse(selectedDate); renderMonth(); }
  if (v === 'stats') renderStats();
}

/* ---------- 전체 다시 그리기 ---------- */
function renderAll() {
  renderWeek(); renderTasks(); renderTimetable(); save();
  if (currentView === 'month') renderMonth();
  if (currentView === 'stats') renderStats();
}

/* =========================================================================
 * 할 일 추가/수정 모달
 * ========================================================================= */
let editingId = null, pickedColor = COLORS[5], pickedSubject = null;

function buildColorPicker() {
  const wrap = $('colorPicker'); wrap.innerHTML = '';
  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'swatch' + (c === pickedColor ? ' active' : '');
    s.style.background = c;
    s.addEventListener('click', () => { pickedColor = c; buildColorPicker(); });
    wrap.appendChild(s);
  });
}
function openTaskModal(task) {
  editingId = task ? task.id : null;
  $('taskModalTitle').textContent = task ? '할 일 수정' : '할 일 추가';
  $('deleteTaskBtn').style.display = task ? '' : 'none';
  if (task) {
    $('fTitle').value = task.title; $('fDuration').value = task.duration;
    $('fRepeat').value = task.repeat; $('fStart').value = task.start; $('fEnd').value = task.end || '';
    pickedColor = task.color; $('fExam').checked = !!task.exam;
    pickedSubject = task.exam ? task.exam.subject : null; $('fMarking').checked = task.exam ? !!task.exam.marking : false;
  } else {
    $('fTitle').value = ''; $('fDuration').value = 25; $('fRepeat').value = 'none';
    $('fStart').value = selectedDate; $('fEnd').value = '';
    pickedColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    $('fExam').checked = false; pickedSubject = null; $('fMarking').checked = false;
  }
  buildColorPicker(); syncExamUI(); syncRepeatUI();
  $('taskModal').classList.remove('hidden');
  setTimeout(() => $('fTitle').focus(), 50);
}
function closeTaskModal() { $('taskModal').classList.add('hidden'); }
function syncRepeatUI() {
  const rep = $('fRepeat').value;
  $('startLabel').textContent = rep === 'none' ? '날짜' : '시작 날짜';
  $('endField').style.display = rep === 'none' ? 'none' : '';
}
function syncExamUI() {
  const on = $('fExam').checked;
  $('examBox').classList.toggle('hidden', !on);
  const dur = $('fDuration');
  document.querySelectorAll('#examSubjects button').forEach(b => b.classList.toggle('active', on && b.dataset.subj === pickedSubject));
  if (on) { applyExamDuration(); dur.readOnly = true; dur.style.opacity = '0.6'; }
  else { dur.readOnly = false; dur.style.opacity = '1'; }
}
function applyExamDuration() {
  if (!pickedSubject) return;
  let t = EXAM_TIMES[pickedSubject];
  if ($('fMarking').checked) t -= MARKING_REDUCE[pickedSubject];
  $('fDuration').value = t;
  if (!$('fTitle').value.trim()) $('fTitle').value = `${pickedSubject} 모의고사`;
}
function saveTask() {
  const title = $('fTitle').value.trim(), duration = parseInt($('fDuration').value, 10);
  const repeat = $('fRepeat').value, start = $('fStart').value, end = $('fEnd').value, examOn = $('fExam').checked;
  if (!title) return toast('제목을 입력하세요');
  if (!duration || duration < 1) return toast('소요 시간을 확인하세요');
  if (!start) return toast('날짜를 선택하세요');
  if (examOn && !pickedSubject) return toast('모의고사 과목을 선택하세요');
  if (repeat !== 'none') {
    if (!end) return toast('종료 날짜를 선택하세요');
    if (parse(end) < parse(start)) return toast('종료 날짜가 시작보다 빠릅니다');
  }
  const exam = examOn ? { subject: pickedSubject, marking: $('fMarking').checked } : null;
  if (editingId) {
    const t = state.tasks.find(x => x.id === editingId);
    Object.assign(t, { title, color: pickedColor, duration, repeat, start, end: repeat === 'none' ? null : end, exam });
  } else {
    state.tasks.push({
      id: 'T' + Date.now() + Math.random().toString(36).slice(2, 6),
      title, color: pickedColor, duration, repeat, start, end: repeat === 'none' ? null : end, exam, created: Date.now(),
    });
  }
  save(); closeTaskModal(); renderAll(); toast(editingId ? '수정했어요' : '추가했어요');
}
function deleteTask() {
  if (!editingId) return;
  if (!confirm('이 할 일을 삭제할까요? (관련 기록도 함께 삭제됩니다)')) return;
  state.tasks = state.tasks.filter(x => x.id !== editingId);
  for (const ds in state.records) if (state.records[ds][editingId]) delete state.records[ds][editingId];
  save(); closeTaskModal(); renderAll(); toast('삭제했어요');
}

/* =========================================================================
 * 타이머 (완료음·진동·백그라운드 유지·화면깨우기)
 * ========================================================================= */
let timer = null;          // { task, remaining, total, running, deadline, segStart, tickId }
let audioCtx = null, wakeLock = null;

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function playChime() {
  if (!state.settings.sound) return;
  try {
    ensureAudio(); const ctx = audioCtx, now = ctx.currentTime;
    [880, 1108.73, 1318.51].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = now + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.start(t); o.stop(t + 0.6);
    });
  } catch (e) {}
}
function buzz() { if (state.settings.sound && navigator.vibrate) try { navigator.vibrate([180, 90, 180]); } catch (e) {} }

async function reqWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function relWake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

/* 진행 중 타이머를 저장/복원 (앱을 나갔다 와도 유지) */
function saveActive() {
  if (!timer) { localStorage.removeItem(ACTIVE_KEY); return; }
  const a = { taskId: timer.task.id, date: selectedDate, total: timer.total, remaining: timer.remaining, running: timer.running, deadline: timer.deadline || 0, segStart: timer.segStart || 0 };
  try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)); } catch (e) {}
}
function clearActive() { localStorage.removeItem(ACTIVE_KEY); }

function openTimer(task) {
  const total = task.duration * 60 * 1000;
  timer = { task, remaining: total, total, running: false, deadline: 0, segStart: 0, tickId: null };
  $('timerTitle').textContent = task.title;
  $('ringFg').style.stroke = task.color;
  $('timerToggle').style.display = ''; $('timerDone').style.display = 'none';
  $('timerToggle').textContent = '시작';
  $('timerState').textContent = isDone(selectedDate, task.id) ? '이미 완료됨' : '준비';
  updateTimerUI();
  $('timerModal').classList.remove('hidden');
}
function updateTimerUI() {
  const r = Math.max(0, timer.remaining);
  const mm = Math.floor(r / 60000), ss = Math.floor((r % 60000) / 1000);
  $('timeText').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const frac = timer.total ? r / timer.total : 0;
  $('ringFg').style.strokeDashoffset = String(2 * Math.PI * 88 * (1 - frac));
}
function handleTick() {
  if (!timer || !timer.running) return;
  timer.remaining = timer.deadline - Date.now();
  if (timer.remaining <= 0) { timer.remaining = 0; updateTimerUI(); finishSegment(Date.now()); completeTimer(); return; }
  updateTimerUI();
}
function startTimer() {
  if (timer.running) return;
  ensureAudio(); reqWake();
  timer.running = true; timer.segStart = Date.now(); timer.deadline = Date.now() + timer.remaining;
  timer.tickId = setInterval(handleTick, 250);
  $('timerToggle').textContent = '일시정지'; $('timerState').textContent = '진행 중';
  saveActive();
}
function pauseTimer() {
  if (!timer.running) return;
  clearInterval(timer.tickId);
  timer.remaining = Math.max(0, timer.deadline - Date.now());
  timer.running = false; finishSegment(Date.now()); relWake();
  $('timerToggle').textContent = '이어서'; $('timerState').textContent = '일시정지';
  saveActive(); renderTimetable();
}
function finishSegment(endMs) {
  if (timer.segStart) { addSession(selectedDate, timer.task.id, timer.segStart, endMs); timer.segStart = 0; }
}
function restartTimer() {
  if (timer.running) { clearInterval(timer.tickId); finishSegment(Date.now()); relWake(); }
  timer.running = false; timer.remaining = timer.total; timer.segStart = 0; timer.deadline = 0;
  updateTimerUI();
  $('timerToggle').textContent = '시작'; $('timerState').textContent = '준비';
  saveActive(); renderTimetable();
}
function completeTimer() {
  clearInterval(timer.tickId); timer.running = false; relWake();
  setDone(selectedDate, timer.task.id, true);
  $('timerToggle').style.display = 'none'; $('timerDone').style.display = '';
  $('timerState').textContent = '완료! 🎉';
  playChime(); buzz(); clearActive(); renderAll();
}
function closeTimer() {
  if (timer && timer.running) { clearInterval(timer.tickId); finishSegment(Date.now()); relWake(); }
  clearActive(); timer = null;
  $('timerToggle').style.display = '';
  $('timerModal').classList.add('hidden'); renderAll();
}

/* 앱 시작 시 진행 중이던 타이머 복원 */
function restoreActive() {
  let a; try { a = JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch (e) {}
  if (!a) return;
  const task = state.tasks.find(t => t.id === a.taskId);
  if (!task) { clearActive(); return; }
  selectedDate = a.date; weekStart = startOfWeek(parse(a.date));
  timer = { task, total: a.total, remaining: a.remaining, running: false, deadline: a.deadline, segStart: 0, tickId: null };
  $('timerTitle').textContent = task.title; $('ringFg').style.stroke = task.color;
  $('timerToggle').style.display = ''; $('timerDone').style.display = 'none';

  if (a.running) {
    const left = a.deadline - Date.now();
    if (left <= 0) {
      // 자리를 비운 사이 완료됨 → 그동안 공부한 구간 기록 + 완료 처리
      if (a.segStart) addSession(a.date, task.id, a.segStart, a.deadline);
      setDone(a.date, task.id, true);
      timer.remaining = 0; updateTimerUI();
      $('timerToggle').style.display = 'none'; $('timerDone').style.display = '';
      $('timerState').textContent = '완료! 🎉'; clearActive();
      $('timerModal').classList.remove('hidden');
      setTimeout(() => toast('자리를 비운 사이 타이머가 완료됐어요'), 300);
    } else {
      // 계속 진행
      timer.remaining = left; timer.running = true; timer.segStart = a.segStart || Date.now();
      timer.tickId = setInterval(handleTick, 250); reqWake();
      $('timerToggle').textContent = '일시정지'; $('timerState').textContent = '진행 중';
      updateTimerUI(); $('timerModal').classList.remove('hidden');
    }
  } else {
    // 일시정지 상태 복원
    timer.remaining = a.remaining; updateTimerUI();
    $('timerToggle').textContent = a.remaining < a.total ? '이어서' : '시작';
    $('timerState').textContent = a.remaining < a.total ? '일시정지' : '준비';
    $('timerModal').classList.remove('hidden');
  }
}

/* =========================================================================
 * 설정 · 백업/복원 · 테마
 * ========================================================================= */
function resolveTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') return t;
  return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme() {
  const t = resolveTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = t === 'dark' ? '#0f141b' : '#3b82f6';
  if ($('setDark')) $('setDark').checked = t === 'dark';
}
function openSettings() {
  $('setDark').checked = resolveTheme() === 'dark';
  $('setSound').checked = !!state.settings.sound;
  $('settingsModal').classList.remove('hidden');
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `study-timer-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('백업 파일을 내보냈어요');
}
async function copyData() {
  const text = JSON.stringify(state);
  try { await navigator.clipboard.writeText(text); toast('JSON을 복사했어요'); }
  catch (e) { window.prompt('아래 내용을 복사해서 보관하세요', text); }
}
function importData(text) {
  let data; try { data = JSON.parse(text); } catch (e) { return toast('올바른 백업 파일이 아니에요'); }
  if (!data || !Array.isArray(data.tasks)) return toast('올바른 백업 파일이 아니에요');
  if (!confirm('현재 데이터를 백업 내용으로 덮어씁니다. 계속할까요?')) return;
  state = normalize(data); save(); applyTheme();
  renderAll(); toast('복원했어요'); $('settingsModal').classList.add('hidden');
}
function clearData() {
  if (!confirm('정말 모든 할 일과 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
  state = normalize({ settings: state.settings }); save();
  clearActive(); renderAll(); toast('모두 삭제했어요'); $('settingsModal').classList.add('hidden');
}

/* =========================================================================
 * 유틸
 * ========================================================================= */
let toastTid = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTid); toastTid = setTimeout(() => el.classList.add('hidden'), 1800);
  return undefined;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* =========================================================================
 * 이벤트 연결
 * ========================================================================= */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('prevWeek').addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeek(); });
$('nextWeek').addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeek(); });
$('todayBtn').addEventListener('click', () => {
  selectedDate = todayStr(); weekStart = startOfWeek(parse(selectedDate));
  if (currentView === 'month') { monthCursor = new Date(); renderMonth(); }
  renderAll();
});
$('addBtn').addEventListener('click', () => openTaskModal(null));
$('prevMonth').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderMonth(); });
$('nextMonth').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderMonth(); });

document.querySelectorAll('.stab').forEach(b => b.addEventListener('click', () => {
  statsRange = b.dataset.range;
  document.querySelectorAll('.stab').forEach(x => x.classList.toggle('active', x === b));
  renderStats();
}));

$('taskModalClose').addEventListener('click', closeTaskModal);
$('cancelTaskBtn').addEventListener('click', closeTaskModal);
$('saveTaskBtn').addEventListener('click', saveTask);
$('deleteTaskBtn').addEventListener('click', deleteTask);
$('fRepeat').addEventListener('change', syncRepeatUI);
$('fExam').addEventListener('change', syncExamUI);
$('fMarking').addEventListener('change', () => { if ($('fExam').checked) applyExamDuration(); });
document.querySelectorAll('#examSubjects button').forEach(b => b.addEventListener('click', () => { pickedSubject = b.dataset.subj; syncExamUI(); }));
$('taskModal').addEventListener('click', (e) => { if (e.target === $('taskModal')) closeTaskModal(); });

$('timerToggle').addEventListener('click', () => { timer.running ? pauseTimer() : startTimer(); });
$('timerRestart').addEventListener('click', restartTimer);
$('timerClose').addEventListener('click', closeTimer);
$('timerDone').addEventListener('click', closeTimer);

$('settingsBtn').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
$('settingsDone').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
$('settingsModal').addEventListener('click', (e) => { if (e.target === $('settingsModal')) $('settingsModal').classList.add('hidden'); });
$('setDark').addEventListener('change', () => { state.settings.theme = $('setDark').checked ? 'dark' : 'light'; save(); applyTheme(); });
$('setSound').addEventListener('change', () => { state.settings.sound = $('setSound').checked; save(); if (state.settings.sound) { ensureAudio(); } });
$('exportBtn').addEventListener('click', exportData);
$('copyBtn').addEventListener('click', copyData);
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => importData(String(r.result)); r.readAsText(f); e.target.value = '';
});
$('clearBtn').addEventListener('click', clearData);

/* 앱이 다시 보일 때: 진행 중이면 시간 재계산 + 화면깨우기 재요청 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer && timer.running) { handleTick(); reqWake(); }
});

/* 시스템 테마 변경 반영 (자동 모드일 때) */
if (window.matchMedia) {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!state.settings.theme) applyTheme(); }); } catch (e) {}
}

/* ---------- 시작 ---------- */
applyTheme();
renderAll();
restoreActive();

/* ---------- 서비스워커 (오프라인) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
