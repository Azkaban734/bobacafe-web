# CLAUDE.md — bobacafe-web

Website and internal tooling for Боба Кролик (Boba Rabbit) bubble tea cafés.

**Live:** https://bobacafe.net · **Internal:** https://bobacafe.net/internal

---

## Project layout

```
bobacafe-web/
├── index.html              # Public site (menu, locations, Yandex map)
├── internal/
│   ├── index.html          # PIN-gated internal portal (sessionStorage auth)
│   ├── faq.html            # Employee FAQ (live-loads Google Sheets CSV)
│   ├── dashboard.html      # Databricks embedded dashboard (token injected at deploy)
│   ├── schedule/           # Compiled React schedule app (do not edit directly)
│   └── reports/            # Business intelligence HTML reports
├── main-site/reports/      # Synced report HTMLs + auto-generated index.html
├── schedule-app/           # React 19 + TypeScript source for the schedule app
├── bank-statement/         # Streamlit bank statement analyser (separate deployment)
├── payment/                # Google Apps Script payment system
├── .github/workflows/      # CI/CD — deploy-pages.yml
└── sync-reports.ps1        # Copies Databricks reports and regenerates index
```

---

## Deployment

GitHub Pages only — no Netlify or Vercel.

**Trigger:** every push to `main` (or manual `workflow_dispatch`).

**Pipeline (`deploy-pages.yml`):**
1. Build React app: `cd schedule-app && npm ci && npm run build`
2. Mint a Databricks embedded dashboard token via OAuth and inject it into `internal/dashboard.html`
3. Assemble `deploy/` with: `index.html`, `internal/`, `internal/schedule/` (React build), `internal/reports/`
4. Upload and deploy to GitHub Pages

---

## Syncing reports from bobacafe-databricks

New reports live in the sibling repo `boba-cafe-databricks/weekly-analysis/analysis-html/`.

```powershell
# 1. Pull latest reports
cd ..\boba-cafe-databricks && git pull && cd ..\bobacafe-web

# 2. Sync into this repo
.\sync-reports.ps1

# 3. Commit and push to publish
git add main-site/reports/
git commit -m "sync: add new report"
git push
```

If the script is blocked by execution policy:
```powershell
powershell -ExecutionPolicy Bypass -File .\sync-reports.ps1
```

Custom source path:
```powershell
.\sync-reports.ps1 -SourceDir "C:\other\path\to\analysis-html"
```

`sync-reports.ps1` copies all `.html` files to `main-site/reports/` and regenerates `index.html` (UTF-8 without BOM, sorted newest-first by filename).

---

## Schedule app (React)

Source: `schedule-app/` · Built output goes to `internal/schedule/` via CI.

```powershell
cd schedule-app
npm install   # first time only
npm start     # dev server at localhost:3000
npm run build # production build
```

`homepage` in `package.json` is set to `/internal/schedule` so asset paths resolve correctly on the live site.

---

## Key facts

- The `internal/` portal uses PIN auth stored in `sessionStorage` (clears on tab close).
- `internal/dashboard.html` has a Databricks token baked in at CI time — don't hand-edit it.
- `bank-statement/` is deployed separately to Streamlit Community Cloud.
