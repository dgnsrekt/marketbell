// SPDX-License-Identifier: GPL-2.0-or-later
// Top-panel indicator: a small clock icon + the primary market's next-bell
// countdown ("opens 6h" / "closes 1h 12m"), with a popup listing each watched
// market's live status. Click the panel to cycle the primary market (scroll
// also cycles); right-click opens the popup.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { MARKETS_BY_ID, COUNTRY_CODE } from './markets.js';
import { marketState, sessionSegments, localNow, nextOpenParts, humanize, nextBell } from './marketclock.js';
import { makeTrack, makeWeekendStrip } from './timeline.js';

const REFRESH_SECS = 60;   // keep the countdown current between scheduler ticks

const CENTER = Clutter.ActorAlign.CENTER;
const END = Clutter.ActorAlign.END;

// "closes 6h" / "opens 9h" for the current/next bell.
function statusShort(m, now) {
    const st = marketState(m, now);
    if (!st)
        return { open: false, text: _('closed') };
    const secs = (st.isOpen ? st.closeDt : st.openDt).to_unix() - now.to_unix();
    return {
        open: st.isOpen,
        text: st.isOpen ? _('closes %s').format(humanize(secs)) : _('opens %s').format(humanize(secs)),
    };
}

function codeChip(id) {
    return new St.Label({ text: COUNTRY_CODE[id] ?? '', style_class: 'marketbell-cc', y_align: CENTER });
}

function nameLabel(m, isPrimary) {
    const box = new St.BoxLayout({ y_align: CENTER });
    if (isPrimary)
        box.add_child(new St.Label({ text: '★', style_class: 'marketbell-star', y_align: CENTER }));
    box.add_child(new St.Label({ text: m.name, style_class: 'marketbell-name', y_align: CENTER }));
    return box;
}

function menuRow(reactive = false) {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive, can_focus: reactive });
    const row = new St.BoxLayout({ x_expand: true, style_class: 'marketbell-row' });
    item.add_child(row);
    return { item, row };
}

// Live row: name + local-time/status sub-line on the left, 24h track on the right.
// `onPick`, when given, makes the row clickable (fires a test notification).
function liveRow(m, now, isPrimary, onPick) {
    const { item, row } = menuRow(!!onPick);
    if (onPick)
        item.connect('activate', () => onPick(m));
    const left = new St.BoxLayout({ style_class: 'marketbell-rowleft', y_align: CENTER });
    left.add_child(codeChip(m.id));

    const meta = new St.BoxLayout({ vertical: true, y_align: CENTER });
    meta.add_child(nameLabel(m, isPrimary));
    const ss = statusShort(m, now);
    const sub = new St.BoxLayout();
    sub.add_child(new St.Label({ text: `${localNow(m, now)} · `, style_class: 'marketbell-tzt', y_align: CENTER }));
    sub.add_child(new St.Label({ text: ss.text, style_class: ss.open ? 'marketbell-st-open' : 'marketbell-st-closed', y_align: CENTER }));
    meta.add_child(sub);
    left.add_child(meta);

    row.add_child(left);
    row.add_child(makeTrack(() => sessionSegments(m, now)));
    return item;
}

// Closed-state row: when does it next open (absolute day + local time)?
function closedRow(m, now, isPrimary, onPick) {
    const { item, row } = menuRow(!!onPick);
    if (onPick)
        item.connect('activate', () => onPick(m));
    row.add_child(codeChip(m.id));
    row.add_child(nameLabel(m, isPrimary));

    const np = nextOpenParts(m, now);
    if (np?.viaHoliday)
        row.add_child(new St.Label({ text: _('holiday'), style_class: 'marketbell-holidaychip', y_align: CENTER }));

    row.add_child(new St.Widget({ x_expand: true }));

    const right = new St.BoxLayout({ vertical: true, x_align: END });
    right.add_child(new St.Label({
        text: np ? _('opens %s %s').format(np.dayName, np.hhmm) : _('closed'),
        style_class: np?.viaHoliday ? 'marketbell-st-holiday' : 'marketbell-openat',
        x_align: END,
    }));
    if (np)
        right.add_child(new St.Label({ text: `${np.localHhmm} ${np.localTz}`, style_class: 'marketbell-localtz', x_align: END }));
    row.add_child(right);
    return item;
}

