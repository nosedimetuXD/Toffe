-- Estado de la venta: 'completada' (por defecto) o 'cancelada'.
-- Las ventas canceladas se conservan en el historial pero no cuentan como ingreso.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completada'
    CHECK (status IN ('completada', 'cancelada'));

-- Ingresos manuales registrados desde Contabilidad (no provenientes del POS).
CREATE TABLE IF NOT EXISTS incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    category VARCHAR(50) NOT NULL DEFAULT 'otros',
    payment_method VARCHAR(100) NOT NULL DEFAULT 'efectivo',
    registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incomes_created_at ON incomes(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
