// MarketBell preferences (libadwaita). No Shell/St/Clutter imports here.
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { MARKETS } from './lib/markets.js';

function spinRow(settings, key, title, lower, upper) {
    const adjustment = new Gtk.Adjustment({
        lower, upper, step_increment: 1, page_increment: 5,
    });
    const row = new Adw.SpinRow({ title, adjustment });
    adjustment.set_value(settings.get_int(key));
    adjustment.connect('value-changed', () => settings.set_int(key, adjustment.get_value()));
    return row;
}

export default class MarketBellPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ---- Notifications page ----
        const notifyPage = new Adw.PreferencesPage({
            title: _('Notifications'),
            icon_name: 'preferences-system-notifications-symbolic',
        });

        const general = new Adw.PreferencesGroup({ title: _('General') });
        general.add(this._boolRow(settings, 'notifications-enabled',
            _('Enable notifications'), _('Master switch for all alerts')));
        notifyPage.add(general);

        const bells = new Adw.PreferencesGroup({
            title: _('Bells'),
            description: _('Alert a number of minutes before the bell rings'),
        });
        bells.add(this._boolRow(settings, 'notify-open', _('Opening bell'), null));
        bells.add(spinRow(settings, 'lead-open-minutes', _('Lead time before open (minutes)'), 0, 240));
        bells.add(this._boolRow(settings, 'notify-close', _('Closing bell'), null));
        bells.add(spinRow(settings, 'lead-close-minutes', _('Lead time before close (minutes)'), 0, 240));
        notifyPage.add(bells);

        window.add(notifyPage);

        // ---- Markets page ----
        const marketsPage = new Adw.PreferencesPage({
            title: _('Markets'),
            icon_name: 'preferences-system-time-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: _('Watched markets'),
            description: _('Choose which exchanges to track and be notified about'),
        });
        for (const m of MARKETS)
            group.add(this._marketRow(settings, m));
        marketsPage.add(group);
        window.add(marketsPage);
    }

    _boolRow(settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({ title, subtitle: subtitle ?? '' });
        settings.bind(key, row, 'active', this._bindFlags());
        return row;
    }

    _marketRow(settings, m) {
        const row = new Adw.SwitchRow({
            title: `${m.name} · ${m.exchange}`,
            subtitle: m.tz,
        });
        row.set_active(settings.get_strv('watched-markets').includes(m.id));
        row.connect('notify::active', () => {
            let list = settings.get_strv('watched-markets');
            if (row.get_active()) {
                if (!list.includes(m.id))
                    list.push(m.id);
            } else {
                list = list.filter(id => id !== m.id);
            }
            settings.set_strv('watched-markets', list);
        });
        return row;
    }

    _bindFlags() {
        // Gio.SettingsBindFlags.DEFAULT === 0
        return 0;
    }
}
