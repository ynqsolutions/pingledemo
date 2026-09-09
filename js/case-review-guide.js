// Guide character for the case review quiz. Kept separate from
// case-review.js (which owns the quiz's step state) rather than reaching
// into its closure - this reads the active step straight off the DOM
// (case-review.js's showStep() toggles a plain .active class per .cr-step,
// see js/case-review.js) so the two files stay independent.
//
// Trigger rules (deliberately narrow, per feedback that a broad "any
// mouse/keyboard/scroll activity" definition almost never accumulates 15
// idle seconds during normal form-filling, so the guide never appeared):
//   - Default message: no click on a "Continue" button for 15s. Only
//     Continue clicks reset this clock - not mouse movement, scrolling,
//     typing, or any other interaction.
//   - Step 9 message: only on step 9, and only once per page load. Fires
//     on whichever happens first - typing more than 15 words into that
//     step's textarea, or the same 15s-since-Continue idle rule.
//
// The markup itself (case-review.html) lives inside .cr-wrap and is
// position:absolute relative to it, not position:fixed to the viewport -
// so it's structurally confined to that tan quiz section and scrolls away
// with it, rather than needing JS to track whether it's currently on
// screen (an earlier fixed-position version tried that with an
// IntersectionObserver, which occasionally raced page layout on its first
// callback and got permanently stuck reporting "not visible").
(function(){
  const card = document.getElementById('crCard');
  const guide = document.getElementById('crGuide');
  if(!card || !guide) return;

  const bubbleText = document.getElementById('crGuideBubbleText');
  const cursor = document.getElementById('crGuideCursor');
  const step9Textarea = document.getElementById('crAnythingElse');

  const MESSAGE_DEFAULT = "Keep going! You're doing great so far. Just need a little more information.";
  const MESSAGE_STEP_9 = "This is helpful information! Just a couple more questions until you're finished.";
  const IDLE_MS = 15000;
  const STEP_9_WORD_THRESHOLD = 15;
  const TYPE_SPEED = 26;
  const HOLD_AFTER_TYPE = 5000;

  let lastContinueClick = Date.now();
  let isActive = false;
  let step9MessageShown = false;
  let typeTimer = null;
  let holdTimer = null;
  let charIndex = 0;
  let currentMessage = '';

  // Only a Continue click resets the idle clock - delegated so it covers
  // the Continue button on every step without needing 10 listeners.
  card.addEventListener('click', function(e){
    if(e.target.closest('.cr-btn-next[data-next]')){
      lastContinueClick = Date.now();
    }
  });

  function activeStep(){
    const el = card.querySelector('.cr-step.active');
    return el ? el.dataset.step : null;
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

  function poofIn(message){
    reset();
    currentMessage = message;
    isActive = true;
    // Sync the step-change watchdog right now, in case a step-change
    // mutation is still queued (not yet delivered to the observer) at the
    // exact moment this fires - otherwise that stale callback would see
    // isActive just turned true and immediately dismiss what just opened.
    lastSeenStep = activeStep();
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
    // Start a fresh 15s window from the moment it leaves, rather than from
    // whatever old click timestamp already applied - otherwise it could
    // immediately re-trigger a second after dismissing.
    lastContinueClick = Date.now();
  }

  // Dismiss immediately if the quiz moves to a different step while the
  // guide is showing, rather than waiting out the 5s hold.
  let lastSeenStep = activeStep();
  const stepObserver = new MutationObserver(function(){
    const step = activeStep();
    if(step !== lastSeenStep){
      lastSeenStep = step;
      if(isActive) poofOut();
    }
  });
  stepObserver.observe(card, { attributes: true, attributeFilter: ['class'], subtree: true });

  // Step 9's "couple more questions" nudge fires early the moment someone
  // writes a substantial answer, instead of waiting out the idle timer.
  if(step9Textarea){
    step9Textarea.addEventListener('input', function(){
      if(step9MessageShown || isActive) return;
      if(activeStep() !== '9') return;
      const wordCount = step9Textarea.value.trim().split(/\s+/).filter(Boolean).length;
      if(wordCount > STEP_9_WORD_THRESHOLD){
        step9MessageShown = true;
        poofIn(MESSAGE_STEP_9);
      }
    });
  }

  setInterval(function(){
    if(isActive) return;
    const step = activeStep();
    if(!step || step === 'result') return;
    if(Date.now() - lastContinueClick < IDLE_MS) return;

    if(step === '9'){
      if(step9MessageShown) return;
      step9MessageShown = true;
      poofIn(MESSAGE_STEP_9);
    } else {
      poofIn(MESSAGE_DEFAULT);
    }
  }, 1000);
})();
