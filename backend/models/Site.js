const pool = require('../config/database');

class Site {
  static async getAll(userId, limit, offset) {
    const result = await pool.query(
      'SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async count(userId) {
    const result = await pool.query('SELECT COUNT(*) FROM sites WHERE user_id = $1', [userId]);
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(id, userId) {
    const result = await pool.query('SELECT * FROM sites WHERE id = $1 AND user_id = $2', [
      id,
      userId
    ]);
    return result.rows[0];
  }

  static async create(userId, data) {
    const result = await pool.query(
      `INSERT INTO sites (user_id, name, url, api_key, max_links, max_articles)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, data.name, data.url, data.api_key, data.max_links, data.max_articles]
    );
    return result.rows[0];
  }

  static async update(id, userId, data) {
    const result = await pool.query(
      `UPDATE sites SET
         name = COALESCE($1, name),
         url = COALESCE($2, url),
         api_key = COALESCE($3, api_key),
         max_links = COALESCE($4, max_links),
         max_articles = COALESCE($5, max_articles),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [data.name, data.url, data.api_key, data.max_links, data.max_articles, id, userId]
    );
    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }
}

module.exports = Site;
