(function () {
  "use strict";

  const ROOT_ID = "gsc-ds-bar";
  const LAG_KEY = "gsc_lag_days";
  let lag = 3;
  let expanded = false;

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
  function pretty(d) { return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  function prettyRange(a, b) { return `${pretty(a)} – ${pretty(b)}`; }

  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function addYears(d, n) { return new Date(d.getFullYear() + n, d.getMonth(), d.getDate()); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function ranges() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    let curEnd = addDays(today, -lag);
    if (curEnd < monthStart) curEnd = new Date(monthStart);
    const nDays = daysBetween(monthStart, curEnd);

    const lastStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMtdEnd = addDays(prevMonthStart, nDays);

    return {
      curMtd: { start: monthStart, end: curEnd },
      lastMonth: { start: lastStart, end: lastEnd },
      prevMtd: { start: prevMonthStart, end: prevMtdEnd },
      curMtdLY: { start: addYears(monthStart, -1), end: addYears(curEnd, -1) },
      lastMonthLY: {
        start: new Date(lastStart.getFullYear() - 1, lastStart.getMonth(), 1),
        end: new Date(lastStart.getFullYear() - 1, lastStart.getMonth() + 1, 0),
      },
    };
  }

  // Preset definitions keyed by id. sub/tip computed fresh from current ranges.
  const PRESETS = {
    curMtd: {
      section: "range", label: "Current Month",
      spec: (r) => ({ primary: r.curMtd, sub: prettyRange(r.curMtd.start, r.curMtd.end),
        tip: `Current month to date: ${prettyRange(r.curMtd.start, r.curMtd.end)}` }),
    },
    lastMonth: {
      section: "range", label: "Last Month",
      spec: (r) => ({ primary: r.lastMonth, sub: prettyRange(r.lastMonth.start, r.lastMonth.end),
        tip: `Last full month: ${prettyRange(r.lastMonth.start, r.lastMonth.end)}` }),
    },
    mtdVsLastMtd: {
      section: "compare", label: "MTD vs last MTD",
      spec: (r) => ({ primary: r.curMtd, compare: r.prevMtd, sub: `vs ${prettyRange(r.prevMtd.start, r.prevMtd.end)}`,
        tip: `${prettyRange(r.curMtd.start, r.curMtd.end)}  vs  ${prettyRange(r.prevMtd.start, r.prevMtd.end)}` }),
    },
    mtdVsLastYear: {
      section: "compare", label: "MTD vs last year",
      spec: (r) => ({ primary: r.curMtd, compare: r.curMtdLY, sub: `vs ${prettyRange(r.curMtdLY.start, r.curMtdLY.end)}`,
        tip: `${prettyRange(r.curMtd.start, r.curMtd.end)}  vs  ${prettyRange(r.curMtdLY.start, r.curMtdLY.end)}` }),
    },
    lastMonthYoY: {
      section: "compare", label: "Last Month YoY",
      spec: (r) => ({ primary: r.lastMonth, compare: r.lastMonthLY, sub: `vs ${prettyRange(r.lastMonthLY.start, r.lastMonthLY.end)}`,
        tip: `${prettyRange(r.lastMonth.start, r.lastMonth.end)}  vs  ${prettyRange(r.lastMonthLY.start, r.lastMonthLY.end)}` }),
    },
  };

  function onPerformancePage() {
    return /search-console\/performance/.test(location.pathname);
  }

  function apply(primary, compare) {
    const url = new URL(location.href);
    url.searchParams.set("start_date", fmt(primary.start));
    url.searchParams.set("end_date", fmt(primary.end));
    if (compare) {
      url.searchParams.set("compare_start_date", fmt(compare.start));
      url.searchParams.set("compare_end_date", fmt(compare.end));
    } else {
      url.searchParams.delete("compare_start_date");
      url.searchParams.delete("compare_end_date");
    }
    location.href = url.toString();
  }

  const chipRefreshers = []; // {el, key}

  function makeChip(key) {
    const def = PRESETS[key];
    const r = ranges();
    const s = def.spec(r);
    const b = document.createElement("button");
    b.className = "gsc-ds-chip" + (def.section === "compare" ? " gsc-ds-chip--cmp" : "");
    b.title = s.tip;
    b.innerHTML =
      `<span class="gsc-ds-chip-label">${def.label}</span>` +
      `<span class="gsc-ds-chip-sub">${s.sub}</span>`;
    b.addEventListener("click", () => {
      const cur = PRESETS[key].spec(ranges());
      apply(cur.primary, cur.compare);
    });
    chipRefreshers.push({ el: b, key });
    return b;
  }

  function refreshChips() {
    const r = ranges();
    chipRefreshers.forEach(({ el, key }) => {
      const s = PRESETS[key].spec(r);
      el.title = s.tip;
      const sub = el.querySelector(".gsc-ds-chip-sub");
      if (sub) sub.textContent = s.sub;
    });
  }

  function section(title, keys) {
    const wrap = document.createElement("div");
    wrap.className = "gsc-ds-section";
    const h = document.createElement("div");
    h.className = "gsc-ds-section-title";
    h.textContent = title;
    wrap.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "gsc-ds-grid";
    keys.forEach((k) => grid.appendChild(makeChip(k)));
    wrap.appendChild(grid);
    return wrap;
  }

  function buildLauncher() {
    const btn = document.createElement("button");
    btn.id = ROOT_ID;
    btn.className = "gsc-ds-launcher";
    btn.title = "GSC date presets";
    btn.innerHTML = `<span class="gsc-ds-launcher-ico">📅</span><span class="gsc-ds-launcher-txt">Dates</span>`;
    btn.addEventListener("click", () => { expanded = true; render(); });
    return btn;
  }

  function buildCard() {
    chipRefreshers.length = 0;
    const card = document.createElement("div");
    card.id = ROOT_ID;
    card.className = "gsc-ds-card";

    const head = document.createElement("div");
    head.className = "gsc-ds-head";

    const title = document.createElement("div");
    title.className = "gsc-ds-title";
    title.textContent = "GSC Dates";
    head.appendChild(title);

    const lagwrap = document.createElement("label");
    lagwrap.className = "gsc-ds-lagwrap";
    lagwrap.appendChild(document.createTextNode("lag"));
    const lagInput = document.createElement("input");
    lagInput.type = "number";
    lagInput.min = "0";
    lagInput.max = "10";
    lagInput.value = String(lag);
    lagInput.className = "gsc-ds-lag";
    lagInput.title = "Data lag in days (GSC is usually 2–3 days behind)";
    lagInput.addEventListener("input", () => {
      let v = parseInt(lagInput.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 10) v = 10;
      lag = v;
      chrome.storage.sync.set({ [LAG_KEY]: lag });
      refreshChips(); // in-place, keeps input focus
    });
    lagwrap.appendChild(lagInput);
    head.appendChild(lagwrap);

    const close = document.createElement("button");
    close.className = "gsc-ds-close";
    close.textContent = "×";
    close.title = "Collapse";
    close.addEventListener("click", () => { expanded = false; render(); });
    head.appendChild(close);

    card.appendChild(head);
    card.appendChild(section("Range", ["curMtd", "lastMonth"]));
    card.appendChild(section("Compare", ["mtdVsLastMtd", "mtdVsLastYear", "lastMonthYoY"]));
    return card;
  }

  function render() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    if (!onPerformancePage()) return;
    document.body.appendChild(expanded ? buildCard() : buildLauncher());
  }

  function tick() {
    if (!onPerformancePage()) {
      const el = document.getElementById(ROOT_ID);
      if (el) el.remove();
      return;
    }
    if (!document.getElementById(ROOT_ID)) render();
  }

  chrome.storage.sync.get(LAG_KEY, (res) => {
    if (typeof res[LAG_KEY] === "number") lag = res[LAG_KEY];
    render();
    setInterval(tick, 1000); // survive GSC single-page navigation
  });
})();
