#!/usr/bin/env python3
"""
Builds rss.html: a curated feed of recent employment-law news pulled from
outside legal publications, filtered to employment-law keywords. Runs at
Netlify build time (see netlify.toml), same pattern as generate_sitemap.py
and generate_blog_posts.py — no npm dependencies, stdlib only, so it can't
break the build if a feed is slow or unreachable.

Sources: only feeds that are actually publicly fetchable without a login
are wired in. Two were checked live and work (ABA Journal, JURIST). Two
requested sources aren't usable as-is:
  - Law.com's /feed/ redirects into an ALM subscriber login wall.
  - JD Supra doesn't expose a working public RSS endpoint at any of the
    documented or guessed URLs (checked live; some 404, one silently
    serves the normal HTML page instead of XML).
Add a working URL to FEEDS below the moment you have one — everything
else (fetching, filtering, rendering) already supports any number of feeds.

Because these are general legal-news feeds (not employment-only), most
items on any given day won't be employment-related — that's expected.
The page always keeps a solid block of Pingle Law's own written content
above the feed so it's never thin/empty, even on a day with zero matches.
"""
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime
from html import escape, unescape

SITE_DIR = "/Users/yoon/Library/CloudStorage/Dropbox/Personal/Projects/Claude/Pingle Law Website"
OUTPUT_FILE = "rss.html"
CSS_VERSION = "212"
JS_VERSION = "68"
MAX_ITEMS = 24
FETCH_TIMEOUT = 12
USER_AGENT = "PingleLawSite/1.0 (+https://www.pinglelaw.com)"

FEEDS = [
    # General legal-news feeds: broad coverage, so most items on any given
    # day won't be employment-related — that's expected, the keyword filter
    # below does the real work here.
    {"name": "ABA Journal", "url": "https://www.abajournal.com/news/rss", "enabled": True},
    {"name": "JURIST", "url": "https://www.jurist.org/feed/", "enabled": True},
    # Government enforcement feeds: every item here is inherently
    # employment-law news, so these are what actually keeps the page from
    # running dry on a day when the general feeds have nothing on-topic.
    {"name": "U.S. Dept. of Labor", "url": "https://www.dol.gov/rss/releases.xml", "enabled": True},
    {"name": "EEOC", "url": "https://www.eeoc.gov/rss/newsroom", "enabled": True},
    # Law.com's /feed/ requires an ALM subscriber login — not publicly
    # fetchable. Swap in a real URL here if you have one that works
    # without authentication.
    {"name": "Law.com", "url": "https://www.law.com/feed/", "enabled": False},
    # No working public RSS endpoint found for JD Supra as of this writing
    # (checked several documented/guessed URLs live; all failed). Swap in
    # a real URL here the moment you have one.
    {"name": "JD Supra", "url": "https://www.jdsupra.com/law-news/labor-employment/rss/", "enabled": False},
]

KEYWORDS = [
    "employment", "employer", "employee", "workplace", "labor law",
    "wage", "overtime", "minimum wage", "unpaid wages",
    "discrimination", "harassment", "wrongful termination", "retaliation",
    "whistleblower", "eeoc", "nlrb", "feha", "osha", "fmla",
    "union", "unionize", "collective bargaining",
    "severance", "non-compete", "noncompete", "misclassification",
    "independent contractor", "gig worker", "paga",
    "sexual harassment", "pay equity", "equal pay", "layoff", "layoffs",
]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Employment Law News | California | Pingle Law</title>
<meta name="description" content="A regularly updated feed of employment law news and analysis from outside legal publications, curated for California workers by the Law Offices of Corey A. Pingle.">
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
    <h1>Employment Law News From Around the Web</h1>
    <p>A running feed of employment-law coverage from outside legal publications, gathered here and updated automatically so California workers can keep up with the law that affects their job.</p>
  </div>
</section>

<!-- ============ INTRO ============ -->
<section class="practice-overview">
  <div class="wrap section-divider">
    <div class="faq-category-head" style="padding-top:32px; max-width:760px;">
      <span class="eyebrow">Why We Built This</span>
      <h2>Employment law changes constantly</h2>
      <p>New court decisions, agency guidance, and legislation reshape what California employers can and can't do almost every week. This page pulls recent employment-law coverage from national legal publications and surfaces it in one place, so you don't have to track a dozen outlets yourself. If something below sounds like what happened to you, <a href="case-review.html">a free case review</a> can help you understand where you stand.</p>
    </div>
  </div>
