// ============================================================
// TESTS.GS — Unit tests using hardcoded sample data
//
// Run runAllTests() from the Apps Script editor (▶ Run button)
// to verify the calculation logic without touching any sheets.
//
// Expected values are calculated by hand below each test so
// you can audit the logic independently.
// ============================================================


// ── Sample data ──────────────────────────────────────────────

const T_SCHEDULE = [
  ['Дата', 'Бон Пассаж - День', 'Бон Пассаж - Ночь', 'Советов - День', 'Советов - Ночь', 'Советов - Помощь'],
  // H1 (days 1–15)
  // Use new Date(year, month-1, day) — local time — to avoid UTC-midnight timezone shifts
  [new Date(2026, 3,  1), 'Бучнева Мария',  'Бучнева Мария',        'Нарожняя Ангелина',     'Могильников Александр', ''],
  [new Date(2026, 3,  2), 'Скворцова Мария', '',                     'Нарожняя Ангелина',     'Могильников Александр', 'Скворцова Мария'],
  [new Date(2026, 3,  3), '—',              '',                      'Нарожняя Ангелина',     '',                      ''],
  // H2 (days 16–30)
  [new Date(2026, 3, 16), 'Бучнева Мария',  '',                     'Нарожняя Ангелина',     '',                      ''],
  [new Date(2026, 3, 17), 'Бучнева Мария',  'Бучнева Мария',        'Могильников Александр', '',                      ''],
];
// Manual shift count:
//  Apr 01 H1: Бучнева День, Бучнева Ночь, Нарожняя День, Могильников Ночь      = 4
//  Apr 02 H1: Скворцова День, Нарожняя День, Могильников Ночь, Скворцова Помощь = 4
//  Apr 03 H1: Нарожняя День  (Бон Пассаж '—' skipped)                          = 1
//  Apr 16 H2: Бучнева День, Нарожняя День                                       = 2
//  Apr 17 H2: Бучнева День, Бучнева Ночь, Могильников День                     = 3
//  Total: 14   H1: 9   H2: 5

const T_EMPLOYEES = [
  ['full_name',              'preferable_store', 'role'],
  ['Бучнева Мария',          'Бон Пассаж',       'бариста'],
  ['Нарожняя Ангелина',      'Советов',          'бариста'],
  ['Могильников Александр',  'Советов',          'бариста'],
  ['Скворцова Мария',        'Бон Пассаж',       'бариста'],
];

const T_SALARY = [
  ['role',    'base half', 'residual half', 'helper'],
  ['бариста', 650,          250,             800],
];

const T_BONUSES = [
  ['Timestamp',                   'Имя сотрудника',       'За какой месяц', 'Тип',      'Сумма', 'Комментарий'],
  [new Date(2026, 3, 5, 10, 0),  'Нарожняя Ангелина',   '04',              'Добавка',   500,    'Тест бонус'],
  [new Date(2026, 3, 5, 10, 1),  'Скворцова Мария',      '04',              'Вычет',     100,    'Тест штраф'],
];

const T_PAID = [
  ['имя',             'кафе',       'сумма', 'месяц', 'half'],
  ['Бучнева Мария',   'Бон Пассаж', 1950,    4,       'first'],
];


// ── Test runner ───────────────────────────────────────────────

