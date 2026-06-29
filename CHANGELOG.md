# Changelog

All notable changes to MarketBell are documented here. Versions match the
`version-name` in `metadata.json` and the git tags. This project follows
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Popup lists open markets first, then closed (stable within each group).
- Legend now explains the `★` primary-market marker.

## [0.1.2] - 2026-06-29

Resubmission addressing the EGO review of 0.1.1.

### Changed
- Track the settings signal with `connectObject()`/`disconnectObject()` instead
  of a hand-rolled handler id.
- Scheduler removes its timeout source before arming a new one.

## [0.1.1] - 2026-06-28

Rejected at EGO review.

### Added
- Scheduled holiday-data freshness check (`tools/check-holidays.mjs` + GitHub
  workflow) that opens a tracking issue when `lib/holidays.js` is missing the
  upcoming year, with a status badge in the README.
- Massive API holiday cross-check tool and early-close (half-day) session
  validation.
- Click a market row to fire a test notification.
- Early-close (half-day) trading sessions are modeled.

### Changed
- Primary marker is a neutral grey `★` instead of a green dot.

## [0.1.0] - 2026

Initial release. Rejected at EGO review.

### Added
- Top-panel indicator showing the primary market's next-bell countdown;
  click/scroll to cycle the primary market.
- Session-timeline popup: a 24-hour UTC track per watched market with a shared
  now-line, plus a closed-state banner counting down to the next open.
- Opening/closing bell desktop notifications with independent per-event lead
  times.
- Holiday- and weekend-aware scheduling, including the Gulf Friday–Saturday
  weekend.
- Preferences: watched-market selection, primary-market dropdown, lead times,
  and notification toggles.
- 19 exchanges, fully offline (no network, no API keys). Targets GNOME Shell 50.

[Unreleased]: https://github.com/dgnsrekt/marketbell/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/dgnsrekt/marketbell/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/dgnsrekt/marketbell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/dgnsrekt/marketbell/releases/tag/v0.1.0
