import csv
import io

import streamlit as st

import config
from data_access import (read_bonuses_raw, read_employees_raw, read_paid_raw,
                          read_salary_raw, read_schedule_raw)
from payroll import (build_payment_rows, build_verification_rows,
                     calculate_payroll, calculate_verification,
                     enrich_shifts, parse_bonus_data, parse_paid_data,
                     parse_schedule_data, build_employee_map, build_salary_map)
from tests import run_all_tests

st.set_page_config(page_title='Boba Rabbit — Payroll', layout='wide')

# ── Auth gate ─────────────────────────────────────────────────────────────────

if not getattr(st.user, 'is_logged_in', False):
    st.title('Boba Rabbit — Payroll Calculator')
    st.button('Sign in with Google', on_click=st.login, args=('google',))
    st.stop()

if st.user.email not in config.ALLOWED_EMAILS:
    st.error('Access denied. Your Google account is not authorized.')
    st.button('Sign out', on_click=st.logout)
    st.stop()

# ── Sidebar ───────────────────────────────────────────────────────────────────

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']

from datetime import date as _date
_today = _date.today()

with st.sidebar:
    st.title('Boba Rabbit')
    st.caption(st.user.email)
    st.divider()
    month = st.selectbox('Month', range(1, 13),
                          format_func=lambda m: MONTHS[m - 1],
                          index=_today.month - 1)
    year = st.number_input('Year', min_value=2020, max_value=2100,
                            value=_today.year, step=1)
    st.divider()
    calc_btn      = st.button('Calculate', type='primary', use_container_width=True)
    run_tests_btn = st.button('Run Tests', use_container_width=True)
    st.divider()
    st.button('Sign out', on_click=st.logout, use_container_width=True)

# ── Header ────────────────────────────────────────────────────────────────────

st.title('Payroll Calculator')

# ── Tests ─────────────────────────────────────────────────────────────────────

if run_tests_btn:
    with st.spinner('Running tests...'):
        results = run_all_tests()
    passed = sum(1 for r in results if r['passed'])
    if passed == len(results):
        st.success(f'Tests: {passed}/{len(results)} passed')
    else:
        st.error(f'Tests: {passed}/{len(results)} passed')
    for r in results:
        icon = '✅' if r['passed'] else '❌'
        st.write(f'{icon} **{r["name"]}**')
        for d in r.get('details', []):
            st.caption(f'  {d}')

# ── Calculate ─────────────────────────────────────────────────────────────────

if calc_btn:
    with st.spinner('Loading data and calculating...'):
        try:
            raw_schedule  = read_schedule_raw()
            raw_employees = read_employees_raw()
            raw_salary    = read_salary_raw()
            raw_bonuses   = read_bonuses_raw()
            raw_paid      = read_paid_raw()

            shifts, warnings = parse_schedule_data(raw_schedule, int(month), int(year))
            employee_map     = build_employee_map(raw_employees)
            salary_map       = build_salary_map(raw_salary)
            enriched         = enrich_shifts(shifts, employee_map, salary_map)
            unmatched        = [s for s in enriched if not s['matched']]
            bonuses          = parse_bonus_data(raw_bonuses, int(month), int(year))
            paid             = parse_paid_data(raw_paid, int(month))
            summaries        = calculate_payroll(enriched, bonuses, paid)
            verification     = calculate_verification(enriched, summaries)

            st.session_state['calc'] = {
                'shifts': shifts, 'warnings': warnings,
                'employee_map': employee_map,
                'enriched': enriched, 'unmatched': unmatched,
                'bonuses': bonuses, 'paid': paid,
                'summaries': summaries, 'verification': verification,
                'month': int(month), 'year': int(year),
            }
        except Exception as e:
            import traceback
            st.error(f'Error: {e}')
            st.code(traceback.format_exc())

# ── Results ───────────────────────────────────────────────────────────────────

if 'calc' not in st.session_state:
    st.stop()

c = st.session_state['calc']
warn_count = len(c['warnings']) + len(c['unmatched'])

if warn_count:
    st.info(f"Done: {len(c['summaries'])} employees, {warn_count} warning(s)")
else:
    st.success(f"Done: {len(c['summaries'])} employees, no warnings")

