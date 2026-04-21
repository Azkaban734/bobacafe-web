// ============================================================
// CODE.GS — Web app entry point + orchestration
//
// Deploy as a web app:
//   Apps Script → Deploy → New deployment
//   Type: Web app
//   Execute as: Me
//   Who has access: Anyone (or specific users)
// ============================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Боба Кролик — Расчёт зарплаты')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ── Called by the web UI ──────────────────────────────────────

// Run the full calculation and return all intermediate data
// for the step-by-step debug view. Nothing is written to sheets.
function apiCalculate(month, year) {
  try {
    // Load raw data from sheets
    const rawSchedule  = readScheduleRaw();
    const rawEmployees = readEmployeesRaw();
    const rawSalary    = readSalaryRaw();
    const rawBonuses   = readBonusesRaw();
    const rawPaid      = readPaidRaw();

    // Step 1: parse schedule
    const { shifts, warnings: schedWarnings } = parseScheduleData(rawSchedule, month, year);

    // Step 2: build lookup maps
    const employeeMap = buildEmployeeMap(rawEmployees);
    const salaryMap   = buildSalaryMap(rawSalary);

    // Step 3: enrich shifts
    const enriched  = enrichShifts(shifts, employeeMap, salaryMap);
    const unmatched = enriched.filter(s => !s.matched);

    // Step 4: parse bonuses and paid records
    const bonuses = parseBonusData(rawBonuses, month, year);
    const paid    = parsePaidData(rawPaid, month);

    // Step 5: calculate payroll
    const summaries = calculatePayroll(enriched, bonuses, paid);

    // Step 6: verification
    const verification = calculateVerification(enriched, summaries);

    return {
      ok: true,
      steps: {
        schedule: {
          count:    shifts.length,
          h1Count:  shifts.filter(s => s.half === 1).length,
          h2Count:  shifts.filter(s => s.half === 2).length,
          warnings: schedWarnings,
          data:     shifts,
        },
        matching: {
          totalEmployees: Object.keys(employeeMap).length,
          unmatchedCount: unmatched.length,
          unmatched:      unmatched,
        },
        bonuses: {
          count:    bonuses.length,
          data:     bonuses,
        },
        paid: {
          count: paid.length,
          data:  paid,
        },
        payroll: {
          count: summaries.length,
          data:  summaries,
        },
        verification: verification,
      },
    };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

// Write the last-calculated results to the Payment and Verification sheets.
function apiWrite(month, year) {
  try {
    const calc = apiCalculate(month, year);
    if (!calc.ok) return calc;

    const paymentRows      = buildPaymentRows(calc.steps.payroll.data);
    const verificationRows = buildVerificationRows(calc.steps.verification);

    writePaymentSheet(paymentRows);
    writeVerificationSheet(verificationRows);

    return { ok: true, paymentRows: paymentRows.length - 1, verificationRows: verificationRows.length - 1 };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

// Run all unit tests and return results to the web UI.
function apiRunTests() {
  try {
    return { ok: true, results: runAllTests() };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}
