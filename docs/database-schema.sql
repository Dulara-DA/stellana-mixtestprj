-- PostgreSQL-oriented schema reference for the prototype.
-- Runtime development schema is managed by Hibernate (ddl-auto=update) so the
-- same entity model can start immediately with H2 or PostgreSQL.

CREATE TABLE user_accounts (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
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
    status VARCHAR(60) NOT NULL,
    current_stage INTEGER NOT NULL DEFAULT 0,
    issue_or_stoppage_reason VARCHAR(1000),
    reprocessing_source_batch_id BIGINT REFERENCES production_batches(id),
    laboratory_status VARCHAR(30) NOT NULL,
    release_status VARCHAR(40) NOT NULL,
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

CREATE INDEX idx_batches_status ON production_batches(status);
CREATE INDEX idx_batches_officer ON production_batches(assigned_officer_id);
CREATE INDEX idx_history_batch_time ON batch_status_history(batch_id, changed_at);
CREATE INDEX idx_material_requests_batch ON material_requests(batch_id);
CREATE INDEX idx_lab_samples_batch ON lab_samples(batch_id);
CREATE INDEX idx_issues_status_priority ON issue_threads(status, priority);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read_flag);
CREATE INDEX idx_audit_action_time ON audit_logs(action_time);
