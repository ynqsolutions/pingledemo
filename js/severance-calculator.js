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
    const total = baseSeverance + pto;

    amountEl.textContent = currency.format(total);
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

  submitBtn.addEventListener('click', () => {
    if(positionInput && !positionInput.value){
      positionInput.classList.add('calc-input-error');
      positionInput.focus();
      positionInput.addEventListener('change', () => {
        positionInput.classList.remove('calc-input-error');
      }, { once: true });
      return;
    }

    loading.hidden = false;
    submitBtn.disabled = true;

    setTimeout(() => {
      calculate();
      loading.hidden = true;
      resultInner.classList.remove('is-blurred');
      submitBtn.disabled = false;
      document.getElementById('calcResultCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 1400);
  });
})();
