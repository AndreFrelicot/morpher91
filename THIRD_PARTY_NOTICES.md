# Third-party notices

Morpher91's original code and documentation use the [MIT License](LICENSE). This does not relicense dependencies, fonts or third-party artwork.

The complete production dependency notices and bundled font licenses are shipped in [app/public/THIRD_PARTY_NOTICES.txt](app/public/THIRD_PARTY_NOTICES.txt). They remain available at `/THIRD_PARTY_NOTICES.txt` in the static build, referenced from the HTML and cached for offline access.

## Mediabunny

Mediabunny 1.45.4 is used without source modifications under MPL-2.0. Its original source and license are included in the [versioned npm source package](https://registry.npmjs.org/mediabunny/-/mediabunny-1.45.4.tgz); the project is maintained at [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny). Keep source availability and notices up to date if the dependency changes. See [Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) for distribution guidance.

## Fonts

Instrument Sans, JetBrains Mono and the Noto families use SIL OFL 1.1. Their copyright and license notices are retained under `app/public/licenses/` and `app/public/fonts/` and included in the combined notice file. The Instrument Sans and JetBrains Mono licenses were retrieved from Google Fonts revision `5e35378e6bda803962ee6fd257e444a7d459660d`, under `ofl/instrumentsans/OFL.txt` and `ofl/jetbrainsmono/OFL.txt`. See [font maintenance](app/scripts/fonts/README.md) for pinned Noto sources and subset generation.

## Updating notices

After installing with the checked-in lockfile, run from `app/`:

```sh
pnpm licenses:generate
```

The generator collects actual license and notice texts from installed production packages. Some packages omit their license file; checked-in upstream copies and pinned source URLs under `app/scripts/licenses/` cover those cases. Review these fallbacks and Mediabunny's version/source URL whenever changing dependencies. Regeneration needs no network access after installation.

Media and artwork have separate provenance records in [docs/DEMO_ASSETS.md](docs/DEMO_ASSETS.md).
