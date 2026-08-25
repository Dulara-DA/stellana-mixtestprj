-- One-time H2 development-data maintenance.
--
-- Replaces the long numeric suffixes on the 14 existing downstream test
-- compound/batch chains with short letters A-N. Only TEST-prefixed records
-- listed in the mapping are changed. Real records such as A-96-50 / 6160
-- are deliberately outside every predicate.

SET AUTOCOMMIT FALSE;

CREATE LOCAL TEMPORARY TABLE downstream_suffix_map (
    old_suffix VARCHAR(32) PRIMARY KEY,
    new_suffix VARCHAR(2) NOT NULL UNIQUE
);

INSERT INTO downstream_suffix_map (old_suffix, new_suffix) VALUES
    ('178720794000381', 'A'),
    ('1787208467471855', 'B'),
    ('1787208575355528', 'C'),
    ('1787208576887576', 'D'),
    ('1787208676066967', 'E'),
    ('1787208789770486', 'F'),
    ('1787208926519992', 'G'),
    ('1787208929897757', 'H'),
    ('1787208931354831', 'I'),
    ('1787208932482419', 'J'),
    ('1787209012883434', 'K'),
    ('1787209016356867', 'L'),
    ('1787209017814251', 'M'),
    ('1787209019020917', 'N');

-- Update dependent Mixing records while their parent identifiers still
-- contain the old suffixes.
UPDATE mixing_stages
SET machine = 'TEST-MIXER-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        JOIN production_batches batch
          ON batch.batch_number = 'TEST-6160-' || mapping.old_suffix
        WHERE batch.id = mixing_stages.batch_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    JOIN production_batches batch
      ON batch.batch_number = 'TEST-6160-' || mapping.old_suffix
    WHERE batch.id = mixing_stages.batch_id
);

UPDATE material_request_items
SET material_code = 'TEST-RM-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        JOIN production_batches batch
          ON batch.batch_number = 'TEST-6160-' || mapping.old_suffix
        JOIN material_requests request ON request.batch_id = batch.id
        WHERE request.id = material_request_items.material_request_id
    ) || CASE
        WHEN material_code LIKE '%-1' THEN '-A'
        WHEN material_code LIKE '%-2' THEN '-B'
        ELSE '-MATERIAL'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    JOIN production_batches batch
      ON batch.batch_number = 'TEST-6160-' || mapping.old_suffix
    JOIN material_requests request ON request.batch_id = batch.id
    WHERE request.id = material_request_items.material_request_id
);

UPDATE recipe_ingredients
SET material_code = 'TEST-RM-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        JOIN recipes recipe
          ON recipe.recipe_code = 'TEST-A-96-50-' || mapping.old_suffix
        JOIN recipe_revisions revision ON revision.recipe_id = recipe.id
        WHERE revision.id = recipe_ingredients.recipe_revision_id
    ) || CASE
        WHEN addition_sequence = 1 THEN '-A'
        WHEN addition_sequence = 2 THEN '-B'
        ELSE '-MATERIAL'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    JOIN recipes recipe
      ON recipe.recipe_code = 'TEST-A-96-50-' || mapping.old_suffix
    JOIN recipe_revisions revision ON revision.recipe_id = recipe.id
    WHERE revision.id = recipe_ingredients.recipe_revision_id
);

-- Update downstream denormalized references before the source stock and
-- Mixing batch identifiers are shortened.
UPDATE blank_returns
SET compound_batch_number = 'TEST-6160-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blank_returns.compound_batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    compound_code = 'TEST-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blank_returns.compound_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE blank_returns.compound_batch_number = 'TEST-6160-' || mapping.old_suffix
      AND blank_returns.compound_code = 'TEST-A-96-50-' || mapping.old_suffix
);

UPDATE blanking_carts
SET mixing_batch_number = 'TEST-6160-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blanking_carts.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    material_code = 'TEST-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blanking_carts.material_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE blanking_carts.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
      AND blanking_carts.material_code = 'TEST-A-96-50-' || mapping.old_suffix
);

UPDATE blanking_batches
SET mixing_batch_number = 'TEST-6160-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blanking_batches.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    material_code = 'TEST-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE blanking_batches.material_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE blanking_batches.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
      AND blanking_batches.material_code = 'TEST-A-96-50-' || mapping.old_suffix
);

