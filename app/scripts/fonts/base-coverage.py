"""Snapshot the existing Latin fonts' actual coverage for the JavaScript CI gate."""
import hashlib
import json
from fontTools.ttLib import TTFont
from generate import APP, ranges

entries = []
for path in sorted((APP / 'src/styles/fonts').glob('instrument-sans-*.woff2')):
    entries.append({'file': str(path.relative_to(APP)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'unicodeRange': ranges(TTFont(path).getBestCmap())})
(APP / 'src/i18n/base-font-coverage.json').write_text(json.dumps(entries, indent=2) + '\n')
