/* =========================================================================
 * 공부 타이머 — 오프라인 PWA
 * 데이터는 전부 브라우저 localStorage 에 저장됩니다 (기기 안, 오프라인).
 * ========================================================================= */
'use strict';

/* ---------- 상수 ---------- */
const EXAM_TIMES = { 국어: 80, 수학: 100, 영어: 50, 탐구: 30 };
const MARKING_REDUCE = { 국어: 3, 수학: 3, 영어: 0, 탐구: 1 };
const TT_START = 8 * 60 + 30;   // 08:30 (분)
const TT_END = 24 * 60;         // 24:00 (분)
const HOUR_PX = 46;             // 타임테이블 1시간 높이(px) — CSS .tt-hour 와 일치
const PX_PER_MIN = HOUR_PX / 60;
const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SESSION_MIN_MS = 60 * 1000; // 1분 이상만 타임테이블에 기록

/* ---------- 상태 저장/로드 ---------- */
const STORE_KEY = 'study-timer-v1';
let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { tasks: [], records: {} };
  // tasks: [{id,title,color,duration,repeat,start,end,exam:{subject,marking}|null,created}]
  // records: { 'YYYY-MM-DD': { taskId: { done:bool, sessions:[{start,end}] } } }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

/* ---------- 날짜 유틸 ---------- */
function fmt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { return addDays(d, -d.getDay()); } // 일요일 시작
function todayStr() { return fmt(new Date()); }

/* ---------- 화면 상태 ---------- */
let selectedDate = todayStr();
let weekStart = startOfWeek(parse(selectedDate));

/* ---------- DOM 참조 ---------- */
const $ = (id) => document.getElementById(id);
const weekGrid = $('weekGrid'), weekLabel = $('weekLabel');
const taskListEl = $('taskList'), taskEmpty = $('taskEmpty');
const dayTitle = $('dayTitle'), dayStat = $('dayStat');
const timetableEl = $('timetable');

/* =========================================================================
 * 스케줄 판단: 특정 날짜에 이 할 일이 나타나는가
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
  return state.tasks
    .filter(t => occursOn(t, dateStr))
    .sort((a, b) => (a.created || 0) - (b.created || 0));
}

/* ---------- 기록(완료/세션) 헬퍼 ---------- */
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
function sessionsFor(dateStr, taskId) { const r = recFor(dateStr, taskId, false); return r ? r.sessions : []; }
function addSession(dateStr, taskId, start, end) {
  if (end - start < SESSION_MIN_MS) return;
  recFor(dateStr, taskId, true).sessions.push({ start, end });
  save();
}

/* =========================================================================
 * 렌더링 — 주간 캘린더
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
    // 그날 할 일이 모두 완료 → 색 강조
    if (dayTasks.length && dayTasks.every(t => isDone(ds, t.id))) cell.classList.add('all-done');

    const checks = dayTasks.map(t => {
      const done = isDone(ds, t.id);
      return `<span class="mini-check ${done ? 'done' : ''}" style="${done ? `background:${t.color};` : ''}"></span>`;
    }).join('');

    cell.innerHTML =
      `<span class="dow">${DOW[i]}</span>` +
      `<span class="dnum">${d.getDate()}</span>` +
      `<div class="day-checks">${checks}</div>`;
    cell.addEventListener('click', () => { selectedDate = ds; renderAll(); });
    weekGrid.appendChild(cell);
  }
}

/* =========================================================================
 * 렌더링 — 선택한 날짜의 할 일 목록
 * ========================================================================= */
