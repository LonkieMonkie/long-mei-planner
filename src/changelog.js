// What changed in each release, newest first. Add an entry and bump "version" in
// package.json together; a test checks that they match.
export const CHANGELOG = [
  { version: '2.15.0', date: '2026-11-18', changes: [
    'The sidebar has three money tabs: Joint Saving, Personal Saving and Personal Checking. Each lists its folders like accounts, with an all-time balance and this month’s money in and out, the categories inside, and recent activity.',
    'Make as many folders of each type as you need, one per real account. Pick the type when you create the folder; it can’t change later, so history keeps its meaning.',
    'Joint saving folders are shared: you both see them and both put money in, while your categories inside stay private.',
    'Choose which checking folder your paycheck lands in. The unticked rest of each income goes there, and expenses outside the saving folders are paid from it. Old entries stay where they landed.',
    'Transfer money between folders, and add money to or take money out of any folder, for example to match your real bank balance.',
    'A folder that still holds money can’t be deleted until you move the money out.',
  ] },
  { version: '2.14.0', date: '2026-11-18', changes: [
    'Folders on the Budget page. Each of you has three built-in folders that can’t be renamed or deleted: Joint saving, Personal saving and Personal checking. You can add your own folders too, with a name and color.',
    'The folder sets where a category’s money goes. In Joint saving, its income shares and expenses go to Joint Savings. In Personal saving, they go to My Savings. Personal checking is everyday money and gets the unticked rest of each income. Your own folders only group and total.',
    'Drag a category by its handle to reorder it or move it into a folder. This works with a mouse or a finger, scrolls when you reach the edge, and you can also use the arrow keys or pick a folder in the category’s settings.',
    'Folders collapse, and each shows the total budget, spent or saved, and remaining of the categories inside. Your folders and order are private to you.',
    'Wedding, My savings and Personal are now ordinary categories: rename, move or delete them. Past entries keep where their money went.',
    'Add an entry groups categories by folder. Folders have no percentage of their own; they add up their ticked categories.',
    'Income and money in are green, and spending is red, across the cards, charts, calendar and history. Money moved into savings no longer counts as spending in your budget totals.',
    'Insights: the Month/Year, period and Together/Long/Mei controls sit on one row, on phones too.',
  ] },
  { version: '2.13.0', date: '2026-11-18', changes: [
    'Private budgets: each of you has your own categories and budgets. Your partner sees what you spend in each category, but never your budgets or what’s left.',
    'Each of you started with your own copy of the old shared categories and limits. Wedding, My savings and Personal stay shared, with a separate budget for each of you.',
    'The Budget page shows your categories with budget, spent, remaining and % used, and you can delete your own categories.',
    'You can edit or delete only the entries you logged yourself.',
    'Insights: view Together, Long or Mei; a new Income and savings card for each of you and the household; and the income vs. spending chart works weekly, monthly or yearly, side by side if you like.',
  ] },
  { version: '2.12.1', date: '2026-11-18', changes: [
    'Planner storage in Settings: how much of the 1 MB synced planner is used, and roughly how many years of room are left at your pace.',
  ] },
  { version: '2.12.0', date: '2026-11-18', changes: [
    'New Insights tab: a monthly or yearly recap, spending by category, a comparison with the period before, a 6 or 12 month trend, and highlights.',
    'Budget warnings: categories turn amber at 80% of their limit and red when over, with a heads-up on the dashboard.',
    'Search and filter the entry history by text, type, category, person, amount and dates.',
    'Shared expenses: split an expense with the other person and their share goes to the Debt Tracker automatically.',
    'Goals can have a target date, showing how much to save each month and whether you’re on track.',
  ] },
  { version: '2.11.2', date: '2026-11-17', changes: [
    'The dashboard’s income figure now shows only the signed-in person’s income for the month.',
  ] },
  { version: '2.11.1', date: '2026-11-17', changes: [
    'Fixed: typing a share over 100% or with more than two decimals in the income split no longer makes the app go blank.',
    'If a screen or form ever hits an error, it now shows a message with Try again and Reload instead of a blank page.',
    'The savings tree is much lighter on phones: far fewer shapes to draw, and branches are drawn only near what’s on screen.',
    'Editing something the other phone just deleted now tells you, instead of quietly dropping the edit.',
  ] },
  { version: '2.11.0', date: '2026-11-17', changes: [
    'Event categories: create, rename, recolor and delete them from the calendar.',
    'Show or hide each category’s events with one click above the calendar.',
    'Events without their own color use their category’s color.',
  ] },
  { version: '2.10.0', date: '2026-11-17', changes: [
    'Choose a color for each calendar event, from presets or any color you like.',
    'Fixed: expense category colors now show on the calendar again.',
  ] },
  { version: '2.9.0', date: '2026-11-17', changes: [
    'New My savings budget category: tick it when splitting income and its share goes into My Savings.',
    'The Personal remainder stays a budget set-aside and no longer counts as savings.',
    'Profile pictures: set your own in Settings and it shows wherever your initials did.',
  ] },
  { version: '2.8.0', date: '2026-11-17', changes: [
    'New My Savings tab: each of you can add money to or take money out of your own savings.',
    'The Personal share of a split income is added to your savings automatically.',
    'The deposit form asks whether money goes to the Wedding or to your own savings.',
    'Version number and this changelog in Settings.',
  ] },
  { version: '2.7.0', date: '2026-11-17', changes: [
    'Edit calendar events instead of deleting and re-adding them.',
    'For repeating events, change every date, only one date, or one date and later.',
  ] },
  { version: '2.6.0', date: '2026-11-17', changes: [
    'Live clock on the dashboard.',
    'Split income across budget categories using each person’s saved percentages.',
    'Whatever isn’t split goes to the new permanent Personal category; splits over 100% are refused.',
  ] },
  { version: '2.5.0', date: '2026-11-17', changes: [
    'Wedding goal forecast: see when you’ll reach your target at your current pace.',
    'Export Excel moved to Settings.',
    'Income source is now optional.',
  ] },
  { version: '2.4.0', date: '2026-11-17', changes: [
    'Repeating events that end on a date or after a number of times.',
    'Forgot password link on the sign-in screen.',
    'The dashboard greets whoever is signed in.',
    'Retractable sidebar.',
    'Automatic biweekly paydays removed from the calendar.',
  ] },
  { version: '2.3.0', date: '2026-11-17', changes: [
    'Sign in as Long or Mei, with Remember me.',
    'Your planner syncs between devices in real time.',
  ] },
  { version: '2.2.0', date: '2026-11-17', changes: [
    'Animated savings tree on Joint Savings that grows a meter for every amount you choose, with a sky that follows the time of day.',
    'Choose cherry blossom, oak, maple or pine in Settings.',
  ] },
  { version: '2.1.0', date: '2026-11-17', changes: [
    'New sage and cream look with Long and Mei as two animated plants.',
  ] },
  { version: '2.0.0', date: '2026-11-17', changes: [
    'Budget categories with savings rates, Joint Savings with a protected Wedding goal, a calendar and a debt tracker.',
    'Custom accent color.',
  ] },
];

export const VERSION = CHANGELOG[0].version;
