#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-or-later
//
// Dev tool (NOT shipped in the extension): cross-check the hand-coded US holiday
// calendar in lib/holidays.js against Massive's live market-holidays feed —
// both full-day closures (HOLIDAYS) and half-day early closes (EARLY_CLOSES).
// Complements tools/check-holidays.mjs (which only checks year *coverage*, no API).
//
// Massive free "Stocks Basic" covers US exchanges only and is forward-looking
// (upcoming holidays only), so this validates exactly ONE market — NEW_YORK
// (NYSE/NASDAQ) — and only dates from today onward. The other 18 markets in
// holidays.js have no API to validate against; they stay hand-maintained.
//
// Usage:
//   node tools/verify-holidays-api.mjs            # print: human-readable diff (default)
//   node tools/verify-holidays-api.mjs --check    # exit 1 on any drift (CI)
//   node tools/verify-holidays-api.mjs --selftest # offline asserts on the diff logic
//
// Key: reads MASSIVE_API_KEY from the environment, or from a .env file at repo root.
// Override the API host with MASSIVE_BASE_URL (default https://api.massive.com).
//
// Early closes are validated by date AND local time: the API gives the close as
// a UTC instant, EARLY_CLOSES stores it as a market-local [h, m]; we convert the
// API instant into the market's timezone (Intl) before comparing.

import { readFileSync } from 'node:fs';

// Massive exchange name -> holidays.js market id. NYSE/NASDAQ share the US calendar.
const MARKET_MAP = { NYSE: 'NEW_YORK', NASDAQ: 'NEW_YORK' };

// Market id -> IANA tz, for converting the API's UTC early-close instant to the
// local wall-clock that EARLY_CLOSES stores. Only API-covered markets need one.
const MARKET_TZ = { NEW_YORK: 'America/New_York' };

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

