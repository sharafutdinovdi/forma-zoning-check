The Zoning Check v4 mockup presents hardcoded review data in a 440 px floating panel and a 240 px mini view using the live [Forma Design System](https://app.autodeskforma.eu/design-system/v2/docs/).
From the repository root, run `python3 -m http.server 8000` and open [floating.html](http://localhost:8000/docs/mockups/v4/floating.html) or [mini.html](http://localhost:8000/docs/mockups/v4/mini.html); CDN access requires an internet connection.
Tabs, tooltips, fields, selectors, disclosures and the envelope visibility checkbox use native component behavior; edits do not recalculate the fixed figures, and action buttons do not call Forma or export files.
The alert requires a small initialization script for its fixed issue list and collapsed state.
The current CDN retains its 0.2 s tab and 0.5 s accordion transitions under `prefers-reduced-motion: reduce`; the mockup preserves these native behaviors and adds no animation code.
The figures are illustrative and do not establish regulatory compliance; the example [rule source](https://dmpmedia.dm.gov.ae/uploads/2021/12/Dubai%20Building%20Code_English_2021%20Edition_compressed.pdf) does not validate the custom limits.

## Design captures

These are design mockups with fixed illustrative data; the [main README](../../../README.md) contains live Forma captures.

| View | Capture |
| --- | --- |
| Results | [Floating panel](../../screens/mock-results-440.png) |
| Controls | [Floating panel](../../screens/mock-controls-440.png) |
| Envelope | [Floating panel](../../screens/mock-envelope-440.png) |
| Mini | [Analysis panel](../../screens/mock-mini-240.png) |
