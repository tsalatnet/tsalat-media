// ختمة جماعية — «الورد الشخصي» (web app 1.8, same rules as core/personal/PersonalPlan.kt of the Android app 1.13).
// 100 % on this phone: localStorage only, no server call, works offline. No reminders on iPhone (a web app
// cannot ring when closed): the moments only cut the day's portion. Same JSON shape as the Android PersonalStore.
"use strict";

// ─── calendar days (the phone's local calendar → epoch days, weekday 1 = Monday … 7 = Sunday) ───
const Civil = {
  of(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); },
  today() { return this.of(new Date()); },
  weekday(day) { return ((new Date(day * 86400000).getUTCDay() + 6) % 7) + 1; },
  text(day) { const d = new Date(day * 86400000); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; },
  iso(day) { const d = new Date(day * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; },
  fromIso(s) { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ""); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; },
};

// The moments in the order of the day (no time of day without the prayer times: the order of the prayers).
const MOMENTS = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA", "SLEEP"];
const MOMENT_DEFAULT = { FAJR: 30, DHUHR: 25, ASR: 25, MAGHRIB: 15, ISHA: 25, SLEEP: 22 * 60 + 30, TIME: 8 * 60 };
const MIN_DAYS = 3;            // «لم يفقه من قرأه في أقل من ثلاث»
const PRESETS = [
  { id: "MONTH", days: 30, unit: "HIZB", moments: ["FAJR", "MAGHRIB"] },
  { id: "TWO_MONTHS", days: 60, unit: "PAGE", moments: ["FAJR", "SLEEP"] },
  { id: "YEAR", days: 365, unit: "PAGE", moments: ["FAJR"] },
  { id: "HALF_MONTH", days: 15, unit: "HIZB", moments: ["FAJR", "ASR", "MAGHRIB", "ISHA"] },
];

