-- Migration: Add site_endpoint_updates table for bulk endpoint migration
-- Version: 2.6.0
-- Date: 2025-12-26

-- Create table for storing endpoint update requests per site
CREATE TABLE IF NOT EXISTS site_endpoint_updates (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    new_endpoint VARCHAR(500) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    CONSTRAINT unique_site_endpoint_update UNIQUE (site_id)
);

-- Index for faster status lookups
CREATE INDEX IF NOT EXISTS idx_endpoint_updates_status ON site_endpoint_updates(status);

-- Index for site lookups
CREATE INDEX IF NOT EXISTS idx_endpoint_updates_site_id ON site_endpoint_updates(site_id);

-- Comment
COMMENT ON TABLE site_endpoint_updates IS 'Stores pending API endpoint updates to be pushed to WordPress plugins';
COMMENT ON COLUMN site_endpoint_updates.status IS 'pending = waiting for plugin to fetch, confirmed = plugin updated successfully';
