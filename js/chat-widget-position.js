// The Chipbot chat widget (js/chat-widget.js) renders its own
// fixed-position button iframe with a hardcoded bottom:5px, which
// sits underneath the mobile sticky CTA bar (Call Now / Free
// Consultation) on phones. This watches for that iframe and, on
// mobile, lifts it above the sticky bar by that bar's actual measured
// height; a MutationObserver on the iframe's own style attribute
// re-applies the override if the widget's script rewrites it (e.g.
// when the chat window opens/closes), and resize/orientationchange
// are covered too.
(function(){
  const MOBILE_BREAKPOINT = 680;
  const EDGE_GAP = 8;
  let frame = null;
  let styleObserver = null;

  function clearance(){
    const stickyCta = document.querySelector('.mobile-sticky-cta');
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const stickyVisible = isMobile && stickyCta && getComputedStyle(stickyCta).display !== 'none';
    return stickyVisible ? stickyCta.getBoundingClientRect().height + EDGE_GAP : EDGE_GAP;
  }

  function reposition(){
    if(!frame || !document.body.contains(frame)) return;
    frame.style.setProperty('bottom', clearance() + 'px', 'important');
  }

  function watchFrame(el){
    frame = el;
    reposition();
    if(styleObserver) styleObserver.disconnect();
    styleObserver = new MutationObserver(reposition);
    styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] });
  }

  const bodyObserver = new MutationObserver(() => {
    if(frame) return;
    const el = document.querySelector('.bot-button-iframe');
    if(el) watchFrame(el);
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', reposition);
  window.addEventListener('orientationchange', reposition);
})();
