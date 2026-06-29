// SPDX-License-Identifier: GPL-2.0-or-later
// Single-timer scheduler. Computes the soonest interesting instant across all
// watched markets, sleeps until then (capped), fires due notifications once,
// and re-arms. Never polls on a fixed tick.

import GLib from 'gi://GLib';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { MARKETS_BY_ID } from './markets.js';
import { marketState, dateKey, humanize } from './marketclock.js';

const MAX_SLEEP = 1800;       // re-evaluate at least every 30 min (suspend/DST drift)
const DEDUP_TTL = 2 * 86400;  // forget fired-event records after 2 days

export class Scheduler {
    constructor(settings, notifier, onUpdate) {
        this._settings = settings;
        this._notifier = notifier;
        this._onUpdate = onUpdate;     // refresh the panel indicator
        this._timerId = 0;
        this._fired = this._loadFired();
    }

    start() {
        this._tick();
    }

    // Recompute from scratch (e.g. after a settings change).
    refresh() {
        this._disarm();
        this._tick();
    }

    stop() {
        this._disarm();
        this._settings = null;
        this._notifier = null;
        this._onUpdate = null;
    }

    _disarm() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _watched() {
        return this._settings.get_strv('watched-markets')
            .map(id => MARKETS_BY_ID.get(id))
            .filter(m => m);
    }

    // Build every candidate notification for the current window.
    _events(now) {
        const nowUnix = now.to_unix();
        const leadOpen = this._settings.get_int('lead-open-minutes') * 60;
        const leadClose = this._settings.get_int('lead-close-minutes') * 60;
        const notifyOpen = this._settings.get_boolean('notify-open');
        const notifyClose = this._settings.get_boolean('notify-close');

        const events = [];
        const wakes = [];

        for (const m of this._watched()) {
            const st = marketState(m, now);
            if (!st)
                continue;

            // Wake at the next state transition so we re-plan promptly.
            wakes.push(st.openDt.to_unix(), st.closeDt.to_unix());

            if (!st.isOpen && notifyOpen) {
                events.push({
                    key: `${m.id}:open:${dateKey(st.openDt)}`,
                    fireUnix: st.openDt.to_unix() - leadOpen,
                    eventUnix: st.openDt.to_unix(),
                    title: _('%s — opening bell').format(m.name),
                    body: _('%s opens in %s (%s local)').format(
                        m.exchange, humanize(leadOpen), st.openDt.format('%H:%M')),
                });
            }

            if (st.isOpen && notifyClose) {
                events.push({
                    key: `${m.id}:close:${dateKey(st.closeDt)}`,
                    fireUnix: st.closeDt.to_unix() - leadClose,
                    eventUnix: st.closeDt.to_unix(),
                    title: _('%s — closing bell').format(m.name),
                    body: _('%s closes in %s (%s local)').format(
                        m.exchange, humanize(leadClose), st.closeDt.format('%H:%M')),
                });
            }
        }
        return { events, wakes };
    }

    _tick() {
        const now = GLib.DateTime.new_now_utc();
        const nowUnix = now.to_unix();
        const { events, wakes } = this._events(now);

        // Fire anything due that hasn't already fired (and hasn't elapsed).
        for (const e of events) {
            if (e.fireUnix <= nowUnix && e.eventUnix > nowUnix && !this._fired.has(e.key)) {
                this._notifier.notify(e.title, e.body);
                this._fired.set(e.key, nowUnix);
            }
        }
        this._persistFired(nowUnix);

        // Next wake = soonest future fire time or state transition, capped.
        let next = nowUnix + MAX_SLEEP;
        const consider = u => { if (u > nowUnix && u < next) next = u; };
        for (const e of events) { consider(e.fireUnix); consider(e.eventUnix); }
        for (const w of wakes) consider(w);

        this._onUpdate?.();

        const delay = Math.max(1, next - nowUnix);
        this._disarm();   // never leave a stray source before arming a new one
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timerId = 0;
            this._tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _loadFired() {
        try {
            const raw = this._settings.get_string('last-fired');
            return new Map(Object.entries(raw ? JSON.parse(raw) : {}));
        } catch (_e) {
            return new Map();
        }
    }

    _persistFired(nowUnix) {
        const cutoff = nowUnix - DEDUP_TTL;
        for (const [k, v] of this._fired) {
            if (v < cutoff)
                this._fired.delete(k);
        }
        this._settings.set_string('last-fired', JSON.stringify(Object.fromEntries(this._fired)));
    }
}