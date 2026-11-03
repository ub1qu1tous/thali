'use strict';
(() => {
/* ---------- constants ---------- */
const KEY = 'thali:v1';
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner']];
const ACTIVITIES = [
  ['Running (easy)', 9.8], ['Running (tempo / fast)', 11.5], ['Walking', 3.5], ['Brisk walking', 4.5],
  ['Cycling (moderate)', 8], ['Swimming', 7], ['Strength training', 5], ['HIIT', 8], ['Yoga', 2.5],
  ['Football', 7], ['Cricket', 4.8], ['Badminton', 5.5], ['Zumba / dance', 6.5], ['Stair climbing', 8.8],
  ['Trekking / hiking', 6.5], ['Skipping rope', 11], ['Other (enter kcal)', 0]
];
const LEVELS = [
  [1.2, 'Sedentary', 'Desk job, little exercise'], [1.375, 'Lightly active', 'Exercise 1 to 3 days a week'],
  [1.55, 'Moderately active', 'Exercise 3 to 5 days a week'], [1.725, 'Very active', 'Hard exercise 6 to 7 days a week'],
  [1.9, 'Athlete', 'Training twice a day']
];
const PACES = [
  [-0.75, 'Lose 0.75 kg per week'], [-0.5, 'Lose 0.5 kg per week'], [-0.25, 'Lose 0.25 kg per week'],
  [0, 'Maintain my weight'], [0.25, 'Gain 0.25 kg per week'], [0.5, 'Gain 0.5 kg per week']
];
const FOODS_N = (window.FOODS || []).map(a => ({ name: a[0], unit: a[1], g: a[2], k: a[3], p: a[4], c: a[5], f: a[6], src: 'db' }));

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = n => Math.round(n || 0).toLocaleString('en-IN');
const n1 = n => (Math.round((n || 0) * 10) / 10).toString();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => iso(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const dateLabel = s => {
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return parseISO(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- state ---------- */
const defaults = () => ({ v: 1, profile: null, goals: null, days: {}, weights: [], custom: [], recent: [], settings: { addBack: true } });
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); return Object.assign(defaults(), o, { settings: Object.assign({ addBack: true }, o.settings) }); }
  } catch (e) { /* storage unavailable */ }
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Browser storage may be full or blocked.'); }
}
const ui = { tab: 'diary', date: todayStr(), range: 30, meal: 'breakfast', results: [], fs: null, wo: null };

function ensureDay(d) {
  const dd = S.days[d] || (S.days[d] = { meals: {}, water: 0, workouts: [] });
  for (const [m] of MEALS) dd.meals[m] = dd.meals[m] || [];
  dd.workouts = dd.workouts || []; dd.water = dd.water || 0;
  return dd;
}
const mealList = (dd, m) => (dd && dd.meals && dd.meals[m]) || [];
function totals(dd) {
  const t = { k: 0, p: 0, c: 0, f: 0 };
  if (!dd) return t;
  for (const [m] of MEALS) for (const e of mealList(dd, m)) { t.k += e.k * e.qty; t.p += e.p * e.qty; t.c += e.c * e.qty; t.f += e.f * e.qty; }
  return t;
}
const burned = dd => ((dd && dd.workouts) || []).reduce((a, w) => a + (w.kcal || 0), 0);
const hasLog = d => { const dd = S.days[d]; return !!dd && MEALS.some(([m]) => mealList(dd, m).length); };
function streak() {
  let n = 0, d = todayStr();
  if (!hasLog(d)) d = addDays(d, -1);
  while (hasLog(d)) { n++; d = addDays(d, -1); }
  return n;
}
function latestWeight() {
  const w = S.weights.length ? S.weights[S.weights.length - 1].kg : null;
  return w || (S.profile && S.profile.weight) || 70;
}
function setWeight(d, kg) {
  S.weights = S.weights.filter(w => w.d !== d); S.weights.push({ d, kg }); S.weights.sort((a, b) => a.d.localeCompare(b.d));
  if (S.goals && S.goals.auto) recalcGoals();
}
function calcGoals(p, weight) {
  const bmr = 10 * weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  let k = bmr * p.activity + (p.pace * 7700) / 7;
  k = Math.max(p.sex === 'm' ? 1500 : 1200, Math.round(k / 10) * 10);
  let prot = Math.round(weight * (p.pace === 0 ? 1.6 : 1.8));
  prot = Math.min(prot, Math.round((k * 0.35) / 4));
  const fat = Math.round((k * 0.25) / 9);
  const carbs = Math.max(0, Math.round((k - prot * 4 - fat * 9) / 4));
  return { k, p: prot, c: carbs, f: fat, water: Math.round((weight * 35) / 100) * 100 };
}
function recalcGoals() {
  if (!S.profile) return;
  S.goals = Object.assign({ auto: true }, calcGoals(S.profile, latestWeight()));
}

/* ---------- views ---------- */
const app = $('#app');
function render() {
  document.body.classList.toggle('onboarding', !S.profile);
  if (!S.profile) { app.innerHTML = viewOnboard(); return; }
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  app.innerHTML = ({ diary: viewDiary, move: viewMove, progress: viewProgress, me: viewMe }[ui.tab])();
}
const dateBar = () => `<div class="datebar">
  <button class="icon-btn" data-a="prevDay" aria-label="Previous day">‹</button>
  <button class="link lbl" data-a="today" aria-label="Jump to today">${esc(dateLabel(ui.date))}</button>
  <button class="icon-btn" data-a="nextDay" aria-label="Next day">›</button></div>`;

function ring(frac, over) {
  const r = 52, C = 2 * Math.PI * r;
  return `<svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--line)" stroke-width="12"/>
  <circle cx="64" cy="64" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : 'var(--accent)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * clamp(frac, 0, 1)).toFixed(1)} ${C.toFixed(1)}"/></svg>`;
}
const macroBar = (label, val, goal, color) => `<div class="macro"><div class="row between"><span>${label}</span><span class="muted"><b style="color:var(--ink)">${n0(val)}</b> / ${n0(goal)} g</span></div>
  <div class="bar" role="progressbar" aria-label="${label}" aria-valuenow="${Math.round(val)}" aria-valuemax="${goal}"><i style="width:${clamp((val / (goal || 1)) * 100, 0, 100)}%;background:${color}"></i></div></div>`;

function viewDiary() {
  const dd = S.days[ui.date], t = totals(dd), burn = burned(dd), g = S.goals;
  const budget = g.k + (S.settings.addBack ? burn : 0), left = budget - t.k, over = left < 0;
  const water = (dd && dd.water) || 0;
  const meals = MEALS.map(([m, label]) => {
    const list = mealList(dd, m), kc = list.reduce((a, e) => a + e.k * e.qty, 0);
    return `<section class="card"><div class="meal-h"><h2>${label}</h2><span class="muted small">${n0(kc)} kcal</span></div>
    ${list.length ? list.map(e => `<button class="entry" data-a="editEntry" data-meal="${m}" data-id="${e.id}">
      <div class="grow"><div class="nm">${esc(e.name)}</div><div class="muted small">${n1(e.qty)} × ${esc(e.unit)}</div></div>
      <div class="kc">${n0(e.k * e.qty)}</div></button>`).join('') : '<div class="empty">Nothing logged yet</div>'}
    <button class="link add" data-a="addFood" data-meal="${m}">+ Add food</button></section>`;
  }).join('');
  return `<div class="hdr"><h1>Diary</h1>${dateBar()}</div>
  <section class="card"><div class="ring-wrap">
    <div class="ring">${ring(t.k / budget, over)}<div class="c"><div class="big" style="${over ? 'color:var(--danger)' : ''}">${n0(Math.abs(left))}</div><div class="muted small">${over ? 'kcal over' : 'kcal left'}</div></div></div>
    <div class="stats">
      <div class="stat"><span class="muted">Goal</span><b>${n0(g.k)}</b></div>
      <div class="stat"><span class="muted">Food</span><b>${n0(t.k)}</b></div>
      <div class="stat"><span class="muted">Exercise</span><b>${S.settings.addBack ? '+' : ''}${n0(burn)}</b></div>
    </div></div>
    ${macroBar('Protein', t.p, g.p, 'var(--protein)')}${macroBar('Carbs', t.c, g.c, 'var(--carbs)')}${macroBar('Fat', t.f, g.f, 'var(--fat)')}
  </section>
  ${meals}
  <section class="card"><div class="meal-h"><h2>💧 Water</h2><span class="muted small">${n0(water)} / ${n0(g.water)} ml</span></div>
    <div class="bar" role="progressbar" aria-label="Water" aria-valuenow="${water}" aria-valuemax="${g.water}"><i style="width:${clamp((water / g.water) * 100, 0, 100)}%;background:var(--water)"></i></div>
    <div class="water-btns"><button class="btn ghost sm" data-a="water" data-ml="-250">− 250</button><button class="btn sm" data-a="water" data-ml="250">+ 250 ml</button><button class="btn sm" data-a="water" data-ml="500">+ 500 ml</button></div></section>`;
}

function viewMove() {
  const dd = S.days[ui.date], list = (dd && dd.workouts) || [];
  const wkStart = (() => { const d = parseISO(ui.date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); })();
  let wkMin = 0, wkKm = 0, wkK = 0;
  for (let i = 0; i < 7; i++) for (const w of ((S.days[addDays(wkStart, i)] || {}).workouts || [])) { wkMin += w.min || 0; wkKm += w.km || 0; wkK += w.kcal || 0; }
  return `<div class="hdr"><h1>Move</h1>${dateBar()}</div>
  <div class="kpis"><div class="kpi"><b>${n0(wkMin)}</b><span>min this week</span></div><div class="kpi"><b>${n1(wkKm)}</b><span>km logged</span></div><div class="kpi"><b>${n0(wkK)}</b><span>kcal burned</span></div></div>
  <section class="card"><div class="meal-h"><h2>Workouts</h2><span class="muted small">${n0(burned(dd))} kcal</span></div>
  ${list.length ? list.map(w => `<button class="entry" data-a="editWorkout" data-id="${w.id}"><div class="grow"><div class="nm">${esc(w.type)}</div>
    <div class="muted small">${n0(w.min)} min${w.km ? ' · ' + n1(w.km) + ' km' : ''}</div></div><div class="kc">${n0(w.kcal)}</div></button>`).join('') : '<div class="empty">No workouts logged for this day</div>'}
  <button class="btn block mt" data-a="addWorkout">+ Log workout</button></section>
  <p class="muted small center">Calories burned use MET values and your latest weight. They are estimates.</p>`;
}

function lineChart(pts, goal) {
  const W = 320, H = 160, L = 34, R = 10, T = 12, B = 22;
  if (pts.length < 2) return '<div class="empty">Log your weight on at least two days to see a trend.</div>';
  const vals = pts.map(p => p.kg).concat(goal ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 2) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const t0 = parseISO(pts[0].d).getTime(), t1 = parseISO(pts[pts.length - 1].d).getTime() || t0 + 1;
  const X = d => L + ((parseISO(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.kg).toFixed(1)}`).join(' ');
  const fmt = d => parseISO(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend from ${n1(pts[0].kg)} to ${n1(pts[pts.length - 1].kg)} kilograms">
   ${[0, 1, 2].map(i => { const v = lo + ((hi - lo) * i) / 2; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${n1(v)}</text>`; }).join('')}
   ${goal ? `<line x1="${L}" x2="${W - R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--accent)" stroke-dasharray="4 3"/><text x="${W - R}" y="${Y(goal) - 3}" text-anchor="end" style="fill:var(--accent)">goal ${n1(goal)}</text>` : ''}
   <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
   ${pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3" fill="var(--accent)"/>`).join('')}
   <text x="${L}" y="${H - 6}">${fmt(pts[0].d)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(pts[pts.length - 1].d)}</text></svg>`;
}
function barChart(days, goal) {
  const W = 320, H = 150, L = 34, R = 8, T = 12, B = 22;
  const max = Math.max(goal * 1.25, ...days.map(d => d.k), 1);
  const Y = v => T + (1 - v / max) * (H - T - B), bw = (W - L - R) / days.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories eaten over the last ${days.length} days">
   <line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/>
   ${days.map((d, i) => `<rect x="${(L + i * bw + bw * 0.18).toFixed(1)}" y="${Y(d.k).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(Y(0) - Y(d.k)).toFixed(1)}" rx="3" fill="${d.k > goal ? 'var(--danger)' : 'var(--accent)'}" opacity="${d.k ? 1 : 0.2}"/>
   <text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${parseISO(d.d).toLocaleDateString('en-IN', { weekday: 'narrow' })}</text>`).join('')}
   <line x1="${L}" x2="${W - R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--muted)" stroke-dasharray="4 3"/><text x="${L - 4}" y="${Y(goal) + 3}" text-anchor="end">${n0(goal)}</text></svg>`;
}
function viewProgress() {
  const g = S.goals, cut = addDays(todayStr(), -(ui.range - 1));
  const pts = S.weights.filter(w => w.d >= cut);
  const days = []; for (let i = 6; i >= 0; i--) { const d = addDays(todayStr(), -i); days.push({ d, k: totals(S.days[d]).k, logged: hasLog(d) }); }
  const logged = days.filter(d => d.logged), avg = logged.length ? logged.reduce((a, d) => a + d.k, 0) / logged.length : 0;
  const m = { p: 0, c: 0, f: 0 }; logged.forEach(d => { const t = totals(S.days[d.d]); m.p += t.p; m.c += t.c; m.f += t.f; });
  const nL = logged.length || 1, first = S.weights[0], last = S.weights[S.weights.length - 1];
  const delta = first && last ? last.kg - first.kg : 0;
  return `<div class="hdr"><h1>Progress</h1></div>
  <div class="kpis"><div class="kpi"><b>${streak()}</b><span>day streak</span></div><div class="kpi"><b>${n0(avg)}</b><span>avg kcal (7d)</span></div>
  <div class="kpi"><b>${last ? n1(last.kg) : '–'}</b><span>kg now${first && last && first !== last ? ` (${delta > 0 ? '+' : ''}${n1(delta)})` : ''}</span></div></div>
  <section class="card"><div class="meal-h"><h2>Weight</h2><div class="seg" role="group" aria-label="Range">${[30, 90, 365].map(r => `<button class="${ui.range === r ? 'on' : ''}" data-a="range" data-r="${r}">${r === 365 ? '1y' : r + 'd'}</button>`).join('')}</div></div>
   ${lineChart(pts, S.profile.goalWeight)}<button class="btn block mt-s" data-a="addWeight">+ Log weight</button></section>
  <section class="card"><h2>Calories, last 7 days</h2>${barChart(days, g.k)}
   <p class="muted small mt-s">Average macros on logged days: protein ${n0(m.p / nL)} g, carbs ${n0(m.c / nL)} g, fat ${n0(m.f / nL)} g.</p></section>
  ${S.weights.length ? `<section class="card"><h2>Weight history</h2>${S.weights.slice(-8).reverse().map(w => `<div class="entry"><div class="grow">${esc(parseISO(w.d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</div><b>${n1(w.kg)} kg</b><button class="icon-btn" data-a="delWeight" data-d="${w.d}" aria-label="Delete entry">✕</button></div>`).join('')}</section>` : ''}`;
}