function runAllTests() {
  const suite = [
    test_parseSchedule,
    test_buildEmployeeMap,
    test_buildSalaryMap,
    test_enrichShifts_matched,
    test_enrichShifts_unmatched,
    test_parseBonusData,
    test_parsePaidData,
    test_h1Calculation,
    test_h2Calculation,
    test_verification,
  ];

  const results = suite.map(fn => {
    try {
      return fn();
    } catch (e) {
      return { name: fn.name, passed: false, details: [e.toString()] };
    }
  });

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} tests passed ===\n`);
  results.forEach(r => {
    console.log(`${r.passed ? '✓' : '✗'} ${r.name}`);
    (r.details || []).forEach(d => console.log(`    ${d}`));
  });

  return results; // returned to web UI
}


// ── Individual tests ──────────────────────────────────────────

function test_parseSchedule() {
  const { shifts, warnings } = parseScheduleData(T_SCHEDULE, 4, 2026);
  return assert_('parseSchedule', [
    [shifts.length === 14,              `expected 14 shifts, got ${shifts.length}`],
    [shifts.filter(s => s.half === 1).length === 9, `expected 9 H1, got ${shifts.filter(s=>s.half===1).length}`],
    [shifts.filter(s => s.half === 2).length === 5, `expected 5 H2, got ${shifts.filter(s=>s.half===2).length}`],
    [!shifts.some(s => s.name === '—'),             'skip value — must not appear'],
    [shifts.some(s => s.shiftType === 'Помощь'),    'Помощь shifts should be present'],
    [shifts.every(s => s.store && s.shiftType),     'every shift must have store and shiftType'],
  ]);
}

function test_buildEmployeeMap() {
  const map = buildEmployeeMap(T_EMPLOYEES);
  return assert_('buildEmployeeMap', [
    [Object.keys(map).length === 4,                       'expected 4 employees'],
    [map['Бучнева Мария']['role'] === 'бариста',          'Бучнева role'],
    [map['Бучнева Мария']['preferable_store'] === 'Бон Пассаж', 'Бучнева store'],
    [!map[''],                                            'empty key must not exist'],
  ]);
}

function test_buildSalaryMap() {
  const map = buildSalaryMap(T_SALARY);
  return assert_('buildSalaryMap', [
    [map['бариста'] !== undefined,       'бариста rate exists'],
    [map['бариста'].baseHalf === 650,    'бариста baseHalf'],
    [map['бариста'].residualHalf === 250,'бариста residualHalf'],
    [map['бариста'].helper === 800,      'бариста helper'],
  ]);
}

function test_enrichShifts_matched() {
  const shifts   = parseScheduleData(T_SCHEDULE, 4, 2026).shifts;
  const empMap   = buildEmployeeMap(T_EMPLOYEES);
  const salMap   = buildSalaryMap(T_SALARY);
  const enriched = enrichShifts(shifts, empMap, salMap);

  const helpers = enriched.filter(s => s.shiftCategory === 'helper');
  const halves  = enriched.filter(s => s.shiftCategory === 'half');

  return assert_('enrichShifts_matched', [
    [enriched.every(s => s.matched),                   'all sample shifts should match'],
    [helpers.length === 1,                              `expected 1 helper shift, got ${helpers.length}`],
    [helpers[0].basePay === 800,                       'helper basePay = 800'],
    [helpers[0].residualPay === 0,                     'helper residualPay = 0'],
    [halves[0].basePay === 650,                        'half basePay = 650'],
    [halves[0].residualPay === 250,                    'half residualPay = 250'],
  ]);
}

function test_enrichShifts_unmatched() {
  const unknownShift = [{ name: 'Неизвестный Сотрудник', dateStr: '2026-04-01', day: 1, store: 'X', shiftType: 'День', half: 1 }];
  const empMap = buildEmployeeMap(T_EMPLOYEES);
  const salMap = buildSalaryMap(T_SALARY);
  const result = enrichShifts(unknownShift, empMap, salMap);

  return assert_('enrichShifts_unmatched', [
    [result[0].matched === false,        'unknown employee should not match'],
    [result[0].error === 'NOT_IN_DB',    'error should be NOT_IN_DB'],
  ]);
}

function test_parseBonusData() {
  const bonuses = parseBonusData(T_BONUSES, 4, 2026);
  return assert_('parseBonusData', [
    [bonuses.length === 2,                            'expected 2 bonus entries'],
    [bonuses[0].type === 'добавка',                   'first entry type'],
    [bonuses[0].amount === 500,                       'first entry amount'],
    [bonuses[1].type === 'вычет',                     'second entry type'],
    [bonuses[1].amount === 100,                       'second entry amount'],
    [parseBonusData(T_BONUSES, 3, 2026).length === 0, 'wrong month returns empty'],
  ]);
}

function test_parsePaidData() {
  const paid = parsePaidData(T_PAID, 4);
  return assert_('parsePaidData', [
    [paid.length === 1,                       'expected 1 paid record'],
    [paid[0].name === 'Бучнева Мария',        'paid name'],
    [paid[0].amount === 1950,                 'paid amount'],
    [parsePaidData(T_PAID, 3).length === 0,   'wrong month returns empty'],
  ]);
}

function test_h1Calculation() {
  // Expected H1 values (hand-calculated):
  //
  // Бучнева:     2 half (Apr1 День+Ночь)  base=1300 res=500  bonus=0    pen=0    toPayH1=1300
  // Нарожняя:    3 half (Apr1,2,3 День)   base=1950 res=750  bonus=500  pen=0    toPayH1=2450
  // Могильников: 2 half (Apr1,2 Ночь)     base=1300 res=500  bonus=0    pen=0    toPayH1=1300
  // Скворцова:   1 half + 1 helper        base=1450 res=250  bonus=0    pen=100  toPayH1=1350
  //   (Apr2 День=650, Apr2 Помощь=800 → baseH1=1450)

  const { shifts } = parseScheduleData(T_SCHEDULE, 4, 2026);
  const enriched   = enrichShifts(shifts, buildEmployeeMap(T_EMPLOYEES), buildSalaryMap(T_SALARY));
  const bonuses    = parseBonusData(T_BONUSES, 4, 2026);
  const summaries  = calculatePayroll(enriched, bonuses, []);

  const byName = {};
  summaries.forEach(e => { byName[e.name] = e; });

  return assert_('h1Calculation', [
    [byName['Бучнева Мария'].baseH1     === 1300, `Бучнева baseH1: ${byName['Бучнева Мария'].baseH1}`],
    [byName['Бучнева Мария'].toPayH1    === 1300, `Бучнева toPayH1: ${byName['Бучнева Мария'].toPayH1}`],
    [byName['Нарожняя Ангелина'].baseH1  === 1950, `Нарожняя baseH1: ${byName['Нарожняя Ангелина'].baseH1}`],
    [byName['Нарожняя Ангелина'].toPayH1 === 2450, `Нарожняя toPayH1: ${byName['Нарожняя Ангелина'].toPayH1}`],
    [byName['Могильников Александр'].toPayH1 === 1300, `Могильников toPayH1: ${byName['Могильников Александр'].toPayH1}`],
    [byName['Скворцова Мария'].baseH1   === 1450, `Скворцова baseH1: ${byName['Скворцова Мария'].baseH1}`],
    [byName['Скворцова Мария'].toPayH1  === 1350, `Скворцова toPayH1: ${byName['Скворцова Мария'].toPayH1}`],
  ]);
}

function test_h2Calculation() {
  // Expected H2 / monthly values (hand-calculated):
  //
  // Бучнева: H2 shifts: Apr16 День, Apr17 День, Apr17 Ночь = 3 half
  //   baseH2=1950  res H2=750
  //   monthlyTotal = 1300+500+1950+750 = 4500
  //   paidAlready  = 1950  →  toPayH2 = 4500 - 1950 = 2550
  //
  // Нарожняя: H2 shifts: Apr16 День = 1 half
  //   baseH2=650  resH2=250
  //   monthlyTotal = 1950+750+650+250+500 = 4100
  //   paidAlready  = 0    →  toPayH2 = 4100
  //
  // Могильников: H2 shifts: Apr17 День = 1 half
  //   baseH2=650  resH2=250
  //   monthlyTotal = 1300+500+650+250 = 2700
  //   toPayH2 = 2700
  //
  // Скворцова: no H2 shifts
  //   monthlyTotal = 1450+250+0-100 = 1600  →  toPayH2 = 1600

  const { shifts } = parseScheduleData(T_SCHEDULE, 4, 2026);
  const enriched   = enrichShifts(shifts, buildEmployeeMap(T_EMPLOYEES), buildSalaryMap(T_SALARY));
  const bonuses    = parseBonusData(T_BONUSES, 4, 2026);
  const paid       = parsePaidData(T_PAID, 4);
  const summaries  = calculatePayroll(enriched, bonuses, paid);

  const byName = {};
  summaries.forEach(e => { byName[e.name] = e; });

  return assert_('h2Calculation', [
    [byName['Бучнева Мария'].toPayH2          === 2550, `Бучнева toPayH2: ${byName['Бучнева Мария'].toPayH2}`],
    [byName['Бучнева Мария'].monthlyTotal     === 4500, `Бучнева monthly: ${byName['Бучнева Мария'].monthlyTotal}`],
    [byName['Нарожняя Ангелина'].toPayH2      === 4100, `Нарожняя toPayH2: ${byName['Нарожняя Ангелина'].toPayH2}`],
    [byName['Могильников Александр'].toPayH2  === 2700, `Могильников toPayH2: ${byName['Могильников Александр'].toPayH2}`],
    [byName['Скворцова Мария'].toPayH2        === 1600, `Скворцова toPayH2: ${byName['Скворцова Мария'].toPayH2}`],
    [byName['Бучнева Мария'].overpayment      === 0,    'Бучнева no overpayment'],
  ]);
}

function test_verification() {
  // Schedule cost per store:
  //   Бон Пассаж: Apr1(2×900)+Apr2(1×900)+Apr16(1×900)+Apr17(2×900) = 1800+900+900+1800 = 5400
  //   Советов:    Apr1(2×900)+Apr2(2×900+800)+Apr3(1×900)+Apr16(1×900)+Apr17(1×900)
  //             = 1800+2600+900+900+900 = 7100
  //
  // Employee cost by preferableStore (using monthlyTotal with no paid records):
  //   Бон Пассаж: Бучнева(4500) + Скворцова(1600) = 6100
  //   Советов:    Нарожняя(4100) + Могильников(2700) = 6800

  const { shifts } = parseScheduleData(T_SCHEDULE, 4, 2026);
  const enriched   = enrichShifts(shifts, buildEmployeeMap(T_EMPLOYEES), buildSalaryMap(T_SALARY));
  const summaries  = calculatePayroll(enriched, parseBonusData(T_BONUSES, 4, 2026), []);
  const { rows, totals } = calculateVerification(enriched, summaries);

  const byStore = {};
  rows.forEach(r => { byStore[r.store] = r; });

  return assert_('verification', [
    [byStore['Бон Пассаж'].scheduleCost === 5400, `Бон Пассаж schedule: ${byStore['Бон Пассаж'].scheduleCost}`],
    [byStore['Советов'].scheduleCost    === 7100, `Советов schedule: ${byStore['Советов'].scheduleCost}`],
    [byStore['Бон Пассаж'].employeeCost === 6100, `Бон Пассаж employee: ${byStore['Бон Пассаж'].employeeCost}`],
    [byStore['Советов'].employeeCost    === 6800, `Советов employee: ${byStore['Советов'].employeeCost}`],
    [totals.scheduleCost === 12500,               `total schedule: ${totals.scheduleCost}`],
    [totals.employeeCost === 12900,               `total employee: ${totals.employeeCost}`],
  ]);
}


// ── Assertion helper ──────────────────────────────────────────
function assert_(name, checks) {
  const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
  return { name, passed: failed.length === 0, details: failed };
}
