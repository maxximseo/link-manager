-- Migration: Add payment_invoices table for CryptoCloud.plus integration
-- Date: 2025-12-09

-- Create payment_invoices table
CREATE TABLE IF NOT EXISTS payment_invoices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_uuid VARCHAR(100) UNIQUE NOT NULL,  -- CryptoCloud invoice ID (INV-XXXXXXXX)
    order_id VARCHAR(100) UNIQUE NOT NULL,       -- Our internal ID (deposit_{userId}_{timestamp})
    amount DECIMAL(10,2) NOT NULL,               -- Amount in USD
    status VARCHAR(20) DEFAULT 'pending',        -- pending/paid/expired/cancelled
    payment_link TEXT,                           -- CryptoCloud payment URL
    crypto_currency VARCHAR(50),                 -- What crypto was used for payment (after payment)
    crypto_amount DECIMAL(20,8),                 -- How much crypto was received
    expires_at TIMESTAMP,                        -- When invoice expires
    paid_at TIMESTAMP,                           -- When payment was confirmed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_invoices_user ON payment_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_uuid ON payment_invoices(invoice_uuid);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_order ON payment_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_status ON payment_invoices(status);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_created ON payment_invoices(created_at DESC);

-- Comments
COMMENT ON TABLE payment_invoices IS 'CryptoCloud.plus payment invoices for balance deposits';
COMMENT ON COLUMN payment_invoices.invoice_uuid IS 'CryptoCloud invoice UUID (INV-XXXXXXXX format)';
COMMENT ON COLUMN payment_invoices.order_id IS 'Internal order ID format: deposit_{userId}_{timestamp}';
COMMENT ON COLUMN payment_invoices.amount IS 'Invoice amount in USD';
COMMENT ON COLUMN payment_invoices.status IS 'Invoice status: pending, paid, expired, cancelled';
COMMENT ON COLUMN payment_invoices.payment_link IS 'URL for user to complete payment on CryptoCloud';
COMMENT ON COLUMN payment_invoices.crypto_currency IS 'Cryptocurrency used for payment (e.g., USDT_TRC20, BTC)';
COMMENT ON COLUMN payment_invoices.crypto_amount IS 'Amount of cryptocurrency received';
COMMENT ON COLUMN payment_invoices.expires_at IS 'Invoice expiration timestamp';
COMMENT ON COLUMN payment_invoices.paid_at IS 'Payment confirmation timestamp';
