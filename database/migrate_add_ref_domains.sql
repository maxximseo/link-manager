-- Add ref_domains, rd_main, norm columns
-- ref_domains: количество ссылающихся доменов по Ahrefs
-- rd_main: количество доменов ведущих на главную страницу
-- norm: количество Norm ссылок

ALTER TABLE sites ADD COLUMN IF NOT EXISTS ref_domains INTEGER DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rd_main INTEGER DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS norm INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sites_ref_domains ON sites(ref_domains);
CREATE INDEX IF NOT EXISTS idx_sites_rd_main ON sites(rd_main);
CREATE INDEX IF NOT EXISTS idx_sites_norm ON sites(norm);
