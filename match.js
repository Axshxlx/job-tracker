import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool(); // reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MATCH_MODEL = "qwen3:4b"; // base model, not job-classifier
const MAX_CANDIDATES = 20;

// "Northwind Robotics, Inc." and "northwind robotics" should count as the same company
const SUFFIX = /[,.]?\s+(inc|llc|ltd|corp|corporation|co)\.?$/i;
const normCompany = (s) => s.trim().replace(SUFFIX, "").toLowerCase();

// Only move a status forward. Same status = nothing to do; anything else gets flagged.
const RANK = { applied: 0, interview: 1, rejected: 2, accepted: 2 };

const flag = (reason) => ({ action: "flag", reason });

const SYSTEM = `You match an email about a job application to one row in a tracker.
You get the role named in the email and a list of candidate rows.
Pick the row that is the SAME job. Wording differences don't matter:
abbreviations, word order, punctuation, "Engineer" vs "Engineering",
"Intern" vs "Internship". Different jobs do matter: Frontend vs Backend,
Intern vs Full-time, different teams or levels.
If no row clearly matches, or several match equally well, return null.
Respond with JSON only: {"id": <number or null>}`;

const fmtDate = (d) => {
  try { return new Date(d).toISOString().slice(0, 10); } catch { return "unknown"; }
};

async function pickMatch(emailRole, candidates) {
  const rows = candidates
    .map((c) => `id ${c.id}: ${c.role} (applied ${fmtDate(c.date_applied)}, status ${c.status})`)
    .join("\n");

  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MATCH_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Email role: ${emailRole}\n\nCandidates:\n${rows}` },
      ],
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);

  const { id } = JSON.parse((await res.json()).message.content);
  const n = id === null || id === undefined ? null : Number(id);
  // never trust an id the model made up
  return candidates.some((c) => c.id === n) ? n : null;
}

// classifier output -> { action: "patch" | "noop" | "flag", ... }
export async function decideMatch({ company, role, status }) {
  if (!company) return flag("no company extracted");
  if (!role) return flag("no role extracted, can't verify which application");

  const { rows } = await pool.query(
    `SELECT id, role, status, date_applied
       FROM applications
      WHERE lower(btrim(regexp_replace(company, $2, '', 'i'))) = $1
      ORDER BY date_applied DESC
      LIMIT $3`,
    [normCompany(company), SUFFIX.source, MAX_CANDIDATES]
  );
  if (rows.length === 0) return flag(`no tracked application for ${company}`);

  const id = await pickMatch(role, rows);
  if (id === null) return flag("model unsure which application matches");

  const row = rows.find((r) => r.id === id);
  const current = row.status?.toLowerCase();
  if (current === status) return { action: "noop", reason: `already ${status}` };

  const from = RANK[current] ?? -1;
  const to = RANK[status];
  if (to === undefined || to <= from) {
    return flag(`would change status ${row.status} ->
