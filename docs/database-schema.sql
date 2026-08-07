-- PostgreSQL-oriented schema reference for the prototype.
-- Runtime development schema is managed by Hibernate (ddl-auto=update) so the
-- same entity model can start immediately with H2 or PostgreSQL.

CREATE TABLE user_accounts (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(40) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE recipes (
    id BIGSERIAL PRIMARY KEY,
    recipe_code VARCHAR(100) NOT NULL UNIQUE,
    compound_name VARCHAR(255) NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE recipe_revisions (
    id BIGSERIAL PRIMARY KEY,
    recipe_id BIGINT NOT NULL REFERENCES recipes(id),
    revision_number VARCHAR(100) NOT NULL,
    effective_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    approved_by_id BIGINT REFERENCES user_accounts(id),
    approved_at TIMESTAMP,
    revision_notes VARCHAR(2000),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE (recipe_id, revision_number)
);

CREATE TABLE recipe_ingredients (
    id BIGSERIAL PRIMARY KEY,
    recipe_revision_id BIGINT NOT NULL REFERENCES recipe_revisions(id),
    material_code VARCHAR(100) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    required_quantity NUMERIC(12,3) NOT NULL,
    unit VARCHAR(40) NOT NULL,
    addition_sequence INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    mixing_time_seconds INTEGER,
    temperature_celsius NUMERIC(8,2),
    speed_rpm NUMERIC(10,2),
    instructions VARCHAR(1000),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE production_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_number VARCHAR(100) NOT NULL UNIQUE,
    recipe_revision_id BIGINT NOT NULL REFERENCES recipe_revisions(id),
    planned_quantity_kg NUMERIC(12,3) NOT NULL,
    actual_output_quantity_kg NUMERIC(12,3),
    machine VARCHAR(255) NOT NULL,
    assigned_officer_id BIGINT NOT NULL REFERENCES user_accounts(id),
    planned_start_time TIMESTAMP,
    target_completion_time TIMESTAMP,
    production_priority VARCHAR(30),
    schedule_notes VARCHAR(1000),
    scheduled_by_id BIGINT REFERENCES user_accounts(id),
    scheduled_at TIMESTAMP,
    status VARCHAR(60) NOT NULL,
    current_stage INTEGER NOT NULL DEFAULT 0,
    issue_or_stoppage_reason VARCHAR(1000),
    reprocessing_source_batch_id BIGINT REFERENCES production_batches(id),
    laboratory_status VARCHAR(30) NOT NULL,
    release_status VARCHAR(40) NOT NULL,
    temporary_lab_bypass BOOLEAN DEFAULT FALSE,
    temporary_lab_bypass_reason VARCHAR(1000),
    temporary_lab_bypass_approved_by_id BIGINT REFERENCES user_accounts(id),
    temporary_lab_bypass_approved_at TIMESTAMP,
    traceability_code VARCHAR(255) NOT NULL UNIQUE,
    stage1_started_at TIMESTAMP,
    stage1_completed_at TIMESTAMP,
    stage2_started_at TIMESTAMP,
    stage2_completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE batch_status_history (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES production_batches(id),
    previous_status VARCHAR(60),
    new_status VARCHAR(60) NOT NULL,
    changed_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    changed_at TIMESTAMP NOT NULL,
    reason VARCHAR(1000),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE material_requests (
    id BIGSERIAL PRIMARY KEY,
    request_number VARCHAR(100) NOT NULL UNIQUE,
    batch_id BIGINT NOT NULL REFERENCES production_batches(id),
    requesting_officer_id BIGINT NOT NULL REFERENCES user_accounts(id),
    requested_at TIMESTAMP NOT NULL,
    status VARCHAR(40) NOT NULL,
    notes VARCHAR(1000),
    issued_by_id BIGINT REFERENCES user_accounts(id),
    issued_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE material_request_items (
    id BIGSERIAL PRIMARY KEY,
    material_request_id BIGINT NOT NULL REFERENCES material_requests(id),
    material_code VARCHAR(100) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    required_quantity NUMERIC(12,3) NOT NULL,
    requested_quantity NUMERIC(12,3) NOT NULL,
    issued_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit VARCHAR(40) NOT NULL,
    raw_material_lot_number VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE mixing_stages (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES production_batches(id),
    stage_number INTEGER NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    officer_id BIGINT NOT NULL REFERENCES user_accounts(id),
    machine VARCHAR(255) NOT NULL,
    planned_quantity NUMERIC(12,3) NOT NULL,
    actual_quantity NUMERIC(12,3),
    temperature_celsius NUMERIC(8,2),
    mixing_time_seconds INTEGER,
    speed_rpm NUMERIC(10,2),
    notes VARCHAR(1500),
    completion_status VARCHAR(40) NOT NULL,
    manager_override BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason VARCHAR(1000),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE (batch_id, stage_number)
);

CREATE TABLE stage_pause_events (
    id BIGSERIAL PRIMARY KEY,
    mixing_stage_id BIGINT NOT NULL REFERENCES mixing_stages(id),
    paused_at TIMESTAMP NOT NULL,
    resumed_at TIMESTAMP,
    reason VARCHAR(1000),
    recorded_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE lab_samples (
    id BIGSERIAL PRIMARY KEY,
    sample_id VARCHAR(100) NOT NULL UNIQUE,
    batch_id BIGINT NOT NULL REFERENCES production_batches(id),
    sent_to_lab_at TIMESTAMP NOT NULL,
    test_date_time TIMESTAMP,
    hardness NUMERIC(10,3),
    resilience NUMERIC(10,3),
    curing_time_minutes NUMERIC(10,3),
    decision VARCHAR(30) NOT NULL,
    tested_by_id BIGINT REFERENCES user_accounts(id),
    comments VARCHAR(1500),
    reprocessing_decision BOOLEAN NOT NULL DEFAULT FALSE,
    manager_approved_by_id BIGINT REFERENCES user_accounts(id),
    manager_approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE lab_test_results (
    id BIGSERIAL PRIMARY KEY,
    lab_sample_id BIGINT NOT NULL REFERENCES lab_samples(id),
    test_name VARCHAR(255) NOT NULL,
    result_value VARCHAR(255) NOT NULL,
    unit VARCHAR(40),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE test_specifications (
    id BIGSERIAL PRIMARY KEY,
    recipe_id BIGINT REFERENCES recipes(id),
    test_name VARCHAR(255) NOT NULL,
    minimum_value NUMERIC,
    maximum_value NUMERIC,
    unit VARCHAR(40),
    notes VARCHAR(1000),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE issue_threads (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT REFERENCES production_batches(id),
    priority VARCHAR(20) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    assigned_manager_id BIGINT REFERENCES user_accounts(id),
    unread_by_manager BOOLEAN NOT NULL DEFAULT TRUE,
    unread_by_officer BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE issue_messages (
    id BIGSERIAL PRIMARY KEY,
    issue_thread_id BIGINT NOT NULL REFERENCES issue_threads(id),
    sender_id BIGINT NOT NULL REFERENCES user_accounts(id),
    message VARCHAR(4000) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_id BIGINT NOT NULL REFERENCES user_accounts(id),
    type VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    reference_type VARCHAR(100),
    reference_id BIGINT,
    read_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT REFERENCES user_accounts(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255) NOT NULL,
    entity_id BIGINT,
    previous_value VARCHAR(4000),
    new_value VARCHAR(4000),
    action_time TIMESTAMP NOT NULL,
    related_batch_id BIGINT,
    related_recipe_id BIGINT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Downstream production extension: Mixing/Lab -> Blanking -> Moulding.
-- Runtime entities use the same base created_at/updated_at fields.

CREATE TABLE approved_material_batches (
    id BIGSERIAL PRIMARY KEY,
    mixing_batch_id BIGINT REFERENCES production_batches(id),
    lab_approval_id BIGINT REFERENCES lab_samples(id),
    mixing_batch_number VARCHAR(255) NOT NULL UNIQUE,
    material_code VARCHAR(255) NOT NULL,
    compound_name VARCHAR(255) NOT NULL,
    lab_status VARCHAR(30) NOT NULL,
    approved_quantity_kg NUMERIC(12,3) NOT NULL CHECK (approved_quantity_kg >= 0),
    available_quantity_kg NUMERIC(12,3) NOT NULL CHECK (available_quantity_kg >= 0),
    planned_quantity_kg NUMERIC(12,3),
    received_quantity_kg NUMERIC(12,3),
    reserved_quantity_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    consumed_quantity_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    returned_quantity_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    approved_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP,
    receiving_operator_id BIGINT REFERENCES user_accounts(id),
    stock_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    notes VARCHAR(1500),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE blanking_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_number VARCHAR(255) NOT NULL UNIQUE,
    approved_material_batch_id BIGINT REFERENCES approved_material_batches(id),
    mixing_batch_number VARCHAR(255) NOT NULL,
    material_code VARCHAR(255) NOT NULL,
    item_code VARCHAR(255),
    mill_operator VARCHAR(255),
    preformer_operator VARCHAR(255),
    material_consumed_kg NUMERIC(12,3) NOT NULL CHECK (material_consumed_kg > 0),
    planned_production_quantity INTEGER NOT NULL CHECK (planned_production_quantity > 0),
    average_blank_weight_grams NUMERIC(12,3),
    expected_blank_quantity NUMERIC(16,6),
    expected_whole_blank_quantity INTEGER,
    production_quantity INTEGER,
    actual_good_blank_quantity INTEGER,
    rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
    rejected_material_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    actual_used_compound_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    remaining_compound_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
    production_variance INTEGER NOT NULL DEFAULT 0,
    unbalanced BOOLEAN NOT NULL DEFAULT FALSE,
    balance_confirmation_reason VARCHAR(1000),
    balance_confirmed_by_id BIGINT REFERENCES user_accounts(id),
    available_good_blank_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_good_blank_quantity >= 0),
    production_date DATE NOT NULL,
    shift VARCHAR(30) NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    operator_id BIGINT NOT NULL REFERENCES user_accounts(id),
    operator_employee_id VARCHAR(255) NOT NULL,
    notes VARCHAR(1500),
    status VARCHAR(40) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE presses (
    id BIGSERIAL PRIMARY KEY,
    press_number VARCHAR(255) NOT NULL UNIQUE,
    press_name VARCHAR(255) NOT NULL,
    status VARCHAR(40) NOT NULL,
    available_blank_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_blank_quantity >= 0),
    good_tyre_quantity INTEGER NOT NULL DEFAULT 0 CHECK (good_tyre_quantity >= 0),
    rejected_tyre_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_tyre_quantity >= 0),
    rejected_blank_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_blank_quantity >= 0),
    current_operator_id BIGINT REFERENCES user_accounts(id),
    current_blanking_batch_id BIGINT REFERENCES blanking_batches(id),
    last_activity_at TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE blanking_carts (
    id BIGSERIAL PRIMARY KEY,
    cart_number VARCHAR(255) NOT NULL UNIQUE,
    blanking_batch_id BIGINT NOT NULL REFERENCES blanking_batches(id),
    material_code VARCHAR(255) NOT NULL,
    mixing_batch_number VARCHAR(255),
    item_code VARCHAR(255),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
    returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
    average_blank_weight_grams NUMERIC(12,3),
    material_weight_kg NUMERIC(12,3),
    created_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    destination_press_id BIGINT NOT NULL REFERENCES presses(id),
    dispatched_at TIMESTAMP,
    dispatched_by_id BIGINT REFERENCES user_accounts(id),
    held_at TIMESTAMP,
    held_by_id BIGINT REFERENCES user_accounts(id),
    hold_reason VARCHAR(1000),
    released_at TIMESTAMP,
    released_by_id BIGINT REFERENCES user_accounts(id),
    status VARCHAR(40) NOT NULL,
    blanking_note VARCHAR(1500),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE cart_transfers (
    id BIGSERIAL PRIMARY KEY,
    cart_id BIGINT NOT NULL UNIQUE REFERENCES blanking_carts(id),
    from_section VARCHAR(30) NOT NULL,
    destination_press_id BIGINT NOT NULL REFERENCES presses(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    dispatched_by_id BIGINT NOT NULL REFERENCES user_accounts(id),
    dispatched_at TIMESTAMP NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE cart_receipts (
    id BIGSERIAL PRIMARY KEY,
    receipt_number VARCHAR(255) UNIQUE,
    cart_id BIGINT NOT NULL UNIQUE REFERENCES blanking_carts(id),
    received_quantity INTEGER NOT NULL CHECK (received_quantity > 0),
    production_date DATE NOT NULL,
    shift VARCHAR(30) NOT NULL,
    received_at TIMESTAMP NOT NULL,
    receiving_operator_id BIGINT NOT NULL REFERENCES user_accounts(id),
    receiving_operator_employee_id VARCHAR(255) NOT NULL,
    press_id BIGINT NOT NULL REFERENCES presses(id),
    sending_operator_id BIGINT NOT NULL REFERENCES user_accounts(id),
    dispatch_time TIMESTAMP NOT NULL,
    receipt_status VARCHAR(40) NOT NULL,
    override_reason VARCHAR(1000),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE blank_returns (
    id BIGSERIAL PRIMARY KEY,
    return_number VARCHAR(255) NOT NULL UNIQUE,
    press_id BIGINT NOT NULL REFERENCES presses(id),
    cart_id BIGINT NOT NULL REFERENCES blanking_carts(id),
    blanking_batch_id BIGINT NOT NULL REFERENCES blanking_batches(id),
    compound_code VARCHAR(255) NOT NULL,
    compound_batch_number VARCHAR(255) NOT NULL,
    item_code VARCHAR(255),
    prepared_quantity INTEGER NOT NULL CHECK (prepared_quantity > 0),
    measured_return_weight_kg NUMERIC(12,3) NOT NULL,
    average_blank_weight_grams NUMERIC(12,3) NOT NULL,
    return_reason VARCHAR(1000) NOT NULL,
    sending_operator_id BIGINT NOT NULL REFERENCES user_accounts(id),
    sending_date_time TIMESTAMP NOT NULL,
    shift VARCHAR(30) NOT NULL,
    moulding_note VARCHAR(1500),
    receiving_operator_id BIGINT REFERENCES user_accounts(id),
    receiving_date_time TIMESTAMP,
    received_quantity INTEGER,
    received_weight_kg NUMERIC(12,3),
    quantity_variance INTEGER,
    weight_variance_kg NUMERIC(12,3),
    variance_note VARCHAR(1500),
    status VARCHAR(40) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_type VARCHAR(50) NOT NULL,
    source_section VARCHAR(30),
    destination_section VARCHAR(30),
    source_record_type VARCHAR(255),
    source_record_id BIGINT,
    destination_record_type VARCHAR(255),
    destination_record_id BIGINT,
    quantity NUMERIC(16,3) NOT NULL,
    unit VARCHAR(40) NOT NULL,
    weight_kg NUMERIC(16,3),
    actor_id BIGINT NOT NULL REFERENCES user_accounts(id),
    transaction_time TIMESTAMP NOT NULL,
    reason_reference VARCHAR(1500),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE moulding_production_records (
    id BIGSERIAL PRIMARY KEY,
    press_id BIGINT NOT NULL REFERENCES presses(id),
    production_date DATE NOT NULL,
    shift VARCHAR(30) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    operator_id BIGINT NOT NULL REFERENCES user_accounts(id),
    operator_employee_id VARCHAR(255) NOT NULL,
    cart_id BIGINT NOT NULL REFERENCES blanking_carts(id),
    blanking_batch_id BIGINT NOT NULL REFERENCES blanking_batches(id),
    quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
    good_tyre_quantity INTEGER NOT NULL DEFAULT 0 CHECK (good_tyre_quantity >= 0),
    rejected_tyre_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_tyre_quantity >= 0),
    rejected_tyre_weight_per_item_grams NUMERIC(12,3) NOT NULL DEFAULT 0,
    total_rejected_tyre_weight_grams NUMERIC(14,3) NOT NULL DEFAULT 0,
    rejected_blank_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_blank_quantity >= 0),
    remaining_blank_quantity INTEGER NOT NULL CHECK (remaining_blank_quantity >= 0),
    downtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (downtime_minutes >= 0),
    downtime_reason VARCHAR(1000),
    operator_note VARCHAR(1500),
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE material_shortage_requests (
    id BIGSERIAL PRIMARY KEY,
    request_number VARCHAR(255) NOT NULL UNIQUE,
    press_id BIGINT NOT NULL REFERENCES presses(id),
    current_blanking_batch_id BIGINT REFERENCES blanking_batches(id),
    current_available_blank_quantity INTEGER NOT NULL CHECK (current_available_blank_quantity >= 0),
    requested_blank_quantity INTEGER NOT NULL CHECK (requested_blank_quantity > 0),
    required_material_code VARCHAR(255) NOT NULL,
    required_at TIMESTAMP NOT NULL,
    priority VARCHAR(20) NOT NULL,
    sender_id BIGINT NOT NULL REFERENCES user_accounts(id),
    sender_employee_id VARCHAR(255) NOT NULL,
    production_date DATE NOT NULL,
    sender_shift VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    linked_cart_id BIGINT REFERENCES blanking_carts(id),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE shortage_request_messages (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES material_shortage_requests(id),
    sender_id BIGINT NOT NULL REFERENCES user_accounts(id),
    message VARCHAR(2000) NOT NULL,
    status_snapshot VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_batches_status ON production_batches(status);
CREATE INDEX idx_batches_officer ON production_batches(assigned_officer_id);
CREATE INDEX idx_batches_planned_start ON production_batches(planned_start_time);
CREATE INDEX idx_history_batch_time ON batch_status_history(batch_id, changed_at);
CREATE INDEX idx_material_requests_batch ON material_requests(batch_id);
CREATE INDEX idx_lab_samples_batch ON lab_samples(batch_id);
CREATE INDEX idx_issues_status_priority ON issue_threads(status, priority);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read_flag);
CREATE INDEX idx_audit_action_time ON audit_logs(action_time);
CREATE INDEX idx_approved_material_mixing_batch ON approved_material_batches(mixing_batch_number);
CREATE INDEX idx_approved_material_code ON approved_material_batches(material_code);
CREATE INDEX idx_blanking_batch_production_date ON blanking_batches(production_date);
CREATE INDEX idx_blanking_batch_material ON blanking_batches(material_code);
CREATE INDEX idx_blanking_cart_status ON blanking_carts(status);
CREATE INDEX idx_blanking_cart_destination ON blanking_carts(destination_press_id);
CREATE INDEX idx_moulding_record_production_date ON moulding_production_records(production_date);
CREATE INDEX idx_moulding_record_press ON moulding_production_records(press_id);
CREATE INDEX idx_shortage_status ON material_shortage_requests(status);
CREATE INDEX idx_shortage_required_at ON material_shortage_requests(required_at);
CREATE INDEX idx_blank_return_status ON blank_returns(status);
CREATE INDEX idx_blank_return_cart ON blank_returns(cart_id);
CREATE INDEX idx_inventory_transaction_time ON inventory_transactions(transaction_time);
CREATE INDEX idx_inventory_transaction_source ON inventory_transactions(source_record_type, source_record_id);
CREATE INDEX idx_inventory_transaction_destination ON inventory_transactions(destination_record_type, destination_record_id);
