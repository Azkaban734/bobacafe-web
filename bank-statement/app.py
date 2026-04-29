import io
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="Boba Café · Bank Statement", layout="wide")

# ── Tile CSS ──────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  div[data-testid="stHorizontalBlock"] button {
    height: 110px !important;
    border-radius: 14px !important;
    font-size: 1.1rem !important;
    font-weight: 700 !important;
  }
  .bank-label { font-size: 0.75rem; color: #6b7280; margin-top: 4px; text-align: center; }
</style>
""", unsafe_allow_html=True)

# ── State ─────────────────────────────────────────────────────────────────────
if "bank" not in st.session_state:
    st.session_state.bank = None

# ── Header ────────────────────────────────────────────────────────────────────
st.title("Boba Café — Bank Statement Analyser")
st.caption("Select a bank, upload the statement file, then click Run.")

st.divider()

# ── Bank selector tiles ───────────────────────────────────────────────────────
st.subheader("1  Select bank")
col1, col2, col3 = st.columns([1, 1, 3])

with col1:
    sber_type = "primary" if st.session_state.bank == "sber" else "secondary"
    if st.button("🏦  Sberbank", use_container_width=True, type=sber_type, key="btn_sber"):
        st.session_state.bank = "sber"
        st.rerun()

with col2:
    ozon_type = "primary" if st.session_state.bank == "ozon" else "secondary"
    if st.button("🟠  Ozon Bank", use_container_width=True, type=ozon_type, key="btn_ozon"):
        st.session_state.bank = "ozon"
        st.rerun()

if st.session_state.bank:
    bank_name = "Sberbank" if st.session_state.bank == "sber" else "Ozon Bank"
    st.success(f"Selected: **{bank_name}**")

st.divider()

# ── File upload ───────────────────────────────────────────────────────────────
st.subheader("2  Upload statement")
uploaded = st.file_uploader(
    "Drop the statement file here (Excel or CSV)",
    type=["xlsx", "xls", "csv"],
    disabled=st.session_state.bank is None,
)

st.divider()

# ── Run ───────────────────────────────────────────────────────────────────────
st.subheader("3  Run")
run = st.button(
    "▶  Generate report",
    type="primary",
    disabled=(st.session_state.bank is None or uploaded is None),
)

# ── Processing functions ──────────────────────────────────────────────────────

def fmt(v):
    return f"{v:,.2f}" if v else "—"


def _detail_rows_html(df, type_key, months, row_id, val_class):
    """Generate hidden detail rows for a type, grouped by receiver, sorted by total desc."""
    type_df = df[
        (df["type"] == type_key) &
        df["value"].notna() &
        df["receiver"].notna() &
        (df["receiver"] != "") &
        (df["receiver"].astype(str).str.strip() != "nan")
    ].copy()
    if type_df.empty:
        return ""

    type_df["receiver"] = type_df["receiver"].astype(str).str.strip()
    recv_month = type_df.groupby(["receiver", "month"])["value"].sum()
    recv_totals = type_df.groupby("receiver")["value"].sum().sort_values(ascending=False)

    html = ""
    for receiver, _ in recv_totals.items():
        recv_vals = [recv_month.get((receiver, m), 0) for m in months]
        recv_total = sum(recv_vals)
        if recv_total == 0:
            continue
        recv_cells = "".join(f'<td class="{val_class}">{fmt(v)}</td>' for v in recv_vals)
        label = receiver[:90] + ("…" if len(receiver) > 90 else "")
        html += f"""
      <tr class="detail-row" data-parent="{row_id}" style="display:none">
        <td class="detail-label">{label}</td>
        {recv_cells}
        <td class="{val_class} total-col">{fmt(recv_total)}</td>
      </tr>"""
    return html


def process_sber(file_buf) -> str:
    raw = pd.read_excel(file_buf, header=None)
    data = raw.iloc[11:].copy().reset_index(drop=True)

    df = pd.DataFrame({
        "date":        data[1],
        "debit_acct":  data[4],
        "credit_acct": data[8],
        "debit":       pd.to_numeric(data[9],  errors="coerce"),
        "credit":      pd.to_numeric(data[13], errors="coerce"),
        "doc_num":     data[14],
        "vo":          data[16],
        "bank":        data[17],
        "description": data[20],
    })

    df = df[df["date"].notna() & (df["debit"].notna() | df["credit"].notna())].copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df[df["date"].notna()].copy()

    desc = df["description"].astype(str)

    is_pos      = desc.str.contains("Зачисление средств по операциям эквайринга", case=False, na=False)
    is_yandex   = df["debit_acct"].astype(str).str.contains(r"9705114405|Яндекс\.Еда", case=False, na=False)
    is_salary   = desc.str.contains("Заработная плата по реестру", case=False, na=False)
    is_purchase = desc.str.contains("PURCHASE", case=False, na=False) & df["debit"].notna()
    is_return   = desc.str.contains("PURCHASE", case=False, na=False) & df["credit"].notna()
    is_rent     = desc.str.contains("аренд", case=False, na=False)
    is_tax      = desc.str.contains("Единый налоговый платеж|ЕНП|Взносы на обязательное страхование", case=False, na=False)
    is_other    = desc.str.contains("Оплат", case=False, na=False)
    is_bankfee  = desc.str.contains("Комиссия в другие банки", case=False, na=False)

    df["commission"] = pd.to_numeric(
        desc.str.extract(r"Комиссия\s+([\d.]+?)\.")[0], errors="coerce"
    )
    df.loc[~is_pos, "commission"] = None

    df["type"] = None
    df.loc[is_pos,      "type"] = "pos card"
    df.loc[is_yandex,   "type"] = "yandex food"
    df.loc[is_salary,   "type"] = "salary"
    df.loc[is_purchase, "type"] = "purchase"
    df.loc[is_return,   "type"] = "return"
    df.loc[is_rent,     "type"] = "rent"
    df.loc[is_tax,      "type"] = "tax"
    df.loc[is_other & df["type"].isna(), "type"] = "other payments"
    df.loc[is_bankfee,  "type"] = "bank fee"

    df["value"] = None
    df.loc[is_pos,      "value"] = df.loc[is_pos,      "credit"]
    df.loc[is_yandex,   "value"] = df.loc[is_yandex,   "credit"]
    df.loc[is_salary,   "value"] = df.loc[is_salary,   "debit"]
    df.loc[is_purchase, "value"] = df.loc[is_purchase, "debit"]
    df.loc[is_return,   "value"] = df.loc[is_return,   "credit"]
    df.loc[is_rent,     "value"] = df.loc[is_rent,     "debit"]
    df.loc[is_tax,      "value"] = df.loc[is_tax,      "debit"]
    df.loc[df["type"] == "other payments", "value"] = df.loc[df["type"] == "other payments", "debit"]
    df.loc[is_bankfee,  "value"] = df.loc[is_bankfee,  "debit"]

    # Use description as the receiver label for Sberbank
    df["receiver"] = df["description"].astype(str).str.strip()

    df["month"] = df["date"].dt.to_period("M")
    months = sorted(df["month"].dropna().unique())
    month_labels = {str(m): m.strftime("%B %Y") for m in months}

    types_config = [
        ("pos card",       "POS Card Sales",  "#d1fae5", "#065f46", "#10b981", "in"),
        ("pos commission", "POS Commission",  "#fee2e2", "#991b1b", "#ef4444", "out"),
        ("yandex food",    "Yandex.Food",     "#fef3c7", "#92400e", "#f59e0b", "in"),
        ("salary",         "Salary",          "#eef2ff", "#3730a3", "#6366f1", "out"),
        ("purchase",       "Purchase",        "#fce7f3", "#9d174d", "#ec4899", "out"),
        ("return",         "Return",          "#f0fdf4", "#166534", "#22c55e", "in"),
        ("rent",           "Rent",            "#fff7ed", "#9a3412", "#f97316", "out"),
        ("tax",            "Tax",             "#f1f5f9", "#334155", "#64748b", "out"),
        ("other payments", "Other Payments",  "#faf5ff", "#6b21a8", "#a855f7", "out"),
        ("bank fee",       "Bank Fee",        "#fefce8", "#713f12", "#eab308", "out"),
    ]

    summary = df[df["type"].notna()].groupby(["month", "type"])["value"].sum().unstack(fill_value=0)
    commission_summary = df[is_pos].groupby("month")["commission"].sum()
    totals = {str(m): df[df["month"] == m]["credit"].sum() for m in months}

    rows_html = ""
    for i, (type_key, label, bg, color, dot, flow) in enumerate(types_config):
        if type_key == "pos commission":
            vals = [commission_summary.get(m, 0) for m in months]
        else:
            vals = [summary.get(type_key, pd.Series(dtype=float)).get(m, 0) for m in months]
        total = sum(vals)
        if total == 0:
            continue
        row_class = "row-in" if flow == "in" else "row-out"
        val_class = "val-in" if flow == "in" else "val-out"
        cells = "".join(f'<td class="{val_class}">{fmt(v)}</td>' for v in vals)
        row_id = f"grp-{i}"

        rows_html += f"""
      <tr class="{row_class} summary-row" data-id="{row_id}">
        <td>
          <span class="toggle-arrow">&#9654;</span>
          <span class="badge" style="background:{bg};color:{color}">
            <span class="dot" style="background:{dot}"></span>{label}
          </span>
        </td>
        {cells}
        <td class="{val_class} total-col">{fmt(total)}</td>
      </tr>"""

        # pos commission values are derived from POS rows; skip per-receiver detail
        if type_key != "pos commission":
            rows_html += _detail_rows_html(df, type_key, months, row_id, val_class)

    month_headers = "".join(f"<th>{month_labels[str(m)]}</th>" for m in months)
    total_cells   = "".join(f"<td>{fmt(totals[str(m)])}</td>" for m in months)
    grand_total   = fmt(sum(totals.values()))

    note = """
  <strong>POS Card Sales</strong>: "Зачисление средств по операциям эквайринга" — value = credit (net after fee).<br>
  <strong>POS Commission</strong>: fee extracted from description ("Комиссия …").<br>
  <strong>Yandex.Food</strong>: sender INN 9705114405 (ООО Яндекс.Еда) — value = credit.<br>
  <strong>Salary</strong>: "Заработная плата по реестру" — value = debit.<br>
  <strong>Purchase</strong>: card purchases (PURCHASE_CB) — value = debit.<br>
  <strong>Return</strong>: purchase returns/cancellations — value = credit.<br>
  <strong>Rent</strong>: description contains "аренд" — value = debit.<br>
  <strong>Tax</strong>: "Единый налоговый платеж" or "ЕНП" — value = debit.<br>
  <strong>Other Payments</strong>: description contains "Оплат" (rent takes priority if both match) — value = debit."""

    return _build_html("Sberbank", month_headers, rows_html, total_cells, grand_total, note)


def process_ozon(file_buf) -> str:
    raw = pd.read_excel(file_buf, header=None)
    data = raw.iloc[13:].copy().reset_index(drop=True)

    df = pd.DataFrame({
        "date":         data[1],
        "doc_num":      data[2],
        "debit":        pd.to_numeric(data[3], errors="coerce"),
        "credit":       pd.to_numeric(data[4], errors="coerce"),
        "counterparty": data[5],
        "account":      data[6],
        "description":  data[8],
    })

    df = df[df["date"].notna() & (df["debit"].notna() ^ df["credit"].notna())].copy()
    df["date"] = pd.to_datetime(df["date"], dayfirst=True, errors="coerce")
    df = df[df["date"].notna()].copy()

    desc = df["description"].astype(str)

    is_ozon_orders = desc.str.contains("Оплата по заказу", case=False, na=False)
    is_purchase    = desc.str.contains("бизнес карте", case=False, na=False)
    is_return      = desc.str.contains("Возврат", case=False, na=False)
    is_rent        = desc.str.contains("аренд", case=False, na=False)
    is_bankfee     = desc.str.contains("Комиссия за исполнение", case=False, na=False)
    is_other       = desc.str.contains("Оплат|Услуги по доставке воды", case=False, na=False)

    df["type"] = None
    df.loc[is_ozon_orders, "type"] = "ozon orders"
    df.loc[is_purchase,    "type"] = "purchase"
    df.loc[is_return,      "type"] = "return"
    df.loc[is_rent,        "type"] = "rent"
    df.loc[is_bankfee,     "type"] = "bank fee"
    df.loc[is_other & df["type"].isna(), "type"] = "other payments"

    df["value"] = None
    df.loc[df["type"] == "ozon orders",    "value"] = df.loc[df["type"] == "ozon orders",    "debit"]
    df.loc[df["type"] == "purchase",       "value"] = df.loc[df["type"] == "purchase",       "debit"]
    df.loc[df["type"] == "return",         "value"] = df.loc[df["type"] == "return",         "credit"]
    df.loc[df["type"] == "rent",           "value"] = df.loc[df["type"] == "rent",           "debit"]
    df.loc[df["type"] == "bank fee",       "value"] = df.loc[df["type"] == "bank fee",       "debit"]
    df.loc[df["type"] == "other payments", "value"] = df.loc[df["type"] == "other payments", "debit"]

    # Ozon has an explicit counterparty column
    df["receiver"] = df["counterparty"].astype(str).str.strip()

    df["month"] = df["date"].dt.to_period("M")
    months = sorted(df["month"].dropna().unique())
    month_labels = {str(m): m.strftime("%B %Y") for m in months}

    types_config = [
        ("ozon orders",   "Ozon Orders",    "#e0f2fe", "#075985", "#0ea5e9", "out"),
        ("purchase",      "Purchase",       "#fce7f3", "#9d174d", "#ec4899", "out"),
        ("return",        "Return",         "#f0fdf4", "#166534", "#22c55e", "in"),
        ("rent",          "Rent",           "#fff7ed", "#9a3412", "#f97316", "out"),
        ("bank fee",      "Bank Fee",       "#fefce8", "#713f12", "#eab308", "out"),
        ("other payments","Other Payments", "#faf5ff", "#6b21a8", "#a855f7", "out"),
    ]

    summary = df[df["type"].notna()].groupby(["month", "type"])["value"].sum().unstack(fill_value=0)
    totals  = {str(m): df[df["month"] == m]["credit"].sum() for m in months}

    rows_html = ""
    for i, (type_key, label, bg, color, dot, flow) in enumerate(types_config):
        vals  = [summary.get(type_key, pd.Series(dtype=float)).get(m, 0) for m in months]
        total = sum(vals)
        if total == 0:
            continue
        row_class = "row-in" if flow == "in" else "row-out"
        val_class = "val-in" if flow == "in" else "val-out"
        cells = "".join(f'<td class="{val_class}">{fmt(v)}</td>' for v in vals)
        row_id = f"grp-{i}"

        rows_html += f"""
      <tr class="{row_class} summary-row" data-id="{row_id}">
        <td>
          <span class="toggle-arrow">&#9654;</span>
          <span class="badge" style="background:{bg};color:{color}">
            <span class="dot" style="background:{dot}"></span>{label}
          </span>
        </td>
        {cells}
        <td class="{val_class} total-col">{fmt(total)}</td>
      </tr>"""

        rows_html += _detail_rows_html(df, type_key, months, row_id, val_class)

    month_headers = "".join(f"<th>{month_labels[str(m)]}</th>" for m in months)
    total_cells   = "".join(f"<td>{fmt(totals[str(m)])}</td>" for m in months)
    grand_total   = fmt(sum(totals.values()))

    note = """
  <strong>Ozon Orders</strong>: "Оплата по заказу" — value = debit.<br>
  <strong>Purchase</strong>: business card transactions ("бизнес карте") — value = debit.<br>
  <strong>Return</strong>: "Возврат" — value = credit.<br>
  <strong>Rent</strong>: description contains "аренд" — value = debit.<br>
  <strong>Bank Fee</strong>: "Комиссия за исполнение" — value = debit.<br>
  <strong>Other Payments</strong>: description contains "Оплат" (rent takes priority) — value = debit."""

    return _build_html("Ozon Bank", month_headers, rows_html, total_cells, grand_total, note)


def _build_html(bank_name, month_headers, rows_html, total_cells, grand_total, note) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f4f6f9; color: #1a1a2e; padding: 32px 20px;
    }}
    header {{ max-width: 900px; margin: 0 auto 28px; }}
    header h1 {{ font-size: 1.6rem; font-weight: 700; }}
    header p {{ font-size: 0.88rem; color: #6b7280; margin-top: 4px; }}
    .legend {{ max-width: 900px; margin: 0 auto 20px; display: flex; gap: 20px; font-size: 0.82rem; color: #6b7280; }}
    .legend span {{ display: flex; align-items: center; gap: 6px; }}
    .legend-bar {{ width: 12px; height: 12px; border-radius: 2px; }}
    .table-wrap {{
      max-width: 900px; margin: 0 auto 40px; background: #fff;
      border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden;
    }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.88rem; }}
    thead tr {{ background: #1a1a2e; color: #fff; }}
    thead th {{
      padding: 12px 18px; text-align: left; font-weight: 600;
      font-size: 0.76rem; text-transform: uppercase; letter-spacing: .05em;
    }}
    thead th:not(:first-child) {{ text-align: right; }}
    tbody td {{ padding: 12px 18px; border-bottom: 1px solid #f0f0f0; }}
    tbody td:not(:first-child) {{ text-align: right; font-variant-numeric: tabular-nums; }}
    tfoot tr {{ background: #1a1a2e; color: #fff; }}
    tfoot td {{ padding: 13px 18px; font-weight: 700; font-size: 0.88rem; }}
    tfoot td:not(:first-child) {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .row-in  {{ border-left: 3px solid #10b981; }}
    .row-out {{ border-left: 3px solid #ef4444; }}
    .val-in  {{ color: #065f46; font-weight: 600; }}
    .val-out {{ color: #991b1b; font-weight: 600; }}
    .total-col {{ font-weight: 700; }}
    .badge {{
      display: inline-flex; align-items: center; gap: 6px;
      border-radius: 6px; padding: 3px 10px; font-size: 0.76rem; font-weight: 600;
    }}
    .dot {{ width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }}
    .note {{ max-width: 900px; margin: -28px auto 0; font-size: 0.78rem; color: #9ca3af; line-height: 1.8; }}

    /* ── Expandable rows ── */
    .summary-row {{ cursor: pointer; user-select: none; }}
    .summary-row:hover {{ background: #f0f4ff; }}
    .toggle-arrow {{
      display: inline-block;
      font-size: 0.6rem;
      color: #9ca3af;
      margin-right: 6px;
      transition: transform 0.18s ease;
      vertical-align: middle;
    }}
    .summary-row.expanded .toggle-arrow {{
      transform: rotate(90deg);
    }}
    .detail-row {{ background: #fafbff; }}
    .detail-row:hover {{ background: #f0f4ff; }}
    .detail-label {{
      padding-left: 48px !important;
      font-size: 0.82rem;
      color: #374151;
      max-width: 320px;
      word-break: break-word;
    }}
  </style>
</head>
<body>
<header>
  <h1>{bank_name} — Monthly Summary</h1>
  <p>Source: {bank_name} statement · Currency: RUB · Click a row to expand details by receiver</p>
</header>
<div class="legend">
  <span><span class="legend-bar" style="background:#10b981"></span>Money in</span>
  <span><span class="legend-bar" style="background:#ef4444"></span>Money out</span>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Type</th>
        {month_headers}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>{rows_html}
    </tbody>
    <tfoot>
      <tr>
        <td>Total Received</td>
        {total_cells}
        <td>{grand_total}</td>
      </tr>
    </tfoot>
  </table>
</div>
<p class="note">{note}</p>

<script>
  document.querySelectorAll('.summary-row').forEach(function(row) {{
    row.addEventListener('click', function() {{
      var id = this.dataset.id;
      var expanded = this.classList.toggle('expanded');
      document.querySelectorAll('.detail-row[data-parent="' + id + '"]').forEach(function(r) {{
        r.style.display = expanded ? '' : 'none';
      }});
    }});
  }});
</script>
</body>
</html>"""


# ── Run & render ──────────────────────────────────────────────────────────────
if run:
    st.divider()
    with st.spinner("Processing…"):
        try:
            buf = io.BytesIO(uploaded.read())
            if st.session_state.bank == "sber":
                html_out = process_sber(buf)
            else:
                html_out = process_ozon(buf)

            st.subheader("4  Report")
            col_dl, _ = st.columns([1, 4])
            with col_dl:
                bank_slug = "sber" if st.session_state.bank == "sber" else "ozon"
                st.download_button(
                    "⬇  Download HTML",
                    data=html_out.encode("utf-8"),
                    file_name=f"{bank_slug}_monthly.html",
                    mime="text/html",
                )
            components.html(html_out, height=700, scrolling=True)

        except Exception as e:
            st.error(f"Error processing file: {e}")
            st.exception(e)
