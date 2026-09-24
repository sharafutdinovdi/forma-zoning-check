# Zoning Check v2 — implementation evidence, 2026-09-20

## Evidence boundaries

No live Forma host was available during this implementation. **All host behaviour listed below is unverified at runtime**, including element contents, coordinate placement, alpha blending, floating panels and automatic cleanup. Local synthetic SDK tests check our adapter’s logic; they do not establish what Forma returns.

The supplied v2 specification reports these live v1 observations from 2026-09-20: singular category `building` returned 64 Overture context buildings in the Dubai site; their properties had no floor count; SDK area metrics returned zero; footprint areas summed to 77,775.9 m²; coordinates were local metres. These are owner-provided observations, not measurements repeated here. The previous NOTES.md described declarations and local tests only. Its “no live host tested” statement remains true for this executor.

Retained v1 facts: `getByPath` returns `{ element, elements }`; `getFootprint` is a flat XY ring, not nested GeoJSON; selection has no setter; proposal id/root/persistence calls exist but are deprecated. The v1 shoelace calculation and CSV BOM, escaping and spreadsheet-formula guard have been retained/refactored. `areaMetrics.calculate` is not used in v2, because context zeros do not establish GFA. `table.ts` is removed.

## Installed declarations inspected before use

Package: `forma-embedded-view-sdk` 0.96.0. Read `dist/internal/geometry.d.ts`, `elements.d.ts`, `representations.d.ts`, `proposal.d.ts`, `embedded-view.d.ts`, `scene/render.d.ts`, `dist/auto.d.ts`, and the installed `forma-elements/forma-element-schema.generated.ts` floor-polygon schema. No SDK mutation methods are called.

| Used contract | Implementation and unverified behaviour |
| --- | --- |
| `Forma` from `forma-embedded-view-sdk/auto` | Loaded dynamically only in an iframe. Standalone fixture does not start the host handshake. An arbitrary non-Forma iframe is not supported. |
| `proposal.awaitProposalPersisted()`, `getRootUrn()`, `getId()` | Retained proposal-based calls; deprecated in favour of UDM alternatives. The captured root pins geometry and element reads; root and id are rechecked before accepting a snapshot. Reads and persistence in an actual proposal remain unverified. |
| `elements.get({ urn })` | Reads the root’s optional `properties.name`; falls back to proposal id. Real root metadata unverified. |
| `geometry.getPathsByCategory({ category, urn })` | `site_limit` is explicitly documented; `building` appears in triangle examples. Selects one site limit, rejects multiple rather than silently choosing a parcel. Missing site limit produces the empty state. Actual categories and output remain unverified here. |
| `geometry.getFootprint({ path, urn })` | Accepts only valid `Polygon` rings; removes duplicate closing point, validates finite coordinates and self-intersections. API cannot represent holes or multipart footprints. Missing building footprints mark totals incomplete rather than being silently excluded. |
| `elements.getByPath({ path, rootUrn })` | Reads counted buildings only. Prints the property **key names** of the first counted building once per view; never full values. No real keys were obtained in this task. The test key `name` is synthetic. |
| `elements.floorStack` | Declarations expose only `createFromFloors` and `createFromFloorsBatch`; neither is called. There is no declared `getFloors` reader. |
| `elements.representations.grossFloorAreaPolygons({ urn })` | Used only if the element advertises this representation. The schema calls it the complete GFA representation and supplies `grossFloorPolygon` (outer ring + holes) and `elevation`. GFA sums plate areas net of holes. Distinct elevations supply model floor count. Availability/completeness for authored buildings and nested representations remains unverified. No recursive invented floor properties are used. |
| `elements.getWorldTransform({ path })` | Applies the declared affine matrix to local floor polygons before measuring XY area. Has no root argument, hence final snapshot recheck. Tilted floor transforms are rejected for this horizontal-floor calculation. World transform semantics and exact returned levels are unverified live. |
| `geometry.getTriangles({ path, urn })` | Flat Float32 XYZ triangles. Height = max Z − min Z; min Z becomes overlay base. No element `getBbox` exists (terrain has a different bbox API). Availability, world-frame positioning and regulatory datum remain unverified. |
| `element.properties.height` | Last fallback, only finite positive numeric values; no string parsing or fabricated height. This key and its units are not a declared contract and are unverified. Base Z remains unknown, so its building overlay is omitted. |
| `Forma.render.addMesh({ geometryData, transform })` | Declaration supports `position: Float32Array`, optional indices/normals and `color: Uint8Array` RGBA per vertex. Uses RGB pass `#119300`, fail `#ff451a`, insufficient `#6b6b88`, alpha 115/255. Ear-clipped footprint extrusions, excess-height prisms and clipped flat setback strips are implemented. Translation keeps mesh vertices local for precision. Normals/render materials, actual alpha blending and visibility are unverified in Forma. |
| `Forma.render.cleanup()` | Serialized cleanup on Refresh, replacement controls, error rollback and pagehide. A generation token cancels stale render jobs. Unload requests are best effort; declarations also promise host cleanup on extension close. Both require live verification. `remove`/`updateMesh` exist but are not needed. |
| `Forma.openFloatingPanel({ embeddedViewId, url, preferredSize, minimumWidth, placement })` | Experimental call, preferred 440 × 720, minimum width 360, same app URL. Errors show the toolbar hint. Actual panel creation and lifetime remain unverified. |

`getPresentationUnitSystem` documentation explicitly states all programmatic interfaces use metric units. No coordinate projection is applied. Mesh extents still cannot establish the regulatory road-edge height datum.

## Calculation choices and limits

