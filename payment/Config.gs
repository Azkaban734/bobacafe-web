// ============================================================
// CONFIG.GS — Spreadsheet IDs and tab names
// Fill in every TODO before running for the first time.
// ============================================================

const SS_IDS = {
  SCHEDULE:  '1eAUsX8X5vUYiFUU3Y5sPYFymHMIIKCpwvFkbNFgIBMk',
  EMPLOYEES: '13NzqIfIIvAqeUcq9AeUGGap_OOWZVt23ViC9vvJaQvQ',
  MAIN:      '1B67ub1WIsF7_otFiUvB5qG_I_Px2jdcdwvPdNOFQz4k', // salary + paid + payment + verification
  BONUSES:   '1FVzBV3JL1BfIxT179x_sHMt58Vyy-oZrS6YWsyouv70',
};

const TABS = {
  SCHEDULE:     'source_for_app',
  EMPLOYEES:    'Employee',
  SALARY:       'Role Salary Dictionary',
  BONUSES:      'CHANGE C TO TEXT',
  PAID:         '2026',
  PAYMENT:      'Test_Payment',
  VERIFICATION: 'Test_Verification',
};

// Cell values that mean "no one is working" — treated as empty
const SKIP_VALUES = ['—', '-', 'вых', 'off', 'точка не работает'];
