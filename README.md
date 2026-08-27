# Pingle Law Website

Static multi-page site. Home page (`index.html`) is built; About, Practice Areas, FAQ, Results, Resources, and Contact are the next pages to build out, matching the nav.

## Structure

```
index.html          Home page
css/style.css        Shared stylesheet
js/main.js            Shared behavior (mobile nav, video dock, FAQ accordion, form submit)
assets/               Images
netlify.toml           Netlify config: headers, caching, redirects
thank-you.html         Netlify Forms success page
404.html                Custom not-found page
robots.txt / sitemap.xml
```

## Deploying to Netlify

This is a static site with no build step — set the publish directory to the repo root (already configured in `netlify.toml`).

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket) and connect it in Netlify, or run `netlify deploy` from the CLI.
2. No environment variables or build command are required.

## Contact form (Netlify Forms)

The form on the home page (`#contact`) is wired for [Netlify Forms](https://docs.netlify.com/manage/forms/setup/):
- `data-netlify="true"` + hidden `form-name` field so Netlify detects it at deploy time.
- A hidden honeypot field (`bot-field`) for spam filtering.
- `js/main.js` submits via `fetch` so the page doesn't reload; it falls back to a normal POST (redirecting to `thank-you.html`) if JavaScript is unavailable.
- Submissions show up under **Site configuration → Forms** in the Netlify dashboard. Set up an email notification there, or a Slack/Zapier integration, so intake doesn't rely on someone checking the dashboard.
- Every future page's form should reuse the same pattern (`data-netlify="true"`, matching `name` attribute, hidden `form-name` input, honeypot field).

## Netlify Identity (future login)

Not enabled yet — there's no admin area or gated content on the site today. When one is needed (e.g. a staff intake dashboard), enable **Identity** in the Netlify dashboard and add the `netlify-identity-widget` script plus a login trigger; no other changes to this codebase are required to adopt it later.

## Security

`netlify.toml` sets, site-wide:
- `Content-Security-Policy` scoped to the fonts, the FacePop video embed, and same-origin assets/scripts.
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.

If a new third-party embed or script is added later, its origin must be added to the relevant CSP directive in `netlify.toml` or it will be blocked.

## Performance / scale

Netlify serves static files from its global CDN, so traffic spikes don't require any infrastructure changes on our end. To keep pages fast as more are added:
- Keep `css/style.css` and `js/main.js` shared across all pages (already cached with `immutable` headers in `netlify.toml`) rather than duplicating per-page styles.
- Use `loading="lazy"` and explicit `width`/`height` on images below the fold, as done on the About photo, to avoid layout shift.
- Prefer the existing Google Fonts `<link>` (already preconnected) over adding new font families.
