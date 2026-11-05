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
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
