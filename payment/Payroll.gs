// ============================================================
// PAYROLL.GS — Pure calculation functions
//
// No SpreadsheetApp calls here. Every function takes plain
// arrays / objects and returns plain arrays / objects.
// This makes the entire calculation layer unit-testable with
// hardcoded data in Tests.gs — no sheet access required.
// ============================================================


// ── Step 1 ───────────────────────────────────────────────────
// Unpivot raw schedule into a flat list of shift records.
//
// rawData  : 2D array from sheet (row 0 = headers)
// month    : 1–12
// year     : e.g. 2026
//
// Returns  : { shifts: [...], warnings: [...] }
//   shift  : { name, dateStr, day, store, shiftType, half }
// ─────────────────────────────────────────────────────────────
function parseScheduleData(rawData, month, year) {
  const headers = rawData[0];
  const shifts   = [];
  const warnings = [];

  for (let r = 1; r < rawData.length; r++) {
    const row     = rawData[r];
    const rawDate = row[0];
    if (!rawDate) continue;

    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(date.getTime())) { warnings.push(`Row ${r + 1}: unparseable date "${rawDate}"`); continue; }
    if (date.getMonth() + 1 !== month || date.getFullYear() !== year) continue;

    const day     = date.getDate();
    const dateStr = fmtDate_(date);

    for (let c = 1; c < headers.length; c++) {
      const header = String(headers[c] || '').trim();
      if (!header) continue;

      const cell = String(row[c] || '').trim();
      if (!cell || SKIP_VALUES.includes(cell.toLowerCase())) continue;

      // Header format: "Store Name - ShiftType"
      // Try ' - ' first (standard), then '- ' (missing leading space e.g. "Store 47- День")
      let sep = header.lastIndexOf(' - ');
      let sepLen = 3;
      if (sep === -1) {
        sep = header.lastIndexOf('- ');
        sepLen = 2;
      }
      if (sep === -1) { warnings.push(`Col ${c + 1}: header "${header}" has no separator`); continue; }

      shifts.push({
        name:      cell,
        dateStr,
        day,
        store:     header.substring(0, sep).trim(),
        shiftType: header.substring(sep + sepLen).trim(),
        half:      day <= 15 ? 1 : 2,
      });
    }
  }

  return { shifts, warnings };
}


// ── Step 2a ──────────────────────────────────────────────────
// Build employee lookup: full_name → { role, preferable_store }
//
// rawData: 2D array (row 0 must contain "full_name", "role",
//          "preferable_store" as column headers)
// ─────────────────────────────────────────────────────────────
function buildEmployeeMap(rawData) {
  const headers = rawData[0].map(h => String(h).trim().toLowerCase());
  const map = {};
  for (let r = 1; r < rawData.length; r++) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = rawData[r][i]; });
    const name = String(obj['full_name'] || '').trim();
    if (name) map[name] = obj;
  }
  return map;
}


// ── Step 2b ──────────────────────────────────────────────────
// Build salary-rate lookup: role (lowercase) → { baseHalf, residualHalf, helper }
//
// rawData columns: role | base half | residual half | helper
// ─────────────────────────────────────────────────────────────
function buildSalaryMap(rawData) {
  const map = {};
  for (let r = 1; r < rawData.length; r++) {
    const role = String(rawData[r][0] || '').trim().toLowerCase();
    if (!role) continue;
    map[role] = {
      baseHalf:     Number(rawData[r][1]) || 0,
      residualHalf: Number(rawData[r][2]) || 0,
      helper:       Number(rawData[r][3]) || 0,
    };
  }
  return map;
}


// ── Step 3 ───────────────────────────────────────────────────
// Attach role + per-shift pay amounts to each shift record.
//
// Unmatched shifts get  matched:false  plus an error string:
//   NOT_IN_DB       — name not found in employee map
//   NO_RATES:<role> — role found but no salary row for it
//
// Shift categories and pay rules:
//   День / Ночь      → half:   baseHalf + residualHalf
//   Помощь           → helper: helper rate, no residual
//   Полная смена     → full:   2 × baseHalf + 2 × residualHalf
// ─────────────────────────────────────────────────────────────
function enrichShifts(shifts, employeeMap, salaryMap) {
  return shifts.map(shift => {
    const emp = employeeMap[shift.name];
    if (!emp) return { ...shift, matched: false, error: 'NOT_IN_DB' };

    const role  = String(emp['role'] || '').trim().toLowerCase();
    const rates = salaryMap[role];
    if (!rates || (rates.baseHalf === 0 && rates.helper === 0)) {
      return { ...shift, matched: false, role, error: `NO_RATES:${role}` };
    }

    const st = shift.shiftType.toLowerCase();
    let basePay, residualPay, shiftCategory;

    if (st === 'помощь') {
      basePay = rates.helper; residualPay = 0; shiftCategory = 'helper';
    } else if (st === 'полная смена') {
      basePay = rates.baseHalf * 2; residualPay = rates.residualHalf * 2; shiftCategory = 'full';
    } else {
      basePay = rates.baseHalf; residualPay = rates.residualHalf; shiftCategory = 'half';
    }

    return {
      ...shift,
      matched:        true,
      role,
      preferableStore: String(emp['preferable_store'] || '').trim(),
      shiftCategory,
      basePay,
      residualPay,
    };
  });
}


