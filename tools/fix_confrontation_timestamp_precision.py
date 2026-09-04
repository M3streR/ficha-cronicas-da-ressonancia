from pathlib import Path
import re

path = Path('js/chronicles-online-combat.js')
text = path.read_text(encoding='utf-8')

text = text.replace(
"      updatedAt: iso(row.updated_at)\n",
"      updatedAt: row.updated_at || null\n",
1
)
text = text.replace(
"      updatedAt: iso(row.updated_at)\n",
"      updatedAt: row.updated_at || null\n",
1
)

if text.count("updatedAt: row.updated_at || null") < 2:
    raise SystemExit('timestamp precision anchors missing')

path.write_text(text, encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
html, count = re.subn(
    r'js/chronicles-online-combat\.js\?v=[^"\']+',
    'js/chronicles-online-combat.js?v=timestamp-precision-fix',
    html,
    count=1
)
if count != 1:
    raise SystemExit('online combat cache reference missing')
index.write_text(html, encoding='utf-8')
