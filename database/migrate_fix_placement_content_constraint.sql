-- Migration: Add CHECK constraint to placement_content
-- Date: 2025-01-13
-- Description: Ensures placement_content has either link_id OR article_id, but not both or neither

BEGIN;

-- Add CHECK constraint to ensure at least one content type is present
ALTER TABLE placement_content
ADD CONSTRAINT check_placement_content_has_content
CHECK (
  (link_id IS NOT NULL AND article_id IS NULL) OR
  (link_id IS NULL AND article_id IS NOT NULL)
);

-- Verify no existing records violate the constraint
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM placement_content
    WHERE (link_id IS NULL AND article_id IS NULL)
       OR (link_id IS NOT NULL AND article_id IS NOT NULL);

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Found % invalid placement_content records. Fix data before applying constraint.', invalid_count;
    END IF;

    RAISE NOTICE 'All placement_content records are valid. Constraint applied successfully.';
END $$;

COMMIT;
