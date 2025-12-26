-- 1. users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. projects
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. sites
CREATE TABLE sites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    site_name VARCHAR(255) NOT NULL,
    site_url VARCHAR(500) NOT NULL,
    site_type VARCHAR(20) DEFAULT 'wordpress',
    api_key VARCHAR(100),
    allow_articles BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT FALSE,
    available_for_purchase BOOLEAN DEFAULT TRUE,
    max_links INTEGER DEFAULT 10,
    used_links INTEGER DEFAULT 0,
    max_articles INTEGER DEFAULT 5,
    used_articles INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. project_links
CREATE TABLE project_links (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    anchor_text VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. project_articles
CREATE TABLE project_articles (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. placements
CREATE TABLE placements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    wordpress_post_id INTEGER,
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_publish_date TIMESTAMP,
    published_at TIMESTAMP,
    expires_at TIMESTAMP,
    original_price NUMERIC(10, 2),
    discount_applied INTEGER DEFAULT 0,
    final_price NUMERIC(10, 2),
    auto_renewal BOOLEAN DEFAULT FALSE,
    renewal_price NUMERIC(10, 2),
    last_renewed_at TIMESTAMP,
    renewal_count INTEGER DEFAULT 0,
    purchase_transaction_id INTEGER REFERENCES transactions(id)
);

-- 7. placement_content
CREATE TABLE placement_content (
    id SERIAL PRIMARY KEY,
    placement_id INTEGER REFERENCES placements(id) ON DELETE CASCADE,
    link_id INTEGER REFERENCES project_links(id) ON DELETE CASCADE,
    article_id INTEGER REFERENCES project_articles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. site_endpoint_updates (for bulk API endpoint migration)
CREATE TABLE site_endpoint_updates (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    new_endpoint VARCHAR(500) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    CONSTRAINT unique_site_endpoint_update UNIQUE (site_id)
);

-- Indexes
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_sites_user ON sites(user_id);
CREATE INDEX idx_sites_visibility ON sites(is_public, user_id);
CREATE INDEX idx_placements_user ON placements(user_id);
CREATE INDEX idx_placements_project ON placements(project_id);
CREATE INDEX idx_placements_site ON placements(site_id);
CREATE INDEX idx_project_links_project ON project_links(project_id);
CREATE INDEX idx_project_articles_project ON project_articles(project_id);
CREATE INDEX idx_placement_content_placement ON placement_content(placement_id);
CREATE INDEX idx_placement_content_link_id ON placement_content(link_id) WHERE link_id IS NOT NULL;
CREATE INDEX idx_placement_content_article_id ON placement_content(article_id) WHERE article_id IS NOT NULL;
