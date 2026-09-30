#!/usr/bin/env python3
"""
"Last updated" dates for every indexable page.

Two modes:

  python3 generate_page_dates.py --seed
      One-time (re-runnable) helper: fills in content/page-dates.json with a
      date for every page that does not have one yet, taken from git history -
      the newest commit that changed the page's actual HTML. Changes that
      only bump ?v=NN cache-busting numbers are ignored, and so are
      site-wide commits that touched dozens of pages at once (nav/footer
      edits), since those say nothing about a specific page's content.

  python3 generate_page_dates.py            (no flag - runs on every Netlify deploy)
      Reads content/page-dates.json and, for each indexable page, adds
        - a visible "Last updated: <date>" line at the bottom of <main>
        - <meta property="article:modified_time"> and schema.org JSON-LD with
          dateModified, which search engines and AI tools read.
      generate_sitemap.py reads the same JSON, so <lastmod> matches.
      Runs in the deploy build only; the files in git are not modified by a
      Netlify build. Idempotent (a marker prevents double-injection).

The dates are edited from the admin dashboard (AI Visibility > "Page dates"),
which commits content/page-dates.json.
"""
import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import date, datetime

SITE_URL = "https://www.pinglelaw.com"
DATES_FILE = "content/page-dates.json"
MARKER = "<!-- page-dates -->"
NOINDEX_RE = re.compile(r'<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"', re.IGNORECASE)
BULK_COMMIT_FILES = 40  # a commit that really changed more pages than this is site-wide

MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def load_dates():
    try:
        with open(DATES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        pages = data.get("pages", {})
        return pages if isinstance(pages, dict) else {}
    except (OSError, ValueError):
        return {}


def top_level_html():
    return sorted(os.path.basename(p) for p in glob.glob("*.html"))


def is_indexable(html):
    return not NOINDEX_RE.search(html)


def is_dynamic(filename):
    # Rebuilt from live feeds on a schedule (generate_rss_page.py).
    return filename == "rss.html" or filename.startswith("rss-page-")


# ---------------------------------------------------------------- seed mode
def norm(line):
    return re.sub(r"\?v=\d+", "", line).strip()


def seed():
    existing = load_dates()
    proc = subprocess.run(
        ["git", "log", "--no-color", "-U0", "--format=COMMIT\t%cs", "--", "*.html"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        sys.exit("git log failed: " + proc.stderr[:200])

    commits = []  # newest first: (date, {file: really_changed})
    cur_date, cur_file, removed, added, files = None, None, [], [], {}

    def flush_file():
        nonlocal cur_file, removed, added
        if cur_file:
            files[cur_file] = Counter(map(norm, removed)) != Counter(map(norm, added))
        cur_file, removed, added = None, [], []

    def flush_commit():
        nonlocal files
        flush_file()
        if cur_date is not None:
            commits.append((cur_date, {f: ch for f, ch in files.items() if ch}))
        files = {}

    for line in proc.stdout.splitlines():
        if line.startswith("COMMIT\t"):
            flush_commit()
            cur_date = line.split("\t", 1)[1]
        elif line.startswith("diff --git "):
            flush_file()
            m = re.match(r"diff --git a/(.*) b/(.*)$", line)
            name = m.group(2) if m else ""
            cur_file = name if "/" not in name and name.endswith(".html") else None
        elif cur_file and line.startswith("-") and not line.startswith("---"):
            removed.append(line[1:])
        elif cur_file and line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:])
    flush_commit()

    newest_real, newest_any = {}, {}
    for d, changed in commits:  # newest first
        for f in changed:
            newest_any.setdefault(f, d)
            if len(changed) <= BULK_COMMIT_FILES:
                newest_real.setdefault(f, d)

    out = dict(existing)
    added_count = 0
    for f in top_level_html():
        if f in out:
            continue
        d = newest_real.get(f) or newest_any.get(f)
        if d:
            out[f] = d
            added_count += 1
    os.makedirs(os.path.dirname(DATES_FILE), exist_ok=True)
    with open(DATES_FILE, "w", encoding="utf-8") as fh:
        json.dump({"pages": dict(sorted(out.items()))}, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"generate_page_dates.py --seed: {added_count} new dates, {len(out)} total in {DATES_FILE}")


# --------------------------------------------------------------- build mode
def blog_post_dates():
    """slug -> date from the markdown posts added through the admin."""
    out = {}
    for path in glob.glob("content/blog/*.md"):
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        m = re.search(r"^date:\s*(\d{4}-\d{2}-\d{2})", text, re.MULTILINE)
        if m:
            out["blog-" + os.path.splitext(os.path.basename(path))[0] + ".html"] = m.group(1)
    return out


def fmt(iso, spanish):
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return iso
    if spanish:
        return f"{d.day} de {MONTHS_ES[d.month - 1]} de {d.year}"
    return f"{MONTHS_EN[d.month - 1]} {d.day}, {d.year}"


def date_for(filename, dates, post_dates):
    if is_dynamic(filename):
        return date.today().isoformat()
    return dates.get(filename) or post_dates.get(filename) or date.today().isoformat()


def inject():
    dates = load_dates()
    post_dates = blog_post_dates()
    done = 0
    for filename in top_level_html():
        try:
            with open(filename, "r", encoding="utf-8") as f:
                html = f.read()
        except (UnicodeDecodeError, OSError):
            continue
        if MARKER in html or not is_indexable(html) or "</head>" not in html:
            continue
        iso = date_for(filename, dates, post_dates)
        spanish = filename.endswith("-es.html") or 'lang="es"' in html[:400]
        url = SITE_URL + ("/" if filename == "index.html" else "/" + filename)
        ld = json.dumps({"@context": "https://schema.org", "@type": "WebPage", "url": url, "dateModified": iso})
        head = (f'{MARKER}\n<meta property="article:modified_time" content="{iso}">\n'
                f'<script type="application/ld+json">{ld}</script>\n')
        html = html.replace("</head>", head + "</head>", 1)
        idx = html.rfind("</main>")
        if idx != -1:
            label = "Última actualización" if spanish else "Last updated"
            line = f'<p class="page-updated">{label}: <time datetime="{iso}">{fmt(iso, spanish)}</time></p>\n'
            html = html[:idx] + line + html[idx:]
        with open(filename, "w", encoding="utf-8") as f:
            f.write(html)
        done += 1
    print(f"generate_page_dates.py: added dates to {done} pages")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if "--seed" in sys.argv:
        seed()
    else:
        inject()


if __name__ == "__main__":
    main()
