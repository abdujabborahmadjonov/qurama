#!/usr/bin/env python3
"""Fetch the traditional-craft photographs used on the landing page.

Everything here comes from Wikimedia Commons under a licence that permits reuse.
The script records each file's licence and credit line into CREDITS.md next to
the images, because CC BY and CC BY-SA *require* attribution — the credits block
on the page is not decoration, it is the licence condition.

    python3 tools/fetch-craft-images.py
"""

import json, pathlib, re, urllib.parse, urllib.request

UA = "Qurama/0.1 (archive project; ahmadjon@ualberta.ca)"
API = "https://commons.wikimedia.org/w/api.php"
OUT = pathlib.Path(__file__).resolve().parent.parent / "site" / "assets" / "img" / "craft"
WIDTH = 900   # displayed around 400px; 900 covers retina without the weight
FREE = ("cc0", "public domain", "cc by", "cc-by")

# Two rules for anything added here:
#   1. Objects, not people. On this site a photograph of a woman reads as a
#      contributor, which would be untrue and unfair to whoever is pictured.
#   2. Check the country. Several rugs on Commons called "Kazakh" are
#      Azerbaijani — Qazakh is a weaving region there, nothing to do with
#      Kazakhstan.
#
# country code -> (Commons file, the craft, a one-line note for the caption)
PICKS = {
    "uz": ("Shakhrisyabz Suzani.jpg", "Suzani embroidery",
           "Silk on cotton, Shahrisabz. Stitched by the women of a household over years, for a daughter's dowry."),
    "kg": ("Kyrgyz shyrdak.jpg", "Shyrdak felt",
           "Cut and fitted rather than woven — the pieced-cloth family this archive is named for."),
    "kz": ("Kazakh carpet at Almaty Central State Museum of Kazakhstan.jpg", "Syrmaq felt carpet",
           "Pieced felt, cut and inlaid. Almaty, Central State Museum of Kazakhstan."),
    "tj": ("Tajikistan, Tajik tribe, 19th century - Wedding Veil - 1916.1235 - Cleveland Museum of Art.tif",
           "Wedding veil",
           "Nineteenth century. Worn over the face at the wedding and kept long afterwards."),
    "tm": ("Turkmen carpet patterns.jpg", "Carpet gul",
           "The gul is a tribal medallion: a Turkmen carpet records which people made it."),
    "af": ("Coat, Mangal Pashtun people, Afghanistan, view 1, early to mid 20th century, wool, cotton, silk, metal thread, glass and plastic beads - Textile Museum of Canada - DSC00922.JPG",
           "Mangal Pashtun coat",
           "Wool, silk and metal thread. This one is held in Toronto, at the Textile Museum of Canada."),
}


def call(params):
    params = dict(params, format="json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=60))


def strip(html):
    return re.sub(r"\s+", " ", re.sub("<[^>]+>", "", html or "")).strip()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits = []

    for code, (filename, craft, note) in PICKS.items():
        # iiurlwidth makes Commons render a thumbnail for us — importantly it
        # also converts formats, so a .tif original still comes back as jpg.
        data = call({"action": "query", "titles": "File:" + filename,
                     "prop": "imageinfo", "iiprop": "extmetadata|url",
                     "iiurlwidth": str(WIDTH)})
        page = list(data["query"]["pages"].values())[0]
        meta = (page.get("imageinfo") or [{}])[0].get("extmetadata", {})

        licence = strip(meta.get("LicenseShortName", {}).get("value", "?"))
        artist = strip(meta.get("Artist", {}).get("value", "")) or "unknown"
        licence_url = strip(meta.get("LicenseUrl", {}).get("value", ""))

        if not any(f in licence.lower() for f in FREE):
            raise SystemExit("refusing %s: licence is %r, which does not clearly permit reuse" % (filename, licence))

        thumb = (page.get("imageinfo") or [{}])[0].get("thumburl")
        if not thumb:
            raise SystemExit("no thumbnail available for " + filename)
        req = urllib.request.Request(thumb, headers={"User-Agent": UA})
        blob = urllib.request.urlopen(req, timeout=120).read()
        dest = OUT / (code + ".jpg")
        dest.write_bytes(blob)

        print("  %-3s %-22s %-16s %7d bytes  %s" % (code, craft, licence, len(blob), artist[:32]))
        credits.append({
            "code": code, "craft": craft, "note": note, "file": filename,
            "licence": licence, "licence_url": licence_url, "artist": artist,
            "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + filename),
        })

    (OUT / "credits.json").write_text(json.dumps(credits, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = ["# Craft photographs", "",
             "Downloaded from Wikimedia Commons by `tools/fetch-craft-images.py`.",
             "Every file is under a licence permitting reuse. **CC BY and CC BY-SA require",
             "attribution**, which is why the credits appear on the page itself — that is a",
             "licence condition, not a courtesy.", "",
             "| On the site | Craft | Licence | Credit | Source |", "|---|---|---|---|---|"]
    for c in credits:
        lines.append("| `%s.jpg` | %s | %s | %s | [Commons](%s) |"
                     % (c["code"], c["craft"], c["licence"], c["artist"], c["page"]))
    lines += ["", "Retrieved 17 September 2026. Re-run the script to refresh."]
    (OUT / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n  wrote CREDITS.md and credits.json")


if __name__ == "__main__":
    main()
