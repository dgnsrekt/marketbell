// SPDX-License-Identifier: GPL-2.0-or-later
// Thin wrapper around the GNOME Shell message tray. Owns a single named source
// so all MarketBell alerts group together.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const ICON = 'preferences-system-time-symbolic';

export class Notifier {
    constructor(settings) {
        this._settings = settings;
        this._source = null;
    }

    _ensureSource() {
        if (this._source)
            return;

        this._source = new MessageTray.Source({ title: 'MarketBell', iconName: ICON });
        this._source.connect('destroy', () => (this._source = null));
        Main.messageTray.add(this._source);
    }

    notify(title, body) {
        if (!this._settings.get_boolean('notifications-enabled'))
            return;

        this._ensureSource();

        const n = new MessageTray.Notification({
            source: this._source,
            title,
            body,
            isTransient: true,
        });
        this._source.addNotification(n);
    }

    destroy() {
        this._source?.destroy();
        this._source = null;
        this._settings = null;
    }
}