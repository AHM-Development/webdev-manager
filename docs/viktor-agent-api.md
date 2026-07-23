# Viktor Agent API — integration guide

How Viktor calls AHM Web Manager with an API key (client-credentials style, no
browser/OAuth redirect).

## Auth

Every request carries the API key as a Bearer token:

```
Authorization: Bearer ahmagent_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- **Base URL:** `https://webdevmanagerapi.allied-health.co/api/v1`
- All agent endpoints live under `…/agent`.
- Keep the key secret. It can be revoked at any time; if revoked you get `401 AGENT_KEY_INVALID`.

## The model (important)

The key acts **as a service account with a fixed role**, and that role is the
hard ceiling. On top of that:

- **Allowlist only** — any action not in `GET /agent/actions` is rejected. There
  are **no delete/clear actions at all**.
- **Reads run directly** via `POST /agent/read`.
- **Writes must go through `propose` → `confirm`** — you never write in one call.
  `propose` returns a `proposalId` + human summary; `confirm` executes it.

## Endpoints

### `GET /agent/actions` — capability list
```
GET /agent/actions
Authorization: Bearer <key>
```
Response — each action advertises its **`args` shape**, so you don't have to guess:
```json
{ "actions": [
  { "key": "insights.dashboard", "access": "read",  "roles": [...], "args": {} },
  { "key": "tasks.setStatus",    "access": "write", "roles": [...],
    "args": { "taskId": "string id, required", "status": "Backlog|In Progress|Review|Blocked|Done, required" } },
  { "key": "tasks.create",       "access": "write", "roles": [...],
    "args": { "input": { "title": "string, required", "description": "string", "projectId": "string id", "assigneeName": "string", "dueDate": "YYYY-MM-DD", "priority": "Low|Medium|High", "status": "…" } } }
] }
```
`access` is `read` or `write`. Use `read` actions with `/read`, `write` actions with
`/propose`+`/confirm`. **The `args` object mirrors what to send** — note that some
actions take fields at the top level (`taskId`) while create/update actions nest
them under `input`.

### `POST /agent/read` — run a read action
```
POST /agent/read
Content-Type: application/json
{ "actionKey": "insights.dashboard", "args": {} }
```
Response:
```json
{ "result": { "projects": { "total": 90, ... }, "tasks": { ... }, "attention": [ ... ] } }
```
Calling a **write** action here returns `400 AGENT_NOT_READ`.

### Argument shapes (important)

Args differ per action:
- **Id/field actions** take fields at the top level of `args` — e.g.
  `tasks.setStatus` → `{ "taskId": "123", "status": "Done" }`.
- **Create/update actions** take their fields nested under an **`input`** object —
  e.g. `tasks.create` → `{ "input": { "title": "…", … } }`. (A top-level `title`
  is ignored, which is why a task can come out "Untitled".)

