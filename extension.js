// MarketBell — global market-hours indicator and notifier for GNOME Shell.
// SPDX-License-Identifier: GPL-2.0-or-later

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { MarketBellIndicator } from './lib/indicator.js';
import { Notifier } from './lib/notifier.js';
import { Scheduler } from './lib/scheduler.js';

// Settings keys that should trigger a full re-plan when changed.
const RELEVANT_KEYS = new Set([
    'watched-markets',
    'notifications-enabled',
    'notify-open',
    'notify-close',
    'lead-open-minutes',
    'lead-close-minutes',
]);

export default class MarketBellExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._notifier = new Notifier(this._settings);

        this._indicator = new MarketBellIndicator(this._settings, () => this.openPreferences(), this._notifier);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._scheduler = new Scheduler(this._settings, this._notifier, () => this._indicator?.update());
        this._scheduler.start();

        this._settings.connectObject('changed', (_s, key) => {
            if (RELEVANT_KEYS.has(key))
                this._scheduler?.refresh();
            this._indicator?.update();
        }, this);
    }

    disable() {
        this._settings.disconnectObject(this);
        this._scheduler?.stop();
        this._scheduler = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._notifier?.destroy();
        this._notifier = null;

        this._settings = null;
    }
}
