// SPDX-License-Identifier: GPL-2.0-or-later
// Per-market full-day closure calendars for 2026, as explicit ISO "YYYY-MM-DD"
// dates in each exchange's local timezone.
//
// Why full dates (not "DD.MM")? The year is part of every entry, so the engine
// (lib/marketclock.js) only ever matches dates in the current year and silently
// ignores everything else. A stale calendar therefore can't mismatch by a year
// — but it must still be refreshed annually (see README "Updating holidays"),
// or markets fall back to weekend-only logic once 2026 has passed.
//
// Sourcing: official exchange / government 2026 calendars (NYSE/ICE, TMX, B3,
// LSE/gov.uk, SIX, Deutsche Börse, JSE, MOEX, NZX, ASX, JPX, SGX/MOM, HKEX/GovHK,
// China State Council, NSE circular 172/2025, DFM circular 12/2025, Saudi Exchange).
// Weekend-falling holidays are omitted (the weekend rule already covers them).
//
// CAVEAT — Islamic-calendar holidays (Dubai, Riyadh, and the Eid/Muharram
// entries for Singapore and Mumbai) depend on moon sighting and may shift by
// ±1 day; re-verify close to the date. Keys match the market ids in markets.js.

export const HOLIDAYS = {
    WELLINGTON: [
        '2026-01-01', '2026-01-02', '2026-02-06', '2026-04-03', '2026-04-06',
        '2026-04-27', '2026-06-01', '2026-07-10', '2026-10-26', '2026-12-25',
        '2026-12-28',
    ],

    SYDNEY: [
        '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06', '2026-06-08',
        '2026-12-25', '2026-12-28',
    ],

    TOKYO: [
        '2026-01-01', '2026-01-02', '2026-01-12', '2026-02-11', '2026-02-23',
        '2026-03-20', '2026-04-29', '2026-05-04', '2026-05-05', '2026-05-06',
        '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
        '2026-10-12', '2026-11-03', '2026-11-23', '2026-12-31',
    ],

    SINGAPORE: [
        '2026-01-01', '2026-02-17', '2026-02-18', '2026-04-03', '2026-05-01',
        '2026-05-27', '2026-06-01', '2026-08-10', '2026-11-09', '2026-12-25',
    ],

    HONG_KONG: [
        '2026-01-01', '2026-02-17', '2026-02-18', '2026-02-19', '2026-04-03',
        '2026-04-06', '2026-05-01', '2026-05-25', '2026-06-19', '2026-07-01',
        '2026-10-01', '2026-10-19', '2026-12-25', '2026-12-28',
    ],

    SHANGHAI: [
        '2026-01-01', '2026-01-02', '2026-02-16', '2026-02-17', '2026-02-18',
        '2026-02-19', '2026-02-20', '2026-02-23', '2026-04-06', '2026-05-01',
        '2026-05-04', '2026-05-05', '2026-06-19', '2026-09-25', '2026-10-01',
        '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
    ],

    INDIA: [
        '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31', '2026-04-03',
        '2026-04-14', '2026-05-01', '2026-05-28', '2026-06-26', '2026-09-14',
        '2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24', '2026-12-25',
    ],

    DUBAI: [
        '2026-01-01', '2026-03-19', '2026-05-26', '2026-05-27', '2026-05-28',
        '2026-06-16', '2026-08-25', '2026-12-02', '2026-12-03',
    ],

    MOSCOW: [
        '2026-01-01', '2026-01-02', '2026-01-07', '2026-02-23', '2026-05-01',
        '2026-06-12', '2026-11-04', '2026-12-31',
    ],

    SAUDI: [
        '2026-02-22', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-22',
        '2026-03-23', '2026-05-24', '2026-05-25', '2026-05-26', '2026-05-27',
        '2026-05-28', '2026-09-23',
    ],

    JOHANNESBURG: [
        '2026-01-01', '2026-04-03', '2026-04-06', '2026-04-27', '2026-06-16',
        '2026-08-10', '2026-09-24', '2026-12-16', '2026-12-25',
    ],

    LONDON: [
        '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25',
        '2026-08-31', '2026-12-25', '2026-12-28',
    ],

    SWISS: [
        '2026-01-01', '2026-01-02', '2026-04-03', '2026-04-06', '2026-05-01',
        '2026-05-14', '2026-05-25', '2026-12-24', '2026-12-25', '2026-12-31',
    ],

    FRANKFURT: [
        '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-24',
        '2026-12-25', '2026-12-31',
    ],

    SAO_PAULO: [
        '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
        '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02',
        '2026-11-20', '2026-12-24', '2026-12-25', '2026-12-31',
    ],

    NEW_YORK: [
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
        '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ],

    TORONTO: [
        '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01',
        '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28',
    ],

    CHICAGO: [
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
        '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ],

    UTC: [],
};

// Half-day (early-close) trading days: the market is OPEN but closes early.
// Unlike HOLIDAYS (full-day closures), these are trading days with an overridden
// close time, given as market-LOCAL [hour, minute] — same convention as the
// open/close times in markets.js. A date here must NOT also appear in HOLIDAYS.
//
// US only for now: NYSE/NASDAQ half-days are validated against Massive's feed
// (tools/verify-holidays-api.mjs); CHICAGO (CHX) mirrors the NYSE equity
// calendar, so 13:00 ET == 12:00 CT. Other markets have half-days too but no
// free API covers them — add by hand from the official calendar when needed.
export const EARLY_CLOSES = {
    NEW_YORK: { '2026-11-27': [13, 0], '2026-12-24': [13, 0] },
    CHICAGO:  { '2026-11-27': [12, 0], '2026-12-24': [12, 0] },
};