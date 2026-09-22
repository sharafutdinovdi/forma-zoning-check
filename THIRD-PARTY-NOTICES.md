# Third-party notices

The direct runtime and build dependencies in [package.json](package.json) use the licenses below.
Versions are those resolved in [package-lock.json](package-lock.json).

| Dependency | Version | Use | License |
| --- | --- | --- | --- |
| `forma-embedded-view-sdk` | 0.96.0 | Runtime: communication with the Autodesk Forma host | Apache-2.0 |
| `polygon-clipping` | 0.15.7 | Runtime: polygon operations | MIT |
| `vite` | 7.3.6 | Build and development server | MIT |
| `typescript` | 5.9.3 | Build: type checking | Apache-2.0 |

The installed packages contain their license texts in `node_modules/forma-embedded-view-sdk/LICENSE`, `node_modules/polygon-clipping/LICENSE.md`, `node_modules/vite/LICENSE.md` and `node_modules/typescript/LICENSE.txt`.
Their copyright notices and license terms remain applicable.

The Forma Design System CSS and `weave-*` components are loaded from Autodesk's CDN at `https://app.autodeskforma.eu/design-system/v2/`.
Those resources are not redistributed in this repository and are not covered by its MIT license.
