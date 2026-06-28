// Holiday-data freshness check. Fails (exit 1) when lib/holidays.js has no
// entries for the "required" year — this year, or next year once it's December
// (so we get a December lead time to refresh before the calendar goes stale).
//
// Run by the scheduled `Holiday data freshness` GitHub workflow, and locally:
//   node tools/check-holidays.mjs              # checks the live date
//   CHECK_YEAR=2027 node tools/check-holidays.mjs   # force the fail path
//
// It reads holidays.js as text rather than importing it: the file is ESM-syntax
// `.js` with no package.json "type":"module", so Node would mis-load it as CJS.
// Extracting years from the date strings matches the engine's design — the year
// is part of every "YYYY-MM-DD" entry (see lib/holidays.js / lib/marketclock.js).

import { readFileSync, appendFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/holidays.js', import.meta.url), 'utf8');
const years = new Set([...src.matchAll(/\b(20\d{2})-\d{2}-\d{2}\b/g)].map(m => Number(m[1])));

const now = new Date();
const requiredYear = process.env.CHECK_YEAR
    ? Number(process.env.CHECK_YEAR)
    : now.getUTCFullYear() + (now.getUTCMonth() >= 11 ? 1 : 0);  // Dec → next year

const fresh = years.has(requiredYear);

// Expose to the workflow (for the issue title/body) BEFORE any non-zero exit —
// step outputs written to $GITHUB_OUTPUT are still captured on failure.
if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `required_year=${requiredYear}\nfresh=${fresh}\n`);

if (fresh) {
    console.log(`holiday data covers ${requiredYear} — OK (years: ${[...years].sort().join(', ')})`);
    process.exit(0);
}

console.error(
    `lib/holidays.js has no entries for ${requiredYear}. ` +
    `Refresh each market's calendar from its official source (see the README ` +
    `"Updating holidays" section).`);
process.exit(1);
