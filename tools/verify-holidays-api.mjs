#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-or-later
//
// Dev tool (NOT shipped in the extension): cross-check the hand-coded US holiday
// calendar in lib/holidays.js against Massive's live market-holidays feed.
// Complements tools/check-holidays.mjs (which only checks year *coverage*, no API).
//
// Massive free "Stocks Basic" covers US exchanges only and is forward-looking
// (upcoming holidays only), so this validates exactly ONE market — NEW_YORK
// (NYSE/NASDAQ) — and only dates from today onward. The other 18 markets in
// holidays.js have no API to validate against; they stay hand-maintained.
//
// Usage:
//   node tools/verify-holidays-api.mjs            # print: human-readable diff (default)
//   node tools/verify-holidays-api.mjs --check    # exit 1 if full-day holidays drift (CI)
//   node tools/verify-holidays-api.mjs --selftest # offline asserts on the diff logic
//
// Key: reads MASSIVE_API_KEY from the environment, or from a .env file at repo root.
// Override the API host with MASSIVE_BASE_URL (default https://api.massive.com).
//
// Early-closes (half-days) are reported but never fail --check: holidays.js is
// full-day-only by design, so they're a known modelling gap, not calendar drift.

import { readFileSync } from 'node:fs';

// Massive exchange name -> holidays.js market id. NYSE/NASDAQ share the US calendar.
const MARKET_MAP = { NYSE: 'NEW_YORK', NASDAQ: 'NEW_YORK' };

// --- pure helpers (covered by --selftest) -------------------------------------

// Pull the ISO date strings for one market out of the lib/holidays.js source text.
// Format is rigid: `MARKET: [ '2026-01-01', ... ],`. Throws on empty match so a
// format change can't silently pass as "no holidays".
function extractMarketDates(src, market) {
    const block = src.match(new RegExp(`${market}:\\s*\\[([\\s\\S]*?)\\]`));
    if (!block) throw new Error(`market ${market} not found in holidays.js`);
    const dates = block[1].match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (dates.length === 0) throw new Error(`no dates parsed for ${market}`);
    return dates;
}

// Compare the extension's dates against the API entries for one market.
// `today` is ISO "YYYY-MM-DD"; ISO dates compare correctly as strings.
// Returns { missing, extra, early }: missing/extra are real full-day drift,
// early is informational (half-days the extension doesn't model).
function diff(extDates, apiEntries, today) {
    const ext = new Set(extDates);
    // Only validate years the calendar actually covers — the API window reaches
    // into next year, but "next year not added yet" is the freshness tool's job
    // (tools/check-holidays.mjs), not drift.
    const coveredYears = new Set(extDates.map(d => d.slice(0, 4)));
    const inScope = e => e.date >= today && coveredYears.has(e.date.slice(0, 4));
    const closed = apiEntries.filter(e => e.status === 'closed' && inScope(e));
    const early = apiEntries.filter(e => e.status === 'early-close' && inScope(e));
    const apiClosed = new Set(closed.map(e => e.date));
    const maxApi = closed.reduce((m, e) => (e.date > m ? e.date : m), today);

    // API says closed, extension doesn't list it.
    const missing = closed.filter(e => !ext.has(e.date));
    // Extension lists a closure inside the API's window that the API doesn't have.
    const extra = extDates
        .filter(d => d >= today && d <= maxApi && !apiClosed.has(d))
        .map(date => ({ date }));

    return { missing, extra, early };
}

// --- io -----------------------------------------------------------------------

function loadKey() {
    if (process.env.MASSIVE_API_KEY) return process.env.MASSIVE_API_KEY.trim();
    try {
        const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
        const m = env.match(/^MASSIVE_API_KEY=(.*)$/m);
        if (m && m[1].trim()) return m[1].trim();
    } catch { /* no .env, fall through */ }
    throw new Error('MASSIVE_API_KEY not set (env or .env)');
}

async function fetchUpcoming(key) {
    const base = process.env.MASSIVE_BASE_URL || 'https://api.massive.com';
    // Send both auth styles; the API ignores whichever it doesn't use.
    const url = `${base}/v1/marketstatus/upcoming?apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${base}`);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : body.results;
    if (!Array.isArray(arr)) throw new Error('unexpected response shape (no array)');
    return arr;
}

