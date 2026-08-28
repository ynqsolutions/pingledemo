#!/usr/bin/env python3
"""
Generates a blog-<slug>.html page for every Markdown file in content/blog/,
so posts created through the /admin CMS turn into real, crawlable, static
pages the same way the rest of this site works (see CLAUDE.md: no build
step beyond simple generator scripts like generate_sitemap.py, which this
follows the same pattern as).

Each content/blog/*.md file has simple frontmatter:

    ---
    title: Page Title Here
    date: 2026-01-01
    ---
    Body content in Markdown.

Only a small, dependency-free Markdown subset is supported (paragraphs,
##/### headings, **bold**, *italic*, [links](url), and - bullet lists) —
intentionally minimal so this never depends on a pip package being present
in Netlify's build image.

Runs automatically on each Netlify deploy (see netlify.toml's build
command), same as generate_sitemap.py.
"""
import glob
import html
import os
import re
import sys

SITE_DIR = os.path.dirname(os.path.abspath(__file__))
BLOG_CONTENT_DIR = os.path.join(SITE_DIR, "content", "blog")

CSS_VERSION = "247"
JS_VERSION = "69"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} | Pingle Law</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=block" rel="stylesheet">
<link rel="stylesheet" href="css/style.css?v={css_v}">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="assets/favicon-192.png">
<link rel="apple-touch-icon" href="assets/favicon-180.png">
<link rel="stylesheet" href="css/a11y-widget.css?v=9">
</head>
<body class="page-article">

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
<section class="about-hero">
  <div class="wrap">
    <a href="resources.html" class="blog-back-link">&larr; Back to Resources</a>
    <div class="about-hero-inner">
      <h1>{title}</h1>
    </div>
  </div>
</section>

<!-- ============ ARTICLE BODY ============ -->
<section class="legal-body section-divider">
  <div class="wrap legal-body-inner">
{body_html}
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
          <li><a href="results-and-testimonials.html">Results</a></li>
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


def parse_frontmatter(text):
    """Very small '---\\nkey: value\\n---\\nbody' parser (no PyYAML dependency)."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        return {}, text
    raw_fm, body = m.group(1), m.group(2)
    fields = {}
    for line in raw_fm.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields, body


def markdown_to_html(md):
    """Minimal, dependency-free Markdown -> HTML for the CMS body field."""
    md = md.replace("\r\n", "\n").strip()
    blocks = re.split(r"\n\s*\n", md)
    html_blocks = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if block.startswith("### "):
            html_blocks.append(f"    <h3>{inline_md(block[4:])}</h3>")
        elif block.startswith("## "):
            html_blocks.append(f"    <h2>{inline_md(block[3:])}</h2>")
        elif block.startswith("# "):
            html_blocks.append(f"    <h2>{inline_md(block[2:])}</h2>")
        elif re.match(r"^[-*]\s+", block):
            items = [re.sub(r"^[-*]\s+", "", line) for line in block.splitlines() if line.strip()]
            lis = "\n".join(f"      <li>{inline_md(i)}</li>" for i in items)
            html_blocks.append(f"    <ul>\n{lis}\n    </ul>")
        else:
            paragraph = " ".join(line.strip() for line in block.splitlines())
            html_blocks.append(f"    <p>{inline_md(paragraph)}</p>")
    return "\n".join(html_blocks)


def inline_md(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    text = re.sub(r"\[(.+?)\]\((https?://[^\s)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    return text


def build_posts():
    if not os.path.isdir(BLOG_CONTENT_DIR):
        print("generate_blog_posts.py: no content/blog directory, nothing to do")
        return 0

    count = 0
    for filepath in sorted(glob.glob(os.path.join(BLOG_CONTENT_DIR, "*.md"))):
        slug = os.path.splitext(os.path.basename(filepath))[0]
        with open(filepath, "r", encoding="utf-8") as f:
            raw = f.read()

        fields, body_md = parse_frontmatter(raw)
        title = fields.get("title", slug.replace("-", " ").title())
        body_html = markdown_to_html(body_md)

        first_p = re.search(r"<p>(.*?)</p>", body_html)
        description = html.unescape(re.sub("<[^>]+>", "", first_p.group(1)))[:155] if first_p else title

        page = PAGE_TEMPLATE.format(
            title=html.escape(title, quote=True),
            description=html.escape(description, quote=True),
            body_html=body_html,
            css_v=CSS_VERSION,
            js_v=JS_VERSION,
        )

        out_path = os.path.join(SITE_DIR, f"blog-{slug}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)
        count += 1
        print(f"generate_blog_posts.py: wrote {out_path}")

    print(f"generate_blog_posts.py: generated {count} post(s)")
    return 0


if __name__ == "__main__":
    sys.exit(build_posts())
