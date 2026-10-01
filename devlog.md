# Dev Log

## Day 1 — [ 08 / 28 / 2026 ]
**Done:** Set up Docker + Docker Compose on Fedora, wrote docker-compose.yml
for Postgres 16, confirmed connection via psql. Initialized git repo and
GitHub remote. Scaffolded Express skeleton with a single test route.

**Challenges:**
- Fedora ships its own Docker packages (moby-engine/docker-cli), which
  conflicted with Docker's official docker-ce repo. Resolved by using
  Fedora's existing Docker install and only adding docker-compose-plugin
  separately (excluding docker-buildx-plugin, which also conflicted with
  a Fedora-provided package).
- `usermod -aG docker $USER` didn't take effect across new terminal
  windows — turned out group changes need a full login refresh, not just
  a new terminal. `newgrp docker` confirmed the fix worked.

**Decisions:**
- Chose postgres:16-alpine over the default image — Alpine keeps the
  container smaller while still providing what's needed to run Postgres.
- Chose Node/Express over Python/FastAPI for backend speed, given
  existing React/JS familiarity.
- Chose ES Modules over CommonJS to stay consistent with React syntax.

## Day 2-5 -- [ 08 / 27 / 2026 - 09 / 01 / 2026 ]
## `source` / `source_url` split

Initially considered storing a job's source (e.g. "Handshake") and its listing link in one field. Split into two columns instead: `source` (platform name) and `source_url` (the actual link, with a `CHECK (source_url ~ '^https?://')` constraint). Two distinct pieces of information shouldn't share one column — splitting keeps `source` cleanly queryable/filterable by platform while still keeping the link, and the constraint catches obviously malformed URLs for free at the DB level.

## `updated_at` auto-stamp via trigger

Rather than relying on every future code path that updates a row (manual edits now, automated Gmail-driven updates later) to remember to set `updated_at = now()`, added a `BEFORE UPDATE` trigger (PL/pgSQL) that stamps it automatically. Enforced at the database level, so it's structurally impossible to forget regardless of which application code touches the row.

## PATCH vs. PUT for the update endpoint

Chose PATCH-style partial updates over PUT-style full replacement for `applications` updates. Real usage is inherently partial — applying, then later nudging just `status` (and occasionally `notes`) as things progress — so requiring the full row on every update would mean extra fetches and more risk of accidentally overwriting fields with stale data. Implemented by filtering incoming body keys against a whitelist of allowed columns, then dynamically building the SQL `SET` clause and parameter list to match whichever fields were actually sent.


## Day 6 -- [ 09 / 14 / 2026 ]
## Error handling middleware

**The POST bug.** The original POST handler destructured `company`, `role`, etc.
from `req.body` *before* running Zod validation, then destructured the same
names again from `validation.data` right after — two `const` declarations
of the same identifiers in one scope, which is a SyntaxError in JS. It also
referenced `result.error.issues` in the 400 response, but `result` was never
defined (leftover from before Zod was wired in) — should've been
`validation.error.issues`. Removed the redundant first destructure and fixed
the typo; validated data now flows straight from `validation.data` into the
INSERT.

**Async/error handling.** Every route was wrapped in `asyncHandler`, which
catches a rejected promise from the handler and forwards it to `next(err)`
instead of needing a try/catch in every single route. Not-found lookups
(GET/PATCH/DELETE by id) now `throw new NotFoundError('Application')`
instead of returning `res.status(404)` inline. A centralized `errorHandler`
sits as the last middleware: it reads `err.statusCode` off custom errors
(404s), checks for Postgres error codes like `23505` (unique violation →
409), and falls back to a generic 500 with the full error logged
server-side only. A catch-all route handler sits just above it to turn
unmatched paths into the same JSON 404 shape instead of Express's default
HTML page.

**End result:** no route handler has its own try/catch anymore, every
error — validation, not-found, DB, or unmatched route — resolves to a
single consistent JSON error shape (`{ error: ... }`) with the right status
code, and no raw stack trace or Postgres internals ever reach the client.

## Days 7 & 8 [ 09 / 15 / 2026 and 09 / 17 / 2026 ]

Used console.cloud.google.com to integrate read-only inbox access via
the Gmail API. Set up a project, enabled the API, configured the OAuth
consent screen (Testing mode, own account as test user), and generated
a Desktop app OAuth client. Verified access with a one-time script that
authorizes via browser, saves a refresh token, and pulls real message
headers.


## Day 8 [ 09 / 17 / 2026 ]

Today's session focused on designing (not yet implementing) the two-stage heuristic that will let the tracker automatically update application statuses from parsed Gmail messages, now that OAuth read access is working.

