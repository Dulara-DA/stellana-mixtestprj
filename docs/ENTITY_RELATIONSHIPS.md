# Database entities and relationships

## Core relationships

- **UserAccount** has a unique employee ID and one role. Active roles include
  Manager, Mixing Officer, Blanking Operator/Supervisor, Moulding
  Operator/Supervisor, and System Administrator. Stores and Lab Officer remain
  prepared for phased activation.
- **Recipe** is the stable recipe identity (`recipeCode`, compound name) and owns many immutable **RecipeRevision** records.
- **RecipeRevision** owns ordered **RecipeIngredient** rows. A revision is `DRAFT`, `ACTIVE`, or `OBSOLETE`.
- **ProductionBatch** references exactly one **RecipeRevision** and one assigned
  officer. It may also hold a planned start, target completion, priority,
  planning note, scheduler and schedule timestamp. A temporary laboratory-bypass
  release stores its explicit flag, reason, Manager/Admin approver, and approval
  time separately from the laboratory decision. The recipe reference is never
  moved when newer revisions are created.
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
  Blanking. It references the released **ProductionBatch** and, for a normal
  Lab-PASS release, its **LabSample**. A temporary bypass has no LabSample and
  keeps `labStatus=PENDING`; its authorization is derived from ProductionBatch.
  The entity snapshots mixing batch number/material/compound and carries
  planned, received, available, reserved, consumed and returned quantities in
  kilograms. In the UI this entity is presented as Compound Stock; a separate
  duplicate stock model was intentionally not introduced.
- **BlankingBatch** consumes kilograms from exactly one
  **ApprovedMaterialBatch**. It records item, mill/preformer/blanking operators,
  average blank weight, exact and whole expected output, actual/rejected pieces,
  used/rejected/remaining weights, variance, balance approval, official
  production date/shift, IN/OUT times and available good-blank inventory.
- **Press** is master and live-state data for one Moulding press. Its inventory
  and cumulative output counters are updated only inside transactional services.
- **BlankingCart** belongs to one **BlankingBatch**, has a unique cart number,
  destination **Press**, item/compound/batch snapshots, integer
  quantity/remaining/returned balances, calculated material weight,
  official production date/shift, preparation timestamp,
  creator/holder/releaser/dispatcher and controlled lifecycle state.
- **CartTransfer** is the one-to-one dispatch transaction for a cart.
  **CartReceipt** is the one-to-one receipt transaction, which prevents double
  receipt and stores both sending and receiving identities/timestamps.
- **MouldingProductionRecord** references one Press, Cart and BlankingBatch. It
  snapshots shift, date and operator employee ID and stores good tyres,
  rejected tyres, rejected tyre weight, rejected blanks, remaining blanks and
  downtime.
- **BlankReturn** records reusable unused pieces, rejected blanks, or rejected
  tyres from exactly one received Cart and Press. Rejected returns reference
  the exact completed MouldingProductionRecord that declared the loss. It stores
  Moulding sending and Blanking receiving identities and
  EPF snapshots, server timestamps, declared/received piece and weight values,
  variances, reason/notes and a controlled return state. Blanking inventory is
  increased only when an unused-good-blank receipt is confirmed; confirming
  rejected blanks or tyres never restores usable inventory. The Compound Stock page exposes a
  separate returned-blanks section; returned pieces are not incorrectly added
  to raw compound kilograms.
- **InventoryTransaction** is an append-only movement ledger. Each row records a
  movement type, source/destination section and record, quantity/unit, optional
  kilogram weight, authenticated actor, server timestamp and reason/reference.
- **MaterialShortageRequest** is sent from a Press to Blanking, can reference the
  current BlankingBatch and one fulfilment Cart, and owns append-only
  **RequestMessage** conversation rows. Each message snapshots the status at the
  time it was sent.

```text
ProductionBatch ── LabSample
       │ PASS/release OR audited temporary bypass (PENDING)
       ▼
ApprovedMaterialBatch ──< BlankingBatch ──< BlankingCart
                                               │
                                  CartTransfer │ CartReceipt (one each)
                                               ▼
                                             Press
                                               │
                                               └──< MouldingProductionRecord
                                               └──< BlankReturn ──> BlankingBatch

All movement points ──< InventoryTransaction (polymorphic record references)

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
7. Before Stage 1, only a Manager or Administrator can set or revise a schedule,
   officer, or mixer. Officer/mixer overlaps and starts before the planned time
   require an authorized reason; both are audited. A target deadline never
   forces a machine stop or record completion.
8. Starting a stage records its server-side IN time. Completing it records the
   server-side OUT time; Stage 1 completion also moves the batch to
   `READY_FOR_STAGE_2` for sulphur addition.
9. Production records are cancelled, closed, made obsolete, or deactivated rather than deleted through normal APIs.
10. A normal Blanking release requires Lab `PASS`. The temporary prototype
    exception is accepted only from `STAGE_2_COMPLETED`, only by Manager/Admin,
    with a reason and explicit confirmation. It creates visibly marked
    `PENDING` compound stock and an append-only audit entry.
11. QR codes contain only a safe random traceability reference/URL.
12. Blanking may temporarily use a manual physical Mixing batch/code with no
    approved-stock reference. When an approved-stock reference is supplied, Lab
    PASS or an audited temporary lab bypass, controlled status, reservation,
    and non-negative kg rules still apply.
13. A cart reserves good blank count from its source batch before dispatch. Its
    destination Press is intentionally empty until Moulding physically receives
    and allocates the cart.
14. Receipt requires `DISPATCHED`, a receiving account with an EPF/employee
    number, and is unique per cart. Moulding Operators, Supervisors, Managers
    and System Administrators can select the actual receiving Press. The actual
    receiving Press must have `availableBlankQuantity = 0`; no role may add a
    new cart on top of an existing press balance. Receipt atomically adds
    quantity to the actual receiving Press.
15. Moulding validates `good tyres + rejected tyres + rejected blanks <=
    received/available blanks`, then atomically updates cart and Press balances.
16. Manager production corrections preserve the original record identity,
    rebalance inventory, and append an old/new/reason audit event.
17. Official production date, shift, batch IN/OUT timestamps, cart preparation
    time and employee ID snapshots are server-controlled.
18. Expected blanks use `(issued kg × 1000) ÷ average grams`; the exact decimal
    is stored at six decimal places and the whole-piece value is the floor.
    Fractional results are explicitly flagged instead of silently rounded.
19. Completing Blanking recalculates used and remaining kilograms on the server.
    A measured imbalance requires a Blanking Supervisor, Manager or
    Administrator plus a reason.
20. Cart hold, release, dispatch, receipt, production and return transitions are
    backend controlled. Pessimistic row locks and optimistic entity versions
    protect stock, batch, cart and press counters against concurrent updates.
21. A return deducts/reserves Press and Cart inventory when prepared, and adds
    pieces back to the originating BlankingBatch only after confirmed receipt.
    Sender and receiver EPFs are mandatory and snapshotted. Duplicate receipt,
    dispatch and return confirmation are rejected.

See `docs/database-schema.sql` for a portable PostgreSQL-oriented schema reference.
