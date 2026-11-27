// TSALAT web app (iPhone, and any browser): the times of one mosque, live. ?id=<mosque_id>, else the
// mosque chosen last, else the mosque search. On iPhone, «Sur l'écran d'accueil» keeps the ?id in its link.
"use strict";
(() => {
  const $app = document.getElementById("app");
  const { esc, ltr, hm, pad } = TS;
  const params = new URLSearchParams(location.search);
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  let M = null, showTomorrow = false, timer = null, dayKey = "";

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const plusDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmtAr = new Intl.DateTimeFormat("ar-TN-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
  const fmtFr = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  function countdown(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + ":" + pad(m) : String(m)) + ":" + pad(s % 60);
  }

  // ── Mosque search (no ?id, or «مسجد آخر») ──
  async function search() {
    clearInterval(timer);
    $app.innerHTML = `
      <section class="hero"><div class="brand">${TS.logo(34)}<b>TSALAT</b> · توقيت الصّلاة</div>
        <h1 class="mosque">اختر مسجدك</h1><div class="city fr">Choisissez votre mosquée</div></section>
      <input class="search" id="q" type="search" placeholder="اسم المسجد أو المدينة · Mosquée ou ville" autocomplete="off">
      <div class="hits" id="hits"><div class="spinner"></div></div>`;
    let list = [];
    try { list = await TS.directory(); await Promise.all(list.slice(0, 1).map(m => TS.cityAr(m.code))); } catch (e) { document.getElementById("hits").innerHTML = `<p class="msg">لا اتصال بالإنترنت · Pas de connexion</p>`; return; }
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ْ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
    const q = document.getElementById("q");
    // The Latin city / code name the TIMES TABLE's town, shared by nearby towns (Khniss uses Ksibet el Mediouni's):
    // only searched and shown when it is the mosque's own town (same rule as MosqueEntry.searchFields in the app).
    const tableAr = {};
    for (const m of list) if (!(m.code in tableAr)) tableAr[m.code] = await TS.cityAr(m.code);
    const inTable = (m) => !m.cityAr || m.cityAr === tableAr[m.code];
    const slug = (m) => m.id.split(".").slice(2).join(" ").replace(/-/g, " ");
    const show = () => {
      const words = norm(q.value).split(/\s+/).filter(Boolean);
      const hits = words.length ? list.filter(m => { const h = norm([m.name, m.cityAr, slug(m), inTable(m) ? m.city + " " + m.code : ""].join(" ")); return words.every(w => h.includes(w)); }).slice(0, 40) : [];
      document.getElementById("hits").innerHTML = !words.length ? `<p class="msg">${ltr(list.length)} مسجدًا · mosquées</p>`
        : hits.length ? hits.map(m => `<a class="hit" href="?id=${encodeURIComponent(m.id)}">${esc(m.name)}<small>${esc(m.cityAr || m.city)}${inTable(m) && m.cityAr && m.city ? ` · <span class="fr">${esc(m.city)}</span>` : ""}</small></a>`).join("")
        : `<p class="msg">لا نتيجة · Aucun résultat</p>`;
    };
    q.addEventListener("input", show); show(); q.focus();
  }

  // ── One mosque ──
  async function open(id) {
    try { M = await TS.load(id); }
    catch (e) { $app.innerHTML = `<p class="msg">تعذّر تحميل المسجد · Mosquée introuvable ou pas de connexion</p><a class="btn ghost" href="?search">اختيار مسجد · Choisir une mosquée</a>`; return; }
    TS.store.set("mosque", id);
    document.title = M.cfg.name + " · توقيت الصّلاة";
    frame();
    tick(); clearInterval(timer); timer = setInterval(tick, 1000);
  }

  function frame() {
    const c = M.cfg, ios = TS.isIOS(), android = TS.isAndroid();
    $app.innerHTML = `
      <section class="hero">${c.image ? `<div class="photo" style="background-image:url('${esc(c.image)}')"></div>` : ""}
        <div class="brand">${TS.logo(30)}<b>TSALAT</b> · توقيت الصّلاة</div>
        <h1 class="mosque">${esc(c.name)}</h1>
        <div class="city">${esc(c.cityAr || c.city)}${c.cityAr && c.city ? ` · <span class="fr">${esc(c.city)}</span>` : ""}</div>
        <div class="dates" id="dates"></div>
        <div class="clock" id="clock"></div>
      </section>
      <div class="next" id="next"></div>
      <div class="day-tabs"><button id="t0" class="on">اليوم · <span class="fr">Aujourd'hui</span></button><button id="t1">غدًا · <span class="fr">Demain</span></button></div>
      <div class="times" id="times"></div>
      ${ios && !standalone ? `<div class="card"><h3>📲 أضِف التطبيق إلى شاشتك</h3>
        <p>اضغط على زر المشاركة ${shareIcon()} في سفاري، ثم «إضافة إلى الشاشة الرئيسية».</p>
        <p class="fr">Touchez ${shareIcon()} <b>Partager</b> dans Safari, puis « <b>Sur l'écran d'accueil</b> » : l'horaire de votre mosquée s'ouvrira comme une application.</p></div>` : ""}
      ${android ? `<div class="card"><h3>🤖 تطبيق أندرويد الكامل</h3><p>الأذان بالصوت، التنبيهات والودجات، مُهيّأ لهذا المسجد.</p>
        <p class="fr">Sur Android : l'application complète (azan sonore, alertes, widgets).</p>
        <a class="btn" href="${esc(TS.androidUrl(c.id))}">تحميل التطبيق · Télécharger</a></div>` : ""}
      <div class="links"><a class="btn ghost" href="?search">🕌 مسجد آخر<br><span class="fr" style="font-size:.85rem">Autre mosquée</span></a>
        <button class="btn ghost" id="share">↗ مشاركة<br><span class="fr" style="font-size:.85rem">Partager</span></button></div>
      <footer><div class="brand">${TS.logo(20)}<b>TSALAT</b></div>tsalat.net@gmail.com</footer>`;
    document.getElementById("t0").onclick = () => { showTomorrow = false; table(); };
    document.getElementById("t1").onclick = () => { showTomorrow = true; table(); };
    document.getElementById("share").onclick = async () => {
      const url = TS.iphoneUrl(c.id), text = "مواقيت الصلاة · " + c.name;
      if (navigator.share) navigator.share({ title: text, url }).catch(() => {});
      else { await navigator.clipboard?.writeText(url).catch(() => {}); alert("✓ " + url); }
    };
    dayKey = ""; table();
  }

  function shareIcon() {
    return `<svg class="share-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>`;
  }

  function table() {
    const now = new Date(), d = showTomorrow ? plusDays(today(), 1) : today();
    const list = M.dayOf(d);
    document.getElementById("t0").classList.toggle("on", !showTomorrow);
    document.getElementById("t1").classList.toggle("on", showTomorrow);
    if (!list) { document.getElementById("times").innerHTML = `<p class="msg">—</p>`; return; }
    const curIdx = showTomorrow ? -1 : (() => {
      const live = list.find(p => p.key !== "shrouq" && now >= p.azan && now < p.end);
      if (live) return live.i;
      const next = list.find(p => p.key !== "shrouq" && p.azan > now);
      return next ? next.i : -1;
    })();
    document.getElementById("times").innerHTML = `
      <div class="head"><span>الصلاة · <span class="fr">Prière</span></span><span>الأذان<br><span class="fr">Azan</span></span><span>الإقامة<br><span class="fr">Iqama</span></span></div>
      ${list.map(p => {
        const cls = [p.key === "shrouq" ? "sun" : "", p.i === curIdx ? "cur" : "", !showTomorrow && p.i !== curIdx && p.end <= now && p.key !== "shrouq" ? "past" : ""].join(" ");
        const iq = p.key === "shrouq" ? `<span class="t iq">${hm(p.iqama)}<small>الضحى · Doha</small></span>`
          : p.jumua ? `<span class="t iq">${p.time2 != null ? TS.hmMin(p.time2) + "<small>الحصة الثانية · 2ᵉ</small>" : "—<small>الخطبة · Khotba</small>"}</span>`
          : `<span class="t iq">${hm(p.iqama)}<small>${ltr("+" + Math.round((p.iqama - p.azan) / 60000))} د</small></span>`;
        return `<div class="row ${cls}"><span class="name">${p.ar}<span class="fr">${p.fr}</span></span><span class="t">${hm(p.azan)}</span>${iq}</div>`;
      }).join("")}`;
  }

  function nextEvent(now) {
    for (const d of [today(), plusDays(today(), 1)]) {
      for (const p of M.dayOf(d) || []) {
        if (p.key === "shrouq") continue;
        if (now < p.azan) return { kind: "azan", p, at: p.azan };
        if (!p.jumua && now < p.iqama) return { kind: "iqama", p, at: p.iqama };
        if (now < p.end) return { kind: "prayer", p, at: p.end };
      }
    }
    return null;
  }

  function tick() {
    const now = new Date(), key = today().toDateString();
    if (key !== dayKey) {                                  // a new day: dates and table again
      dayKey = key;
      const h = M.hijriOf(today());
      document.getElementById("dates").innerHTML =
        `<span>${TS.DAYS_AR[now.getDay()]} ${fmtAr.format(now)}</span><span>${ltr(h.day)} ${TS.HIJRI_AR[h.month - 1]} ${ltr(h.year)} هـ</span>
         <span class="fr">${fmtFr.format(now)} · ${h.day} ${TS.HIJRI_FR[h.month - 1]} ${h.year}</span>`;
      table();
    }
    document.getElementById("clock").innerHTML = hm(now) + `<small>${pad(now.getSeconds())}</small>`;
    const ev = nextEvent(now), box = document.getElementById("next");
    if (!ev) { box.innerHTML = ""; return; }
    box.className = "next" + (ev.kind === "iqama" ? " iqama" : "");
    const left = countdown(ev.at - now);
    box.innerHTML = ev.kind === "azan"
      ? `<div class="label">الأذان القادم · <span class="fr">Prochain azan</span></div><div class="what">${ev.p.ar} · <span class="fr">${ev.p.fr}</span> — <span class="ltr">${hm(ev.p.azan)}</span></div><div class="count">${left}</div>`
      : ev.kind === "iqama"
      ? `<div class="label">الإقامة بعد · <span class="fr">Iqama dans</span></div><div class="what">${ev.p.ar} — <span class="ltr">${hm(ev.p.iqama)}</span></div><div class="count">${left}</div>`
      : `<div class="label">${ev.p.jumua ? "صلاة الجمعة" : "الصلاة قائمة"} · <span class="fr">${ev.p.jumua ? "Joumou'a en cours" : "Prière en cours"}</span></div><div class="what">${ev.p.ar}</div>`;
    if (now.getSeconds() === 0) table();                   // the highlighted row moves on
  }

  const id = TS.validId(params.get("id")) || (params.has("search") ? null : TS.validId(TS.store.get("mosque")));
  if (id) open(id); else search();
})();
