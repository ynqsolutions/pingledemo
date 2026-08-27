# Pingle Law Website

Static HTML/CSS/JS marketing site for the Law Offices of Corey A. Pingle (California employment attorney), deployed to Netlify. No build step, no framework.

## Cache-busting

`netlify.toml` sets short cache headers (`max-age=600`) for `/css/*` and `/js/*`. Every time `css/style.css` or `js/main.js` changes, bump the `?v=N` query string on **every** HTML file's `<link>`/`<script>` tag that references it:

```bash
grep -rl 'style.css?v=OLD' --include='*.html' . | xargs sed -i '' 's/style\.css?v=OLD/style.css?v=NEW/g'
```

## Title tag / SEO convention

All **indexable** pages (no `<meta name="robots" content="noindex">`) must follow this pattern:

- **State-level pages** (home, about, FAQ, case review, contact, practice area overviews, etc.): mention **California** once in the title. Do not list multiple cities in the title — it dilutes relevance and reads as keyword-stuffed to search engines. Example: `Free Case Review | California Employment Lawyer | Pingle Law`.
- **City-specific landing pages** (future pages targeting one city, e.g. `beverly-hills-employment-lawyer.html`): mention **that one city** in the title, not the full service-area list. Example: `Employment Lawyer in Beverly Hills, CA | Pingle Law`.
- Meta descriptions are the right place to list the full service area (Fountain Valley, Beverly Hills, San Bernardino, San Diego, San Francisco, Sacramento) — titles should stay focused and under ~60-65 characters where possible.
- `noindex` pages (privacy policy, terms, disclaimer, sitemap, thank-you, 404) are excluded from search results — don't spend SEO effort optimizing their titles.

## Footer

All indexable pages use the same footer (firm blurb + newsletter form, Contact + social icons, Explore links, Service Area list), with Privacy/Terms/Disclaimer/Sitemap only in the bottom bar — not the four legal pages themselves, which use a simpler footer without the newsletter/social/Service Area column.
