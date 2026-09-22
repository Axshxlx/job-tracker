import "dotenv/config";
import fs from "fs";
import { getAuth } from "./auth.js";
import { getGmail, ensureLabel, listUnprocessed, getEmail, markProcessed } from "./gmail.js";
import { classifyEmail } from "./classify.js";
import { decideMatch, applyStatus, closeDb } from "./match.js";

const DRY = process.argv.includes("--dry-run"); // no DB writes, no labeling
const MAX_EMAILS = 50;

function logFlag(email, result, reason) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    id: email.id,
    from: email.from,
    subject: email.subject,
    result,
    reason,
  });
  if (!DRY) fs.appendFileSync("flagged.log", line + "\n");
  console.log(`  FLAG: ${reason}`);
}

async function processEmail(gmail, labelId, id) {
  const email = await getEmail(gmail, id);
  console.log(`\n${email.subject}  <${email.from}>`);

  const result = await classifyEmail(email);

  if (!result.job_related) {
    console.log("  skip: not job-related");
  } else if (result.status === "neutral") {
    console.log(`  skip: job-related, no status change (${result.company})`);
  } else {
    const d = await decideMatch(result);
    if (d.action === "flag") {
      logFlag(email, result, d.reason);
    } else if (d.action === "noop") {
      console.log(`  noop: ${d.reason}`);
    } else {
      console.log(`  PATCH id ${d.id} (${d.matchedRole}) -> ${d.status}`);
      if (!DRY) await applyStatus(d.id, d.status);
    }
  }

  // reached a terminal decision for this email
  if (!DRY) await markProcessed(gmail, id, labelId);
}

async function main() {
  const gmail = await getGmail(getAuth());
  const labelId = await ensureLabel(gmail);
  const messages = await listUnprocessed(gmail, MAX_EMAILS);
  console.log(`${DRY ? "[dry run] " : ""}${messages.length} unprocessed emails`);

  let failed = 0;
  for (const { id } of messages) {
    try {
      await processEmail(gmail, labelId, id);
    } catch (err) {
      failed++; // left unlabeled, so the next run retries it
      console.error(`  ERROR on ${id}:`, err.message);
    }
  }
  console.log(`\nDone. ${messages.length - failed} processed, ${failed} failed.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