// ─── the plan (pure) ───
const PP = {
  make(created, startPage, startDay, endDay, unit = "PAGE", moments = ["FAJR"], rest = []) {
    return { created, start_page: startPage, start_day: startDay, end_day: endDay, unit, rest, moments: moments.map((k) => ({ k, m: MOMENT_DEFAULT[k] })),
      nudge: true, next: startPage, log: {}, finished_at: null };
  },
  preset(e, created, day) { return this.make(created, 1, day, day + e.days - 1, e.unit, e.moments); },
  presetOf(p, day) {
    return PRESETS.find((e) => p.end_day - day + 1 === e.days && p.unit === e.unit && !p.rest.length &&
      p.moments.length === e.moments.length && e.moments.every((k) => p.moments.some((m) => m.k === k))) || null;
  },
  finished: (p) => p.next > PAGES,
  total: (p) => PAGES - p.start_page + 1,
  read: (p) => Math.max(0, Math.min(PP.total(p), p.next - p.start_page)),
  isReadingDay: (p, day) => !p.rest.includes(Civil.weekday(day)),
  readingDays(p, from, to) { let n = 0; for (let d = from; d <= to; d++) if (this.isReadingDay(p, d)) n++; return n; },
  nextAtStartOf: (p, day) => Math.max(p.start_page, p.next - (p.log[day] || 0)),
  basePerDay(p) { return Math.ceil(this.total(p) / Math.max(1, this.readingDays(p, p.start_day, p.end_day))); },
  readTo(p, to, day, now) {
    const n = Math.min(to + 1, PAGES + 1);
    if (n <= p.next) return p;
    const log = {}; for (const [d, v] of Object.entries(p.log)) if (+d > day - 400) log[d] = v;
    log[day] = (p.log[day] || 0) + (n - p.next);
    return { ...p, next: n, log, finished_at: n > PAGES ? now : p.finished_at };
  },
  setPosition(p, page, day, now) {
    const n = Math.max(p.start_page, Math.min(PAGES + 1, page));
    if (n >= p.next) return this.readTo(p, n - 1, day, now);
    return { ...p, next: n, log: { ...p.log, [day]: Math.max(0, (p.log[day] || 0) - (p.next - n)) }, finished_at: null };
  },
  perDayFrom: (start, days) => Math.ceil((PAGES - start + 1) / days),
  portionEnd(unit, start, days) {
    if (unit === "PAGE") return Math.min(PAGES, start + this.perDayFrom(start, days) - 1);
    const after = HIZB_START.filter((s) => s > start), per = Math.ceil((after.length + 1) / days);
    return after.length >= per ? after[per - 1] - 1 : PAGES;
  },
  // [from, to] cut between n moments, earlier moments one page more; by hizb, on the hizb starts when there are enough.
  slices(range, n, unit = "PAGE") {
    if (!range || n <= 0) return [];
    const [from, to] = range, count = to - from + 1;
    if (unit === "HIZB" && n > 1) {
      const starts = HIZB_START.filter((s) => s >= from + 1 && s <= to);
      if (starts.length >= n - 1) {
        const cuts = [];
        for (let i = 1; i < n; i++) {
          const ideal = from + Math.floor((count * i) / n), prev = cuts.length ? cuts[cuts.length - 1] : from;
          const all = starts.filter((c) => c > prev), left = all.slice(0, Math.max(0, all.length - (n - 1 - i)));
          if (!left.length) break;
          cuts.push(left.reduce((b, c) => (Math.abs(c - ideal) < Math.abs(b - ideal) ? c : b)));
        }
        if (cuts.length === n - 1) {
          const b = [from, ...cuts, to + 1];
          return Array.from({ length: n }, (_, i) => ({ moment: i, from: b[i], to: b[i + 1] - 1 }));
        }
      }
    }
    const q = Math.floor(count / n), r = count % n, out = [];
    let f = from;
    for (let i = 0; i < n; i++) { const size = q + (i < r ? 1 : 0); if (size) { out.push({ moment: i, from: f, to: f + size - 1 }); f += size; } }
    return out;
  },
  // Today's portion: what is left at the start of the day ÷ the reading days left (the goal's day included).
  today(p, day) {
    const start = this.nextAtStartOf(p, day), readToday = p.next - start, rest = !this.isReadingDay(p, day), overdue = day > p.end_day;
    const daysLeft = Math.max(1, this.readingDays(p, day, p.end_day)), base = this.basePerDay(p);
    let pages = null, slices = [], perDay = 0;
    if (start <= PAGES && !rest) { pages = [start, this.portionEnd(p.unit, start, daysLeft)]; slices = this.slices(pages, p.moments.length, p.unit); perDay = pages[1] - pages[0] + 1; }
    else if (start <= PAGES) perDay = this.perDayFrom(start, daysLeft);
    const done = !pages || readToday >= pages[1] - pages[0] + 1;
    const behind = overdue || (perDay * 4 > base * 5 && perDay - base >= 3);
    return { day, pages, slices, readToday, restDay: rest, perDay, basePerDay: base, overdue, done, behind };
  },
  extendedEnd(p, day) {
    const left = PAGES - this.nextAtStartOf(p, day) + 1, base = Math.max(1, this.basePerDay(p));
    let end = Math.max(day, p.end_day);
    while (Math.ceil(left / Math.max(1, this.readingDays(p, day, end))) > base && end < day + 3660) end++;
    return end;
  },
  perDayFor(startPage, firstDay, days, rest) {
    let n = 0; for (let d = firstDay; d < firstDay + days; d++) if (!rest.includes(Civil.weekday(d))) n++;
    return Math.ceil((PAGES - startPage + 1) / Math.max(1, n));
  },
};

