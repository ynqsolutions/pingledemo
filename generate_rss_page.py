#!/usr/bin/env python3
"""
Builds rss.html: a curated, growing archive of employment-law and personal-
injury news pulled from outside legal publications, filtered by keyword.
Runs at Netlify build time (see netlify.toml) and once a day via a GitHub
Actions workflow (.github/workflows/refresh-rss.yml) that commits the
result — Netlify builds can't write back to git themselves, so the daily
"add new items, keep old ones" accumulation has to happen there, not here.
Stdlib only, same pattern as generate_sitemap.py / generate_blog_posts.py —
no npm/pip dependency that could break a build if unavailable.

Sources: only feeds that are actually publicly fetchable without a login,
per the site owner's request to use exactly these three:
  - ABA Journal (https://www.abajournal.com/news/rss)
  - Stanford Law School (https://law.stanford.edu/feed/)
  - Above the Law (https://abovethelaw.com/feed/)
All three are general legal-news/commentary feeds, not employment- or
injury-specific, so most items on any given day won't match the keyword
list below — that's expected. content/rss-archive.json is what makes this
work as a "year to date, growing daily" page instead of a live snapshot:
every run merges newly-matching items into it (deduped by link) rather
than starting over from whatever's currently in each feed's rolling
window, and old items are trimmed once they roll past the current
calendar year.
"""
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import escape, unescape

SITE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = "rss.html"
PAGE_FILE_PATTERN = "rss-page-{n}.html"
ARCHIVE_FILE = "content/rss-archive.json"
CSS_VERSION = "237"
JS_VERSION = "68"
FETCH_TIMEOUT = 12
USER_AGENT = "PingleLawSite/1.0 (+https://www.pinglelaw.com)"
# Keeps each page fast and gives search engines more distinct, indexable
# URLs as the archive grows, instead of one ever-larger page. Below this
# count everything still fits on rss.html alone (no rss-page-2.html etc.
# gets written).
PAGE_SIZE = 30

FEEDS = [
    {"name": "ABA Journal", "url": "https://www.abajournal.com/news/rss"},
    {"name": "Stanford Law School", "url": "https://law.stanford.edu/feed/"},
    {"name": "Above the Law", "url": "https://abovethelaw.com/feed/"},
]

# ABA Journal's feed doesn't support pagination (its ?page= param returns
# unrelated old content), but Stanford and Above the Law are both WordPress
# sites, which support "?paged=N" on the feed URL to reach older pages of
# items — used only by the one-time --backfill pass below, not the normal
# per-build fetch, since walking dozens of pages on every build would be
# slow and risks getting rate-limited.
PAGINATED_FEEDS = {
    "Stanford Law School": "https://law.stanford.edu/feed/?paged={n}",
    "Above the Law": "https://abovethelaw.com/feed/?paged={n}",
}
BACKFILL_MAX_PAGES = 160  # ATL posts ~30/wk; needs ~130 pages to reach a full year back

KEYWORDS = [
    # Employment law
    "employment", "employer", "employee", "workplace", "labor law",
    "wage", "overtime", "minimum wage", "unpaid wages",
    "discrimination", "harassment", "wrongful termination", "retaliation",
    "whistleblower", "eeoc", "nlrb", "feha", "osha", "fmla",
    "union", "unionize", "collective bargaining",
    "severance", "non-compete", "noncompete", "misclassification",
    "independent contractor", "gig worker", "paga",
    "sexual harassment", "pay equity", "equal pay", "layoff", "layoffs",
    # Personal injury
    "personal injury", "car accident", "auto accident", "truck accident",
    "motorcycle accident", "pedestrian accident", "slip and fall",
    "premises liability", "medical malpractice", "wrongful death",
    "product liability", "negligence", "catastrophic injury",
    "traumatic brain injury", "dog bite",
]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Employment &amp; Injury Law News{title_suffix} | California | Pingle Law</title>
<meta name="description" content="A regularly updated feed of employment law and personal injury news from outside legal publications, curated for California workers by the Law Offices of Corey A. Pingle.{desc_suffix}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=block" rel="stylesheet">
<link rel="stylesheet" href="css/style.css?v={css_v}">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="assets/favicon-192.png">
<link rel="apple-touch-icon" href="assets/favicon-180.png">
<link rel="stylesheet" href="css/a11y-widget.css?v=9">
{jsonld}</head>
<body>

