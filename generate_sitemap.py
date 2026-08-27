#!/usr/bin/env python3
"""
Regenerates sitemap.xml by scanning every top-level .html file in this
directory. Runs automatically on each Netlify deploy (see netlify.toml's
build command), so the sitemap always reflects whatever pages currently
exist, no manual editing required.

Rules:
- Any page with <meta name="robots" content="noindex..."> is excluded
  (matches the noindex convention already used for legal/utility pages).
- <lastmod> is the file's own last-modified date on disk.
- Priority/changefreq are assigned by a simple heuristic based on the
  page's role (homepage > main nav > city/practice-area pages > blog posts).
"""
import glob
import os
import re
import sys
from datetime import datetime, timezone

SITE_URL = "https://www.pinglelaw.com"
OUTPUT_FILE = "sitemap.xml"

NOINDEX_RE = re.compile(
    r'<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"', re.IGNORECASE
)

# Top-level pages that anchor primary navigation.
MAIN_NAV = {
    "index.html", "about.html", "practice-areas.html", "faq.html",
    "results-and-testimonials.html", "resources.html", "contact.html", "case-review.html",
    "glossary.html",
}

CITY_SLUGS = (
    "fountain-valley", "beverly-hills", "san-bernardino",
    "san-diego", "san-francisco", "sacramento", "california",
)


def is_noindex(html: str) -> bool:
    return bool(NOINDEX_RE.search(html))


def classify(filename: str) -> tuple[str, str]:
    """Return (priority, changefreq) for a given filename."""
    if filename == "index.html":
        return "1.0", "weekly"
    if filename in MAIN_NAV:
        return "0.8", "weekly"
    if filename.startswith("blog-"):
        return "0.6", "monthly"
    if any(filename == f"{slug}.html" for slug in CITY_SLUGS):
        # City/state homepage variants.
        return "0.8", "monthly"
    if any(filename.startswith(f"{slug}-") for slug in CITY_SLUGS):
        # City + practice-area combination landing pages.
        return "0.6", "monthly"
    return "0.5", "monthly"


def url_path(filename: str) -> str:
    if filename == "index.html":
        return "/"
    return f"/{filename}"


def build_sitemap() -> str:
    entries = []
    for filepath in sorted(glob.glob("*.html")):
        filename = os.path.basename(filepath)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                html = f.read()
        except (UnicodeDecodeError, OSError):
            continue

        if is_noindex(html):
            continue

        priority, changefreq = classify(filename)
        mtime = os.path.getmtime(filepath)
        lastmod = datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%d")

        entries.append(
            "  <url>\n"
            f"    <loc>{SITE_URL}{url_path(filename)}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            "  </url>"
        )

    body = "\n".join(entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    xml = build_sitemap()
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(xml)

    count = xml.count("<url>")
    print(f"generate_sitemap.py: wrote {count} URLs to {OUTPUT_FILE}")


if __name__ == "__main__":
    sys.exit(main())