function loadExtDates(market) {
    const src = readFileSync(new URL('../lib/holidays.js', import.meta.url), 'utf8');
    return extractMarketDates(src, market);
}

// --- selftest -----------------------------------------------------------------

function selftest() {
    const assert = (cond, ...m) => { if (!cond) { console.error('FAIL:', ...m); process.exit(1); } };
    const sampleSrc = `
        NEW_YORK: [
            '2026-07-03', '2026-09-07', '2026-12-25',
        ],
        UTC: [],
    `;
    const got = extractMarketDates(sampleSrc, 'NEW_YORK');
    assert(got.length === 3 && got[0] === '2026-07-03', 'extract failed', got);

    const today = '2026-06-28';
    const api = [
        { date: '2026-07-03', status: 'closed', exchange: 'NYSE', name: 'Independence Day' },
        { date: '2026-11-26', status: 'closed', exchange: 'NYSE', name: 'Thanksgiving' }, // missing from ext
        { date: '2026-11-27', status: 'early-close', exchange: 'NYSE', name: 'Day after', close: '2026-11-27T18:00:00Z' },
        { date: '2026-09-07', status: 'closed', exchange: 'NYSE', name: 'Labor Day' },
    ];
    const r1 = diff(['2026-07-03', '2026-09-07', '2026-12-25'], api, today);
    assert(r1.missing.length === 1 && r1.missing[0].date === '2026-11-26', 'missing wrong', r1.missing);
    assert(r1.early.length === 1, 'early wrong', r1.early);
    // 2026-12-25 is past the API window (max API date 2026-11-27), so NOT flagged extra.
    assert(r1.extra.length === 0, '12-25 past window, not extra', r1.extra);

    // An ext date inside the window but absent from API -> extra.
    const r2 = diff(['2026-07-03', '2026-08-01'], api, today);
    assert(r2.extra.length === 1 && r2.extra[0].date === '2026-08-01', 'extra wrong', r2.extra);

    // Past dates are ignored entirely.
    const r3 = diff(['2026-01-01'], api, today);
    assert(r3.extra.length === 0 && r3.missing.length === 3, 'past-date handling', r3);

    // Next-year API holidays are out of scope when the calendar only covers 2026
    // (that's the freshness tool's job, not drift).
    const r4 = diff(['2026-07-03'], [{ date: '2027-01-01', status: 'closed', name: 'NY' }], today);
    assert(r4.missing.length === 0, '2027 should be out of scope', r4.missing);

    console.log('selftest OK');
}

// --- main ---------------------------------------------------------------------

const mode = process.argv[2] || '--print';

if (mode === '--selftest') {
    selftest();
} else {
    const today = new Date().toISOString().slice(0, 10);
    const key = loadKey();
    const entries = await fetchUpcoming(key);

    // Group API entries by mapped market id, deduping the NYSE/NASDAQ overlap
    // (both map to NEW_YORK and report the same calendar) by date+status.
    const byMarket = {};
    const seen = new Set();
    for (const e of entries) {
        const id = MARKET_MAP[e.exchange];
        if (!id) continue;
        const k = `${id}|${e.date}|${e.status}`;
        if (seen.has(k)) continue;
        seen.add(k);
        (byMarket[id] ||= []).push(e);
    }

    let drift = 0;
    for (const [market, apiEntries] of Object.entries(byMarket)) {
        const ext = loadExtDates(market);
        const { missing, extra, early } = diff(ext, apiEntries, today);

        console.log(`\n${market}  (today ${today}, ${apiEntries.length} upcoming API records)`);
        if (!missing.length && !extra.length && !early.length)
            console.log('  ✓ full-day calendar matches the API window');
        for (const e of missing)
            console.log(`  ✗ MISSING full-day holiday: ${e.date} ${e.name}  (add to holidays.js)`);
        for (const e of extra)
            console.log(`  ✗ EXTRA closure not in API: ${e.date}  (verify / possibly wrong)`);
        for (const e of early)
            console.log(`  ⚠ early-close (unmodeled): ${e.date} ${e.name}` +
                (e.close ? `  closes ${e.close}` : ''));

        drift += missing.length + extra.length;
    }

    if (Object.keys(byMarket).length === 0)
        console.log('No API entries mapped to a tracked market (check exchange names).');

    if (mode === '--check' && drift > 0) {
        console.error(`\n${drift} full-day discrepancy(ies) — failing.`);
        process.exit(1);
    }
}