<!-- ============ HEADER ============ -->
<header class="site-header">
  <div class="header-inner wrap">
    <a href="index.html" class="logo"><img src="assets/Pingle_Logo_Outline.png?v=2" alt="Pingle Law"></a>
    <nav class="nav-desktop">
      <a href="index.html">Home</a>
      <a href="about.html">About</a>
      <a href="practice-areas.html">Practice Areas</a>
      <a href="faq.html">FAQ</a>
      <a href="results-and-testimonials.html">Results</a>
      <a href="resources.html">Resources</a>
      <a href="contact.html">Contact</a>
    </nav>
    <div class="header-right">
      <div class="lang-toggle header-lang-toggle-desktop" role="group" aria-label="Language display toggle, decorative only">
        <span class="active">EN</span><span>ES</span>
      </div>
      <div class="header-phone">
        <span class="label">Se Habla Español</span>
        <a class="num" href="tel:+17145932306">(714) 593-2306</a>
      </div>
      <button class="burger" aria-label="Open menu" aria-expanded="false" id="burgerBtn">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<div class="mobile-nav" id="mobileNav">
  <div class="lang-toggle mobile-nav-lang-bar" role="group" aria-label="Language display toggle, decorative only">
    <span class="active">EN</span><span>ES</span>
  </div>
  <ul>
    <li><a href="index.html">Home</a></li>
    <li><a href="about.html">About</a></li>
    <li><a href="practice-areas.html">Practice Areas</a></li>
    <li><a href="faq.html">FAQ</a></li>
    <li><a href="results-and-testimonials.html">Results</a></li>
    <li><a href="resources.html">Resources</a></li>
    <li><a href="contact.html">Contact</a></li>
  </ul>
  <div class="mobile-nav-footer">
    <span class="mobile-nav-lang-label">Se Habla Español</span>
    <a href="tel:+17145932306" class="btn btn-outline-light mobile-nav-phone-btn">(714) 593-2306</a>
    <a href="https://calendly.com/pinglelaw/30min" target="_blank" rel="noopener" class="btn btn-gold">Free Consultation</a>
  </div>
</div>

<!-- ============ MOBILE STICKY CTA ============ -->
<div class="mobile-sticky-cta" aria-hidden="false">
  <div class="mobile-sticky-buttons">
    <a href="tel:+17145932306" class="mobile-sticky-btn mobile-sticky-call">Call Now</a>
    <a href="https://calendly.com/pinglelaw/30min" target="_blank" rel="noopener" class="mobile-sticky-btn mobile-sticky-consult">Free Consultation</a>
  </div>
  <span class="mobile-sticky-lang">Se Habla Espa&ntilde;ol</span>
</div>

<main>

<!-- ============ HERO ============ -->
<section class="about-hero about-hero-compact about-hero-gradient">
  <div class="wrap about-hero-inner">
    <span class="eyebrow" style="color:var(--gold-500);">RSS</span>
    <h1>Employment &amp; Injury Law News From Around the Web</h1>
    <p>A running, day-by-day archive of employment-law and personal-injury coverage from outside legal publications, gathered here so California workers can keep up with the law that affects them.</p>
  </div>
</section>

<!-- ============ FEED ============ -->
<section class="resources-section section-divider">
  <div class="wrap">
{feed_html}
{pagination_nav}
  </div>
</section>

<!-- ============ FINAL CTA / CONTACT ============ -->
<section class="final-cta" id="contact">
  <div class="wrap final-cta-inner">
    <div class="final-cta-copy">
      <h2>Are you ready to reach out?</h2>
      <p>Contact us to discuss your situation. We are here to answer your questions, explain your options, and help you determine the best way to move forward.</p>
      <ul class="final-cta-points">
        <li>Free consultation</li>
        <li>No win, no fee guarantee</li>
        <li>Real answers</li>
      </ul>
      <div class="cta-buttons">
        <a href="https://calendly.com/pinglelaw/30min" target="_blank" rel="noopener" class="btn btn-gold">Free Consultation</a>
        <a href="contact.html" class="btn btn-outline-light">Contact Us</a>
      </div>
    </div>
    <div class="final-cta-form">
      <h3>Get your free case review</h3>
      <p>Answer a short set of questions to see where your situation stands, no cost, no obligation.</p>
      <a href="case-review.html" class="btn btn-gold">Start Free Case Review</a>
      <p class="final-cta-form-fine">Takes about two minutes.</p>
    </div>
  </div>
