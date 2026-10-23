# GSC Date Switcher

A lightweight Chrome extension (Manifest V3) that adds **one-click date-range and comparison presets** to the Google Search Console **Performance** report. Stop hand-editing `start_date` / `end_date` in the URL — pick a preset and GSC reloads with the right range.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Why

GSC's built-in date picker takes several clicks for common ranges, and setting up a comparison (month-over-month, year-over-year) is fiddly. This extension injects a small launcher onto the Performance page that expands into a set of presets computed from *today's* date.

## Features

- **Anchored to the toolbar** — a small `📅 Dates` pill is injected next to GSC's **Export** button (falls back to a floating top-right pill if the toolbar can't be located). Click to expand, `×` or click-away to collapse.
- **Range presets** (no comparison):
  - **Current Month** — 1st of the month → today − lag
  - **Last Month** — the full previous calendar month
- **Compare presets** (sets GSC's comparison range):
  - **MTD vs last MTD** — current month-to-date vs the same-length window in the previous month
  - **MTD vs last year** — current MTD vs the same dates one year ago
  - **Last vs prev month** — last full month vs the month before it (month-over-month)
  - **Last Month YoY** — last full month vs the same month a year earlier
- **Regex exclude filter** — one click applies a GSC "query doesn't match regex" filter. Default excludes translation/blog noise (`tradutor|vertaler|traduction|traductor|uebersetzer|translate|blog`); the pattern is editable and saved across sessions. A **Clear** button removes the filter.
- **Configurable data lag** — GSC data is usually 2–3 days behind; the lag field (default `3`) is saved across sessions and every range is computed against it.
- **Live labels** — each chip shows the exact dates it will apply, with a full `A vs B` tooltip on hover.
- **SPA-aware** — re-injects itself as you navigate within Search Console and removes itself when you leave the Performance report.
- **Light & dark themes**, no tracking, no network calls.

## How it works

The content script reads the current Performance URL, rewrites the `start_date` / `end_date` (and `compare_start_date` / `compare_end_date` for compare presets) query parameters, then navigates so GSC reloads with the new selection. Dates use GSC's `YYYYMMDD` format.

Example URL it manipulates:

```
https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com&start_date=20260901&end_date=20260922
```

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `gsc-date-switcher` folder (the one containing `manifest.json`).
5. Open a Search Console **Performance** page — the `📅 Dates` pill appears in the top-right.

To update after pulling changes, hit the **reload** ↻ icon on the extension card and refresh your GSC tab.

## Notes on the date math

- **MTD vs last MTD** compares *equal-length* windows (previous month's 1st through the same number of days), which differs from the previous month's same calendar day-of-month only when month lengths differ.
- Leap-year edge cases (Feb 29) in the year-over-year presets fall back to Mar 1.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest; declares the content script and `storage` permission |
| `content.js` | Injects the launcher/card, computes ranges, rewrites the URL |
| `content.css` | Styling for the launcher and expanded card (light + dark) |
| `icons/` | Toolbar icons |

## Permissions

- `storage` — remembers your preferred data-lag value.
- Host access to `https://search.google.com/*` — required to inject the UI on the Performance page. The extension makes no external network requests.

## License

[MIT](LICENSE)
