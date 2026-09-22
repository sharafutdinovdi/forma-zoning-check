# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version names and dates below come from the corresponding feature commits in `git log --date=short`.

## [Unreleased]

## [v4] - 2026-09-22

### Added

- Permitted-envelope generation with per-edge setbacks, height caps, FAR and coverage budgets, a 3D overlay and saving to the Forma library.
- Height- and street-width-dependent setback rules and bouwvlak mode.
- Presets for Serbia, Germany, the Netherlands and Spain.

### Changed

- Native Forma Design System controls and Results, Controls and Envelope tabs, with Artifakt Element typography.
- Metric rows, caveat tooltips, source references in CSV reports and a Reference values badge for fallback presets.
- Preset files use schema `@2`, with `@1` imports retained.
- Numeric input is locale-independent.

## [v2.3] - 2026-09-21

### Added

- Loading and saving preset JSON files with schema `@1`, and built-in presets supplied as files.
- A status line with the next action and collapsible parcel controls with a summary.

### Changed

- Results appear first; the selected preset determines the jurisdiction.
- The iframe root is transparent in Forma.
- The README describes the coordinator workflow with live Forma screenshots.

### Fixed

- Errors display their actual message, and Refresh recovers from stale development-server imports.

## [v2.2] - 2026-09-21

### Added

- Parcel-control checks for FAR, coverage, height, floors and setbacks.
- Sourced Dubai DBC/DDA and Riyadh MOMAH presets, with manual plot controls.
- Proposal-only counting with optional existing buildings, 3D status overlays, synchronized mini and floating views, CSV export and synthetic fixtures.

### Fixed

- Resume after back/forward cache restoration and bounded SDK waits.
- Duplicate missing-limit guidance.

[Unreleased]: https://github.com/sharafutdinovdi/forma-zoning-check/compare/020203b...HEAD
[v4]: https://github.com/sharafutdinovdi/forma-zoning-check/commit/020203b
[v2.3]: https://github.com/sharafutdinovdi/forma-zoning-check/commit/affb2ae
[v2.2]: https://github.com/sharafutdinovdi/forma-zoning-check/commit/cd52ec0