</section>

</main>

<!-- ============ FOOTER ============ -->
<footer>
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <div class="footer-logo"><img src="assets/Pingle_Logo_Outline.png?v=2" alt="Pingle Law"></div>
        <p class="footer-firm-name">Law Offices of Corey A. Pingle</p>
        <p style="max-width:320px; color:rgba(255,255,255,0.6);">Employment law firm representing employees across Orange County, Los Angeles County, Riverside County, San Bernardino County, San Francisco County, Sacramento County, and all across California.</p>
      </div>
      <div>
        <h5>Contact</h5>
        <ul>
          <li><a href="tel:+17145932306">(714) 593-2306</a></li>
          <li><a href="mailto:info@pinglelaw.com">info@pinglelaw.com</a></li>
        </ul>
      </div>
      <div>
        <h5>Explore</h5>
        <ul>
          <li><a href="case-review.html">Free Case Review</a></li>
          <li><a href="about.html">About</a></li>
          <li><a href="practice-areas.html">Practice Areas</a></li>
          <li><a href="faq.html">FAQ</a></li>
          <li><a href="rss.html">RSS</a></li>
          <li><a href="glossary.html">Glossary</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>
      <div>
        <h5>Service Area</h5>
        <ul>
          <li><a href="fountain-valley.html">Fountain Valley, CA</a></li>
          <li><a href="beverly-hills.html">Beverly Hills, CA</a></li>
          <li><a href="san-bernardino.html">San Bernardino, CA</a></li>
          <li><a href="san-diego.html">San Diego, CA</a></li>
          <li><a href="san-francisco.html">San Francisco, CA</a></li>
          <li><a href="sacramento.html">Sacramento, CA</a></li>
          <li>and all of California</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; 2026 Law Offices of Corey A. Pingle. All rights reserved. Attorney advertising. Prior results do not guarantee a similar outcome.</span>
      <div class="legal-links">
        <a href="privacy-policy.html">Privacy Policy</a>
        <a href="terms-of-use.html">Terms of Use</a>
        <a href="disclaimer.html">Disclaimer</a>
        <a href="sitemap.html">Sitemap</a>
      </div>
    </div>
  </div>
</footer>

