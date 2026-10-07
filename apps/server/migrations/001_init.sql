-- Bus Ledger schema (SRS v1.3, §8). All money in lisente (bigint).
-- server_seq comes from one global sequence; a device pulls rows with server_seq > its cursor.

CREATE SEQUENCE IF NOT EXISTS change_seq;

CREATE TABLE users (
  id               uuid PRIMARY KEY,
  name             text NOT NULL,
  phone            text NOT NULL UNIQUE,
  email            text,
  pin_hash         text NOT NULL,
  business_name    text NOT NULL DEFAULT '',
  due_day          int  NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  grace_days       int  NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 60),
  payment_methods  jsonb NOT NULL DEFAULT '["Cash","M-Pesa","EcoCash","Bank Transfer","Other"]',
  failed_logins    int  NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  server_seq       bigint NOT NULL DEFAULT nextval('change_seq')
);

CREATE SEQUENCE IF NOT EXISTS device_prefix_seq;

CREATE TABLE devices (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ack_prefix    text NOT NULL UNIQUE,
  name          text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at  timestamptz
);

CREATE TABLE students (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  parent_name       text NOT NULL,
  parent_phone      text NOT NULL,
  school            text NOT NULL DEFAULT '',
  pickup_location   text NOT NULL DEFAULT '',
  dropoff_location  text NOT NULL DEFAULT '',
  monthly_fee       bigint NOT NULL CHECK (monthly_fee >= 0),
  onboarded_at      date NOT NULL,
  status            text NOT NULL CHECK (status IN ('active','inactive')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  server_seq        bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX students_user ON students(user_id, server_seq);

CREATE TABLE billing_periods (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year             int NOT NULL,
  month            int NOT NULL CHECK (month BETWEEN 1 AND 12),
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  due_date         date NOT NULL,
  amount_due       bigint NOT NULL CHECK (amount_due >= 0),
  -- caches derived from payment_allocations (never edited directly)
  amount_recorded  bigint NOT NULL DEFAULT 0,
  balance          bigint NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  cancelled        boolean NOT NULL DEFAULT false,
  origin           text NOT NULL CHECK (origin IN ('server','onboarding')),
  generated_at     timestamptz NOT NULL DEFAULT now(),
  server_seq       bigint NOT NULL DEFAULT nextval('change_seq'),
  UNIQUE (student_id, year, month)
);
CREATE INDEX periods_user ON billing_periods(user_id, server_seq);

CREATE TABLE payments (
  id                     uuid PRIMARY KEY,
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id             uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount                 bigint NOT NULL CHECK (amount > 0),
  method                 text NOT NULL,
  payment_date           date NOT NULL,
  reference              text,
  note                   text,
  source                 text NOT NULL CHECK (source IN ('manual','voice')),
  idempotency_key        text NOT NULL,
  acknowledgement_number text,
  device_id              uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_by             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL,
  received_at            timestamptz NOT NULL DEFAULT now(),
  long_offline           boolean NOT NULL DEFAULT false,
  voided_at              timestamptz,
  void_reason            text,
  corrects_payment_id    uuid REFERENCES payments(id),
  server_seq             bigint NOT NULL DEFAULT nextval('change_seq'),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX payments_user ON payments(user_id, server_seq);
CREATE INDEX payments_student ON payments(student_id);

CREATE TABLE credit_adjustments (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('refunded_outside_app','written_off','other')),
  amount      bigint NOT NULL CHECK (amount > 0),
  reason      text NOT NULL,
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL,
  server_seq  bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX adjustments_user ON credit_adjustments(user_id, server_seq);

-- Derived: replaced wholesale whenever a student's ledger is recomputed.
CREATE TABLE payment_allocations (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  payment_id  uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  target      text NOT NULL CHECK (target IN ('period','adjustment')),
  target_id   uuid NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX allocations_student ON payment_allocations(student_id);

CREATE TABLE fee_changes (
  id              uuid PRIMARY KEY,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  old_fee         bigint NOT NULL,
  new_fee         bigint NOT NULL,
  effective_from  date NOT NULL,
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE acknowledgements (
  id                   uuid PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id           uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  number               text NOT NULL UNIQUE,
  balance_shown        bigint NOT NULL,
  balance_as_of        timestamptz NOT NULL,
  balance_provisional  boolean NOT NULL,
  generated_at         timestamptz NOT NULL,
  shared_via           text,
  server_seq           bigint NOT NULL DEFAULT nextval('change_seq')
);
CREATE INDEX acks_user ON acknowledgements(user_id, server_seq);

-- NFR-005: immutable revision history.
CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          text NOT NULL,
  actor_user_id   uuid NOT NULL,
  device_id       uuid,
  at              timestamptz NOT NULL DEFAULT now(),
  previous_values jsonb,
  new_values      jsonb
);
CREATE INDEX audit_entity ON audit_log(entity_type, entity_id);

-- The application never updates or deletes audit rows. In production, run the API
-- as a role without UPDATE/DELETE on audit_log (see README); account purge
-- (FR-037) runs as the owner role.

CREATE TABLE reset_codes (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0
);

CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