- Membership: footprint intersection area **> 1 m²**. Straddling buildings count fully for GFA and get a boundary flag and local fail status. Coverage is `union(footprints) ∩ plot`, including overlapping and concave footprints. Footprint API limitations remain relevant for courtyards/holes.
- GFA uses supplied floor plates where available; otherwise footprint × `ceil(height / 3.5)`. Any such estimate marks FAR estimated. Missing data is never replaced with zero. Plate GFA can be exact to the model while still being an estimated regulatory measurement.
- Height and floors compare unrounded values. A known height/floor exceedance remains a fail even if another building’s value is unknown; incomplete maxima are noted. Missing classified footprint geometry makes non-failing plot checks insufficient.
- Setback distance is segment-to-polygon distance, including crossings and plot-edge containment. Failure threshold is distance `< limit − 0.05 m`. Report selects the most negative clearance margin, not simply the shortest distance when edge limits differ.
- Riyadh requires street width and at least one classified road edge before a complete setback result. The first element of the ordered `roadEdges` array is front (`max(w/5, 3)`); other roads use `max(w/5, 2)`. One shared width is an explicit model simplification. Selecting edges in the right order is required; changing preset resets them.
- `riyadhApartmentRule` is a small optional controls flag to preserve the automatic 2 m / 3 m neighbour rule across unrelated custom edits. Entering a neighbour value disables that auto-rule. Unknown floor count leaves its neighbour limit unknown. `caveat` also persists so custom edits preserve provenance. Annex/basement classification and per-floor Riyadh coverage remain outside scope.
- Per-building colour combines local height, optional floors, setback and boundary checks. Global FAR/coverage are separate; parking is always insufficient and is excluded from local tint status. Missing height or edge limits may make a building grey. A boundary crossing is still flagged even with a zero road setback.
- Bands are illustrative per-edge strips clipped to the plot, using the largest applicable setback across buildings. Blue = road, grey = neighbour. Their flat Z is the lowest known building base + 0.05 m; no terrain draping/datum claim. Unknown base prevents a reliably located status/height mesh and produces a visible notice. Render rejection cleans partial meshes and reports overlay failure separately from numeric results.
- Multiple site limits produce an actionable error; disjoint parcel selection is not implemented by guessing the largest polygon. Root changes during acquisition produce a retry error. Refresh is manual after proposal/model changes.
- Source notes and control persistence are per proposal. Plot-coordinate changes clear edge indices. No localStorage access failure prevents in-session calculations. CSV exports the same measured values/limits/margins, source links, caveats, input controls, ordered road edges and proposal id.

## Preset provenance

Values and URLs were copied from `~/Projects/compass-brain/research/oss/zoning-rules-dubai-riyadh-2026-09-20.md`, as requested. DDA FAR values are the research’s rounded derived ratios; side-specific and podium controls are not expanded beyond the specified approximation. Dubai master-developer and Riyadh special-authority presets contain no numeric limits.

An attempted web re-open did not independently revalidate the authorities: DDA was inaccessible to the browsing tool; DBC and MOMAH PDFs exceeded its content-size limit. The app preserves the supplied links and research caveats and makes no claim of fresh regulatory verification. Custom without a source remains user-entered controls.

## Local verification

- `npm install` with package-lock disabled: dependencies installed; zero audit vulnerabilities. polygon-clipping 0.15.7 is MIT. No animation dependency added.
- `npm run typecheck` and `npm run build`: pass. Final JS gzip sum is **36,425 bytes (36.43 kB)** across all four chunks, including SDK and polygon-clipping, versus 16,736 bytes for the pre-change v1 build (**+19,689 bytes**). CSS gzip is **2,313 bytes**; the JS limit is 120 kB.
- `node scripts/check-geometry.mjs`: **77 assertions passed**, covering area/winding/translation/holes/concavity; union/intersection; point/segment distances; crossing/containment; setback tolerance and bands; triangulation; membership threshold; GFA and coverage; missing data; Dubai/Riyadh controls; per-building status; source notes; proposal-isolated persistence; CSV escaping; and synthetic SDK acquisition/overlay cleanup. Script deleted after verification, per spec; no test framework installed. These are local contract tests, not live Forma validation.
- Chromium: all five states at 440 and 240 px; no horizontal overflow; editing → Custom with source preservation; refresh persistence; preset overwrite; Dubai height rule; Riyadh street formula and front-edge selection; CSV download; building disclosure; keyboard `:focus-visible` 3 px; reduced-motion computed durations ≤0.01 ms; stable control position during refresh. Loading state’s selector remains clickable and returns to Ready.
- Screenshots: ten state/width combinations plus expanded Buildings; paths listed in README. Screenshots use synthetic data exclusively.
- Port 5173 already had a Vite process whose cwd is this repository and which served the changed source. A second `npm run dev` correctly failed under strictPort; `curl` returned 200 from the existing server. That user process was reused and not stopped. No persistent dev server is provisioned or promised by this task.
- Motion: CSS only, 0 kB dependency increase; 160 ms card colour/margin, 180 ms height/opacity disclosure, 120 ms results opacity, 0.01 ms under reduced motion. Light theme, supplied tokens, no shadows or third-party markup. No icon font or inline icons were needed.


## v2.1 — dstools restyle and P2 (2026-09-21)

- Replaced atomatiq tokens with the supplied dstools palette, radii, clipped header/card corners and easing. Google Fonts loads Inter 400/500/600 and JetBrains Mono 400/500 with swap and Latin/Cyrillic subsets. The approved grid and breakpoints remain in place.
- Plain 600-weight title and mono eyebrow are applied by the allowed controls renderer because the shell template in `src/ui/app.ts` is outside the permitted edit list. Numeric spans keep numbers in mixed prose in mono; native preset selects use mono too.
- Shared en-US number formatter supplies results, controls, edge measurements and CSV metadata. Decimal inputs use text + decimal input mode to normalise typed commas; a native numeric validation probe preserves min/max/step checks. CSV retains semicolons and dot decimals.
- Missing limits use neutral cards, actionable Parcel controls text and hidden margin bars. Missing geometry has a dashed 1 px bottom border and explanatory note. Fail/pass cards use 3 px red/green left rules; fail values/bars are red, pass values are text-coloured and bars blue.
- `npm run typecheck && npm run build`: passed. Default gzip (Node zlib, matching Vite): JS **37,021 bytes** across all four chunks, **+596 bytes** from v2; CSS **2,638 bytes**, **+325 bytes**. JS + CSS **39,659 bytes**, well below 120 kB. External Google Fonts transfers are separate. No new dependencies; motion dependency increase **0 kB**.
- Existing dev server on 5173 reused without restart; fixture HTTP **200**. Chromium checks passed at 440 and 240 px: no horizontal overflow, visible numerals in mono, dot input values, comma input normalisation, coverage maximum and integer-floor validation, all four missing-limit cards, missing-geometry dashed border, CSV formatting, 3 px keyboard focus and reduced-motion durations at 0.01 ms. Fonts loaded successfully. Observed fixture CLS was **0** with browser-cached fonts; Refresh preserved controls position. Cold-network font-swap CLS was not measured.
- Regenerated and visually inspected `docs/screens/ready-440.png`, `docs/screens/ready-240.png`, `docs/screens/no-site-limit-440.png`, `docs/screens/error-440.png`, and `docs/screens/buildings-440.png`. Synthetic error state emits its expected console error.
- Verification uses synthetic fixtures, not a live Forma project. No SDK, calculation, preset or dependency changes; no commits.

## v2.2: proposal counting, refresh and mini panel (2026-09-21)

This section supersedes the earlier manual-refresh and all-building counting descriptions.
No live Forma session is available to this executor. The owner-supplied live discriminator facts below supersede the earlier evidence gap; other host behaviour remains **unverified**.

### Building discriminator — live Forma evidence (2026-09-21)

