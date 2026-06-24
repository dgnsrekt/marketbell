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

    for (let offset = 0; offset <= 8; offset++) {
        const day = nowTz.add_days(offset);
        const y = day.get_year();
        const mo = day.get_month();
        const d = day.get_day_of_month();

        const openDt = GLib.DateTime.new(tz, y, mo, d, market.open[0], market.open[1], 0);
        const closeDt = GLib.DateTime.new(tz, y, mo, d, market.close[0], market.close[1], 0);

        if (!isTradingDay(market, openDt))
            continue;

        if (nowUnix < closeDt.to_unix()) {
            return {
                isOpen: nowUnix >= openDt.to_unix(),
                openDt,
                closeDt,
            };
        }
    }
    return null;
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
