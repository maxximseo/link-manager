-- ============================================
-- Migration: Add Billing System
-- Description: Adds billing, balance, transactions, discounts, and renewal features
-- Date: 2025-01-22
-- ============================================

BEGIN;

-- ============================================
-- 1. Update users table with billing fields
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0.00 NOT NULL CHECK (balance >= 0),
ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS current_discount INTEGER DEFAULT 0 CHECK (current_discount BETWEEN 0 AND 30),
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);

-- Add indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- 2. Create transactions table
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'deposit', 'purchase', 'renewal', 'refund', 'auto_renewal', 'admin_adjustment'
    amount DECIMAL(10, 2) NOT NULL,
    balance_before DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    description TEXT,

    -- Link to placement if transaction is related to purchase/renewal
    placement_id INTEGER REFERENCES placements(id) ON DELETE SET NULL,

    -- Additional metadata (discounts, promo codes, etc.)
    metadata JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_placement ON transactions(placement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- ============================================
-- 3. Create discount_tiers table
-- ============================================

CREATE TABLE IF NOT EXISTS discount_tiers (
    id SERIAL PRIMARY KEY,
    min_spent DECIMAL(10, 2) NOT NULL UNIQUE,
    discount_percentage INTEGER NOT NULL CHECK (discount_percentage BETWEEN 0 AND 100),
    tier_name VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default discount tiers
INSERT INTO discount_tiers (min_spent, discount_percentage, tier_name) VALUES
(0, 0, 'Стандарт'),
(800, 10, 'Bronze'),
(1200, 15, 'Silver'),
(1600, 20, 'Gold'),
(2000, 25, 'Platinum'),
(2400, 30, 'Diamond')
ON CONFLICT (min_spent) DO NOTHING;

-- ============================================
-- 4. Update placements table with billing fields
-- ============================================

ALTER TABLE placements
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS discount_applied INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS scheduled_publish_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS renewal_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS renewal_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- Add indexes for placements billing features
CREATE INDEX IF NOT EXISTS idx_placements_status ON placements(status);
CREATE INDEX IF NOT EXISTS idx_placements_expires_at ON placements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placements_auto_renewal ON placements(auto_renewal, expires_at) WHERE auto_renewal = true;
CREATE INDEX IF NOT EXISTS idx_placements_scheduled ON placements(scheduled_publish_date) WHERE scheduled_publish_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placements_type ON placements(type);

-- ============================================
-- 5. Create renewal_history table
-- ============================================

CREATE TABLE IF NOT EXISTS renewal_history (
    id SERIAL PRIMARY KEY,
    placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    renewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    price_paid DECIMAL(10, 2) NOT NULL,
    discount_applied INTEGER,
    new_expiry_date TIMESTAMP NOT NULL,

    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for renewal_history
CREATE INDEX IF NOT EXISTS idx_renewal_history_placement ON renewal_history(placement_id);
CREATE INDEX IF NOT EXISTS idx_renewal_history_user ON renewal_history(user_id);

-- ============================================
-- 6. Create notifications table
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'balance_deposited', 'placement_published', 'auto_renewal_failed', 'placement_expiring', 'discount_tier_achieved'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    read BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- ============================================
-- 7. Create audit_log table for security
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- ============================================
-- 8. Add usage tracking to project_links and project_articles
-- ============================================

ALTER TABLE project_links
ADD COLUMN IF NOT EXISTS usage_limit INTEGER DEFAULT 999,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'exhausted'));

ALTER TABLE project_articles
ADD COLUMN IF NOT EXISTS usage_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'exhausted'));

-- Indexes for usage tracking
CREATE INDEX IF NOT EXISTS idx_project_links_status ON project_links(status);
CREATE INDEX IF NOT EXISTS idx_project_articles_status ON project_articles(status);

COMMIT;

-- ============================================
-- Migration completed successfully
-- ============================================
