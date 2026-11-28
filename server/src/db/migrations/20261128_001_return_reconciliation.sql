CREATE TABLE IF NOT EXISTS return_reconciliation_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code text NOT NULL,
  tracking_code text NOT NULL UNIQUE,
  source text NOT NULL,
  products jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(products)='array'),
  imported_by uuid REFERENCES users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  photo_data bytea,
  photo_content_type text,
  photo_file_name text,
  CHECK ((confirmed_at IS NULL AND confirmed_by IS NULL AND photo_data IS NULL AND photo_content_type IS NULL AND photo_file_name IS NULL)
    OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND photo_data IS NOT NULL AND photo_content_type IN ('image/jpeg','image/png','image/webp') AND photo_file_name IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS return_reconciliation_orders_imported_idx ON return_reconciliation_orders(imported_at DESC);
CREATE INDEX IF NOT EXISTS return_reconciliation_orders_open_idx ON return_reconciliation_orders(confirmed_at) WHERE confirmed_at IS NULL;
