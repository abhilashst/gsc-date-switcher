(function () {
  "use strict";

  const LAUNCHER_ID = "gsc-ds-launcher";
  const CARD_ID = "gsc-ds-card";
  const LAG_KEY = "gsc_lag_days";
  const SAVED_KEY = "gsc_saved_filters";

  let lag = 3;
  let savedFilters = []; // [{ id, dim, mode, type, value }]
  let expanded = false;
  let listenersBound = false;
  let alignWarned = false;

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

    // The month before last (for last-vs-previous-month comparison)
    const beforeLastStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const beforeLastEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);

    return {
      curMtd: { start: monthStart, end: curEnd },
      lastMonth: { start: lastStart, end: lastEnd },
      prevMtd: { start: prevMonthStart, end: prevMtdEnd },
      curMtdLY: { start: addYears(monthStart, -1), end: addYears(curEnd, -1) },
      beforeLast: { start: beforeLastStart, end: beforeLastEnd },
      lastMonthLY: {
        start: new Date(lastStart.getFullYear() - 1, lastStart.getMonth(), 1),
        end: new Date(lastStart.getFullYear() - 1, lastStart.getMonth() + 1, 0),
      },
    };
  }

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
    lastVsPrevMonth: {
      section: "compare", label: "Last vs prev month",
      spec: (r) => ({ primary: r.lastMonth, compare: r.beforeLast, sub: `vs ${prettyRange(r.beforeLast.start, r.beforeLast.end)}`,
        tip: `${prettyRange(r.lastMonth.start, r.lastMonth.end)}  vs  ${prettyRange(r.beforeLast.start, r.beforeLast.end)}` }),
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

  // GSC filter URL encoding for the query/page dimension param:
  //   contains              -> value
  //   doesn't contain       -> !value
  //   matches regex         -> ~value
  //   doesn't match regex   -> !~value
  function operatorPrefix(f) {
    return (f.mode === "exclude" ? "!" : "") + (f.type === "regex" ? "~" : "");
  }

  function applyFilter(f) {
    const val = (f.value || "").trim();
    if (!val) return;
    const url = new URL(location.href);
    url.searchParams.set(f.dim, operatorPrefix(f) + val);
    location.href = url.toString();
  }

  function clearFilters() {
    const url = new URL(location.href);
    url.searchParams.delete("query");
    url.searchParams.delete("page");
    location.href = url.toString();
  }

  function filterLabel(f) {
    const d = f.dim === "page" ? "Page" : "Query";
    const m = f.mode === "exclude" ? "excludes" : "includes";
    const t = f.type === "regex" ? " regex" : "";
    return `${d} ${m}${t}`;
  }

  function persistFilters() {
    chrome.storage.sync.set({ [SAVED_KEY]: savedFilters });
  }

  function rebuildCard() {
    const old = document.getElementById(CARD_ID);
    if (!old) return;
    old.remove();
    const card = buildCard();
    document.body.appendChild(card);
    positionCard(card, getLauncher());
  }

  const chipRefreshers = [];

  function makeChip(key) {
    const def = PRESETS[key];
    const s = def.spec(ranges());
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

  function makeSelect(options, value) {
    const sel = document.createElement("select");
    sel.className = "gsc-ds-select";
    options.forEach(([val, label]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      if (val === value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function savedFilterChip(f) {
    const chip = document.createElement("button");
    chip.className = "gsc-ds-chip gsc-ds-chip--cmp gsc-ds-saved";
    const rule = `${filterLabel(f)}: ${f.value}`;
    const head = f.label || filterLabel(f);
    const sub = f.label ? rule : f.value;
    chip.title = f.label ? `${f.label} — ${rule}` : rule;
    chip.innerHTML =
      `<span class="gsc-ds-saved-main">` +
      `<span class="gsc-ds-chip-label">${head}</span>` +
      `<span class="gsc-ds-chip-sub">${sub}</span>` +
      `</span>` +
      `<span class="gsc-ds-saved-del" title="Delete this filter">×</span>`;
    chip.addEventListener("click", (e) => {
      if (e.target.classList.contains("gsc-ds-saved-del")) {
        e.stopPropagation();
        savedFilters = savedFilters.filter((x) => x.id !== f.id);
        persistFilters();
        rebuildCard();
        return;
      }
      applyFilter(f);
    });
    return chip;
  }

  function filterSection() {
    const wrap = document.createElement("div");
    wrap.className = "gsc-ds-section";

    // --- Saved filters -----------------------------------------------------
    if (savedFilters.length) {
      const sh = document.createElement("div");
      sh.className = "gsc-ds-section-title";
      sh.textContent = "Saved filters";
      wrap.appendChild(sh);
      const grid = document.createElement("div");
      grid.className = "gsc-ds-grid";
      savedFilters.forEach((f) => grid.appendChild(savedFilterChip(f)));
      wrap.appendChild(grid);
    }

    // --- Builder -----------------------------------------------------------
    const bh = document.createElement("div");
    bh.className = "gsc-ds-section-title";
    bh.style.marginTop = savedFilters.length ? "10px" : "0";
    bh.textContent = "Create filter";
    wrap.appendChild(bh);

    const selectRow = document.createElement("div");
    selectRow.className = "gsc-ds-select-row";
    const dimSel = makeSelect([["query", "Query"], ["page", "Page"]], "query");
    const modeSel = makeSelect([["include", "Include"], ["exclude", "Exclude"]], "exclude");
    const typeSel = makeSelect([["contains", "Contains"], ["regex", "Regex"]], "contains");
    selectRow.appendChild(dimSel);
    selectRow.appendChild(modeSel);
    selectRow.appendChild(typeSel);
    wrap.appendChild(selectRow);

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "gsc-ds-regex";
    labelInput.placeholder = "label (optional, e.g. No translations)";
    labelInput.spellcheck = false;
    wrap.appendChild(labelInput);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "gsc-ds-regex";
    input.placeholder = "value (e.g. /blog/ or translate|login)";
    input.spellcheck = false;
    wrap.appendChild(input);

    const current = () => ({
      dim: dimSel.value, mode: modeSel.value, type: typeSel.value, value: input.value,
    });

    const row = document.createElement("div");
    row.className = "gsc-ds-filter-row";

    const applyBtn = document.createElement("button");
    applyBtn.className = "gsc-ds-chip gsc-ds-chip--cmp gsc-ds-filter-apply";
    applyBtn.innerHTML = `<span class="gsc-ds-chip-label">Apply</span>`;
    applyBtn.title = "Apply this filter now";
    applyBtn.addEventListener("click", () => applyFilter(current()));
    row.appendChild(applyBtn);

    const saveBtn = document.createElement("button");
    saveBtn.className = "gsc-ds-chip gsc-ds-filter-save";
    saveBtn.innerHTML = `<span class="gsc-ds-chip-label">Save</span>`;
    saveBtn.title = "Save as a reusable button (and apply)";
    saveBtn.addEventListener("click", () => {
      const f = current();
      if (!f.value.trim()) { input.focus(); return; }
      f.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      f.value = f.value.trim();
      const lbl = labelInput.value.trim();
      if (lbl) f.label = lbl;
      savedFilters.push(f);
      persistFilters();
      applyFilter(f);
    });
    row.appendChild(saveBtn);

    const clearBtn = document.createElement("button");
    clearBtn.className = "gsc-ds-chip gsc-ds-filter-clear";
    clearBtn.innerHTML = `<span class="gsc-ds-chip-label">Clear</span>`;
    clearBtn.title = "Remove query & page filters from the URL";
    clearBtn.addEventListener("click", clearFilters);
    row.appendChild(clearBtn);

    wrap.appendChild(row);
    return wrap;
  }

  function buildLauncher() {
    const btn = document.createElement("button");
    btn.id = LAUNCHER_ID;
    btn.className = "gsc-ds-launcher";
    btn.type = "button";
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "DATES");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "GSC date presets & filters";
    // Material "date_range" icon, 24x24, inheriting color via currentColor.
    btn.innerHTML =
      '<svg class="gsc-ds-launcher-ico" width="24" height="24" viewBox="0 0 24 24" ' +
      'fill="currentColor" aria-hidden="true">' +
      '<path d="M9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V1h-2v2H8V1H6v2H5' +
      'c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>' +
      '</svg>' +
      '<span class="gsc-ds-launcher-txt">DATES</span>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded = !expanded;
      syncCard();
    });
    return btn;
  }

  function buildCard() {
    chipRefreshers.length = 0;
    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "gsc-ds-card";
    card.addEventListener("click", (e) => e.stopPropagation());

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
      refreshChips();
    });
    lagwrap.appendChild(lagInput);
    head.appendChild(lagwrap);

    const close = document.createElement("button");
    close.className = "gsc-ds-close";
    close.textContent = "×";
    close.title = "Collapse";
    close.addEventListener("click", () => { expanded = false; syncCard(); });
    head.appendChild(close);

    card.appendChild(head);
    card.appendChild(section("Range", ["curMtd", "lastMonth"]));
    card.appendChild(section("Compare", ["mtdVsLastMtd", "mtdVsLastYear", "lastVsPrevMonth", "lastMonthYoY"]));
    card.appendChild(filterSection());
    return card;
  }

  // ---- placement ----------------------------------------------------------

  let launcherEl = null; // single reused instance

  function getLauncher() {
    if (!launcherEl) launcherEl = buildLauncher();
    return launcherEl;
  }

  // The Export control: prefer aria-label="EXPORT" (class names are obfuscated
  // and change); fall back to a role=button whose visible text is "export".
  function findExportButton() {
    const buttons = document.querySelectorAll('[role="button"]');
    for (const b of buttons) {
      const al = b.getAttribute("aria-label");
      if (al && al.trim().toUpperCase() === "EXPORT") return b;
    }
    for (const b of buttons) {
      const txt = (b.textContent || "").trim().toLowerCase();
      if (txt === "export") return b;
    }
    return null;
  }

  // Insert the launcher immediately before Export, reusing the one instance.
  // If there's no Export button (or we've left Performance), hide it.
  function placeLauncher() {
    const launcher = getLauncher();

    if (!onPerformancePage()) {
      if (launcher.isConnected) launcher.remove();
      if (expanded) { expanded = false; syncCard(); }
      return;
    }

    const exportBtn = findExportButton();
    if (!exportBtn || !exportBtn.parentElement) {
      launcher.style.display = "none";
      if (expanded) { expanded = false; syncCard(); }
      return;
    }

    launcher.style.display = "inline-flex";

    // Make the shared parent a flex row so launcher and EXPORT line up.
    const parent = exportBtn.parentElement;
    parent.classList.add("gsc-ds-row");
    parent.style.display = "flex";
    parent.style.alignItems = "center";
    parent.style.gap = "4px";

    if (exportBtn.previousElementSibling !== launcher) {
      parent.insertBefore(launcher, exportBtn);
    }
    matchExport(launcher, exportBtn);
  }

  // Copy EXPORT's computed text color (so dark theme matches), size the
  // launcher to EXPORT's actual height so they line up, then verify.
  function matchExport(launcher, exportBtn) {
    try {
      const cs = getComputedStyle(exportBtn);
      if (cs && cs.color) launcher.style.color = cs.color;
    } catch (e) { /* ignore */ }

    requestAnimationFrame(() => {
      try {
        const b = exportBtn.getBoundingClientRect();
        // GSC's EXPORT button isn't always 36px; match its height so the
        // flex row centers both to the same top edge.
        if (b.height) launcher.style.height = Math.round(b.height) + "px";
        const a = launcher.getBoundingClientRect();
        if (!alignWarned && Math.abs(a.top - b.top) > 2) {
          alignWarned = true;
          console.warn(
            "[GSC Date Switcher] launcher not aligned with EXPORT " +
            `(launcher top ${Math.round(a.top)}px h ${Math.round(a.height)}px, ` +
            `export top ${Math.round(b.top)}px h ${Math.round(b.height)}px)`
          );
        }
      } catch (e) { /* ignore */ }
    });
  }

  function positionCard(card, launcher) {
    const rect = launcher.getBoundingClientRect();
    const width = 240;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    card.style.top = `${Math.round(rect.bottom + 6)}px`;
    card.style.left = `${Math.round(left)}px`;
  }

  // Show/hide + position the date panel relative to the launcher.
  function syncCard() {
    let card = document.getElementById(CARD_ID);
    const launcher = getLauncher();
    if (expanded && launcher.isConnected && launcher.style.display !== "none") {
      if (!card) {
        card = buildCard();
        document.body.appendChild(card);
      }
      positionCard(card, launcher);
    } else if (card) {
      card.remove();
    }
    launcher.setAttribute("aria-expanded", String(expanded && !!document.getElementById(CARD_ID)));
  }

  function bindGlobalListeners() {
    if (listenersBound) return;
    listenersBound = true;

    const reposition = () => {
      const c = document.getElementById(CARD_ID);
      if (c) positionCard(c, getLauncher());
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("click", () => {
      if (expanded) { expanded = false; syncCard(); }
    });

    // GSC re-renders its header on property/report/date changes, which can
    // drop our launcher. Re-place it (debounced) whenever the DOM settles.
    let t = null;
    const observer = new MutationObserver(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { placeLauncher(); }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.sync.get([LAG_KEY, SAVED_KEY], (res) => {
    if (typeof res[LAG_KEY] === "number") lag = res[LAG_KEY];
    if (Array.isArray(res[SAVED_KEY])) savedFilters = res[SAVED_KEY];
    placeLauncher();
    bindGlobalListeners();
  });
})();