// ─── this phone's storage ───
const Personal = {
  get() { try { const p = JSON.parse(store.get("personal", "null")); return p && p.next ? p : null; } catch { return null; } },
  save(p, finishedNow = false) {
    store.set("personal", p ? JSON.stringify(p) : null);
    if (finishedNow) store.set("personal_done", this.done() + 1);
  },
  done: () => +store.get("personal_done", 0) || 0,
  pending() { const p = this.get(); return !!p && !PP.finished(p) && !PP.today(p, Civil.today()).done; },
};
const mushafImg = (n) => MUSHAF + (n <= 604 ? String(n).padStart(3, "0") : "dua" + (n - 604)) + ".jpg";
// The next ~3 days of pages fetched once while online: the service worker keeps them for reading offline.
function prefetchPersonal(p) {
  if (!p || PP.finished(p) || prefetchPersonal.done || !navigator.onLine) return;
  prefetchPersonal.done = true;
  const to = Math.min(PAGES, p.next + PP.today(p, Civil.today()).perDay * 3 + 2);
  (async () => { for (let n = p.next; n <= to; n++) { try { await fetch(mushafImg(n)); } catch { return; } } })();
}

// ─── views ───
const momentName = (k) => t().moments[k] || k;
function vPersonalHome() {
  return `${st.offline ? `<div class="card warn"><b>📶 ${t().offlineHomeTitle}</b><p class="sm">${t().offlineHomeText}</p></div>` : ""}
    ${vPersonalCard()}${btn(t().browseMushaf, "mushaf", "", "outline wide")}`;
}
function vPersonalCard() {
  const p = Personal.get(), done = Personal.done(), day = Civil.today();
  if (!p) return `<div class="card"><h2>📖 ${t().personalTitle}</h2><p class="mut">${t().personalIntro}</p>
    ${done ? `<p class="gold-t">${t().personalDoneCount(done)}</p>` : ""}${btn(t().personalStart, "pSetup", "", "gold wide")}</div>`;
  if (PP.finished(p)) return `<div class="hcard center col"><div class="big">🌟</div><h2>${t().personalFinishedTitle}</h2>
    <p>${t().personalDoneCount(done)}</p>${btn(t().personalNew, "pNew", "", "gold wide")}</div>`;
  prefetchPersonal(p);
  const td = PP.today(p, day), read = PP.read(p), total = PP.total(p);
  let today;
  if (td.restDay) today = `<p class="b">${t().personalRestDay}</p>`;
  else if (td.done) today = `<p class="b">${t().personalDoneToday}</p>`;
  else today = `<small class="o7">${t().personalToday}</small><h2>${t().pagesShort} ${t().rng(td.pages[0], td.pages[1])}</h2>
    <small class="gs">${h(Mushaf.range(td.pages[0], td.pages[1], st.lang))}</small>
    ${td.slices.length > 1 ? td.slices.map((sl) => { const lbl = momentName(p.moments[sl.moment].k), ok = p.next > sl.to;
      return `<div class="row sp sm"><span>${ok ? "✓ " : ""}${lbl}</span><b>${t().rng(sl.from, sl.to)}</b></div>`; }).join("") : ""}`;
  const late = td.behind ? `<p class="lt sm">${td.overdue ? t().personalOverdue : t().personalBehind(td.perDay)}</p>
    ${btn(t().personalExtend(Civil.text(PP.extendedEnd(p, day))), "pExtend", "", "soft wide")}` : "";
  const label = td.done || td.restDay ? t().personalKeepReading : p.next > (td.pages ? td.pages[0] : p.next) ? t().personalContinue(p.next) : t().personalReadToday;
  return `<div class="hcard"><div class="row sp"><b>📖 ${t().personalTitle}</b><button class="ic" data-a="pEdit">⚙️</button></div>
    <div class="row gap">${ring(read / total, 96, "#D4AF37", `<b>${Math.floor((read / total) * 100)}${t().pct}</b><small>${LTR(read + "/" + total)}</small>`)}
    <div class="grow">${today}</div></div>
    <small class="o8">${t().personalFinishOn(Civil.text(p.end_day), Math.max(0, p.end_day - day))}</small>${late}
    <button class="btn gold wide" data-a="pRead">${label}</button></div>
    ${done ? `<p class="gold-t center">${t().personalDoneCount(done)}</p>` : ""}`;
}