The heuristic is split into two stages. Stage 1 determines whether an incoming email is job-related at all, which can be handled cheaply with keyword/domain heuristics before anything expensive runs. Stage 2, reserved for emails that pass Stage 1, extracts structured fields (company, role, and implied status) and decides how that information should update the applications table.

A key decision was to keep the LLM's role strictly limited to classification and field extraction, never to direct database access. The model will be instructed to return trimmed, structured JSON only, which a script will parse and use to construct the actual PATCH/lookup logic. This keeps all database-trust in code that can be tested deterministically, rather than letting the model construct or issue HTTP requests itself.

For matching a classified email back to an existing row, we ruled out passing the entire applications table into every LLM call after realizing it would scale poorly, both in token cost and latency, as the table grows. Instead, the plan is to extract company first (via sender domain or a lightweight pass), query the database filtered to that company, and only invoke LLM-based disambiguation if more than one open role exists for that company. Since location-based collisions (e.g. the same company and role in two different cities) aren't a realistic concern for how applications are tracked here, company + role is sufficient as a matching key, and no schema changes are needed. If no matching row is found, the plan is to flag the email for manual review rather than auto-creating a new row, consistent with the existing workflow of only logging applications after actually applying.

On the model side, an 8B local model was the initial assumption, but given a 6GB VRAM constraint, the plan shifted toward testing smaller models (e.g. Gemma 2B, Phi-3-mini) with quantization, since the task is narrow classification rather than open-ended generation and shouldn't require a large model to perform well. Latency is also not expected to be a practical concern, since this pipeline runs as a background/batch job rather than anything blocking real-time interaction.

## Day 10 [ 09 / 21 / 26 ]
As a clarification, the project's in-practice pipeline is:

1. Properly authorize host to use GMail API with `modify` permission. Query for emails that do not have the `JobTracker/Processed` label, then read them and extract Sender, Subject and Body fields. Logic in `gmail.js`.
2. Send the extracted email information to Qwen 3 4B (also running on host device). Model's output is in JSON format, identifying whether the email is application-related and extracting information such as company, role and status. Logic in `classify.js`.
3. Based on the model's JSON output, get all jobs within the database that are of the same company. Logic in `<file>.js`.
    - **0 matches:** the email is flagged for manual review and nothing is written to the database.
    - **1+ matches:** the entries are fed to the model in a separate call, which determines which entry is to be PATCHED by returning the relevant job's ID. If the model isn't confident (or returns an ID that wasn't in the candidate list), it returns null and the email is flagged for manual review instead.
4. Once the email reaches a terminal decision (not job-related, job-related and PATCHED, or job-related but flagged), it is assigned the `JobTracker/Processed` label so that the project ignores it in future runs or in case of crashes. If anything in steps 1-3 throws an error (including a failed PATCH), the email is left unlabeled and is retried on the next run, so no separate failure log is needed for now.

### Design choices

**Company-only matching.** The same role was extracted with different wording across two test emails ("Backend Software Engineering Intern" vs. "Backend Software Engineer, Intern"), so exact `company + role` matching against the database isn't reliable. Filtering by company alone and only using the model when it's ambiguous avoids that, and avoids a pointless model call in the common single-match case.

**Label after the full pass, not after the DB write.** The label means the pipeline reached a decision for that email, not that a write succeeded, otherwise irrelevant emails would be re-classified every run. The tradeoff is that a crash between the PATCH and the label means the email gets processed twice, but that's harmless since re-PATCHing the same status is idempotent.

**Model check even for a single match.** Originally a single same-company match was PATCHED directly to save a model call. The problem is that if I've applied to two roles at a company but only tracked one, a rejection for the untracked role would silently overwrite the tracked one's status. Running the model match on every candidate set costs about 2s more per matched email, but a role mismatch gets flagged instead of patched. Since only emails that already passed the classifier get this far, the cost is small.

### What I'd improve next

- **Auto-add applications from confirmation emails.** Right now a 0-match result is only flagged, so I still have to enter every application by hand, which is exactly the part I'd get lazy about. The fix is to insert a new row whenever the classifier sees an `applied` email with no matching entry. It fits the rule that I only track jobs I've actually applied to, since a confirmation email means I did. The catches would be duplicate rows if a company sends more than one confirmation, and non-`applied` emails with no match (like a rejection for something I never tracked) still needing to be flagged rather than inserted. Skipped for now because school is starting.
-- **Set up power-saving behavior via systemd.** Keeping `dockerd` and other services online is harmful to my battery life and unnecessarily hogs compute that I might need for something else. Optimization would be possible by scheduling the pipeline to run every time I'm not using beyond some threshold of CPU/VRAM/RAM resources AND only when I'm plugged in, alongside moving the system into performance mode and setting my fans to use the performance profile curve to avoid damaging my components.
