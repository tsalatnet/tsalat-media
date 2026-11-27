// TSALAT web — shared by the iPhone web app (w/), the mosque QR page (m/) and its A4 poster (m/affiche.html).
// The schedule rules are a port of the app's core (ScheduleCalculator / MosqueConfigParser / HijriCalendar):
// keep them in step with net.tsalat.prayer when a rule changes there.
"use strict";
const TS = (() => {
  const SB = "https://xecnhwgdymydmbhwzhaj.supabase.co";
  const KEY = "sb_publishable_p7NtGN0uUUkRMRGcqu1Rxg_DQBCRUxV";
  /** Public site root (the QR codes always point there, even from a local copy). */
  const SITE = "https://tsalatnet.github.io/tsalat-media/";
  const ROOT = new URL("../", document.currentScript ? document.currentScript.src : location.href).href;

  const P = ["fajr", "shrouq", "dhuhr", "asr", "maghrib", "isha"];
  const NAMES_AR = ["الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"];
  const NAMES_FR = ["Fajr", "Chourouq", "Dhouhr", "Asr", "Maghrib", "Icha"];
  const LEGACY = { fajr: "FAJR", dhuhr: "DOHR", asr: "ASSR", maghrib: "MGRB", isha: "ISHA" };
  const HIJRI_AR = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  const HIJRI_FR = ["Mouharram", "Safar", "Rabi' al-awwal", "Rabi' ath-thani", "Joumada al-oula", "Joumada ath-thania",
    "Rajab", "Cha'bane", "Ramadan", "Chawwal", "Dhou al-qi'da", "Dhou al-hijja"];
  const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  // ── Server ──
  async function rpc(fn, body = {}, query = "") {
    const r = await fetch(`${SB}/rest/v1/rpc/${fn}${query}`, {
      method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(fn + " " + r.status);
    return r.json();
  }
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("tsalat:" + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("tsalat:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  /** Network first, then the last copy (offline). */
  async function cached(key, load) {
    try { const v = await load(); store.set(key, v); return v; }
    catch (e) { const v = store.get(key); if (v != null) return v; throw e; }
  }
  const mosqueRow = (id) => cached("row:" + id, async () => {
    const env = await rpc("tsalat_mosque", { p_mosque_id: id });
    if (!env || !env.row) throw new Error("unknown mosque");
    return env.row;
  });
  const tableText = (code) => cached("times:" + code, async () => {
    const r = await fetch(`${ROOT}mosque/times/${code}.txt`);
    if (!r.ok) throw new Error("times " + r.status);
    return r.text();
  });
  const hijriLatest = (country) => cached("hijri:" + country, async () => (await rpc("tsalat_hijri_latest", { p_country: country }))[0] || null)
    .catch(() => null);
  async function directory() {
    return cached("directory", async () => {
      const all = [];
      for (;;) {
        const page = await rpc("tsalat_directory", {}, `?order=mosque_id&limit=1000&offset=${all.length}`);
        all.push(...page);
        if (page.length < 1000) break;
      }
      return all.map(m => ({ id: m.mosque_id, name: m.mosque_name || "", city: m.city || "", cityAr: m.city_ar || "", country: m.country || "", code: (m.location_code || "").replace(/_+$/, "") }));
    });
  }
  let cities = null;
  async function cityAr(code) {
    if (!cities) cities = await fetch(`${ROOT}w/cities.json`).then(r => r.json()).catch(() => ({}));
    return cities[code] || "";
  }

  // ── Mosque row → config (MosqueConfigParser subset: what the times depend on) ──
  function obj(v) {
    if (v && typeof v === "object") return v;
    if (typeof v === "string") { try { const o = JSON.parse(v); return o && typeof o === "object" ? o : null; } catch (e) { return null; } }
    return null;
  }
  const int = (v) => { if (v == null || v === "") return null; const n = parseInt(String(v).trim(), 10); return isNaN(n) ? null : n; };
  /** "HH:MM" (sometimes with a BOM) → minutes of the day; "", "AUTO" → null. */
  const time = (v) => { const m = /(\d{1,2}):(\d{2})/.exec(v == null ? "" : String(v)); return m ? +m[1] * 60 + +m[2] : null; };

  function config(row) {
    const data = obj(obj(row.backup_json)?.data);
    const legacy = obj(data?.JS_DATA);
    const lInt = (k) => int(legacy?.[k]);
    const per = (o, f) => { const out = {}; if (o) P.forEach(p => { const v = f(o[p]); if (v != null) out[p] = v; }); return out; };
    const jumua = obj(row.jumua);
    const heldRaw = int(jumua?.show_on_hr_screen);
    const held = heldRaw != null ? heldRaw === 1 : (lInt("ucJomoaOnHRscreen") ?? 1) === 1;
    const flags = obj(row.time_flags) || {};
    const dur = { fajr: 9, dhuhr: 8, asr: 8, maghrib: 7, isha: 9 };
    Object.keys(LEGACY).forEach(p => { const v = lInt("ucPrayDuration" + LEGACY[p]); if (v != null) dur[p] = v; });
    const code = (row.location_code || legacy?.ucNowCityCODE || "tn.monastir").replace(/_+$/, "");
    return {
      id: row.mosque_id || "", name: row.mosque_name || legacy?.ucMosqueName || "",
      code, cityAr: (row.city_ar || "").trim(), city: row.city || "", country: row.country || "TN",
      image: row.image_url || "", address: obj(row.profile)?.address || "",
      offset: per(obj(row.azan_offsets), int),
      azanFixed: per(obj(row.azan_fixed), time),
      delay: Object.assign({ fajr: 10, shrouq: 20, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 }, per(obj(row.iqama_delay), int)),
      iqamaFixed: per(obj(row.iqama_fixed), time),
      iqamaLatest: per(obj(row.iqama_latest), time),
      duration: dur,
      jumua: { held, time: held ? time(jumua?.time) : null, time2: held ? time(jumua?.time2) : null, after: lInt("ucJomoaDimmAfter") ?? 30 },
      summer: int(flags.summer_time) === 1, plus1: int(flags.force_1h_more) === 1, minus1: int(flags.force_1h_less) === 1,
      ramadanIsha30: int(flags.ramadan_isha_30min) === 1,
      dhuhrBeforeAsr: int(row.dohr_before_asr_min) ?? lInt("ucDohrXminutesAsr") ?? 0,
      hijriFix: lInt("ucHijriDateFixer") ?? 0,
    };
  }

  // ── Times table ("MM-DD~~~~~05:54|07:27|12:27|14:55|17:17|18:46", standard time) ──
  function parseTable(text) {
    const rows = {};
    for (const raw of text.split("\n")) {
      const m = /^(\d{2})-(\d{2})~+(\d{1,2}:\d{2}(?:\|\d{1,2}:\d{2}){5})$/.exec(raw.trim());
      if (m) rows[m[1] + "-" + m[2]] = m[3].split("|").map(time);
    }
    return rows;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const mdKey = (d) => pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  function lastSunday(y, month0) { const d = new Date(y, month0 + 1, 0); d.setDate(d.getDate() - d.getDay()); return d; }
  function euSummer(date) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return day >= lastSunday(date.getFullYear(), 2) && day < lastSunday(date.getFullYear(), 9);
  }

  /** ScheduleCalculator.day: [{key, ar, fr, azan, iqama, end, jumua}] as Dates (local wall clock). */
  function day(rows, cfg, date, hijri) {
    const raw = rows[mdKey(date)] || (mdKey(date) === "02-29" ? rows["03-01"] : null);
    if (!raw) return null;
    const m = raw.map((v, i) => v + (cfg.offset[P[i]] || 0));
    let shift = 0;
    if (cfg.summer && euSummer(date)) shift += 60;
    if (cfg.plus1) shift += 60;
    if (cfg.minus1) shift -= 60;
    for (let i = 0; i < 6; i++) m[i] += shift;
    if (cfg.ramadanIsha30 && hijri && hijri.month === 9) m[5] += 30;
    if (cfg.dhuhrBeforeAsr > 0) m[2] = m[3] - cfg.dhuhrBeforeAsr;
    P.forEach((p, i) => { if (cfg.azanFixed[p] != null) m[i] = cfg.azanFixed[p]; });
    const friday = date.getDay() === 5;
    if (friday && cfg.jumua.time != null) m[2] = cfg.jumua.time;
    const at = (min) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, min);
    return P.map((p, i) => {
      const azan = at(m[i]);
      const base = { key: p, i, ar: NAMES_AR[i], fr: NAMES_FR[i], azan, jumua: false };
      if (friday && p === "dhuhr" && cfg.jumua.held) {
        return Object.assign(base, { ar: "الجمعة", fr: "Joumou'a", jumua: true, iqama: azan,
          end: new Date(azan.getTime() + Math.max(1, cfg.jumua.after) * 60000), time2: cfg.jumua.time2 });
      }
      const iqama = iqamaFor(cfg, p, azan);
      const d = p === "shrouq" ? 0 : (cfg.duration[p] ?? 8);
      return Object.assign(base, { iqama, end: new Date(iqama.getTime() + d * 60000) });
    });
  }
  function iqamaFor(cfg, p, azan) {
    const azanMin = azan.getHours() * 60 + azan.getMinutes();
    let iqama;
    if (cfg.iqamaFixed[p] != null) {
      const delay = cfg.iqamaFixed[p] - azanMin;
      iqama = new Date(azan.getTime() + (delay < 1 ? 10 : delay) * 60000);
    } else iqama = new Date(azan.getTime() + (cfg.delay[p] ?? 10) * 60000);
    if (cfg.iqamaLatest[p] == null) return iqama;
    const latest = new Date(azan.getFullYear(), azan.getMonth(), azan.getDate(), 0, cfg.iqamaLatest[p]);
    return latest > azan && iqama > latest ? latest : iqama;
  }

  // ── Hijri (HijriCalendar: announced month start, else the tabular calendar ± the mosque's fix) ──
  function hijri(date, official, fix) {
    if (official) {
      const s = official.gregorian_start_date.split("-").map(Number);
      const off = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(s[0], s[1] - 1, s[2])) / 86400000);
      if (off >= 0 && off <= 29) return { year: official.hijri_year, month: official.hijri_month, day: off + 1 };
    }
    return tabular(date, fix || 0);
  }
  function tabular(date, fix) {
    const q = (a, b) => Math.trunc(a / b);
    const d0 = date.getDate(), m0 = date.getMonth() + 1, y0 = date.getFullYear();
    const jd = q(1461 * (y0 + 4800 + q(m0 - 14, 12)), 4) + q(367 * (m0 - 2 - 12 * q(m0 - 14, 12)), 12)
      - q(3 * q(y0 + 4900 + q(m0 - 14, 12), 100), 4) + d0 - 32075;
    let l = jd - 1948440 + 10632;
    const n = q(l - 1, 10631);
    l = l - 10631 * n + 354;
    const j = q(10985 - l, 5316) * q(50 * l, 17719) + q(l, 5670) * q(43 * l, 15238);
    l = l - q(30 - j, 15) * q(17719 * j, 50) - q(j, 16) * q(15238 * j, 43) + 29;
    let m = q(24 * l, 709), d = l - q(709 * m, 24);
    const y = 30 * n + j - 30;
    d += fix;
    if (d < 1) { d = 30; m--; }
    if (d > 30) { d = 1; m++; }
    if (m < 1) m = 12;
    if (m > 12) m = 1;
    return { year: y, month: m, day: d };
  }

  /** Everything a page needs about one mosque: config, times table, official Hijri start. */
  async function load(id) {
    const row = await mosqueRow(id);
    const cfg = config(row);
    if (!cfg.cityAr) cfg.cityAr = await cityAr(cfg.code);
    const [text, official] = await Promise.all([tableText(cfg.code), hijriLatest(cfg.country)]);
    const rows = parseTable(text);
    return {
      cfg, official,
      hijriOf: (date) => hijri(date, official, cfg.hijriFix),
      dayOf(date) { return day(rows, cfg, date, hijri(date, official, cfg.hijriFix)); },
    };
  }

  const hm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
  const hmMin = (min) => pad(Math.floor(min / 60) % 24) + ":" + pad(min % 60);
  /** Numbers inside Arabic text: an LTR isolate, else "+10" shows "10+". */
  const ltr = (x) => "⁦" + x + "⁩";
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const validId = (id) => /^[a-z]{2}\.[a-z0-9][a-z0-9._-]{1,150}$/.test(id || "") ? id : null;
  const androidUrl = (id) => SITE + "m/?id=" + encodeURIComponent(id);
  const iphoneUrl = (id) => SITE + "w/?id=" + encodeURIComponent(id);

  /** The mosque-clock logo (same drawing as the boot video), gold strokes. */
  function logo(size, color = "#E2BF74") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M28,86 V52 C28,34 40,24 50,12 C60,24 72,34 72,52 V86"/><line x1="20" y1="86" x2="80" y2="86"/>
      <circle cx="50" cy="58" r="13" stroke-width="4"/><line x1="50" y1="58" x2="50" y2="49" stroke-width="4"/><line x1="50" y1="58" x2="56.5" y2="62" stroke-width="4"/></g></svg>`;
  }

  /** QR code as an SVG (crisp at any print size); [hole] = fraction of the side left blank in the middle for a logo. */
  function qrSvg(text, { level = "M", hole = 0, dark = "#111" } = {}) {
    const q = qrcode(0, level); q.addData(text); q.make();
    const n = q.getModuleCount(), M = 4, size = n + 2 * M;
    const h0 = hole ? Math.floor((n - Math.ceil(n * hole)) / 2) : -1, h1 = hole ? n - 1 - h0 : -2;
    let path = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c) || (r >= h0 && r <= h1 && c >= h0 && c <= h1)) continue;
      path += `M${c + M},${r + M}h1v1h-1z`;
    }
    return { n, size, h0: h0 + M, hw: h1 - h0 + 1,
      svg: `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="${dark}"/></svg>` };
  }

  return { SITE, ROOT, P, NAMES_AR, NAMES_FR, HIJRI_AR, HIJRI_FR, DAYS_AR, rpc, store, load, directory, cityAr, config,
    hm, hmMin, ltr, esc, isIOS, isAndroid, validId, androidUrl, iphoneUrl, logo, qrSvg, pad };
})();
