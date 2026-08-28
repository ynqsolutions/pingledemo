(function(){
  const hoursInput = document.getElementById('calcHours');
  const hoursSlider = document.getElementById('calcHoursSlider');
  const startTimeInput = document.getElementById('calcStartTime');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const mealCountEl = document.getElementById('calcMealCount');
  const mealTimeEl = document.getElementById('calcMealTime');
  const restCountEl = document.getElementById('calcRestCount');
  const restTimeEl = document.getElementById('calcRestTime');
  const netPaidEl = document.getElementById('calcNetPaid');
  const waiverNoteEl = document.getElementById('calcWaiverNote');
  const waiverNoteTextEl = document.getElementById('calcWaiverNoteText');
  const scheduleEl = document.getElementById('calcSchedule');
  const scheduleListEl = document.getElementById('calcScheduleList');

  if(!hoursInput || !submitBtn) return;

  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  function numericValue(el){
    return Math.max(0, parseFloat(el.value) || 0);
  }

  // Keep the slider and the number field in sync with each other, whichever
  // one the visitor touches. The slider caps at 16 hours (a reasonable
  // upper bound for a single shift); the number field still accepts
  // anything higher for the rare longer shift.
  hoursSlider.addEventListener('input', () => {
    hoursInput.value = hoursSlider.value;
  });
  hoursInput.addEventListener('input', () => {
    const val = parseFloat(hoursInput.value);
    if(!isNaN(val) && val >= 0 && val <= 16){
      hoursSlider.value = val;
    }
  });

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

  function formatHourOffset(hoursIn){
    const h = Math.floor(hoursIn);
    const m = Math.round((hoursIn - h) * 60);
    if(h === 0) return `${m} min in`;
    return m === 0 ? `hour ${h}` : `hour ${h}h${m}m`;
  }

  function formatClockTime(startMinutes, offsetHours){
    const totalMinutes = Math.round(startMinutes + offsetHours * 60);
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const h24 = Math.floor(normalized / 60);
    const m = normalized % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if(h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function buildSchedule(hours, mealBreaks, restBreaks){
    const rows = [];
    const startVal = startTimeInput.value;
    let startMinutes = null;
    if(startVal){
      const [h, m] = startVal.split(':').map(Number);
      startMinutes = h * 60 + m;
    }
    const label = (offsetHours) => startMinutes !== null
      ? formatClockTime(startMinutes, offsetHours)
      : `by ${formatHourOffset(offsetHours)}`;

    if(mealBreaks >= 1){
      rows.push([`1st meal break — must begin by`, label(5)]);
    }
    if(mealBreaks >= 2){
      rows.push([`2nd meal break — must begin by`, label(10)]);
    }
    for(let i = 1; i <= restBreaks; i++){
      const suggested = 4 * i - 2;
      rows.push([`Rest break ${i} — around`, label(Math.min(suggested, hours))]);
    }
    return rows;
  }

  function calculate(){
    const hours = numericValue(hoursInput);
    const mealBreaks = mealBreaksFor(hours);
    const restBreaks = restBreaksFor(hours);
    const totalBreaks = mealBreaks + restBreaks;
    const netPaidHours = Math.max(0, hours - mealBreaks * 0.5);

    amountEl.textContent = `${totalBreaks} break${totalBreaks === 1 ? '' : 's'}`;
    mealCountEl.textContent = mealBreaks;
    mealTimeEl.textContent = `${mealBreaks * 30} min`;
    restCountEl.textContent = restBreaks;
    restTimeEl.textContent = `${restBreaks * 10} min`;
    netPaidEl.textContent = `${number.format(netPaidHours)} hrs`;

    let waiverMsg = '';
    if(mealBreaks === 1 && hours <= 6){
      waiverMsg = 'Your one meal break may be waived if both you and your employer agree, since your shift is 6 hours or less.';
    } else if(hours > 10 && hours <= 12 && mealBreaks === 2){
      waiverMsg = 'Your second meal break may be waived by mutual agreement if your first meal break wasn’t waived and your shift is 12 hours or less.';
    }
    waiverNoteTextEl.textContent = waiverMsg;
    waiverNoteEl.hidden = !waiverMsg;

    const scheduleRows = buildSchedule(hours, mealBreaks, restBreaks);
    scheduleListEl.innerHTML = scheduleRows.map(([label, time]) =>
      `<div class="calc-result-schedule-row"><span>${label}</span><span>${time}</span></div>`
    ).join('');
    scheduleEl.hidden = scheduleRows.length === 0;
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
