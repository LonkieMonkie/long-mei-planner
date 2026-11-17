# Our Little Life · Long & Mei

A local dashboard for monthly budgets, joint goals, calendar activity and debts between Long and Mei. Built with React, Tailwind CSS, Lucide React and Vite.

## Open in VS Code

Open this project folder in VS Code and run these commands in **Terminal → New Terminal** with Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the localhost URL shown in the terminal. Edit files in `src`. The production command `npm run build` rebuilds `dist` from those files.

## Update the existing GitHub Pages site

1. Extract this archive and copy its contents, including `.github`, into your VS Code clone of `LonkieMonkie/long-mei-planner`. Replace the old workflow when prompted. Preserve your clone’s `.git` directory.
2. Run `npm ci`, `npm test`, and `npm run build` in the clone. Vite replaces the old static files in `dist`. Commit the source, workflow, lockfile, and the removal of any old tracked `dist` files. The workflow generates the new `dist` when deploying.
3. In GitHub, set **Settings → Pages → Source → GitHub Actions**. Commit and push to `main` from VS Code. Check the **Deploy planner** workflow under **Actions**. If a push has no workflow run, select **Run workflow** on `main` from that workflow's page.

## How totals work

- Budget limits recur monthly. Expenses are counted by transaction date and current category ID. The history retains the category name recorded when an entry was saved.
- New income records are raw amounts. Each new expense uses its category’s savings rate for the selected person, rounded once to the nearest cent. Saved expenses keep that rate when you edit the amount. Changing the person or category uses the destination rule. Deleting removes the recorded amount and contribution. Existing income contributions from the prior version are kept in history until the entry is edited or deleted.
- Editing the joint balance records the difference between the stated balance and the contributions already logged. Later entry changes still adjust that balance by the exact difference. The manual adjustment belongs to the overall balance.
- The calendar combines budget entries, deposits, debt payments and events. An event can repeat every day, week, two weeks, month or year, and end on a date or after a number of times. Monthly and yearly repeats on the 29th to 31st fall on the last day of shorter months. Deleting a repeating event removes one date, that date and later ones, or every date.
- The debt ledger offsets open balances in both directions. Settling a debt records its payment timestamp and keeps it in the history.
- Export Excel includes entries, category settings, goal totals, local events and debt history.

## Local data

This version stores its records in ordinary browser localStorage. Each browser and website origin has its own copy. The Long and Mei profiles categorize contributions within that copy. Clearing site storage erases its data.

The dashboard uses a new storage key. It leaves data in the earlier encrypted planner untouched and does not import those records. Export or back up the earlier planner before deploying this version if you need to retain access to those records.

## Login and syncing (optional)

With `src/firebase-config.js` left as `null`, the planner works as described above: no login, data in this browser only.

To sign in as Long or Mei and sync between devices, create a Firebase project with Email/Password sign-in, two users, and a Firestore database, then paste the project's `firebaseConfig` object into `src/firebase-config.js`. The whole planner is stored in one Firestore document, `planner/shared`. Use these Firestore rules, with your two emails:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /planner/{document} {
      allow read, write: if request.auth != null
        && request.auth.token.email in ['YOUR-EMAIL', 'MEI-EMAIL'];
    }
  }
}
```

The first account to sign in uploads that browser's planner as the shared copy. After that, every device shows the shared copy, and each account is linked once to the Long or Mei profile. Saving needs a connection.
