import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";
import { getGmail, ensureLabel, listUnprocessed, getEmail } from "./gmail.js";
import { classifyEmail } from "./classify.js";
const auth = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "http://localhost"
);
auth.setCredentials(JSON.parse(fs.readFileSync("token.json", "utf8")));

const gmail = await getGmail(auth);

const labelId = await ensureLabel(gmail);
console.log("Label ID:", labelId);

const messages = await listUnprocessed(gmail, 5);
console.log(`Found ${messages.length} unprocessed messages\n`);

for (const { id } of messages) {
  let t = Date.now();
  const email = await getEmail(gmail, id);
  console.log("From:   ", email.from);
  console.log("Subject:", email.subject);
  console.log("Body:   ", email.body.slice(0, 200), "\n---\n");
  console.log(`getEmail: ${Date.now() - t}ms`);
  
  t = Date.now();
  const result = await classifyEmail(email);
  console.log("Result: ", result, "\n---\n");
  console.log(`classify: ${Date.now() - t}ms`);
}
