// Prints a prominent warning for e2e tests that Playwright marked "flaky" (failed, then passed on
// the retry), with the first error and the retry's trace. Never fails: a flaky test doesn't block
// a deploy, a test that fails both attempts already failed the Playwright run.
// Reads the JSON report written by playwright.config.ts. Usage: node scripts/e2e-flaky-report.mjs
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const REPORT = "playwright-report/e2e-results.json";
if (!existsSync(REPORT)) {
  console.log(`(no e2e report at ${REPORT}; skipping the flaky-test check)`);
  process.exit(0);
}
const report = JSON.parse(readFileSync(REPORT, "utf8"));

const flaky = [];
const walk = (suite, titles) => {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      if (t.status !== "flaky") continue;
      const failed = t.results.find((r) => r.status !== "passed");
      const retry = t.results.find((r) => r.retry > 0);
      const trace = retry?.attachments?.find((a) => a.name === "trace")?.path;
      flaky.push({
        title: [...titles, spec.title].filter(Boolean).join(" › "),
        where: `${spec.file}:${spec.line}`,
        error: failed?.error?.message?.split("\n").find((l) => l.trim()) ?? "(no error message)",
        trace: trace ? relative(process.cwd(), trace) : null,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
};
for (const suite of report.suites ?? []) walk(suite, []);

const ran = new Date(report.stats?.startTime ?? Date.now()).toLocaleString();
if (flaky.length === 0) {
  console.log(`No flaky e2e tests (run of ${ran}).`);
  process.exit(0);
}

const Y = "\x1b[1;33m", R = "\x1b[0m";
const bar = "=".repeat(78);
console.log(`\n${Y}${bar}\n  WARNING: ${flaky.length} flaky e2e test${flaky.length > 1 ? "s" : ""} (failed once, passed on retry; run of ${ran})\n${bar}${R}`);
for (const f of flaky) {
  console.log(`${Y}•${R} ${f.title}  (${f.where})`);
  // Strip ANSI colour codes from Playwright's error text.
  console.log(`    first attempt: ${f.error.replace(/\x1b\[[0-9;]*m/g, "")}`);
  console.log(f.trace ? `    trace: npx playwright show-trace ${f.trace}` : "    trace: (none recorded)");
}
console.log(`${Y}${bar}\n  Not blocking. Look at the trace before it becomes a habit to ignore.\n${bar}${R}\n`);
