# Contributing to Morpher91

Install the Node.js and pnpm versions described in the [README](README.md), then run `pnpm install --frozen-lockfile` inside `app/`.

Keep each change focused and describe the behavior before and after it. Before submitting a pull request, run from `app/`:

```sh
pnpm format:check
pnpm typecheck
pnpm exec eslint . --max-warnings=0
pnpm test
pnpm build
```

`pnpm build` increments the application version; include intentional version changes in your review. Do not commit dependencies, generated builds, local configuration, credentials or personal media. The checked-in deterministic fixture is intentional and is served only by the development server.

## UI and translations

Every new or changed user-facing string must be represented in all 16 catalogues under `app/src/i18n/locales/`. Preserve interpolation variables, markup and locale-specific plural forms. Never hardcode UI text. Use the shared typography and semantic colors.

Keep contextual guides under `app/src/assist/` synchronized with behavior changes. Moving or removing a `data-assist` anchor requires updating its registry and any guide steps that reference it. Locale parity and anchor synchronization are checked by tests.

## Rendering and interaction

Preview and export must resolve the same timeline state and use the same layered renderer. Preserve coordinate spaces, alpha conventions and resource ownership. Dispose GPU resources, frames, bitmaps and object URLs correctly.

Add a meaningful regression test for reproducible bugs. Tests in jsdom do not validate rendered pixels, real codecs or Apple Pencil hardware: describe manual browser/device checks for those changes and attach relevant captures to the pull request.

## Assets and dependencies

Document the source, author, license and modifications when adding media or fonts. Preserve third-party notices and update them when dependencies change. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [demo asset notes](docs/DEMO_ASSETS.md).

Contributions to the original application code and documentation are provided under the project's MIT License.
