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
  creator/holder/releaser/dispatcher and controlled lifecycle state.
- **CartTransfer** is the one-to-one dispatch transaction for a cart.
  **CartReceipt** is the one-to-one receipt transaction, which prevents double
  receipt and stores both sending and receiving identities/timestamps.
- **MouldingProductionRecord** references one Press, Cart and BlankingBatch. It
  snapshots shift, date and operator employee ID and stores good tyres,
  rejected tyres, rejected tyre weight, rejected blanks, remaining blanks and
  downtime.
- **BlankReturn** reserves unused pieces from exactly one received Cart and
  Press. It stores Moulding sending and Blanking receiving identities and
  server timestamps, declared/received piece and weight values, variances,
  reason/notes and a controlled return state. Blanking inventory is increased
  only when receipt is confirmed.
- **InventoryTransaction** is an append-only movement ledger. Each row records a
  movement type, source/destination section and record, quantity/unit, optional
  kilogram weight, authenticated actor, server timestamp and reason/reference.
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
7. Starting a stage records its server-side IN time. Completing it records the
   server-side OUT time; Stage 1 completion also moves the batch to
   `READY_FOR_STAGE_2` for sulphur addition.
8. Production records are cancelled, closed, made obsolete, or deactivated rather than deleted through normal APIs.
9. QR codes contain only a safe random traceability reference/URL.
10. Blanking may temporarily use a manual physical Mixing batch/code with no
    approved-stock reference. When an approved-stock reference is supplied, Lab
    PASS, controlled status, reservation, and non-negative kg rules still apply.
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
16. Expected blanks use `(issued kg × 1000) ÷ average grams`; the exact decimal
    is stored at six decimal places and the whole-piece value is the floor.
    Fractional results are explicitly flagged instead of silently rounded.
17. Completing Blanking recalculates used and remaining kilograms on the server.
    A measured imbalance requires a Blanking Supervisor, Manager or
    Administrator plus a reason.
18. Cart hold, release, dispatch, receipt, production and return transitions are
    backend controlled. Pessimistic row locks and optimistic entity versions
    protect stock, batch, cart and press counters against concurrent updates.
19. A return deducts/reserves Press and Cart inventory when prepared, and adds
    pieces back to Blanking only after confirmed receipt. Duplicate receipt,
    dispatch and return confirmation are rejected.

See `docs/database-schema.sql` for a portable PostgreSQL-oriented schema reference.
