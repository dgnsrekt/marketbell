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

import { MARKETS_BY_ID } from './markets.js';
import { marketState, humanize } from './marketclock.js';

const REFRESH_SECS = 60;   // keep the countdown current between scheduler ticks

function describe(m, now) {
    const st = marketState(m, now);
    if (!st)
        return { isOpen: false, text: _('%s — closed').format(m.name) };

    const secs = (st.isOpen ? st.closeDt : st.openDt).to_unix() - now.to_unix();
    const text = st.isOpen
        ? _('%s — open · closes in %s').format(m.name, humanize(secs))
        : _('%s — closed · opens in %s').format(m.name, humanize(secs));
    return { isOpen: st.isOpen, text };
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
    _init(settings, openPrefs) {
        super._init(0.0, 'MarketBell');
        this._settings = settings;
        this._openPrefs = openPrefs;

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

    update() {
        this._marketSection.removeAll();
        const now = GLib.DateTime.new_now_utc();

        const ids = this._settings.get_strv('watched-markets');
        const primaryId = this._settings.get_string('primary-market');

        if (ids.length === 0)
            this._marketSection.addMenuItem(new PopupMenu.PopupMenuItem(_('No markets selected'), { reactive: false }));

        for (const id of ids) {
            const m = MARKETS_BY_ID.get(id);
            if (!m)
                continue;
            const { isOpen, text } = describe(m, now);
            const prefix = id === primaryId ? '● ' : '';   // mark the primary
            const item = new PopupMenu.PopupMenuItem(prefix + text, { reactive: false });
            if (isOpen)
                item.add_style_class_name('marketbell-open');
            this._marketSection.addMenuItem(item);
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