<script src="js/main.js?v={js_v}" defer></script>
<script src="js/a11y-widget.js?v=13" defer></script>
</body>
</html>
"""

EMPTY_STATE = """    <p style="text-align:center; max-width:560px; margin:0 auto; color:var(--ink-soft);">Nothing new matched today. This archive grows daily — check back soon, or browse our own <a href="resources.html">articles and guides</a> in the meantime.</p>"""


def strip_html(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return unescape(text).strip()


def fetch_feed(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        return resp.read()


def parse_items(xml_bytes, source_name):
    items = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return items

    # Support both RSS 2.0 (<item>) and Atom (<entry>) feeds.
    for item in root.iter():
        tag = item.tag.split("}")[-1]
        if tag not in ("item", "entry"):
            continue

        title = None
        link = None
        pub_date = None
        summary = None
        for child in item:
            ctag = child.tag.split("}")[-1]
            if ctag == "title" and title is None:
                # Some feeds (e.g. EEOC's) wrap the title text in a nested
                # <a> tag, so child.text alone (direct text only) comes back
                # empty — itertext() walks nested elements too.
                title = "".join(child.itertext()).strip()
            elif ctag == "link" and link is None:
                link = child.get("href") or "".join(child.itertext()).strip()
            elif ctag in ("pubDate", "published", "updated") and pub_date is None:
                pub_date = (child.text or "").strip()
            elif ctag in ("description", "summary", "content") and summary is None:
                summary = strip_html("".join(child.itertext()))

        if not title or not link:
            continue

        parsed_date = None
        if pub_date:
            try:
                parsed_date = parsedate_to_datetime(pub_date)
            except (TypeError, ValueError):
                parsed_date = None
        if parsed_date and parsed_date.tzinfo is None:
            parsed_date = parsed_date.replace(tzinfo=timezone.utc)

        items.append({
            "title": unescape(title),
            "link": link,
            "source": source_name,
            "date": parsed_date.isoformat() if parsed_date else None,
            "summary": (summary or "")[:220],
        })
    return items


def matches_keywords(item):
    haystack = f"{item['title']} {item['summary']}".lower()
    return any(kw in haystack for kw in KEYWORDS)


def fetch_new_matches():
    all_items = []
    for feed in FEEDS:
        try:
            raw = fetch_feed(feed["url"])
            items = parse_items(raw, feed["name"])
            all_items.extend(items)
            print(f"generate_rss_page.py: {feed['name']} -> {len(items)} item(s) fetched")
        except Exception as e:
            print(f"generate_rss_page.py: WARNING could not fetch {feed['name']} ({feed['url']}): {e}")
    return [i for i in all_items if matches_keywords(i)]


def load_archive():
    if not os.path.exists(ARCHIVE_FILE):
        return []
    try:
        with open(ARCHIVE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def save_archive(items):
    os.makedirs(os.path.dirname(ARCHIVE_FILE), exist_ok=True)
    with open(ARCHIVE_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        f.write("\n")


def merge_and_trim(archive, new_items):
    existing_links = {i["link"] for i in archive}
    added = 0
    for item in new_items:
        if item["link"] not in existing_links:
            archive.append(item)
            existing_links.add(item["link"])
            added += 1

    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    def in_range(i):
        if not i["date"]:
            return True
        try:
            return datetime.fromisoformat(i["date"]) >= cutoff
        except ValueError:
            return True
    archive = [i for i in archive if in_range(i)]

    archive.sort(key=lambda i: i["date"] or "", reverse=True)
    return archive, added


def update_archive():
    """Merges newly-fetched matches into the persisted archive (deduped by
    link), and drops anything older than a trailing 365 days so this stays
    a rolling "past year" list rather than growing forever. The archive
    file only actually gains new items long-term when something commits it
    back to git — see .github/workflows/refresh-rss.yml — since a Netlify
    build's filesystem changes don't persist to the next build."""
    archive = load_archive()
    new_items = fetch_new_matches()
    archive, added = merge_and_trim(archive, new_items)
    save_archive(archive)
    print(f"generate_rss_page.py: archive now has {len(archive)} item(s) ({added} new this run)")
    return archive


def fetch_year_backfill():
    """One-time (manually run) deep fetch: walks back through Stanford's and
    Above the Law's paginated feeds (ABA Journal has no working pagination)
    to pull up to a year of past matching articles in one pass, rather than
    waiting for the daily fetch to accumulate them one day at a time. Not
    part of the normal build — run via `python3 generate_rss_page.py
    --backfill` and commit the result."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    all_items = []

    for feed in FEEDS:
        try:
            raw = fetch_feed(feed["url"])
            items = parse_items(raw, feed["name"])
            all_items.extend(items)
            print(f"generate_rss_page.py: [backfill] {feed['name']} page 1 -> {len(items)} item(s)")
        except Exception as e:
            print(f"generate_rss_page.py: [backfill] WARNING could not fetch {feed['name']}: {e}")

    for name, url_pattern in PAGINATED_FEEDS.items():
        for page in range(2, BACKFILL_MAX_PAGES + 1):
            url = url_pattern.format(n=page)
            try:
                raw = fetch_feed(url)
                items = parse_items(raw, name)
            except Exception as e:
                print(f"generate_rss_page.py: [backfill] {name} page {page} -> stopped ({e})")
                break
            if not items:
                print(f"generate_rss_page.py: [backfill] {name} page {page} -> 0 items, stopping")
                break
            all_items.extend(items)
            dated = [i for i in items if i["date"]]
            oldest = min((datetime.fromisoformat(i["date"]) for i in dated), default=None)
            print(f"generate_rss_page.py: [backfill] {name} page {page} -> {len(items)} item(s), oldest {oldest}")
            if oldest and oldest < cutoff:
                break

    return [i for i in all_items if matches_keywords(i)]


def run_backfill():
    archive = load_archive()
    new_items = fetch_year_backfill()
    archive, added = merge_and_trim(archive, new_items)
    save_archive(archive)
    print(f"generate_rss_page.py: [backfill] archive now has {len(archive)} item(s) ({added} new)")
    return archive