// Pull one market's EARLY_CLOSES map out of holidays.js -> { 'YYYY-MM-DD': 'HH:MM' }
// (local). Returns {} if the market has no early closes (unlike holidays, an empty
// set is legitimate here, so this doesn't throw).
function extractEarlyCloses(src, market) {
    const obj = src.match(/EARLY_CLOSES\s*=\s*\{([\s\S]*?)\n\}/);
    if (!obj) return {};
    const block = obj[1].match(new RegExp(`${market}:\\s*\\{([\\s\\S]*?)\\}`));
    if (!block) return {};
    const out = {};
    for (const m of block[1].matchAll(/'(\d{4}-\d{2}-\d{2})':\s*\[(\d+),\s*(\d+)\]/g))
        out[m[1]] = `${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
    return out;
}

// A UTC ISO instant rendered as "HH:MM" local wall-clock in `tz`.
function apiLocalHM(isoUtc, tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(isoUtc));
    const get = t => parts.find(p => p.type === t).value;
    return `${get('hour')}:${get('minute')}`;
}

// Compare the extension's calendar against the API entries for one market.
// `today` is ISO "YYYY-MM-DD"; ISO dates compare correctly as strings.
//   extDates: full-day holiday ISO dates    extEarly: { date: 'HH:MM' local }
// Returns full-day { missing, extra } and early-close { earlyMatch, earlyMissing,
// earlyWrong, earlyExtra } — every non-match category is real drift.
function diff(extDates, extEarly, apiEntries, today, tz) {
    const ext = new Set(extDates);
    // Only validate years the calendar actually covers — the API window reaches
    // into next year, but "next year not added yet" is the freshness tool's job
    // (tools/check-holidays.mjs), not drift.
    const coveredYears = new Set(extDates.map(d => d.slice(0, 4)));
    const inScope = e => e.date >= today && coveredYears.has(e.date.slice(0, 4));
    const closed = apiEntries.filter(e => e.status === 'closed' && inScope(e));
    const earlyApi = apiEntries.filter(e => e.status === 'early-close' && inScope(e));

    // --- full-day holidays ---
    const apiClosed = new Set(closed.map(e => e.date));
    const maxApi = closed.reduce((m, e) => (e.date > m ? e.date : m), today);
    const missing = closed.filter(e => !ext.has(e.date));               // API closed, ext lacks
    const extra = extDates                                              // ext closure API lacks
        .filter(d => d >= today && d <= maxApi && !apiClosed.has(d))
        .map(date => ({ date }));

    // --- early closes (compare local close time) ---
    const apiEarly = earlyApi.map(e => ({ ...e, localHM: e.close ? apiLocalHM(e.close, tz) : '??:??' }));
    const apiEarlyDates = new Set(apiEarly.map(e => e.date));
    const earlyMatch = [], earlyMissing = [], earlyWrong = [];
    for (const e of apiEarly) {
        const want = extEarly[e.date];
        if (want === undefined) earlyMissing.push(e);                   // API half-day, ext lacks
        else if (want !== e.localHM) earlyWrong.push({ ...e, want });   // modelled, wrong time
        else earlyMatch.push(e);
    }
    const maxEarly = apiEarly.reduce((m, e) => (e.date > m ? e.date : m), today);
    const earlyExtra = Object.keys(extEarly)                           // ext half-day API lacks
        .filter(d => d >= today && d <= maxEarly && coveredYears.has(d.slice(0, 4)) && !apiEarlyDates.has(d))
        .map(date => ({ date, localHM: extEarly[date] }));

    return { missing, extra, earlyMatch, earlyMissing, earlyWrong, earlyExtra };
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

function loadExt(market) {
    const src = readFileSync(new URL('../lib/holidays.js', import.meta.url), 'utf8');
    return { dates: extractMarketDates(src, market), early: extractEarlyCloses(src, market) };
}

// --- selftest -----------------------------------------------------------------

function selftest() {
    const assert = (cond, ...m) => { if (!cond) { console.error('FAIL:', ...m); process.exit(1); } };
    const tz = 'America/New_York';
    const today = '2026-06-28';

    // extractMarketDates
    const got = extractMarketDates(`NEW_YORK: ['2026-07-03', '2026-09-07', '2026-12-25'], UTC: [],`, 'NEW_YORK');
    assert(got.length === 3 && got[0] === '2026-07-03', 'extract dates failed', got);

    // extractEarlyCloses
    const ecSrc = `export const EARLY_CLOSES = {
    NEW_YORK: { '2026-11-27': [13, 0], '2026-12-24': [13, 0] },
    CHICAGO:  { '2026-11-27': [12, 0] },
};`;
    const ec = extractEarlyCloses(ecSrc, 'NEW_YORK');
    assert(ec['2026-11-27'] === '13:00' && ec['2026-12-24'] === '13:00' && Object.keys(ec).length === 2, 'extractEarlyCloses', ec);
    assert(extractEarlyCloses('no early closes here', 'NEW_YORK') && Object.keys(extractEarlyCloses('x', 'NEW_YORK')).length === 0, 'absent EC -> {}');

    // apiLocalHM: 18:00Z is 13:00 ET in November (EST, UTC-5).
    assert(apiLocalHM('2026-11-27T18:00:00Z', tz) === '13:00', 'apiLocalHM', apiLocalHM('2026-11-27T18:00:00Z', tz));

    // --- full-day diff (unchanged behavior) ---
    const api = [
        { date: '2026-07-03', status: 'closed', exchange: 'NYSE', name: 'Independence Day' },
        { date: '2026-11-26', status: 'closed', exchange: 'NYSE', name: 'Thanksgiving' }, // missing from ext
        { date: '2026-11-27', status: 'early-close', exchange: 'NYSE', name: 'Black Friday', close: '2026-11-27T18:00:00Z' },
        { date: '2026-09-07', status: 'closed', exchange: 'NYSE', name: 'Labor Day' },
    ];
    const r1 = diff(['2026-07-03', '2026-09-07', '2026-12-25'], {}, api, today, tz);
    assert(r1.missing.length === 1 && r1.missing[0].date === '2026-11-26', 'missing wrong', r1.missing);
    assert(r1.extra.length === 0, '12-25 past window, not extra', r1.extra);
    assert(r1.earlyMissing.length === 1 && r1.earlyMissing[0].date === '2026-11-27', 'early missing (no ext EC)', r1.earlyMissing);

    const r2 = diff(['2026-07-03', '2026-08-01'], {}, api, today, tz);
    assert(r2.extra.length === 1 && r2.extra[0].date === '2026-08-01', 'extra wrong', r2.extra);

    const r3 = diff(['2026-01-01'], {}, api, today, tz);
    assert(r3.extra.length === 0 && r3.missing.length === 3, 'past-date handling', r3);

    const r4 = diff(['2026-07-03'], {}, [{ date: '2027-01-01', status: 'closed', name: 'NY' }], today, tz);
    assert(r4.missing.length === 0, '2027 out of scope', r4.missing);

    // --- early-close validation ---
    const apiEC = [
        { date: '2026-11-27', status: 'early-close', exchange: 'NYSE', name: 'Black Friday', close: '2026-11-27T18:00:00Z' }, // 13:00 ET
        { date: '2026-12-24', status: 'early-close', exchange: 'NYSE', name: 'Christmas Eve', close: '2026-12-24T18:00:00Z' }, // 13:00 ET
    ];
    const anchor = ['2026-07-03'];   // gives covered year 2026, no full-day noise
    const m1 = diff(anchor, { '2026-11-27': '13:00', '2026-12-24': '13:00' }, apiEC, today, tz);
    assert(m1.earlyMatch.length === 2 && !m1.earlyMissing.length && !m1.earlyWrong.length && !m1.earlyExtra.length, 'early all match', m1);

    const m2 = diff(anchor, { '2026-11-27': '13:00' }, apiEC, today, tz);
    assert(m2.earlyMissing.length === 1 && m2.earlyMissing[0].date === '2026-12-24', 'early missing', m2);

    const m3 = diff(anchor, { '2026-11-27': '12:00', '2026-12-24': '13:00' }, apiEC, today, tz);
    assert(m3.earlyWrong.length === 1 && m3.earlyWrong[0].want === '12:00' && m3.earlyWrong[0].localHM === '13:00', 'early wrong time', m3);

    const m4 = diff(anchor, { '2026-11-27': '13:00', '2026-12-24': '13:00', '2026-11-30': '13:00' }, apiEC, today, tz);
    assert(m4.earlyExtra.length === 1 && m4.earlyExtra[0].date === '2026-11-30', 'early extra', m4);

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
        const { dates, early } = loadExt(market);
        const tz = MARKET_TZ[market] ?? 'UTC';
        const r = diff(dates, early, apiEntries, today, tz);

        const clean = !r.missing.length && !r.extra.length &&
            !r.earlyMissing.length && !r.earlyWrong.length && !r.earlyExtra.length;
        console.log(`\n${market}  (today ${today}, ${apiEntries.length} upcoming API records)`);
        if (clean)
            console.log('  ✓ full-day and early-close calendars match the API window');

        for (const e of r.missing)
            console.log(`  ✗ MISSING full-day holiday: ${e.date} ${e.name}  (add to HOLIDAYS)`);
        for (const e of r.extra)
            console.log(`  ✗ EXTRA closure not in API: ${e.date}  (verify / possibly wrong)`);
        for (const e of r.earlyMatch)
            console.log(`  ✓ early-close ${e.date} ${e.name} (${e.localHM} local)`);
        for (const e of r.earlyMissing)
            console.log(`  ✗ MISSING early-close: ${e.date} ${e.name} (closes ${e.localHM} local)  (add to EARLY_CLOSES)`);
        for (const e of r.earlyWrong)
            console.log(`  ✗ WRONG early-close time: ${e.date} ${e.name}  ext ${e.want} vs API ${e.localHM} local`);
        for (const e of r.earlyExtra)
            console.log(`  ✗ EXTRA early-close not in API: ${e.date} (${e.localHM} local)  (verify / possibly wrong)`);

        drift += r.missing.length + r.extra.length +
            r.earlyMissing.length + r.earlyWrong.length + r.earlyExtra.length;
    }

    if (Object.keys(byMarket).length === 0)
        console.log('No API entries mapped to a tracked market (check exchange names).');

    if (mode === '--check' && drift > 0) {
        console.error(`\n${drift} discrepancy(ies) — failing.`);
        process.exit(1);
    }
}
