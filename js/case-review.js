(function(){
  const card = document.getElementById('crCard');
  if(!card) return;

  const steps = Array.from(card.querySelectorAll('.cr-step'));
  const totalQuestionSteps = 10; // steps 1-10; the result panel isn't counted in the progress bar
  const progressTrack = document.getElementById('crProgressTrack');
  const progressLabel = document.getElementById('crProgressLabel');
  const stepNum = document.getElementById('crStepNum');

  const defaultAnswers = () => ({
    whatHappened: [],
    otherText: '',
    stillEmployed: '',
    incidentTiming: '',
    inCalifornia: '',
    companySize: '',
    filedWithAgency: '',
    workingWithAttorney: '',
    documentation: [],
    anythingElse: '',
    fullName: '',
    phone: '',
    email: '',
    bestTimeToCall: ''
  });
  let answers = defaultAnswers();

  let current = 1;

  // Prefill contact fields if the homepage teaser form passed them along.
  (function prefillFromQuery(){
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const phone = params.get('phone');
    if(name) document.getElementById('crName').value = name;
    if(phone) document.getElementById('crPhone').value = formatPhone(phone);
  })();

  // ---- Build the progress bar ----
  for(let i = 1; i <= totalQuestionSteps; i++){
    const seg = document.createElement('div');
    seg.className = 'cr-progress-seg';
    seg.dataset.seg = i;
    seg.innerHTML = '<span></span>';
    progressTrack.appendChild(seg);
  }

  function updateProgress(){
    const segs = progressTrack.querySelectorAll('.cr-progress-seg');
    segs.forEach(seg => {
      const i = Number(seg.dataset.seg);
      seg.classList.toggle('done', i < current);
      seg.classList.toggle('current', i === current);
    });
    if(current <= totalQuestionSteps){
      progressLabel.textContent = 'Step ' + current + ' of ' + totalQuestionSteps;
      stepNum.textContent = String(current).padStart(2, '0');
      stepNum.style.display = '';
    } else {
      progressLabel.textContent = 'Your Results';
      stepNum.style.display = 'none';
    }
  }

  // Switching steps swaps content height. Holding scroll position steady
  // sounds safer than moving the page, but on mobile it backfires: a step
  // reached from a much taller one (or from submitting on step 10) can
  // leave the visitor scrolled past the new step's content entirely,
  // looking blank until they scroll back up to find it. Instead, scroll
  // the card's top to sit just under the sticky header on every step
  // change, so the new question is always what's actually on screen.
  function scrollCardIntoView(){
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 61;
    const top = card.getBoundingClientRect().top + window.scrollY - headerH - 16;
    window.scrollTo({ top: Math.max(top, 0), behavior: 'instant' });
  }
  function showStep(target){
    steps.forEach(s => s.classList.toggle('active', s.dataset.step === String(target)));
    current = target;
    updateProgress();
    scrollCardIntoView();
  }

  // ---- Option tile handling (single + multi select) ----
  card.querySelectorAll('.cr-options').forEach(group => {
    const isMulti = group.dataset.multi === 'true';
    const field = group.dataset.field;
    const stepEl = group.closest('.cr-step');
    const nextBtn = stepEl.querySelector('[data-next]');
    const otherField = stepEl.querySelector('.cr-other-field');

    function collectMultiValues(){
      return Array.from(group.querySelectorAll('.cr-opt.selected')).map(o => {
        if(o.dataset.other === 'true'){
          const input = otherField ? otherField.querySelector('input') : null;
          const text = input ? input.value.trim() : '';
          return text ? 'Other: ' + text : 'Other';
        }
        return o.textContent.trim();
      });
    }

    group.querySelectorAll('.cr-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        if(isMulti){
          if(opt.dataset.clearsSiblings === 'true'){
            group.querySelectorAll('.cr-opt').forEach(o => { if(o !== opt) o.classList.remove('selected'); });
            opt.classList.toggle('selected');
          } else {
            group.querySelectorAll('.cr-opt[data-clears-siblings="true"]').forEach(o => o.classList.remove('selected'));
            opt.classList.toggle('selected');
          }
          if(opt.dataset.other === 'true' && otherField){
            const isSelected = opt.classList.contains('selected');
            otherField.hidden = !isSelected;
            if(isSelected) otherField.querySelector('input').focus();
          }
          answers[field] = collectMultiValues();
          if(nextBtn){
            const ready = answers[field].length > 0;
            nextBtn.toggleAttribute('disabled', !ready);
            nextBtn.classList.toggle('is-ready', ready);
          }
        } else {
          group.querySelectorAll('.cr-opt').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          answers[field] = opt.dataset.value;
          if(nextBtn){
            nextBtn.removeAttribute('disabled');
            nextBtn.classList.add('is-ready');
          }
        }
        const err = stepEl.querySelector('.cr-error');
        if(err) err.classList.remove('show');
      });
    });

    // Keep the "Other" free-text answer in sync as the visitor types.
    if(otherField){
      const input = otherField.querySelector('input');
      input.addEventListener('input', () => {
        answers.otherText = input.value.trim();
        answers[field] = collectMultiValues();
      });
    }
  });

  // ---- Select / textarea / text inputs ----
  card.querySelectorAll('select[data-field], textarea[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      answers[el.dataset.field] = el.value;
      const stepEl = el.closest('.cr-step');
      const nextBtn = stepEl.querySelector('[data-next]');
      if(nextBtn && el.value){
        nextBtn.removeAttribute('disabled');
        nextBtn.classList.add('is-ready');
      }
      const err = stepEl.querySelector('.cr-error');
      if(err) err.classList.remove('show');
    });
  });

  // ---- Phone formatting: always render as XXX-XXX-XXXX while typing ----
  function formatPhone(value){
    const digits = (value || '').replace(/\D/g, '').slice(0, 10);
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 10);
    let out = part1;
    if(part2) out += '-' + part2;
    if(part3) out += '-' + part3;
    return out;
  }
  // (Live formatting while typing is handled site-wide in main.js for any
  // input[type="tel"]; formatPhone here is only used for the query-param prefill above.)

  // ---- Back / Next navigation ----
  card.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepEl = btn.closest('.cr-step');
      const n = Number(stepEl.dataset.step);
      if(n > 1) showStep(n - 1);
    });
  });

  card.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stepEl = btn.closest('.cr-step');
      const n = Number(stepEl.dataset.step);
      const err = stepEl.querySelector('.cr-error');

      // Multi-select steps: require at least one selection (validated via disabled state
      // already for single-select; here we double-check multi-select and free-text steps).
      const group = stepEl.querySelector('.cr-options[data-multi="true"]');
      if(group && answers[group.dataset.field].length === 0){
        if(err) err.classList.add('show');
        return;
      }

      if(n < totalQuestionSteps){
        showStep(n + 1);
      }
    });
  });

  // ---- Step 10 contact fields: gold up the button once all four are filled ----
  const seeResultsBtn = document.getElementById('crSeeResults');
  const CR_STEP10_FIELDS = ['crName', 'crPhone', 'crEmail', 'crBestTime'];
  function step10Ready(){
    return CR_STEP10_FIELDS.every(fid => document.getElementById(fid).value.trim());
  }
  CR_STEP10_FIELDS.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      seeResultsBtn.classList.toggle('is-ready', step10Ready());
    });
    document.getElementById(id).addEventListener('change', () => {
      seeResultsBtn.classList.toggle('is-ready', step10Ready());
    });
  });

  // ---- Step 10 -> compute + show result ----
  seeResultsBtn.addEventListener('click', () => {
    const stepEl = seeResultsBtn.closest('.cr-step');
    const err = stepEl.querySelector('.cr-error');
    const name = document.getElementById('crName').value.trim();
    const phone = document.getElementById('crPhone').value.trim();
    const email = document.getElementById('crEmail').value.trim();
    const bestTime = document.getElementById('crBestTime').value;
    const phoneDigits = phone.replace(/\D/g, '');

    if(!name || phoneDigits.length !== 10 || !email || !bestTime){
      err.classList.add('show');
      return;
    }
    err.classList.remove('show');
    answers.fullName = name;
    answers.phone = phone;
    answers.email = email;
    answers.bestTimeToCall = bestTime;

    renderResult();
    showStep('result');
  });

  // ---- Qualification logic ----
  function computeOutcome(){
    const isMaybe =
      answers.stillEmployed === 'yes' ||
      answers.incidentTiming === 'over-3-years' ||
      answers.inCalifornia === 'no' ||
      answers.workingWithAttorney === 'yes';
    return isMaybe ? 'maybe' : 'strong';
  }

  function renderResult(){
    const outcome = computeOutcome();
    answers.outcome = outcome;
    const resultContent = document.getElementById('crResultContent');

    const consentHtml = `
      <label class="cr-consent">
        <input type="checkbox" id="crConsent">
        <span>I have reviewed the <a href="terms-of-use.html" target="_blank" rel="noopener">Terms of Use</a> and <a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>, understand this does not create an attorney-client relationship, and want to move forward.</span>
      </label>
    `;

    const strongHtml = `
      <span class="cr-result-badge cr-badge-strong">Likely a strong case</span>
      <h2>Based on your answers, <em>this looks worth pursuing.</em></h2>
      <p>Nothing here rules your case out, and several of your answers are exactly the kind of thing employment attorneys look for. The next step is a free, no-obligation conversation with our office to go over the details and what your options actually look like.</p>
      ${consentHtml}
      <div class="cr-result-actions">
        <button type="button" class="btn btn-gold" id="crRequestConsult" disabled>Request a Consultation</button>
        <button type="button" class="cr-restart-link" id="crRestart">Restart Review</button>
      </div>
      <p class="fine">This is not a legal opinion. Only a licensed attorney reviewing your full situation can tell you whether you have a case.</p>
    `;

    const maybeHtml = `
      <span class="cr-result-badge cr-badge-maybe">Worth a conversation</span>
      <h2>Your situation has <em>some complicating factors</em> &mdash; but that doesn't rule it out.</h2>
      <p>One or more of your answers can change your options or timeline. That doesn't mean there's no case. It just means an attorney needs to look at the specifics before anyone can say for sure.</p>
      ${consentHtml}
      <div class="cr-result-actions">
        <button type="button" class="btn btn-gold" id="crRequestConsult" disabled>Request a Consultation</button>
        <button type="button" class="cr-restart-link" id="crRestart">Restart Review</button>
      </div>
      <p class="fine">This is not a legal opinion. Only a licensed attorney reviewing your full situation can tell you whether you have a case.</p>
    `;

    resultContent.innerHTML = outcome === 'strong' ? strongHtml : maybeHtml;

    const consentBox = document.getElementById('crConsent');
    const requestBtn = document.getElementById('crRequestConsult');
    consentBox.addEventListener('change', () => {
      requestBtn.toggleAttribute('disabled', !consentBox.checked);
    });
    requestBtn.addEventListener('click', submitCaseReview);
    document.getElementById('crRestart').addEventListener('click', restartReview);
  }

  // ---- Restart: clear everything and go back to step 1 ----
  function restartReview(){
    answers = defaultAnswers();
    card.querySelectorAll('.cr-opt.selected').forEach(o => o.classList.remove('selected'));
    card.querySelectorAll('.cr-other-field').forEach(f => { f.hidden = true; f.querySelector('input').value = ''; });
    card.querySelectorAll('select[data-field]').forEach(s => { s.value = ''; });
    card.querySelectorAll('textarea[data-field]').forEach(t => { t.value = ''; });
    document.getElementById('crName').value = '';
    document.getElementById('crPhone').value = '';
    document.getElementById('crEmail').value = '';
    document.getElementById('crBestTime').value = '';
    card.querySelectorAll('[data-next]').forEach(btn => {
      const stepEl = btn.closest('.cr-step');
      const isOptional = stepEl && (stepEl.dataset.step === '9');
      btn.toggleAttribute('disabled', !isOptional);
      btn.classList.toggle('is-ready', isOptional);
    });
    seeResultsBtn.classList.remove('is-ready');
    card.querySelectorAll('.cr-error.show').forEach(e => e.classList.remove('show'));
    showStep(1);
  }

  // ---- Submit to Netlify Forms, then show a thank-you state ----
  function encode(data){
    return Object.keys(data)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
      .join('&');
  }

  // Surfaces computeOutcome()'s already-existing qualification signal as a
  // plain-language priority label, and put up front (see field order below
  // and in the matching hidden schema form in the HTML) so it's the first
  // thing visible in Netlify's notification email instead of buried at the
  // bottom under nine other fields.
  function priorityLabel(outcome){
    return outcome === 'strong'
      ? 'HIGH PRIORITY - Strong Case'
      : 'Standard Priority - Needs Attorney Review';
  }

  function submitCaseReview(e){
    const btn = e.currentTarget;
    const resultContent = document.getElementById('crResultContent');
    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Sending...';

    const payload = {
      'form-name': 'case-review',
      priority: priorityLabel(answers.outcome),
      fullName: answers.fullName,
      phone: answers.phone,
      email: answers.email,
      bestTimeToCall: answers.bestTimeToCall,
      whatHappened: answers.whatHappened.join('; '),
      stillEmployed: answers.stillEmployed,
      incidentTiming: answers.incidentTiming,
      inCalifornia: answers.inCalifornia,
      companySize: answers.companySize,
      filedWithAgency: answers.filedWithAgency,
      workingWithAttorney: answers.workingWithAttorney,
      documentation: answers.documentation.join('; '),
      anythingElse: answers.anythingElse,
      outcome: answers.outcome
    };

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(payload)
    })
      .then(() => {
        resultContent.innerHTML = `
          <span class="cr-result-badge cr-badge-strong">Request sent</span>
          <h2>Thank you, ${escapeHtml(answers.fullName.split(' ')[0] || '')}. <em>We've got your details.</em></h2>
          <p>Someone from our office will reach out to ${escapeHtml(answers.phone)} or ${escapeHtml(answers.email)} shortly to schedule your free consultation.</p>
          <div class="cr-result-actions">
            <a href="index.html" class="btn btn-navy">Back to Home</a>
          </div>
        `;
      })
      .catch(() => {
        btn.removeAttribute('disabled');
        btn.textContent = 'Request a Consultation';
        const fine = resultContent.querySelector('.fine');
        if(fine) fine.textContent = 'Something went wrong sending your request. Please call us instead at (714) 593-2306.';
      });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  updateProgress();
})();
