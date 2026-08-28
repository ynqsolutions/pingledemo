(function(){
  const currentBalanceInput = document.getElementById('calcCurrentBalance');
  const accrualRateInput = document.getElementById('calcAccrualRate');
  const accrualFrequencySelect = document.getElementById('calcAccrualFrequency');
  const payFrequencySelect = document.getElementById('calcPayFrequency');
  const targetDateInput = document.getElementById('calcTargetDate');
  const plannedUseInput = document.getElementById('calcPlannedUse');
  const capInput = document.getElementById('calcCap');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const periodsEl = document.getElementById('calcPeriods');
  const accruedEl = document.getElementById('calcAccrued');
  const usedEl = document.getElementById('calcUsed');
  const cappedNoteEl = document.getElementById('calcCappedNote');

  if(!currentBalanceInput || !accrualRateInput || !submitBtn) return;

  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

  const periodsPerYear = { week: 52, biweek: 26, semimonth: 24, month: 12 };

  function numericValue(el){
    return Math.max(0, parseFloat(el.value) || 0);
  }

  function daysBetween(a, b){
    return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
  }

  function calculate(){
    const currentBalance = numericValue(currentBalanceInput);
    const accrualRate = numericValue(accrualRateInput);
    const accrualFrequency = accrualFrequencySelect.value || 'biweek';
    const plannedUse = numericValue(plannedUseInput);
    const cap = capInput.value ? parseFloat(capInput.value) : null;

    const today = new Date();
    today.setHours(0,0,0,0);
    const target = targetDateInput.value ? new Date(targetDateInput.value + 'T00:00:00') : today;

    const totalDays = daysBetween(today, target);
    const periodsPerYearVal = periodsPerYear[accrualFrequency] || 26;
    const daysPerPeriod = 365 / periodsPerYearVal;
    const periods = totalDays / daysPerPeriod;

    const accrued = periods * accrualRate;
    let projected = currentBalance + accrued - plannedUse;
    let wasCapped = false;
    if(cap !== null && !isNaN(cap) && projected > cap){
      projected = cap;
      wasCapped = true;
    }
    projected = Math.max(0, projected);

    amountEl.textContent = `${number.format(projected)} hrs`;
    periodsEl.textContent = number.format(periods);
    accruedEl.textContent = `${number.format(accrued)} hrs`;
    usedEl.textContent = `${number.format(plannedUse)} hrs`;
    cappedNoteEl.hidden = !wasCapped;
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  // Default the target date to three months out, so the field isn't blank.
  const defaultTarget = new Date();
  defaultTarget.setMonth(defaultTarget.getMonth() + 3);
  targetDateInput.value = defaultTarget.toISOString().slice(0, 10);
  targetDateInput.min = new Date().toISOString().slice(0, 10);

  function validateRequired(){
    const requiredFields = [
      { field: accrualRateInput, isValid: () => numericValue(accrualRateInput) > 0 },
      { field: targetDateInput, isValid: () => !!targetDateInput.value },
    ];
    let firstInvalid = null;
    requiredFields.forEach(({ field, isValid }) => {
      if(!isValid()){
        field.classList.add('calc-input-error');
        const clear = () => field.classList.remove('calc-input-error');
        field.addEventListener('input', clear, { once: true });
        field.addEventListener('change', clear, { once: true });
        if(!firstInvalid) firstInvalid = field;
      }
    });
    if(firstInvalid) firstInvalid.focus();
    return !firstInvalid;
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
