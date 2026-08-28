(function(){
  const salaryInput = document.getElementById('calcSalary');
  const raiseTypeOptions = document.getElementById('calcRaiseType');
  const raiseValueInput = document.getElementById('calcRaiseValue');
  const raiseValuePrefix = document.getElementById('calcRaiseValuePrefix');
  const raiseValueSuffix = document.getElementById('calcRaiseValueSuffix');
  const frequencySelect = document.getElementById('calcFrequency');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const oldSalaryEl = document.getElementById('calcOldSalary');
  const increaseAmountEl = document.getElementById('calcIncreaseAmount');
  const increasePercentEl = document.getElementById('calcIncreasePercent');
  const newPerPeriodEl = document.getElementById('calcNewPerPeriod');

  if(!salaryInput || !raiseTypeOptions || !submitBtn) return;

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  const periodsPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, annually: 1 };
  const periodLabel = { weekly: 'Week', biweekly: 'Paycheck (Biweekly)', semimonthly: 'Paycheck (Semimonthly)', monthly: 'Month', annually: 'Year' };

  let raiseType = raiseTypeOptions.querySelector('.calc-formula-opt.is-active')?.dataset.value || 'percent';

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

  function updateRaiseValueAffixes(){
    raiseValuePrefix.hidden = raiseType !== 'flat';
    raiseValueSuffix.hidden = raiseType !== 'percent';
    raiseValueInput.placeholder = raiseType === 'percent' ? '5' : '3,000';
  }

  raiseTypeOptions.querySelectorAll('.calc-formula-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      raiseTypeOptions.querySelectorAll('.calc-formula-opt').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      raiseType = btn.dataset.value;
      updateRaiseValueAffixes();
    });
  });
  updateRaiseValueAffixes();

  function calculate(){
    const salary = numericValue(salaryInput);
    const raiseValue = Math.max(0, parseFloat((raiseValueInput.value || '').replace(/,/g, '')) || 0);
    const frequency = frequencySelect.value || 'biweekly';

    let increaseAmount, increasePercent;
    if(raiseType === 'percent'){
      increasePercent = raiseValue;
      increaseAmount = salary * (raiseValue / 100);
    } else {
      increaseAmount = raiseValue;
      increasePercent = salary > 0 ? (raiseValue / salary) * 100 : 0;
    }
    const newSalary = salary + increaseAmount;
    const periods = periodsPerYear[frequency] || 26;
    const newPerPeriod = newSalary / periods;

    amountEl.textContent = currency.format(newSalary);
    oldSalaryEl.textContent = currency.format(salary);
    increaseAmountEl.textContent = currency2.format(increaseAmount);
    increasePercentEl.textContent = `${percent.format(increasePercent)}%`;
    newPerPeriodEl.textContent = `${currency2.format(newPerPeriod)} / ${periodLabel[frequency] || 'Paycheck'}`;
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  formatDollarInput(salaryInput);

  function validateRequired(){
    const requiredFields = [
      { field: salaryInput, isValid: () => numericValue(salaryInput) > 0 },
      { field: raiseValueInput, isValid: () => (parseFloat((raiseValueInput.value || '').replace(/,/g, '')) || 0) > 0 },
    ];
    let firstInvalid = null;
    requiredFields.forEach(({ field, isValid }) => {
      if(!isValid()){
        field.classList.add('calc-input-error');
        const clear = () => field.classList.remove('calc-input-error');
        field.addEventListener('input', clear, { once: true });
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