// The setup: a new plan starts filled with the most common one (MONTH): most readers only press «ابدأ».
function personalDraft(edit) {
  const day = Civil.today(), p = edit ? Personal.get() : null, base = p || PP.preset(PRESETS[0], 0, day);
  return { edit: !!p, end: base.end_day, unit: base.unit, moments: base.moments.map((m) => m.k), rest: [...base.rest],
    fromStart: true, startPage: "", details: !!p, preset: p ? null : "MONTH" };
}
function draftPlan(d) {
  const day = Civil.today(), p = d.edit ? Personal.get() : null;
  const start = p ? p.start_page : d.fromStart ? 1 : Math.max(1, Math.min(PAGES, +d.startPage || 1));
  const base = p || PP.make(Date.now(), start, day, d.end);
  const moments = MOMENTS.filter((k) => d.moments.includes(k)).map((k) => (p && p.moments.find((m) => m.k === k)) || { k, m: MOMENT_DEFAULT[k] });
  return { ...base, end_day: d.end, unit: d.unit, rest: [...d.rest].sort(), moments: moments.length ? moments : [{ k: "FAJR", m: 30 }] };
}
function vPersonalSetup() {
  const d = st.pdraft, day = Civil.today(), c = draftPlan(d), days = d.end - day + 1;
  const valid = d.edit ? d.end >= day : days >= MIN_DAYS, td = PP.today(c, day);
  const rd = Math.max(1, PP.readingDays(c, day, d.end)), from = PP.nextAtStartOf(c, day);
  const hizbs = d.unit === "HIZB" ? Math.ceil((HIZB_START.filter((s) => s > from).length + 1) / rd) : null;
  const chosen = d.edit ? null : PP.presetOf(c, day);
  let out = "";
  if (!d.edit) {
    out += `<h4>${t().presetChoose}</h4>` + PRESETS.map((e, i) => `<div class="card tap prow ${chosen && chosen.id === e.id ? "on" : ""}" data-a="pPreset" data-x="${e.id}">
      <span class="radio"></span><div class="grow"><b>${t().presetTitle[e.id]}</b>${i === 0 ? ` <small class="gold-t">${t().presetRecommended}</small>` : ""}
      <p class="mut sm">${t().presetText[e.id]}</p><p class="xs">${t().durationLabel(e.days)} · ≈ ${t().pagesN(PP.perDayFor(1, day, e.days, []))}</p></div></div>`).join("") +
      `<div class="card tap prow ${chosen ? "" : "on"}" data-a="pCustom"><span class="radio"></span><div class="grow"><b>${t().presetTitle.CUSTOM}</b><p class="mut sm">${t().presetText.CUSTOM}</p></div></div>`;
  }
  out += `<div class="card hl">${!valid ? `<p class="lt b">${t().personalTooShort}</p>` :
    `<b>${t().personalSummary(td.perDay, Math.floor((td.perDay * 6 + 4) / 5), hizbs)}</b><p class="sm">${t().personalEndOn(Civil.text(d.end))}</p>
    ${td.slices.map((sl) => `<div class="row sp sm"><span>${momentName(c.moments[sl.moment].k)}</span><b>${t().pagesShort} ${t().rng(sl.from, sl.to)}</b></div>`).join("")}
    <p class="xs mut">${t().personalNoReminder}</p>`}</div>`;
  if (!d.edit) out += btn(t().personalCreate, "pCreate", "", "gold wide " + (valid ? "" : "off"));
  if (!d.edit && !d.details) out += `<div class="center">${btn(t().personalDetails, "pDetails", "", "text")}</div>`;
  if (d.details) {
    const durs = [7, 15, 30, 60, 90, 365];
    out += `<h4>${t().personalDuration}</h4><div class="chips">${durs.map((n) => `<button class="fchip ${days === n ? "on" : ""}" data-a="pDays" data-x="${n}">${t().durationLabel(n)}</button>`).join("")}</div>
      <label class="row sm">${t().personalOtherDate} <input type="date" id="pdate" class="grow" min="${Civil.iso(day + (d.edit ? 0 : MIN_DAYS - 1))}" value="${Civil.iso(d.end)}"></label>
      <p class="xs gold-t">${t().personalHadith}</p>`;
    if (!d.edit) out += `<h4>${t().personalFrom}</h4><div class="row"><button class="fchip ${d.fromStart ? "on" : ""}" data-a="pFrom" data-x="1">${t().personalFromStart}</button>
      <button class="fchip ${d.fromStart ? "" : "on"}" data-a="pFrom" data-x="0">${t().personalFromPage}</button>
      ${d.fromStart ? "" : `<input id="pstart" inputmode="numeric" maxlength="3" placeholder="${t().pageNumber}" value="${h(d.startPage)}">`}</div>`;
    out += `<h4>${t().personalUnit}</h4><div class="row"><button class="fchip grow ${d.unit === "PAGE" ? "on" : ""}" data-a="pUnit" data-x="PAGE">${t().personalUnitPages}</button>
      <button class="fchip grow ${d.unit === "HIZB" ? "on" : ""}" data-a="pUnit" data-x="HIZB">${t().personalUnitHizb}</button></div>
      <h4>${t().personalMomentsWeb}</h4><div class="chips">${MOMENTS.map((k) => `<button class="fchip ${d.moments.includes(k) ? "on" : ""}" data-a="pMoment" data-x="${k}">${momentName(k)}</button>`).join("")}</div>
      <p class="xs mut">${t().personalMomentsNoteWeb}</p>
      <h4>${t().personalRest}</h4><div class="chips">${[5, 6, 7, 1, 2, 3, 4].map((w) => `<button class="fchip ${d.rest.includes(w) ? "on" : ""}" data-a="pRest" data-x="${w}">${t().weekdays[w - 1]}</button>`).join("")}</div>`;
  }
  if (d.edit) out += btn(t().save, "pSave", "", "wide " + (valid ? "" : "off")) +
    `<div class="row">${btn(t().personalPosition, "pPositionAsk", "", "outline grow")}</div>
    <div class="center">${btn(t().personalStop, "pStopAsk", "", "text red")}</div>`;
  return sub(t().personalSetupTitle(d.edit)) + `<main>${out}</main>`;
}