Owner-supplied real debug dump: Forma SDK **0.96.0**, project **pro_s3dzdga45o**. These observations replace the earlier URN source-system guess; they were not independently captured by this executor. `<pro>`, `<proposalId>`, `<rev>`, `<key>`, `<hash>` and `<uuid>` below preserve the supplied identifier patterns.

- Root element: urn `urn:adsk-forma-elements:proposal:<pro>:<proposalId>:<rev>`, `properties.category = "proposal"`, `properties.flags = { "82695dd5-a790-47e5-a1b1-9dacf7ff4dfa": { base: true, scenario: true, fixed: true, lock: true } }`.
- All **49 existing (Overture) buildings**: path `root/82695dd5-a790-47e5-a1b1-9dacf7ff4dfa/<key>`, parentUrn `urn:adsk-forma-elements:group:<pro>:base:<rev>`, parentCategory `"group"`, element urn `urn:adsk-forma-elements:basic:<pro>:<hash>+<uuid>:<rev>`. Properties keys: `geometry_hash`, `category` (`"building"`), `name` (`"Building #N"`), `elevationDefinition` (MAGL or MASL), `heightDefinition` (MAGL). No `integrate` / `overture` substrings anywhere.
- Proposal-authored element (site limit): path `root/837e3dd`, directly under root, urn `urn:adsk-forma-elements:basic:<pro>:<proposalId>+<hash>:<rev>`, properties `{category: "site_limit", name: "Site limit", color}`. This is evidence of authored ancestry, not a live authored-building sample.

A building is **existing** if any ancestor path segment key is flagged `base: true` in `root.properties.flags`, or any ancestor element urn matches `/:group:[^:]+:base:/`. Otherwise it is **proposal**. The building's own URN is not a discriminator. Ancestors resolve through child keys in the fetched root tree; missing group elements are fetched by URN and cached (including in-flight requests) per load. Bundled elements are reused. Unresolvable ancestry produces a load error instead of guessing.

The discriminator runs before footprint processing; unavailable excluded-existing footprints do not invalidate proposal-only GFA. Unavailable proposal footprints still mark totals incomplete. Readable existing buildings remain in the snapshot and CSV. Debug output uses the same classifier. Synthetic existing fixtures now use a flagged base-group tree and a `basic` building URN; the no-buildings fixture with `existing=1` retains existing buildings for the all-existing plot case.

### Refresh and synchronisation

`dist/internal/proposal.d.ts:299` declares `proposal.subscribe(callback, { debouncedPersistedOnly })`, returning `Promise<{ unsubscribe }>`, with callback payload `{ rootUrn }`.
It is deprecated in favour of `udm.subscribe`; this implementation retains the existing proposal API consistently with v2.1.
Persisted changes receive an additional 600 ms debounce.
Hidden views defer updates until visible; pagehide removes subscriptions and timers.
If subscription setup rejects, a 4-second poll hashes sorted site-limit paths, building paths, counts, proposal id and root revision.
Including the root revision covers persisted geometry edits with unchanged paths.
Polling pauses while hidden; changes without a revision or path change remain undetectable by the fallback.
Manual Refresh remains available.

`src/sync.ts` sends `{ proposalId, computedAt, results, controls }` through `BroadcastChannel("zoning-check")`, falling back to `localStorage` and its `storage` event.
`results` contains `{ state, data, report, message }`; the data retains the root revision and excluded building geometry for subsequent control edits.
Incoming reports require the active proposal/root and a newer timestamp.
Recipients render the supplied report without invoking `checkSite`, persist controls, and do not rebroadcast.
A newly opened view requests the active snapshot from an existing peer before its first calculation.
The fallback storage message is removed immediately after sending; full geometry is not retained as a durable cache.
When both transports are unavailable, individual views remain usable but cannot synchronise.
Concurrent model-change notifications can still start reads in both views; accepting a peer result invalidates an unfinished local read.

The calculating view owns the meshes; recipients clear their own overlays to avoid stacking translucent copies.
Closing that view removes its overlays until another calculation.
SDK cleanup isolation, event delivery, background iframe visibility, origin/storage partitioning and floating-panel opening remain unverified in Forma.
Excluded context tint uses RGB `107,114,128`, alpha `38/255` (0.149, the 8-bit approximation to 0.15).
Live alpha blending and mesh placement remain unverified.

### UI, CSV and assets

The mini panel activates below 300 px with the specified icon buttons, four score rows, context line and timestamp.
Controls remain in the full panel.
The context line truncates with a full-text tooltip; fixed score-row allocation prevents loading/result reflow.
An all-existing plot keeps the excluded count visible and gives an action to add proposal geometry or include existing buildings.
Full-panel cards have one missing-limit action line and no duplicate note.
Plot areas over 50,000 m² display the parcel-boundary hint.
CSV keeps the nine-column header, BOM, semicolon delimiter, quoting and text formula guard; numeric values, limits and signed margins use dot decimals without grouping.
Sections are Checks, Buildings, Controls and Metadata, with plot coordinates last.

`assets/icon.svg` and `assets/icon-mono.svg` are original SVG paths.
System `rsvg-convert` produced RGBA `icon-256.png` and `icon-512.png`; no npm dependency was added.
The presentation description has 190 characters; the installed-extension text has 104 characters.
Motion remains CSS-only: mini fade 120 ms and bar width 160 ms, reduced to 0.01 ms under `prefers-reduced-motion`.
Motion dependencies add **0 KB**.

### Verification output

The running repository server on port 5173 was reused without restart.

```text
$ npm run typecheck && npm run build
> forma-zoning-check@2.0.0 typecheck
> tsc --noEmit
> forma-zoning-check@2.0.0 build
> tsc --noEmit && vite build
vite v7.3.6 building client environment for production...
✓ 64 modules transformed.
dist/assets/icon-BLqHIg4b.svg    0.36 kB │ gzip:  0.22 kB
dist/index.html                  0.85 kB │ gzip:  0.44 kB
dist/assets/index-dZ2UvKCT.css  11.23 kB │ gzip:  3.16 kB
dist/assets/render-CqTX2fmV.js   2.21 kB │ gzip:  1.12 kB
dist/assets/forma-CNgoGg90.js    4.62 kB │ gzip:  2.00 kB
dist/assets/auto-DEyLCGOg.js    44.31 kB │ gzip: 13.80 kB
dist/assets/index-d6RP3oKv.js   69.27 kB │ gzip: 23.47 kB
✓ built in 162ms

$ curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/?fixture=1'
200

$ node scripts/check-geometry.mjs
Zoning Check: first counted building property keys [ 'name' ]
Zoning Check: subscription unavailable; polling paths every 4 seconds Synthetic unsupported subscription
114 assertions passed: geometry, proposal/existing filtering, SDK adapter, overlays, CSV order/numerics, sync shape, persistence, debounce and polling.
```

