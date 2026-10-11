-- Driver-chosen billing rules (first month, holidays) and school calendars.
ALTER TABLE users
  ADD COLUMN first_month_rule text NOT NULL DEFAULT 'full' CHECK (first_month_rule IN ('full','ask','half_after','prorata')),
  ADD COLUMN half_cutoff_day  int  NOT NULL DEFAULT 15 CHECK (half_cutoff_day BETWEEN 2 AND 28),
  ADD COLUMN holiday_rule     text NOT NULL DEFAULT 'same' CHECK (holiday_rule IN ('same','by_days','half_or_ask')),
  ADD COLUMN school_closures  jsonb NOT NULL DEFAULT '[]';

-- needs_review: the holiday rule left this month's charge for the driver to decide.
-- charge_note:  why the charge is what it is ("4/23" school days, or the driver's reason for a change).
ALTER TABLE billing_periods
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN charge_note  text;
