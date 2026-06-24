// Top-panel indicator: a small clock icon + count of open markets, with a popup
// listing each watched market's live status.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { MARKETS_BY_ID } from './markets.js';
import { marketState, humanize } from './marketclock.js';

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

        this.update();
    }

    update() {
        this._marketSection.removeAll();
        const now = GLib.DateTime.new_now_utc();

        let openCount = 0;
        const ids = this._settings.get_strv('watched-markets');
        if (ids.length === 0)
            this._marketSection.addMenuItem(new PopupMenu.PopupMenuItem(_('No markets selected'), { reactive: false }));

        for (const id of ids) {
            const m = MARKETS_BY_ID.get(id);
            if (!m)
                continue;
            const { isOpen, text } = describe(m, now);
            if (isOpen)
                openCount++;
            const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
            if (isOpen)
                item.add_style_class_name('marketbell-open');
            this._marketSection.addMenuItem(item);
        }

        this._label.text = String(openCount);
        if (this._toggle)
            this._toggle.setToggleState(this._settings.get_boolean('notifications-enabled'));
    }

    destroy() {
        this._settings = null;
        this._openPrefs = null;
        super.destroy();
    }
});
