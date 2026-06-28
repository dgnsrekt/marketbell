// Pure, offline market-state engine. No Shell/St imports here so this module
// can be unit-reasoned about in isolation. All time math goes through GLib's
// timezone-aware DateTime, so DST transitions are handled correctly.

import GLib from 'gi://GLib';

const _tzCache = new Map();

function tzFor(id) {
    let tz = _tzCache.get(id);
    if (!tz) {
        tz = GLib.TimeZone.new_identifier(id) ?? GLib.TimeZone.new_utc();
        _tzCache.set(id, tz);
    }
    return tz;
}

function isHoliday(market, dt) {
    // Holidays are explicit ISO "YYYY-MM-DD" dates (in the market's own tz).
    // Comparing the full date means entries for other years simply never match,
    // so an out-of-date calendar degrades safely instead of mismatching by year.
    return market.holidays.includes(dateKey(dt));
}

function isTradingDay(market, dt) {
    if (market.weekend.includes(dt.get_day_of_week()))
        return false;
    return !isHoliday(market, dt);
}

// Returns the "governing" session for `now`: the next session whose close is
// still in the future, skipping weekends and holidays.
//   -> { isOpen, openDt, closeDt }  (GLib.DateTime instances), or null.
export function marketState(market, now) {
    const tz = tzFor(market.tz);
    const nowTz = now.to_timezone(tz);
    const nowUnix = now.to_unix();

    let viaHoliday = false;   // did we skip a holiday (not just a weekend) to get here?

    for (let offset = 0; offset <= 8; offset++) {
        const day = nowTz.add_days(offset);
        const y = day.get_year();
        const mo = day.get_month();
        const d = day.get_day_of_month();

        const openDt = GLib.DateTime.new(tz, y, mo, d, market.open[0], market.open[1], 0);
        const closeDt = GLib.DateTime.new(tz, y, mo, d, market.close[0], market.close[1], 0);

        if (!isTradingDay(market, openDt)) {
            if (!market.weekend.includes(openDt.get_day_of_week()) && isHoliday(market, openDt))
                viaHoliday = true;
            continue;
        }

        if (nowUnix < closeDt.to_unix()) {
            return {
                isOpen: nowUnix >= openDt.to_unix(),
                openDt,
                closeDt,
                viaHoliday,
            };
        }
    }
    return null;
}

// Fraction (0..1) of the UTC day at which `dt` falls — the x-position on the
// popup's 0..24 axis.
function utcDayFrac(dt) {
    const u = dt.to_utc();
    return (u.get_hour() * 3600 + u.get_minute() * 60 + u.get_second()) / 86400;
}

// The governing session mapped onto the 0..24 UTC axis. Sessions that straddle
// UTC midnight (NZ, parts of the year AU/JP) wrap into two segments.
//   -> { isOpen, segments: [{start,end}], nowFrac }
export function sessionSegments(market, now) {
    const nowFrac = utcDayFrac(now);
    const st = marketState(market, now);
    if (!st)
        return { isOpen: false, segments: [], nowFrac };

    const openF = utcDayFrac(st.openDt);
    const closeF = utcDayFrac(st.closeDt);
    const segments = openF <= closeF
        ? [{ start: openF, end: closeF }]
        : [{ start: openF, end: 1 }, { start: 0, end: closeF }];
    return { isOpen: st.isOpen, segments, nowFrac };
}

// Market's own current wall-clock, e.g. "11:00".
export function localNow(market, now) {
    return now.to_timezone(tzFor(market.tz)).format('%H:%M');
}

// Uniform "UTC-4" / "UTC+5:30" label. %Z is inconsistent (EDT here, "-03"
// there); the numeric offset is the same for every zone.
function utcOffsetLabel(dt) {
    const z = dt.format('%z');                  // "-0400", "+0530", "+0000"
    const sign = z[0] === '-' ? '-' : '+';
    const h = parseInt(z.slice(1, 3), 10);
    const m = parseInt(z.slice(3, 5), 10);
    return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

// Closed-state row data: when does this market next open?
//   -> { dayName, hhmm, localHhmm, localTz, viaHoliday } or null
export function nextOpenParts(market, now) {
    const st = marketState(market, now);
    if (!st)
        return null;
    const utc = st.openDt.to_utc();
    return {
        dayName: utc.format('%a'),          // "Mon"
        hhmm: utc.format('%H:%M'),          // UTC time of the bell
        localHhmm: st.openDt.format('%H:%M'),
        localTz: utcOffsetLabel(st.openDt),

        viaHoliday: st.viaHoliday,
    };
}

// "2026-06-24" key (in the DateTime's own timezone) for notification dedup.
export function dateKey(dt) {
    const pad = n => String(n).padStart(2, '0');
    return `${dt.get_year()}-${pad(dt.get_month())}-${pad(dt.get_day_of_month())}`;
}

// 9015 -> "2h 30m". Always returns at least minutes.
export function humanize(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const days = Math.floor(seconds / 86400); seconds %= 86400;
    const hours = Math.floor(seconds / 3600); seconds %= 3600;
    const mins = Math.floor(seconds / 60);

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins || (!days && !hours)) parts.push(`${mins}m`);
    return parts.join(' ');
}
