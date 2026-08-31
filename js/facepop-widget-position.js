// The Answerly/FacePop consultation widget doesn't work under a strict
// Content-Security-Policy (its bootstrap script chains several more
// inline <script>s and pulls fonts/video from vendor domains we can't
// practically allowlist one at a time), so instead of embedding its
// script directly on every page, this creates a small fixed-position
// iframe pointing at facepop-widget-frame.html, which carries its own
// relaxed CSP scoped to just that one sandboxed document (see
// netlify.toml). Real page content and its strict CSP are unaffected.
(function(){
  const MOBILE_BREAKPOINT = 680;
  const WIDGET_WIDTH = 340;
  const WIDGET_HEIGHT = 620;
  const EDGE_GAP = 16;

  const frame = document.createElement('iframe');
  frame.src = 'facepop-widget-frame.html';
  frame.title = 'Consultation widget';
  frame.setAttribute('scrolling', 'no');
  frame.style.position = 'fixed';
  frame.style.right = EDGE_GAP + 'px';
  frame.style.width = WIDGET_WIDTH + 'px';
  frame.style.height = WIDGET_HEIGHT + 'px';
  frame.style.maxWidth = 'calc(100vw - ' + (EDGE_GAP * 2) + 'px)';
  frame.style.border = 'none';
  frame.style.background = 'transparent';
  frame.style.zIndex = '130';
  frame.style.colorScheme = 'normal';

  function reposition(){
    const stickyCta = document.querySelector('.mobile-sticky-cta');
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const stickyVisible = isMobile && stickyCta && getComputedStyle(stickyCta).display !== 'none';
    const clearance = stickyVisible ? stickyCta.getBoundingClientRect().height + EDGE_GAP : EDGE_GAP;
    frame.style.bottom = clearance + 'px';
  }

  window.addEventListener('resize', reposition);
  window.addEventListener('orientationchange', reposition);
  reposition();

  document.body.appendChild(frame);
})();
