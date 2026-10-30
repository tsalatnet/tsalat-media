// ختمة جماعية — web app for iPhone (installed on the home screen). Same server, same rules as the
// Android app: number bound to this device (random token in localStorage), Supabase khatma_* RPCs.
"use strict";
const API = "https://xecnhwgdymydmbhwzhaj.supabase.co/rest/v1/rpc/";
const KEY = "sb_publishable_p7NtGN0uUUkRMRGcqu1Rxg_DQBCRUxV";
const INVITE_URL = "https://tsalatnet.github.io/tsalat-media/k/?c=";
const MUSHAF = "../mushaf/";   // 001.jpg … 604.jpg, dua1.jpg, dua2.jpg
const VERSION = "1.7";

// ─── storage (localStorage can throw in private mode: the app then works for this visit only) ───
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("k_" + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { if (v === null) localStorage.removeItem("k_" + k); else localStorage.setItem("k_" + k, String(v)); } catch {} },
};
function token() {
  let t = store.get("token");
  if (!t) { const b = new Uint8Array(32); crypto.getRandomValues(b); t = [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); store.set("token", t); }
  return t;
}
const userId = () => +store.get("user", 0);

// ─── server ───
class Failure extends Error { constructor(raw) { super(raw); this.raw = raw; } }
async function rpc(fn, args) {
  let r;
  try {
    r = await fetch(API + fn, { method: "POST", body: JSON.stringify(args),
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" } });
  } catch { throw new Failure("network"); }
  const txt = await r.text();
  if (!r.ok) { let m = ""; try { m = JSON.parse(txt).message || ""; } catch {} throw new Failure(m || "other"); }
  return txt ? JSON.parse(txt) : null;
}
const auth = (extra = {}) => ({ p_user: userId(), p_token: token(), ...extra });

// ─── state ───
const st = {
  lang: store.get("lang", "ar"), phase: "loading", me: null, ov: null, busy: false,
  stack: [], adminTab: false, adminSection: 0, dialog: null, toast: null, wiz: null, sheet: null,
};
const t = () => T[st.lang];
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ts = (s) => (s ? Date.parse(s) : null);
const pad = (n) => String(n).padStart(2, "0");
const date = (s) => { const d = ts(s) ? new Date(ts(s)) : null; return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "—"; };
const dateTime = (s) => { const d = ts(s) ? new Date(ts(s)) : null; return d ? `${date(s)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "—"; };
function remaining(deadline) {
  const d = ts(deadline); if (!d || Date.now() >= d) return null;
  const m = Math.floor((d - Date.now()) / 60000);
  return m >= 48 * 60 ? t().left(Math.floor(m / 1440), Math.floor((m % 1440) / 60), 0) : t().left(0, Math.floor(m / 60), m % 60);
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function toast(text) { st.toast = text; render(); clearTimeout(toast.timer); toast.timer = setTimeout(() => { st.toast = null; render(); }, 3500); }
async function act(fn, ok) {
  if (st.busy) return; st.busy = true; render();
  try { await fn(); if (ok) toast(typeof ok === "function" ? ok() : ok); }
  catch (e) { toast(errorText(e)); }
  finally { st.busy = false; render(); }
}
function errorText(e) { const raw = (e && e.raw) || "other"; const k = raw.split(":")[0]; return t().errors[k] || t().errors.other + " (" + raw + ")"; }

// ─── data ───
async function reload() {
  const me = await rpc("khatma_me", auth());
  st.me = me;
  if (me.lang !== st.lang) rpc("khatma_set_lang", auth({ p_lang: st.lang })).catch(() => {});
  // No push in the iPhone web app: the admin sees «📱 آيفون» instead of a silent failure.
  if (!reload.hello) rpc("khatma_hello", auth({ p_version: "web " + VERSION })).then(() => (reload.hello = true)).catch(() => {});
  if (!reload.pushSent) rpc("khatma_set_push", auth({ p_platform: "ios-web", p_sub: null, p_ok: false })).then(() => (reload.pushSent = true)).catch(() => {});
  if (me.is_admin && (!st.ov || st.adminTab || st.stack.length)) st.ov = await rpc("khatma_admin_overview", auth());
  st.phase = !me.name ? "name" : !(me.is_admin || me.links.some((l) => l.status === "accepted")) ? "gate" : "home";
  const code = store.get("invite");
  if (me.name && code) {
    store.set("invite", null);
    try { const r = await rpc("khatma_join", auth({ p_code: code })); toast(r.status === "accepted" ? t().memberOf(r.admin) : t().requestSent(r.admin)); st.me = await rpc("khatma_me", auth()); }
    catch (e) { toast(errorText(e)); }
  }
  // Named, in no group, no request: ask the admin(s) at once (no more «أرسل رقمي» through another app).
  if (me.name && st.phase === "gate" && !me.links.length && !store.get("invite") && !reload.joinAsked) {
    reload.joinAsked = true;
    try { const r = await rpc("khatma_request_join", auth()); st.me = await rpc("khatma_me", auth()); if (r.sent > 0) joinSent(r.admin); } catch (e) {}
  }
}
function joinSent(admin) { st.dialog = { title: t().joinSentTitle, text: t().joinSentText(h(admin), st.me.id), cancelLabel: t().ok }; }
async function start() {
  st.phase = "loading"; render();
  try {
    if (!userId()) store.set("user", await rpc("khatma_register", { p_token: token() }));
    try { await reload(); }
    catch (e) {
      if (!String(e.raw).startsWith("khatma_denied")) throw e;
      store.set("user", null); store.set("token", null);          // database reset: new number
      store.set("user", await rpc("khatma_register", { p_token: token() }));
      await reload();
    }
  } catch (e) { if (!st.me) st.phase = "offline"; toast(errorText(e)); }
  render();
}
async function refresh(withRender = true) {
  try { await reload(); } catch {}
  if (withRender && !(topS() && topS().s === "reader")) render();
}
const topS = () => st.stack[st.stack.length - 1];
function push(s) { st.stack.push(s); render(); window.scrollTo(0, 0); }
function back() { if (st.dialog) { st.dialog = null; } else if (st.sheet) { st.sheet = null; } else st.stack.pop(); render(); }
const desc = (arr, f = (x) => x) => [...arr].sort((a, b) => f(b) - f(a));   // members: always by decreasing number
const member = (id) => st.ov && st.ov.members.find((m) => m.id === id);

// ─── small views ───
function memberName(id, name, bold = true) {
  return `<span class="mn"><span class="mnum">${LTR(id)}</span><span class="${bold ? "b" : ""}">${h(name || "—")}</span></span>`;
}
function statusChip(s, late) {
  const k = s === "done" || s === "given" ? "done" : late ? "late" : s;
  const lbl = s === "done" ? t().stDone : s === "given" ? t().stGiven : late ? t().stLate : s === "started" ? t().stStarted : t().stAssigned;
  return `<span class="chip ${k}"><i></i>${lbl}</span>`;
}
function ring(p, size, color, inner) {
  const r = 42, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, p)));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" class="track"/>
    <circle cx="50" cy="50" r="${r}" style="stroke:${color}" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 50 50)"/></svg><div class="in">${inner}</div></div>`;
}
const bar = (parts, late) => `<div class="seg">${parts.map((p) => `<i class="${p.status === "done" ? "done" : late ? "late" : p.status}" style="flex:${p.to - p.from + 1}"></i>`).join("")}</div>`;
const btn = (label, a, x = "", cls = "") => `<button class="btn ${cls}" data-a="${a}" data-x="${h(x)}" ${st.busy ? "disabled" : ""}>${label}</button>`;
const sub = (title) => `<div class="bar"><button class="ic" data-a="back">${t().back}</button><div class="ttl">${h(title)}</div></div>`;
const hero = (title, subtitle, extra = "") => `<div class="hero"><button class="lang" data-a="lang">${st.lang === "ar" ? "FR" : "ع"}</button>
  <img src="icon-192.png" class="hlogo" alt=""><h1>${h(title)}</h1><p>${h(subtitle)}</p>${extra}</div>`;
const badge = (id, label) => `<div class="nbadge"><small>${label}</small><b>${LTR(id)}</b></div>`;

// ─── screens ───
function vInstall() {
  const c = new URLSearchParams(location.search).get("c");
  const shareIcon = `<svg viewBox="0 0 24 24" class="si"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  const inApp = /WhatsApp|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);
  return `${hero(t().appName, t().tagline)}<main>
    ${inApp ? `<div class="card warn">${t().installSafari}</div>` : ""}
    ${c ? `<div class="card hl">${t().keepCode(h(c.toUpperCase()))}</div>` : ""}
    <div class="card"><h2>${t().installTitle}</h2><p class="mut">${t().installIntro}</p>
      <ol class="steps"><li><span class="n">1</span><div>${t().installStep1}<div class="demo">${shareIcon}</div></div></li>
      <li><span class="n">2</span><div>${t().installStep2}<div class="demo"><span class="menu">＋ ${st.lang === "ar" ? "إضافة إلى الشاشة الرئيسية" : "Sur l'écran d'accueil"}</span></div></div></li>
      <li><span class="n">3</span><div>${t().installStep3}<div class="demo"><img src="icon-192.png" class="mini" alt=""></div></div></li></ol>
      <p class="note">${t().installNote}</p></div>
    <div class="arrow">⬇︎</div></main>`;
}
function vLoading() { return `${hero(t().appName, t().tagline)}<div class="center"><div class="spin"></div></div>`; }
function vOffline() { return `${hero(t().appName, t().tagline)}<main class="center col"><div class="big">📶</div><h2>${t().offlineTitle}</h2><p class="mut">${t().offlineText}</p>${btn(t().retry, "start")}</main>`; }
function vName() {
  return `${hero(t().welcome, t().tagline, badge(userId(), t().yourNumber))}<main>
    <p class="mut">${t().numberExplained}</p><h2>${t().whatName}</h2><p class="mut">${t().nameShown}</p>
    <input id="name" maxlength="40" placeholder="${t().nameField}" autocomplete="name">
    ${btn(t().continueBtn, "setName", "", "wide")}</main>`;
}
function vGate() {
  const me = st.me, pending = me.links.find((l) => l.status === "pending");
  return `${hero(t().gateTitle(me.name), t().gateSubtitle, badge(me.id, t().yourNumber))}<main>
    ${pending ? `<div class="card hl"><b>⏳ ${t().requestPending(h(pending.admin))}</b><p class="mut">${t().notifiedOnAccept}</p></div>` : ""}
    ${pending ? "" : `<div class="card"><h3>${t().step1}</h3><p class="mut">${t().step1Text(me.id)}</p>${btn(t().requestJoinBtn, "requestJoin", "", "wide")}</div>`}
    <div class="card"><h3>${t().step2}</h3><p class="mut">${t().step2Text}</p>
      <div class="row"><input id="code" class="code" maxlength="6" placeholder="ABC123" autocapitalize="characters">${btn(t().join, "join", "", "tonal")}</div></div>
    <div class="center">${btn(t().iAmAdmin, "adminDialog", "", "text")}</div></main>`;
}
function vHome() {
  const me = st.me;
  const tabs = me.is_admin ? `<nav class="tabs"><button class="${st.adminTab ? "" : "on"}" data-a="tab" data-x="0">📖<span>${t().tabMine}</span></button>
    <button class="${st.adminTab ? "on" : ""}" data-a="tab" data-x="1">🛡️<span>${t().tabAdmin}${st.ov && st.ov.requests.length ? ` <em>${st.ov.requests.length}</em>` : ""}</span></button></nav>` : "";
  return `<div class="top"><div><small>${t().hello}</small><b>${h(me.name)}</b></div><span class="pill">${t().myNumber} ${LTR(me.id)}</span>
    <button class="ic" data-a="push" data-x="settings">⚙️</button></div>
    <main class="${me.is_admin ? "padtabs" : ""}">${me.is_admin && st.adminTab ? vAdmin() : vReaderHome()}</main>${tabs}`;
}
function vReaderHome() {
  const me = st.me, active = me.parts.filter((p) => p.khatma_status === "active"), hist = me.parts.filter((p) => p.khatma_status !== "active");
  let out = "";
  if (!active.length) {
    const idle = me.is_admin && st.ov ? st.ov.circles.find((c) => !c.active && c.members.length) : null;
    const admin = me.links.find((l) => l.status === "accepted");
    out += `<div class="card center col"><div class="big">🌙</div><h2>${t().noPortion}</h2>
      <p class="mut">${idle ? t().circleWithoutKhatma(h(idle.name)) : (admin ? t().inGroupOf(h(admin.admin)) : "") + t().notifiedNext}</p>
      ${idle ? btn(t().startKhatmaOf(h(idle.name)), "create", idle.id, "wide") : ""}</div>`;
  }
  for (const p of active) {
    const n = p.to - p.from + 1, read = p.status === "done" ? n : p.last_page ? Math.max(0, Math.min(n, p.last_page - p.from + 1)) : 0;
    const late = ts(p.deadline) && Date.now() > ts(p.deadline) && p.status !== "done", left = remaining(p.deadline);
    const label = p.given ? t().givenWaiting : p.status === "assigned" ? t().startReading : p.status === "started" ? t().continueReading(p.last_page || p.from) : t().doneWaiting;
    out += `<div class="hcard"><div class="row sp"><span class="kid">${LTR(p.khatma_id)}</span><span class="o8">${h(p.circle)}</span>
      <b class="${late ? "lt" : ""}">${p.status === "done" ? "✓" : late ? "⌛ " + t().deadlinePassed : left ? "⏳ " + left : ""}</b></div>
      <div class="row gap">${ring(read / n, 104, "#D4AF37", `<b>${Math.floor((read / n) * 100)}${t().pct}</b><small>${LTR(read + "/" + n)}</small>`)}
      <div><small class="o7">${t().myPortion}</small><h2>${h(t().fromSurah(Mushaf.name(Mushaf.surahAtTop(p.from), st.lang)))}</h2>
      <h2>${h(t().toSurah(Mushaf.name(Mushaf.surahAt(p.to), st.lang)))}</h2><small class="gs">${t().pagesLine(p.from, p.to, n)}</small></div></div>
      ${p.helper ? `<small class="gs">🤝 ${t().helperNote}</small>` : ""}${p.given && p.cut ? `<small class="gs">🔀 ${t().givenNote(p.cut, p.to)}</small>` : ""}
      <small class="o8">${t().readersDone(p.done, p.readers)} · ${t().khatmaPages(p.pages_done || 0)}</small><div class="lin"><i style="width:${((p.pages_done || 0) / 604) * 100}%"></i></div>
      <button class="btn gold wide" data-a="open" data-x="${p.khatma_id}#${p.idx}" ${p.status === "done" ? "disabled" : ""}>${label}</button></div>`;
  }
  const missed = bitRanges(me.missed);
  if (missed.length) out += `<div class="card hl"><h3>📌 ${t().missedTitle}</h3><p class="sm">${t().missedText(missed.reduce((a, r) => a + r[1] - r[0] + 1, 0))}</p>
    ${missed.map((r) => `<div class="row sp mt"><div><b>${t().pagesShort} ${t().rng(r[0], r[1])}</b><p class="mut xs">${h(Mushaf.range(r[0], r[1], st.lang))}</p></div>
    ${btn(t().readThem, "catchup", r[0] + "-" + r[1], "tonal")}</div>`).join("")}</div>`;
  const cov = me.coverage, k = me.personal_khatmas;
  out += `<div class="card"><h3>${t().myCycle}</h3><p class="gold-t">${t().fullKhatmas(k)}</p>
    <div class="row gap">${ring(cov / 604, 76, "var(--primary)", `<b>${Math.floor((cov * 100) / 604)}${t().pct}</b>`)}
    <div><b>${t().currentCycle}</b><p class="mut">${t().cycleRead(cov)}</p>${cov === 0 && k > 0 ? `<p class="ok">${t().newCycleStarted}</p>` : ""}</div></div>
    <p class="mut sm">${t().cycleExplained}</p></div>
    ${btn(t().browseMushaf, "mushaf", "", "outline wide")}`;
  if (hist.length) {
    out += `<h4>${t().history}</h4>` + hist.map((p) => `<div class="card row gap"><div class="hico">${p.incomplete ? "◐" : "✓"}</div>
      <div class="grow"><b>${LTR(p.khatma_id)}</b><p class="mut sm">${h(Mushaf.range(p.from, p.to, st.lang))} · ${t().pagesShort} ${t().rng(p.from, p.to)}</p>
      <p class="mut xs">${h(p.circle)} · ${date(p.closed_at || p.created_at)}${p.incomplete ? " · " + t().incomplete : ""}</p>
      ${p.given && p.cut ? `<p class="st xs">${t().givenNote(p.cut, p.to)}</p>` : ""}${p.helper ? `<p class="gold-t xs">${t().helperNote}</p>` : ""}</div>${statusChip(p.given ? "given" : p.status, false)}</div>`).join("");
  }
  return out;
}

// ─── admin ───
function vAdmin() {
  const ov = st.ov; if (!ov) return `<div class="center"><div class="spin"></div></div>`;
  const tabs = [t().tKhatmas, t().tCircles, t().tMembers].map((l, i) =>
    `<button class="${st.adminSection === i ? "on" : ""}" data-a="section" data-x="${i}">${l}${i === 2 && ov.requests.length ? ` <em>${ov.requests.length}</em>` : ""}</button>`).join("");
  return `<div class="stabs">${tabs}</div>` + [vKhatmas, vCircles, vMembers][st.adminSection]();
}
function vKhatmas() {
  const ov = st.ov, active = ov.khatmas.filter((k) => k.status === "active"), closed = ov.khatmas.filter((k) => k.status !== "active");
  let out = "";
  if (ov.members.length <= 1 && !ov.circles.length) out += `<div class="center col card"><div class="big">👥</div><h2>${t().inviteFirst}</h2><p class="mut">${t().inviteFirstText}</p>${btn(t().inviteReaders, "section", 2)}</div>`;
  else if (!ov.circles.length) out += `<div class="center col card"><div class="big">⭕</div><h2>${t().firstCircle}</h2><p class="mut">${t().circleExplained}</p>${btn(t().newCircle, "circle", "")}</div>`;
  else out += btn(t().newKhatma, "create", "", "wide big-b");
  if (active.length) out += `<h4>${t().running}</h4>` + active.map((k) => {
    const late = ts(k.deadline) && Date.now() > ts(k.deadline), left = remaining(k.deadline), c = (s) => k.parts.filter((p) => p.status === s).length;
    return `<div class="card tap" data-a="khatma" data-x="${k.id}"><div class="row sp"><div><b>${LTR(k.id)}</b><p class="mut sm">${h(k.circle)} · ${t().khatmaN(k.round + 1)}</p></div>
      <b class="${late ? "lt" : "mut"} sm">${left ? "⏳ " + left : "⌛ " + t().deadlinePassed}</b></div>${bar(k.parts, late)}
      <p class="legend"><i class="done"></i>${t().legendDone(c("done"))} <i class="${late ? "late" : "started"}"></i>${t().legendStarted(c("started"))} <i class="${late ? "late" : "assigned"}"></i>${t().legendAssigned(c("assigned"))}</p>
      ${desc(k.parts, (p) => p.user_id).map((p) => `<div class="row sp mt">${memberName(p.user_id, p.name, false)}${statusChip(p.status, late && p.status !== "done")}</div>`).join("")}</div>`;
  }).join("");
  if (closed.length) out += `<h4>${t().finished}</h4>` + closed.map((k) => { const d = k.parts.filter((p) => p.status === "done").length;
    return `<div class="card tap row sp" data-a="khatma" data-x="${k.id}"><div><b>${LTR(k.id)}</b><p class="mut sm">${h(k.circle)} · ${date(k.closed_at)}</p></div>
      <b class="${k.incomplete ? "st" : "ok"}">${k.incomplete ? t().incompleteCount(d, k.parts.length) : t().complete}</b></div>`; }).join("");
  return out;
}
function vCircles() {
  const ov = st.ov;
  return btn("＋  " + t().newCircle, "circle", "", "outline wide") + (ov.circles.length ? "" : `<div class="center col card"><div class="big">⭕</div><h2>${t().noCircles}</h2><p class="mut">${t().circleExplained}</p></div>`) +
    ov.circles.map((c) => `<div class="card tap" data-a="circle" data-x="${c.id}"><div class="row sp"><div><b>${h(c.name)}</b><p class="mut sm">${t().circleInfo(c.members.length, c.rounds)}</p>
      ${c.members.length ? `<p class="gold-t xs">${t().cycle(c.rounds % c.members.length, c.members.length)}</p>` : ""}</div>
      ${c.active ? btn(t().runningLink, "khatma", c.active, "text") : btn(t().startLink, "create", c.id, "text")}</div>
      ${desc(c.members).map((id) => `<div class="mt">${memberName(id, member(id)?.name, false)}</div>`).join("")}</div>`).join("");
}
function vMembers() {
  const ov = st.ov;
  let out = ov.invite_code ? `<div class="card hl2"><small>${t().inviteCode}</small><div class="bigcode">${LTR(ov.invite_code)}</div>
    <p class="sm">${t().inviteCodeText}</p>${btn(t().shareInvite, "shareInvite", "", "wide")}</div>` : "";
  if (ov.requests.length) out += `<h4>${t().requestsCount(ov.requests.length)}</h4>` + ov.requests.map((r) => `<div class="card hl row sp"><div>${memberName(r.id, r.name)}<p class="xs">${dateTime(r.at)}</p></div>
    <div class="row">${btn(t().refuse, "answer", r.id + ":0", "text red")}${btn(t().accept, "answer", r.id + ":1")}</div></div>`).join("");
  out += `<h4>${t().addByNumber}</h4><div class="row"><input id="addnum" inputmode="numeric" maxlength="5" placeholder="${t().number}">${btn(t().add, "addMember", "", "tonal")}</div>
    ${btn(t().sync, "syncAsk", "", "outline wide")}<h4>${t().membersCount(ov.members.length)}</h4>` + ov.members.map((m) => `<div class="card row gap">${ring(m.coverage / 604, 44, "var(--primary)", `<small>${Math.floor((m.coverage * 100) / 604)}</small>`)}
    <div class="grow">${memberName(m.id, m.name)}<p class="mut xs">${m.personal_khatmas ? "🌟 " + LTR(m.personal_khatmas) + " · " : ""}${m.busy ? t().inKhatma(m.busy) : t().free}</p></div>
    ${m.id !== userId() && !m.busy ? `<button class="ic red" data-a="removeMember" data-x="${m.id}">✕</button>` : ""}</div>`).join("");
  return out;
}
function vKhatmaDetail(id) {
  const k = st.ov && st.ov.khatmas.find((x) => x.id === id);
  if (!k) return sub(id) + `<div class="center"><div class="spin"></div></div>`;
  const done = k.parts.filter((p) => p.status === "done").length, late = ts(k.deadline) && Date.now() > ts(k.deadline), active = k.status === "active";
  const circle = st.ov.circles.find((c) => c.id === k.circle_id);
  return sub(id) + `<main><div class="card"><div class="row gap">${ring(done / k.parts.length, 92, "var(--ok)", `<b>${LTR(done + "/" + k.parts.length)}</b>`)}
    <div><h2>${h(k.circle)}</h2><p class="mut sm">${t().khatmaOfCircle(k.round + 1, k.parts.length)}</p><p class="mut sm">${t().startedAt(dateTime(k.created_at))}</p>
    ${active ? `<b class="${late ? "lt" : "pr"} sm">${remaining(k.deadline) ? t().leftWithDeadline(remaining(k.deadline), k.hours) : "⌛ " + t().deadlinePassed}</b>`
      : `<b class="${k.incomplete ? "st" : "ok"} sm">${k.incomplete ? t().closedIncomplete(dateTime(k.closed_at)) : t().closedComplete(dateTime(k.closed_at))}</b>`}</div></div>
    ${bar(k.parts, active && late)}</div><h4>${t().readersTitle}</h4>
    ${desc(k.parts, (p) => p.user_id).map((p) => { const n = p.to - p.from + 1, read = p.status === "done" ? n : p.last_page ? p.last_page - p.from + 1 : 0;
      return `<div class="card ${active && p.status !== "done" ? "tap" : ""}" ${active && p.status !== "done" ? `data-a="sheet" data-x="${k.id}#${p.idx}"` : ""}>
      <div class="row sp"><div>${memberName(p.user_id, p.name)}<p class="mut sm">${t().pagesShort} ${t().rng(p.from, p.to)} · ${h(Mushaf.range(p.from, p.to, st.lang))}</p></div>${statusChip(p.given ? "given" : p.status, active && late && p.status !== "done")}</div>
      ${p.given && p.cut ? `<p class="st xs">🔀 ${t().givenNote(p.cut, p.to)}</p>` : ""}
      ${p.status === "started" ? `<div class="lin st"><i style="width:${(read / n) * 100}%"></i></div><p class="mut xs">${t().reachedPage(p.last_page || p.from, read, n)}</p>` : ""}
      ${p.status === "done" ? `<p class="ok xs">${t().doneAt(dateTime(p.done_at))}</p>` : ""}</div>`; }).join("")}
    ${active ? `<div class="row">${btn(t().remind, "remind", k.id, "outline grow")}${btn(t().closeKhatma, "closeAsk", k.id, "grow")}</div>`
      : circle && !circle.active ? btn(t().nextKhatma, "next", k.circle_id, "wide") : ""}</main>`;
}
function vCircleEdit(id) {
  const ov = st.ov, c = ov.circles.find((x) => x.id === id);
  if (!st.circleSel || st.circleSel.id !== id) st.circleSel = { id, name: c ? c.name : "", sel: c ? [...c.members] : [] };
  const cs = st.circleSel;
  return sub(c ? c.name : t().newCircle) + `<main><input id="cname" maxlength="40" placeholder="${t().circleName}" value="${h(cs.name)}">
    <h4>${t().readersCount(cs.sel.length)}</h4><p class="mut xs">${t().circleOrder}</p>
    ${ov.members.map((m) => { const i = cs.sel.indexOf(m.id);
      return `<label class="check"><input type="checkbox" data-a="csel" data-x="${m.id}" ${i >= 0 ? "checked" : ""}><span class="grow">${memberName(m.id, m.name)}
      ${m.busy ? `<small class="mut">${t().inRunningKhatma}</small>` : ""}</span>${i >= 0 ? `<b class="pr">${LTR(i + 1)}</b>` : ""}</label>`; }).join("")}
    ${c ? btn(t().deleteCircle, "circleDelAsk", c.id, "text red") : ""}
    ${btn(t().save, "circleSave", id ?? "", "wide")}</main>`;
}
function vCreate() {
  const w = st.wiz, ov = st.ov, c = ov.circles.find((x) => x.id === w.circle);
  if (w.created) return sub(t().wStarted) + `<main class="center col"><div class="big">✨</div><h2>${t().wStarted}</h2><div class="bigcode">${LTR(w.created)}</div>
    <p class="mut">${t().wNotified}</p>${btn(t().follow, "khatmaReplace", w.created, "wide")}</main>`;
  const titles = [t().wChooseCircle, t().wReadersDeadline, t().wDistribution];
  const dots = `<div class="dots">${[0, 1, 2].map((i) => `<i class="${i === w.step ? "on" : i < w.step ? "past" : ""}"></i>`).join("")}</div>`;
  let body = "";
  if (w.step === 0) body = ov.circles.map((ci) => `<div class="card ${ci.active ? "dim" : "tap"}" ${ci.active ? "" : `data-a="wizCircle" data-x="${ci.id}"`}><b>${h(ci.name)}</b>
    <p class="${ci.active ? "st" : "mut"} sm">${ci.active ? t().circleBusy(ci.active) : t().circleNextKhatma(ci.members.length, ci.rounds + 1)}</p>
    ${desc(ci.members).map((id) => `<div class="mt">${memberName(id, member(id)?.name, false)}</div>`).join("")}</div>`).join("");
  else if (w.step === 1) {
    const n = w.sel.length, q = n ? Math.floor(604 / n) : 0, q2 = n ? q + (604 % n ? 1 : 0) : 0;
    body = `<h2>${h(c ? c.name : "")}</h2><h4>${t().deadline}</h4><div class="chips">${[12, 24, 48, 72, 168].map((x) =>
      `<button class="fchip ${w.hours === x ? "on" : ""}" data-a="hours" data-x="${x}">${x === 168 ? t().week : t().hoursChip(x)}</button>`).join("")}</div>
      <div class="row stepper"><button class="ic" data-a="hoursAdd" data-x="-1">−</button><b>${t().hours(w.hours)}</b><button class="ic" data-a="hoursAdd" data-x="1">+</button></div>
      <h4>${t().readersCount(n)}</h4>${n ? `<p class="gold-t sm">${t().eachPortion(q, q2)}</p>` : ""}
      ${w.input ? desc(w.input.members, (m) => m.id).map((m) => `<label class="check ${m.busy ? "dim" : ""}"><input type="checkbox" data-a="wsel" data-x="${m.id}" ${w.sel.includes(m.id) ? "checked" : ""} ${m.busy ? "disabled" : ""}>
        <span class="grow">${memberName(m.id, m.name)}<small class="${m.busy ? "st" : "mut"}">${m.busy ? t().participating(m.busy) : t().readInCycle((m.coverage.match(/1/g) || []).length)}</small></span></label>`).join("") : `<div class="spin"></div>`}
      ${btn(t().nextDistribution, "wizNext", "", "wide " + (n ? "" : "off"))}`;
  } else {
    body = `<div class="card hl"><b>${h(c ? c.name : "")} · ${t().khatmaN((w.input ? w.input.round : 0) + 1)}</b><p class="sm">${t().summary(w.sel.length, w.hours)}</p><p class="xs">${t().distributionExplained}</p></div>
      ${w.plan ? desc(w.plan, (x) => x.userId).map((x) => `<div class="card row sp"><div>${memberName(x.userId, x.name)}<p class="mut sm">${h(Mushaf.range(x.pages[0], x.pages[1], st.lang))}</p></div>
        <div class="end"><b>${t().pagesShort} ${t().rng(x.pages[0], x.pages[1])}</b><small class="${x.unread === x.pages[1] - x.pages[0] + 1 ? "ok" : "st"}">${x.unread === x.pages[1] - x.pages[0] + 1 ? t().allNew : t().newPages(x.unread, x.pages[1] - x.pages[0] + 1)}</small></div></div>`).join("") : `<div class="spin"></div>`}
      ${btn(t().startKhatma, "wizCreate", "", "wide " + (w.plan ? "" : "off"))}`;
  }
  return sub(titles[w.step]) + `<main>${dots}${body}</main>`;
}
function vSettings() {
  const me = st.me;
  return sub(t().settings) + `<main><div class="card"><small class="mut">${t().myNumber}</small><div class="bigcode">${LTR(me.id)}</div></div>
    <h4>${t().language} · ${st.lang === "ar" ? "Langue" : "اللغة"}</h4><div class="row">
      <button class="fchip grow ${st.lang === "ar" ? "on" : ""}" data-a="setLang" data-x="ar">العربية</button><button class="fchip grow ${st.lang === "fr" ? "on" : ""}" data-a="setLang" data-x="fr">Français</button></div>
    <h4>${t().name}</h4><div class="row"><input id="sname" maxlength="40" value="${h(me.name)}">${btn(t().save, "saveName", "", "tonal")}</div>
    <h4>${t().myGroups}</h4>${me.links.map((l) => `<p>${l.status === "pending" ? t().groupPending(h(l.admin)) : t().groupMember(h(l.admin))}</p>`).join("")}
    <div class="row"><input id="code" class="code" maxlength="6" placeholder="${t().otherInvite}">${btn(t().join, "join", "", "tonal")}</div>
    <h4>${t().adminSection}</h4>${me.assists ? `<p><b>${t().youAssist(h(me.assists.name), me.invite_code || "")}</b></p>` : me.is_admin ? `<p><b>${t().youAreAdmin(me.invite_code || "")}</b></p>` : ""}
    ${me.is_admin ? btn(t().closeAdmin, "closeAdminAsk", "", "outline red") : btn(t().enableAdmin, "adminDialog", "", "outline")}
    ${btn("ℹ️  " + t().aboutTitle, "push", "about", "outline wide")}</main>`;
}
function vAbout() {
  return sub(t().aboutTitle) + `<main class="center col"><img src="icon-192.png" class="alogo" alt=""><h2>${t().appName}</h2><p class="mut">${t().version(VERSION)}</p>
    <div class="card"><p>${t().aboutPrinciple}</p></div><div class="card"><small class="gold-t">${t().ideaLabel}</small><h2>${t().ideaName}</h2><hr>
    <small class="gold-t">${t().madeByLabel}</small><h2>${t().madeByName}</h2><hr><small class="gold-t">${t().mushafLabel}</small><p>${t().mushafText}</p></div></main>`;
}

// ─── mushaf reader (built once; the bars are updated in place) ───
function vReader(sc) {
  const part = sc.part, cu = sc.catchup, first = part ? part.from : cu ? cu[0] : 1, last = part ? part.to : cu ? cu[1] : 604;
  const pages = []; for (let p = first; p <= last; p++) pages.push(p); if (last === 604 && !cu) pages.push(605, 606);
  const img = (n) => MUSHAF + (n <= 604 ? String(n).padStart(3, "0") : "dua" + (n - 604)) + ".jpg";
  return `<div class="reader ${store.get("night") === "1" ? "night" : ""}" id="reader"><div class="pages" id="pages" dir="rtl">
    ${pages.map((n) => `<div class="pg" data-p="${n}"><img loading="lazy" decoding="async" src="${img(n)}" alt=""></div>`).join("")}</div>
    <div class="rtop" id="rtop"><button class="ic" data-a="back">${t().back}</button><div class="grow"><b id="rs"></b><small id="rj"></small></div>
      ${part || cu ? "" : `<button class="ic" data-a="navOpen">🔍</button>`}<button class="ic" data-a="night">🌙</button></div>
    <div class="band t" id="bt"></div><div class="band b" id="bb"></div>
    ${part || cu ? "" : `<div class="rbot" id="rbot"><div class="units" id="units"></div><div class="navrow" id="navrow"></div></div>`}
    ${part || cu ? `<div class="rbot" id="rbot"><div class="row"><b id="rc"></b><div class="lin grow"><i id="rl"></i></div></div><div id="rbtn"></div></div>` : ""}</div>`;
}
function setupReader(sc) {
  const box = document.getElementById("pages"), part = sc.part, cu = sc.catchup, ranged = !!(part || cu);
  const key = part ? part.khatma_id + "#" + part.idx : cu ? "missed#" + cu[0] : "free";
  const els = [...box.children], first = part ? part.from : cu ? cu[0] : 1, last = part ? part.to : cu ? cu[1] : 604;
  let start = part ? (+store.get("page_" + key, 0) || part.last_page || first) : cu ? (+store.get("page_" + key, 0) || first) : sc.page;
  if (start < first || start > last) start = first;
  const idx0 = els.findIndex((e) => +e.dataset.p === start);
  requestAnimationFrame(() => { if (idx0 > 0) els[idx0].scrollIntoView({ inline: "start", block: "nearest" }); update(); });
  let hideT, sendT, cur = start;
  const chrome = (on) => { document.getElementById("reader").classList.toggle("bare", !on); clearTimeout(hideT);
    if (on && !(ranged && cur >= last)) hideT = setTimeout(() => chrome(false), 4000); };
  function update() {
    const i = Math.round(Math.abs(box.scrollLeft) / box.clientWidth), n = +(els[Math.max(0, Math.min(els.length - 1, i))].dataset.p);
    if (n === update.last) return; update.last = n; cur = n;
    const pg = Math.min(n, 604);
    document.getElementById("rs").textContent = n > 604 ? t().khatmDua : t().surahTitle(Mushaf.name(Mushaf.surahAtTop(pg), st.lang));
    document.getElementById("rj").textContent = t().juzPage(Mushaf.juzAt(pg), pg);
    document.getElementById("bt").textContent = n > 604 ? t().khatmDua : Mushaf.surahsOn(pg).map((x) => t().surahTitle(Mushaf.name(x, st.lang))).join("  ·  ");
    const tot = last - first + 1, pos = Math.max(1, Math.min(tot, pg - first + 1));
    document.getElementById("bb").innerHTML = h(t().pageOfMushaf(pg, Mushaf.hizbAt(pg), Mushaf.juzAt(pg))) + (ranged ? `<b>${h(t().inPortion(pos, tot) + "  ·  " + t().passedLeft(pos - 1, tot - pos + 1))}</b>` : "");
    if (cu) document.getElementById("rs").textContent = n > 604 ? t().khatmDua : t().catchupTitle;
    store.set("page_" + key, pg);
    if (part) {
      const total = last - first + 1, read = pg - first + 1, me = (st.me.parts || []).find((p) => p.khatma_id === part.khatma_id && p.idx === part.idx) || part;
      document.getElementById("rc").textContent = LTR(read + "/" + total);
      document.getElementById("rl").style.width = (read / total) * 100 + "%";
      const done = me.status === "done" || sc.finished;
      document.getElementById("rbtn").innerHTML = me.khatma_status === "active" && !done
        ? `<button class="btn wide ${n >= last ? "gold" : "soft"}" data-a="doneAsk">${t().iFinished}</button>` : done ? `<p class="ok center">${t().finishedAccepted}</p>` : "";
      if (me.khatma_status === "active" && !done) { clearTimeout(sendT); sendT = setTimeout(() => rpc("khatma_part_progress", auth({ p_khatma: part.khatma_id, p_idx: part.idx, p_page: pg })).catch(() => {}), 4000); }
      if (n >= last) chrome(true);
    } else if (!cu) navBar(pg);
    if (cu) {
      const total = last - first + 1, read = pg - first + 1;
      document.getElementById("rc").textContent = LTR(read + "/" + total);
      document.getElementById("rl").style.width = (read / total) * 100 + "%";
      document.getElementById("rbtn").innerHTML = sc.finished ? `<p class="ok center">${t().finishedAccepted}</p>`
        : `<button class="btn wide ${n >= last ? "gold" : "soft"}" data-a="catchupAsk">${t().catchupDone}</button>`;
      if (n >= last) chrome(true);
    }
  }
  box.addEventListener("scroll", () => { clearTimeout(update.t); update.t = setTimeout(update, 120); }, { passive: true });
  box.addEventListener("click", () => chrome(document.getElementById("reader").classList.contains("bare")));
  sc.cur = () => cur; sc.last = last;
  // Jump to a page (search, previous / next unit): the pages are laid out right-to-left.
  sc.go = (p) => { const el = els.find((e) => +e.dataset.p === p); if (el) el.scrollIntoView({ inline: "start", block: "nearest" }); setTimeout(update, 150); };
  chrome(true);
  if (navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => (sc.lock = l)).catch(() => {});
}

// Free reading: the unit chips and «→ السابق · current · التالي ←» (next on the left, as the pages turn).
function navBar(pg) {
  const u = st.navUnit || "surah", prev = Mushaf.previous(u, pg), next = Mushaf.next(u, pg);
  document.getElementById("units").innerHTML = ["page", "surah", "hizb", "juz"].map((k) =>
    `<button class="fchip ${k === u ? "on" : ""}" data-a="navUnit" data-x="${k}">${t().units[k]}</button>`).join("");
  document.getElementById("navrow").innerHTML = `<button class="btn text" data-a="navGo" data-x="${prev ?? ""}" ${prev ? "" : "disabled"}>${t().prevUnit}</button>
    <b>${h(t().unitHere(u, pg))}</b><button class="btn text" data-a="navGo" data-x="${next ?? ""}" ${next ? "" : "disabled"}>${t().nextUnit}</button>`;
}
// 🔍 search: page / surah / hizb / juz'.
function navBody() {
  const tab = st.navTab || "surah", pg = topS().cur ? Math.min(604, topS().cur()) : 1;
  const tabs = `<div class="units">${["page", "surah", "hizb", "juz"].map((k) => `<button class="fchip ${k === tab ? "on" : ""}" data-a="navTab" data-x="${k}">${t().units[k]}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "page") body = `<input id="navpage" inputmode="numeric" maxlength="3" placeholder="${t().pageNumber}">${btn(t().goTo, "navPage", "", "wide")}`;
  else if (tab === "surah") {
    const q = (st.navQ || "").trim(), here = Mushaf.surahsOn(pg);
    const list = Array.from({ length: 114 }, (_, i) => i + 1).filter((n) => !q || String(n) === q || SURAH_AR[n - 1].includes(q) || SURAH_FR[n - 1].toLowerCase().includes(q.toLowerCase()));
    body = `<input id="navq" placeholder="${t().searchSurah}" value="${h(q)}"><div class="navlist">${list.map((n) =>
      `<div class="tap" data-a="navGo" data-x="${SURAH_START[n - 1]}"><b>${LTR(n)}</b><span class="${here.includes(n) ? "b" : ""}">${h(t().surahTitle(Mushaf.name(n, st.lang)))}</span><small class="mut">${t().pagesShort} ${LTR(SURAH_START[n - 1])}</small></div>`).join("")}</div>`;
  } else {
    const hz = tab === "hizb", s = hz ? HIZB_START : JUZ_START, here = hz ? Mushaf.hizbAt(pg) : Mushaf.juzAt(pg);
    body = `<div class="navgrid ${hz ? "" : "j"}">${s.map((p, i) => `<button class="fchip ${here === i + 1 ? "on" : ""}" data-a="navGo" data-x="${p}">${LTR(i + 1)}</button>`).join("")}</div>`;
  }
  return tabs + body;
}

// ─── dialogs ───
function vDialog() {
  const d = st.dialog; if (!d) return "";
  return `<div class="scrim" data-a="dclose"><div class="dlg" data-stop="1"><h3>${d.title}</h3>${d.text ? `<p>${d.text}</p>` : ""}${d.body || ""}
    <div class="row end">${d.cancel === false ? "" : btn(d.cancelLabel || t().cancel, "dclose", "", "text")}${d.ok ? btn(d.okLabel, "dok", "", "") : ""}</div></div></div>`;
}
function vSheet() {
  const s = st.sheet; if (!s) return "";
  const k = st.ov.khatmas.find((x) => x.id === s.k), p = k && k.parts.find((x) => x.idx === s.idx); if (!p) return "";
  const cand = st.ov.members.filter((m) => m.id !== p.user_id && (!m.busy || (m.busy === k.id && k.parts.some((q) => q.user_id === m.id && q.status === "done"))));
  return `<div class="scrim" data-a="dclose"><div class="sheet" data-stop="1"><h3>${t().portion}</h3>${memberName(p.user_id, p.name)}
    <p class="mut sm">${t().pagesRange(p.from, p.to)} · ${h(Mushaf.range(p.from, p.to, st.lang))}</p>${btn(t().markDone, "markDone", "", "tonal wide")}
    <h4>${t().reassignTitle}</h4>${cand.length ? cand.map((m) => `<div class="card tap" data-a="reassign" data-x="${m.id}">${memberName(m.id, m.name)}
    <p class="mut xs">${m.busy === k.id ? t().finishedHere : t().free}</p></div>`).join("") : `<p class="mut">${t().noReaderFree}</p>`}</div></div>`;
}

// ─── render ───
function render() {
  document.documentElement.lang = st.lang; document.documentElement.dir = t().dir;
  const app = document.getElementById("app"), sc = topS();
  if (sc && sc.s === "reader") {
    if (!document.getElementById("reader") || app.dataset.reader !== sc.key) { app.innerHTML = vReader(sc); app.dataset.reader = sc.key; setupReader(sc); }
    app.querySelectorAll(".overlay").forEach((e) => e.remove());
    app.insertAdjacentHTML("beforeend", `<div class="overlay">${vDialog()}${st.toast ? `<div class="toast">${h(st.toast)}</div>` : ""}</div>`);
    return;
  }
  app.dataset.reader = "";
  let v;
  if (isIOS() && !standalone()) v = vInstall();
  else if (st.phase === "loading") v = vLoading();
  else if (st.phase === "offline") v = vOffline();
  else if (st.phase === "name") v = vName();
  else if (st.phase === "gate") v = vGate();
  else if (!sc) v = vHome();
  else v = { settings: vSettings, about: vAbout, khatma: () => vKhatmaDetail(sc.id), circle: () => vCircleEdit(sc.id), create: vCreate }[sc.s]();
  // Keep what the person is typing across re-renders.
  const keep = {}; app.querySelectorAll("input[id]").forEach((i) => (keep[i.id] = i.value));
  app.innerHTML = v + vDialog() + vSheet() + (st.toast ? `<div class="toast">${h(st.toast)}</div>` : "");
  Object.entries(keep).forEach(([id, val]) => { const i = document.getElementById(id); if (i && i.type !== "checkbox") i.value = val; });
}

// ─── actions ───
const val = (id) => (document.getElementById(id)?.value || "").trim();
async function share(text) {
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { return; } }
  try { await navigator.clipboard.writeText(text); toast("✓"); } catch {}
}
function closeReader() { const sc = topS(); if (sc && sc.lock) sc.lock.release().catch(() => {}); }
const A = {
  back() { if (topS() && topS().s === "reader" && !st.dialog) closeReader(); back(); },
  start, lang() { A.setLang(st.lang === "ar" ? "fr" : "ar"); },
  setLang(l) { st.lang = l; store.set("lang", l); if (userId()) rpc("khatma_set_lang", auth({ p_lang: l })).catch(() => {}); render(); },
  setName() { const n = val("name"); if (n.length < 2) return; act(async () => { await rpc("khatma_set_name", auth({ p_name: n })); await reload(); }); },
  saveName() { const n = val("sname"); act(async () => { await rpc("khatma_set_name", auth({ p_name: n })); await reload(); }, () => t().nameSaved); },
  requestJoin() { act(async () => { const r = await rpc("khatma_request_join", auth()); await reload(); joinSent(r.admin); }); },
  join() { const c = val("code").toUpperCase(); if (c.length !== 6) return;
    act(async () => { const r = await rpc("khatma_join", auth({ p_code: c })); await reload(); toast(r.status === "accepted" ? t().memberOf(r.admin) : t().requestSent(r.admin)); }); },
  adminDialog() { st.dialog = { title: t().adminMode, text: t().adminCodeAsk, body: `<input id="acode" placeholder="KH-XXXX" autocapitalize="characters">`, okLabel: t().enable,
    ok: (code) => act(async () => { await rpc("khatma_admin_enable", auth({ p_code: code.toUpperCase() })); await reload(); st.ov = await rpc("khatma_admin_overview", auth()); st.adminTab = true; }, () => t().adminEnabled) }; render(); },
  syncAsk() { st.dialog = { title: t().sync, text: t().syncText, okLabel: t().syncOk,
    ok: () => act(async () => { const n = await rpc("khatma_admin_sync", auth()); st.ov = await rpc("khatma_admin_overview", auth()); toast(n > 0 ? t().synced(n) : t().syncNone); }) }; render(); },
  closeAdminAsk() { st.dialog = { title: t().closeAdmin, text: t().closeAdminText, okLabel: t().closeAdminOk,
    ok: () => act(async () => { await rpc("khatma_admin_logout", auth()); st.adminTab = false; st.ov = null; st.stack = []; await reload(); }, () => t().adminClosed) }; render(); },
  dclose() { st.dialog = null; st.sheet = null; render(); },
  dok() { const d = st.dialog, typed = val("acode"); st.dialog = null; render(); d.ok(typed); },   // read the dialog input before it closes
  tab(x) { st.adminTab = x === "1"; if (st.adminTab) refresh(); render(); },
  section(x) { st.adminSection = +x; render(); },
  push(x) { push({ s: x }); },
  open(x) { const [k, i] = x.split("#"); const p = st.me.parts.find((q) => q.khatma_id === k && q.idx === +i); if (!p) return;
    if (p.status === "assigned") rpc("khatma_part_start", auth({ p_khatma: k, p_idx: p.idx })).catch(() => {});
    push({ s: "reader", key: x, part: p }); },
  navOpen() { st.navTab = st.navTab || "surah"; st.navQ = ""; st.dialog = { title: t().navTitle, body: navBody(), cancelLabel: t().cancel }; render(); },
  navTab(x) { st.navTab = x; st.navQ = ""; st.dialog.body = navBody(); render(); },
  navUnit(x) { st.navUnit = x; const sc = topS(); if (sc && sc.cur) navBar(Math.min(604, sc.cur())); },
  navGo(x) { const sc = topS(); if (!x || !sc || !sc.go) return; st.dialog = null; render(); sc.go(+x); },
  navPage() { const n = +val("navpage"); if (n >= 1 && n <= 604) A.navGo(String(n)); },
  catchup(x) { const [f, to] = x.split("-").map(Number); push({ s: "reader", key: "missed#" + f, part: null, catchup: [f, to] }); },
  catchupAsk() { const sc = topS(), [f, to] = sc.catchup;
    st.dialog = { title: t().catchupTitle, text: t().catchupConfirm(f, to), okLabel: t().yesFinished,
      ok: () => act(async () => { const r = await rpc("khatma_catchup", auth({ p_from: f, p_to: to })); sc.finished = true; await reload();
        st.dialog = { title: r.khatm ? t().khatmTitle : t().acceptedTitle, text: r.khatm ? t().khatmText : t().catchupSaved(r.pages), okLabel: t().alhamdulillah, cancel: false,
          ok: () => { closeReader(); st.stack.pop(); render(); } }; }) }; render(); },
  mushaf() { push({ s: "reader", key: "free", part: null, page: +store.get("page_free", 1) || 1 }); },
  night() { const r = document.getElementById("reader"); const on = !r.classList.contains("night"); r.classList.toggle("night", on); store.set("night", on ? "1" : "0"); },
  doneAsk() { const sc = topS(), p = sc.part, atEnd = sc.cur() >= sc.last;
    st.dialog = { title: t().confirmTitle, text: atEnd ? t().confirmAtEnd(p.from, p.to) : t().confirmEarly(p.to), okLabel: t().yesFinished,
      ok: () => act(async () => { const r = await rpc("khatma_part_done", auth({ p_khatma: p.khatma_id, p_idx: p.idx })); sc.finished = true; await reload();
        st.dialog = { title: r.khatm ? t().khatmTitle : t().acceptedTitle, text: r.khatm ? t().khatmText : t().acceptedText, okLabel: t().alhamdulillah, cancel: false,
          ok: () => { closeReader(); st.stack.pop(); render(); } }; }) }; render(); },
  // admin
  khatma(x) { push({ s: "khatma", id: x }); },
  khatmaReplace(x) { st.stack.pop(); push({ s: "khatma", id: x }); },
  circle(x) { st.circleSel = null; push({ s: "circle", id: x === "" ? null : +x }); },
  csel(x) { const cs = st.circleSel, id = +x, i = cs.sel.indexOf(id); cs.name = val("cname"); if (i >= 0) cs.sel.splice(i, 1); else cs.sel.push(id); render(); },
  circleSave(x) { const cs = st.circleSel, name = val("cname"); if (!name || !cs.sel.length) return;
    act(async () => { const cid = await rpc("khatma_circle_save", auth({ p_id: x === "" ? null : +x, p_name: name, p_members: cs.sel }));
      st.ov = await rpc("khatma_admin_overview", auth()); st.stack.pop(); if (x === "") A.create(String(cid)); }, () => t().circleSaved); },
  circleDelAsk(x) { const c = st.ov.circles.find((q) => q.id === +x); st.dialog = { title: t().deleteCircleTitle(h(c.name)), text: c.active ? t().deleteCircleActiveText(c.active) : t().deleteCircleText, okLabel: t().deleteCircleOk, cancelLabel: t().keep,
    ok: () => act(async () => { await rpc("khatma_circle_cancel", auth({ p_id: +x })); st.ov = await rpc("khatma_admin_overview", auth()); st.me = await rpc("khatma_me", auth()); st.stack.pop(); }, () => t().circleDeleted) }; render(); },
  create(x) { st.wiz = { circle: x ? +x : null, step: x ? 1 : 0, hours: 24, sel: [], input: null, plan: null }; push({ s: "create" }); if (x) loadPlan(); },
  wizCircle(x) { st.wiz.circle = +x; st.wiz.step = 1; render(); loadPlan(); },
  hours(x) { st.wiz.hours = +x; render(); }, hoursAdd(x) { st.wiz.hours = Math.max(1, Math.min(2160, st.wiz.hours + +x)); render(); },
  wsel(x) { const w = st.wiz, id = +x, i = w.sel.indexOf(id); if (i >= 0) w.sel.splice(i, 1); else w.sel.push(id); render(); },
  wizNext() { const w = st.wiz; if (!w.sel.length) return; w.step = 2; w.plan = null; render();
    const rs = w.input.members.filter((m) => w.sel.includes(m.id)).sort((a, b) => a.seat - b.seat);
    w.plan = assignParts(rs, w.input.round); render(); },
  wizCreate() { const w = st.wiz; if (!w.plan) return;
    act(async () => { w.created = await rpc("khatma_create", auth({ p_circle: w.circle, p_hours: w.hours,
      p_parts: w.plan.map((x) => ({ user_id: x.userId, from: x.pages[0], to: x.pages[1] })) })); st.ov = await rpc("khatma_admin_overview", auth()); st.me = await rpc("khatma_me", auth()); }); },
  next(x) { st.stack.pop(); A.create(x); },
  sheet(x) { const [k, i] = x.split("#"); st.sheet = { k, idx: +i }; render(); },
  markDone() { const s = st.sheet; st.sheet = null; act(async () => { await rpc("khatma_admin_mark_done", auth({ p_khatma: s.k, p_idx: s.idx })); st.ov = await rpc("khatma_admin_overview", auth()); }, () => t().markedDone); },
  reassign(x) { const s = st.sheet; st.sheet = null; act(async () => { await rpc("khatma_reassign", auth({ p_khatma: s.k, p_idx: s.idx, p_member: +x })); st.ov = await rpc("khatma_admin_overview", auth()); }, () => t().reassigned); },
  remind(x) { act(async () => { const n = await rpc("khatma_remind", auth({ p_khatma: x })); toast(t().reminded(n)); }); },
  closeAsk(x) { const k = st.ov.khatmas.find((q) => q.id === x), left = k.parts.filter((p) => p.status !== "done").length;
    st.dialog = { title: t().closeTitle(x), text: left ? t().closeNotAll(left) : t().closeAllDone, okLabel: t().close,
      ok: () => act(async () => { await rpc("khatma_close", auth({ p_khatma: x })); st.ov = await rpc("khatma_admin_overview", auth()); st.me = await rpc("khatma_me", auth()); }, () => t().khatmaClosed) }; render(); },
  answer(x) { const [id, ok] = x.split(":"); act(async () => { await rpc("khatma_link_answer", auth({ p_member: +id, p_accept: ok === "1" })); st.ov = await rpc("khatma_admin_overview", auth()); }, () => ok === "1" ? t().accepted : t().refused); },
  addMember() { const n = +val("addnum"); if (!n) return;
    act(async () => { const r = await rpc("khatma_link_add", auth({ p_member: n })); st.ov = await rpc("khatma_admin_overview", auth()); toast(t().added(n + " · " + (r.name || "—"))); }); },
  removeMember(x) { const m = member(+x); st.dialog = { title: t().deleteMemberTitle(LTR(m.id) + " · " + h(m.name)), text: t().deleteMemberText, okLabel: t().del,
    ok: () => act(async () => { await rpc("khatma_link_remove", auth({ p_member: +x })); st.ov = await rpc("khatma_admin_overview", auth()); }, () => t().memberRemoved) }; render(); },
  shareInvite() { share(t().inviteText(INVITE_URL + st.ov.invite_code, st.ov.invite_code)); },
};
async function loadPlan() {
  try { const i = await rpc("khatma_plan_input", auth({ p_circle: st.wiz.circle })); st.wiz.input = i; st.wiz.sel = i.members.filter((m) => !m.busy).map((m) => m.id); }
  catch (e) { toast(errorText(e)); }
  render();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-a]");
  if (!el) return;
  if (el.dataset.a === "dclose" && e.target.closest("[data-stop]") && !e.target.closest('button[data-a="dclose"]')) return;
  if (el.tagName === "INPUT" && el.type === "checkbox") { e.preventDefault(); }
  const f = A[el.dataset.a]; if (f) { e.stopPropagation(); f(el.dataset.x ?? ""); }
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "navq" || !st.dialog) return;
  st.navQ = e.target.value; const pos = e.target.selectionStart; st.dialog.body = navBody(); render();
  const i = document.getElementById("navq"); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "name") A.setName(); if (e.key === "Enter" && e.target.id === "code") A.join(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && userId() && st.phase !== "loading") refresh(); });
setInterval(() => { if (!document.hidden && userId() && ["home", "gate"].includes(st.phase)) refresh(); }, 20000);

// An invitation opened in Safari: keep the code for the installed app (it cannot read Safari's storage,
// the install guide shows the code to type), or join at once when already inside the app.
(function boot() {
  const c = new URLSearchParams(location.search).get("c");
  if (c) store.set("invite", c.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
  if (!(isIOS() && !standalone())) start();
})();
