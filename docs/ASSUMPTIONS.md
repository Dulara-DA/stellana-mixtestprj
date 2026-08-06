# Assumptions and unanswered factory questions

All uncertain production rules remain configurable or marked **To Be Confirmed (TBC)**.

## Confirmed factory-floor details

- The physical tag batch number is entered when the digital batch is created.
- A Mixing Officer may add a batch from the mixing-unit desktop. The backend
  automatically assigns that batch to the officer who created it.
- A notation such as `96 × 6078` identifies compound A-96, physical batch 6078.
- The same batch identity continues from Stage 1 into Stage 2.
- Completing Stage 1 makes the batch ready/issued to Stage 2, where sulphur and
  other Stage 2 chemicals are added.
- Each stage needs an IN time when processing starts and an OUT time when it
  completes. The prototype records both from the backend server clock to protect
  the audit history.
- The final design will use only Lab `PASS` compound released from Mixing.
  Temporarily, Blanking batch creation accepts a manually entered physical
  Mixing batch number and compound code until the Lab workflow is introduced.
- Blanking expected pieces are calculated from issued kilograms and average
  blank grams. Actual used and remaining compound are recalculated by the
  backend.
- A held cart stays in Blanking and cannot be received by Moulding. Dispatch
  and receipt identities/times come from the authenticated user and server.
- Unused blanks are reserved at Moulding when a return is prepared and are not
  restored to Blanking inventory until Blanking confirms physical receipt.

## Prototype assumptions

- A batch has one assigned Mixing Officer at a time.
- A single machine identifier is stored as text until the mixer master-data list is confirmed.
- Maximum planned batch quantity is 240 kg. The mentioned fill factor of 0.7 is stored in configuration but is not used to calculate allowed load.
- A recipe revision is treated as approved when it becomes `ACTIVE`; `approvedBy` and approval time are captured where available.
- Manager and System Administrator may temporarily record stores issues and laboratory results.
- Manual Blanking source entry is explicitly a temporary prototype mode. A null
  approved-stock reference identifies these records; no Lab `PASS` is inferred.
- Release and reprocessing decisions are currently allowed for Manager and System Administrator.
- Every batch uses a unique random traceability reference. No authentication or user secrets are encoded.
- Quantities use decimal kilograms or the ingredient's explicitly selected unit.
- Timestamps use the server timezone (`Asia/Colombo`) for display and UTC-capable ISO transport.
- Test values are stored as decimal/text results. No automatic laboratory decision is made without configured and confirmed specifications.
- Reprocessing retains a reference to the failed source batch; a new reprocessing batch can be created later without rewriting the source history.
- Shift A is 06:00–14:00, Shift B 14:00–22:00, and Shift C 22:00–06:00
  in `Asia/Colombo`. After-midnight Shift C records belong to the previous
  production date.
- Approved compound consumption is kilograms. Blanking output, cart contents,
  press inventory, good tyres and rejects are integer item counts. Expected
  blanks use the confirmed weight conversion `(issued kg × 1000) ÷ average blank
  grams`; this is a weight-based planning value, not a compound-specific yield
  guarantee.
- If expected blank quantity is fractional, the exact decimal is retained and
  shown. Only the whole-piece floor is used as the count; the UI warns about the
  fractional remainder.
- Actual used compound assumes the recorded average blank weight represents each
  actual good/rejected blank included in the blank count. Rejected loose
  material is entered separately in kilograms.
- For Moulding reconciliation, each consumed blank becomes exactly one good
  tyre, rejected tyre, or rejected blank.
- A cart has one intended press and one receipt. Only an authorized override
  with a reason can receive it at another press.
- The manager's delayed-transfer flag uses a configurable 30-minute placeholder.
  It is not a confirmed service-level target.

## Questions to confirm with Stellana

1. What is the confirmed fill-factor formula, and does it vary by mixer or compound?
2. Which role creates, reviews, approves, activates, and obsoletes recipe revisions?
3. Is a recipe revision number numeric, semantic, or another factory convention?
4. Can more than one revision be active for different dates or plants?
5. What are the official Stage 1 and Stage 2 parameter requirements and tolerances?
6. Is Stage 2 ever intentionally skipped for a compound? If yes, who approves it?
7. What are the configured laboratory test specifications by compound/revision?
8. Which failed-result combinations require retest, hold, or direct reprocessing?
9. Is manager approval mandatory for every release or only exceptions?
10. What raw-material request numbering and lot traceability conventions are used by Stores?
11. Can Stores issue partial quantities, substitutions, or multiple lots for one ingredient?
12. Which barcode standard and physical label size/printer are required?
13. What constitutes a delayed batch and what are the escalation thresholds?
14. Are issue messages visible to all managers or assigned to a specific manager?
15. What audit retention period, backup policy, and electronic-signature requirements apply?
16. Will the production network allow WebSockets and access from management computers?
17. Which future systems (ERP, lab equipment, scales, printers) require integration?
18. Does the written compound/batch notation always omit the `A-` prefix, or
    should printed digital labels show the full recipe code (for example,
    `A-96 × 6078`)?
19. Should expected-yield planning include a confirmed process-loss percentage
    by compound/item in addition to the current weight-only calculation?
20. Is one blank always consumed per tyre at every Moulding press, including
    startup/setup scrap?
21. Are the proposed Shift A/B/C times correct, and how should public holidays,
    overtime and planned shift extensions be assigned?
22. Is a cart always dedicated to one Blanking batch/material and one destination
    press, or can physical carts contain separated batches?
23. Which employee-ID format is authoritative, and should it be synchronized
    with HR/Active Directory?
24. Can a Moulding operator receive a cart, or must receipt be performed by a
    supervisor/storekeeper?
25. Which roles may correct completed Blanking quantities and press inventory,
    and is dual approval required?
26. What are the official press numbers/names and downtime reason master data?
27. What transfer time constitutes a delay between Blanking and Moulding?
28. Does rejected tyre weight mean weight per item or one measured total? The
    prototype records per-item grams and calculates the total.
29. When and how are reusable carts returned to Blanking?
30. What production target, cycle time and expected next-material formula should
    drive press forecasts? The prototype uses only open request quantities.
31. Must Blanking return variances use dual approval, and what piece/weight
    tolerances allow automatic closure?
32. Should confirmed unused blanks return to a reusable cart, loose Blanking
    inventory, or a quarantine location?
33. Is the entered average blank weight measured per batch, inherited from item
    master data, or both with tolerance checking?
