#!/usr/bin/env python3
"""Copy the 2D game from its source folder into the repo root and stamp
cache-busting versions (?v=<hash>) on its <script>/<link> tags.

Source of truth for the 2D game: /workspace/last-signal/ (index.html, css/, js/).
Usage:  python3 tools/sync-2d.py [path-to-2d-source]
The 3D game lives in 3d/ and is versioned by 3d/tools/bump-version.py."""
import hashlib, pathlib, re, shutil, sys

repo = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/last-signal')
for d in ('css', 'js'):
    if (repo / d).exists(): shutil.rmtree(repo / d)
    shutil.copytree(src / d, repo / d)
html = (src / 'index.html').read_text()

h = hashlib.sha256()
for f in sorted((repo / 'js').glob('*.js')) + sorted((repo / 'css').glob('*.css')):
    h.update(f.read_bytes())
h.update(html.encode())
v = h.hexdigest()[:10]
html = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+\.(?:js|css))(\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}?v={v}"', html)
(repo / 'index.html').write_text(html)
print('2D synced from', src, 'version', v)
