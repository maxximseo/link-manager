-- Migration: Update Discount Tier Thresholds
-- Purpose: Change discount tier minimum spending requirements
-- Date: 2025-01-13
--
-- Changes:
--   Bronze: $800 → $1000 (10% discount)
--   Silver: $1200 → $2000 (15% discount)
--   Gold: $1600 → $3000 (20% discount)
--   Platinum: $2000 → $5000 (25% discount)
--   Diamond: $2400 → $10000 (30% discount)
--
-- Impact: Users with $800-999 total_spent will lose Bronze (10%) discount

BEGIN;

-- Step 1: Delete old discount tiers
DELETE FROM discount_tiers WHERE min_spent > 0;

-- Step 2: Insert new discount tiers with updated thresholds
INSERT INTO discount_tiers (min_spent, discount_percentage, tier_name) VALUES
(0, 0, 'Стандарт'),
(1000, 10, 'Bronze'),
(2000, 15, 'Silver'),
(3000, 20, 'Gold'),
(5000, 25, 'Platinum'),
(10000, 30, 'Diamond')
ON CONFLICT (min_spent) DO UPDATE SET
  discount_percentage = EXCLUDED.discount_percentage,
  tier_name = EXCLUDED.tier_name;

-- Step 3: Recalculate all users' current_discount based on new tiers
-- This uses a subquery to find the highest tier each user qualifies for
UPDATE users
SET current_discount = (
  SELECT COALESCE(MAX(dt.discount_percentage), 0)
  FROM discount_tiers dt
  WHERE dt.min_spent <= users.total_spent
)
WHERE users.id IS NOT NULL;

-- Step 4: Add comment for documentation
COMMENT ON TABLE discount_tiers IS 'Discount tier thresholds. Updated 2025-11-14: Bronze $1000, Silver $2000, Gold $3000, Platinum $5000, Diamond $10000';

COMMIT;

-- Verification queries (uncomment to test):
-- SELECT * FROM discount_tiers ORDER BY min_spent;
-- SELECT id, username, total_spent, current_discount FROM users WHERE total_spent > 0 ORDER BY total_spent DESC;
