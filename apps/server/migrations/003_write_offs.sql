-- A write-off is recorded like a payment but is not money received: it forgives
-- what was owed for one month (write_off_period_id). Voiding it undoes it.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_source_check;
ALTER TABLE payments ADD CONSTRAINT payments_source_check CHECK (source IN ('manual','voice','write_off'));
ALTER TABLE payments ADD COLUMN write_off_period_id uuid REFERENCES billing_periods(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT write_off_has_period CHECK ((source = 'write_off') = (write_off_period_id IS NOT NULL));