The synthetic unsupported-subscription warning is intentional and exercises polling fallback.
The temporary script was deleted after passing, as required.
`package.json` is outside the allowed edit set; its package version remains 2.0.0, while exported report metadata identifies v2.2.
Exact gzip totals from Node zlib are JS **40,388 bytes**, CSS **3,161 bytes**, JS + CSS **43,549 bytes**; increase over v2.1 is **3,890 bytes**.
Including emitted HTML and SVG gives **44,216 bytes**, below 120 KB.
External font transfers and separately uploaded PNGs are not part of that bundle total.

Chromium verification passed:

- Two same-origin views synchronise inclusion controls and measured values with both BroadcastChannel and disabled-BroadcastChannel storage fallback.
- A deliberately supplied FAR of 123 displays unchanged in the receiving view, demonstrating rendering without recomputation; Refresh restores the fixture value.
- Stale messages and messages from another proposal do not replace the report.
- Mini states ready, loading, no-site-limit, no-buildings and error render without horizontal overflow; full/mini are checked at 440/240 px.
- The ready and refreshing mini reserve 160 px for score rows; full-panel control position remains unchanged on Refresh.
- Initial context-line wrapping produced fixture CLS 0.00782; after fixing line allocation, a fresh-context measurement reports **CLS 0**. Cold-network font behaviour in Forma remains unverified.
- Keyboard focus has a visible 3 px outline. Score transitions and skeleton animation are at most 0.01 ms with reduced motion.
- Relative time changes from `Updated 0 s ago` to `Updated 9 s ago` at the next 10-second timer tick.
- Missing-limit cards show one status and one action line; duplicate notes are hidden. The large-plot hint is verified with a synthetic 60,000 m² plot.
- CSV download succeeds as `zoning-check-fixture-al-jadaf-20260921.csv`; section order, numeric cells, signed margins, excluded rows and formula guarding pass the script assertions.

Screenshots were visually inspected:

- `docs/screens/mini-ready-240.png`
- `docs/screens/mini-empty-240.png`
- `docs/screens/ready-440.png`
- `docs/screens/icon-preview.png`

No commits, directory rename, HTTP data API or new runtime dependency are introduced.

### Live-discriminator correction — local verification (2026-09-21)

- `npm run typecheck` and `npm run build`: passed.
- Throwaway `.check-classifier.mjs`: **18 assertions passed** for root base flags, base-group URNs, nested groups under base, proposal ancestry, ignoring the building's own key/source substrings, concurrent group-fetch caching, reuse of bundled groups, unresolved ancestry and synthetic base-group fixtures. Script deleted after verification; no test framework or dependency added.
- Exact Node zlib gzip totals: JS **41,535 bytes**, CSS **3,161 bytes**, combined **44,696 bytes**. No CSS or motion changes.
- Still pending: the requested `no-buildings-on-plot` state and exact excluded-count line in floating/mini require `src/main.ts`, `src/ui/app.ts` and `src/ui/mini.ts`, outside the three-file edit allowance. No UI workaround was inserted into the SDK adapter. Live host execution of the corrected classifier has not been repeated by this executor.


## Forma-native proposal geometry — 2026-09-21

This section supersedes the earlier single-ring footprint limitations and the behaviour that skipped unreadable buildings. Verification below is synthetic; live verification belongs to the owner.

LIVE FACTS (SDK 0.96.0; supplied by owner, verbatim):
- Buildings drawn in Forma: path `root/04d96ff8`, urn `urn:adsk-forma-elements:basicbuilding:<pro>:<id>:<rev>`, properties = {category:"building"} only, parent = proposal root. Two such buildings on the plot.
- Result today: the panel says "Some building footprints are unavailable. Plot membership and totals are incomplete" and counts 0 proposal buildings, i.e. the current footprint call fails or returns nothing for `basicbuilding` elements while it works for Overture `basic` buildings.

### SDK declarations and provider order

Read the installed 0.96.0 `dist/internal/elements.d.ts`, `geometry.d.ts`, `representations.d.ts`, and the relevant `forma-elements/dist/forma-element-schema.generated.d.ts` declarations (element children, transforms, representations, graph levels/spaces/surfaces, GFA polygons and 2.5D volumes). Searched declarations for `floorStack`, `getFloors`, `floors` and `basicbuilding`.

- `FloorStackApi` declares only `createFromFloors` and `createFromFloorsBatch`. There is no declared floor-stack reader or `getFloors`, and no declared `basicbuilding`-specific read API. No creation, private API or guessed property reader is used.
- The supported read-side substitute is `elements.representations.graphBuilding({urn})`, resolved from the element at the building path. Its ordered `levels` have `height`, `points`, `spaces` (outer and inner loops) and `surfaces`. The provider reconstructs and unions spaces on each level, sums floor areas, unions all level polygons for the footprint, counts levels exactly, and sums level heights for the top of the last floor. `getWorldTransform({path})` positions the polygons and transforms height/base; invalid or tilted transforms are rejected. Tests also cover translated, rotated and scaled transforms.
- If graph data is unavailable or invalid, the existing declared `grossFloorAreaPolygons({urn})` reader supplies exact plate GFA and a floor count from distinct elevations. It does **not** declare floor heights, so it cannot establish the last-floor top by itself: height remains unknown unless triangles or the existing explicitly unverified `properties.height` fallback supply it. The code does not invent a final storey height.
- For `basicbuilding`, selection order is floor representations → union of direct child-path footprints → XY union of all mesh triangles. The old direct `getFootprint` call is still made first for its diagnostic result; its footprint is used only as a final native fallback. For `basic`/Overture, a readable direct footprint remains preferred after any available floor representation.
- `getFootprint` explicitly does not traverse children; `getTriangles` explicitly does. Child paths use child **keys**, not URN fragments. An incomplete child union is rejected rather than presented as the whole building. Nested category-building paths beneath another building are not counted as additional buildings.
- Triangle projection unions all non-degenerate XY triangles through the existing `polygon-clipping` dependency, in batches of 256 polygons. Vertical faces contribute no XY area. Height is `zMax - zMin`; floors are `ceil(height / 3.5)`, marked estimated. No convex hull or bounding rectangle substitutes for the union.

Successful buildings have `geometrySource: "floorstack" | "footprint" | "children" | "triangles"`. A building with no usable footprint has `geometrySource: null` (no successful source), the actual error text, and local status `insufficient`. It remains in N, with membership explicitly unknown, and makes included plot totals incomplete. Known off-plot buildings are still excluded. Existing-building inclusion controls retain their meaning.

### Diagnostics, calculations and presentation

