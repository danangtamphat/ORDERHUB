CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','manager','staff')),
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email citext;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_grade smallint NOT NULL DEFAULT 2 CHECK (employee_grade BETWEEN 1 AND 3);
CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  birth_date date NOT NULL,
  hometown text NOT NULL,
  national_id_ciphertext bytea NOT NULL,
  position text NOT NULL,
  start_date date NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  amount_vnd bigint NOT NULL CHECK (amount_vnd BETWEEN 10000 AND 50000000),
  status text NOT NULL CHECK (status IN ('pending','delivered','returned')) DEFAULT 'pending',
  invoice_status text NOT NULL CHECK (invoice_status IN ('not_issued','issued')) DEFAULT 'not_issued',
  share_group_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_owner_tracking_code_idx
  ON orders(owner_user_id, lower(tracking_code));
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_owner_idx ON orders(owner_user_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_reconciled boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
UPDATE orders SET delivered_at=updated_at WHERE status='delivered' AND delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_user_id uuid NOT NULL REFERENCES users(id),
  work_type text NOT NULL DEFAULT 'Công việc chung',
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  deadline date NOT NULL,
  completion_submitted_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS work_type text NOT NULL DEFAULT 'Công việc chung';
ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS completion_submitted_at timestamptz;
CREATE INDEX IF NOT EXISTS assigned_tasks_assignee_deadline_idx ON assigned_tasks(assignee_user_id, deadline);
CREATE TABLE IF NOT EXISTS task_review_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS task_review_notifications_unread_idx ON task_review_notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS task_assignment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
  task_title text NOT NULL,
  deadline date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS task_assignment_notifications_unread_idx ON task_assignment_notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  work_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('morning','afternoon')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,work_date)
);
CREATE INDEX IF NOT EXISTS work_schedules_date_idx ON work_schedules(work_date,shift);
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  work_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('morning','afternoon')),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,work_date)
);
CREATE TABLE IF NOT EXISTS daily_login_notices (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,login_date)
);
CREATE TABLE IF NOT EXISTS pet_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pet_type text NOT NULL DEFAULT 'cat' CHECK (pet_type IN ('cat','dog','rabbit','panda','fox','frog','bear','unicorn')),
  food_count integer NOT NULL DEFAULT 0 CHECK (food_count >= 0),
  fed_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reminder_prompts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_date date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('09','14')),
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,prompt_date,slot)
);
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_user_created_idx ON password_reset_codes(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  user_id uuid NOT NULL REFERENCES users(id),
  period_start date NOT NULL,
  work_shifts_override integer CHECK (work_shifts_override >= 0),
  base_override_vnd bigint,
  completion_rate numeric(8,2) NOT NULL DEFAULT 100 CHECK (completion_rate BETWEEN 0 AND 200000),
  other_income_vnd bigint NOT NULL DEFAULT 0,
  late_penalty_vnd bigint NOT NULL DEFAULT 0,
  loss_penalty_vnd bigint NOT NULL DEFAULT 0,
  insurance_vnd bigint NOT NULL DEFAULT 0,
  advance_vnd bigint NOT NULL DEFAULT 0,
  holdback_vnd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,period_start)
);
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS work_shifts_override integer CHECK (work_shifts_override >= 0);
ALTER TABLE payroll_adjustments ALTER COLUMN completion_rate TYPE numeric(8,2);
ALTER TABLE payroll_adjustments DROP CONSTRAINT IF EXISTS payroll_adjustments_completion_rate_check;
ALTER TABLE payroll_adjustments ADD CONSTRAINT payroll_adjustments_completion_rate_check CHECK (completion_rate BETWEEN 0 AND 200000);
ALTER TABLE payroll_adjustments ALTER COLUMN insurance_vnd SET DEFAULT 0;
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS insurance_default_migrated boolean NOT NULL DEFAULT false;
UPDATE payroll_adjustments SET insurance_vnd=0,insurance_default_migrated=true WHERE insurance_default_migrated=false AND insurance_vnd=500000;
UPDATE payroll_adjustments SET insurance_default_migrated=true WHERE insurance_default_migrated=false;
ALTER TABLE payroll_adjustments ALTER COLUMN insurance_default_migrated SET DEFAULT true;
UPDATE payroll_adjustments SET completion_rate=100 WHERE completion_rate>100;
CREATE TABLE IF NOT EXISTS payroll_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  violation_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  description text NOT NULL,
  points numeric(8,2) NOT NULL DEFAULT 0 CHECK (points >= 0),
  fine_amount_vnd bigint NOT NULL DEFAULT 0 CHECK (fine_amount_vnd >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (points > 0 OR fine_amount_vnd > 0)
);
ALTER TABLE payroll_penalties ADD COLUMN IF NOT EXISTS violation_date date;
UPDATE payroll_penalties SET violation_date=(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE violation_date IS NULL;
ALTER TABLE payroll_penalties ALTER COLUMN violation_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
ALTER TABLE payroll_penalties ALTER COLUMN violation_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS payroll_penalties_period_user_idx ON payroll_penalties(period_start,user_id,created_at DESC);
-- Raise legacy records to the current 20-point rule for unauthorized return confirmation.
UPDATE payroll_penalties SET points=20
WHERE description LIKE 'Tự ý xác nhận đơn hoàn khi chưa có hàng hoàn về%'
  AND points=10;
CREATE TABLE IF NOT EXISTS salary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku citext NOT NULL UNIQUE,
  name text NOT NULL,
  brand text NOT NULL DEFAULT 'OEM',
  unit text NOT NULL DEFAULT 'cái',
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost_vnd bigint NOT NULL DEFAULT 0 CHECK (unit_cost_vnd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost_vnd bigint NOT NULL DEFAULT 0 CHECK (unit_cost_vnd >= 0);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'cái';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'OEM';
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('inbound','sold','waste')),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost_vnd bigint,
  note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_created_idx ON inventory_movements(item_id,created_at DESC);
CREATE TABLE IF NOT EXISTS inventory_weekly_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity >= 0),
  entered_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,week_start)
);
CREATE INDEX IF NOT EXISTS inventory_weekly_counts_week_idx ON inventory_weekly_counts(week_start,item_id);
