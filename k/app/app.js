// ختمة جماعية — web app for iPhone (installed on the home screen). Same server, same rules as the
// Android app: number bound to this device (random token in localStorage), Supabase khatma_* RPCs.
"use strict";
const API = "https://xecnhwgdymydmbhwzhaj.supabase.co/rest/v1/rpc/";
const KEY = "sb_publishable_p7NtGN0uUUkRMRGcqu1Rxg_DQBCRUxV";
const INVITE_URL = "https://tsalatnet.github.io/tsalat-media/k/?c=";
const MUSHAF = "../mushaf/";   // 001.jpg … 604.jpg, dua1.jpg, dua2.jpg
const VERSION = "1.11";

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
  stack: [], adminTab: false, tab: "0", offline: false, pdraft: null, adminSection: 0, dialog: null, toast: null, wiz: null, sheet: null,
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
  try { PUsage.send(); } catch {}
  const me = await rpc("khatma_me", auth());
  st.me = me; st.offline = false;
  store.set("me", JSON.stringify(me));          // shown again when the app opens without internet
  if (me.lang !== st.lang) rpc("khatma_set_lang", auth({ p_lang: st.lang })).catch(() => {});
  // No push in the iPhone web app: the admin sees «📱 آيفون» instead of a silent failure.
  if (!reload.hello) rpc("khatma_hello", auth({ p_version: "web " + VERSION })).then(() => (reload.hello = true)).catch(() => {});
  if (!reload.pushSent) rpc("khatma_set_push", auth({ p_platform: "ios-web", p_sub: null, p_ok: false })).then(() => (reload.pushSent = true)).catch(() => {});
  if (me.is_admin && (!st.ov || st.adminTab || st.stack.length)) {
    st.ov = await rpc("khatma_admin_overview", auth());
    try { st.recov = await rpc("khatma_recover_list", auth()); } catch {}
  }
  st.phase = !me.name ? "name" : !(me.is_admin || me.links.some((l) => l.status === "accepted")) ? "gate" : "home";
  // Brought by a member's invitation (…&r=ID): told once, the server keeps the first one (within 7 days).
  const ref = +store.get("ref", 0);
  if (me.name && ref && ref !== me.id) rpc("khatma_referred", auth({ p_ref: ref })).then(() => store.set("ref", null)).catch(() => {});
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
// An admin accepted the recovery: this phone's token now belongs to the former number.
async function followMovedNumber() {
  const id = await rpc("khatma_whoami", { p_token: token() });
  if (!id) return false;
  store.set("user", id); reload.hello = false; reload.pushSent = false;
  await reload(); toast(t().numberRecovered(id));
  return true;
}
function joinSent(admin) { st.dialog = { title: t().joinSentTitle, text: t().joinSentText(h(admin), st.me.id), cancelLabel: t().ok }; }
async function start() {
  st.phase = "loading"; render();
  try {
    if (!userId()) store.set("user", await rpc("khatma_register", { p_token: token() }));
    try { await reload(); }
    catch (e) {
      if (!String(e.raw).startsWith("khatma_denied")) throw e;
      if (!(await followMovedNumber())) {
        store.set("user", null); store.set("token", null);        // account removed, database reset: new number
        store.set("user", await rpc("khatma_register", { p_token: token() }));
        await reload();
      }
    }
  } catch (e) {
    // No internet: the last known state of the group (banner), and the personal khatma works as usual.
    let cached = null; try { cached = JSON.parse(store.get("me", "null")); } catch {}
    if (!st.me && e.raw === "network" && cached && cached.id === userId()) {
      st.me = cached; st.offline = true;
      st.phase = !cached.name ? "offline" : !(cached.is_admin || cached.links.some((l) => l.status === "accepted")) ? "gate" : "home";
    } else { if (!st.me) st.phase = "offline"; toast(errorText(e)); }
  }
  render();
}
async function refresh(withRender = true) {
  try { await reload(); } catch (e) { if (e.raw === "network") st.offline = true; else if (String(e.raw).startsWith("khatma_denied")) await followMovedNumber().catch(() => {}); }
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
function vOffline() {
  return `${hero(t().appName, t().tagline)}<main><div class="center col"><div class="big">📶</div><h2>${t().offlineTitle}</h2><p class="mut">${t().offlineText}</p>${btn(t().retry, "start")}</div>
    ${vPersonalCard()}${btn(t().browseMushaf, "mushaf", "", "outline wide")}</main>`;
}
function vName() {
  return `${hero(t().welcome, t().tagline, badge(userId(), t().yourNumber))}<main>
    <p class="mut">${t().numberExplained}</p><h2>${t().whatName}</h2><p class="mut">${t().nameShown}</p>
    <input id="name" maxlength="40" placeholder="${t().nameField}" autocomplete="name">
    <h2>${t().phoneTitle}</h2><p class="mut">${t().phoneWhy}</p>${phoneInput("phone")}
    ${btn(t().continueBtn, "setName", "", "wide")}
    <div class="center">${btn(t().recoverAsk, "recoverDialog", "", "text")}</div></main>`;
}
// Mobile number field (1.19): the precise problem under it, updated while typing (input listener below).
const phoneInput = (id, value = "") => `<div class="grow"><input id="${id}" class="phone" dir="ltr" inputmode="tel" autocomplete="tel" maxlength="17" placeholder="98 451 273" value="${h(value)}">
  <p class="xs perr" id="${id}-err"></p></div>`;
function phoneHint(id, tried) {
  const i = document.getElementById(id), e = document.getElementById(id + "-err"); if (!i || !e) return null;
  const r = phoneCheck(i.value), digits = (i.value.match(/[0-9\u0660-\u0669\u06f0-\u06f9]/g) || []).length;
  if (r.bad && (tried || digits >= 8)) { e.textContent = t().phoneProblem[r.bad]; e.className = "xs perr red"; }
  else if (r.ok) { e.textContent = "✓ " + LTR(phonePretty(r.ok)); e.className = "xs perr ok"; }
  else { e.textContent = ""; e.className = "xs perr"; }
  return r.ok || null;
}
// An older member without a mobile number taps a portion: the number first, then that portion opens.
function vPhone(sc) {
  return sub(t().phoneNeededTitle) + `<main><div class="center"><div class="big">📱</div></div><h3>${t().phoneNeededText}</h3><p class="mut">${t().phoneWhy}</p>
    ${phoneInput("pphone")}${btn(t().phoneSaveAndRead, "savePhoneOpen", sc.key, "wide")}</main>`;
}
function vGate() {
  const me = st.me, pending = me.links.find((l) => l.status === "pending");
  return `${hero(t().gateTitle(me.name), t().gateSubtitle, badge(me.id, t().yourNumber))}<main>
    ${pending ? `<div class="card hl"><b>⏳ ${t().requestPending(h(pending.admin))}</b><p class="mut">${t().notifiedOnAccept}</p></div>` : ""}
    ${pending ? "" : `<div class="card"><h3>${t().step1}</h3><p class="mut">${t().step1Text(me.id)}</p>${btn(t().requestJoinBtn, "requestJoin", "", "wide")}</div>`}
    <div class="card"><h3>${t().step2}</h3><p class="mut">${t().step2Text}</p>
      <div class="row"><input id="code" class="code" maxlength="6" placeholder="ABC123" autocapitalize="characters">${btn(t().join, "join", "", "tonal")}</div></div>
    <div class="center">${btn(t().recoverAsk, "recoverDialog", "", "text")}</div>
    <div class="center">${btn(t().iAmAdmin, "adminDialog", "", "text")}</div></main>`;
}
function vHome() {
  const me = st.me;
  // Bottom bar for everyone: the group's portion (default), my own khatma (dot while today's portion is unread), the admin's space.
  const tab = st.adminTab && me.is_admin ? "1" : st.tab === "2" ? "2" : "0";
  const tabs = `<nav class="tabs"><button class="${tab === "0" ? "on" : ""}" data-a="tab" data-x="0">👥<span>${t().tabGroup}</span></button>
    <button class="${tab === "2" ? "on" : ""}" data-a="tab" data-x="2"><b class="dotw">📖${Personal.pending() ? `<i class="dot"></i>` : ""}</b><span>${t().tabPersonal}</span></button>
    ${me.is_admin ? `<button class="${tab === "1" ? "on" : ""}" data-a="tab" data-x="1">🛡️<span>${t().tabAdmin}${st.ov && st.ov.requests.length ? ` <em>${st.ov.requests.length}</em>` : ""}</span></button>` : ""}</nav>`;
  return `<div class="top"><div><small>${t().hello}</small><b>${h(me.name)}</b></div><span class="pill">${t().myNumber} ${LTR(me.id)}</span>
    <button class="ic" data-a="push" data-x="settings">⚙️</button></div>
    <main class="padtabs">${tab === "1" ? vAdmin() : tab === "2" ? vPersonalHome() : (st.offline ? `<div class="card warn"><b>📶 ${t().offlineHomeTitle}</b><p class="sm">${t().offlineHomeText}</p></div>` : "") + vReaderHome()}</main>${tabs}`;
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
      <div class="row">${btn("📊", "cstats", c.id, "text")}${c.active ? btn(t().runningLink, "khatma", c.active, "text") : btn(t().startLink, "create", c.id, "text")}</div></div>
      ${desc(c.members).map((id) => `<div class="mt">${memberName(id, member(id)?.name, false)}</div>`).join("")}</div>`).join("");
}
// ─── ★ and circle statistics (1.10; same rules as the Android app, khatma_stars / khatma_circle_stats) ───
function starsBar(sr, size = 15) {
  if (!sr) return "";
  if (sr.new) return `<span class="stars new">${t().starsNew}</span>`;
  let out = "";
  for (let i = 1; i <= 5; i++) { const f = Math.max(0, Math.min(1, sr.stars - (i - 1))); out += `<span class="st1" style="font-size:${size}px"><i style="width:${f * 100}%">★</i>★</span>`; }
  return `<span class="stars" dir="ltr">${out}</span>`;
}
function starsDetail(sr) {
  if (sr.new) return `<p>${t().starsNewText(sr.n)}</p>`;
  const crit = [[t().critSelf, sr.self, 35], [t().critOntime, sr.ontime, 25], [t().critReact, sr.react, 15], [t().critRegular, sr.regular, 10], [t().critHelp, sr.help, 15]];
  return `<div class="row gap">${starsBar(sr, 26)}<b>${LTR(String(sr.stars).replace(/\.0$/, "") + "/5")}</b></div><p class="mut xs">${t().starsOver(sr.n)}</p>` +
    crit.map(([l, v, w]) => `<div class="crit"><div class="row sp"><span class="sm">${l}</span><span class="xs"><b>${LTR(Math.round(v * 100) + "%")}</b> ${LTR("×" + w)}</span></div>
      <div class="pbar"><i style="width:${v * 100}%;background:${v >= 0.75 ? "var(--ok)" : v >= 0.45 ? "var(--st)" : "var(--late)"}"></i></div></div>`).join("") +
    (sr.helps ? `<p class="xs gold-t">${t().starsHelps(sr.helps)}</p>` : "") + `<p class="mut xs">${t().starsHint}</p>`;
}
function vCircleStats(id) {
  const c = st.cstats && st.cstats.id === id ? st.cstats.data : null;
  const name = c ? c.circle : (st.ov.circles.find((x) => x.id === id) || {}).name || "";
  if (!c) return sub("📊 " + h(name)) + `<div class="center"><div class="spin"></div></div>`;
  const closed = c.khatmas.filter((k) => k.status !== "active").slice(0, 10), parts = Math.max(1, closed.reduce((a, k) => a + k.parts, 0));
  const sum = (f) => closed.reduce((a, k) => a + k[f], 0), pct = (n) => LTR(Math.floor((n * 100) / parts) + "%");
  const tile = (v, l, col) => `<div class="tile"><b style="color:${col}">${v}</b><small>${l}</small></div>`;
  const durs = closed.filter((k) => k.closed_at).map((k) => (ts(k.closed_at) - ts(k.created_at)) / 3600000 / k.hours);
  const F = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5];
  const cs = c.curves.filter((x) => !x.active && x.points.length === F.length);
  const typical = cs.length >= 2 ? F.map((_, i) => { const v = cs.map((x) => x.points[i]).sort((a, b) => a - b); return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; }) : null;
  const run = c.curves.find((x) => x.active), ak = c.khatmas.find((k) => k.status === "active");
  const upTo = ak ? F.filter((f) => f <= (Date.now() - ts(ak.created_at)) / (ak.hours * 3600000)).length : 0;
  const W = 320, H = 170, X = (f) => (f / 1.5) * W, Y = (v) => H - v * H;
  const path = (pts, n) => "M0," + H + pts.slice(0, n).map((v, i) => ` L${X(F[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  let verdict = "";
  if (typical && run && upTo > 0) { const d = Math.round((run.points[upTo - 1] - typical[upTo - 1]) * 100); verdict = d >= -5 ? t().verdictAhead(d) : t().verdictBehind(-d); }
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="chart" dir="ltr">${[0.25, 0.5, 0.75, 1].map((g) => `<line x1="0" x2="${W}" y1="${Y(g)}" y2="${Y(g)}" class="grid"/>`).join("")}
    <line x1="${X(1)}" x2="${X(1)}" y1="0" y2="${H}" class="dl"/>${typical ? `<path d="${path(typical, F.length)}" class="typ"/>` : ""}${run && upTo ? `<path d="${path(run.points, upTo)}" class="run"/>` : ""}</svg>`;
  const ks = c.khatmas.slice(0, 15).reverse(), mx = Math.max(1, ...ks.map((k) => k.parts)), bw = W / Math.max(1, ks.length);
  const bars = `<svg viewBox="0 0 ${W} 130" class="chart" dir="ltr">${ks.map((k, i) => { let top = 130; return [[k.self, "var(--ok)"], [k.by_admin, "var(--st)"], [k.given, "#8A8F98"]].map(([n, col]) => {
    const hh = (130 * n) / mx; top -= hh; return `<rect x="${(i * bw + bw * 0.17).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.66).toFixed(1)}" height="${hh.toFixed(1)}" fill="${col}"/>`; }).join(""); }).join("")}</svg>`;
  const hmx = Math.max(1, ...c.hours), peak = c.hours.indexOf(Math.max(...c.hours));
  const hours = `<svg viewBox="0 0 ${W} 90" class="chart" dir="ltr">${c.hours.map((n, hh) => `<rect x="${(hh * W) / 24 + 2}" y="${90 - (90 * n) / hmx}" width="${W / 24 - 4}" height="${(90 * n) / hmx}" fill="${n === hmx ? "var(--gold)" : "var(--primary)"}"/>`).join("")}</svg>
    <div class="row sp xs mut" dir="ltr"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>`;
  const why = (m) => { const r = [], d = m.seen_at ? Math.floor((Date.now() - ts(m.seen_at)) / 86400000) : null;
    if (m.recent.late >= 2) r.push(t().whyLate(m.recent.late, m.recent.parts)); if (m.recent.by_admin >= 2) r.push(t().whyByAdmin(m.recent.by_admin));
    if (d === null || d >= 3) r.push(t().whyAbsent(d)); if (m.push_ok === false && m.push_platform !== "ios-web") r.push(t().whyNoPush);
    if (m.stars && !m.stars.new && m.stars.stars <= 2.5) r.push(t().whyLowStars); return r; };
  const follow = c.members.map((m) => [m, why(m)]).filter(([, r]) => r.length);
  const rated = c.members.map((m) => m.stars).filter((x) => x && !x.new);
  const dist = [5, 4.5, 4, 3.5, 3].map((v) => { const n = v === 3 ? rated.filter((x) => x.stars <= 3).length : rated.filter((x) => x.stars === v).length;
    return `<div class="row gap"><span class="sm" style="width:52px">${LTR(v === 3 ? "≤ 3" : String(v))} ★</span><div class="pbar grow"><i style="width:${rated.length ? (n * 100) / rated.length : 0}%;background:var(--gold)"></i></div><span class="sm">${LTR(n)}</span></div>`; }).join("");
  const rd = sum("app") + sum("paper") + sum("fast");
  return sub("📊 " + h(name)) + `<main>
    <div class="card"><b>${t().statsHealth(closed.length)}</b><div class="row sp tiles">${tile(pct(sum("self")), t().tileSelf, "var(--ok)")}${tile(pct(sum("late")), t().tileLate, "var(--late)")}${tile(pct(sum("given")), t().tileGiven, "#8A8F98")}${tile(pct(sum("by_admin")), t().tileByAdmin, "var(--st)")}</div>
      ${durs.length ? `<p class="sm">${t().statsDuration(Math.round((durs.reduce((a, b) => a + b, 0) / durs.length) * 100), closed.filter((k) => k.incomplete).length)}</p>` : ""}
      ${c.reminders.sent ? `<p class="sm">${t().statsReminders(c.reminders.sent, Math.floor((c.reminders.within_hour * 100) / c.reminders.sent))}</p>` : ""}
      ${rd ? `<p class="sm">${t().statsReading(sum("app"), sum("paper"), sum("fast"))}</p>` : ""}</div>
    <div class="card"><b>${t().statsCurve}</b><p class="mut xs">${t().statsCurveText}</p>${chart}
      <p class="xs"><span class="dot" style="background:var(--muted)"></span> ${t().legendTypical} ${run ? `&nbsp; <span class="dot" style="background:var(--gold)"></span> ${t().legendRunning}` : ""}</p>${verdict ? `<p class="b sm">${verdict}</p>` : ""}</div>
    <div class="card"><b>${t().statsPerKhatma}</b>${bars}<p class="xs"><span class="dot" style="background:var(--ok)"></span> ${t().tileSelf} &nbsp; <span class="dot" style="background:var(--st)"></span> ${t().tileByAdmin} &nbsp; <span class="dot" style="background:#8A8F98"></span> ${t().tileGiven}</p></div>
    <div class="card"><b>${t().statsHours}</b><p class="mut xs">${t().statsPeak(peak)}</p>${hours}</div>
    <h4>${t().statsFollow(follow.length)}</h4>${follow.length ? follow.map(([m, r]) => `<div class="card"><div class="row sp">${memberName(m.id, m.name)}<span data-a="starsOf" data-x="${m.id}">${starsBar(m.stars)}</span></div>${r.map((x) => `<p class="xs why">• ${x}</p>`).join("")}</div>`).join("") : `<p class="mut sm">${t().statsFollowNone}</p>`}
    <div class="card"><b>${t().statsStars}</b>${dist}${c.members.filter((m) => m.stars && m.stars.new).length ? `<p class="mut xs">${t().statsNewcomers(c.members.filter((m) => m.stars && m.stars.new).length)}</p>` : ""}</div></main>`;
}
function vMembers() {
  const ov = st.ov;
  let out = ov.invite_code ? `<div class="card hl2"><small>${t().inviteCode}</small><div class="bigcode">${LTR(ov.invite_code)}</div>
    <p class="sm">${t().inviteCodeText}</p>${btn(t().shareInvite, "shareInvite", "", "wide")}</div>` : "";
  if (st.recov && st.recov.length) out += `<h4>${t().recoveriesCount(st.recov.length)}</h4>` + st.recov.map((r) => `<div class="card hl">${memberName(r.target, r.target_name)}<p class="b">${t().recoveryAsks(h(r.name))}</p><p class="xs">${t().recoveryCheck}</p>
    <div class="row">${btn(t().refuse, "answerRecovery", r.id + ":0", "text red")}${btn(t().accept, "answerRecovery", r.id + ":1")}</div></div>`).join("");
  if (ov.requests.length) out += `<h4>${t().requestsCount(ov.requests.length)}</h4>` + ov.requests.map((r) => `<div class="card hl row sp"><div>${memberName(r.id, r.name)}<p class="xs">${dateTime(r.at)}</p></div>
    <div class="row">${btn(t().refuse, "answer", r.id + ":0", "text red")}${btn(t().accept, "answer", r.id + ":1")}</div></div>`).join("");
  out += `<h4>${t().addByNumber}</h4><div class="row"><input id="addnum" inputmode="numeric" maxlength="5" placeholder="${t().number}">${btn(t().add, "addMember", "", "tonal")}</div>
    ${btn(t().sync, "syncAsk", "", "outline wide")}<h4>${t().membersCount(ov.members.length)}</h4>` + ov.members.map((m) => `<div class="card row gap">${ring(m.coverage / 604, 44, "var(--primary)", `<small>${Math.floor((m.coverage * 100) / 604)}</small>`)}
    <div class="grow">${memberName(m.id, m.name)}${m.stars ? `<div data-a="starsOf" data-x="${m.id}">${starsBar(m.stars)}</div>` : ""}<p class="mut xs">${m.personal_khatmas ? "🌟 " + LTR(m.personal_khatmas) + " · " : ""}${m.busy ? t().inKhatma(m.busy) : t().free}</p></div>
    ${m.id !== userId() && !m.busy ? `<button class="ic red" data-a="removeMember" data-x="${m.id}">✕</button>` : ""}</div>`).join("");
  return out;
}
function vKhatmaDetail(id) {
  const k = st.ov && st.ov.khatmas.find((x) => x.id === id);
  if (!k) return sub(id) + `<div class="center"><div class="spin"></div></div>`;
  const done = k.parts.filter((p) => p.status === "done").length, late = ts(k.deadline) && Date.now() > ts(k.deadline), active = k.status === "active";
  const circle = st.ov.circles.find((c) => c.id === k.circle_id), unfinished = k.parts.filter((p) => p.status !== "done");
  return sub(id) + `<main><div class="card"><div class="row gap">${ring(done / k.parts.length, 92, "var(--ok)", `<b>${LTR(done + "/" + k.parts.length)}</b>`)}
    <div><h2>${h(k.circle)}</h2><p class="mut sm">${t().khatmaOfCircle(k.round + 1, k.parts.length)}</p><p class="mut sm">${t().startedAt(dateTime(k.created_at))}</p>
    ${active ? `<b class="${late ? "lt" : "pr"} sm">${remaining(k.deadline) ? t().leftWithDeadline(remaining(k.deadline), k.hours) : "⌛ " + t().deadlinePassed}</b>`
      : `<b class="${k.incomplete ? "st" : "ok"} sm">${k.incomplete ? t().closedIncomplete(dateTime(k.closed_at)) : t().closedComplete(dateTime(k.closed_at))}</b>`}</div></div>
    ${bar(k.parts, active && late)}</div><h4>${t().readersTitle}</h4>
    <div class="row">${btn(t().filterAll(new Set(k.parts.map((p) => p.user_id)).size), "unfinished", "", st.unfinishedOnly ? "text" : "tonal")}${btn(t().filterUnfinished(new Set(unfinished.map((p) => p.user_id)).size), "unfinished", "1", st.unfinishedOnly ? "tonal" : "text")}</div>
    ${st.unfinishedOnly && !unfinished.length ? `<p class="ok b">${t().allFinished}</p>` : ""}
    ${st.unfinishedOnly && unfinished.length && active ? btn(t().sendList, "nudge", k.id, "tonal wide") : ""}
    ${desc(st.unfinishedOnly ? unfinished : k.parts, (p) => p.user_id).map((p) => { const n = p.to - p.from + 1, read = p.status === "done" ? n : p.last_page ? p.last_page - p.from + 1 : 0;
      return `<div class="card ${active && p.status !== "done" ? "tap" : ""}" ${active && p.status !== "done" ? `data-a="sheet" data-x="${k.id}#${p.idx}"` : ""}>
      <div class="row sp"><div>${memberName(p.user_id, p.name)}<p class="mut sm">${t().pagesShort} ${t().rng(p.from, p.to)} · ${h(Mushaf.range(p.from, p.to, st.lang))}</p></div>${statusChip(p.given ? "given" : p.status, active && late && p.status !== "done")}</div>
      ${p.given && p.cut ? `<p class="st xs">🔀 ${t().givenNote(p.cut, p.to)}</p>` : ""}
      ${p.status === "started" ? `<div class="lin st"><i style="width:${(read / n) * 100}%"></i></div><p class="mut xs">${t().reachedPage(p.last_page || p.from, read, n)}</p>` : ""}
      ${p.status === "done" ? `<p class="ok xs">${t().doneAt(dateTime(p.done_at))}</p>` : ""}</div>`; }).join("")}
    ${active ? `<div class="row">${btn(t().remind, "remind", k.id, "outline grow")}${btn(t().closeKhatma, "closeAsk", k.id, "grow")}</div>`
      : circle && !circle.active ? btn(t().nextKhatma, "next", k.circle_id, "wide") : ""}</main>`;
}
// The other open circle [uid] is in (not [except]): saving [except] with them moves them out of it, once confirmed.
function otherCircle(uid, except) { return st.ov.circles.find((c) => c.id !== except && c.members.includes(uid)); }
function vCircleEdit(id) {
  const ov = st.ov, c = ov.circles.find((x) => x.id === id);
  if (!st.circleSel || st.circleSel.id !== id) st.circleSel = { id, name: c ? c.name : "", sel: c ? [...c.members] : [] };
  const cs = st.circleSel;
  return sub(c ? c.name : t().newCircle) + `<main><input id="cname" maxlength="40" placeholder="${t().circleName}" value="${h(cs.name)}">
    <h4>${t().readersCount(cs.sel.length)}</h4><p class="mut xs">${t().circleOrder}</p>
    ${ov.members.map((m) => { const i = cs.sel.indexOf(m.id);
      return `<label class="check"><input type="checkbox" data-a="csel" data-x="${m.id}" ${i >= 0 ? "checked" : ""}><span class="grow">${memberName(m.id, m.name)}
      ${otherCircle(m.id, id) ? `<small class="st">${t().inOtherCircle(h(otherCircle(m.id, id).name))}</small>` : ""}
      ${m.busy ? `<small class="mut">${t().inRunningKhatma}</small>` : ""}</span>${i >= 0 ? `<b class="pr">${LTR(i + 1)}</b>` : ""}</label>`; }).join("")}
    ${c ? btn(t().deleteCircle, "circleDelAsk", c.id, "text red") : ""}
    ${btn(t().save, "circleSave", id ?? "", "wide")}</main>`;
}
// The deadline: any number of hours typed by the admin (the server accepts 1…2160).
const validHours = (x) => Number.isInteger(x) && x >= 1 && x <= 2160;
function hoursEnd(x) {
  if (!validHours(x)) return `<span class="red">${t().hoursRange}</span>`;
  const d = new Date(Date.now() + x * 3600000);
  const day = d.toLocaleDateString(st.lang === "fr" ? "fr-FR" : "ar-TN-u-nu-latn", { weekday: "long" });
  return `<span class="gold-t">${t().endsAt(day + " " + LTR(`${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`))}</span>`;
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
      <div class="row stepper"><button class="ic" data-a="hoursAdd" data-x="-1">−</button>
        <label class="hrs"><input id="hrs" type="number" inputmode="numeric" min="1" max="2160" value="${w.hours}"><span>${t().hoursUnit}</span></label>
        <button class="ic" data-a="hoursAdd" data-x="1">+</button></div><p id="hrsEnd" class="sm">${hoursEnd(w.hours)}</p>
      <h4>${t().readersCount(n)}</h4>${n ? `<p class="gold-t sm">${t().eachPortion(q, q2)}</p>` : ""}
      ${w.input ? desc(w.input.members, (m) => m.id).map((m) => `<label class="check ${m.busy ? "dim" : ""}"><input type="checkbox" data-a="wsel" data-x="${m.id}" ${w.sel.includes(m.id) ? "checked" : ""} ${m.busy ? "disabled" : ""}>
        <span class="grow">${memberName(m.id, m.name)}<small class="${m.busy ? "st" : "mut"}">${m.busy ? t().participating(m.busy) : t().readInCycle((m.coverage.match(/1/g) || []).length)}</small></span></label>`).join("") : `<div class="spin"></div>`}
      ${btn(t().nextDistribution, "wizNext", "", "wide " + (n && validHours(w.hours) ? "" : "off"))}`;
  } else {
    body = `<div class="card hl"><b>${h(c ? c.name : "")} · ${t().khatmaN((w.input ? w.input.round : 0) + 1)}</b><p class="sm">${t().summary(w.sel.length, w.hours)}</p><p class="xs">${t().distributionExplained}</p></div>
      ${w.plan ? desc(w.plan, (x) => x.userId).map((x) => `<div class="card row sp"><div>${memberName(x.userId, x.name)}<p class="mut sm">${h(Mushaf.range(x.pages[0], x.pages[1], st.lang))}</p></div>
        <div class="end"><b>${t().pagesShort} ${t().rng(x.pages[0], x.pages[1])}</b><small class="${x.unread === x.pages[1] - x.pages[0] + 1 ? "ok" : "st"}">${x.unread === x.pages[1] - x.pages[0] + 1 ? t().allNew : t().newPages(x.unread, x.pages[1] - x.pages[0] + 1)}</small></div></div>`).join("") : `<div class="spin"></div>`}
      ${btn(t().startKhatma, "wizCreate", "", "wide " + (w.plan ? "" : "off"))}`;
  }
  return sub(titles[w.step]) + `<main>${dots}${body}</main>`;
}
// «ادعُ أهلك وأصدقاءك» (1.10): the download page with the group code (join request to that group) and the inviter's number.
const relativesLink = (me) => "https://tsalatnet.github.io/tsalat-media/k/?" + (me.share_code ? "c=" + me.share_code + "&" : "") + "r=" + me.id;
function qrSvg(text, cell) { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true }); }
function inviteCard(me) {
  const link = relativesLink(me);
  return `<div class="card hl invite"><b>🤝 ${t().inviteRelatives}</b><div class="row irow">
      <p class="sm grow">${t().inviteRelativesText(!!me.share_code)}${me.invited ? `<br><b class="invited">${t().invitedCount(me.invited)}</b>` : ""}</p>
      <div class="qr" data-a="qrBig">${qrSvg(link, 4)}</div></div>
    <div class="row">${btn(t().shareLink, "inviteShare", "", "grow")}${btn(t().shareQrImage, "inviteImage", "", "outline grow")}</div></div>`;
}
// The QR code as a PNG file (canvas), for the share sheet; a browser without file sharing downloads it.
async function qrPng(text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = 16, m = 2 * cell, cv = document.createElement("canvas");
  cv.width = cv.height = n * cell + 2 * m; const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#0E3B2E";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect(m + x * cell, m + y * cell, cell, cell);
  return new Promise((res) => cv.toBlob((b) => res(new File([b], "khatma-invite.png", { type: "image/png" })), "image/png"));
}
function vSettings() {
  const me = st.me;
  return sub(t().settings) + `<main>${inviteCard(me)}<div class="card"><small class="mut">${t().myNumber}</small><div class="bigcode">${LTR(me.id)}</div></div>
    <h4>${t().language} · ${st.lang === "ar" ? "Langue" : "اللغة"}</h4><div class="row">
      <button class="fchip grow ${st.lang === "ar" ? "on" : ""}" data-a="setLang" data-x="ar">العربية</button><button class="fchip grow ${st.lang === "fr" ? "on" : ""}" data-a="setLang" data-x="fr">Français</button></div>
    <h4>${t().name}</h4><div class="row"><input id="sname" maxlength="40" value="${h(me.name)}">${btn(t().save, "saveName", "", "tonal")}</div>
    <h4>${t().phone}</h4><div class="row">${phoneInput("sphone", phonePretty(me.phone))}${btn(t().save, "savePhone", "", "tonal")}</div>
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
  const part = sc.part, cu = sc.catchup, pp = sc.personal ? Personal.get() : null;
  const first = part ? part.from : cu ? cu[0] : pp ? pp.start_page : 1, last = part ? part.to : cu ? cu[1] : 604;
  const pages = []; for (let p = first; p <= last; p++) pages.push(p); if (last === 604 && !cu) pages.push(605, 606);
  const img = mushafImg, ranged = part || cu || sc.personal;
  return `<div class="reader ${store.get("night") === "1" ? "night" : ""}" id="reader"><div class="pages" id="pages" dir="rtl">
    ${pages.map((n) => `<div class="pg" data-p="${n}"><img loading="lazy" decoding="async" src="${img(n)}" alt=""></div>`).join("")}</div>
    <div class="rtop" id="rtop"><button class="ic" data-a="back">${t().back}</button><div class="grow"><b id="rs"></b><small id="rj"></small></div>
      ${ranged ? "" : `<button class="ic" data-a="navOpen">🔍</button>`}<button class="ic" data-a="night">🌙</button></div>
    <div class="band t" id="bt"></div><div class="band b" id="bb"></div>
    ${ranged ? "" : `<div class="rbot" id="rbot"><div class="units" id="units"></div><div class="navrow" id="navrow"></div></div>`}
    ${ranged ? `<div class="rbot" id="rbot"><div class="row"><b id="rc"></b><div class="lin grow"><i id="rl"></i></div></div><div id="rbtn"></div></div>` : ""}</div>`;
}
// ─── reading log (1.10; phase 1 of the reading-quality design): what the reader measured on a part ───
// Foreground time per page (a stay without a touch counts 8 min at most), pages shown, foreground spans (a gap
// over 20 min starts a new one), times hidden, how soon «أتممت» followed the last return. Kept in the store until
// sent (khatma_read_log) when the page hides, the reader closes, and at «أتممت». Only the part's own reader.
const RL_CAP = 8 * 60000, RL_GAP = 20 * 60000;
function readLogOf(key) {
  let o = {}; try { o = JSON.parse(store.get("rlog_" + key, "{}")) || {}; } catch {}
  o.pages = o.pages || {}; o.spans = o.spans || []; o.bg_count = o.bg_count || 0;
  let page = null, segStart = 0, credited = 0, fg = false, lastResume = Date.now(), closed = false;
  const save = () => { if (!closed) store.set("rlog_" + key, JSON.stringify(o)); };
  const flush = () => { if (page == null || !fg) return; const total = Math.min(performance.now() - segStart, RL_CAP), add = total - credited;
    if (add <= 0) return; credited = total; const e = (o.pages[page] = o.pages[page] || { ms: 0, n: 0 }); e.ms += Math.round(add); };
  const rl = {
    resume() { if (fg) return; fg = true; const now = Date.now(); lastResume = now; const last = o.spans[o.spans.length - 1];
      if (last && now - last[1] < RL_GAP) last[1] = now; else o.spans.push([now, now]); while (o.spans.length > 60) o.spans.shift();
      segStart = performance.now(); credited = 0; },
    pause(background = true) { if (!fg) return; flush(); fg = false; const last = o.spans[o.spans.length - 1]; if (last) last[1] = Date.now();
      if (background) o.bg_count++; save(); },
    enter(p) { if (p === page) return; flush(); page = p; const e = (o.pages[p] = o.pages[p] || { ms: 0, n: 0 }); e.n++; segStart = performance.now(); credited = 0; save(); },
    touch() { flush(); segStart = performance.now(); credited = 0; },
    done() { flush(); o.resume_to_done_ms = Date.now() - lastResume; save(); },
    fgMs() { flush(); return Object.values(o.pages).reduce((a, e) => a + e.ms, 0); },
    looksShort(pages) { return rl.fgMs() < 40000 * pages || Object.keys(o.pages).length * 2 < pages; },
    toJson() { flush(); return { source: "web " + VERSION, fg_ms: rl.fgMs(), pages_seen: Object.keys(o.pages).length, sessions: o.spans.length,
      bg_count: o.bg_count, resume_to_done_ms: o.resume_to_done_ms ?? null, pages: o.pages, spans: o.spans }; },
    clear() { closed = true; store.set("rlog_" + key, null); },
  };
  return rl;
}
const sendReadLog = (part, rl) => rl ? rpc("khatma_read_log", auth({ p_khatma: part.khatma_id, p_idx: part.idx, p_log: rl.toJson() })).catch(() => {}) : Promise.resolve();

function setupReader(sc) {
  const box = document.getElementById("pages"), part = sc.part, cu = sc.catchup, ranged = !!(part || cu), pp = sc.personal ? Personal.get() : null;
  const key = part ? part.khatma_id + "#" + part.idx : cu ? "missed#" + cu[0] : pp ? "personal" : "free";
  const rl = part && part.khatma_status === "active" && part.status !== "done" ? readLogOf(key) : null;
  sc.rlog = rl; if (rl) rl.resume();
  const els = [...box.children], first = part ? part.from : cu ? cu[0] : pp ? pp.start_page : 1, last = part ? part.to : cu ? cu[1] : 604;
  let start = part ? (+store.get("page_" + key, 0) || part.last_page || first) : cu ? (+store.get("page_" + key, 0) || first) : pp ? Math.min(pp.next, 604) : sc.page;
  if (start < first || start > last) start = first;
  const idx0 = els.findIndex((e) => +e.dataset.p === start);
  requestAnimationFrame(() => { if (idx0 > 0) els[idx0].scrollIntoView({ inline: "start", block: "nearest" }); update(); });
  let hideT, sendT, cur = start;
  const chrome = (on) => { document.getElementById("reader").classList.toggle("bare", !on); clearTimeout(hideT);
    if (on && !(ranged && cur >= last) && !sc.keepBar) hideT = setTimeout(() => chrome(false), 4000); };
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
    if (rl && pg >= first && pg <= last) rl.enter(pg);
    if (part) {
      const total = last - first + 1, read = pg - first + 1, me = (st.me.parts || []).find((p) => p.khatma_id === part.khatma_id && p.idx === part.idx) || part;
      document.getElementById("rc").textContent = LTR(read + "/" + total);
      document.getElementById("rl").style.width = (read / total) * 100 + "%";
      const done = me.status === "done" || sc.finished;
      document.getElementById("rbtn").innerHTML = me.khatma_status === "active" && !done
        ? `<button class="btn wide ${n >= last ? "gold" : "soft"}" data-a="doneAsk">${t().iFinished}</button>` : done ? `<p class="ok center">${t().finishedAccepted}</p>` : "";
      if (me.khatma_status === "active" && !done) { clearTimeout(sendT); sendT = setTimeout(() => rpc("khatma_part_progress", auth({ p_khatma: part.khatma_id, p_idx: part.idx, p_page: pg })).catch(() => {}), 4000); }
      if (n >= last) chrome(true);
    } else if (pp) { sc.keepBar = personalReaderBar(sc, n); if (sc.keepBar) chrome(true); }
    else if (!cu) navBar(pg);
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
  box.addEventListener("click", () => { if (rl) rl.touch(); chrome(document.getElementById("reader").classList.contains("bare")); });
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
  else if (sc && sc.s === "psetup") v = vPersonalSetup();
  else if (sc && sc.s === "pstats") v = vPersonalStats();
  else if (st.phase === "loading") v = vLoading();
  else if (st.phase === "offline") v = vOffline();
  else if (st.phase === "name") v = vName();
  else if (st.phase === "gate") v = vGate();
  else if (!sc) v = vHome();
  else v = { phone: () => vPhone(sc), settings: vSettings, about: vAbout, khatma: () => vKhatmaDetail(sc.id), circle: () => vCircleEdit(sc.id), create: vCreate, cstats: () => vCircleStats(sc.id) }[sc.s]();
  // Keep what the person is typing across re-renders.
  const keep = {}; app.querySelectorAll("input[id],textarea[id]").forEach((i) => (keep[i.id] = i.value));
  app.innerHTML = v + vDialog() + vSheet() + (st.toast ? `<div class="toast">${h(st.toast)}</div>` : "");
  Object.entries(keep).forEach(([id, val]) => { const i = document.getElementById(id); if (i && i.type !== "checkbox") i.value = val; });
}

// ─── actions ───
const val = (id) => (document.getElementById(id)?.value || "").trim();
async function share(text) {
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { return; } }
  try { await navigator.clipboard.writeText(text); toast("✓"); } catch {}
}
function closeReader() { const sc = topS(); if (sc && sc.lock) sc.lock.release().catch(() => {}); if (sc && sc.rlog) { sc.rlog.pause(false); sendReadLog(sc.part, sc.rlog); } }
const A = {
  back() { if (topS() && topS().s === "reader" && !st.dialog) closeReader(); back(); },
  start, lang() { A.setLang(st.lang === "ar" ? "fr" : "ar"); },
  setLang(l) { st.lang = l; store.set("lang", l); if (userId()) rpc("khatma_set_lang", auth({ p_lang: l })).catch(() => {}); render(); },
  setName() { const n = val("name"), ph = phoneHint("phone", true); if (n.length < 2 || !ph) return;
    act(async () => { await rpc("khatma_set_phone", auth({ p_phone: ph })); await rpc("khatma_set_name", auth({ p_name: n })); await reload(); }); },
  savePhone() { const ph = phoneHint("sphone", true); if (!ph) return; act(async () => { await rpc("khatma_set_phone", auth({ p_phone: ph })); await reload(); }, () => t().phoneSaved); },
  savePhoneOpen(x) { const ph = phoneHint("pphone", true); if (!ph) return;
    act(async () => { await rpc("khatma_set_phone", auth({ p_phone: ph })); await reload(); if (topS() && topS().s === "phone") st.stack.pop(); A.open(x); }); },
  saveName() { const n = val("sname"); act(async () => { await rpc("khatma_set_name", auth({ p_name: n })); await reload(); }, () => t().nameSaved); },
  requestJoin() { act(async () => { const r = await rpc("khatma_request_join", auth()); await reload(); joinSent(r.admin); }); },
  join() { const c = val("code").toUpperCase(); if (c.length !== 6) return;
    act(async () => { const r = await rpc("khatma_join", auth({ p_code: c })); await reload(); toast(r.status === "accepted" ? t().memberOf(r.admin) : t().requestSent(r.admin)); }); },
  recoverDialog() { st.dialog = { title: t().recoverAsk, text: t().recoverText, okLabel: t().recoverSend,
    body: `<input id="acode" inputmode="numeric" maxlength="5" placeholder="${t().recoverNumber}"><input id="rname" maxlength="40" placeholder="${t().nameField}">`,
    ok: (num, name) => act(async () => { const r = await rpc("khatma_recover_request", auth({ p_number: +num, p_name: name })); st.dialog = { title: t().joinSentTitle, text: t().recoverSent(h(r.admin)), cancelLabel: t().ok }; }) }; render(); },
  adminDialog() { st.dialog = { title: t().adminMode, text: t().adminCodeAsk, body: `<input id="acode" placeholder="KH-XXXX" autocapitalize="characters">`, okLabel: t().enable,
    ok: (code) => act(async () => { await rpc("khatma_admin_enable", auth({ p_code: code.toUpperCase() })); await reload(); st.ov = await rpc("khatma_admin_overview", auth()); st.adminTab = true; }, () => t().adminEnabled) }; render(); },
  syncAsk() { st.dialog = { title: t().sync, text: t().syncText, okLabel: t().syncOk,
    ok: () => act(async () => { const n = await rpc("khatma_admin_sync", auth()); st.ov = await rpc("khatma_admin_overview", auth()); toast(n > 0 ? t().synced(n) : t().syncNone); }) }; render(); },
  closeAdminAsk() { st.dialog = { title: t().closeAdmin, text: t().closeAdminText, okLabel: t().closeAdminOk,
    ok: () => act(async () => { await rpc("khatma_admin_logout", auth()); st.adminTab = false; st.ov = null; st.stack = []; await reload(); }, () => t().adminClosed) }; render(); },
  dclose() { st.dialog = null; st.sheet = null; render(); },
  dok() { const d = st.dialog, typed = val("acode"), typed2 = val("rname"), paper = document.getElementById("paper")?.checked; st.dialog = null; render(); d.ok(typed, typed2, paper); },   // read the dialog input before it closes
  tab(x) { st.adminTab = x === "1"; st.tab = x; if (st.adminTab) refresh(); render(); window.scrollTo(0, 0); },
  section(x) { st.adminSection = +x; render(); },
  push(x) { push({ s: x }); },
  open(x) { const [k, i] = x.split("#"); const p = st.me.parts.find((q) => q.khatma_id === k && q.idx === +i); if (!p) return;
    // 1.19: no portion of an active khatma before the mobile number is given (asked once).
    if (p.khatma_status === "active" && !st.me.phone) { push({ s: "phone", key: x }); return; }
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
    // The measured time looks short for these pages: the reader's word, never a reproach (paper mushaf, by heart).
    const asked = !!(sc.rlog && sc.rlog.looksShort(p.to - p.from + 1));
    st.dialog = { title: t().confirmTitle, text: atEnd ? t().confirmAtEnd(p.from, p.to) : t().confirmEarly(p.to), okLabel: t().yesFinished,
      body: asked ? `<label class="chk"><input type="checkbox" id="paper"><span>${t().readPaper}</span></label>` : "",
      ok: (_a, _b, paper) => act(async () => {
        if (sc.rlog) { sc.rlog.done(); await sendReadLog(p, sc.rlog); }
        const args = auth({ p_khatma: p.khatma_id, p_idx: p.idx }); if (asked) args.p_paper = !!paper;
        const r = await rpc("khatma_part_done", args); if (sc.rlog) sc.rlog.clear(); sc.finished = true; await reload();
        st.dialog = { title: r.khatm ? t().khatmTitle : t().acceptedTitle, text: r.khatm ? t().khatmText : t().acceptedText, okLabel: t().alhamdulillah, cancel: false,
          ok: () => { closeReader(); st.stack.pop(); render(); } }; }) }; render(); },
  // admin
  khatma(x) { st.unfinishedOnly = false; push({ s: "khatma", id: x }); },
  unfinished(x) { st.unfinishedOnly = x === "1"; render(); },
  // The share sheet of iOS: the admin picks Messenger, then the group, there.
  nudge(x) { const k = st.ov.khatmas.find((q) => q.id === x), byUser = new Map();
    k.parts.filter((p) => p.status !== "done").forEach((p) => { const u = byUser.get(p.user_id) || { name: p.name, left: 0 };
      u.left += p.to - p.from + 1 - (p.last_page ? p.last_page - p.from + 1 : 0); byUser.set(p.user_id, u); });
    const lines = [...byUser].sort((a, b) => b[0] - a[0]).map(([id, u]) => t().nudgeLine(id, u.name, u.left));
    st.dialog = { title: t().nudgeTitle, text: t().nudgeHint, okLabel: t().nudgeSend,
      body: `<textarea id="acode" class="nudge" rows="10">${h(t().nudgeMessage(k.circle, remaining(k.deadline), lines))}</textarea>`,
      ok: (text) => { if (text) share(text); } }; render(); },
  khatmaReplace(x) { st.stack.pop(); push({ s: "khatma", id: x }); },
  circle(x) { st.circleSel = null; push({ s: "circle", id: x === "" ? null : +x }); },
  csel(x) { const cs = st.circleSel, id = +x, i = cs.sel.indexOf(id); cs.name = val("cname"); if (i >= 0) cs.sel.splice(i, 1); else cs.sel.push(id); render(); },
  circleSave(x) { const cs = st.circleSel, name = val("cname"); if (!name || !cs.sel.length) return;
    const id = x === "" ? null : +x, moved = cs.sel.filter((m) => otherCircle(m, id));
    const save = () => act(async () => { const cid = await rpc("khatma_circle_save", auth({ p_id: id, p_name: name, p_members: cs.sel }));
      if (moved.length) await rpc("khatma_circle_move", auth({ p_circle: cid, p_members: moved }));
      st.ov = await rpc("khatma_admin_overview", auth()); st.stack.pop(); if (x === "") A.create(String(cid)); }, () => t().circleSaved);
    if (!moved.length) return save();
    // Members of another circle: the admin confirms the move (each one takes what they read along).
    cs.name = name;
    st.dialog = { title: t().transferTitle(moved.length), text: t().transferText(h(name)), okLabel: t().transferOk(moved.length), ok: save,
      body: `<div class="dscroll">${moved.map((m) => `<div class="mt">${memberName(m, member(m)?.name)}<p class="mut xs">${t().transferFrom(h(otherCircle(m, id).name))}${member(m)?.busy ? t().transferBusy : ""}</p></div>`).join("")}</div>` };
    render(); },
  circleDelAsk(x) { const c = st.ov.circles.find((q) => q.id === +x); st.dialog = { title: t().deleteCircleTitle(h(c.name)), text: c.active ? t().deleteCircleActiveText(c.active) : t().deleteCircleText, okLabel: t().deleteCircleOk, cancelLabel: t().keep,
    ok: () => act(async () => { await rpc("khatma_circle_cancel", auth({ p_id: +x })); st.ov = await rpc("khatma_admin_overview", auth()); st.me = await rpc("khatma_me", auth()); st.stack.pop(); }, () => t().circleDeleted) }; render(); },
  create(x) { st.wiz = { circle: x ? +x : null, step: x ? 1 : 0, hours: 24, sel: [], input: null, plan: null }; push({ s: "create" }); if (x) loadPlan(); },
  wizCircle(x) { st.wiz.circle = +x; st.wiz.step = 1; render(); loadPlan(); },
  hours(x) { st.wiz.hours = +x; render(); }, hoursAdd(x) { st.wiz.hours = Math.max(1, Math.min(2160, (validHours(st.wiz.hours) ? st.wiz.hours : 24) + +x)); render(); },
  wsel(x) { const w = st.wiz, id = +x, i = w.sel.indexOf(id); if (i >= 0) w.sel.splice(i, 1); else w.sel.push(id); render(); },
  wizNext() { const w = st.wiz; if (!w.sel.length || !validHours(w.hours)) return; w.step = 2; w.plan = null; render();
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
  answerRecovery(x) { const [id, ok] = x.split(":"); act(async () => { await rpc("khatma_recover_answer", auth({ p_id: +id, p_accept: ok === "1" })); st.ov = await rpc("khatma_admin_overview", auth()); st.recov = await rpc("khatma_recover_list", auth()); }, () => ok === "1" ? t().accepted : t().refused); },
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
  if (e.target.id === "hrs" && st.wiz) {      // typed hours: no re-render (the keyboard stays open)
    const v = e.target.value.trim(), x = /^\d{1,4}$/.test(v) ? +v : NaN; st.wiz.hours = x;
    document.getElementById("hrsEnd").innerHTML = hoursEnd(x);
    document.querySelector('[data-a="wizNext"]')?.classList.toggle("off", !(st.wiz.sel.length && validHours(x)));
    document.querySelectorAll('[data-a="hours"]').forEach((c) => c.classList.toggle("on", +c.dataset.x === x));
    return;
  }
  if (e.target.id !== "navq" || !st.dialog) return;
  st.navQ = e.target.value; const pos = e.target.selectionStart; st.dialog.body = navBody(); render();
  const i = document.getElementById("navq"); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
});
document.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("phone")) phoneHint(e.target.id, false); });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "phone") A.setName(); if (e.key === "Enter" && e.target.id === "pphone") A.savePhoneOpen(topS().key);
  if (e.key === "Enter" && e.target.id === "name") document.getElementById("phone")?.focus(); if (e.key === "Enter" && e.target.id === "code") A.join(); });
A.cstats = (x) => { const id = +x; push({ s: "cstats", id });
  rpc("khatma_circle_stats", auth({ p_circle: id })).then((d) => { st.cstats = { id, data: d }; render(); }).catch((e) => toast(errorText(e))); };
// ★ tapped (members list or circle statistics): the detail of the criteria
A.starsOf = (x) => { const id = +x, m = (st.cstats && st.cstats.data.members.find((q) => q.id === id)) || st.ov.members.find((q) => q.id === id);
  if (!m || !m.stars) return; st.dialog = { title: memberName(m.id, m.name), body: starsDetail(m.stars), cancelLabel: t().ok }; render(); };
A.inviteShare = () => share(t().inviteRelativesMessage(relativesLink(st.me)));
A.inviteImage = async () => {
  const link = relativesLink(st.me), file = await qrPng(link), text = t().inviteRelativesMessage(link);
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); } catch {} return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
};
A.qrBig = () => { st.dialog = { title: t().inviteRelatives, body: `<div class="qr big">${qrSvg(relativesLink(st.me), 8)}</div><p class="center sm">${t().scanToInstall}</p>`, cancelLabel: t().ok }; render(); };
document.addEventListener("visibilitychange", () => {
  const sc = topS(); if (sc && sc.rlog) { if (document.hidden) { sc.rlog.pause(true); sendReadLog(sc.part, sc.rlog); } else sc.rlog.resume(); }
  if (!document.hidden) checkMinVersion(); if (!document.hidden && userId() && st.phase !== "loading") refresh(); });

// Forced update (1.10): k/version.json's `minWeb` (publish_apk.py --set-min-web). Below it, the app reloads
// itself: the service worker is network first, so the reload brings the new files. One reload per minimum
// (remembered for this run), so a stale copy without network never loops.
const below = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; } return false; };
async function checkMinVersion() {
  try {
    const r = await fetch("../version.json?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) return;
    const v = await r.json();
    if (!v.minWeb || !below(VERSION, v.minWeb) || checkMinVersion.done === v.minWeb) return;
    checkMinVersion.done = v.minWeb;
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.update().catch(() => {});
    location.reload();
  } catch {}
}
setInterval(() => { if (!document.hidden && userId() && ["home", "gate"].includes(st.phase)) refresh(); }, 20000);

// An invitation opened in Safari: keep the code for the installed app (it cannot read Safari's storage,
// the install guide shows the code to type), or join at once when already inside the app.
(function boot() {
  const c = new URLSearchParams(location.search).get("c");
  if (c) store.set("invite", c.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12));
  const r = (new URLSearchParams(location.search).get("r") || "").replace(/\D/g, "").slice(0, 6);
  if (r && !store.get("ref")) store.set("ref", r);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  checkMinVersion();
  render();
  if (!(isIOS() && !standalone())) start();
})();
