# Contributing

Bug reports and feature requests use the [issue forms](https://github.com/sharafutdinovdi/forma-zoning-check/issues/new/choose).
Questions belong in [Discussions](https://github.com/sharafutdinovdi/forma-zoning-check/discussions).
Contributors follow the [code of conduct](https://github.com/sharafutdinovdi/.github/blob/main/CODE_OF_CONDUCT.md).

## Bug reports and feature requests

Bug reports include:

- Forma region and the extension version or commit.
- Browser name and version.
- Installed `forma-embedded-view-sdk` version.
- Preset in use and any manually changed controls.
- Steps to reproduce, expected behavior and actual behavior.
- A screenshot of the panel with private project information removed.

Feature requests describe the problem or use case, proposed behavior, affected region and preset, and alternatives considered.
Requests for new presets include a primary source URL and the relevant section or article.

## Pull requests

1. Open an issue before a large change and agree on the expected behavior.
2. Fork the repository and create a focused branch from `main`.
3. Make the change and run the local checks below.
4. Use Conventional Commits for commits and the PR title, for example `fix(presets): correct a setback limit` or `docs: clarify fixture setup`.
5. Open a PR against `main`, link the issue and fill in the validation section.
6. Attach a panel screenshot for changes that affect the panel; state when this does not apply.
7. Remove credentials, private project identifiers and confidential geometry from reports and attachments.

[CODEOWNERS](.github/CODEOWNERS) assigns the repository to `@sharafutdinovdi`.
Contributions are licensed under [MIT](LICENSE).

## Local checks

Use Node.js 20.19+ or 22.12+ and npm from the repository root:

```sh
npm ci
npm run typecheck
npm run build
npm run preset-validate
npm run dev
```

Open the [fixture URLs in the README](README.md#develop) to inspect the panel, empty states, loading, error recovery and host transparency.
The default fixture is `http://localhost:5173/?fixture=1`.
Fixtures contain synthetic data; saving an envelope to the library requires a live Forma host.
Record the fixture URL or Forma region, browser and SDK version with the validation results.
Run `actionlint` after changing a workflow.

CI runs type checking, the production build and preset validation on Node.js 20 and 22.
CodeQL analyzes JavaScript and TypeScript on pull requests, pushes to `main` and weekly.

## Preset sources

Every preset with regulatory values must cite a primary source: an adopted plan, official regulation or authority-issued plot document.
Record the source URL, section or article, applicability and limitations in `src/rules.ts` and the matching `presets/<id>.json` file.
Custom and manual-entry presets must identify that controls come from the current plot document; they must not introduce unsourced default limits.
Reference values must remain distinguishable from plot-specific rights.
Update the README preset table when limits, sources or caveats change.

`npm run preset-validate` checks every preset file against the `@2` parser and its built-in definition, and reports missing or extra files.
