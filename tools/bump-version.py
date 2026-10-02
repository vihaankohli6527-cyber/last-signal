#!/usr/bin/env python3
"""Cache busting: stamp every app module import (and the <script>/<link> tags)
with ?v=<hash of the app files>, so browsers fetch fresh code after each release.
Run before committing:  python3 tools/bump-version.py
(lib/ imports are left alone: three.js never changes and must stay one copy.)"""
import hashlib, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
js_files = sorted((root / 'js').rglob('*.js'))
css = root / 'css' / 'style.css'
html = root / 'index.html'

IMPORT = re.compile(r"""(from\s+['"])(\.{1,2}/[^'"?]+\.js)(\?v=[0-9a-f]+)?(['"])""")
def strip(text):
    text = IMPORT.sub(lambda m: m.group(1) + m.group(2) + m.group(4), text)
    return re.sub(r'(js/main\.js|css/style\.css)\?v=[0-9a-f]+', r'\1', text)

h = hashlib.sha256()
for f in js_files + [css, html]:
    h.update(strip(f.read_text()).encode())
v = h.hexdigest()[:10]

def stamp(m):
    path = m.group(2)
    if '/lib/' in path or path.startswith('../lib') or 'three.module' in path:
        return m.group(1) + path + m.group(4)
    return m.group(1) + path + '?v=' + v + m.group(4)

for f in js_files:
    t = f.read_text()
    n = IMPORT.sub(stamp, strip(t))
    if n != t: f.write_text(n)
t = strip(html.read_text())
t = t.replace('src="js/main.js"', f'src="js/main.js?v={v}"').replace('href="css/style.css"', f'href="css/style.css?v={v}"')
t = re.sub(r'<meta name="app-version" content="[^"]*" />\n?', '', t)
t = t.replace('<head>\n', f'<head>\n  <meta name="app-version" content="{v}" />\n', 1)
html.write_text(t)
print('version', v)