The downloadable debug JSON now includes **every** category-building path, not just the first/last five. Each building includes its children (key, URN, complete path, category or fetch error), exact rejected error text, raw return shape (including `undefined`), accepted result shapes for the attempted alternatives, and triangle vertex count / Z minimum / Z maximum when a mesh is returned. Load-time attempts are reused for the same root revision; uncached buildings are inspected separately. A method failure is captured per attempt so it does not suppress the remaining building dump. The root is rechecked before returning debug data.

The full multipolygon, including holes and disconnected parts, is retained for membership, GFA estimates, coverage union, setbacks, UI area and CSV area. The legacy single ring remains only for compatibility with the unchanged shared renderers. `src/main.ts` adapts building values and estimate pills after rendering; `geometryCsv` corrects the shared serializer's legacy footprint cells without changing its nine-column format, BOM, quoting or formula guard. Source appears in building values and each building metric's CSV Note. Only estimated floor counts produce `est.` in the results pills; regulatory measurement caveats remain in the existing explanatory copy.

Missing geometry displays a dash, never a zero footprint, and its actual error is visible in the Buildings list and CSV. The 3D renderer handles disconnected simple polygons separately. For a polygon with holes it omits that polygon's illustrative extrusion with an explicit warning, preserving the courtyard in all numeric calculations; the existing simple-ring triangulator cannot render holes. This is a rendering limitation, not a geometry-provider failure.

Fixture adds a synthetic `basicbuilding` with three graph levels of 3, 4 and 2.5 m, floor areas 120, 80 and 48 m²: exact **3 floors**, **GFA 248 m²**, **footprint 120 m²**, **height 9.5 m**. Its synthetic element has only `category: "building"` in properties, with the graph in representations. This does not claim live native buildings expose that graph.

Движение: existing CSS transitions and disclosure only; no new signature, background effect, library or interaction animation. Existing reduced-motion behaviour retained; motion dependency addition **0 bytes**.

### Verification and remaining work

- `npm run typecheck`: passed.
- `npm run build`: passed; 64 modules transformed.
- Throwaway `.check-native.mjs`: **106 assertions passed**, then script deleted. Covered graph floor stacks, varying heights and floor areas, transforms, invalid graphs/transforms, GFA representation without height, direct/basic footprint compatibility, complete and partial child unions, triangle fallbacks, batched union, overlap/disconnected geometry/holes, all-method failure, exact errors, retained N, complete debug path coverage, CSV missing/multipart areas and formula guarding, fixture data, and overlay behaviour.
- Every supported source worked under its corresponding synthetic setup: `floorstack` (graph and GFA representation), `footprint` (basic/direct), `children`, and `triangles`. These assertions establish adapter behaviour only; **which source works for the owner's two live basicbuilding elements is still unverified**.
- Browser: 440 px full / 240 px mini have no horizontal overflow. The fixture lists four proposal buildings including the new exact stack. Downloaded CSV contains source `floorstack`, floors 3 with Estimated=false, GFA 248 with Estimated=false, footprint 120 and height 9.5. Isolated exact-only UI has no `est.` pills; an injected missing-geometry report retains N=1, shows `Insufficient data`, dashes and the exact supplied error. Expanded disclosure matches content height (578 px). Keyboard focus is visible with a 3 px outline. Reduced-motion transition duration is 0.00001 s. Refresh leaves controls at the same Y coordinate; measured refresh CLS is 0.
- Exact Node zlib gzip sizes: JS **44,492 bytes**, CSS **3,161 bytes**, combined **47,653 bytes**; **+2,957 bytes** versus the previous recorded 44,696-byte combined build. Including emitted HTML and SVG: **48,322 bytes**. No runtime dependency was added.
- Remaining: owner must refresh the live Forma proposal and inspect/download the debug JSON to establish actual representation availability, coordinate placement and counts for the two native buildings. Hole-containing 3D extrusions remain omitted as described above. No live host verification is claimed.

Only `src/forma.ts`, `src/metrics.ts`, `src/render.ts`, `src/main.ts`, `src/fixture.ts` and `NOTES.md` are changed. No commits.

## v2.3 — preset files and results-first panels (2026-09-21)

### Interface and preset contract

The full panel presents proposal context, an always-visible action/status sentence, results and Buildings, collapsible Parcel controls, then source attribution and disclaimer.
Refresh is an icon button; Export CSV, Save preset, Load preset and Debug are in the overflow menu.
The mini panel uses the same status sentence and has no city prefix or repeated timestamp in its footer.
Ready status totals include floors and exclude parking; incomplete checks remain explicit.

Jurisdiction comes from the selected or imported preset, with a muted Rules caption and source-grouped options.
Custom retains the current jurisdiction; direct field edits retain source attribution.
The caveat occupies one visual line with full text available in its title and accessible text.
Street width is visible only for Riyadh rules, and the DBC height checkbox only for Dubai rules.
The source link keeps the original URL and stored attribution; redundant city words are omitted from its visible caption.

A selected built-in preset collapses controls after successful proposal persistence; previously stored controls start collapsed.
Manual opening survives Refresh and subsequent field edits.
Initial restoration does not animate; explicit disclosure uses 180 ms with `var(--ease)` and 0.01 ms under reduced motion.
No signature effect or animation dependency is added.

`validControls` is shared by local storage and file validation.
The versioned envelope, optional display label, numeric guards and source precedence are documented in [docs/preset-schema.md](docs/preset-schema.md).
Import clears road indices, which have no identity across plots, and displays an instruction to classify roads on the target plot.
An invalid file leaves current controls intact and displays one error sentence.
The built-in JSON files and README preset table are generated directly from `rules.ts` with throwaway Node commands; no build dependency or permanent generator is added.
CSV includes the imported preset label and product version v2.3.

### Host surfaces and evidence boundaries

Embedded mode sets `data-host="forma"`; standalone mode sets `data-host="standalone"`.
The body and app root are transparent in host mode, with 12 px root padding and no outer border or radius.
Cards retain the opaque `--surface` background, including cards whose limits are absent.
The standalone `?fixture=1&host=forma` test draws a dark checkerboard behind the transparent content without initiating an SDK connection.
The checkerboard is a transparency diagnostic, not a dark theme.

The existing `live-forma-floating.png` and `live-forma-mini.png` were present as untracked files at task start and were not modified.
They are owner-supplied screenshots of the previous interface, now identified as such in README.
The floating image shows two proposal buildings, 49 excluded existing buildings, both panel placements and visible tint; it does not establish measurement accuracy or overlay alignment.
The earlier mini image records the native-geometry failure.
The available browser connection contains only a blank tab; there is no authenticated Forma session for a fresh live verification.

### Verification output

