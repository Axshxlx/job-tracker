import { google } from "googleapis";

const LABEL_NAME = "JobTracker/Processed";

export async function getGmail(auth) {
  return google.gmail({ version: "v1", auth });
}

export async function ensureLabel(gmail) {
  const { data } = await gmail.users.labels.list({ userId: "me" });
  const existing = data.labels.find((l) => l.name === LABEL_NAME);
  if (existing) return existing.id;
  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: LABEL_NAME },
  });
  return created.data.id;
}

export async function listUnprocessed(gmail, max = 25) {
  const { data } = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox -label:${LABEL_NAME} newer_than:30d`,
    maxResults: max,
  });
  return data.messages ?? [];
}

const decode = (s) => Buffer.from(s, "base64url").toString("utf8");

function findPart(payload, mime) {
  if (payload.mimeType === mime && payload.body?.data) return payload.body.data;
  for (const p of payload.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return null;
}

export async function getEmail(gmail, id) {
  const { data } = await gmail.users.messages.get({
    userId: "me", id, format: "full",
  });
  const headers = Object.fromEntries(
    data.payload.headers.map((h) => [h.name.toLowerCase(), h.value])
  );
  const plain = findPart(data.payload, "text/plain");
  const html = findPart(data.payload, "text/html");
  const raw = plain ? decode(plain) : html ? decode(html) : "";
  const body = cleanText(raw);
  return { id, subject: headers.subject ?? "", from: headers.from ?? "", body };
}

function cleanText(s) {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:zwnj|zwj|nbsp|shy|#8203|#x200b|#847|#xad);?/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/[\u200b-\u200f\u2060\ufeff\u034f\u00ad\u2007\u202f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")   // tracking URLs are token-heavy
    .replace(/\s+/g, " ")
	.replace(/&#?\w+;/g, " ")
    .trim();
}

export async function markProcessed(gmail, id, labelId) {
  await gmail.users.messages.modify({
    userId: "me", id, requestBody: { addLabelIds: [labelId] },
  });
}