function headerRow(now) {
    const { item, row } = menuRow();
    row.style_class = 'marketbell-row marketbell-header';
    row.add_child(new St.Label({ text: _('now'), style_class: 'marketbell-nowlbl', y_align: CENTER }));
    row.add_child(new St.Label({ text: now.format('%H:%M'), style_class: 'marketbell-nowval', y_align: CENTER }));
    row.add_child(new St.Widget({ x_expand: true }));
    row.add_child(new St.Label({ text: 'UTC', style_class: 'marketbell-tzchip', y_align: CENTER }));
    return item;
}

// Day-cell layout for the closed banner: equal cells from today to the open
// day, with the now/open markers placed proportionally within them.
function weekendModel(now, soonestUnix) {
    const nowUnix = now.to_unix();
    const startDay = nowUnix - (nowUnix % 86400);          // UTC midnight today
    const openDay = soonestUnix - (soonestUnix % 86400);
    const nDays = Math.max(1, Math.min(Math.round((openDay - startDay) / 86400) + 1, 5));
    const span = nDays * 86400;

    const grid = [];
    const labels = [];
    for (let i = 0; i < nDays; i++) {
        labels.push(GLib.DateTime.new_from_unix_utc(startDay + i * 86400).format('%a'));
        if (i > 0) grid.push(i / nDays);
    }
    return {
        nowFrac: Math.min(1, (nowUnix - startDay) / span),
        openFrac: Math.min(1, (soonestUnix - startDay) / span),
        grid, labels,
    };
}

function closedBanner(now, soonestUnix) {
    const secs = Math.max(0, soonestUnix - now.to_unix());
    const model = weekendModel(now, soonestUnix);

    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    const box = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'marketbell-weekbox' });

    const top = new St.BoxLayout({ x_expand: true });
    top.add_child(new St.Label({ text: _('All markets closed'), style_class: 'marketbell-weektitle', y_align: CENTER }));
    top.add_child(new St.Widget({ x_expand: true }));
    top.add_child(new St.Label({ text: _('opens in %s').format(humanize(secs)), style_class: 'marketbell-weekcount', y_align: CENTER }));
    box.add_child(top);

    box.add_child(makeWeekendStrip(() => model));

    const days = new St.BoxLayout({ x_expand: true, style_class: 'marketbell-wkdays' });
    model.labels.forEach((lbl, i) => {
        const isOpenDay = i === model.labels.length - 1;
        days.add_child(new St.Label({
            text: isOpenDay ? _('%s · open').format(lbl) : lbl,
            x_expand: true, x_align: CENTER,
            style_class: isOpenDay ? 'marketbell-wkday-open' : 'marketbell-wkday',
        }));
    });
    box.add_child(days);

    item.add_child(box);
    return item;
}

function legendRow() {
    const { item, row } = menuRow();
    row.style_class = 'marketbell-row marketbell-legend';
    const swatch = (style) => new St.Widget({ width: 10, height: 10, y_align: CENTER, style });
    row.add_child(swatch('background-color:#57e389;border-radius:2px;'));
    row.add_child(new St.Label({ text: _('open'), y_align: CENTER }));
    row.add_child(swatch('background-color:rgba(255,255,255,.28);border-radius:2px;'));
    row.add_child(new St.Label({ text: _('closed'), y_align: CENTER }));
    row.add_child(swatch('background-color:#f5c211;border-radius:50%;'));
    row.add_child(new St.Label({ text: _('now'), y_align: CENTER }));
    return item;
}

// Compact panel form: "NYSE closes 1h 12m" / "NYSE opens 6h".
function panelText(m, now) {
    const st = marketState(m, now);
    if (!st)
        return { isOpen: false, text: `${m.exchange} ${_('closed')}` };
    const secs = (st.isOpen ? st.closeDt : st.openDt).to_unix() - now.to_unix();
    const verb = st.isOpen ? _('closes') : _('opens');
    return { isOpen: st.isOpen, text: `${m.exchange} ${verb} ${humanize(secs)}` };
}