```text
$ npm run typecheck && npm run build

> forma-zoning-check@2.0.0 typecheck
> tsc --noEmit

> forma-zoning-check@2.0.0 build
> tsc --noEmit && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 64 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/icon-BLqHIg4b.svg    0.36 kB │ gzip:  0.22 kB
dist/index.html                  0.85 kB │ gzip:  0.44 kB
dist/assets/index-B0qK_sGd.css  12.18 kB │ gzip:  3.37 kB
dist/assets/render-C9eqwkp_.js   2.50 kB │ gzip:  1.18 kB
dist/assets/forma-C4RcREvR.js   11.23 kB │ gzip:  4.35 kB
dist/assets/auto-DEyLCGOg.js    44.31 kB │ gzip: 13.80 kB
dist/assets/index-B9FnyI1p.js   79.78 kB │ gzip: 26.59 kB
✓ built in 225ms

$ curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/?fixture=1'
200

$ node --input-type=module  # throwaway rules/file assertions, stdin
99 assertions passed: 9 preset files identical to rules.ts; validation, import/export round trips, provenance, road reset and storage guards.

$ node /tmp/zc-v23-browser.mjs  # throwaway, removed after verification
68 browser assertions passed; refresh CLS 0; screenshots regenerated.

$ node --input-type=module  # targeted CSV and mini-host assertions, stdin
4 targeted assertions passed: imported preset label and v2.3 in CSV; mini host transparency and status.
```

Exact Node zlib gzip totals are JS **45,927 bytes**, CSS **3,366 bytes**, combined **49,293 bytes**.
Compared with the previous recorded 47,653-byte build, the combined increase is **1,640 bytes** (JS +1,435; CSS +205).
No runtime dependencies are added; animation dependency increase is **0 bytes**.
The package version remains 2.0.0 because `package.json` is outside the allowed edit list.

Browser checks use local Chrome through cached Playwright, without a project dependency installation.
They cover all five app states at 440 and 240 px, no horizontal overflow, preset groups, conditional fields, Custom jurisdiction retention, saved collapse state, both Load/Save entry points, file validation, escaped file content, unsafe source-link rejection, CSV, Include existing in both views, keyboard focus and Escape.
All presets have no visible city words outside the preset selector and Rules caption.
Computed host body/root backgrounds are `rgba(0, 0, 0, 0)`; root border/radius are `0px`, padding is `12px`, and all result-card surfaces are `rgb(249, 250, 251)`.
The controls transition computes to `0.18s` normally and `0.00001s` under reduced motion.
Refresh preserves the controls' document position, with observed CLS **0**; cold-network font-swap CLS is not measured.
`git diff --check` passes.

Regenerated and visually reviewed: `ready-440.png`, `mini-ready-240.png`, `no-site-limit-440.png`, `controls-collapsed-440.png`, `overflow-menu-440.png`.
The existing server on port 5173 was reused without a restart.
Changes remain uncommitted on `main`, within the permitted files.

Remaining live checks: v2.3 transparency and interactions in both Forma panel placements, live Debug/download behaviour, and previously unverified geometry accuracy and overlay alignment/cleanup.
The README installation form and Buttons configuration are documented but were not re-entered into a live extension registration in this task.

## v3 — native Forma UI and permitted envelope (2026-09-21)

Implemented on `main`, without commits or restarting the existing server on 5173. No package or lockfile changes, new runtime packages, or motion dependencies. This section supersedes the earlier panel palette, typography, preset schema and temporary-render-only descriptions.

### Native UI and fallback

`index.html` loads the supplied Forma v2 base stylesheet and seven Weave modules: button, input, dropdown/select, checkbox, tooltip, accordion and progress-bar. The select module itself registers `weave-select-option`; there is no separate option-module request. Paths and component event contracts were checked against the live official modules and the official Pathmaker example. `CustomEvent.detail.value` / `.checked` drive controls. Weave buttons use the `disabled` attribute (the CDN button has no `.disabled` property setter).

The local token names map to the supplied DS variables and fallback values. Artifakt Element replaces both previous fonts; numerals use tabular figures. Google Fonts and cut-corner styling are removed. There are no `rem` declarations in local CSS; the root is explicitly 10 px, also in fallback mode. A failed stylesheet or missing imported color variables selects local fallback tokens. `window.zoningDebug.designSystem` records `cdn` or `fallback`; `.components` separately records module availability. The real Debug download includes this object. When all component scripts are unavailable, numeric fixture results remain readable and a reconnect/refresh message is shown; fully offline editable Weave controls are not bundled locally.

CDN limitation: the inspected `weave-select` enumerates only direct child options. Wrapping options in native `optgroup` makes them unselectable. The implementation therefore uses `optgroup` market headings followed by flat `weave-select-option` siblings. This preserves the seven visible market groups and Weave keyboard selection, but does not provide native nested-optgroup accessibility semantics. No replacement select library was introduced.

The supplied accordion defaults to 500 ms and removes its own focus outline. The adapter styles its open shadow root, uses a measured 180 ms content-height transition, and supplies a visible focus outline. Reduced-motion rules also enter the component shadow roots, including the progress bar. Envelope opacity is 160 ms with the same easing as `--ease`; reduced motion uses 0.01 ms. Other retained zoning result/card transitions remain unchanged. Icon buttons have Weave tooltips; result cards, score rows and building data remain local markup.

### Envelope calculation and limitations

`src/envelope.ts` subtracts one exclusion zone per edge from the plot using the existing polygon-clipping package, preserving multipart output. A zone is the strip within the edge's setback of its segment plus round end caps, so concave parcels keep their full usable inset. The caps are circumscribed 16-gons: the approximation can only widen a setback, never shrink it. Empty results return zero volume with a warning. Coverage leaves the footprint unchanged and reports the required area reduction; the displayed volume must not be mistaken for a coverage-compliant building shape.

The three rule forms are shared with existing-building setback verdicts through `requiredSetback`. Road/Neighbour/Other are selectable per edge. Serbia's north side uses Neighbour (1.5 m), south side uses Other (2.5 m); Madrid's rear uses Other. Required classifications are explained in the panel. Unknown setbacks or missing street width produce an unavailable envelope instead of substituting zero.

Height uses `heightLimit`, then whole storeys at editable `floorHeightM` (default 3.5 m). A floors-only preset supplies an assumed height cap from floors × floor height. With neither height nor floors set (including the unedited WA orientation preset), the user must enter a cap; no legal height is inferred from GRZ/GFZ. Re-inset/re-cap runs at most five iterations, requiring area change below 0.1 m² and stable resulting height. Discrete oscillation is reported and falls back to the conservative footprint at the original height cap. FAR, height and floors ties list all binding constraints.

