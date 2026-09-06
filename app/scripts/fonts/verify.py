"""Verify real WOFF2 cmap coverage, integrity and licences for all delivered locales."""
import hashlib
import json
from pathlib import Path
import unicodedata
from fontTools.ttLib import TTFont

APP = Path(__file__).resolve().parents[2]
FONTS = json.loads((APP / 'src/i18n/fonts.json').read_text())
SHARED = json.loads((APP / 'src/i18n/shared-fonts.json').read_text())
LANGUAGES = json.loads((APP / 'src/i18n/languages.json').read_text())


def read_font(spec):
    path = APP / 'public' / spec['url'].lstrip('/')
    data = path.read_bytes()
    assert len(data) == spec['bytes'], path
    assert hashlib.sha256(data).hexdigest() == spec['sha256'], path
    font = TTFont(path)
    return set(font.getBestCmap())


def text(node):
    return ''.join(text(v) for v in node.values()) if isinstance(node, dict) else node


base = set()
for path in (APP / 'src/styles/fonts').glob('instrument-sans-*.woff2'):
    base.update(TTFont(path).getBestCmap())
for spec in SHARED:
    base.update(read_font(spec))
    assert (APP / 'public' / spec['license'].lstrip('/')).is_file()
full = {}
for script, spec in FONTS.items():
    full[script] = read_font(spec['full'])
    native = read_font(spec['native'])
    assert (APP / 'public' / spec['license'].lstrip('/')).is_file()
    for lang, meta in LANGUAGES.items():
        if meta['script'] == script:
            assert set(map(ord, meta['nativeName'])) <= native, lang
    print(script, 'full codepoints', len(full[script]), 'native codepoints', len(native))
for path in sorted((APP / 'src/i18n/locales').glob('*.json')):
    lang = path.stem
    coverage = base | full.get(LANGUAGES[lang]['script'], set())
    chars = set(text(json.loads(path.read_text())))
    missing = sorted(c for c in chars if ord(c) not in coverage and not c.isspace() and unicodedata.category(c) not in ('Cc', 'Cf'))
    assert not missing, (lang, [(c, hex(ord(c)), unicodedata.name(c, '?')) for c in missing])
    print(lang, 'all visible catalogue characters covered:', len(chars))
print('Coverage and content hashes verified from the bundled WOFF2 files.')