def render_feed(items):
    if not items:
        return EMPTY_STATE, ""

    rows = []
    for item in items:
        date_str = ""
        if item["date"]:
            try:
                date_str = datetime.fromisoformat(item["date"]).strftime("%b %-d, %Y")
            except ValueError:
                date_str = ""
        title = escape(item["title"])
        source = escape(item["source"])
        rows.append(f"""      <a href="{escape(item['link'])}" class="rss-item-card" target="_blank" rel="nofollow noopener">
        <div class="rss-item-main">
          <span class="rss-item-source">{source}{' &middot; ' + date_str if date_str else ''}</span>
          <h3>{title}</h3>
        </div>
        <span class="rss-item-link">Read &rarr;</span>
      </a>""")

    jsonld_items = ",\n".join(
        '    { "@type": "ListItem", "position": %d, "url": "%s", "name": "%s" }'
        % (i + 1, escape(item["link"], quote=True), escape(item["title"], quote=True))
        for i, item in enumerate(items)
    )

    grid = f"""    <div class="rss-grid">
{chr(10).join(rows)}
    </div>"""
    return grid, jsonld_items


def paginate(items):
    if len(items) <= PAGE_SIZE:
        return [items]
    return [items[i:i + PAGE_SIZE] for i in range(0, len(items), PAGE_SIZE)]


def page_filename(page_num):
    return OUTPUT_FILE if page_num == 1 else PAGE_FILE_PATTERN.format(n=page_num)


def render_pagination_nav(page_num, total_pages):
    if total_pages <= 1:
        return ""
    prev_link = ""
    if page_num > 1:
        prev_link = f'<a href="{page_filename(page_num - 1)}" class="rss-pagination-link">&larr; Newer</a>'
    next_link = ""
    if page_num < total_pages:
        next_link = f'<a href="{page_filename(page_num + 1)}" class="rss-pagination-link">Older &rarr;</a>'
    numbers = " ".join(
        f'<a href="{page_filename(n)}" class="rss-pagination-num{" active" if n == page_num else ""}">{n}</a>'
        for n in range(1, total_pages + 1)
    )
    return (
        '    <nav class="rss-pagination" aria-label="Archive pages">\n'
        f'      {prev_link}\n'
        f'      <div class="rss-pagination-nums">{numbers}</div>\n'
        f'      {next_link}\n'
        '    </nav>'
    )


def clean_stale_pages(total_pages):
    """Removes leftover rss-page-N.html files from a previous run where the
    archive had more pages than it does now (e.g. after year-rollover
    trimming), so old page URLs don't linger as broken/orphaned pages."""
    n = total_pages + 1
    while True:
        path = page_filename(n)
        if not os.path.exists(path):
            break
        os.remove(path)
        print(f"generate_rss_page.py: removed stale {path}")
        n += 1


def main():
    os.chdir(SITE_DIR)

    items = run_backfill() if "--backfill" in sys.argv else update_archive()
    pages = paginate(items)
    total_pages = len(pages)

    for page_num, page_items in enumerate(pages, start=1):
        feed_html, jsonld_items = render_feed(page_items)
        jsonld = ""
        if jsonld_items:
            jsonld = (
                '<script type="application/ld+json">\n'
                '{\n  "@context": "https://schema.org",\n  "@type": "ItemList",\n  "itemListElement": [\n'
                f"{jsonld_items}\n  ]\n}}\n</script>\n"
            )
        title_suffix = f" | Page {page_num}" if total_pages > 1 and page_num > 1 else ""
        desc_suffix = f" (Page {page_num} of {total_pages})" if total_pages > 1 and page_num > 1 else ""

        page = PAGE_TEMPLATE.format(
            css_v=CSS_VERSION,
            js_v=JS_VERSION,
            feed_html=feed_html,
            jsonld=jsonld,
            title_suffix=title_suffix,
            desc_suffix=desc_suffix,
            pagination_nav=render_pagination_nav(page_num, total_pages),
        )
        filename = page_filename(page_num)
        with open(filename, "w", encoding="utf-8") as f:
            f.write(page)
        print(f"generate_rss_page.py: wrote {filename} with {len(page_items)} curated item(s)")

    clean_stale_pages(total_pages)


if __name__ == "__main__":
    sys.exit(main())