</section>

<!-- ============ FEED ============ -->
<section class="resources-section section-divider">
  <div class="wrap">
{feed_html}
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

EMPTY_STATE = """    <div class="section-head" style="text-align:center; max-width:640px; margin:0 auto;">
      <span class="eyebrow">Latest Coverage</span>
      <h2>Nothing employment-specific in the last update</h2>
      <p>This page refreshes automatically and pulls from general legal-news feeds, so some updates won't turn up an employment-law story. Check back soon, or browse our own <a href="resources.html">articles and guides</a> in the meantime.</p>
    </div>"""


def strip_html(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return unescape(text).strip()


def fetch_feed(feed):
    req = urllib.request.Request(feed["url"], headers={"User-Agent": USER_AGENT})
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
            "date": parsed_date,
            "summary": (summary or "")[:220],
        })
    return items


def matches_keywords(item):
    haystack = f"{item['title']} {item['summary']}".lower()
    return any(kw in haystack for kw in KEYWORDS)


def collect_items():
    all_items = []
    for feed in FEEDS:
        if not feed["enabled"]:
            continue
        try:
            raw = fetch_feed(feed)
            items = parse_items(raw, feed["name"])
            all_items.extend(items)
            print(f"generate_rss_page.py: {feed['name']} -> {len(items)} item(s) fetched")
        except Exception as e:
            print(f"generate_rss_page.py: WARNING could not fetch {feed['name']} ({feed['url']}): {e}")

    matched = [i for i in all_items if matches_keywords(i)]
    matched.sort(key=lambda i: i["date"] or 0, reverse=True)
    return matched[:MAX_ITEMS]


def render_feed(items):
    if not items:
        return EMPTY_STATE

    cards = []
    for item in items:
        date_str = item["date"].strftime("%B %-d, %Y") if item["date"] else ""
        summary = escape(item["summary"])
        title = escape(item["title"])
        cards.append(f"""      <a href="{escape(item['link'])}" class="rss-item-card" target="_blank" rel="nofollow noopener">
        <span class="rss-item-source">{escape(item['source'])}{' &middot; ' + date_str if date_str else ''}</span>
        <h3>{title}</h3>
        <p>{summary}</p>
        <span class="rss-item-link">Read on {escape(item['source'])} <span aria-hidden="true">&rarr;</span></span>
      </a>""")

    jsonld_items = ",\n".join(
        '    { "@type": "ListItem", "position": %d, "url": "%s", "name": "%s" }'
        % (i + 1, escape(item["link"], quote=True), escape(item["title"], quote=True))
        for i, item in enumerate(items)
    )

    grid = f"""    <div class="section-head" style="text-align:center; max-width:640px; margin:0 auto 40px;">
      <span class="eyebrow">Latest Coverage</span>
      <h2>Recent employment law stories</h2>
      <p>Pulled automatically from outside legal publications and filtered for employment-law topics. External links open in a new tab.</p>
    </div>
    <div class="rss-grid">
{chr(10).join(cards)}
    </div>"""
    return grid, jsonld_items


def main():
    import os
    os.chdir(SITE_DIR)

    items = collect_items()
    feed_result = render_feed(items)
    if isinstance(feed_result, tuple):
        feed_html, jsonld_items = feed_result
        jsonld = (
            '<script type="application/ld+json">\n'
            '{\n  "@context": "https://schema.org",\n  "@type": "ItemList",\n  "itemListElement": [\n'
            f"{jsonld_items}\n  ]\n}}\n</script>\n"
        )
    else:
        feed_html, jsonld = feed_result, ""

    page = PAGE_TEMPLATE.format(
        css_v=CSS_VERSION,
        js_v=JS_VERSION,
        feed_html=feed_html,
        jsonld=jsonld,
    )
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"generate_rss_page.py: wrote {OUTPUT_FILE} with {len(items)} curated item(s)")


if __name__ == "__main__":
    sys.exit(main())
