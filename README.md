# Our Little Life — Long & Mei

A cozy, responsive couple planner. No subscriptions, third-party scripts, external fonts, build dependencies, or backend required.

## What it does

- Biweekly take-home income inputs for Long and Mei.
- Adjustable percentages for essentials, personal savings, joint savings, debt payments and little joys. Each person's percentages must total 100%.
- Live weekly and biweekly savings calculations. Money is allocated in integer cents using largest-remainder rounding, so no cents disappear.
- Click-to-save budgets, saved-period history and editing. Resaving the same period replaces it; overlapping periods are rejected.
- Separate personal savings goals and a shared savings pot. Planned balances are opening balances plus allocations from all saved periods, not bank balances or confirmed transfers. Include each existing dollar only once in opening balances.
- Daily habits for Long, Mei or Together, weekly views, check-ins saved on click, and reversible archiving with history preserved.
- Editable reflections with author, mood, reflection date and last-saved timestamp.
- Current date based on the device's timezone.
- Genuine Excel `.xlsx` export with six worksheets. Numeric amounts are numeric cells; user-written text is stored as text, never spreadsheet formulas.
- Password-encrypted local saving, encrypted backup downloads and restore, passphrase changes, manual locking and five-minute idle locking.

## Publish on GitHub Pages

1. Create a new repository named `long-mei-planner` on your GitHub account. A public repository works with GitHub Free. Source code contains no passwords or personal financial records. A private repository may require a paid GitHub plan for Pages.
2. Upload **the contents of this folder** (including `dist`, `tests`, `package.json`, and `.github/workflows/pages.yml`) to its `main` branch. Do not upload the ZIP file itself.
3. Open **Settings → Pages → Build and deployment → Source**, then select **GitHub Actions**.
4. Open **Actions → Publish planner to GitHub Pages → Run workflow**. Later pushes to `main` deploy automatically.
5. Open the website URL shown by the successful deployment. Use HTTPS. Create your own long, unique shared passphrase on the site; no passphrase is embedded in the code.

If uploading through GitHub's web interface doesn't preserve the hidden `.github` folder, use Git or GitHub Desktop to publish the complete folder. Alternatively, copy the contents of `dist` to a new repository root, include `.nojekyll`, and set **Settings → Pages → Deploy from a branch → main / (root)**; the automated tests/workflow then aren't part of deployment.

The Pages workflow uses only static assets from `dist`. The local `.openai` directory is preview configuration, ignored by Git and not needed on GitHub.

## First use

1. Create a shared passphrase of at least 12 characters (several random words are better). Store it in a password manager.
2. Set opening balances and goals in **Savings & dreams** and save them.
3. Enter both biweekly incomes and percentages under **Our budget**. Save each 14-day period once, editing that period when needed.
4. Check off habits, write reflections and save them.
5. Download an **encrypted backup** regularly from **Privacy & backup**.

## Sharing with Mei / switching devices

This version is **local-first, with no automatic cloud sync**. Each browser has an independent encrypted copy. Share the downloaded encrypted backup with Mei and enter its passphrase on Mei's device to restore it. Share the passphrase separately. Restoring replaces that browser's data; it does not merge independently edited copies. Keep one primary copy and exchange the newest backup when switching who edits.

GitHub Pages serves only HTML/CSS/JavaScript; it does not store private database records. Real-time multi-device collaboration would require a separately provisioned authenticated backend. Do not put financial data, account passwords, API secrets, backup files, or exported workbooks in the repository.

## Security and limitations

- Data at rest uses Web Crypto AES-256-GCM with a fresh random 96-bit IV per save, a random 128-bit salt, and PBKDF2-SHA256 with 600,000 iterations to derive a non-extractable encryption key.
- The passphrase and decrypted data remain in memory only while unlocked. Only the encrypted envelope is written to localStorage. The app makes no network requests with planner data; CSP disables outbound connections and third-party scripts.
- Strong encryption is not a guarantee against hacking. Weak passphrases can be guessed offline. Compromised devices, malicious extensions and modified website code can read information while unlocked. Protect the GitHub account with two-factor authentication and restrict repository write access.
- The public website code and welcome screen are visible to visitors. Visitors cannot access another browser's local data through this app. This is data encryption, not a server-side account login or private website gate.
- No password reset or recovery is possible. Lost passphrase = inaccessible data. Old backup files retain their old passphrase after a password change.
- Clearing site data, changing browsers or devices, and private browsing can remove or isolate saved records. Keep independent encrypted backups. Moving the site to a different domain requires backup and restore.
- The planner locks after five minutes without interaction, discarding unsaved edits. Save before stepping away. Browser close/refresh warns about unsaved edits where supported.
- Concurrent tabs use the Web Locks API when available and compare the saved encrypted envelope before writing. A stale tab must lock and unlock before saving. Older browsers without Web Locks have only best-effort conflict detection; use one tab.
- Excel exports are **not encrypted**. Anyone with the downloaded workbook can read its contents. Keep them private. Export contains saved data only, not unsaved form edits.
- Data is shared within the couple's vault: this version does not offer separate permissions or private-to-one-person notes.
- Amounts are USD. Weekly values are biweekly amounts divided by two, displayed to the nearest cent; separate rounded weekly amounts can differ from their combined total by one cent.

## Develop and test

Requires Node.js 22+ for tests. No package installation is needed.

```sh
npm test
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. ES modules and Web Crypto require HTTPS or localhost; do not open `index.html` as a `file://` URL.

The welcome screen has a clearly labeled demo with sample data. Demo edits never modify the encrypted planner.

## Source map

- `dist/index.html`, `dist/style.css`: accessible responsive shell, visual design and content security policy.
- `dist/app.js`: planner UI, save actions, backup/restore and inactivity lock.
- `dist/core.js`: calculation, dates, state validation and saved-period rules.
- `dist/vault.js`: encryption and passphrase key derivation.
- `dist/excel.js`: dependency-free OOXML ZIP workbook writer.
- `tests/core.test.mjs`: money, date, encryption, validation and Excel tests.
- `.github/workflows/pages.yml`: testing and deployment workflow.
