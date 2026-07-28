# Stellana Real-Time Production Tracking System

An expandable factory prototype covering the connected flow:

`Mixing → Laboratory approval → Blanking → cart transfer → Moulding`

It preserves the existing Mixing workflow and adds server-controlled shifts,
employee identity, Blanking inventory, cart dispatch/receipt, live press status,
Moulding output, material-shortage conversations, management reporting, STOMP
real-time events, and audit history.

## Project layout

- `backend/` — Spring Boot 3 REST API, JWT authentication, WebSocket/STOMP events, H2/PostgreSQL persistence, OpenAPI, QR generation, and tests.
- `frontend/` — React, TypeScript, Vite, and Tailwind CSS responsive desktop/tablet application.
- `docs/` — entity/relationship notes, database schema, and factory assumptions/questions.
- `docker-compose.yml` — optional PostgreSQL 16 service.

Architecture: the React browser client calls a stateless Spring REST API with a
JWT bearer token. Spring Security enforces roles at controller/service
boundaries. JPA transactions persist workflow and inventory changes in H2 or
PostgreSQL. Spring's STOMP broker publishes section events to `/topic/production`,
`/topic/blanking`, `/topic/moulding`, and `/topic/shortages`; the client also
polls every 30 seconds if WebSockets disconnect. OpenAPI documents the REST
contract.

## Development credentials

> Development use only. Change these credentials before any real deployment.

| Role | Email | Password |
|---|---|---|
| Manager | `manager@stellana.local` | `Manager123!` |
| Mixing Officer | `officer@stellana.local` | `Mixing123!` |
| System Administrator | `admin@stellana.local` | `Admin123!` |
| Blanking Operator | `blanking.operator@stellana.local` | `Blanking123!` |
| Blanking Supervisor | `blanking.supervisor@stellana.local` | `BlankingSup123!` |
| Moulding Operator | `moulding.operator@stellana.local` | `Moulding123!` |
| Moulding Supervisor | `moulding.supervisor@stellana.local` | `MouldingSup123!` |
| Lab Officer (prepared for later use) | `lab.officer@stellana.local` | `LabOfficer123!` |

Demo records are seeded automatically and idempotently when
`DEMO_DATA_ENABLED=true` (the development default). No separate cloud seed
service is needed:

```bash
DEMO_DATA_ENABLED=true mvn spring-boot:run
```

Set `DEMO_DATA_ENABLED=false` before initializing a real factory database. If a
database already contains non-demo users, the initializer does not inject demo
production data.

## Prerequisites

- Java 21 (the project compiles with `--release 21`)
- Maven 3.9+
- Node.js 20+
- npm 10+
- Optional: Docker Desktop for PostgreSQL

Docker is not required for the default setup. The backend uses a file-backed H2 development database when no profile is selected.

On macOS, if more than one JDK is installed, select Java 21 before running Maven:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
java -version
mvn -version
```

## Run locally with H2

Open two terminals from the repository root.

Terminal 1:

```bash
cd backend
mvn spring-boot:run
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. After sign-in, choose Mixing, Blanking, or
Moulding from the role-aware section selector. The API runs at
`http://localhost:8080`, Swagger UI at
`http://localhost:8080/swagger-ui.html`, and the H2 console at
`http://localhost:8080/h2-console`.

If the frontend was already running before a dependency or Vite configuration
change and Chrome shows a blank page, stop it with `Control + C` and rebuild the
development dependency cache once:

```bash
npm run dev -- --force
```

H2 console settings:

- JDBC URL: `jdbc:h2:file:./data/stellana-mixing;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE`
- User: `sa`
- Password: leave blank

## Run with PostgreSQL

Start PostgreSQL:

```bash
docker compose up -d
```

