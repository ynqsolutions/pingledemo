#!/usr/bin/env python3
"""
Renders the team-card and settlement-tile markup directly into about.html
and results-and-testimonials.html from content/team.json and
content/settlements.json, and the scrolling promo banner above the header
into every page from content/announcement.json, at build time (and
whenever run locally).

This replaced an earlier client-side fetch() approach: fetch() can't read
local files from a file:// page (opening the HTML directly, e.g. by
double-clicking it in Finder/Dropbox, rather than via a server), so the
cards silently failed to render for anyone previewing that way. Baking the
markup into the HTML itself works everywhere — a browser opened directly,
a local server, or the live site — with no JS/fetch dependency, and is
better for SEO besides (the content is in the initial HTML, not something
a crawler has to run JS to see).

The JSON files remain the CMS-editable source of truth (see
admin/config.yml) — this script is what turns an edit there into the
actual page content on the next build.
"""
import glob
import json
import os
import re
import sys
from html import escape

SITE_DIR = os.path.dirname(os.path.abspath(__file__))

TEAM_JSON = "content/team.json"
SETTLEMENTS_JSON = "content/settlements.json"
ANNOUNCEMENT_JSON = "content/announcement.json"
ABOUT_HTML = "about.html"
RESULTS_HTML = "results-and-testimonials.html"

# Matches strictly between the CMS:*:START/END comment markers, not the
# grid's own closing </div> — the generated cards/tiles below are full of
# their own nested </div> tags, so anchoring on "the next </div>" would
# truncate at the first one found instead of the grid's real end.
TEAM_GRID_RE = re.compile(r'(<!-- CMS:TEAM:START -->)(.*?)(<!-- CMS:TEAM:END -->)', re.S)
SETTLEMENT_GRID_RE = re.compile(r'(<!-- CMS:SETTLEMENTS:START -->)(.*?)(<!-- CMS:SETTLEMENTS:END -->)', re.S)
BANNER_RE = re.compile(r'(<!-- CMS:BANNER:START -->\n)(.*?)(\n<!-- CMS:BANNER:END -->)', re.S)

# Repeated several times per half (not just duplicated once) so the
# marquee is always comfortably wider than any real viewport before it
# loops — see the .promo-banner-track / .badge-slider-track comments in
# css/style.css for why a single duplication leaves a visible gap on wide
# screens.
BANNER_REPEATS_PER_HALF = 6


def render_team_card(member):
    name = escape(member.get("name", ""))
    title = escape(member.get("title", ""))
    photo = escape(member.get("photo", ""))
    email = member.get("email", "")
    bio = member.get("bio", "")

    if not bio:
        return f'''      <div class="team-card">
        <div class="polaroid-flip">
          <div class="polaroid-flip-inner">
            <div class="polaroid-face polaroid-front">
              <img src="{photo}" alt="{name}, {title}" loading="lazy" decoding="async">
            </div>
          </div>
        </div>
        <span class="team-card-title">{title}</span>
        <span class="team-card-name">{name}</span>
      </div>'''

    email_html = ""
    if email:
        email_html = f'''
        <a href="mailto:{escape(email)}" class="team-card-email" aria-label="Email {name}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
        </a>'''

    return f'''      <div class="team-card">
        <div class="polaroid-flip" data-flippable tabindex="0" role="button" aria-label="Flip to read {name}'s attorney bio">
          <div class="polaroid-flip-inner">
            <div class="polaroid-face polaroid-front">
              <img src="{photo}" alt="{name}, {title}" loading="lazy" decoding="async">
            </div>
            <div class="polaroid-face polaroid-back">
              <button type="button" class="polaroid-close" data-flip-close aria-label="Close bio">&times;</button>
              <p>{escape(bio)}</p>
            </div>
          </div>
        </div>
        <span class="team-card-title">{title}</span>
        <span class="team-card-name">{name}</span>{email_html}
        <button type="button" class="team-card-readmore" data-flip-trigger>Attorney Bio</button>
      </div>'''


