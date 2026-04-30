# Боба Кролик — Web Platform

Website and internal tooling for Боба Кролик (Boba Rabbit) bubble tea cafés.

**Live:** [bobacafe.net](https://bobacafe.net) · **Internal:** [bobacafe.net/internal](https://bobacafe.net/internal)

---

## Structure

```
bobacafe-web/
├── index.html              # Public site (menu, locations, Yandex map)
├── internal/
│   ├── index.html          # Internal portal (PIN-gated dashboard)
│   ├── faq.html            # Employee FAQ (live from Google Sheets)
│   └── reports/            # Business reports (weekly / monthly HTML)
├── schedule-app/           # React source for the staff schedule app
├── bank-statement/         # Streamlit bank statement analyser
├── payment/                # Google Apps Script payment system
├── payroll-app/            # Streamlit payroll app (WIP)
└── .github/workflows/      # GitHub Actions deploy pipeline
```

## Sites

### Public — `bobacafe.net`
Static landing page with the café menu, branch locations, and an interactive Yandex map. Deployed automatically on every push to `main`.

### Internal — `bobacafe.net/internal`
PIN-protected dashboard (PIN: see ops team) linking to all internal tools.

| App | URL | Stack |
|-----|-----|-------|
| Staff Schedule | `/internal/schedule/` | React 19, built in CI |
| Employee FAQ | `/internal/faq.html` | Vanilla JS, live Google Sheets CSV |
| Reports | `/internal/reports/` | Static HTML |
| Bank Statement | [bobacafe-web-bank-statement.streamlit.app](https://bobacafe-web-bank-statement.streamlit.app) | Streamlit, pandas |
| Payroll | TBD | Streamlit |
| Payments | TBD | Google Apps Script |

## Deployment

GitHub Actions (`.github/workflows/deploy-pages.yml`) runs on every push to `main`:

1. Builds the React schedule app (`schedule-app/`) with `npm ci && npm run build`
2. Assembles a `deploy/` folder:
   - `index.html` → site root
   - `internal/index.html` + `internal/faq.html` → internal portal pages
   - `schedule-app/build/` → `internal/schedule/`
   - `internal/reports/` → `internal/reports/`
3. Publishes to GitHub Pages via `actions/deploy-pages`

The Streamlit bank statement app deploys separately on [Streamlit Community Cloud](https://share.streamlit.io) from `bank-statement/app.py`.

## Local Development

**Schedule app**
```bash
cd schedule-app
npm install
npm start          # http://localhost:3000
```

**Bank statement app**
```bash
cd bank-statement
pip install -r requirements.txt
streamlit run app.py
```

## Adding a Report

1. Drop the HTML file into `internal/reports/`
2. Add a row for it in `internal/reports/index.html`
3. Push — CI deploys it automatically

## Notes

- Bank statement CSV/XLSX files are gitignored — never commit real financial data
- The schedule app `homepage` in `package.json` is set to `/internal/schedule` so built asset paths resolve correctly
- Internal portal uses `sessionStorage` for the PIN session (clears on tab close)