// ─── reader (personal mode): the bars of the shared reader ───
function personalReaderBar(sc, n) {
  const p = Personal.get(); if (!p) return;
  const pg = Math.min(n, PAGES), day = Civil.today();
  if (n <= PAGES && pg > p.next) Personal.save(PP.readTo(p, pg - 1, day, Date.now()));      // the pages before this one are read
  const q = Personal.get(), td = PP.today(q, day), total = PP.total(q), read = Math.max(1, Math.min(total, pg - q.start_page + 1));
  document.getElementById("rc").textContent = LTR(read + "/" + total);
  document.getElementById("rl").style.width = (read / total) * 100 + "%";
  if (td.pages && n <= PAGES && pg >= td.pages[0] && pg <= td.pages[1])
    document.getElementById("bb").insertAdjacentHTML("beforeend", `<b>${h(t().personalTodayBand(pg - td.pages[0] + 1, td.pages[1] - td.pages[0] + 1))}</b>`);
  let b = "";
  if (n > PAGES) b = "";
  else if (PP.finished(q)) b = `<p class="ok center">${t().personalFinishedTitle}</p>`;
  else if (pg >= PAGES) b = `<button class="btn wide gold" data-a="pKhatm">${t().personalKhatmBtn}</button>`;
  else if (td.pages && !td.done && pg >= td.pages[1]) b = `<button class="btn wide gold" data-a="pDoneToday">${t().personalTodayFinishedBtn}</button>`;
  else if (td.done && !td.restDay) b = `<p class="ok center sm">${t().personalTodayDoneNote}</p>`;
  document.getElementById("rbtn").innerHTML = b;
  return (td.pages && pg >= td.pages[1]) || pg >= PAGES;
}