def render_settlement_tile(item):
    amount = escape(item.get("amount", ""))
    classification = escape(item.get("classification", ""))
    occupation = escape(item.get("occupation", ""))
    photo = escape(item.get("photo", ""))
    location = escape(item.get("location", ""))
    description = escape(item.get("description", ""))
    occupation_html = f'\n              <span class="settlement-occupation">{occupation}</span>' if occupation else ""
    return f'''      <div class="settlement-tile" tabindex="0" role="button" aria-label="Flip to read more about this {classification} case">
        <div class="settlement-tile-inner">
          <div class="settlement-face settlement-front">
            <div class="settlement-photo" style="background-image:url('{photo}');" aria-hidden="true"></div>
            <div class="settlement-front-content">
              <span class="settlement-eyebrow">Settlement</span>
              <span class="settlement-amount">{amount}</span>
              <span class="settlement-type">{classification}</span>{occupation_html}
              <span class="settlement-tap-btn">Tap for Details <span aria-hidden="true">&rarr;</span></span>
            </div>
          </div>
          <div class="settlement-face settlement-back">
            <button type="button" class="settlement-tile-close" aria-label="Close">&times;</button>
            <h4>{classification}</h4>
            <span class="settlement-back-location">{location}</span>
            <p>{description}</p>
            <p class="settlement-back-fine">Past results do not guarantee or predict a similar outcome in any future case.</p>
          </div>
        </div>
      </div>'''


def render_banner(message, link_text, href):
    item = f'<span class="promo-banner-item">{escape(message)} <a href="{escape(href)}">{escape(link_text)}</a></span>'
    half = item * BANNER_REPEATS_PER_HALF
    return (
        '<div class="promo-banner" aria-label="Announcement">\n'
        f'  <div class="promo-banner-track">{half}{half}</div>\n'
        '</div>'
    )


def inject(filepath, pattern, rendered_items):
    with open(filepath, encoding="utf-8") as f:
        html = f.read()

    m = pattern.search(html)
    if not m:
        print(f"generate_cms_sections.py: WARNING pattern not found in {filepath}, skipping")
        return False

    body = "\n\n" + "\n\n".join(rendered_items) + "\n\n    "
    new_html = html[:m.start()] + m.group(1) + body + m.group(3) + html[m.end():]
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_html)
    return True


def inject_banner_everywhere(announcement):
    en_banner = render_banner(
        announcement.get("message_en", ""),
        announcement.get("link_text_en", ""),
        "case-review.html",
    )
    es_banner = render_banner(
        announcement.get("message_es", ""),
        announcement.get("link_text_es", ""),
        "case-review-es.html",
    )

    count = 0
    for filepath in sorted(glob.glob("*.html")):
        if not os.path.isfile(filepath):
            continue
        with open(filepath, encoding="utf-8") as f:
            html = f.read()
        if "<!-- CMS:BANNER:START -->" not in html:
            continue
        banner = es_banner if filepath.endswith("-es.html") else en_banner
        new_html = BANNER_RE.sub(lambda m: m.group(1) + banner + m.group(3), html, count=1)
        if new_html != html:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_html)
            count += 1
    return count


def main():
    os.chdir(SITE_DIR)

    with open(TEAM_JSON, encoding="utf-8") as f:
        team = json.load(f).get("members", [])
    with open(SETTLEMENTS_JSON, encoding="utf-8") as f:
        settlements = json.load(f).get("items", [])
    with open(ANNOUNCEMENT_JSON, encoding="utf-8") as f:
        announcement = json.load(f)

    team_cards = [render_team_card(m) for m in team]
    settlement_tiles = [render_settlement_tile(i) for i in settlements]

    ok1 = inject(ABOUT_HTML, TEAM_GRID_RE, team_cards)
    ok2 = inject(RESULTS_HTML, SETTLEMENT_GRID_RE, settlement_tiles)
    banner_count = inject_banner_everywhere(announcement)

    print(f"generate_cms_sections.py: wrote {len(team_cards)} team card(s) into {ABOUT_HTML}" if ok1 else "")
    print(f"generate_cms_sections.py: wrote {len(settlement_tiles)} settlement tile(s) into {RESULTS_HTML}" if ok2 else "")
    print(f"generate_cms_sections.py: wrote promo banner into {banner_count} page(s)")


if __name__ == "__main__":
    sys.exit(main())
