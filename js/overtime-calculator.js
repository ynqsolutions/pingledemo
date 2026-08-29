(function(){
  const rateInput = document.getElementById('calcHourlyRate');
  const allSevenToggle = document.getElementById('calcAllSeven');
  const submitBtn = document.getElementById('calcSubmitBtn');
  const weekTotalEl = document.getElementById('calcWeekTotal');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const regHoursEl = document.getElementById('calcRegHours');
  const ot15HoursEl = document.getElementById('calcOt15Hours');
  const ot2HoursEl = document.getElementById('calcOt2Hours');
  const regPayEl = document.getElementById('calcRegPay');
  const ot15PayEl = document.getElementById('calcOt15Pay');
  const ot2PayEl = document.getElementById('calcOt2Pay');

  if(!rateInput || !submitBtn) return;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sliders = DAYS.map(day => document.getElementById(`calcDay${day}`));
  const readouts = DAYS.map(day => document.getElementById(`calcDay${day}Readout`));

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function numericRate(){
    return Math.max(0, parseFloat(String(rateInput.value).replace(/,/g, '')) || 0);
  }

  function dayHours(){
    return sliders.map(slider => parseFloat(slider.value) || 0);
  }

  function updateWeekTotal(){
    const total = dayHours().reduce((sum, h) => sum + h, 0);
    weekTotalEl.textContent = `${number.format(total)} hrs`;
  }

  sliders.forEach((slider, i) => {
    slider.addEventListener('input', () => {
      readouts[i].textContent = number.format(parseFloat(slider.value) || 0);
      updateWeekTotal();
    });
  });
  updateWeekTotal();

  // California overtime: daily 8/12-hour thresholds first, then any
  // remaining "regular" hours across the week are checked against the
  // 40-hour weekly threshold (hours already counted as daily overtime
  // aren't double-counted toward the weekly rule). Working all seven
  // days of the workweek additionally makes every hour on the last
  // (seventh) day a premium hour — 1.5x for the first 8, 2x after —
  // overriding that day's own daily 8/12 split.
  function computeOvertime(hours, allSeven){
    let reg = 0, ot15 = 0, ot2 = 0;

    hours.forEach((h, i) => {
      const isSeventhDay = allSeven && i === hours.length - 1;
      if(isSeventhDay){
        ot15 += Math.min(h, 8);
        ot2 += Math.max(h - 8, 0);
      } else {
        reg += Math.min(h, 8);
        ot15 += h > 8 ? Math.min(h - 8, 4) : 0;
        ot2 += h > 12 ? h - 12 : 0;
      }
    });

    if(reg > 40){
      ot15 += reg - 40;
      reg = 40;
    }

    return { reg, ot15, ot2 };
  }

  function calculate(){
    const rate = numericRate();
    const { reg, ot15, ot2 } = computeOvertime(dayHours(), allSevenToggle.checked);

    const regPay = reg * rate;
    const ot15Pay = ot15 * rate * 1.5;
    const ot2Pay = ot2 * rate * 2;
    const totalPay = regPay + ot15Pay + ot2Pay;

    amountEl.textContent = money.format(totalPay);
    regHoursEl.textContent = number.format(reg);
    ot15HoursEl.textContent = number.format(ot15);
    ot2HoursEl.textContent = number.format(ot2);
    regPayEl.textContent = money.format(regPay);
    ot15PayEl.textContent = money.format(ot15Pay);
    ot2PayEl.textContent = money.format(ot2Pay);
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  function validateRequired(){
    const isValid = numericRate() > 0;
    if(!isValid){
      rateInput.focus();
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
