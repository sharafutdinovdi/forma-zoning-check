# Zoning Check

An MIT-licensed Forma Site Design embedded view for comparing a proposal’s massing with parcel controls for Dubai and Riyadh. Built with vanilla TypeScript, Vite, Forma Embedded View SDK 0.96.0 and polygon-clipping.

Enter limits from the parcel’s affection plan / DCR or نظام البناء, or start with a sourced preset. Proposal changes refresh the results automatically.
Only proposal buildings intersecting the site limit count by default; Parcel controls can include existing buildings.
The report contains FAR, coverage, height, floors and setbacks, with temporary coloured meshes.
CSV sections are Checks, Buildings, Controls and Metadata; numeric cells use dot decimals without thousands separators.

**Estimated massing check — not a compliance statement.** Parking is always insufficient data. Regulatory floor classification, annex coverage, road-level height datum and permit requirements are not proved by the geometry.

## Run locally

```sh
npm install --package-lock=false
npm run typecheck
npm run build
npm run dev
```

Vite uses `localhost:5173` with `strictPort`. Reuse the existing repository server if that port is occupied; do not restart it for this task. The owner starts their own dev server; delivery does not provision a persistent server. There is no committed lockfile because the specification restricts the final file set; direct dependencies are pinned in package.json, transitive dependencies are not.

Open `http://localhost:5173/?fixture=1` for a synthetic 60 × 40 m Al Jadaf example. Below 300 px the fixture renders the mini panel; at 440 px it renders the full panel.
Add `&existing=1` for a synthetic existing building, excluded until the counting switch is enabled.
The full-panel state selector, or `&state=ready|loading|no-site-limit|no-buildings-on-plot|error`, exposes all states. Preview controls persist under a separate fixture proposal id; clear that localStorage entry to restore the initial fixture. Fixture mode is ignored inside an iframe. Opening the app standalone without the flag shows host instructions.

## Use in Forma

Point the extension’s embedded view at the served URL using your existing Forma extension configuration. At container widths below 300 px, the app shows four compact score rows, Refresh and an open-panel icon.
The icon and score rows call `Forma.openFloatingPanel` with a preferred 440 × 720 px size. Both placements serve the same app.

1. Draw one closed site limit for the parcel. Multiple site limits require choosing one in Forma before refreshing.
2. Select a jurisdiction and preset, or enter parcel controls. Dubai master-developer / Downtown is the default, with all numerical limits blank.
3. Classify plot edges as road or neighbour. E1 begins at the first vertex returned by Forma; edge tooltips give endpoints in local metres. For Riyadh, select the front road first; later selected road edges use the side/rear formula. The entered street width applies to every classified road edge.
4. Results update after proposal changes with a 600 ms debounce; Refresh remains available.
   Proposal buildings intersecting the plot by more than 1 m² count; crossings are flagged and their whole GFA counts. Coverage clips the footprint union to the plot.
5. Read margins and assumptions, inspect the Buildings list and export CSV.

Changing presets overwrites controls. Editing a field or edge switches to Custom while retaining the source as “based on …”. Controls persist by proposal id; a changed plot polygon clears saved road-edge indices. Separate panels synchronise calculated reports and controls through `BroadcastChannel("zoning-check")`, with `localStorage` events as fallback.
The receiving panel renders the supplied report without recalculation.
An unavailable SDK subscription falls back to a path/count/revision fingerprint every 4 seconds, paused while hidden. A storage failure leaves controls usable in the current session and displays a notice.

Existing buildings use the provisional `integrate`/`overture` URN discriminator documented in [NOTES.md](NOTES.md).
Imported proposal buildings can match this heuristic; enable **Count existing buildings on plot** when necessary.
Excluded existing buildings receive neutral grey meshes at approximately 0.15 opacity.
The view that computed the current report owns the overlays; receivers clear their own meshes to avoid duplicates.
Closing that view removes its overlays until another calculation.

Tint status combines each building’s height, floors, setbacks and plot-boundary checks. Plot FAR and coverage are reported separately; parking does not make every building grey. Green means the available local checks pass, orange indicates a failure, and grey means insufficient data. Missing base elevations prevent reliable placement of a building overlay. Setback strips use a flat datum at the lowest known building base and the largest applicable neighbour setback on each edge; they are illustrative, not terrain-draped regulatory envelopes.

## Presets and evidence

Preset values and original source URLs come from [the supplied research](../compass-brain/research/oss/zoning-rules-dubai-riyadh-2026-09-20.md). The app links directly to the authority documents / parcel pages. DDA examples approximate side-specific setbacks as road/neighbour values; they are not defaults for Downtown. Riyadh annex and upper-floor coverage are not calculated.

See [NOTES.md](NOTES.md) for declared SDK contracts, unverified host behaviour and verification evidence. **This version has not been tested inside Forma.**

## Screenshots

The v2.2 captures use synthetic data:

- [Mini ready, 240 px](docs/screens/mini-ready-240.png)
- [Mini without a site limit, 240 px](docs/screens/mini-empty-240.png)
- [Full panel ready, 440 px](docs/screens/ready-440.png)
- [Icon at 16/32/64/256 px on white and grey](docs/screens/icon-preview.png)

Other screenshots in this directory are historical v2/v2.1 captures.
[Presentation texts and icon exports](assets/presentation.md) are ready for the Forma extension form.

Movement uses CSS only: status/margin transitions 160 ms, building disclosure 180 ms, results opacity and mini skeleton fade 120 ms; reduced motion reduces all transitions to 0.01 ms. No animation library, UI framework, icon font, HTTP data API, OAuth or Forma model writes are used.
