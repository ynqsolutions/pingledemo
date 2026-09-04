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
(function (f, n) {
  if (window.__answerlyLoaded) return;
  window.__answerlyLoaded = true;
  n = document.createElement('script');
  n.src = 'https://fcdn.answerly.io/fn.js';
  n.setAttribute('data-companyId', f);
  document.getElementsByTagName('html')[0].insertAdjacentElement('beforeend', n);
})('3674edbd-9075-4f75-b7aa-4808b9b3777a');
