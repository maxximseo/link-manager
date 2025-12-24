-- Migration: Add Site Slot Rentals System
-- Version: 2.8.0
-- Date: 2025-12-24
-- Description: Allows site owners to lease link slots to other users

BEGIN;

-- ============================================
-- 1. Create site_slot_rentals table
-- ============================================

CREATE TABLE IF NOT EXISTS site_slot_rentals (
    id SERIAL PRIMARY KEY,

    -- Стороны аренды
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Условия аренды
    slots_count INTEGER NOT NULL CHECK (slots_count > 0),
    slots_used INTEGER DEFAULT 0 CHECK (slots_used >= 0),
    price_per_slot DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    discount_applied INTEGER DEFAULT 0,

    -- Сроки
    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    -- Статус
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active',
        'expired',
        'cancelled'
    )),

    -- Автопродление
    auto_renewal BOOLEAN DEFAULT FALSE,

    -- Транзакция платежа
    payment_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

    -- Метаданные
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Проверка: арендатор не может быть владельцем
    CONSTRAINT tenant_not_owner CHECK (tenant_id != owner_id)
);

-- ============================================
-- 2. Create rental_placements junction table
-- ============================================

CREATE TABLE IF NOT EXISTS rental_placements (
    id SERIAL PRIMARY KEY,
    rental_id INTEGER NOT NULL REFERENCES site_slot_rentals(id) ON DELETE CASCADE,
    placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(placement_id)
);

-- ============================================
-- 3. Add indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_slot_rentals_site ON site_slot_rentals(site_id);
CREATE INDEX IF NOT EXISTS idx_slot_rentals_owner ON site_slot_rentals(owner_id);
CREATE INDEX IF NOT EXISTS idx_slot_rentals_tenant ON site_slot_rentals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_slot_rentals_status ON site_slot_rentals(status);
CREATE INDEX IF NOT EXISTS idx_slot_rentals_expires ON site_slot_rentals(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_slot_rentals_active ON site_slot_rentals(tenant_id, site_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rental_placements_rental ON rental_placements(rental_id);

-- ============================================
-- 4. Add comments
-- ============================================

COMMENT ON TABLE site_slot_rentals IS 'Tracks slot rentals where site owners lease link slots to other users';
COMMENT ON COLUMN site_slot_rentals.slots_count IS 'Number of homepage link slots being rented';
COMMENT ON COLUMN site_slot_rentals.slots_used IS 'Number of slots currently used by tenant';
COMMENT ON COLUMN site_slot_rentals.total_price IS 'Total price paid upfront (slots_count * price_per_slot)';
COMMENT ON COLUMN site_slot_rentals.price_per_slot IS 'Price per slot (used for renewal calculation)';
COMMENT ON TABLE rental_placements IS 'Links placements to their source rental (tracks which slots are used)';

COMMIT;
