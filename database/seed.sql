-- Admin user (password: admin123, bcrypt hash with 10 rounds)
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'admin@example.com', '$2b$10$YourBcryptHashHere', 'admin');

-- Projects
INSERT INTO projects (user_id, name, description) VALUES
(1, 'SEO Project Alpha', 'Main SEO campaign'),
(1, 'Link Building Beta', 'Secondary campaign');

-- Sites
INSERT INTO sites (user_id, name, url, api_key, max_links, used_links, max_articles, used_articles) VALUES
(1, 'Site A', 'https://example-a.com', 'api_abc123def456', 10, 2, 5, 1),
(1, 'Site B', 'https://example-b.com', 'api_xyz789ghi012', 15, 0, 10, 0);

-- Links
INSERT INTO project_links (project_id, url, anchor_text) VALUES
(1, 'https://target1.com/page1', 'Best SEO Tools'),
(1, 'https://target2.com/page2', 'Marketing Guide'),
(2, 'https://target3.com/page3', 'Link Building Tips');

-- Articles
INSERT INTO project_articles (project_id, title, content) VALUES
(1, 'Top 10 SEO Strategies', '<h2>SEO Strategies</h2><p>Content here...</p>'),
(2, 'Link Building Guide', '<h2>Link Building</h2><p>Content here...</p>');

-- Placements
INSERT INTO placements (user_id, project_id, site_id, type) VALUES
(1, 1, 1, 'manual'),
(1, 2, 1, 'wordpress');

-- Placement content (linking placements to links/articles)
INSERT INTO placement_content (placement_id, link_id, article_id) VALUES
(1, 1, NULL),
(1, NULL, 1);
