# Zoning Check

Zoning Check is a Forma Site Design extension for comparing proposal massing with parcel controls for Dubai and Riyadh.
It reports estimated FAR, coverage, height, floors and setbacks, displays temporary coloured overlays, and exports a CSV report.
The same TypeScript app provides a compact analysis panel and a full floating panel with editable controls.

## Screenshots

- [Full panel, 440 px](docs/screens/ready-440.png)
- [Mini panel, 240 px](docs/screens/mini-ready-240.png)

## How it works

Only proposal buildings on the site limit count by default.
The **Count existing buildings on plot** control includes existing context buildings.
Buildings intersecting the plot by more than 1 m² count; crossings are flagged and their whole GFA counts, while coverage clips the footprint union to the plot.
Unavailable geometry remains visible as insufficient data.

Parcel controls accept limits from the current affection plan, DCR or نظام البناء.
Presets link to their sources and carry their scope and caveats; DDA parcel examples are not defaults for Downtown.
The default Dubai master-developer preset leaves numerical limits blank.
Changing presets replaces controls; editing a field switches to Custom and retains the source attribution.
Road/neighbour edge classification affects setbacks; Riyadh presets also require street width, and the first selected road is the front road.
Controls persist by proposal, and a changed plot polygon clears saved road-edge selections.

Proposal changes refresh results with a 600 ms debounce.
If the SDK subscription fails or times out, a proposal/path/revision fingerprint is polled every 4 seconds while visible.
Subscription setup and each fingerprint fetch time out after 8 seconds; polling retries on the next available tick.
Panels synchronise reports and controls through BroadcastChannel, with storage events as a fallback.
Returning from the browser back/forward cache restarts synchronisation and refreshes the report.
The calculating view owns the temporary overlays; closing it removes them.

**Results are estimated massing checks, not compliance statements.**
Parking always reports insufficient data.
Regulatory floor classification, annex coverage, road-level height datum and permit requirements are not established by model geometry.

## Forma setup

1. Serve the app at a URL accessible to Forma; the local development URL is `http://localhost:5173/`.
2. In Forma extension management, choose **Create extension** and enter the extension details.
3. Add the target Forma project ID (`pro_…`) to the extension project allowlist.
4. Add an **Embedded view** with the app URL and placement `RIGHT_MENU_ANALYSIS_PANEL`.
5. In **Buttons**, enter the following YAML, using the same app URL in both placements:

```yaml
- label: Zoning Check
  actions:
    click:
      type: OPEN_FLOATING_PANEL
      url: http://localhost:5173/
      preferredSize:
        width: 440
        height: 720
```

The Buttons format and `preferredSize` fields are documented in [Autodesk's floating-panel configuration example](https://forums.autodesk.com/t5/forma-site-design-developer/how-can-i-make-an-extension-modal-cover-the-entire-window/m-p/12281463/highlight/true).
Use the deployed URL for a shared installation.
Enable the extension in the allowlisted project and open a proposal with one closed site limit.
At widths below 300 px the embedded view shows the mini panel; the toolbar button opens the full panel at a preferred 440 × 720 px size.
The mini panel also opens the full panel through the SDK; if unavailable, its notice directs users to the toolbar button.

## Development quickstart

Use Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
npm run dev
```

Vite serves `http://localhost:5173/` with a strict port.
Open `http://localhost:5173/?fixture=1` for a synthetic example outside Forma.
The fixture renders the mini panel below 300 px and the full panel at 440 px.
Add `&existing=1` for an excluded existing building, or select a state with `&state=ready`, `loading`, `no-site-limit`, `no-buildings-on-plot` or `error`.
Fixture mode is ignored inside an iframe.

```sh
npm run typecheck && npm run build
```

The production files are written to `dist/`.
The committed `package-lock.json` pins the dependency tree for `npm ci`.

## Sources

The presets in [src/rules.ts](src/rules.ts) use these source URLs:

- [Dubai Building Code 2021, B.4.2](https://dmpmedia.dm.gov.ae/uploads/2021/12/Dubai%20Building%20Code_English_2021%20Edition_compressed.pdf)
- [DDA plot 3261507, Al Jadaf](https://gis.dda.gov.ae/DIS?PlotNumber=3261507&handler=PlotInfo)
- [DDA plot 3262935, Al Jadaf](https://gis.dda.gov.ae/DIS?PlotNumber=3262935&handler=PlotInfo)
- [Emaar, Downtown Dubai](https://www.emaar.com/en/our-communities/downtown-dubai)
- [MOMAH residential building requirements 2024, Arabic](https://momah.gov.sa/sites/default/files/2025-11/ashtratat%20ansha%20almbany%20alsknyt9%20ywlyh%202024.pdf)
- [Riyadh plot building-system service](https://www.alriyadh.gov.sa/ar/services/40?mainServiceCode=2)

## Disclaimer

This extension is an independent estimation tool, not an authority approval or a substitute for professional review.
Current parcel documents and applicable authority requirements take precedence over presets.
Special-authority and master-developer controls require parcel-specific input.
Geometry availability and measurement assumptions can affect every result; missing limits or geometry do not imply a pass.
[NOTES.md](NOTES.md) records implementation evidence, geometry limitations and host behaviour that remains unverified in live Forma.

## Licence

[MIT License](LICENSE), Copyright (c) 2026 Dinar Sharafutdinov.
