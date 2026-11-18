// What changed in each release, newest first. Add an entry and bump "version" in
// package.json together; a test checks that they match.
export const CHANGELOG = [
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