// ─── actions ───
Object.assign(A, {
  pSetup() { st.pdraft = personalDraft(false); push({ s: "psetup" }); },
  pEdit() { st.pdraft = personalDraft(true); push({ s: "psetup" }); },
  pNew() { Personal.save(null); A.pSetup(); },
  pPreset(x) { const e = PRESETS.find((q) => q.id === x), day = Civil.today();
    Object.assign(st.pdraft, { end: day + e.days - 1, unit: e.unit, moments: [...e.moments], rest: [], details: false }); render(); },
  pCustom() { st.pdraft.details = true; render(); },
  pDetails() { st.pdraft.details = true; render(); },
  pDays(x) { st.pdraft.end = Civil.today() + +x - 1; render(); },
  pFrom(x) { st.pdraft.fromStart = x === "1"; render(); },
  pUnit(x) { st.pdraft.unit = x; render(); },
  pMoment(x) { const m = st.pdraft.moments, i = m.indexOf(x); if (i >= 0) { if (m.length > 1) m.splice(i, 1); } else m.push(x); render(); },
  pRest(x) { const r = st.pdraft.rest, w = +x, i = r.indexOf(w); if (i >= 0) r.splice(i, 1); else if (r.length < 6) r.push(w); render(); },
  pCreate() { const d = st.pdraft, day = Civil.today(); if (d.end - day + 1 < MIN_DAYS) return;
    const c = draftPlan(d); Personal.save({ ...c, created: Date.now(), start_day: day, next: c.start_page, log: {}, finished_at: null });
    st.stack = []; st.tab = "2"; st.adminTab = false; render(); },
  pSave() { const d = st.pdraft; if (d.end < Civil.today()) return; Personal.save(draftPlan(d)); st.stack.pop(); render(); toast(t().saved); },
  pExtend() { const p = Personal.get(); if (!p) return; Personal.save({ ...p, end_day: PP.extendedEnd(p, Civil.today()) }); render(); },
  pPositionAsk() { st.dialog = { title: t().personalPosition, text: t().personalPositionText, okLabel: t().save,
    body: `<input id="acode" inputmode="numeric" maxlength="3" placeholder="${t().pageNumber}">`,
    ok: (v) => { const n = +v, p = Personal.get(); if (!p || !(n >= 1 && n <= PAGES)) return;
      Personal.save(PP.setPosition(p, n + 1, Civil.today(), Date.now())); st.stack.pop(); render(); toast(t().saved); } }; render(); },
  pStopAsk() { st.dialog = { title: t().personalStop, text: t().personalStopText, okLabel: t().personalStopOk,
    ok: () => { Personal.save(null); st.stack.pop(); render(); } }; render(); },
  pRead() { const p = Personal.get(); if (!p) return; push({ s: "reader", key: "personal#" + p.created, personal: true }); },
  pDoneToday() { const p = Personal.get(), day = Civil.today(); if (!p) return; const td = PP.today(p, day); if (!td.pages) return;
    const q = PP.readTo(p, td.pages[1], day, Date.now()); Personal.save(q);
    let nd = day + 1; while (!PP.isReadingDay(q, nd) && nd < day + 8) nd++;
    const nx = PP.finished(q) ? null : PP.today(q, nd).pages;
    st.dialog = { title: t().personalDoneTitle, text: t().personalDoneTextWeb(nx && nx[0], nx && nx[1]), okLabel: t().alhamdulillah, cancel: false,
      ok: () => { closeReader(); st.stack.pop(); render(); } }; render(); },
  pKhatm() { const p = Personal.get(); if (!p) return; const q = PP.readTo(p, PAGES, Civil.today(), Date.now()); Personal.save(q, !PP.finished(p));
    const sc = topS();
    st.dialog = { title: t().personalKhatmTitle, text: t().personalKhatmText, okLabel: t().alhamdulillah, cancel: false,
      ok: () => { st.dialog = null; render(); if (sc && sc.go) sc.go(605); } }; render(); },
});
document.addEventListener("change", (e) => {
  if (e.target.id === "pdate" && st.pdraft) { const d = Civil.fromIso(e.target.value); if (d !== null) { st.pdraft.end = d; render(); } }
  if (e.target.id === "pstart" && st.pdraft) { st.pdraft.startPage = e.target.value; render(); }
});