Start the backend using the PostgreSQL profile:

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=postgres
```

Then start the frontend as shown above.

PostgreSQL connection values can be overridden with `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`. Set `JWT_SECRET` to a strong secret outside development.

## Tests and production builds

```bash
cd backend
mvn test
```

```bash
cd frontend
npm run build
```

The backend suite includes JUnit/Mockito unit tests, MockMvc authentication checks, public traceability checks, and an end-to-end workflow test covering material request/issue, both mixing stages, sample submission, laboratory pass, blanking release, batch history, issue creation, and manager reply.
It also tests shift boundaries, previous-date ownership for the overnight shift,
role restrictions, one-time cart receipt, press inventory calculations,
Moulding quantity validation, rejected-weight calculations, and controlled
shortage status transitions. A secured PDF test also validates the combined
Mixing, Blanking and Moulding report structure, section content and role access.

## Prototype workflow

1. Sign in as Manager or Administrator and create/activate a recipe revision.
2. Create a batch against the exact active revision. A Mixing Officer may also
   add a batch, which is automatically assigned to that officer.
3. Sign in as Mixing Officer and request materials.
4. Sign in as Manager/Admin to mark materials issued.
5. Start and complete Stage 1, then Stage 2.
6. Mark the sample as sent and record results as Manager/Admin.
7. Release a passed batch or route a failed batch to reprocessing.
8. Watch dashboard cards and activity update through WebSockets.
9. Open the traceability view or scan the generated QR code.
10. Create an issue as Mixing Officer and reply as Manager.

## Blanking and Moulding demonstration workflow

1. Complete the existing Mixing/Lab workflow and release a passed batch to
   Blanking. This creates a persistent approved-material record.
2. Sign in as Blanking Operator, open **Blanking → Blanking Batches**, and create
   a batch from approved material. Material consumption is kilograms; planned
   output is a count of blanks.
3. Record IN/start, then complete the batch. The server records shift, production
   date, operator employee ID, IN and OUT times.
4. Open **Carts & Dispatch**, reserve good blanks on a uniquely numbered cart,
   choose the destination press, and dispatch it.
5. Sign in as Moulding Operator. Receive the dispatched cart at the intended
   press. Receipt is allowed once and atomically increases press inventory.
6. Start a Moulding production record and enter good tyres, rejected tyres,
   rejected tyre weight per item, rejected blanks, downtime, and notes.
7. If more blanks are needed, create a request in **Request Blanks**. Blanking
   can acknowledge, prepare, link, and dispatch a cart in the same conversation.
8. Sign in as Manager/Admin and open **Production Report** to filter and review
   output, rejections, inventories, shortages, press state, and delayed
   transfers. Select **Download combined PDF** to download the same filtered
   period with detailed Mixing stages and lab decisions, Blanking batches and
   cart transfers, and Moulding production entries.

Demo seed data already includes three presses, approved material, Blanking
batches, prepared/dispatched/partially consumed carts, one Moulding record and
one urgent shortage conversation.

## Shift and timestamp rules

The backend—not the tablet clock—assigns all operational timestamps using
`Asia/Colombo`:

| Shift | Factory time | Production date |
|---|---|---|
| Shift A | 06:00–14:00 | Calendar date |
| Shift B | 14:00–22:00 | Calendar date |
| Shift C | 22:00–06:00 | Date on which Shift C started |

For example, an entry at 02:00 on July 29 belongs to Shift C for production date
July 28. The rule is isolated in `ShiftService` and covered by boundary tests.

## Test from a phone or industrial tablet

Keep the backend and frontend terminals running on the laptop. Connect the
laptop and tablet/phone to the same Wi-Fi, find the laptop IP, then expose Vite:

```bash
# macOS Wi-Fi address
ipconfig getifaddr en0

cd frontend
npm run dev -- --host 0.0.0.0
```

If the laptop IP is `172.20.10.2`, open
`http://172.20.10.2:5173` on the tablet. REST and WebSocket calls are relative
and Vite proxies them to the backend, so the tablet must not use
`localhost:8080`. macOS Firewall may ask for permission for Java and Node;
allow incoming connections on the private network.

For a factory installation, run PostgreSQL and the backend on the selected
server/desktop, serve the built frontend through the approved internal web
server, and ask IT to create:

- a DHCP reservation for the server's network adapter;
- an internal DNS name such as `stellana-mixing`;
- firewall rules for only the required internal ports;
- backups, HTTPS certificate, monitoring, and a non-development JWT secret.

Tablets on company Wi-Fi can then use the same internal address, such as
`https://stellana-mixing`. Configure `FRONTEND_URL`,
`TRACEABILITY_BASE_URL`, and the permitted CORS origin for that exact address.

## Useful environment variables

