// ============================================================
// DATAACCESS.GS — All SpreadsheetApp read/write calls
//
// Only this file touches Google Sheets. Payroll.gs never does.
// ============================================================

function _sheet(spreadsheetId, tabName) {
  const ss    = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error(`Tab "${tabName}" not found in spreadsheet ${spreadsheetId}`);
  return sheet;
}

function readScheduleRaw()  { return _sheet(SS_IDS.SCHEDULE,  TABS.SCHEDULE).getDataRange().getValues(); }
function readEmployeesRaw() { return _sheet(SS_IDS.EMPLOYEES, TABS.EMPLOYEES).getDataRange().getValues(); }
function readSalaryRaw()    { return _sheet(SS_IDS.MAIN,      TABS.SALARY).getDataRange().getValues(); }
function readBonusesRaw()   { return _sheet(SS_IDS.BONUSES,   TABS.BONUSES).getDataRange().getValues(); }
function readPaidRaw()      { return _sheet(SS_IDS.MAIN,      TABS.PAID).getDataRange().getValues(); }

function writePaymentSheet(rows) {
  const sheet = _sheet(SS_IDS.MAIN, TABS.PAYMENT);
  sheet.clearContents();
  if (rows.length) sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  // Bold the header row
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
}

function writeVerificationSheet(rows) {
  const sheet = _sheet(SS_IDS.MAIN, TABS.VERIFICATION);
  sheet.clearContents();
  if (rows.length) sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  // Bold header and totals row
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.getRange(rows.length, 1, 1, rows[0].length).setFontWeight('bold');
}
