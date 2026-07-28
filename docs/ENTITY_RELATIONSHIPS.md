# Database entities and relationships

## Core relationships

- **UserAccount** has a unique employee ID and one role. Active roles include
  Manager, Mixing Officer, Blanking Operator/Supervisor, Moulding
  Operator/Supervisor, and System Administrator. Stores and Lab Officer remain
  prepared for phased activation.
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

## Blanking and Moulding relationships

- **ApprovedMaterialBatch** is the durable boundary between Mixing/Lab and
  Blanking. It references the passed/released **ProductionBatch** and
  **LabSample**, snapshots mixing batch number/material/compound, and carries
  approved and remaining quantities in kilograms.
- **BlankingBatch** consumes kilograms from exactly one
  **ApprovedMaterialBatch**. It records a separate planned/actual/rejected count
  of blanks plus official production date, shift, operator employee ID, IN/OUT
  times and available good-blank inventory.
- **Press** is master and live-state data for one Moulding press. Its inventory
  and cumulative output counters are updated only inside transactional services.
- **BlankingCart** belongs to one **BlankingBatch**, has a unique cart number,
  destination **Press**, integer quantity/balance, creator/dispatcher and
  lifecycle state.
- **CartTransfer** is the one-to-one dispatch transaction for a cart.
  **CartReceipt** is the one-to-one receipt transaction, which prevents double
  receipt and stores both sending and receiving identities/timestamps.
- **MouldingProductionRecord** references one Press, Cart and BlankingBatch. It
  snapshots shift, date and operator employee ID and stores good tyres,
  rejected tyres, rejected tyre weight, rejected blanks, remaining blanks and
  downtime.
- **MaterialShortageRequest** is sent from a Press to Blanking, can reference the
  current BlankingBatch and one fulfilment Cart, and owns append-only
  **RequestMessage** conversation rows. Each message snapshots the status at the
  time it was sent.

```text
ProductionBatch ── LabSample
       │ PASS/release
       ▼
ApprovedMaterialBatch ──< BlankingBatch ──< BlankingCart
                                               │
                                  CartTransfer │ CartReceipt (one each)
                                               ▼
                                             Press
                                               │
                                               └──< MouldingProductionRecord

Press ──< MaterialShortageRequest ──< RequestMessage
                       └── optional fulfilment BlankingCart
```

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
10. Blanking can consume only a persisted PASS/released material record, and kg
    availability cannot become negative.
11. A cart reserves good blank count from its source batch before dispatch.
12. Receipt requires `DISPATCHED`, is unique per cart, and atomically adds
    quantity to the receiving Press. A wrong-press override requires an
    authorized role and reason.
13. Moulding validates `good tyres + rejected tyres + rejected blanks <=
    received/available blanks`, then atomically updates cart and Press balances.
14. Manager production corrections preserve the original record identity,
    rebalance inventory, and append an old/new/reason audit event.
15. Official production date, shift, IN/OUT timestamps and employee ID snapshots
    are server-controlled.

See `docs/database-schema.sql` for a portable PostgreSQL-oriented schema reference.