function viewMe() {
  const p = S.profile, g = S.goals, w = latestWeight(), bmi = w / Math.pow(p.height / 100, 2);
  const lvl = LEVELS.find(l => l[0] === p.activity), pace = PACES.find(x => x[0] === p.pace);
  return `<div class="hdr"><h1>${esc(p.name || 'Me')}</h1></div>
  <section class="card"><div class="row between"><h2>Profile</h2><button class="link" data-a="editProfile">Edit</button></div>
   <p class="muted small">${p.sex === 'm' ? 'Male' : 'Female'}, ${p.age} yrs, ${p.height} cm, ${n1(w)} kg · BMI ${n1(bmi)}<br>${lvl ? esc(lvl[1]) : ''} · ${pace ? esc(pace[1]) : ''}${p.goalWeight ? ` · goal ${n1(p.goalWeight)} kg` : ''}</p></section>
  <section class="card"><div class="row between"><h2>Daily goals</h2><button class="link" data-a="editGoals">Edit</button></div>
   <div class="kpis" style="margin:0"><div class="kpi"><b>${n0(g.k)}</b><span>kcal</span></div><div class="kpi"><b>${n0(g.p)} g</b><span>protein</span></div><div class="kpi"><b>${n0(g.c)} / ${n0(g.f)} g</b><span>carbs / fat</span></div></div>
   <p class="muted small mt-s">${g.auto ? 'Calculated from your profile with the Mifflin-St Jeor equation and updated when you log a new weight.' : 'Custom goals.'} Water goal ${n0(g.water)} ml.</p>
   <label class="check"><input type="checkbox" data-i="addback" ${S.settings.addBack ? 'checked' : ''}><span>Add exercise calories to my daily budget</span></label></section>
  <section class="card"><h2>Your data</h2><p class="muted small">Everything is stored only in this browser on this device. Nothing is uploaded. Export a backup now and then, because clearing browser data erases the app data.</p>
   <div class="grid2"><button class="btn ghost sm" data-a="export">Backup (JSON)</button><button class="btn ghost sm" data-a="exportCsv">Food log (CSV)</button>
   <button class="btn ghost sm" data-a="importPick">Restore backup</button><button class="btn danger sm" data-a="reset">Erase all data</button></div>
   <input type="file" id="importFile" accept="application/json,.json" hidden></section>
  <section class="card"><h2>Install on your phone</h2><p class="muted small"><b>iPhone:</b> open this page in Safari, tap Share, then Add to Home Screen.<br><b>Android:</b> open in Chrome, tap the menu, then Install app. It works offline after the first visit. Online food search and barcode lookup use Open Food Facts.</p></section>`;
}