// ── Step 4 ───────────────────────────────────────────────────
// Parse bonus/penalty form responses filtered to month + year.
//
// rawData columns: Timestamp | Имя сотрудника | За какой месяц
//                  | Тип | Сумма | Комментарий
//
// Recognised types (lowercase):
//   добавка    — bonus, added to H1
//   вычет      — penalty, subtracted from H1
//   выплатили? — advance already paid, deducted from H2
// ─────────────────────────────────────────────────────────────
function parseBonusData(rawData, month, year) {
  const list = [];
  for (let r = 1; r < rawData.length; r++) {
    const row       = rawData[r];
    const timestamp = row[0];
    const name      = String(row[1] || '').trim();
    const bMonth    = parseInt(String(row[2] || '').replace(/\D/g, ''), 10);
    const type      = String(row[3] || '').trim().toLowerCase();
    const amount    = Math.abs(Number(row[4])) || 0;
    const comment   = String(row[5] || '').trim();

    if (!name || !bMonth || !amount) continue;

    const tsYear = timestamp instanceof Date ? timestamp.getFullYear() : year;
    if (bMonth !== month || tsYear !== year) continue;

    list.push({ name, month: bMonth, year: tsYear, type, amount, comment });
  }
  return list;
}


// ── Step 5 ───────────────────────────────────────────────────
// Parse paid-record sheet, filtered by month.
//
// rawData columns: имя | кафе | сумма | месяц | half
// ─────────────────────────────────────────────────────────────
function parsePaidData(rawData, month) {
  const list = [];
  for (let r = 1; r < rawData.length; r++) {
    const row    = rawData[r];
    const name   = String(row[0] || '').trim();
    const store  = String(row[1] || '').trim();
    const amount = Number(row[2]) || 0;
    const rMonth = parseInt(String(row[3] || ''), 10);
    const half   = String(row[4] || '').trim().toLowerCase();

    if (!name || rMonth !== month) continue;
    list.push({ name, store, amount, month: rMonth, half });
  }
  return list;
}


// ── Step 6 ───────────────────────────────────────────────────
// Aggregate enriched shifts + bonuses + paid records into
// per-employee payroll summaries.
//
// H1 payment:
//   toPayH1 = baseH1 + bonusTotal - penaltyTotal
//
// H2 payment:
//   monthlyTotal = baseH1 + residualH1 + baseH2 + residualH2
//                  + bonusTotal - penaltyTotal
//   toPayH2 = max(0, monthlyTotal - paidAlready - advances)
//
// Returns array of employee summary objects, sorted by name.
// ─────────────────────────────────────────────────────────────
function calculatePayroll(enrichedShifts, bonuses, paidRecords) {
  const emp = {};

  // Accumulate shifts
  for (const s of enrichedShifts) {
    if (!s.matched) continue;
    if (!emp[s.name]) emp[s.name] = makeEmptyEmployee_(s.name, s.role, s.preferableStore);
    const e = emp[s.name];

    if (s.half === 1) {
      if      (s.shiftCategory === 'half')   e.halfShiftsH1++;
      else if (s.shiftCategory === 'full')   e.fullShiftsH1++;
      else if (s.shiftCategory === 'helper') e.helperShiftsH1++;
      e.baseH1     += s.basePay;
      e.residualH1 += s.residualPay;
    } else {
      if      (s.shiftCategory === 'half')   e.halfShiftsH2++;
      else if (s.shiftCategory === 'full')   e.fullShiftsH2++;
      else if (s.shiftCategory === 'helper') e.helperShiftsH2++;
      e.baseH2     += s.basePay;
      e.residualH2 += s.residualPay;
    }
  }

  // Attach bonus lines (create placeholder if bonus but no shifts)
  for (const b of bonuses) {
    if (!emp[b.name]) emp[b.name] = makeEmptyEmployee_(b.name, '', '');
    emp[b.name].bonusLines.push(b);
  }

  // Final calculations
  for (const e of Object.values(emp)) {
    e.bonusTotal   = e.bonusLines.filter(b => b.type === 'добавка').reduce((s, b) => s + b.amount, 0);
    e.penaltyTotal = e.bonusLines.filter(b => b.type === 'вычет').reduce((s, b) => s + b.amount, 0);
    e.advances     = e.bonusLines.filter(b => b.type === 'выплатили?').reduce((s, b) => s + b.amount, 0);

    e.toPayH1       = e.baseH1 + e.bonusTotal - e.penaltyTotal;
    e.monthlyEarned = e.baseH1 + e.residualH1 + e.baseH2 + e.residualH2;
    e.monthlyTotal  = e.monthlyEarned + e.bonusTotal - e.penaltyTotal;

    e.paidAlready   = paidRecords.filter(p => p.name === e.name).reduce((s, p) => s + p.amount, 0);
    const totalOut  = e.paidAlready + e.advances;
    e.toPayH2       = Math.max(0, e.monthlyTotal - totalOut);
    e.overpayment   = totalOut > e.monthlyTotal ? totalOut - e.monthlyTotal : 0;
  }

  return Object.values(emp).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}


