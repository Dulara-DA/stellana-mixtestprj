-- One-time H2 development-data maintenance.
--
-- Renames only the Playwright downstream workflow dataset. Real factory
-- records such as A-96-50 / 6160 do not match these predicates and remain
-- untouched. Historical audit rows are intentionally preserved verbatim;
-- a summary maintenance audit row is inserted at the end.

SET AUTOCOMMIT FALSE;

UPDATE recipes
SET recipe_code = REPLACE(recipe_code, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
    compound_name = REPLACE(compound_name, 'PW Downstream Compound', 'TEST A-96-50 Compound'),
    updated_at = CURRENT_TIMESTAMP
WHERE recipe_code LIKE 'PW-REC-DOWN-%';

UPDATE recipe_revisions
SET revision_notes = REPLACE(revision_notes, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP
WHERE recipe_id IN (
    SELECT id FROM recipes WHERE recipe_code LIKE 'TEST-A-96-50-%'
);

UPDATE recipe_ingredients
SET material_code = REPLACE(material_code, 'PW-RM-DOWN-', 'TEST-RM-A-96-50-'),
    material_name = REPLACE(
        REPLACE(material_name, 'PW Downstream Rubber', 'TEST A-96-50 Base Rubber'),
        'PW Downstream Sulphur', 'TEST A-96-50 Sulphur'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE recipe_revision_id IN (
    SELECT revision.id
    FROM recipe_revisions revision
    JOIN recipes recipe ON recipe.id = revision.recipe_id
    WHERE recipe.recipe_code LIKE 'TEST-A-96-50-%'
);

UPDATE production_batches
SET batch_number = REPLACE(batch_number, 'PW-BATCH-DOWN-', 'TEST-6160-'),
    machine = REPLACE(machine, 'PW-MIXER-DOWN-', 'TEST-MIXER-A-96-50-'),
    schedule_notes = REPLACE(schedule_notes, 'PW ', 'TEST '),
    issue_or_stoppage_reason = REPLACE(issue_or_stoppage_reason, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP
WHERE batch_number LIKE 'PW-BATCH-DOWN-%';

UPDATE mixing_stages
SET machine = REPLACE(machine, 'PW-MIXER-DOWN-', 'TEST-MIXER-A-96-50-'),
    notes = REPLACE(notes, 'PW ', 'TEST '),
    override_reason = REPLACE(override_reason, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP
WHERE batch_id IN (
    SELECT id FROM production_batches WHERE batch_number LIKE 'TEST-6160-%'
);

UPDATE lab_samples
SET comments = REPLACE(comments, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP
WHERE batch_id IN (
    SELECT id FROM production_batches WHERE batch_number LIKE 'TEST-6160-%'
);

UPDATE material_requests
SET notes = REPLACE(notes, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP
WHERE batch_id IN (
    SELECT id FROM production_batches WHERE batch_number LIKE 'TEST-6160-%'
);

UPDATE material_request_items
SET material_code = REPLACE(material_code, 'PW-RM-DOWN-', 'TEST-RM-A-96-50-'),
    material_name = REPLACE(
        REPLACE(material_name, 'PW Downstream Rubber', 'TEST A-96-50 Base Rubber'),
        'PW Downstream Sulphur', 'TEST A-96-50 Sulphur'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE material_request_id IN (
    SELECT request.id
    FROM material_requests request
    JOIN production_batches batch ON batch.id = request.batch_id
    WHERE batch.batch_number LIKE 'TEST-6160-%'
);

UPDATE approved_material_batches
SET mixing_batch_number = REPLACE(mixing_batch_number, 'PW-BATCH-DOWN-', 'TEST-6160-'),
    material_code = REPLACE(material_code, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
    compound_name = REPLACE(compound_name, 'PW Downstream Compound', 'TEST A-96-50 Compound'),
    notes = REPLACE(notes, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE material_code LIKE 'PW-REC-DOWN-%'
   OR mixing_batch_number LIKE 'PW-BATCH-DOWN-%';

UPDATE blanking_batches
SET batch_number = REPLACE(batch_number, 'PW-', 'TEST-'),
    mixing_batch_number = REPLACE(mixing_batch_number, 'PW-BATCH-DOWN-', 'TEST-6160-'),
    material_code = REPLACE(material_code, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
    item_code = REPLACE(item_code, 'PW-', 'TEST-'),
    mill_operator = REPLACE(REPLACE(mill_operator, 'PW-', 'TEST-'), 'PW ', 'TEST '),
    preformer_operator = REPLACE(REPLACE(preformer_operator, 'PW-', 'TEST-'), 'PW ', 'TEST '),
    notes = REPLACE(notes, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE approved_material_batch_id IN (
    SELECT id FROM approved_material_batches WHERE material_code LIKE 'TEST-A-96-50-%'
);

UPDATE blanking_carts
SET cart_number = REPLACE(cart_number, 'PW-', 'TEST-'),
    mixing_batch_number = REPLACE(mixing_batch_number, 'PW-BATCH-DOWN-', 'TEST-6160-'),
    material_code = REPLACE(material_code, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
    item_code = REPLACE(item_code, 'PW-', 'TEST-'),
    blanking_note = REPLACE(blanking_note, 'PW ', 'TEST '),
    hold_reason = REPLACE(hold_reason, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE blanking_batch_id IN (
    SELECT id FROM blanking_batches WHERE material_code LIKE 'TEST-A-96-50-%'
);

UPDATE blank_returns
SET compound_batch_number = REPLACE(compound_batch_number, 'PW-BATCH-DOWN-', 'TEST-6160-'),
    compound_code = REPLACE(compound_code, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
    item_code = REPLACE(item_code, 'PW-', 'TEST-'),
    moulding_note = REPLACE(moulding_note, 'PW ', 'TEST '),
    return_reason = REPLACE(return_reason, 'PW ', 'TEST '),
    variance_note = REPLACE(variance_note, 'PW ', 'TEST '),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE blanking_batch_id IN (
    SELECT id FROM blanking_batches WHERE material_code LIKE 'TEST-A-96-50-%'
);

UPDATE presses
SET current_item_code = REPLACE(current_item_code, 'PW-', 'TEST-'),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE current_blanking_batch_id IN (
    SELECT id FROM blanking_batches WHERE material_code LIKE 'TEST-A-96-50-%'
);

UPDATE notifications
SET title = REPLACE(
        REPLACE(title, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
        'PW-BATCH-DOWN-', 'TEST-6160-'
    ),
    message = REPLACE(
        REPLACE(message, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
        'PW-BATCH-DOWN-', 'TEST-6160-'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE title LIKE '%PW-REC-DOWN-%'
   OR title LIKE '%PW-BATCH-DOWN-%'
   OR message LIKE '%PW-REC-DOWN-%'
   OR message LIKE '%PW-BATCH-DOWN-%';

UPDATE inventory_transactions
SET reason_reference = REPLACE(
        REPLACE(
            REPLACE(reason_reference, 'PW-REC-DOWN-', 'TEST-A-96-50-'),
            'PW-BATCH-DOWN-', 'TEST-6160-'
        ),
        'PW-', 'TEST-'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE (source_record_type = 'ApprovedMaterialBatch' AND source_record_id IN (
        SELECT id FROM approved_material_batches WHERE material_code LIKE 'TEST-A-96-50-%'
    ))
   OR (destination_record_type = 'ApprovedMaterialBatch' AND destination_record_id IN (
        SELECT id FROM approved_material_batches WHERE material_code LIKE 'TEST-A-96-50-%'
    ))
   OR (source_record_type = 'BlankingBatch' AND source_record_id IN (
        SELECT id FROM blanking_batches WHERE material_code LIKE 'TEST-A-96-50-%'
    ))
   OR (destination_record_type = 'BlankingBatch' AND destination_record_id IN (
        SELECT id FROM blanking_batches WHERE material_code LIKE 'TEST-A-96-50-%'
    ))
   OR (source_record_type = 'BlankingCart' AND source_record_id IN (
        SELECT cart.id
        FROM blanking_carts cart
        JOIN blanking_batches batch ON batch.id = cart.blanking_batch_id
        WHERE batch.material_code LIKE 'TEST-A-96-50-%'
    ))
   OR (destination_record_type = 'BlankingCart' AND destination_record_id IN (
        SELECT cart.id
        FROM blanking_carts cart
        JOIN blanking_batches batch ON batch.id = cart.blanking_batch_id
        WHERE batch.material_code LIKE 'TEST-A-96-50-%'
    ));

INSERT INTO audit_logs (
    created_at,
    updated_at,
    action,
    action_time,
    entity_id,
    entity_type,
    new_value,
    previous_value,
    related_batch_id,
    related_recipe_id,
    actor_id
) VALUES (
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'RENAME_PLAYWRIGHT_TEST_DATA',
    CURRENT_TIMESTAMP,
    NULL,
    'TestDataMaintenance',
    'Renamed downstream test identifiers to TEST-A-96-50-* / TEST-6160-* conventions',
    'PW-REC-DOWN-* / PW-BATCH-DOWN-* conventions',
    NULL,
    NULL,
    3
);

COMMIT;