function renderTasks() {
  const d = parse(selectedDate);
  dayTitle.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) 할 일`;
  const list = tasksForDate(selectedDate);
  const doneCnt = list.filter(t => isDone(selectedDate, t.id)).length;
  dayStat.textContent = list.length ? `${doneCnt} / ${list.length} 완료` : '';

  taskListEl.innerHTML = '';
  taskEmpty.classList.toggle('hidden', list.length > 0);

  for (const t of list) {
    const done = isDone(selectedDate, t.id);
    const li = document.createElement('li');
    li.className = 'task-item' + (done ? ' done' : '');
    li.style.setProperty('--c', t.color);

    const tags = [];
    tags.push(`<span class="tag dur">⏱ ${t.duration}분</span>`);
    if (t.exam) tags.push(`<span class="tag exam">모의고사 · ${t.exam.subject}</span>`);
    if (t.repeat !== 'none') tags.push(`<span class="tag repeat">${t.repeat === 'daily' ? '매일' : '매주'}</span>`);

    li.innerHTML =
      `<div class="task-check ${done ? 'done' : ''}" style="${done ? `background:${t.color};` : ''}"></div>` +
      `<div class="task-main">` +
        `<div class="task-title">${escapeHtml(t.title)}</div>` +
        `<div class="task-meta">${tags.join('')}</div>` +
      `</div>` +
      `<button class="btn icon task-edit" aria-label="수정">✏️</button>`;

    // 체크박스: 수동 완료/해제
    li.querySelector('.task-check').addEventListener('click', (e) => {
      e.stopPropagation();
      setDone(selectedDate, t.id, !done);
      renderAll();
    });
    // 본문 탭: 타이머 열기
    li.querySelector('.task-main').addEventListener('click', () => openTimer(t));
    // 수정
    li.querySelector('.task-edit').addEventListener('click', (e) => { e.stopPropagation(); openTaskModal(t); });

    taskListEl.appendChild(li);
  }
}

/* =========================================================================
 * 렌더링 — 타임테이블 (세로 시간표)
 * ========================================================================= */
function renderTimetable() {
  timetableEl.innerHTML = '';
  const totalMin = TT_END - TT_START;
  timetableEl.style.height = (totalMin * PX_PER_MIN) + 'px';

  // 시간 눈금 (정시마다). 08:30 시작이므로 첫 정시는 09:00.
  for (let h = 9; h <= 24; h++) {
    const top = (h * 60 - TT_START) * PX_PER_MIN;
    const row = document.createElement('div');
    row.className = 'tt-hour';
    row.style.position = 'absolute';
    row.style.top = top + 'px';
    row.style.left = '0'; row.style.right = '0'; row.style.height = HOUR_PX + 'px';
    row.innerHTML =
      `<div class="hr-line"></div>` +
      `<div class="hr-label">${String(h % 24).padStart(2, '0')}:00</div>`;
    timetableEl.appendChild(row);
  }

  // 세션 블록: 선택 날짜의 모든 할 일 세션
  const rec = state.records[selectedDate] || {};
  for (const t of state.tasks) {
    const r = rec[t.id];
    if (!r || !r.sessions) continue;
    for (const s of r.sessions) {
      const startMin = minutesOfDay(s.start);
      const endMin = minutesOfDay(s.end);
      const top = (Math.max(startMin, TT_START) - TT_START) * PX_PER_MIN;
      const bottom = (Math.min(endMin, TT_END) - TT_START) * PX_PER_MIN;
      const h = Math.max(bottom - top, 16);
      if (bottom <= 0 || top >= totalMin * PX_PER_MIN) continue;
      const block = document.createElement('div');
      block.className = 'tt-block';
      block.style.top = top + 'px';
      block.style.height = h + 'px';
      block.style.background = t.color;
      block.innerHTML =
        `<div>${escapeHtml(t.title)}</div>` +
        `<div class="tt-time">${hhmm(s.start)}–${hhmm(s.end)}</div>`;
      timetableEl.appendChild(block);
    }
  }
}
function minutesOfDay(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }
function hhmm(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/* ---------- 전체 다시 그리기 ---------- */
function renderAll() { renderWeek(); renderTasks(); renderTimetable(); save(); }

/* =========================================================================
 * 할 일 추가/수정 모달
 * ========================================================================= */
let editingId = null;
let pickedColor = COLORS[5];
let pickedSubject = null;

function buildColorPicker() {
  const wrap = $('colorPicker');
  wrap.innerHTML = '';
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
    $('fTitle').value = task.title;
    $('fDuration').value = task.duration;
    $('fRepeat').value = task.repeat;
    $('fStart').value = task.start;
    $('fEnd').value = task.end || '';
    pickedColor = task.color;
    $('fExam').checked = !!task.exam;
    pickedSubject = task.exam ? task.exam.subject : null;
    $('fMarking').checked = task.exam ? !!task.exam.marking : false;
  } else {
    $('fTitle').value = '';
    $('fDuration').value = 25;
    $('fRepeat').value = 'none';
    $('fStart').value = selectedDate;
    $('fEnd').value = '';
    pickedColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    $('fExam').checked = false;
    pickedSubject = null;
    $('fMarking').checked = false;
  }
  buildColorPicker();
  syncExamUI();
  syncRepeatUI();
  $('taskModal').classList.remove('hidden');
  setTimeout(() => $('fTitle').focus(), 50);
}
function closeTaskModal() { $('taskModal').classList.add('hidden'); }

function syncRepeatUI() {
  const rep = $('fRepeat').value;
  $('startLabel').textContent = rep === 'none' ? '날짜' : '시작 날짜';
  $('endField').style.display = rep === 'none' ? 'none' : '';
}

/* 모의고사 UI: 과목 선택 시 소요시간 자동 세팅 */
function syncExamUI() {
  const on = $('fExam').checked;
  $('examBox').classList.toggle('hidden', !on);
  const dur = $('fDuration');
  // 과목 버튼 활성화 표시
  document.querySelectorAll('#examSubjects button').forEach(b => {
    b.classList.toggle('active', on && b.dataset.subj === pickedSubject);
  });
  if (on) {
    applyExamDuration();
    dur.readOnly = true;
    dur.style.opacity = '0.6';
  } else {
    dur.readOnly = false;
    dur.style.opacity = '1';
  }
}
function applyExamDuration() {
  if (!pickedSubject) return;
  let t = EXAM_TIMES[pickedSubject];
  if ($('fMarking').checked) t -= MARKING_REDUCE[pickedSubject];
  $('fDuration').value = t;
  // 제목이 비어있으면 과목명으로 채워줌
  if (!$('fTitle').value.trim()) $('fTitle').value = `${pickedSubject} 모의고사`;
}

function saveTask() {
  const title = $('fTitle').value.trim();
  const duration = parseInt($('fDuration').value, 10);
  const repeat = $('fRepeat').value;
  const start = $('fStart').value;
  const end = $('fEnd').value;
  const examOn = $('fExam').checked;

  if (!title) { toast('제목을 입력하세요'); return; }
  if (!duration || duration < 1) { toast('소요 시간을 확인하세요'); return; }
  if (!start) { toast('날짜를 선택하세요'); return; }
  if (examOn && !pickedSubject) { toast('모의고사 과목을 선택하세요'); return; }
  if (repeat !== 'none') {
    if (!end) { toast('종료 날짜를 선택하세요'); return; }
    if (parse(end) < parse(start)) { toast('종료 날짜가 시작보다 빠릅니다'); return; }
  }

  const exam = examOn ? { subject: pickedSubject, marking: $('fMarking').checked } : null;

  if (editingId) {
    const t = state.tasks.find(x => x.id === editingId);
    Object.assign(t, { title, color: pickedColor, duration, repeat, start, end: repeat === 'none' ? null : end, exam });
  } else {
    state.tasks.push({
      id: 'T' + Date.now() + Math.random().toString(36).slice(2, 6),
      title, color: pickedColor, duration, repeat,
      start, end: repeat === 'none' ? null : end, exam, created: Date.now()
    });
  }
  save();
  closeTaskModal();
  renderAll();
  toast(editingId ? '수정했어요' : '추가했어요');
}

function deleteTask() {
  if (!editingId) return;
  if (!confirm('이 할 일을 삭제할까요? (관련 기록도 함께 삭제됩니다)')) return;
  state.tasks = state.tasks.filter(x => x.id !== editingId);
  for (const ds in state.records) { if (state.records[ds][editingId]) delete state.records[ds][editingId]; }
  save();
  closeTaskModal();
  renderAll();
  toast('삭제했어요');
}

/* =========================================================================
 * 타이머
 * ========================================================================= */
let timer = null; // { task, remaining(ms), total(ms), running, segStart, tickId }

function openTimer(task) {
  const total = task.duration * 60 * 1000;
  timer = { task, remaining: total, total, running: false, segStart: 0, tickId: null };
  $('timerTitle').textContent = task.title;
  $('ringFg').style.stroke = task.color;
  updateTimerUI();
  $('timerState').textContent = isDone(selectedDate, task.id) ? '이미 완료됨' : '준비';
  $('timerToggle').textContent = '시작';
  $('timerDone').style.display = 'none';
  $('timerModal').classList.remove('hidden');
}

function updateTimerUI() {
  const r = Math.max(0, timer.remaining);
  const mm = Math.floor(r / 60000), ss = Math.floor((r % 60000) / 1000);
  $('timeText').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const frac = timer.total ? r / timer.total : 0;
  const C = 2 * Math.PI * 88; // 552.9
  $('ringFg').style.strokeDashoffset = String(C * (1 - frac));
}

function tick() {
  const now = Date.now();
  timer.remaining = timer.deadline - now;
  if (timer.remaining <= 0) {
    timer.remaining = 0;
    updateTimerUI();
    finishSegment(now);      // 세션 기록
    completeTimer();
    return;
  }
  updateTimerUI();
}

function startTimer() {
  if (timer.running) return;
  timer.running = true;
  timer.segStart = Date.now();
  timer.deadline = Date.now() + timer.remaining;
  timer.tickId = setInterval(tick, 250);
  $('timerToggle').textContent = '일시정지';
  $('timerState').textContent = '진행 중';
}

function pauseTimer() {
  if (!timer.running) return;
  clearInterval(timer.tickId);
  timer.remaining = Math.max(0, timer.deadline - Date.now());
  timer.running = false;
  finishSegment(Date.now());
  $('timerToggle').textContent = '이어서';
  $('timerState').textContent = '일시정지';
  renderTimetable(); // 멈춰도 지금까지 한 시간 표시
}

/* 현재 진행 구간을 세션으로 저장 (1분 이상만) */
function finishSegment(endMs) {
  if (timer.segStart) {
    addSession(selectedDate, timer.task.id, timer.segStart, endMs);
    timer.segStart = 0;
  }
}

function restartTimer() {
  if (timer.running) { clearInterval(timer.tickId); finishSegment(Date.now()); }
  timer.running = false;
  timer.remaining = timer.total;
  timer.segStart = 0;
  updateTimerUI();
  $('timerToggle').textContent = '시작';
  $('timerState').textContent = '준비';
  renderTimetable();
}

function completeTimer() {
  clearInterval(timer.tickId);
  timer.running = false;
  setDone(selectedDate, timer.task.id, true);
  $('timerToggle').style.display = 'none';
  $('timerDone').style.display = '';
  $('timerState').textContent = '완료! 🎉';
  renderAll();
}

function closeTimer() {
  if (timer && timer.running) { clearInterval(timer.tickId); finishSegment(Date.now()); }
  $('timerToggle').style.display = '';
  timer = null;
  $('timerModal').classList.add('hidden');
  renderAll();
}

/* =========================================================================
 * 기타 UI
 * ========================================================================= */
let toastTid = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTid);
  toastTid = setTimeout(() => el.classList.add('hidden'), 1800);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* =========================================================================
 * 이벤트 연결
 * ========================================================================= */
$('prevWeek').addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeek(); });
$('nextWeek').addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeek(); });
$('todayBtn').addEventListener('click', () => {
  selectedDate = todayStr(); weekStart = startOfWeek(parse(selectedDate)); renderAll();
});
$('addBtn').addEventListener('click', () => openTaskModal(null));

$('taskModalClose').addEventListener('click', closeTaskModal);
$('cancelTaskBtn').addEventListener('click', closeTaskModal);
$('saveTaskBtn').addEventListener('click', saveTask);
$('deleteTaskBtn').addEventListener('click', deleteTask);
$('fRepeat').addEventListener('change', syncRepeatUI);
$('fExam').addEventListener('change', syncExamUI);
$('fMarking').addEventListener('change', () => { if ($('fExam').checked) applyExamDuration(); });
document.querySelectorAll('#examSubjects button').forEach(b => {
  b.addEventListener('click', () => { pickedSubject = b.dataset.subj; syncExamUI(); });
});
// 모달 바깥 클릭으로 닫기
$('taskModal').addEventListener('click', (e) => { if (e.target === $('taskModal')) closeTaskModal(); });

$('timerToggle').addEventListener('click', () => { timer.running ? pauseTimer() : startTimer(); });
$('timerRestart').addEventListener('click', restartTimer);
$('timerClose').addEventListener('click', closeTimer);
$('timerDone').addEventListener('click', closeTimer);

/* ---------- 시작 ---------- */
renderAll();

/* ---------- 서비스워커 등록 (오프라인) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 실패해도 앱은 동작 */ });
  });
}