export const MarketBellIndicator = GObject.registerClass(
class MarketBellIndicator extends PanelMenu.Button {
    _init(settings, openPrefs, notifier) {
        super._init(0.0, 'MarketBell');
        this._settings = settings;
        this._openPrefs = openPrefs;
        this._notifier = notifier;

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        box.add_child(new St.Icon({
            icon_name: 'preferences-system-time-symbolic',
            style_class: 'system-status-icon',
        }));
        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'marketbell-label',
        });
        box.add_child(this._label);
        this.add_child(box);

        this._marketSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._marketSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._toggle = new PopupMenu.PopupSwitchMenuItem(
            _('Notifications'), this._settings.get_boolean('notifications-enabled'));
        this._toggle.connect('toggled', (_i, state) =>
            this._settings.set_boolean('notifications-enabled', state));
        this.menu.addMenuItem(this._toggle);

        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
        prefsItem.connect('activate', () => this._openPrefs());
        this.menu.addMenuItem(prefsItem);

        this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECS, () => {
            this.update();
            return GLib.SOURCE_CONTINUE;
        });

        this.update();
    }

    // Left-click / scroll cycle the primary market; right-click opens the popup.
    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            const btn = event.get_button();
            if (btn === Clutter.BUTTON_PRIMARY) {
                this._cyclePrimary(1);
                return Clutter.EVENT_STOP;
            }
            if (btn === Clutter.BUTTON_SECONDARY) {
                this.menu.toggle();
                return Clutter.EVENT_STOP;
            }
        } else if (type === Clutter.EventType.SCROLL) {
            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP) {
                this._cyclePrimary(-1);
                return Clutter.EVENT_STOP;
            }
            if (dir === Clutter.ScrollDirection.DOWN) {
                this._cyclePrimary(1);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // Advance the primary market through the watched list (wraps both ways).
    _cyclePrimary(dir) {
        const ids = this._settings.get_strv('watched-markets');
        if (ids.length === 0)
            return;
        const cur = this._settings.get_string('primary-market');
        const idx = ids.indexOf(cur);   // -1 if primary isn't watched → lands on an end
        const next = ids[((idx + dir) % ids.length + ids.length) % ids.length];
        this._settings.set_string('primary-market', next);   // 'changed' handler re-renders
    }

    // Fire a one-off notification describing a market's current state, mirroring
    // the scheduler's bell wording. notifier.notify() self-gates on
    // 'notifications-enabled', so this can never leak while notifications are off.
    _notifyState(m) {
        const b = nextBell(m, GLib.DateTime.new_now_utc());
        const body = !b
            ? _('%s — market closed').format(m.exchange)
            : (b.isOpen ? _('%s closes in %s (%s local)') : _('%s opens in %s (%s local)'))
                .format(m.exchange, humanize(b.seconds), b.localHHMM);
        this._notifier?.notify(m.name, body);
    }

    update() {
        this._marketSection.removeAll();
        const now = GLib.DateTime.new_now_utc();

        const ids = this._settings.get_strv('watched-markets');
        const primaryId = this._settings.get_string('primary-market');

        const markets = ids.map(id => MARKETS_BY_ID.get(id)).filter(m => m);

        // When notifications are on, clicking a market row fires a test
        // notification with its current state. Gated here so there are no dead
        // clicks when off (update() re-runs whenever the setting changes).
        const onPick = this._notifier && this._settings.get_boolean('notifications-enabled')
            ? m => this._notifyState(m) : null;

        this._marketSection.addMenuItem(headerRow(now));

        if (markets.length === 0) {
            this._marketSection.addMenuItem(new PopupMenu.PopupMenuItem(_('No markets selected'), { reactive: false }));
        } else {
            const states = markets.map(m => ({ m, st: marketState(m, now) }));
            const anyOpen = states.some(x => x.st?.isOpen);

            if (anyOpen) {
                for (const m of markets)
                    this._marketSection.addMenuItem(liveRow(m, now, m.id === primaryId, onPick));
            } else {
                let soonestUnix = Infinity;
                for (const { st } of states)
                    if (st) soonestUnix = Math.min(soonestUnix, st.openDt.to_unix());
                this._marketSection.addMenuItem(closedBanner(now, Number.isFinite(soonestUnix) ? soonestUnix : now.to_unix()));
                for (const m of markets)
                    this._marketSection.addMenuItem(closedRow(m, now, m.id === primaryId, onPick));
            }
            this._marketSection.addMenuItem(legendRow());
        }

        // Panel label: the primary market's next-bell countdown.
        const primary = MARKETS_BY_ID.get(primaryId);
        this._label.remove_style_class_name('marketbell-open');
        this._label.remove_style_class_name('marketbell-closed');
        if (primary) {
            const { isOpen, text } = panelText(primary, now);
            this._label.text = text;
            this._label.add_style_class_name(isOpen ? 'marketbell-open' : 'marketbell-closed');
        } else {
            this._label.text = '—';
        }

        if (this._toggle)
            this._toggle.setToggleState(this._settings.get_boolean('notifications-enabled'));
    }

    destroy() {
        if (this._refreshId) {
            GLib.source_remove(this._refreshId);
            this._refreshId = 0;
        }
        this._settings = null;
        this._openPrefs = null;
        super.destroy();
    }
});