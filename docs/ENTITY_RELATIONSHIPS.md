# Database entities and relationships

## Core relationships

- **UserAccount** has one role now (`MANAGER`, `MIXING_OFFICER`, or `SYSTEM_ADMIN`). `STORES_OFFICER` and `LAB_OFFICER` are included in the enum for future activation.
- **Recipe** is the stable recipe identity (`recipeCode`, compound name) and owns many immutable **RecipeRevision** records.
- **RecipeRevision** owns ordered **RecipeIngredient** rows. A revision is `DRAFT`, `ACTIVE`, or `OBSOLETE`.
- **ProductionBatch** references exactly one **RecipeRevision** and one assigned officer. The reference is never moved when newer revisions are created.
- A batch exposes a derived factory reference (`recipe code × physical batch
  number`), while storing both values separately for reliable searching and
  traceability.
- **ProductionBatch** owns **BatchStatusHistory**, **MixingStage**, **LabSample**, **MaterialRequest**, and may be linked to **IssueThread** records.
- **MixingStage** separately records Stage 1 or Stage 2 and owns **StagePauseEvent** records.
- **MaterialRequest** owns one or more **MaterialRequestItem** records, including requested/issued quantities and optional lot.
- **LabSample** owns additional **LabTestResult** name/value rows and references configurable **TestSpecification** records by test name when applicable.
- **IssueThread** owns ordered **IssueMessage** replies and optionally references a batch.
- **Notification** is addressed to a user and links to a domain object through `referenceType`/`referenceId`.
- **AuditLog** is append-only and records actor, action, old/new values, time, and related batch/recipe references.

## Reliability rules

1. Approved/active recipe revisions are never overwritten.
2. Only one active revision per recipe is maintained by the recipe service.
3. Batches cannot select obsolete revisions and always preserve the originally selected revision ID.
4. Batch status changes are validated against a transition map in the backend and written to history/audit.
5. A Mixing Officer can create only self-assigned batches. Managers and System
   Administrators can select another Mixing Officer during batch creation.
6. Stage 2 cannot start until Stage 1 completes, except for an authorized Manager/Admin override with a reason.
7. Starting a stage records its server-side IN time. Completing it records the
   server-side OUT time; Stage 1 completion also moves the batch to
   `READY_FOR_STAGE_2` for sulphur addition.
8. Production records are cancelled, closed, made obsolete, or deactivated rather than deleted through normal APIs.
9. QR codes contain only a safe random traceability reference/URL.

See `docs/database-schema.sql` for a portable PostgreSQL-oriented schema reference.