| Variable | Purpose |
|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` | Signing secret; mandatory to replace outside development |
| `CORS_ALLOWED_ORIGIN_PATTERNS` | Allowed frontend origins |
| `FRONTEND_URL` | Browser application base URL |
| `TRACEABILITY_BASE_URL` | Safe QR traceability URL base |
| `DEMO_DATA_ENABLED` | Enable/disable local demonstration accounts and records |

## API summary

Swagger UI contains the complete request/response schemas. Main route groups:

| Route group | Purpose |
|---|---|
| `/api/auth` | JWT login |
| `/api/production/shift` | Current server production date and shift |
| `/api/recipes`, `/api/batches`, `/api/stages` | Existing revision-controlled Mixing workflow |
| `/api/material-requests`, `/api/lab` | Stores issue and laboratory workflow |
| `/api/blanking/approved-materials` | Passed/released Mixing material available to Blanking |
| `/api/blanking/batches` | Create, start and complete Blanking batches |
| `/api/blanking/carts` | Prepare and dispatch traceable carts |
| `/api/moulding/presses` | Live press inventory/status |
| `/api/moulding/upcoming-carts` | Incoming carts |
| `/api/moulding/carts/{id}/receive` | One-time transactional receipt |
| `/api/moulding/records` | Start, complete and manager-correct Moulding records |
| `/api/shortages` | Cross-section request/status/message history |
| `/api/production-manager/summary` | Filtered downstream metrics/reporting |
| `/api/production-manager/report.pdf` | Secured combined Mixing, Blanking and Moulding PDF download |
| `/api/audit` | Append-only activity history |

## Role boundaries

- Blanking Operators/Supervisors create batches, carts and dispatches and
  respond to shortage requests.
- Moulding Operators/Supervisors receive carts, submit production and request
  blanks. Supervisors can control press state and authorize exceptional receipt.
- Managers see downstream status/reporting and can make the explicitly
  authorized approvals and corrections. System Administrators can perform all
  operational controls across Mixing, Blanking and Moulding, as well as manage
  users. Completed production correction still requires a reason and is
  audited.
- Mixing, Stores and Lab permissions remain separated through the existing
  controller rules. Backend authorization remains authoritative even if a
  browser route is entered manually.

The cart delay threshold is currently 30 minutes in
`app.production.cart-transfer-delay-minutes`; it is a configurable **TBC**
placeholder, not a confirmed factory production rule.

## Current limitations and next integration points

- This is a local prototype, not yet a validated production release. HTTPS,
  centralized identity, database backup/restore drills, monitoring, retention,
  disaster recovery and factory cybersecurity review remain deployment work.
- Press totals are event-driven prototype counters. Confirm shift reset/rollover
  and ERP reporting rules before using them as official production totals.
- The kg-to-blank yield formula, production targets, cart-delay threshold,
  downtime reason master data and rejected-weight interpretation remain TBC.
- The existing Lab release now creates `ApprovedMaterialBatch`; the next
  integration step is to replace any temporary manual approval roles with the
  confirmed Lab/Stores responsibilities and synchronize approved quantity,
  material master data, employee IDs and press master data with authoritative
  factory systems.

## Troubleshooting login and 403 errors

- A `401` means the token is missing/expired or the credentials are wrong.
- A `403` means login succeeded but the role cannot perform that action. Use a
  role for the selected section; do not solve this by disabling backend
  authorization.
- If an older browser session has a stale token, sign out or clear
  `stellana_token` and `stellana_user` from browser local storage, then sign in.
- If a new seeded account is missing, stop and restart the backend so the
  idempotent demo initializer can add it.
- When using a tablet, open the laptop/server network address, never
  `localhost`, because `localhost` on the tablet means the tablet itself.

## Important prototype notes

- Recipe revisions are append-only. The API does not edit an existing revision; updates create a new revision.
- Obsolete revisions cannot be assigned to new batches.
- Batch transitions are checked by the backend.
- Stage 2 requires a completed Stage 1 unless a Manager/Admin supplies an override reason.
- Enter the physical tag number (for example `6078`) when creating a batch. The
  UI derives a factory reference such as `A-96 × 6078` from the selected recipe.
- Starting a stage automatically records its IN time; completing it records its
  OUT time. Completing Stage 1 makes the batch ready for Stage 2 sulphur
  addition.
- The live dashboard is organized by physical batch number and displays each
  batch's current stage, IN/OUT times, officer, mixer and controlled status.
- Mixer capacity is validated at 240 kg. The unconfirmed 0.7 fill factor is recorded as a configurable placeholder and is **not** used in load calculations.
- Laboratory specifications are configurable; the prototype does not invent pass/fail limits.
- Important production records use statuses rather than permanent deletion.
- A cart receipt is unique per cart. Wrong-press receipt requires a Moulding
  Supervisor/Manager/Admin override and reason.
- Material kilograms, blank counts, and tyre counts are deliberately not
  converted by an invented formula.
- One consumed blank is treated as one good tyre, rejected tyre, or rejected
  blank for prototype inventory reconciliation; this assumption needs factory
  confirmation.
- See `docs/ASSUMPTIONS.md` for decisions requiring factory confirmation.
