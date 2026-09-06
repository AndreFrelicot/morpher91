# Self-hosted language fonts

These maintenance scripts vendor pinned Google Fonts sources under the SIL Open Font License. Normal development and production builds use the checked-in WOFF2 files and do not need Python or a font CDN.

From the repository root:

```sh
python3 -m venv /tmp/m26-font-tools
/tmp/m26-font-tools/bin/pip install 'fonttools[woff]==4.59.0' 'brotli==1.1.0'
/tmp/m26-font-tools/bin/python app/scripts/fonts/generate.py
/tmp/m26-font-tools/bin/python app/scripts/fonts/shared.py
/tmp/m26-font-tools/bin/python app/scripts/fonts/base-coverage.py
/tmp/m26-font-tools/bin/python app/scripts/fonts/verify.py
```

`sources.json` pins the upstream revision. `generate.py` retains each full font’s Unicode coverage and variable weights, creates small subsets for the native language names, and writes metadata and CSS. `shared.py` supplies mathematical symbols, shortcut symbols and arrows absent from Instrument Sans. Subsets retain OpenType shaping closure and licensing records and use distinct Morpher family names. Licenses are copied beside the files. Output filenames and metadata contain content hashes.

`base-coverage.py` records the actual cmap of the existing Instrument Sans files. `verify.py` reopens the actual WOFF2 files and checks hashes, licenses, native names and every visible character in every available locale. Run it after adding or editing a catalogue. These checks prove coverage, not typography or translation quality; browser review remains required for combining characters, line height and shaping.

Full script fonts load before the corresponding language is applied. Native-name subsets and common symbols belong to the shell cache; full fonts enter the persistent font cache only when used. Font generation does not delete older assets automatically: remove an obsolete hash-named file only after confirming that no metadata, CSS or supported deployed shell references it.
