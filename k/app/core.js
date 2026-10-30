// ختمة جماعية — web app core: the same rules as core/ (Kotlin, tested). Keep both identical.
"use strict";
const PAGES = 604;

// First page of each surah (Madina pages, measured on the Tunisian mushaf images).
const SURAH_START = [1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312,
  322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467,
  477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549,
  551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585,
  586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599,
  600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604];
const SURAH_AR = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف",
  "الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء",
  "النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى",
  "الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة",
  "الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة",
  "المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار",
  "المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق",
  "القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون",
  "النصر","المسد","الإخلاص","الفلق","الناس"];
const SURAH_FR = ["Al-Fatiha","Al-Baqara","Al-Imran","An-Nisa","Al-Maida","Al-An'am","Al-A'raf","Al-Anfal","At-Tawba","Yunus","Hud",
  "Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha","Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur",
  "Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-Ankabut","Ar-Rum","Luqman","As-Sajda","Al-Ahzab","Saba","Fatir","Ya-Sin",
  "As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiya","Al-Ahqaf","Muhammad","Al-Fath",
  "Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'a","Al-Hadid","Al-Mujadila","Al-Hashr",
  "Al-Mumtahana","As-Saff","Al-Jumu'a","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqa",
  "Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyama","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","Abasa",
  "At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiya","Al-Fajr","Al-Balad",
  "Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-Alaq","Al-Qadr","Al-Bayyina","Az-Zalzala","Al-Adiyat","Al-Qari'a",
  "At-Takathur","Al-Asr","Al-Humaza","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas",
  "Al-Falaq","An-Nas"];
// First page of each hizb, measured on the images (core Mushaf.HIZB_START); a juz' = its odd hizb.
const HIZB_START = [1, 11, 22, 32, 42, 51, 62, 72, 82, 92, 102, 112, 121, 132, 142, 151, 162, 173, 182, 192, 201, 212, 221, 231, 242, 252, 262, 272, 282, 292, 302, 312, 322, 332, 342, 352, 362, 371, 382, 392, 402, 413, 422, 431, 442, 451, 462, 472, 482, 491, 502, 513, 522, 531, 542, 553, 562, 572, 582, 591];
const JUZ_START = HIZB_START.filter((_, i) => i % 2 === 0);
// Pages whose first line is a surah header (elsewhere a surah starting on the page starts mid-page).
const OPENS_WITH_SURAH = new Set([1, 2, 50, 77, 128, 151, 177, 187, 208, 249, 262, 282, 305, 322, 332, 342, 350, 367, 377, 411,
  415, 418, 428, 446, 453, 477, 483, 496, 499, 507, 511, 518, 526, 542, 549, 553, 556, 558, 560, 562, 572, 574, 582, 585, 586,
  587, 590, 591, 593, 595, 597, 598, 601, 602, 603, 604]);

const Mushaf = {
  surahAt(page) { let s = 1; for (let i = 0; i < SURAH_START.length; i++) { if (SURAH_START[i] <= page) s = i + 1; else break; } return s; },
  surahAtTop(page) {
    const first = SURAH_START.indexOf(page);
    if (first < 0) return this.surahAt(page);
    return OPENS_WITH_SURAH.has(page) ? first + 1 : first;
  },
  // The surahs on a page: the one of the first line, then every surah starting on it.
  surahsOn(page) { const out = []; for (let n = this.surahAtTop(page); n <= this.surahAt(page); n++) out.push(n); return out; },
  hizbAt(page) { let h = 0; HIZB_START.forEach((p, i) => { if (p <= page) h = i + 1; }); return h; },
  // Browsing by unit: "page" | "surah" | "hizb" | "juz" (core Mushaf.next / previous).
  starts(u) { return u === "surah" ? [...new Set(SURAH_START)] : u === "hizb" ? HIZB_START : u === "juz" ? JUZ_START : Array.from({ length: PAGES }, (_, i) => i + 1); },
  next(u, page) { const s = this.starts(u).find((p) => p > page); return s === undefined ? null : s; },
  previous(u, page) { const s = this.starts(u); let i = -1; s.forEach((p, k) => { if (p <= page) i = k; }); return i >= 1 ? s[i - 1] : null; },
  juzAt(page) { let j = 0; JUZ_START.forEach((p, i) => { if (p <= page) j = i + 1; }); return j; },
  name(n, lang) { return (lang === "fr" ? SURAH_FR : SURAH_AR)[n - 1]; },
  range(from, to, lang) {
    const a = this.name(this.surahAtTop(from), lang), b = this.name(this.surahAt(to), lang);
    return a === b ? a : lang === "fr" ? `${a} → ${b}` : `${a} ← ${b}`;
  },
};

// [from, to] split between n readers as equally as possible: the first (total mod n) parts one page more
// (604 / 55 = 54 × 11 + 1 × 10). Same as core Parts.split and the server's khatma_redistribute.
function splitParts(n, from = 1, to = PAGES) {
  const total = to - from + 1, q = Math.floor(total / n), r = total % n;
  let f = from;
  return Array.from({ length: n }, (_, i) => { const t = f + q - 1 + (i < r ? 1 : 0); const out = [f, t]; f = t + 1; return out; });
}
// '0'/'1' string of 604 → [[from, to], …] of its '1' pages («صفحاتي الناقصة»).
function bitRanges(bits) {
  const out = []; let start = 0;
  for (let p = 1; p <= PAGES + 1; p++) {
    const on = p <= PAGES && bits && bits[p - 1] === "1";
    if (on && !start) start = p; else if (!on && start) { out.push([start, p - 1]); start = 0; }
  }
  return out;
}

// coverage = '0'/'1' string of 604 (page 1 first), as the server's bit(604).
function unread(coverage, [f, t]) { let n = 0; for (let p = f; p <= t; p++) if (coverage[p - 1] !== "1") n++; return n; }

// Hungarian algorithm, maximising Σ w[i][p[i]]; returns p (row → column).
function maxAssignment(w) {
  const n = w.length, max = Math.max(...w.map((r) => Math.max(...r))), INF = Number.MAX_SAFE_INTEGER / 4;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = (max - w[i0 - 1][j - 1]) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  const res = new Array(n); for (let j = 1; j <= n; j++) res[p[j] - 1] = j - 1; return res;
}

// readers in seat order [{id, name, coverage}], round = the circle's khatma counter.
// Max of unread pages, ties broken towards the plain rotation (part (i + round) mod n).
function assignParts(readers, round) {
  const n = readers.length, parts = splitParts(n), big = n * n + 1;
  const gain = readers.map((r) => parts.map((pt) => unread(r.coverage, pt)));
  const w = gain.map((row, i) => row.map((g, j) => g * big - (((j - (i + round)) % n) + n) % n));
  const partOf = maxAssignment(w);
  return readers.map((r, i) => ({ userId: r.id, name: r.name, pages: parts[partOf[i]], unread: gain[i][partOf[i]] }));
}