`tasks.create` fields (all under `input`): `title` (required), `description`,
`checklist` (`[{ "title": "…", "completed": false }]`),
`attachments` (`[{ "name": "…", "url": "https://…", "type": "link" | "file" }]` —
links or files referenced by URL), `projectId` (string),
`assigneeName` (string, the person's name), `dueDate` (`YYYY-MM-DD`), `priority`
(`Low|Medium|High`), `status` (`Backlog|In Progress|Review|Blocked|Done`).

```json
POST /agent/propose
{ "actionKey": "tasks.create", "args": { "input": {
    "title": "Fix contact form on booking page",
    "description": "The form doesn't send…",
    "attachments": [{ "name": "Bug screenshot", "url": "https://…/shot.png", "type": "file" }],
    "projectId": "25", "assigneeName": "Queenie", "dueDate": "2026-08-01"
} } }
```

### `POST /agent/propose` — stage a write
```
POST /agent/propose
{ "actionKey": "tasks.setStatus", "args": { "taskId": "123", "status": "Done" } }
```
Response:
```json
{ "proposalId": "8f3c…", "actionKey": "tasks.setStatus",
  "summary": "Set task 123 status to Done", "expiresInSeconds": 900 }
```
Calling a **read** action here returns `400 AGENT_NOT_WRITE`. Proposals expire (default 15 min).

### `POST /agent/confirm` — execute a staged write
```
POST /agent/confirm
{ "proposalId": "8f3c…" }
```
Response:
```json
{ "executed": true, "proposalId": "8f3c…", "actionKey": "tasks.setStatus",
  "result": { "id": "123", "status": "Done", ... } }
```
A proposal can only be confirmed **once**; reuse returns `409 AGENT_PROPOSAL_USED`, and an expired one `410 AGENT_PROPOSAL_EXPIRED`.

## Worked example

1. Read the workspace state:
   `POST /agent/read { "actionKey": "insights.dashboard" }`
2. Decide to change something → stage it:
   `POST /agent/propose { "actionKey": "tasks.setStatus", "args": { "taskId": "123", "status": "Done" } }`
   → `{ "proposalId": "8f3c…", "summary": "Set task 123 status to Done" }`
3. Execute it:
   `POST /agent/confirm { "proposalId": "8f3c…" }`
   → `{ "executed": true, "result": { ... } }`

## Commonly used actions

| Action | Access | Purpose |
|---|---|---|
| `insights.dashboard` | read | Workspace rollup (projects/tasks/issues/health + "attention" list) |
| `insights.project` | read | Per-project rollup (`args.projectId`) |
| `projects.list` / `projects.get` | read | Clients |
| `projects.update` / `projects.setStatus` / `projects.setPriority` | write | Update a client |
| `tasks.list` / `tasks.get` | read | Tasks |
| `tasks.create` / `tasks.update` / `tasks.setStatus` / `tasks.move` | write | Manage tasks |
| `tasks.createOrganized` | write | **Simplest create** — pass `input: { description, projectId, dueDate, assignee }` and the AI organizer generates the title/description/checklist. See below. |
| `issues.list` / `issues.create` / `issues.setStatus` / `issues.addApplications` | read/write | Issue boards |
| `clientLogs.overview` / `clientLogs.stages` | read | Client Logs |
| `clientLogs.updateStage` / `clientLogs.addStageTask` | write | Client Logs work |
| `health.list` / `health.website` / `health.startScan` | read/write | Website health |

Call `GET /agent/actions` for the authoritative, complete list (args are passed
in the `args` object; ids are strings).

### AI-organized task requests (recommended)

When a person asks you for a task, use `tasks.createOrganized`. Pass **who asked**
(`requestor` — their email or full name) plus a plain brief; the organizer arranges
it and it's saved as a **pending task request owned by that requestor**. It enters
the review queue, and once a manager approves it, it shows on the assignee's board.

- `requestor` is **required** (email or full name of a registered user) — this is
  who the request is attributed to. Unknown → `400 REQUESTOR_UNKNOWN`; missing →
  `400 REQUESTOR_REQUIRED`.
- **With an `assignee`** the task **skips approval** and goes straight to that
  developer's backlog. **Without an assignee** it stays a **pending request** in
  the review queue for a manager to assign + approve.
- You supply the brief; the AI generates title/description/checklist. Any field you
  pass explicitly (`title`, `checklist`, `priority`, `status`) overrides the AI.
- **Dates:** `startDate`/`dueDate` accept `today`/`tomorrow`/`yesterday` or
  `YYYY-MM-DD`. If you don't set a start date, it **defaults to today**. (Sending a
  bare word like "today" for a date now works — previously only `YYYY-MM-DD` was
  accepted.)

```json
POST /agent/propose
{ "actionKey": "tasks.createOrganized", "args": { "input": {
    "requestor": "joel@alliedhealthmedia.co.uk",
    "description": "Contact form on the booking page isn't emailing submissions; also add a honeypot for spam.",
    "projectId": "25",
    "assignee": "Queenie",
    "dueDate": "2026-08-01"
} } }
```
Then `confirm` — the response `result` is the created **request** (status pending)
with the AI-generated title/checklist. (Requires the Task Organizer prompt to be
configured in the app's Settings; otherwise `409 TASK_ORGANIZER_PROMPT_REQUIRED`.)

## Errors

All errors are `{ "error": { "code": "...", "message": "..." } }` with an HTTP status:

| Status | Code | Meaning |
|---|---|---|
| 401 | `AGENT_AUTH_REQUIRED` / `AGENT_KEY_INVALID` | Missing/invalid/revoked key |
| 404 | `AGENT_ACTION_UNKNOWN` | Action not in the allowlist |
| 403 | `AGENT_FORBIDDEN` | The service account's role can't run this action |
| 400 | `AGENT_NOT_READ` / `AGENT_NOT_WRITE` | Wrong endpoint for the action's access |
| 404/409/410 | `AGENT_PROPOSAL_*` | Proposal missing / already used / expired |

Retry policy: safe to retry reads. For writes, retry the whole propose→confirm
(don't reuse a confirmed/expired `proposalId`).