A supplied building-area polygon enables bouwvlak intersection instead of insetting. Files preserve the polygon; `loadSite` also recognizes one second site limit named `bouwvlak` (case-insensitive), while still rejecting multiple parcel limits or multiple bouwvlakken. Coordinates must be in the same local metric frame as the parcel. The example's 18 m road-axis distance, 5 m side/rear distance, 5.5 m eaves and 10 m overall height are preserved. **Road-axis, eaves and additional setback compliance are not established by bouwvlak intersection**: the panel and CSV explicitly require their separate verification. No road axis or roof/eaves geometry is supplied by this specification. Madrid's 10.5 m cornice cap is explicitly an approximate massing height, not a tested roof/access-façade datum.

Parcel-only proposals can calculate and export an envelope without authored buildings. The fixture's isometric SVG previews the calculated volume and is labelled synthetic; it is not an SDK rendering test.

### Rendering and saving — declarations versus live behaviour

Installed SDK: `forma-embedded-view-sdk` 0.96.0. Read `dist/internal/integrate.d.ts`, `library.d.ts`, `scene/render.d.ts`, and `scene/terrain.d.ts` in addition to the declarations already listed above.

- Temporary envelope: `Forma.render.addMesh` and `updateMesh`, accent RGBA with volume alpha 64/255, plus a thin top-outline mesh. Generation cancellation and serialized cleanup are retained. Opacity interpolation uses no library. Placement uses parcel triangle elevation when available; otherwise `Forma.terrain.getElevationAt({ x, y })` at the first parcel vertex, with a flat-reference/datum warning. If those are unavailable, the renderer uses the lowest known building base with a warning, or omits the envelope overlay if no elevation is known.
- **Saving is available in the declarations.** `Forma.integrateElements.createElementHierarchy({ data: { rootElement, elements } })` accepts `properties.geometry = { type: "Inline", format: "Mesh", verts, faces, doubleSided }`. The returned `urn` is passed to `Forma.library.createItem({ data: { name, status: "success", urn } })`. The button checks `Forma.getCanEdit()` and the active proposal. It saves an estimated generic mesh local to its first footprint vertex and base zero for subsequent user placement from the library; it does not insert a proposal building. The hierarchy method is deprecated but remains explicitly typed for inline meshes in 0.96.0; no GLB encoder/dependency was added.
- If library creation rejects after element creation, an in-session retry reuses that element URN. Closing the extension before retry can leave an unlisted integrate element; the SDK path is not transactional. Saving does not encode separate coverage shrinkage, roof geometry or legal compliance in the mesh.
- **Unverified in a live Forma project:** iframe CDN/CSP/font loading, real Weave interaction in both panel placements, terrain/mesh elevation-frame alignment, alpha blending, animation timing over SDK messaging, cleanup across panel lifetimes, named bouwvlak acquisition, edit permission, element ingestion and library persistence/placement. No live SDK write was made during this task. Synthetic save tests check call shape, permission rejection and retry behaviour only.

### Presets and report

All thirteen JSON files use `forma-zoning-check/preset@2`. The nine existing presets retain their values and URLs. Four new presets copy the supplied European research table's numeric values, primary URLs and caveat sentences; WA also retains the second Berlin clearance-source URL and exposes it as a separate source link. No independent legal revalidation is claimed. Both `@1` and `@2` import; `@1` gains the default floor height, and equivalent built-in controls retain their preset id. File-import edge classifications reset because the file has no parcel identity.

CSV order is Checks → Envelope → Buildings → Controls → Metadata. Envelope rows include buildable area, permitted storeys, height, permitted GFA, binding and warnings. Every check row has a Source cell containing the preset URL (both URLs for the WA preset). Existing BOM, escaping, formula protection, numeric formatting and building boundary fields remain. Additional rule forms, polygon and source/control metadata are exported.

### Verification output

```text
$ npm run typecheck && npm run build

> forma-zoning-check@2.0.0 typecheck
> tsc --noEmit

> forma-zoning-check@2.0.0 build
> tsc --noEmit && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 65 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/icon-BLqHIg4b.svg    0.36 kB │ gzip:  0.22 kB
dist/index.html                  2.14 kB │ gzip:  0.69 kB
dist/assets/index-BSkdPrin.css  15.46 kB │ gzip:  3.98 kB
dist/assets/render-0HSOjSRL.js   5.58 kB │ gzip:  2.52 kB
dist/assets/forma-Cgde9vAm.js   11.93 kB │ gzip:  4.61 kB
dist/assets/auto-DEyLCGOg.js    44.31 kB │ gzip: 13.80 kB
dist/assets/index-DVKvoYWE.js   96.21 kB │ gzip: 32.10 kB
✓ built in 186ms

$ curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/?fixture=1'
200

$ node scripts/check-envelope.mjs
131 assertions passed: per-edge inset, empty inset, Berlin/Madrid/Riyadh convergence, nonconvergence, FAR/height/floors, coverage, bouwvlak, shared verdicts, presets @1 → @2, mesh and CSV.
```

The throwaway script was deleted after passing. It also checked all thirteen preset files against rules.ts, built-in identity after import, malformed controls, winding/translated coordinates, tie constraints, and synthetic library retry/permission failures.

Exact gzip: JS **53,031 bytes**, CSS **3,984 bytes**, combined **57,015 bytes**. Increase from the recorded v2.3 build is **7,722 bytes**. Motion dependencies: **0 bytes**. CDN Weave modules and Artifakt font transfers are external to these Vite bundle totals.

Chromium: **23 browser assertions passed** for CDN detection, seven visible market groups, Weave numeric/checkbox events, custom editing, three-way edge classification, coverage validation, accordion collapse, envelope fade, reduced motion, focus, 440/240 px overflow, all five app states, and envelope availability on an empty plot. Additional targeted checks blocked CDN styles and confirmed debug `fallback`, card background `rgb(245, 245, 245)` and text `rgb(60, 60, 60)`. Normal mode recorded `cdn`, Artifakt Element and 10 px root size. Controls measured 0.18 s normally, 0.00001 s under reduced motion; envelope opacity also measured 0.00001 s under reduced motion. Focus outline measured at least 2 px. Refresh retained the same controls position (1340.5078125 px) with observed CLS **0**; cold-network initial font loading was not measured. The synthetic error state intentionally logs an error.

Screenshots, visually inspected:

- `docs/screens/ready-440.png`
- `docs/screens/mini-ready-240.png`
- `docs/screens/envelope-440.png`
- `docs/screens/controls-weave-440.png`

The two new images are fixture evidence; no screenshot claims a live Forma envelope or library save. All changes remain uncommitted on `main`.

## v4: approved mockup implementation (2026-09-22)

