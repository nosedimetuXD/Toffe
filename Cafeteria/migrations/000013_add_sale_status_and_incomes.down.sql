DROP INDEX IF EXISTS idx_sales_status;
DROP INDEX IF EXISTS idx_incomes_created_at;
DROP TABLE IF EXISTS incomes;
ALTER TABLE sales DROP COLUMN IF EXISTS status;
