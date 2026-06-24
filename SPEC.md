# MarketBell — Design Spec

A GNOME Shell panel indicator + notification engine that alerts you at the
important points of the global trading day. Desktop-native reimplementation of
the `market_clock` service, fully offline.

## Goals
- Surface global market state at a glance in the top panel.
- Fire desktop notifications before market opens, closes (and, later, session
  overlaps / lunch breaks) with a user-configured lead time.
- Be fully offline, lightweight, and idle when nothing is imminent.
- Ship a clean libadwaita preferences UI.

## Non-goals
- No price/quote data, charts, or economic-calendar fetching (keeps it offline).
- No background daemon — lives in the Shell process, fully torn down on disable.

## Platform & stack
| Concern | Choice |
|---|---|
| GNOME Shell | 50 (ESM modules) |
| Language | GJS / GObject, ES modules |
| Prefs | libadwaita (`Adw.PreferencesWindow`), no Shell imports |
| Settings | GSettings schema |
| Time/TZ | `GLib.DateTime` + `GLib.TimeZone` — no JS `Date`, no tz library |
| Scheduling | single recomputed `GLib.timeout_add_seconds`, capped at 30 min |
| i18n | `gettext` |
| Notifications | `MessageTray.Source` + `Notification` |

## File layout
See README "Project layout". `extension.js` is lifecycle-only; the engine
(`marketclock.js`) is pure and Shell-free.

## Data model
Ported from `market_clock/regions.py`. Each market: `id, name, exchange, mic,
tz` (IANA), `open`/`close` `[h, m]` local, `weekend` (ISO weekday numbers;
`[6,7]` normal, `[5,6]` Gulf), `session` (Pacific/Asian/MiddleEast/European/
American/Reference), `holidays` (explicit ISO `YYYY-MM-DD`, year-specific).

## Scheduling model
- One timer, armed to the soonest of: any event's fire time (event − lead), or
  any market's next open/close transition; capped at 30 min so suspend/resume
  and DST drift self-correct.
- On fire: emit due notifications (event in future, fire time passed, not in the
  dedup map), persist dedup, recompute, re-arm. Never polls per second.

## Notifications — important points in the day
Implemented: **opening bell**, **closing bell**, each with its own on/off and
lead-minutes. Dedup keyed by `market:event:date`, persisted to GSettings so it
survives a Shell restart (desktop analog of the original's Redis dedup).

Roadmap event types: session-overlap start (peak liquidity), lunch break
start/resume (Asian markets), pre-holiday warning, daily open summary, quiet
hours + DND awareness.

## Preferences (libadwaita)
- **Notifications** page — master switch, opening/closing toggles + lead spinners.
- **Markets** page — switch row per exchange, toggling membership in
  `watched-markets`.
- Roadmap pages: Quiet hours, Appearance, About.

## Settings schema (`org.gnome.shell.extensions.marketbell`)
`watched-markets` (as), `notifications-enabled` (b), `notify-open` (b),
`notify-close` (b), `lead-open-minutes` (i), `lead-close-minutes` (i),
`last-fired` (s, internal dedup JSON).

## EGO review-guideline compliance
- `disable()` removes the timer (`GLib.source_remove`), disconnects the settings
  handler, destroys the indicator and message-tray source, nulls references.
- No work at module top level beyond construction; no Shell access in `prefs.js`.
- ESM only (no legacy `imports.*` / `Mainloop`); GSettings for all state.
- No monkey-patching, no eval, no remote code; minimal logging.
- `session-modes` defaults to `['user']`; prefs opened via `this.openPreferences()`.

## Naming
**MarketBell** — the opening/closing *bell* of an exchange; "bell" doubles as the
notification metaphor.
