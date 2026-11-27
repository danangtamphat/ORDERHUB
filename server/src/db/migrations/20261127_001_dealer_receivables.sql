CREATE TABLE IF NOT EXISTS dealer_receivable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer text NOT NULL CHECK (dealer IN ('Mai Linh','ONVIZ','Thành Nam')),
  entry_date date NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 300),
  quantity numeric(14,2) CHECK (quantity IS NULL OR quantity >= 0),
  unit_price numeric(18,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  debit_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_amount = 0 OR credit_amount = 0),
  CHECK (debit_amount + credit_amount > 0)
);
CREATE INDEX IF NOT EXISTS dealer_receivable_entries_ledger_idx ON dealer_receivable_entries(dealer, entry_date, created_at, id);
