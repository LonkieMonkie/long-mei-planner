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
- When adding income, each budget category shows the signed-in person's share of income. Ticked shares can add up to 100% or less, never more; whatever isn't ticked goes to Personal checking. Each category gets its share set aside for the month (shown on the Budget page), with rounding cents given out so the shares add up to the full amount. Shares for categories in the Joint saving folder also add to joint savings. Percentages edited in the form are saved for that person. A split never counts as spending.
- My Savings keeps each person's own savings, separate from Joint Savings: money added or taken out by hand, plus income shares and expenses in categories of their Personal saving folder. The unticked rest stays in Personal checking. The deposit form asks whether money goes to Joint Savings (logged in the person's first Joint saving category for the Wedding goal) or to that person's savings.
- Editing the joint balance records the difference between the stated balance and the contributions already logged. Later entry changes still adjust that balance by the exact difference. The manual adjustment belongs to the overall balance.
- The calendar combines budget entries, deposits, debt payments and events. An event can repeat every day, week, two weeks, month or year, and end on a date or after a number of times. Monthly and yearly repeats on the 29th to 31st fall on the last day of shorter months. Editing or deleting a repeating event applies to one date, that date and later ones, or every date. Editing one date turns it into a separate one-off event.
- The debt ledger offsets open balances in both directions. Settling a debt records its payment timestamp and keeps it in the history.
- Export Excel, under Settings, includes entries, category settings, goal totals, events and debt history.

## Local data

This version stores its records in ordinary browser localStorage. Each browser and website origin has its own copy. The Long and Mei profiles categorize contributions within that copy. Clearing site storage erases its data.

The dashboard uses a new storage key. It leaves data in the earlier encrypted planner untouched and does not import those records. Export or back up the earlier planner before deploying this version if you need to retain access to those records.

## Private budgets

Each person has their own budget categories and limits. A custom category belongs to the person who created it (`ownerId`) and only they see it, its limit and its rates; the other person sees what was spent in it (in history and Insights) but never the limit or what's left. Older planners' shared categories (Wedding, My savings and Personal included) are split into one copy per person when read. Folders and their order are private too. Each person can edit or delete only their own entries. This privacy is enforced by the app: both accounts can still read the shared Firestore document.

## Folders and accounts

Every folder (`state.folders`) has a type chosen when it's made and fixed afterwards: Joint saving, Personal saving or Personal checking. Joint saving folders are shared (`ownerId: 'shared'`); the others belong to one person. Built-in folders that can't be renamed or deleted: one shared `joint`, plus `saving-<person>` and `checking-<person>`. Each person picks a paycheck folder (`state.paycheck`), a checking folder that receives the unticked rest of each income and pays expenses in categories outside the saving folders.

A category's `folderId` and `order` place it; categories stay private even inside the shared joint folder. Where money went is stamped when an entry is saved: `folder` on each income split (and on unsplit income), `folder` on an expense that deposits into a saving folder, and `from`, the checking folder that paid it. Moving a category or changing the paycheck folder later doesn't move past money. Older entries get the built-in folders they'd have used.

Balances are all-time: income into a folder, plus deposits, minus expenses paid from it, plus transfers (`state.transfers`) and manual add/take-out records (`state.savings` with `folderId`). The joint folder also carries the manual joint balance adjustment, and transfers or records in joint folders count toward joint savings. A folder holding money can't be deleted. The Joint Saving, Personal Saving and Personal Checking tabs list their folders with balance, this month's in and out, categories and activity. On the Budget page categories are dragged between folders by their handle (mouse or touch), with arrow keys or the Folder field in category settings as alternatives.

## Insights, warnings and shared expenses

- Insights recaps a month or a year: income, spending, what was left over and saved, spending by category, a comparison with the period before, a 6 or 12 month trend, and highlights. Deposits into joint goals count as saved there, not spent.
- A budget category turns amber at 80% of its limit and red when it's over (categories in the two saving folders never warn), and the dashboard lists those categories with the money left and days to go.
- The Budget page's entry history can be searched and filtered by text, type, category, person, amount and date range.
- An expense can be shared with the other person at any ratio. The whole expense stays in the payer's budget, and the other person's share becomes a linked debt that follows edits and deletes; a settled one is kept.
- A goal can have a target date, which shows how much to save each month and whether the current pace gets there in time.

## Profile pictures

Each person can set a profile picture in Settings. Photos are cropped square and shrunk to a small JPEG in the browser. With sync on they're stored in the Firestore document `planner/avatars` (covered by the same rules); otherwise in this browser.

## Releases

Settings shows the version and changelog from `src/changelog.js`. For each release, add an entry there and bump `version` in `package.json` to match; a test checks that they agree.

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
