import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

export function getAuth() {
  const auth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "http://localhost"
);
;
  auth.setCredentials(JSON.parse(fs.readFileSync("token.json", "utf8")));
  return auth;
}
