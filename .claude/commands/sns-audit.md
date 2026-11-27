# SNS emergency-list audit: one batch

Audit the next batch of data/services/sns_urgencias.csv. Do everything end to end without asking me. If something is ambiguous, choose the conservative option (KEEP plus a note) and don't guess.

## Setup
- Fetch origin. Work on the long-lived branch `audit/sns-urgencias`: check it out if it exists and merge origin/main into it, otherwise create it from main.
- Progress file: docs/audits/sns-urgencias-audit.md.
  - If it doesn't exist, create it. List every CSV row (name, type, concelho), each with an unchecked box.
  - Lagos, Loulé, Albufeira and Estremoz start as checked, with a link to docs/reports/sub-verification-2026-11.md.
- If every row is already checked: report that the audit is complete, copy that report to the clipboard, and stop.

## Batch: the next 15 unchecked rows, in file order
Background: the SNS export dates from May 2023 and is known to be out of date. For example, the Lagos SUB moved to Hospital Terras do Infante in July 2022, and the export still gave the old site.

For each row:
1. Confirm, using at least two independent sources, that the service still exists, its type (SU/SUB/SUMC/SUP), its opening hours, and the actual building it operates from. Sources: SNS/ULS/ARS pages, municipal sites and council minutes, hospital pages, local news from 2024–2026, and OpenStreetMap through Overpass. If overpass-api.de fails, try the mirrors maps.mail.ru and kumi.systems.
2. Decide:
   - **MOVE** to the confirmed building, if two sources agree and it is more than 15 m away.
   - **KEEP**, if the location is confirmed.
   - **CLOSED/CHANGED**, if two sources show it closed, moved elsewhere or changed type. Update or remove the row.
   - **UNCONFIRMED**, if two sources can't be found. Keep the row and write the reason in the `note` column.
   - Add a dated note for any planned opening, closure or relocation.
3. Edit only the curated CSV, never generated files. Then run `uv run make services`.
4. Extend the position tests (pytest on the CSV and services.json, plus the e2e overlay position tests) to cover every MOVED or CHANGED row.
5. Append to the progress file, for each row: the decision, the coordinates before and after with the distance, the sources (with URLs and dates), and the number of parishes whose nearest service changed. Check the row's box.

## Verify
- Run pytest, Vitest and the local e2e suite. All must pass. Fix any failures; if you can't fix them, commit nothing and report why.
- Never deploy, never tag, never bump the version, and never push to main.

## Publish
- Commit as "audit: SNS urgências batch N (rows X–Y)" and push the branch.
- Using gh, create or update a single draft PR from audit/sns-urgencias into main, titled "Audit SNS emergency list". Keep its description current: progress (N/total), a table of all MOVED/CHANGED/UNCONFIRMED rows so far, and the test counts.
- After the last row: mark the PR ready for review and add a final summary.
- Don't touch other branches or untracked files like docs/reports/facebook-post.md.

## Report
Write a short report: the rows covered, each decision, the test counts, the PR link, and anything I need to look at. Copy the full report text to the clipboard (pbcopy), so I don't have to select it in the terminal.