function profileForm(p, onboarding) {
  p = p || { name: '', sex: 'm', age: '', height: '', weight: '', goalWeight: '', activity: 1.375, pace: -0.5 };
  const w = onboarding ? p.weight : latestWeight();
  return `<form data-form="profile" autocomplete="off">
  <label class="f"><span>Name</span><input name="name" value="${esc(p.name)}" maxlength="30" placeholder="What should we call you?"></label>
  <div class="grid2"><label class="f"><span>Sex (for calorie formula)</span><select name="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
  <label class="f"><span>Age</span><input name="age" type="number" inputmode="numeric" min="10" max="100" required value="${esc(p.age)}"></label></div>
  <div class="grid2"><label class="f"><span>Height (cm)</span><input name="height" type="number" inputmode="decimal" min="100" max="250" required value="${esc(p.height)}"></label>
  <label class="f"><span>Weight (kg)</span><input name="weight" type="number" inputmode="decimal" step="0.1" min="25" max="300" required value="${esc(w)}"></label></div>
  <label class="f"><span>Goal weight (kg, optional)</span><input name="goalWeight" type="number" inputmode="decimal" step="0.1" min="25" max="300" value="${esc(p.goalWeight)}"></label>
  <label class="f"><span>Activity level</span><select name="activity">${LEVELS.map(l => `<option value="${l[0]}" ${l[0] === p.activity ? 'selected' : ''}>${l[1]} (${l[2]})</option>`).join('')}</select></label>
  <label class="f"><span>Goal</span><select name="pace">${PACES.map(x => `<option value="${x[0]}" ${x[0] === p.pace ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></label>
  <button class="btn block" type="submit">${onboarding ? 'Create my plan' : 'Save'}</button></form>`;
}
function viewOnboard() {
  return `<div class="hero"><img class="logo" src="icons/icon.svg" alt=""><h1 style="font-size:1.8rem;margin-top:10px">Thali</h1>
  <p class="muted">A free, private calorie and fitness tracker with Indian foods built in. No account, no ads, no subscription.</p></div>
  <section class="card">${profileForm(null, true)}</section>`;
}

/* ---------- sheets ---------- */
function openSheet(html) {
  const s = $('#sheet'); s.innerHTML = `<div class="backdrop" data-a="closeSheet"></div><div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  s.classList.remove('hidden'); document.body.classList.add('noscroll');
}
function closeSheet() {
  stopScan(); $('#sheet').classList.add('hidden'); $('#sheet').innerHTML = ''; document.body.classList.remove('noscroll');
}
const sheetTop = title => `<div class="top"><h2 style="margin:0">${title}</h2><button class="icon-btn" data-a="closeSheet" aria-label="Close">✕</button></div>`;

/* food search */
function openSearch(meal) {
  ui.meal = meal || defaultMeal();
  openSheet(`${sheetTop('Add to ' + esc(MEALS.find(m => m[0] === ui.meal)[1]))}
   <div class="row"><input id="q" data-i="q" type="search" placeholder="Search food or type a barcode" autocomplete="off" aria-label="Search food"><button class="icon-btn" data-a="scan" aria-label="Scan barcode" style="flex:none">📷</button></div>
   <div id="results"></div><button class="btn ghost block mt" data-a="customFood">+ Create custom food</button>`);
  showResults(''); setTimeout(() => { const q = $('#q'); q && q.focus(); }, 50);
}
function rank(f, q) {
  const n = f.name.toLowerCase(), words = n.split(/[\s(/,)]+/), t = q.split(' ')[0];
  return (f.src === 'custom' ? -4 : 0) + (words.includes(t) ? (n.startsWith(t) ? 0 : 1) : n.startsWith(t) ? 2 : words.some(w => w.startsWith(t)) ? 3 : 4);
}
function localSearch(q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean), pool = S.custom.map(f => Object.assign({}, f, { src: 'custom' })).concat(FOODS_N);
  return pool.filter(f => toks.every(t => f.name.toLowerCase().includes(t))).sort((a, b) => rank(a, q.toLowerCase()) - rank(b, q.toLowerCase())).slice(0, 40);
}
function resItem(f, i) {
  return `<button class="res" data-a="pick" data-i="${i}"><div class="grow"><div class="nm">${esc(f.name)}</div><div class="muted small">${esc(f.unit)}${f.src === 'online' ? ' · Open Food Facts' : ''}</div></div><b>${n0(f.k)}</b></button>`;
}
let onlineCount = 0;
function showResults(q) {
  q = q.trim(); const box = $('#results'); if (!box) return;
  let list;
  if (!q) {
    list = S.custom.map(f => Object.assign({}, f, { src: 'custom' })).concat(S.recent);
    ui.results = list;
    box.innerHTML = list.length ? `<div class="sect">Your foods and recent</div>${list.map(resItem).join('')}` : '<p class="muted mt">Start typing, for example <i>dal</i>, <i>roti</i> or <i>paneer</i>.</p>';
    return;
  }
  const local = localSearch(q); ui.results = local.slice(); ui.localN = local.length;
  box.innerHTML = (local.length ? local.map(resItem).join('') : '<p class="muted mt">No match in the built-in list.</p>') + '<div id="online"></div>';
  if (q.length >= 3 && navigator.onLine !== false) scheduleOnline(q);
}
let onlineTimer, onlineCtl;
function scheduleOnline(q) {
  clearTimeout(onlineTimer); if (onlineCtl) onlineCtl.abort();
  const slot = $('#online'); if (slot) slot.innerHTML = '<p class="muted small center">Searching Open Food Facts…</p>';
  onlineTimer = setTimeout(async () => {
    const ctl = onlineCtl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000), my = ++onlineCount;
    try {
      const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
      const isCode = /^\d{8,14}$/.test(q);
      const url = isCode ? `https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${fields}`
        : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=${fields}`;
      const r = await fetch(url, { signal: ctl.signal }); const j = await r.json();
      if (my !== onlineCount) return;
      const items = (isCode ? (j.product ? [j.product] : []) : j.products || []).map(offFood).filter(Boolean);
      const slot2 = $('#online'); if (!slot2) return;
      const base = ui.results.length; ui.results = ui.results.concat(items);
      slot2.innerHTML = items.length ? `<div class="sect">Packaged foods (online)</div>${items.map((f, i) => resItem(f, base + i)).join('')}` : '<p class="muted small center">No online matches.</p>';
    } catch (e) {
      const s2 = $('#online'); if (s2 && my === onlineCount) s2.innerHTML = '<p class="muted small center">Online search is unavailable right now.</p>';
    } finally { clearTimeout(to); }
  }, 450);
}
function offFood(p) {
  const n = p.nutriments || {}; let k = n['energy-kcal_100g'];
  if (k == null && n.energy_100g != null) k = n.energy_100g / 4.184;
  if (k == null || !p.product_name) return null;
  const sq = parseFloat(p.serving_quantity), useS = sq > 0 && sq < 1000, g = useS ? sq : 100, m = g / 100;
  const r = v => Math.round((v || 0) * m * 10) / 10;
  const brand = p.brands ? ` (${p.brands.split(',')[0].trim()})` : '';
  return { name: p.product_name + brand, unit: useS ? (p.serving_size || g + ' g') : '100 g', g, k: r(k), p: r(n.proteins_100g), c: r(n.carbohydrates_100g), f: r(n.fat_100g), src: 'online' };
}

/* barcode scan */
let scanStream = null, scanOn = false;
async function startScan() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('Scanning is not supported in this browser. Type the barcode number into the search box.');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const box = $('#results'); box.innerHTML = '<video class="scan" id="vid" playsinline muted></video><p class="muted small center">Point the camera at the barcode.</p>';
    const v = $('#vid'); v.srcObject = scanStream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); scanOn = true;
    const tick = async () => {
      if (!scanOn) return;
      try { const c = await det.detect(v); if (c.length) { const code = c[0].rawValue; stopScan(); const q = $('#q'); if (q) { q.value = code; } showResults(code); return; } } catch (e) { /* retry */ }
      setTimeout(tick, 250);
    }; tick();
  } catch (e) { toast('Camera access was denied.'); }
}
function stopScan() { scanOn = false; if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; } }

/* food detail */
function openFood(food, qty, meal, entryId) {
  ui.fs = { food, qty, meal, entryId };
  openSheet(`${sheetTop(entryId ? 'Edit entry' : 'Add food')}
   <h3 style="font-size:1.1rem">${esc(food.name)}</h3><p class="muted small">Per serving: ${esc(food.unit)}</p>
   <div class="grid2 mt"><label class="f"><span>Servings</span><input id="fq" data-i="qty" type="number" inputmode="decimal" step="0.25" min="0" value="${n1(qty)}"></label>
   ${food.g ? `<label class="f"><span>Grams / ml</span><input id="fg" data-i="grams" type="number" inputmode="decimal" step="1" min="0" value="${Math.round(qty * food.g)}"></label>` : '<div></div>'}</div>
   <label class="f"><span>Meal</span><select data-i="meal">${MEALS.map(([m, l]) => `<option value="${m}" ${m === meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
   <div class="preview" id="fp"></div>
   <button class="btn block" data-a="saveFood">${entryId ? 'Save changes' : 'Add to diary'}</button>
   ${entryId ? '<button class="btn danger block mt-s" data-a="delEntry">Remove from diary</button>' : ''}`);
  updatePreview();
}
function updatePreview() {
  const { food, qty } = ui.fs, q = qty || 0, el = $('#fp'); if (!el) return;
  el.innerHTML = `<div><b>${n0(food.k * q)}</b><small>kcal</small></div><div><b style="color:var(--protein)">${n1(food.p * q)}</b><small>protein g</small></div><div><b style="color:var(--carbs)">${n1(food.c * q)}</b><small>carbs g</small></div><div><b style="color:var(--fat)">${n1(food.f * q)}</b><small>fat g</small></div>`;
}
function openCustom() {
  openSheet(`${sheetTop('Custom food')}<form data-form="custom" autocomplete="off">
   <label class="f"><span>Name</span><input name="name" required maxlength="60" placeholder="e.g. Mom's rajma"></label>
   <div class="grid2"><label class="f"><span>Serving</span><input name="unit" value="1 serving" maxlength="30"></label><label class="f"><span>Grams (optional)</span><input name="g" type="number" inputmode="decimal" min="0" step="1"></label></div>
   <div class="grid2"><label class="f"><span>Calories</span><input name="k" type="number" inputmode="decimal" min="0" step="any" required></label><label class="f"><span>Protein (g)</span><input name="p" type="number" inputmode="decimal" min="0" step="any" value="0"></label>
   <label class="f"><span>Carbs (g)</span><input name="c" type="number" inputmode="decimal" min="0" step="any" value="0"></label><label class="f"><span>Fat (g)</span><input name="f" type="number" inputmode="decimal" min="0" step="any" value="0"></label></div>
   <label class="check"><input type="checkbox" name="save" checked><span>Save to My foods</span></label><button class="btn block" type="submit">Continue</button></form>`);
}

/* workouts */
function openWorkout(w) {
  const ed = !!w; ui.wo = { id: w && w.id, manual: ed };
  const base = w || { type: ACTIVITIES[0][0], min: 30, km: '', kcal: 0 };
  openSheet(`${sheetTop(ed ? 'Edit workout' : 'Log workout')}<form data-form="workout" autocomplete="off">
   <label class="f"><span>Activity</span><select name="type" data-i="wtype">${ACTIVITIES.map(a => `<option ${a[0] === base.type ? 'selected' : ''}>${a[0]}</option>`).join('')}</select></label>
   <div class="grid2"><label class="f"><span>Minutes</span><input name="min" data-i="wmin" type="number" inputmode="decimal" min="1" max="1000" required value="${base.min}"></label>
   <label class="f"><span>Distance km (optional)</span><input name="km" type="number" inputmode="decimal" min="0" step="0.01" value="${base.km || ''}"></label></div>
   <label class="f"><span>Calories burned</span><input name="kcal" id="wk" data-i="wkcal" type="number" inputmode="decimal" min="0" required value="${Math.round(base.kcal) || ''}"></label>
   <button class="btn block" type="submit">${ed ? 'Save changes' : 'Add workout'}</button>
   ${ed ? '<button class="btn danger block mt-s" type="button" data-a="delWorkout">Delete workout</button>' : ''}</form>`);
  if (!ed) autoKcal();
}
function autoKcal() {
  const f = $('#sheet form'); if (!f || ui.wo.manual) return;
  const met = (ACTIVITIES.find(a => a[0] === f.type.value) || [0, 0])[1], min = parseFloat(f.min.value) || 0;
  f.kcal.value = met ? Math.round(met * latestWeight() * (min / 60)) : '';
}
function openWeight() {
  openSheet(`${sheetTop('Log weight')}<form data-form="weight"><div class="grid2"><label class="f"><span>Date</span><input name="d" type="date" required max="${todayStr()}" value="${todayStr()}"></label>
  <label class="f"><span>Weight (kg)</span><input name="kg" type="number" inputmode="decimal" step="0.1" min="25" max="300" required value="${n1(latestWeight())}"></label></div><button class="btn block" type="submit">Save</button></form>`);
}
function openGoals() {
  const g = S.goals;
  openSheet(`${sheetTop('Daily goals')}<form data-form="goals"><div class="grid2"><label class="f"><span>Calories</span><input name="k" type="number" inputmode="numeric" min="800" max="6000" required value="${g.k}"></label>
  <label class="f"><span>Water (ml)</span><input name="water" type="number" inputmode="numeric" min="500" max="8000" step="100" required value="${g.water}"></label>
  <label class="f"><span>Protein (g)</span><input name="p" type="number" inputmode="numeric" min="0" required value="${g.p}"></label>
  <label class="f"><span>Carbs (g)</span><input name="c" type="number" inputmode="numeric" min="0" required value="${g.c}"></label>
  <label class="f"><span>Fat (g)</span><input name="f" type="number" inputmode="numeric" min="0" required value="${g.f}"></label></div>
  <button class="btn block" type="submit">Save goals</button><button class="btn ghost block mt-s" type="button" data-a="autoGoals">Recalculate automatically</button></form>`);
}

/* ---------- actions ---------- */
function findEntry(id) {
  const dd = S.days[ui.date]; if (!dd) return null;
  for (const [m] of MEALS) { const i = mealList(dd, m).findIndex(e => e.id === id); if (i >= 0) return { m, i, e: dd.meals[m][i] }; }
  return null;
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;
const actions = {
  tab(el) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  prevDay() { ui.date = addDays(ui.date, -1); render(); },
  nextDay() { ui.date = addDays(ui.date, 1); render(); },
  today() { ui.date = todayStr(); render(); },
  closeSheet,
  addFood(el) { openSearch(el.dataset.meal); },
  scan() { startScan(); },
  customFood() { openCustom(); },
  pick(el) { const f = ui.results[+el.dataset.i]; if (f) openFood(f, 1, ui.meal); },
  editEntry(el) {
    const r = (ui.entryRef = findEntry(el.dataset.id)); if (!r) return;
    const e = r.e; openFood({ name: e.name, unit: e.unit, g: e.g, k: e.k, p: e.p, c: e.c, f: e.f }, e.qty, r.m, e.id);
  },
  saveFood() {
    const { food, qty, meal, entryId } = ui.fs; if (!(qty > 0)) return toast('Enter a quantity above zero');
    const dd = ensureDay(ui.date);
    if (entryId) {
      const r = findEntry(entryId); if (r) { dd.meals[r.m].splice(r.i, 1); }
      dd.meals[meal].push(Object.assign({ id: entryId }, pickNutri(food), { qty }));
    } else {
      dd.meals[meal].push(Object.assign({ id: uid() }, pickNutri(food), { qty }));
      S.recent = [pickNutri(food)].concat(S.recent.filter(r => !(r.name === food.name && r.unit === food.unit))).slice(0, 20);
    }
    save(); closeSheet(); render(); toast(entryId ? 'Entry updated' : 'Added to diary');
  },
  delEntry() { const r = findEntry(ui.fs.entryId); if (r) { S.days[ui.date].meals[r.m].splice(r.i, 1); save(); } closeSheet(); render(); },
  water(el) { const dd = ensureDay(ui.date); dd.water = Math.max(0, dd.water + (+el.dataset.ml)); save(); render(); },
  addWorkout() { openWorkout(); },
  editWorkout(el) { const w = ((S.days[ui.date] || {}).workouts || []).find(x => x.id === el.dataset.id); if (w) openWorkout(w); },
  delWorkout() { const dd = ensureDay(ui.date); dd.workouts = dd.workouts.filter(w => w.id !== ui.wo.id); save(); closeSheet(); render(); },
  range(el) { ui.range = +el.dataset.r; render(); },
  addWeight() { openWeight(); },
  delWeight(el) { if (!confirm('Delete this weight entry?')) return; S.weights = S.weights.filter(w => w.d !== el.dataset.d); if (S.goals && S.goals.auto) recalcGoals(); save(); render(); },
  editProfile() { openSheet(sheetTop('Edit profile') + profileForm(S.profile, false)); },
  editGoals() { openGoals(); },
  autoGoals() { recalcGoals(); save(); closeSheet(); render(); toast('Goals recalculated'); },
  export() { download(`thali-backup-${todayStr()}.json`, JSON.stringify(S, null, 2), 'application/json'); },
  exportCsv() {
    const rows = [['date', 'meal', 'food', 'servings', 'serving_size', 'kcal', 'protein_g', 'carbs_g', 'fat_g']];
    Object.keys(S.days).sort().forEach(d => MEALS.forEach(([m]) => mealList(S.days[d], m).forEach(e => rows.push([d, m, e.name, e.qty, e.unit, Math.round(e.k * e.qty), n1(e.p * e.qty), n1(e.c * e.qty), n1(e.f * e.qty)]))));
    download(`thali-food-log-${todayStr()}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  },
  importPick() { $('#importFile').click(); },
  reset() { if (confirm('Erase all Thali data on this device? This cannot be undone. Consider making a backup first.')) { S = defaults(); save(); ui.tab = 'diary'; render(); } }
};
function pickNutri(f) { return { name: f.name, unit: f.unit, g: f.g || 0, k: f.k, p: f.p, c: f.c, f: f.f }; }

/* ---------- events ---------- */
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && actions[el.dataset.a]) { e.preventDefault(); actions[el.dataset.a](el, e); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').classList.contains('hidden')) closeSheet(); });
const handlers = {
  q(el) { showResults(el.value); },
  qty(el) { ui.fs.qty = parseFloat(el.value) || 0; const g = $('#fg'); if (g && ui.fs.food.g) g.value = Math.round(ui.fs.qty * ui.fs.food.g); updatePreview(); },
  grams(el) { const g = parseFloat(el.value) || 0; ui.fs.qty = ui.fs.food.g ? Math.round((g / ui.fs.food.g) * 100) / 100 : 0; const q = $('#fq'); if (q) q.value = n1(ui.fs.qty); updatePreview(); },
  meal(el) { ui.fs.meal = el.value; },
  wtype() { ui.wo.manual = false; autoKcal(); },
  wmin() { autoKcal(); },
  wkcal() { ui.wo.manual = true; },
  addback(el) { S.settings.addBack = el.checked; save(); }
};
document.addEventListener('input', e => { const h = handlers[e.target.dataset.i]; if (h) h(e.target); });
document.addEventListener('change', e => { if (e.target.dataset.i === 'meal' && ui.fs) ui.fs.meal = e.target.value; });
document.addEventListener('change', e => {
  if (e.target.id !== 'importFile' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result); if (!o || typeof o !== 'object' || !o.days) throw new Error('bad');
      if (!confirm('Replace the data on this device with this backup?')) return;
      S = Object.assign(defaults(), o, { settings: Object.assign({ addBack: true }, o.settings) }); save(); render(); toast('Backup restored');
    } catch (err) { toast('That file is not a valid Thali backup.'); }
  };
  r.readAsText(e.target.files[0]); e.target.value = '';
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const D = new FormData(f), num = k => parseFloat(D.get(k)), kind = f.dataset.form;
  if (kind === 'profile') {
    const onboarding = !S.profile, prev = S.profile || {};
    const p = { name: String(D.get('name') || '').trim(), sex: D.get('sex'), age: Math.round(num('age')), height: num('height'), weight: num('weight'), goalWeight: num('goalWeight') || null, activity: num('activity'), pace: num('pace') };
    if (!(p.age >= 10 && p.age <= 100 && p.height >= 100 && p.height <= 250 && p.weight >= 25 && p.weight <= 300)) return toast('Please check your age, height and weight.');
    S.profile = p; if (onboarding || Math.abs(p.weight - latestWeight()) > 0.001) setWeight(todayStr(), p.weight);
    if (onboarding || !S.goals || S.goals.auto) recalcGoals();
    save(); closeSheet(); ui.tab = 'diary'; render(); toast(onboarding ? 'Your plan is ready' : 'Profile saved');
  } else if (kind === 'custom') {
    const food = { id: uid(), name: String(D.get('name')).trim(), unit: String(D.get('unit') || '1 serving').trim(), g: num('g') || 0, k: num('k') || 0, p: num('p') || 0, c: num('c') || 0, f: num('f') || 0 };
    if (!food.name) return;
    if (D.get('save')) S.custom.unshift(food); save(); openFood(food, 1, ui.meal);
  } else if (kind === 'workout') {
    const dd = ensureDay(ui.date), w = { id: ui.wo.id || uid(), type: D.get('type'), min: num('min'), km: num('km') || 0, kcal: num('kcal') || 0 };
    const i = dd.workouts.findIndex(x => x.id === w.id); if (i >= 0) dd.workouts[i] = w; else dd.workouts.push(w);
    save(); closeSheet(); render(); toast('Workout saved');
  } else if (kind === 'weight') {
    setWeight(D.get('d'), num('kg')); save(); closeSheet(); render(); toast('Weight saved');
  } else if (kind === 'goals') {
    S.goals = { auto: false, k: num('k'), p: num('p'), c: num('c'), f: num('f'), water: num('water') }; save(); closeSheet(); render(); toast('Goals saved');
  }
});

/* ---------- boot ---------- */
if (S.profile && !S.goals) recalcGoals();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
