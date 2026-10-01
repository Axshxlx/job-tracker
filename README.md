# Job Application Tracker

A backend service for tracking internship and job applications, with a pipeline that reads my Gmail and updates application statuses automatically using a locally hosted LLM.

## What it does

- **REST API** for managing tracked applications (create, list, view, update, delete)
- **PostgreSQL** storage, running in Docker
- **Gmail pipeline** that classifies incoming emails and updates the matching application's status, so I don't have to edit rows by hand

## Tech stack

Node.js, Express (ES Modules), PostgreSQL 16 (Alpine, via Docker Compose), Zod, Gmail API (OAuth2), Ollama with Qwen3 4B

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/applications` | Add a tracked application |
| GET | `/applications` | List all applications |
| GET | `/applications/:id` | Get one application |
| PATCH | `/applications/:id` | Partially update an application (usually just the status) |
| DELETE | `/applications/:id` | Remove an application |

Unmatched routes return a JSON 404.

## Design notes

- **Validation:** every write goes through a Zod schema. PATCH reuses the same schema via `.partial()`, so partial updates are validated with the same rules.
- **Error handling:** one centralized middleware with custom error classes and an async wrapper, instead of try/catch in each route. Responses are consistent JSON, and internal details are never sent to the client.
- **Database:** a `BEFORE UPDATE` trigger keeps `updated_at` current. `status` is free text rather than an enum, so adding a new status never requires a schema change. `source` (platform) and `source_url` (listing link) are stored separately.
- **PATCH over PUT:** I usually change a single field at a time, so partial updates fit the workflow better.

## Gmail pipeline

The pipeline runs in two stages:

1. **Classify.** A local Qwen3 4B model (through Ollama, with a fixed system prompt and strict JSON output) decides whether an email is about one of my specific applications and which status it implies: applied, interview, rejected, accepted, or neutral.
2. **Match and update.** The extracted company is looked up in the database. If nothing matches, the email is flagged for manual review and nothing is written. If there are candidates, a second model call picks the matching row, and the status is updated with a PATCH.

Processed emails are tagged with a Gmail label so each email is handled once, and a failed run leaves the email unlabeled so it is retried. The classifier is covered by 9 hand-written test cases (applied, interview, rejected, offer, job digest, cold outreach) that all pass, at roughly 3 seconds per email.

I run the LLM locally so my inbox contents never leave my machine.

## Setup

> Fill in the exact commands and variable names below to match the repo.

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd <repo-name>
   npm install
   ```
2. Create a `.env` file with the database settings (see `.env.example` if included).
3. Start PostgreSQL:
   ```bash
   docker compose up -d
   ```
4. Apply the schema (`schema.sql`) to the database.
5. Start the API:
   ```bash
   npm start
   ```
6. **Gmail pipeline (optional):** create a Google Cloud project with the Gmail API enabled and a Desktop OAuth client, run the OAuth setup script to generate `token.json`, and install Ollama with the classifier model.

`.env` and `token.json` are gitignored and should never be committed.

## Project notes

Design decisions and problems I solved along the way are in `devlog.md`.

## Status and roadmap

Working today: the full CRUD API, input validation, centralized error handling, and the Gmail classification and status-update pipeline.

Not done yet:
- Automated tests for the API and database layer
- Auto-inserting a new row when an application-confirmation email arrives
- Scheduled runs of the pipeline
- Docker image slimming (alpine, multi-stage builds)
- Deployment
