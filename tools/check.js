// Self-check for the non-trivial bit: UTC-midnight session wrapping.
// Run: gjs -m tools/check.js
import GLib from 'gi://GLib';
import { sessionSegments, marketState, nextBell } from '../lib/marketclock.js';

function assert(cond, msg) {
    if (!cond) {
        printerr(`FAIL: ${msg}`);
        imports.system.exit(1);
    }
}

const now = GLib.DateTime.new_now_utc();
const base = { id: 'X', name: 'X', exchange: 'X', weekend: [], holidays: [] };

// Etc/GMT-12 is a fixed UTC+12 (no DST): 10:00 local = 22:00 UTC, 16:00 = 04:00
// UTC, so the session straddles UTC midnight -> two segments.
const wrap = sessionSegments({ ...base, tz: 'Etc/GMT-12', open: [10, 0], close: [16, 0] }, now);
assert(wrap.segments.length === 2, `wrap expected 2 segments, got ${wrap.segments.length}`);
assert(wrap.segments[0].end === 1 && wrap.segments[1].start === 0, 'wrap segments must meet at the axis edges');
const width = (wrap.segments[0].end - wrap.segments[0].start) + (wrap.segments[1].end - wrap.segments[1].start);
assert(Math.abs(width - 0.25) < 1e-9, `wrap total width expected 0.25 (6h), got ${width}`);

// A same-UTC-day session stays a single segment.
const flat = sessionSegments({ ...base, tz: 'Etc/UTC', open: [9, 0], close: [17, 0] }, now);
assert(flat.segments.length === 1, `flat expected 1 segment, got ${flat.segments.length}`);
assert(Math.abs((flat.segments[0].end - flat.segments[0].start) - (8 / 24)) < 1e-9, 'flat width expected 8h');

const nyTz = GLib.TimeZone.new_identifier('America/New_York');

// Early-close override: a half-day trading date must close at the overridden
// time, not market.close. 2026-11-27 (Fri after Thanksgiving) closes 13:00 ET.
const usMkt = {
    id: 'US', name: 'US', exchange: 'US', tz: 'America/New_York',
    open: [9, 30], close: [16, 0], weekend: [6, 7], holidays: [],
    earlyCloses: { '2026-11-27': [13, 0] },
};
const noon = GLib.DateTime.new(nyTz, 2026, 11, 27, 12, 0, 0);   // mid-session that day
const early = marketState(usMkt, noon);
assert(early && early.isOpen, 'early-close day should be a trading day, open at noon');
assert(early.closeDt.get_hour() === 13, `early close expected 13:00 ET, got ${early.closeDt.get_hour()}`);

// Same market on a normal day keeps the regular 16:00 close.
const normal = marketState({ ...usMkt, earlyCloses: {} }, noon);
assert(normal.closeDt.get_hour() === 16, `normal close expected 16:00 ET, got ${normal.closeDt.get_hour()}`);

// nextBell: drives the click-to-test notification. NYSE 09:30–16:00 ET on a
// normal Monday (2026-06-29). Deterministic via synthetic `now`.
const ny = { id: 'NEW_YORK', name: 'New York', exchange: 'NYSE', tz: 'America/New_York', open: [9, 30], close: [16, 0], weekend: [6, 7], holidays: [] };

const bOpen = nextBell(ny, GLib.DateTime.new(nyTz, 2026, 6, 29, 14, 0, 0));   // mid-session
assert(bOpen && bOpen.isOpen, 'NYSE should be open at 14:00 ET Monday');
assert(bOpen.localHHMM === '16:00', `open: expected close 16:00, got ${bOpen.localHHMM}`);
assert(bOpen.seconds === 7200, `open: expected 7200s to close, got ${bOpen.seconds}`);

const bClosed = nextBell(ny, GLib.DateTime.new(nyTz, 2026, 6, 29, 7, 0, 0));  // pre-market
assert(bClosed && !bClosed.isOpen, 'NYSE should be closed at 07:00 ET');
assert(bClosed.localHHMM === '09:30', `closed: expected open 09:30, got ${bClosed.localHHMM}`);
assert(bClosed.seconds === 9000, `closed: expected 9000s to open, got ${bClosed.seconds}`);

print('marketclock check: OK');
