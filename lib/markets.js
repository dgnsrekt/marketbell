// SPDX-License-Identifier: GPL-2.0-or-later
// The 19 markets tracked by MarketBell.
//
// Ported from the market_clock Python project (market_clock/regions.py).
// Times are local to each exchange's timezone (IANA tz id). `weekend` uses ISO
// weekday numbers as returned by GLib.DateTime.get_day_of_week():
//   1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 7=Sun
// Most markets rest Sat+Sun ([6, 7]); Gulf markets rest Fri+Sat ([5, 6]).
//
// `session` groups markets into the five classic Forex sessions, used purely
// for display grouping and (future) overlap alerts.

import { HOLIDAYS } from './holidays.js';

const SAT_SUN = [6, 7];
const FRI_SAT = [5, 6];

function market(def) {
    return { weekend: SAT_SUN, holidays: HOLIDAYS[def.id] ?? [], ...def };
}

export const MARKETS = [
    market({ id: 'WELLINGTON',   name: 'Wellington',   exchange: 'NZX',     mic: 'XNZE', tz: 'Pacific/Auckland',     open: [10, 0],  close: [16, 45], session: 'Pacific' }),
    market({ id: 'SYDNEY',       name: 'Sydney',       exchange: 'ASX',     mic: 'XASX', tz: 'Australia/Sydney',     open: [10, 0],  close: [16, 0],  session: 'Pacific' }),
    market({ id: 'TOKYO',        name: 'Tokyo',        exchange: 'JPX',     mic: 'XJPX', tz: 'Asia/Tokyo',           open: [9, 0],   close: [15, 0],  session: 'Asian' }),
    market({ id: 'SINGAPORE',    name: 'Singapore',    exchange: 'SGX',     mic: 'XSES', tz: 'Asia/Singapore',       open: [9, 0],   close: [17, 0],  session: 'Asian' }),
    market({ id: 'HONG_KONG',    name: 'Hong Kong',    exchange: 'HKEX',    mic: 'XHKG', tz: 'Asia/Hong_Kong',       open: [9, 30],  close: [16, 0],  session: 'Asian' }),
    market({ id: 'SHANGHAI',     name: 'Shanghai',     exchange: 'SSE',     mic: 'XSHG', tz: 'Asia/Shanghai',        open: [9, 15],  close: [15, 0],  session: 'Asian' }),
    market({ id: 'INDIA',        name: 'Mumbai',       exchange: 'NSE',     mic: 'XNSE', tz: 'Asia/Kolkata',         open: [9, 15],  close: [15, 30], session: 'Asian' }),
    market({ id: 'DUBAI',        name: 'Dubai',        exchange: 'DFM',     mic: 'XDFM', tz: 'Asia/Dubai',           open: [10, 0],  close: [13, 50], session: 'MiddleEast', weekend: FRI_SAT }),
    market({ id: 'MOSCOW',       name: 'Moscow',       exchange: 'MOEX',    mic: 'MISX', tz: 'Europe/Moscow',        open: [9, 30],  close: [19, 0],  session: 'MiddleEast' }),
    market({ id: 'SAUDI',        name: 'Riyadh',       exchange: 'Tadawul', mic: 'XSAU', tz: 'Asia/Riyadh',          open: [10, 0],  close: [15, 0],  session: 'MiddleEast', weekend: FRI_SAT }),
    market({ id: 'JOHANNESBURG', name: 'Johannesburg', exchange: 'JSE',     mic: 'XJSE', tz: 'Africa/Johannesburg',  open: [9, 0],   close: [17, 0],  session: 'European' }),
    market({ id: 'LONDON',       name: 'London',       exchange: 'LSE',     mic: 'XLON', tz: 'Europe/London',        open: [8, 0],   close: [16, 30], session: 'European' }),
    market({ id: 'SWISS',        name: 'Zurich',       exchange: 'SIX',     mic: 'XSWX', tz: 'Europe/Zurich',        open: [9, 0],   close: [17, 30], session: 'European' }),
    market({ id: 'FRANKFURT',    name: 'Frankfurt',    exchange: 'FWB',     mic: 'XFRA', tz: 'Europe/Berlin',        open: [8, 0],   close: [17, 30], session: 'European' }),
    market({ id: 'SAO_PAULO',    name: 'São Paulo',    exchange: 'B3',      mic: 'BVMF', tz: 'America/Sao_Paulo',    open: [10, 0],  close: [16, 55], session: 'American' }),
    market({ id: 'NEW_YORK',     name: 'New York',     exchange: 'NYSE',    mic: 'XNYS', tz: 'America/New_York',     open: [9, 30],  close: [16, 0],  session: 'American' }),
    market({ id: 'TORONTO',      name: 'Toronto',      exchange: 'TSX',     mic: 'XTSE', tz: 'America/Toronto',      open: [9, 30],  close: [16, 0],  session: 'American' }),
    market({ id: 'CHICAGO',      name: 'Chicago',      exchange: 'CHX',     mic: 'XCHI', tz: 'America/Chicago',      open: [8, 30],  close: [15, 0],  session: 'American' }),
    market({ id: 'UTC',          name: 'UTC',          exchange: 'UTC',     mic: 'UTC',  tz: 'Etc/UTC',              open: [0, 0],   close: [23, 59], session: 'Reference', weekend: [] }),
];

export const MARKETS_BY_ID = new Map(MARKETS.map(m => [m.id, m]));

// 2-letter country code per market, for the popup's code chip. Flags render
// inconsistently in GNOME Shell, so we show country codes instead.
export const COUNTRY_CODE = {
    WELLINGTON: 'NZ', SYDNEY: 'AU', TOKYO: 'JP', SINGAPORE: 'SG', HONG_KONG: 'HK',
    SHANGHAI: 'CN', INDIA: 'IN', DUBAI: 'AE', MOSCOW: 'RU', SAUDI: 'SA',
    JOHANNESBURG: 'ZA', LONDON: 'GB', SWISS: 'CH', FRANKFURT: 'DE', SAO_PAULO: 'BR',
    NEW_YORK: 'US', TORONTO: 'CA', CHICAGO: 'US', UTC: 'UT',
};

// Sensible default watch-list: one anchor market per major session.
export const DEFAULT_WATCHLIST = ['TOKYO', 'LONDON', 'NEW_YORK'];