# Panel 1 — Schedule
h1_count = sum(1 for s in c['shifts'] if s['half'] == 1)
h2_count = sum(1 for s in c['shifts'] if s['half'] == 2)
with st.expander(f"1 · Schedule — {len(c['shifts'])} shifts (H1: {h1_count}, H2: {h2_count})"):
    if c['warnings']:
        st.warning('\n'.join(c['warnings']))
    st.dataframe(c['shifts'], use_container_width=True)

# Panel 2 — Matching
with st.expander(f"2 · Data Matching — {len(c['employee_map'])} employees in DB, {len(c['unmatched'])} unmatched",
                  expanded=len(c['unmatched']) > 0):
    if c['unmatched']:
        st.error(f"Not found in database ({len(c['unmatched'])}):")
        st.dataframe(c['unmatched'], use_container_width=True)
        st.divider()
    col_b, col_p = st.columns(2)
    with col_b:
        st.write(f"**Bonuses / Penalties ({len(c['bonuses'])})**")
        st.dataframe(c['bonuses'] if c['bonuses'] else [], use_container_width=True)
    with col_p:
        st.write(f"**Already Paid ({len(c['paid'])})**")
        st.dataframe(c['paid'] if c['paid'] else [], use_container_width=True)

# Panel 3 — H1
total_h1 = sum(e['toPayH1'] for e in c['summaries'])
with st.expander(f"3 · First Half (days 1–15) — To pay: {total_h1:,.0f}"):
    st.dataframe([{
        'Name': e['name'], 'Store': e['preferableStore'], 'Role': e['role'],
        'Half': e['halfShiftsH1'], 'Full': e['fullShiftsH1'], 'Helper': e['helperShiftsH1'],
        'Base H1': e['baseH1'], 'Residual H1': e['residualH1'],
        'Bonus': e['bonusTotal'], 'Penalty': e['penaltyTotal'],
        'TO PAY H1': e['toPayH1'],
    } for e in c['summaries']], use_container_width=True)

# Panel 4 — H2
total_h2  = sum(e['toPayH2'] for e in c['summaries'])
total_ove = sum(e['overpayment'] for e in c['summaries'])
h2_label  = f"4 · Second Half (days 16–end) — To pay: {total_h2:,.0f}"
if total_ove:
    h2_label += f"  ·  Overpayment: {total_ove:,.0f}"
with st.expander(h2_label):
    st.dataframe([{
        'Name': e['name'], 'Store': e['preferableStore'],
        'Base H2': e['baseH2'], 'Residual H2': e['residualH2'], 'Residual H1': e['residualH1'],
        'Earned': e['monthlyEarned'], 'Total (adj.)': e['monthlyTotal'],
        'Already Paid': e['paidAlready'], 'TO PAY H2': e['toPayH2'],
        'Overpayment': e['overpayment'],
    } for e in c['summaries']], use_container_width=True)

# Panel 5 — Verification
v        = c['verification']
t        = v['totals']
has_diff = t['diff'] != 0
v_label  = f"5 · Verification — Schedule: {t['scheduleCost']:,.0f}  ·  Employees: {t['employeeCost']:,.0f}"
if has_diff:
    v_label += f"  ·  Diff: {t['diff']:,.0f}"
with st.expander(v_label, expanded=has_diff):
    col1, col2, col3 = st.columns(3)
    col1.metric('By Schedule', f"{t['scheduleCost']:,.0f}")
    col2.metric('By Employee', f"{t['employeeCost']:,.0f}")
    col3.metric('Adjustment', f"{t['diff']:,.0f}", delta_color='inverse' if t['diff'] != 0 else 'off')

# ── Downloads ─────────────────────────────────────────────────────────────────

def _to_csv(rows):
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue().encode('utf-8-sig')

m, y = c['month'], c['year']
payment_csv      = _to_csv(build_payment_rows(c['summaries']))
verification_csv = _to_csv(build_verification_rows(c['verification']))

st.divider()
dl1, dl2 = st.columns(2)
with dl1:
    st.download_button('Download Payment CSV', payment_csv,
                        file_name=f'payment_{y}_{m:02d}.csv', mime='text/csv')
with dl2:
    st.download_button('Download Verification CSV', verification_csv,
                        file_name=f'verification_{y}_{m:02d}.csv', mime='text/csv')
