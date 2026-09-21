# Preset file format

**Load preset…** accepts a JSON file with schema `forma-zoning-check/preset@1`.
**Save preset** downloads the current controls as `zoning-preset-<label-slug>.json`.
The files in [presets](../presets/) reproduce the built-in definitions in [src/rules.ts](../src/rules.ts).

```json
{
  "schema": "forma-zoning-check/preset@1",
  "label": "Project parcel A",
  "controls": {
    "jurisdiction": "dubai",
    "presetId": "custom",
    "maxFar": 4.5,
    "maxCoveragePct": 60,
    "maxHeightM": 45,
    "maxFloors": 12,
    "setbackNeighbourM": 4,
    "setbackRoadM": 7.5,
    "includeExisting": false,
    "roadEdges": []
  },
  "source": {
    "label": "Approved parcel controls",
    "url": ""
  },
  "notes": "Confirm limits against the current parcel document."
}
```

## Envelope

| Field | Required value |
| --- | --- |
| `schema` | Exact string `forma-zoning-check/preset@1`. |
| `label` | Non-empty string displayed in the preset selector. |
| `controls` | A `ParcelControls` object with the fields below. |
| `source` | Object with string `label` and `url`; empty strings are allowed. |
| `notes` | String; an empty string is allowed. |

The envelope's `source` and `notes` supply `controls.sourceLabel`, `controls.sourceUrl` and `controls.caveat` on import.
Only HTTPS source URLs become clickable links; other strings remain data.
Unknown schema versions and invalid controls produce a one-line error and leave the current controls intact.

## Controls

| Field | Validation and meaning |
| --- | --- |
| `jurisdiction` | Required: `dubai` or `riyadh`; selects the rule family and relevant fields. |
| `presetId` | Required string; a matching built-in retains its ID, otherwise the imported controls use `custom`. |
| `roadEdges` | Required array of non-negative safe integers; indices refer to ordered site-limit vertices. |
| `maxFar` | Optional finite non-negative number. |
| `maxCoveragePct` | Optional finite number from 0 to 100. |
| `maxHeightM` | Optional finite non-negative number in metres. |
| `maxFloors` | Optional non-negative safe integer, including the ground floor. |
| `setbackNeighbourM`, `setbackRoadM` | Optional finite non-negative numbers in metres. |
| `riyadhFrontStreetWidthM` | Optional finite non-negative number in metres. |
| `dubaiHeightRule` | Optional boolean for the DBC height cap of 6 × floor count. |
| `riyadhApartmentRule` | Optional boolean for the automatic apartment neighbour setback. |
| `includeExisting` | Optional boolean; absent means proposal buildings only. |
| `sourceUrl`, `sourceLabel`, `caveat` | Optional strings; the envelope takes precedence on import. |
| `presetLabel` | Optional string retained during local persistence; the envelope's label takes precedence on import. |

Absent numeric fields mean “not set”; `null`, numeric strings, negative values and non-finite numbers are rejected.
File loading and proposal storage use the same `validControls` guards.
Selecting Custom retains the current jurisdiction; manual field edits also retain source attribution.

Road-edge indices are exported but cleared on import: the file has no plot identity.
After loading, open **Parcel controls → Plot edges** and classify the roads on the target plot.
For Riyadh rules, select the front road first and enter the street width.

## Maintaining built-in files

After changing a built-in preset, run this command from the repository root with Node.js 22.18+ (native TypeScript stripping):

```sh
node --input-type=module <<'JS'
import { writeFileSync } from 'node:fs';
import { presets, createPresetFile } from './src/rules.ts';
for (const preset of presets) {
  writeFileSync(`presets/${preset.id}.json`, JSON.stringify(createPresetFile(preset.controls, preset.label), null, 2) + '\n');
}
JS
```

The same definitions supply the README's preset table; update that table when changing limits, source links or caveats.
