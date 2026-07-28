# Stellana Mixing Production Tracking System

An expandable first prototype for real-time production tracking in Stellana's Mixing Unit. The system digitizes recipe revisions, batch execution, raw-material requests, Stage 1 and Stage 2 work, laboratory decisions, traceability, internal issues, notifications, and audit history.

## Project layout

- `backend/` — Spring Boot 3 REST API, JWT authentication, WebSocket/STOMP events, H2/PostgreSQL persistence, OpenAPI, QR generation, and tests.
- `frontend/` — React, TypeScript, Vite, and Tailwind CSS desktop application.
- `docs/` — entity/relationship notes, database schema, and factory assumptions/questions.
- `docker-compose.yml` — optional PostgreSQL 16 service.

## Development credentials

> Development use only. Change these credentials before any real deployment.

| Role | Email | Password |
|---|---|---|
| Manager | `manager@stellana.local` | `Manager123!` |
| Mixing Officer | `officer@stellana.local` | `Mixing123!` |
| System Administrator | `admin@stellana.local` | `Admin123!` |

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

Open `http://localhost:5173`. The API runs at `http://localhost:8080`, Swagger UI at `http://localhost:8080/swagger-ui.html`, and the H2 console at `http://localhost:8080/h2-console`.

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
- See `docs/ASSUMPTIONS.md` for decisions requiring factory confirmation.
