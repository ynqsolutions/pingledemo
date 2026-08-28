// Take-home pay estimator: rough estimate only, using published current-year
// federal and California tax brackets with the standard deduction, a flat
// per-dependent credit assumption, and standard FICA/SDI rates. This is not
// a paycheck reconciliation tool, actual withholding depends on your W-4,
// employer's payroll system, and other factors this can't see.
(function(){
  const grossInput = document.getElementById('calcGross');
  const frequencySelect = document.getElementById('calcFrequency');
  const filingStatusSelect = document.getElementById('calcFilingStatus');
  const dependentsInput = document.getElementById('calcDependents');
  const retirementInput = document.getElementById('calcRetirementPct');
  const healthInput = document.getElementById('calcHealthDeduction');
  const submitBtn = document.getElementById('calcSubmitBtn');

  const resultInner = document.getElementById('calcResultInner');
  const loading = document.getElementById('calcResultLoading');
  const amountEl = document.getElementById('calcResultAmount');
  const grossPerPeriodEl = document.getElementById('calcGrossPerPeriod');
  const fedTaxEl = document.getElementById('calcFedTax');
  const caTaxEl = document.getElementById('calcCaTax');
  const ficaEl = document.getElementById('calcFica');
  const sdiEl = document.getElementById('calcSdi');
  const preTaxEl = document.getElementById('calcPreTax');

  if(!grossInput || !frequencySelect || !submitBtn) return;

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  const periodsPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, annually: 1 };

  // 2024 published brackets/figures, used as a stable reference point for
  // the estimate; the tool-disclaimer above makes clear this may not match
  // the current tax year exactly.
  const FEDERAL_BRACKETS = {
    single: [[0,.10],[11600,.12],[47150,.22],[100525,.24],[191950,.32],[243725,.35],[609350,.37]],
    mfj: [[0,.10],[23200,.12],[94300,.22],[201050,.24],[383900,.32],[487450,.35],[731200,.37]],
    hoh: [[0,.10],[16550,.12],[63100,.22],[100500,.24],[191950,.32],[243700,.35],[609350,.37]],
  };
  const FEDERAL_STD_DEDUCTION = { single: 14600, mfj: 29200, hoh: 21900 };
  const FEDERAL_CTC_PER_DEPENDENT = 2000;

  const CA_BRACKETS = {
    single: [[0,.01],[10412,.02],[24684,.04],[38959,.06],[54081,.08],[68350,.093],[349137,.103],[418961,.113],[698271,.123]],
    mfj: [[0,.01],[20824,.02],[49368,.04],[77918,.06],[108162,.08],[136700,.093],[698274,.103],[837922,.113],[1396542,.123]],
    hoh: [[0,.01],[20839,.02],[49371,.04],[63644,.06],[78765,.08],[93037,.093],[474824,.103],[569790,.113],[949649,.123]],
  };
  const CA_STD_DEDUCTION = { single: 5363, mfj: 10726, hoh: 10726 };
  const CA_DEPENDENT_CREDIT = 446;

  const SS_RATE = 0.062;
  const SS_WAGE_BASE = 168600;
  const MEDICARE_RATE = 0.0145;
  const MEDICARE_ADDL_RATE = 0.009;
  const MEDICARE_ADDL_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000 };
  const CA_SDI_RATE = 0.011;

  function bracketTax(taxableIncome, brackets){
    if(taxableIncome <= 0) return 0;
    let tax = 0;
    for(let i = 0; i < brackets.length; i++){
      const [threshold, rate] = brackets[i];
      const next = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
      if(taxableIncome > threshold){
        tax += (Math.min(taxableIncome, next) - threshold) * rate;
      } else {
        break;
      }
    }
    return tax;
  }

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

  function calculate(){
    const grossPerPeriod = numericValue(grossInput);
    const frequency = frequencySelect.value || 'biweekly';
    const periods = periodsPerYear[frequency] || 26;
    const filingStatus = filingStatusSelect.value || 'single';
    const dependents = Math.max(0, parseInt(dependentsInput.value, 10) || 0);
    const retirementPct = Math.max(0, parseFloat(retirementInput.value) || 0);
    const healthPerPeriod = numericValue(healthInput);

    const grossAnnual = grossPerPeriod * periods;
    const retirementAnnual = grossAnnual * (retirementPct / 100);
    const healthAnnual = healthPerPeriod * periods;
    const preTaxAnnual = retirementAnnual + healthAnnual;

    // FICA wages are reduced by pre-tax cafeteria-plan deductions (health)
    // but not by traditional 401(k)/403(b) contributions.
    const ficaWages = Math.max(0, grossAnnual - healthAnnual);
    const taxableIncome = Math.max(0, grossAnnual - preTaxAnnual - FEDERAL_STD_DEDUCTION[filingStatus]);
    const caTaxableIncome = Math.max(0, grossAnnual - preTaxAnnual - CA_STD_DEDUCTION[filingStatus]);

    let fedTax = bracketTax(taxableIncome, FEDERAL_BRACKETS[filingStatus]) - (dependents * FEDERAL_CTC_PER_DEPENDENT);
    fedTax = Math.max(0, fedTax);

    let caTax = bracketTax(caTaxableIncome, CA_BRACKETS[filingStatus]) - (dependents * CA_DEPENDENT_CREDIT);
    caTax = Math.max(0, caTax);

    const socialSecurity = Math.min(ficaWages, SS_WAGE_BASE) * SS_RATE;
    const addlThreshold = MEDICARE_ADDL_THRESHOLD[filingStatus];
    const medicare = ficaWages * MEDICARE_RATE + Math.max(0, ficaWages - addlThreshold) * MEDICARE_ADDL_RATE;
    const sdi = ficaWages * CA_SDI_RATE;

    const totalTaxAnnual = fedTax + caTax + socialSecurity + medicare + sdi;
    const netAnnual = grossAnnual - totalTaxAnnual - preTaxAnnual;
    const netPerPeriod = netAnnual / periods;

    amountEl.textContent = `${currency2.format(netPerPeriod)} / ${frequency === 'annually' ? 'Year' : 'Paycheck'}`;
    grossPerPeriodEl.textContent = currency2.format(grossPerPeriod);
    fedTaxEl.textContent = currency2.format(fedTax / periods);
    caTaxEl.textContent = currency2.format(caTax / periods);
    ficaEl.textContent = currency2.format((socialSecurity + medicare) / periods);
    sdiEl.textContent = currency2.format(sdi / periods);
    preTaxEl.textContent = currency2.format(preTaxAnnual / periods);
  }

  function resetToIdle(){
    loading.hidden = true;
    resultInner.classList.add('is-blurred');
    submitBtn.disabled = false;
  }
  resetToIdle();
  window.addEventListener('pageshow', (e) => { if(e.persisted) resetToIdle(); });

  formatDollarInput(grossInput);
  formatDollarInput(healthInput);

  function validateRequired(){
    const requiredFields = [
      { field: grossInput, isValid: () => numericValue(grossInput) > 0 },
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