UPDATE approved_material_batches
SET mixing_batch_number = 'TEST-6160-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE approved_material_batches.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    material_code = 'TEST-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE approved_material_batches.material_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    compound_name = 'TEST A-96-50 Compound ' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE approved_material_batches.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE approved_material_batches.mixing_batch_number = 'TEST-6160-' || mapping.old_suffix
      AND approved_material_batches.material_code = 'TEST-A-96-50-' || mapping.old_suffix
);

-- Update human-facing notification and inventory references without
-- rewriting historical audit snapshots.
UPDATE notifications
SET title = REPLACE(
        REPLACE(
            title,
            'TEST-A-96-50-' || (
                SELECT mapping.old_suffix FROM downstream_suffix_map mapping
                WHERE title LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR title LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            ),
            'TEST-A-96-50-' || (
                SELECT mapping.new_suffix FROM downstream_suffix_map mapping
                WHERE title LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR title LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            )
        ),
        'TEST-6160-' || (
            SELECT mapping.old_suffix FROM downstream_suffix_map mapping
            WHERE title LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR title LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        ),
        'TEST-6160-' || (
            SELECT mapping.new_suffix FROM downstream_suffix_map mapping
            WHERE title LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR title LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM downstream_suffix_map mapping
    WHERE title LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
       OR title LIKE '%TEST-6160-' || mapping.old_suffix || '%'
);

UPDATE notifications
SET message = REPLACE(
        REPLACE(
            message,
            'TEST-A-96-50-' || (
                SELECT mapping.old_suffix FROM downstream_suffix_map mapping
                WHERE message LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR message LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            ),
            'TEST-A-96-50-' || (
                SELECT mapping.new_suffix FROM downstream_suffix_map mapping
                WHERE message LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR message LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            )
        ),
        'TEST-6160-' || (
            SELECT mapping.old_suffix FROM downstream_suffix_map mapping
            WHERE message LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR message LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        ),
        'TEST-6160-' || (
            SELECT mapping.new_suffix FROM downstream_suffix_map mapping
            WHERE message LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR message LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM downstream_suffix_map mapping
    WHERE message LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
       OR message LIKE '%TEST-6160-' || mapping.old_suffix || '%'
);

UPDATE inventory_transactions
SET reason_reference = REPLACE(
        REPLACE(
            reason_reference,
            'TEST-A-96-50-' || (
                SELECT mapping.old_suffix FROM downstream_suffix_map mapping
                WHERE reason_reference LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR reason_reference LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            ),
            'TEST-A-96-50-' || (
                SELECT mapping.new_suffix FROM downstream_suffix_map mapping
                WHERE reason_reference LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
                   OR reason_reference LIKE '%TEST-6160-' || mapping.old_suffix || '%'
            )
        ),
        'TEST-6160-' || (
            SELECT mapping.old_suffix FROM downstream_suffix_map mapping
            WHERE reason_reference LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR reason_reference LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        ),
        'TEST-6160-' || (
            SELECT mapping.new_suffix FROM downstream_suffix_map mapping
            WHERE reason_reference LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
               OR reason_reference LIKE '%TEST-6160-' || mapping.old_suffix || '%'
        )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM downstream_suffix_map mapping
    WHERE reason_reference LIKE '%TEST-A-96-50-' || mapping.old_suffix || '%'
       OR reason_reference LIKE '%TEST-6160-' || mapping.old_suffix || '%'
);

UPDATE production_batches
SET batch_number = 'TEST-6160-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE production_batches.batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    machine = 'TEST-MIXER-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE production_batches.batch_number = 'TEST-6160-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE production_batches.batch_number = 'TEST-6160-' || mapping.old_suffix
);

UPDATE recipes
SET recipe_code = 'TEST-A-96-50-' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE recipes.recipe_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    compound_name = 'TEST A-96-50 Compound ' || (
        SELECT mapping.new_suffix
        FROM downstream_suffix_map mapping
        WHERE recipes.recipe_code = 'TEST-A-96-50-' || mapping.old_suffix
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM downstream_suffix_map mapping
    WHERE recipes.recipe_code = 'TEST-A-96-50-' || mapping.old_suffix
);

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
    'SHORTEN_DOWNSTREAM_TEST_IDENTIFIERS',
    CURRENT_TIMESTAMP,
    NULL,
    'TestDataMaintenance',
    'Renamed 14 downstream test compound/batch chains to suffixes A-N',
    'Long numeric suffixes on TEST-A-96-50-* / TEST-6160-*',
    NULL,
    NULL,
    3
);

COMMIT;
DROP TABLE downstream_suffix_map;
