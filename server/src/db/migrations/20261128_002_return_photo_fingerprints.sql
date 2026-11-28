ALTER TABLE return_reconciliation_orders ADD COLUMN IF NOT EXISTS photo_sha256 text;
CREATE UNIQUE INDEX IF NOT EXISTS return_reconciliation_orders_photo_sha256_uq
  ON return_reconciliation_orders(photo_sha256)
  WHERE photo_sha256 IS NOT NULL;
