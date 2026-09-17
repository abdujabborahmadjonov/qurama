#!/usr/bin/env python3
"""Copy the header/footer blocks from site/index.html into every other page.

index.html is the single source of truth. Edit the header or footer there,
then run:  python3 tools/sync-partials.py

Other pages may use either the @@HEADER@@ / @@FOOTER@@ tokens (first run) or
the already-expanded <!-- #include: header --> ... <!-- /include --> blocks.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SRC = SITE / "index.html"

def block(html, name):
    m = re.search(
        r"<!-- #include: %s -->.*?<!-- /include -->" % re.escape(name),
        html, re.S)
    if not m:
        sys.exit("could not find the '%s' include block in index.html" % name)
    return m.group(0)

def main():
    src = SRC.read_text(encoding="utf-8")
    parts = {"header": block(src, "header"), "footer": block(src, "footer")}

    changed = []
    for page in sorted(SITE.glob("*.html")):
        if page == SRC:
            continue
        html = original = page.read_text(encoding="utf-8")
        for name, content in parts.items():
            token = "@@%s@@" % name.upper()
            if token in html:
                html = html.replace(token, content)
            else:
                html = re.sub(
                    r"<!-- #include: %s -->.*?<!-- /include -->" % name,
                    lambda _m: content, html, flags=re.S)
        if html != original:
            page.write_text(html, encoding="utf-8")
            changed.append(page.name)

    print("synced:", ", ".join(changed) if changed else "nothing to do")

if __name__ == "__main__":
    main()