The floating panel uses Results, Controls and Envelope tabs with proposal-specific local storage.
The mini panel contains the header, four metric rows and the counted/total building line.
The Results alert starts collapsed and supports keyboard activation.
The controls use native Weave inputs, grouped preset options, conditional reference badges and segmented edge classification.
The envelope checkbox starts checked, matching the mockup; unchecking hides its metrics/actions and requests overlay cleanup through the existing rendering path.
The former cards, building disclosure, source links, disclaimer, proposal name, ready-state summary and custom UI transitions are absent.
Source labels and URLs remain in CSV Source cells; full preset caveats and the disclaimer remain in CSV metadata/control rows.
Boundary and large-plot warnings are exported in the CSV warnings row, alongside captured terrain/render warnings.

The computation and fixture files have identical SHA-256 hashes to their state at the start of this task: `metrics.ts`, `envelope.ts`, `geometry.ts`, `rules.ts`, `forma.ts`, `sync.ts`, `render.ts` and `fixture.ts`.
Existing v3 working-tree edits remain intact.
Changes remain uncommitted on `main`; the existing dev server on port 5173 was not restarted.

### Render comparison

The real-app screenshots use fixture data, 440/240 CSS-pixel viewports and device scale factor 2.
The approved mockup PNGs were opened and compared visually with the real-app renders.
The header, tabs, metric rhythm, units, field widths, native components and action placement follow the mockup structure.
The following differences are deliberate or attributable to the unchanged fixture/browser:

- Results and mini show `4 of 4 buildings`; the unmodified fixture has no existing buildings by default, while the mockup has 49 excluded existing buildings.
- Coverage is 23.0%, height is 91.00 / 85.00 m and setbacks are 2.00 / 7.50 m in the actual fixture; the FAR and displayed margins coincide with the mockup.
- Results retains Floors and Parking as required by the spec; Floors adds a third issue and 88 px to the metric stack.
- Parking prompts for unit counts and a parking inventory; the current control schema has no editable parking limit.
- Controls uses the fixture's DDA 3261507 preset and its actual values; the mockup labels its illustrative custom values as DBC G+4.
- Metric labels use the explicitly specified DS 11-medium token; the mockup HTML inherits 12-regular for those labels.
- Preset-row vertical padding is 4 px under the explicit 4/8/16 spacing rule; the mockup uses 6 px, placing the subsequent fields 4 px lower.
- Native numeric inputs render decimal commas in the local Chrome environment; the input values and CSV retain decimal points.
- Envelope values match the mockup; Save envelope to library is disabled outside Forma with a tooltip explaining the required host.
- Presets with an Other edge rule retain the Other segment; DBC controls retain their conditional height-rule checkbox.
- Method tooltips describe actual fixture assumptions, including estimated floors; the mockup uses illustrative boundary/terrain caveats.

Screenshots: [Results](docs/screens/ready-440.png), [Controls](docs/screens/controls-440.png), [Envelope](docs/screens/envelope-440.png), [Mini](docs/screens/mini-ready-240.png).

### Verification output

```text
$ npm run typecheck && npm run build

> forma-zoning-check@2.0.0 typecheck
> tsc --noEmit

> forma-zoning-check@2.0.0 build
> tsc --noEmit && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 64 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/icon-BLqHIg4b.svg    0.36 kB │ gzip:  0.22 kB
dist/index.html                  2.68 kB │ gzip:  0.75 kB
dist/assets/index-D1yOpWjK.css   5.50 kB │ gzip:  1.76 kB
dist/assets/render-cbxfr8ib.js   5.58 kB │ gzip:  2.51 kB
dist/assets/forma-Di-7uCH5.js   11.93 kB │ gzip:  4.61 kB
dist/assets/auto-DEyLCGOg.js    44.31 kB │ gzip: 13.80 kB
dist/assets/index-CHwe231V.js   88.54 kB │ gzip: 29.79 kB
✓ built in 185ms

$ curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/?fixture=1'
200

$ grep -rniE 'compliance statement|MOMAH|Arabic|Proposal 1|massing check|Rule source' src/ | tee /dev/stderr | wc -l
5

$ node scripts/check-ui.mjs
110 assertions passed: tabs per proposal, link, all preset badges, copy, native controls, edge classification, counts, CSV, all states at 440/320/240 px, focus, motion, unchanged computation.
Refresh CLS: 0. Four real-app fixture screenshots regenerated.

$ git diff --check
(no output)
```

The broad grep is an unresolved contradiction in the spec: it matches the required CSV disclaimer, the source URL declaration and two preserved source/preset records in `rules.ts`, and the preserved proposal name in `fixture.ts`.
None of these default strings is rendered by the UI.
The browser checks verify the prohibited-copy pattern against the rendered panel for every built-in preset.
Changing those data or disguising literals solely to obtain a zero grep count would violate the preservation requirements.

The throwaway `scripts/check-ui.mjs` is deleted after verification.
Exact Node zlib totals are JS 50,726 bytes and CSS 1,762 bytes, combined 52,488 bytes gzip: 4,527 bytes smaller than the v3 baseline of 57,015 bytes.
No npm dependencies or lockfiles change; animation dependencies add 0 bytes.
CDN component and font transfers are external to these Vite bundle totals.

Browser verification covers tab persistence across reloads, refresh and distinct proposals; Set in Controls navigation; reference-badge eligibility; native numeric/checkbox changes; road/Other classification; counted/excluded totals; CSV metadata; collapsed/keyboard Issues; disabled fixture library saving; and envelope checkbox behavior.
Loading, error, no-site-limit, no-buildings-on-plot and ready states have no horizontal overflow at 440, 320 and 240 px.
Non-ready states provide an action or loading message.
Keyboard focus has a visible outline; application metric styles have zero transition duration and no animation under reduced motion.
Only the native DS tab, accordion and alert behavior remains in the UI; the CDN does not suppress all its native transitions under reduced motion, as documented by the approved mockup.
Refresh has observed CLS 0; cold-network initial font loading is not measured.

### Unverified host behavior

No authenticated Forma session is used.
Live iframe/CSP/font loading, tab storage across real proposal switches, cross-panel sync, automatic envelope placement/cleanup, terrain datum accuracy, edit permission and library persistence remain unverified.
The retained scene-renderer fade is unchanged; its timing over SDK messaging is not a browser-fixture result.
Saving a library item is disabled in the fixture and is not claimed as tested here.

The v4 task changes `index.html`, `src/main.ts`, `src/csv.ts`, `src/styles.css`, `src/ui/app.ts`, `src/ui/controls.ts`, `src/ui/results.ts`, `src/ui/mini.ts`, `src/ui/tokens.css`, this file and the four linked screenshots.
Other dirty files shown by Git belong to the pre-existing v3 work.
