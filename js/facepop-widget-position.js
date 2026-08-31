// The Answerly/FacePop widget script (fcdn.answerly.io/iframe.product.js)
// injects its own floating iframe directly into <body> with inline
// fixed positioning we don't control from the embed code itself. On
// mobile, the mobile-sticky-cta bar (Call Now / Free Consultation) is
// pinned to the bottom of the screen, so the widget's default
// bottom-right placement would sit underneath/behind it. This nudges
// the widget's iframe up by the sticky bar's actual rendered height
// whenever it's visible, and re-checks on resize/orientation change
// and whenever the widget itself re-renders.
(function(){
  const MOBILE_BREAKPOINT = 680;
  let widgetFrame = null;

  function findWidgetFrame(){
    if(widgetFrame && document.body.contains(widgetFrame)) return widgetFrame;
    const frames = Array.from(document.querySelectorAll('body > iframe'));
    widgetFrame = frames.find(f => {
      if(f.id === 'netlify-identity-widget') return false;
      if(f.closest('#heroVideoFrame')) return false;
      const src = f.getAttribute('src') || '';
      return src.includes('facepop.io') || src.includes('answerly.io') || src === '';
    }) || null;
    return widgetFrame;
  }

  function reposition(){
    const frame = findWidgetFrame();
    if(!frame) return;

    const stickyCta = document.querySelector('.mobile-sticky-cta');
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const stickyVisible = isMobile && stickyCta && getComputedStyle(stickyCta).display !== 'none';

    if(stickyVisible){
      const clearance = stickyCta.getBoundingClientRect().height + 12;
      frame.style.setProperty('bottom', clearance + 'px', 'important');
    } else {
      frame.style.removeProperty('bottom');
    }
  }

  const observer = new MutationObserver(reposition);
  observer.observe(document.body, { childList: true });

  window.addEventListener('resize', reposition);
  window.addEventListener('orientationchange', reposition);
  reposition();
})();
