(function(){
  const hoursInput = document.getElementById('calcHours');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const mealCountEl = document.getElementById('calcMealCount');
  const mealTimeEl = document.getElementById('calcMealTime');
  const restCountEl = document.getElementById('calcRestCount');
  const restTimeEl = document.getElementById('calcRestTime');
  const waiverNoteEl = document.getElementById('calcWaiverNote');
  const waiverNoteTextEl = document.getElementById('calcWaiverNoteText');

  if(!hoursInput || !submitBtn) return;

  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

  function numericValue(el){
    return Math.max(0, parseFloat(el.value) || 0);
  }

  // California rest break table: none under 3.5 hours, 1 for a shift of
  // 3.5 up to 6 hours, then one additional 10-minute break for each
  // further 4-hour block worked (or major fraction of one).
  function restBreaksFor(hours){
    if(hours < 3.5) return 0;
    if(hours <= 6) return 1;
    return 1 + Math.ceil((hours - 6) / 4);
  }

  // Meal breaks: one unpaid 30-minute meal period once a shift exceeds
  // 5 hours, a second once it exceeds 10 hours.
  function mealBreaksFor(hours){
    if(hours > 10) return 2;
    if(hours > 5) return 1;
    return 0;
  }

  function calculate(){
    const hours = numericValue(hoursInput);
    const mealBreaks = mealBreaksFor(hours);
    const restBreaks = restBreaksFor(hours);
    const totalBreaks = mealBreaks + restBreaks;

    amountEl.textContent = `${totalBreaks} break${totalBreaks === 1 ? '' : 's'}`;
    mealCountEl.textContent = mealBreaks;
    mealTimeEl.textContent = `${mealBreaks * 30} min (unpaid)`;
    restCountEl.textContent = restBreaks;
    restTimeEl.textContent = `${restBreaks * 10} min (paid)`;

    let waiverMsg = '';
    if(mealBreaks === 1 && hours <= 6){
      waiverMsg = 'Your one meal break may be waived if both you and your employer agree, since your shift is 6 hours or less.';
    } else if(hours > 10 && hours <= 12 && mealBreaks === 2){
      waiverMsg = 'Your second meal break may be waived by mutual agreement if your first meal break wasn’t waived and your shift is 12 hours or less.';
    }
    waiverNoteTextEl.textContent = waiverMsg;
    waiverNoteEl.hidden = !waiverMsg;
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  function validateRequired(){
    const isValid = numericValue(hoursInput) > 0;
    if(!isValid){
      hoursInput.classList.add('calc-input-error');
      hoursInput.addEventListener('input', () => hoursInput.classList.remove('calc-input-error'), { once: true });
      hoursInput.focus();
    }
    return isValid;
  }

  const resultCard = document.getElementById('calcResultCard');

  submitBtn.addEventListener('click', () => {
    if(!validateRequired()) return;
    resultInner.classList.add('is-blurred');
    loading.hidden = false;
    submitBtn.disabled = true;
    if(window.innerWidth < 861){
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      calculate();
      loading.hidden = true;
      resultInner.classList.remove('is-blurred');
      submitBtn.disabled = false;
      if(window.innerWidth >= 861){
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 1000);
  });
})();
