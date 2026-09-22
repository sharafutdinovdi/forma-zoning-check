# Security policy

Report vulnerabilities privately through the [repository advisory form](https://github.com/sharafutdinovdi/forma-zoning-check/security/advisories/new) or email [sharafutdinov.di.dev@outlook.com](mailto:sharafutdinov.di.dev@outlook.com).
Include the affected version or commit, Forma region, browser, SDK version, reproduction steps and expected impact.
Keep undisclosed vulnerabilities out of public issues and Discussions.
Remove credentials, private project identifiers and confidential geometry from attachments.

## Data handling

The extension runs entirely in the browser iframe and performs zoning checks and envelope calculations locally.
Controls are stored in the browser's `localStorage` for the current proposal.
Zoning Check has no backend or telemetry and sends no controls, geometry or reports to a server of its own.
The iframe communicates with its Autodesk Forma host through the embedded-view SDK; the explicit **Save envelope to library** action saves geometry through Forma.
The browser also requests the app's static assets and the Forma Design System CSS and `weave-*` components from Autodesk's CDN.

CSV exports are generated locally and may contain plot geometry, proposal identifiers, building names, controls and source references.
Review exported files before sharing them.
Clearing site storage removes locally saved controls and preferences.
