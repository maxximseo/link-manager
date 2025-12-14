-- Миграция: Система промокодов и реферальных бонусов
-- Версия: 1.0.0
-- Дата: 2025-12-14

BEGIN;

-- ============================================================
-- Часть 1: Таблица промокодов
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,           -- Уникальный код (например, "WELCOME2024")
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Владелец промокода (получает партнёрскую награду)
    bonus_amount DECIMAL(10, 2) DEFAULT 100.00, -- Бонус для нового пользователя
    partner_reward DECIMAL(10, 2) DEFAULT 50.00,-- Награда партнёру (владельцу промокода)
    min_deposit DECIMAL(10, 2) DEFAULT 100.00,  -- Минимальный депозит для активации
    max_uses INTEGER DEFAULT 0,                  -- 0 = безлимит
    current_uses INTEGER DEFAULT 0,              -- Текущее количество использований
    is_active BOOLEAN DEFAULT true,              -- Активен ли промокод
    expires_at TIMESTAMP,                        -- Срок действия (null = бессрочно)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для промокодов
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_owner ON promo_codes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = true;

-- ============================================================
-- Часть 2: Новые колонки в users для отслеживания бонуса
-- ============================================================

-- Флаг получения реферального бонуса (первый депозит >= $100)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_bonus_received BOOLEAN DEFAULT false;

-- Дата активации реферала (когда получил бонус)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_activated_at TIMESTAMP;

-- Связь с использованным промокодом
ALTER TABLE users
ADD COLUMN IF NOT EXISTS activated_promo_code_id INTEGER REFERENCES promo_codes(id);

-- Индекс для быстрого поиска неактивированных рефералов
CREATE INDEX IF NOT EXISTS idx_users_referral_not_activated
ON users(referred_by_user_id)
WHERE referred_by_user_id IS NOT NULL AND referral_bonus_received = false;

-- ============================================================
-- Часть 3: Комментарии к таблицам
-- ============================================================

COMMENT ON TABLE promo_codes IS 'Промокоды для реферальных бонусов при первом депозите';
COMMENT ON COLUMN promo_codes.code IS 'Уникальный код промокода (регистронезависимый)';
COMMENT ON COLUMN promo_codes.owner_user_id IS 'Владелец промокода - получает partner_reward при использовании';
COMMENT ON COLUMN promo_codes.bonus_amount IS 'Сумма бонуса для нового пользователя (по умолчанию $100)';
COMMENT ON COLUMN promo_codes.partner_reward IS 'Сумма награды для владельца промокода (по умолчанию $50)';
COMMENT ON COLUMN promo_codes.min_deposit IS 'Минимальный депозит для активации промокода (по умолчанию $100)';
COMMENT ON COLUMN promo_codes.max_uses IS '0 = без ограничений, иначе максимальное количество использований';

COMMENT ON COLUMN users.referral_bonus_received IS 'TRUE если пользователь уже получил реферальный бонус (одноразово)';
COMMENT ON COLUMN users.referral_activated_at IS 'Дата и время получения реферального бонуса';
COMMENT ON COLUMN users.activated_promo_code_id IS 'ID промокода, который использовал пользователь (если был)';

COMMIT;
