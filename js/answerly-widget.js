// Answerly chat widget loader.
//
// This is the vendor's embed snippet, moved out of an inline <script> and
// into this file so the site's Content-Security-Policy doesn't have to
// allow inline scripts just to bootstrap it (same approach as
// js/behold-widget.js). The snippet itself is unchanged: it appends a
// <script src="https://fcdn.answerly.io/fn.js"> tag carrying the account's
// companyId, which fn.js then reads back off that tag via [data-companyId].
//
// fn.js in turn renders the widget inside an iframe built with srcdoc. A
// srcdoc iframe inherits this page's CSP, and the markup fn.js writes into
// it contains inline <script> blocks with runtime-generated content (no
// stable hash, and nonces aren't inherited into srcdoc). That is why
// script-src in netlify.toml has to carry 'unsafe-inline' for the widget
// to run at all, and frame-src has to include 'self' for the srcdoc frame
// to be created. See the CSP comment in netlify.toml.
//
// On the home page the chat launcher would otherwise sit on screen next to
// the hero video, competing with it. So there, loading is held back until
// the hero has been scrolled past. This defers the whole third-party
// script rather than rendering it and hiding it with CSS: nothing about
// the widget's own markup or class names has to be known or fought with,
// and the home page doesn't pay for the request until it's wanted.
//
// Note that 12 other pages use this same hero video component (the six
// city landing pages, in both languages). They are deliberately NOT
// deferred here, per instruction that only the home page should wait. To
// extend the behavior to them, add their paths to DEFER_UNTIL_PAST_HERO
// below, or switch the isDeferredPage check to simply test for the
// presence of the hero element.
(function () {
  var COMPANY_ID = '3674edbd-9075-4f75-b7aa-4808b9b3777a';
  var HERO_SELECTOR = '.hero';
  // Pathnames whose hero must be scrolled past before the widget loads.
  var DEFER_UNTIL_PAST_HERO = ['/', '/index.html', '/index-es.html'];

  function loadWidget() {
    if (window.__answerlyLoaded) return;
    window.__answerlyLoaded = true;
    var n = document.createElement('script');
    n.src = 'https://fcdn.answerly.io/fn.js';
    n.setAttribute('data-companyId', COMPANY_ID);
    document.getElementsByTagName('html')[0].insertAdjacentElement('beforeend', n);
  }

  // Normalize a trailing slash so "/index.html" and "/" both match, and so
  // a stray "/index.html/" doesn't slip past.
  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  var isDeferredPage = DEFER_UNTIL_PAST_HERO.indexOf(path) !== -1;
  var hero = isDeferredPage ? document.querySelector(HERO_SELECTOR) : null;

  // Any page without a hero to wait on (every page but the home page, and
  // the home page too if its markup ever changes) loads immediately.
  if (!hero) {
    loadWidget();
    return;
  }

  // One predicate for "the hero is fully behind us", driven by several
  // triggers. Keeping the test in one place means every trigger agrees on
  // what "scrolled past" means, rather than relying on IntersectionObserver's
  // isIntersecting, which also flips when merely the last pixel leaves.
  var observer = null;
  function heroIsPassed() {
    return hero.getBoundingClientRect().bottom <= 0;
  }
  function maybeLoad() {
    if (!heroIsPassed()) return;
    window.removeEventListener('scroll', maybeLoad);
    window.removeEventListener('resize', maybeLoad);
    if (observer) observer.disconnect();
    loadWidget();
  }

  // Scroll is the trigger that actually matters, and it fires even when
  // IntersectionObserver callbacks are being withheld (browsers defer those
  // while the document is hidden). Resize covers the hero changing height
  // under a reader who is already part-way down the page.
  window.addEventListener('scroll', maybeLoad, { passive: true });
  window.addEventListener('resize', maybeLoad, { passive: true });

  // IntersectionObserver is the cheap path in normal use: it lets the
  // browser do the geometry work off the main thread instead of on every
  // scroll event.
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(maybeLoad, { threshold: 0 });
    observer.observe(hero);
  }

  // Covers landing already scrolled past the hero, e.g. a refresh part-way
  // down the page or an in-page anchor, where no scroll event ever fires.
  maybeLoad();
})();
