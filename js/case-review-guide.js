// Idle-nudge guide character for the case review quiz. Kept separate from
// case-review.js (which owns the quiz's step state) rather than reaching
// into its closure - this reads the active step straight off the DOM
// (case-review.js's showStep() toggles a plain .active class per .cr-step,
// see js/case-review.js) so the two files stay independent.
(function(){
  const card = document.getElementById('crCard');
  const guide = document.getElementById('crGuide');
  if(!card || !guide) return;

  const bubbleText = document.getElementById('crGuideBubbleText');
  const cursor = document.getElementById('crGuideCursor');

  const MESSAGE_DEFAULT = "Keep going! You're doing great so far. Just need a little more information.";
  const MESSAGE_STEP_9 = "This is helpful information! Just a couple more questions until you're finished.";
  const IDLE_MS = 15000;
  const TYPE_SPEED = 26;
  const HOLD_AFTER_TYPE = 5000;

  let lastActivity = Date.now();
  let isActive = false;
  let typeTimer = null;
  let holdTimer = null;
  let charIndex = 0;
  let currentMessage = '';

  function markActivity(){
    lastActivity = Date.now();
  }
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'input', 'change'].forEach(function(evt){
    window.addEventListener(evt, markActivity, { passive: true });
  });

  function activeStep(){
    const el = card.querySelector('.cr-step.active');
    return el ? el.dataset.step : null;
  }

  function messageForStep(step){
    return step === '9' ? MESSAGE_STEP_9 : MESSAGE_DEFAULT;
  }

  function reset(){
    clearTimeout(typeTimer);
    clearTimeout(holdTimer);
    guide.classList.remove('is-in', 'is-bubble-in', 'is-out');
    bubbleText.textContent = '';
    cursor.classList.remove('hide');
    charIndex = 0;
  }

  function typeNext(){
    if(charIndex <= currentMessage.length){
      bubbleText.textContent = currentMessage.slice(0, charIndex);
      charIndex++;
      typeTimer = setTimeout(typeNext, TYPE_SPEED);
    } else {
      cursor.classList.add('hide');
      holdTimer = setTimeout(poofOut, HOLD_AFTER_TYPE);
    }
  }

  function poofIn(){
    // The result screen has already been submitted/decided - an "almost
    // done" nudge doesn't make sense there, so skip it.
    const step = activeStep();
    if(!step || step === 'result') return;

    reset();
    currentMessage = messageForStep(step);
    isActive = true;
    guide.classList.add('is-in');
    setTimeout(function(){
      if(!isActive) return;
      guide.classList.add('is-bubble-in');
      typeNext();
    }, 260);
  }

  function poofOut(){
    if(!isActive) return;
    clearTimeout(typeTimer);
    clearTimeout(holdTimer);
    isActive = false;
    guide.classList.remove('is-in', 'is-bubble-in');
    guide.classList.add('is-out');
    // Start a fresh 15s idle window from the moment it leaves, rather than
    // from whatever old timestamp lastActivity already held - otherwise it
    // could immediately re-trigger a second after dismissing.
    lastActivity = Date.now();
  }

  // Dismiss immediately if the quiz moves to a different step while the
  // guide is showing, rather than waiting out the 5s hold.
  let lastSeenStep = activeStep();
  const observer = new MutationObserver(function(){
    const step = activeStep();
    if(step !== lastSeenStep){
      lastSeenStep = step;
      if(isActive) poofOut();
    }
  });
  observer.observe(card, { attributes: true, attributeFilter: ['class'], subtree: true });

  setInterval(function(){
    if(isActive) return;
    if(Date.now() - lastActivity >= IDLE_MS){
      poofIn();
    }
  }, 1000);
})();
