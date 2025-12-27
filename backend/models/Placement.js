const pool = require('../config/database');

class Placement {
  static async getAll(userId, limit, offset) {
    const result = await pool.query(
      `SELECT p.*, pr.name as project_name, s.site_name, s.site_url
       FROM placements p
       JOIN projects pr ON p.project_id = pr.id
       JOIN sites s ON p.site_id = s.id
       WHERE p.user_id = $1
       ORDER BY p.placed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async count(userId) {
    const result = await pool.query('SELECT COUNT(*) FROM placements WHERE user_id = $1', [userId]);
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(id, userId) {
    const result = await pool.query('SELECT * FROM placements WHERE id = $1 AND user_id = $2', [
      id,
      userId
    ]);
    return result.rows[0];
  }

  static async create(userId, projectId, siteId, type) {
    const result = await pool.query(
      'INSERT INTO placements (user_id, project_id, site_id, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, projectId, siteId, type]
    );
    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM placements WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  static async incrementSiteUsage(siteId, linkCount, articleCount) {
    await pool.query(
      'UPDATE sites SET used_links = used_links + $1, used_articles = used_articles + $2 WHERE id = $3',
      [linkCount, articleCount, siteId]
    );
  }

  static async decrementSiteUsage(siteId, linkCount, articleCount) {
    await pool.query(
      'UPDATE sites SET used_links = used_links - $1, used_articles = used_articles - $2 WHERE id = $3',
      [linkCount, articleCount, siteId]
    );
  }

  static async checkQuotas(siteId, linkCount, articleCount) {
    const result = await pool.query(
      'SELECT max_links, used_links, max_articles, used_articles FROM sites WHERE id = $1',
      [siteId]
    );
    const site = result.rows[0];

    if (!site) return { allowed: false, error: 'Site not found' };

    const linksAvailable = site.max_links - site.used_links;
    const articlesAvailable = site.max_articles - site.used_articles;

    if (linkCount > linksAvailable) {
      return { allowed: false, error: `Only ${linksAvailable} link slots available` };
    }
    if (articleCount > articlesAvailable) {
      return { allowed: false, error: `Only ${articlesAvailable} article slots available` };
    }

    return { allowed: true };
  }
}

module.exports = Placement;