// ── Step 7 ───────────────────────────────────────────────────
// Reconciliation: schedule-based store cost vs employee-based
// store cost.
//
// scheduleCost per store = sum of (basePay + residualPay) for
//   all matched shifts worked at that store.
//
// employeeCost per store = sum of monthlyTotal for all employees
//   whose preferableStore matches.
//
// diff = scheduleCost - employeeCost
//   Differences arise from employees working outside their home
//   store, and from bonuses/penalties.
// ─────────────────────────────────────────────────────────────
function calculateVerification(enrichedShifts, employeeSummaries) {
  const schedMap = {};
  for (const s of enrichedShifts) {
    if (!s.matched) continue;
    if (!schedMap[s.store]) schedMap[s.store] = 0;
    schedMap[s.store] += s.basePay + s.residualPay;
  }

  const empMap = {};
  for (const e of employeeSummaries) {
    const store = e.preferableStore || '—';
    empMap[store] = (empMap[store] || 0) + e.monthlyTotal;
  }

  const stores = [...new Set([...Object.keys(schedMap), ...Object.keys(empMap)])].sort((a, b) => a.localeCompare(b, 'ru'));

  const rows = stores.map(store => ({
    store,
    scheduleCost:  schedMap[store] || 0,
    employeeCost:  empMap[store]   || 0,
    diff:         (schedMap[store] || 0) - (empMap[store] || 0),
  }));

  const totals = rows.reduce(
    (t, r) => ({ scheduleCost: t.scheduleCost + r.scheduleCost, employeeCost: t.employeeCost + r.employeeCost, diff: t.diff + r.diff }),
    { scheduleCost: 0, employeeCost: 0, diff: 0 }
  );

  return { rows, totals };
}


// ── Output formatting ────────────────────────────────────────
// Build the 2D array written to the Payment sheet.
// ─────────────────────────────────────────────────────────────
function buildPaymentRows(summaries) {
  const headers = [
    'Имя', 'Филиал', 'Роль',
    'Полных смен H1', 'Полусмен H1', 'Помощь H1',
    'База H1', 'Резидуал H1', 'Бонус', 'Штраф', 'К выплате H1',
    'Полных смен H2', 'Полусмен H2', 'Помощь H2',
    'База H2', 'Резидуал H2',
    'Заработано всего', 'Итого с корр.', 'Уже выплачено', 'К выплате H2', 'Переплата',
  ];

  const rows = summaries.map(e => [
    e.name, e.preferableStore, e.role,
    e.fullShiftsH1, e.halfShiftsH1, e.helperShiftsH1,
    e.baseH1, e.residualH1, e.bonusTotal, e.penaltyTotal, e.toPayH1,
    e.fullShiftsH2, e.halfShiftsH2, e.helperShiftsH2,
    e.baseH2, e.residualH2,
    e.monthlyEarned, e.monthlyTotal, e.paidAlready, e.toPayH2, e.overpayment,
  ]);

  return [headers, ...rows];
}

function buildVerificationRows(verification) {
  const headers = ['Филиал', 'Стоимость по графику', 'Стоимость по сотрудникам', 'Разница'];
  const rows    = verification.rows.map(r => [r.store, r.scheduleCost, r.employeeCost, r.diff]);
  const totals  = ['ИТОГО', verification.totals.scheduleCost, verification.totals.employeeCost, verification.totals.diff];
  return [headers, ...rows, totals];
}


// ── Private helpers ──────────────────────────────────────────
function makeEmptyEmployee_(name, role, preferableStore) {
  return {
    name, role, preferableStore,
    halfShiftsH1: 0, fullShiftsH1: 0, helperShiftsH1: 0,
    halfShiftsH2: 0, fullShiftsH2: 0, helperShiftsH2: 0,
    baseH1: 0, residualH1: 0,
    baseH2: 0, residualH2: 0,
    bonusLines: [],
    bonusTotal: 0, penaltyTotal: 0, advances: 0,
    toPayH1: 0, monthlyEarned: 0, monthlyTotal: 0,
    paidAlready: 0, toPayH2: 0, overpayment: 0,
  };
}

function fmtDate_(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
