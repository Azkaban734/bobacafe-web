# GitHub Pages deploy – schedule app and how to verify

## Workflow summary

1. **Build** – Runs `npm ci` and `npm run build` in `schedule-app/`. Output goes to `schedule-app/build/` (ignored by git).
2. **Prepare deploy** – Copies that build into `deploy/schedule/` and root page into `deploy/index.html`.
3. **Upload artifact** – Used when Pages source is **“GitHub Actions”**.
4. **Update branch** – Copies the same build to repo root as `schedule/`, commits `schedule/`, `index.html`, `.nojekyll`, and pushes to the branch that triggered the run. Used when Pages source is **“Deploy from a branch”**.

## How to check that the app is built

### In GitHub Actions (after a run)

1. Repo → **Actions** → latest **“Deploy to GitHub Pages”** run.
2. Open the **“Build React app (schedule-app)”** step:
   - You should see `--- Built output ---` and a listing of `build/` with `index.html`, `static/`, etc.
3. Open the **“Prepare deploy from build output”** step:
   - You should see `deploy/schedule/` with `index.html`, `static/`, etc.
4. Open the **“Update branch …”** step:
   - Either **“No changes to commit”** (branch already had this build), or **“Pushed schedule/ and index.html to &lt;branch&gt;”** (new commit was pushed).

### On GitHub (in the repo)

1. Switch to the branch you use for Pages (e.g. **commit/root** or **main**).
2. At the **repo root** (not inside `main-site/`), you must see a **schedule** folder.
3. Open **schedule** → you should see:
   - `index.html`
   - `static/` (with `js/`, `css/`, etc.)
   - `asset-manifest.json` (and maybe `manifest.json`, `favicon.ico`).

If **schedule** is missing at repo root on that branch, either:

- The workflow hasn’t pushed to this branch yet (e.g. you only run it on **commit/root** but deploy from **main**), or  
- The push failed (check the “Update branch” step for errors).

### Locally (after pull)

```bash
git fetch origin
git checkout commit/root   # or main, whichever you deploy from
git pull
ls schedule/
```

You should see `index.html`, `static/`, etc. under `schedule/`.

## Pages source must match the workflow

- **“Deploy from a branch”**  
  - **Branch** in Settings → Pages must be the same one the workflow pushes to (**main** or **commit/root**).  
  - **Folder** must be **/(root)** so that repo root `index.html` and `schedule/` are served.  
  - Then `https://<user>.github.io/bobacafe/` = root page, `https://<user>.github.io/bobacafe/schedule/` = schedule app.

- **“GitHub Actions”**  
  - The workflow’s artifact is used. No branch folder needed.  
  - Same URLs as above.

## .gitignore (relevant parts)

- **`**/node_modules`** – Dependencies; not committed. OK.
- **`**/build`** – Ignores `schedule-app/build/`. The workflow only copies from that folder into `deploy/schedule/` and repo root `schedule/`; we never commit `schedule-app/build/`. OK.
- **`schedule/`** is not in .gitignore – the `schedule/` at repo root (created by the workflow) is committed and pushed. OK.

So .gitignore is correct for this setup.
