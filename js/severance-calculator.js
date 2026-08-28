// Severance pay calculator: only calculates when the visitor clicks "See My
// Estimate" (not live on every keystroke), showing a brief loading animation
// before revealing the result. Formula math is explained in the article
// below it on severance-pay-calculator.html.
(function(){
  const salaryInput = document.getElementById('calcSalary');
  const yearsInput = document.getElementById('calcYears');
  const formulaOptions = document.getElementById('calcFormulaOptions');
  const customWeeksInput = document.getElementById('calcCustomWeeks');
  const ptoInput = document.getElementById('calcPto');
  const positionInput = document.getElementById('calcPosition');
  const reasonInput = document.getElementById('calcReason');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const weeklyPayEl = document.getElementById('calcWeeklyPay');
  const severanceWeeksEl = document.getElementById('calcSeveranceWeeks');
  const baseSeveranceEl = document.getElementById('calcBaseSeverance');
  const ptoLineEl = document.getElementById('calcPtoLine');

  if(!salaryInput || !yearsInput || !formulaOptions || !submitBtn) return;

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  // How much a real offer could reasonably swing above/below the base
  // formula math, since actual severance depends on company policy,
  // seniority, and negotiation, not just a fixed weeks-of-pay formula.
  const RANGE_VARIANCE = 0.15;

  let formulaValue = formulaOptions.querySelector('.calc-formula-opt.is-active')?.dataset.value || '1';

  // Adds live thousands-separator formatting to a dollar input while typing,
  // without breaking mid-number editing (decimals, backspacing).
  function formatDollarInput(el){
    el.addEventListener('input', () => {
      let raw = el.value.replace(/[^0-9.]/g, '');
      const firstDot = raw.indexOf('.');
      if(firstDot !== -1){
        raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
      }
      const [intPart, decPart] = raw.split('.');
      const formattedInt = intPart ? Number(intPart).toLocaleString('en-US') : '';
      el.value = decPart !== undefined ? `${formattedInt}.${decPart.slice(0, 2)}` : formattedInt;
    });
  }

  function numericValue(el){
    return Math.max(0, parseFloat((el.value || '').replace(/,/g, '')) || 0);
  }

  function weeksPerYear(){
    if(formulaValue === 'custom'){
      return Math.max(0, parseFloat(customWeeksInput.value) || 0);
    }
    return parseFloat(formulaValue) || 0;
  }

  function calculate(){
    const salary = numericValue(salaryInput);
    const years = Math.max(0, parseFloat(yearsInput.value) || 0);
    const pto = numericValue(ptoInput);
    const multiplier = weeksPerYear();

    const weeklyPay = salary / 52;
    const severanceWeeks = multiplier * years;
    const baseSeverance = weeklyPay * severanceWeeks;
    // PTO is owed as wages regardless of severance, so it's held fixed;
    // only the negotiable severance portion swings across the range.
    const low = baseSeverance * (1 - RANGE_VARIANCE) + pto;
    const high = baseSeverance * (1 + RANGE_VARIANCE) + pto;

    amountEl.textContent = `${currency.format(low)} – ${currency.format(high)}`;
    weeklyPayEl.textContent = currency.format(weeklyPay);
    severanceWeeksEl.textContent = number.format(severanceWeeks);
    baseSeveranceEl.textContent = currency.format(baseSeverance);
    ptoLineEl.textContent = currency.format(pto);
  }

  formulaOptions.querySelectorAll('.calc-formula-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      formulaOptions.querySelectorAll('.calc-formula-opt').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      formulaValue = btn.dataset.value;
      customWeeksInput.disabled = formulaValue !== 'custom';
      if(customWeeksInput.disabled) customWeeksInput.value = '';
    });
  });

  formatDollarInput(salaryInput);
  formatDollarInput(ptoInput);

  // Guards against the browser's back/forward cache restoring a mid-
  // calculation snapshot (loading spinner frozen mid-flight, or an
  // already-revealed result) when the page is reached via back/forward
  // navigation instead of a fresh load.
  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => {
    if(e.persisted) resetToIdle();
  });

  function validateRequired(){
    // Salary and years are checked for an actual positive value (not just
    // non-empty), since "0" or blank both produce a meaningless estimate.
    const requiredFields = [
      { field: salaryInput, isValid: () => numericValue(salaryInput) > 0 },
      { field: yearsInput, isValid: () => (parseFloat(yearsInput.value) || 0) > 0 },
      { field: positionInput, isValid: () => !!positionInput?.value },
      { field: reasonInput, isValid: () => !!reasonInput?.value },
    ].filter(f => f.field);

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

    loading.hidden = false;
    submitBtn.disabled = true;

    // On mobile the result sits below the form, so bring it into view
    // right away (the loading animation plays where the user can see
    // it), rather than waiting until the numbers are ready.
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
    }, 1400);
  });
})();
