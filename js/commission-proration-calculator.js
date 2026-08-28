(function(){
  const fullAmountInput = document.getElementById('calcFullAmount');
  const basisOptions = document.getElementById('calcBasisOptions');
  const periodStartInput = document.getElementById('calcPeriodStart');
  const periodEndInput = document.getElementById('calcPeriodEnd');
  const workedStartInput = document.getElementById('calcWorkedStart');
  const workedEndInput = document.getElementById('calcWorkedEnd');
  const customPercentInput = document.getElementById('calcCustomPercent');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const fullAmountEl = document.getElementById('calcResultFullAmount');
  const fractionEl = document.getElementById('calcResultFraction');
  const basisEl = document.getElementById('calcResultBasis');

  const dateFieldsRow = document.getElementById('calcDateFieldsRow');
  const customFieldRow = document.getElementById('calcCustomFieldRow');

  if(!fullAmountInput || !basisOptions || !submitBtn) return;

  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  let basis = basisOptions.querySelector('.calc-formula-opt.is-active')?.dataset.value || 'calendar';

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

  function updateFieldVisibility(){
    dateFieldsRow.hidden = basis === 'custom';
    customFieldRow.hidden = basis !== 'custom';
  }

  basisOptions.querySelectorAll('.calc-formula-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      basisOptions.querySelectorAll('.calc-formula-opt').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      basis = btn.dataset.value;
      updateFieldVisibility();
    });
  });
  updateFieldVisibility();

  function countDays(start, end, businessOnly){
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    let count = 0;
    const cursor = new Date(startDate);
    while(cursor <= endDate){
      const day = cursor.getDay();
      if(!businessOnly || (day !== 0 && day !== 6)) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function calculate(){
    const fullAmount = numericValue(fullAmountInput);
    let fraction = 0;
    let basisLabel = '';

    if(basis === 'custom'){
      fraction = Math.min(100, Math.max(0, parseFloat(customPercentInput.value) || 0)) / 100;
      basisLabel = 'Custom percentage entered directly';
    } else {
      const businessOnly = basis === 'business';
      const fullDays = countDays(periodStartInput.value, periodEndInput.value, businessOnly);
      const workedDays = countDays(workedStartInput.value, workedEndInput.value, businessOnly);
      fraction = fullDays > 0 ? Math.min(1, workedDays / fullDays) : 0;
      basisLabel = businessOnly
        ? `${workedDays} of ${fullDays} business days worked`
        : `${workedDays} of ${fullDays} calendar days worked`;
    }

    const proratedAmount = fullAmount * fraction;

    amountEl.textContent = currency2.format(proratedAmount);
    fullAmountEl.textContent = currency2.format(fullAmount);
    fractionEl.textContent = `${percent.format(fraction * 100)}%`;
    basisEl.textContent = basisLabel;
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  formatDollarInput(fullAmountInput);

  function validateRequired(){
    const requiredFields = [{ field: fullAmountInput, isValid: () => numericValue(fullAmountInput) > 0 }];
    if(basis === 'custom'){
      requiredFields.push({ field: customPercentInput, isValid: () => (parseFloat(customPercentInput.value) || 0) > 0 });
    } else {
      requiredFields.push({ field: periodStartInput, isValid: () => !!periodStartInput.value });
      requiredFields.push({ field: periodEndInput, isValid: () => !!periodEndInput.value });
      requiredFields.push({ field: workedStartInput, isValid: () => !!workedStartInput.value });
      requiredFields.push({ field: workedEndInput, isValid: () => !!workedEndInput.value });
    }
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
