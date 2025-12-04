const pool = require('../config/database');

class Project {
  static async getAll(userId, limit, offset) {
    const result = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async count(userId) {
    const result = await pool.query('SELECT COUNT(*) FROM projects WHERE user_id = $1', [userId]);
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(id, userId) {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [
      id,
      userId
    ]);
    return result.rows[0];
  }

  static async create(userId, name, description) {
    const result = await pool.query(
      'INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, description]
    );
    return result.rows[0];
  }

  static async update(id, userId, data) {
    const result = await pool.query(
      'UPDATE projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [data.name, data.description, id, userId]
    );
    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  static async getLinks(projectId, userId) {
    const result = await pool.query(
      `SELECT pl.* FROM project_links pl
       JOIN projects p ON pl.project_id = p.id
       WHERE pl.project_id = $1 AND p.user_id = $2
       ORDER BY pl.created_at DESC`,
      [projectId, userId]
    );
    return result.rows;
  }

  static async addLink(projectId, userId, url, anchorText) {
    const result = await pool.query(
      `INSERT INTO project_links (project_id, url, anchor_text)
       SELECT $1, $2, $3
       WHERE EXISTS (SELECT 1 FROM projects WHERE id = $1 AND user_id = $4)
       RETURNING *`,
      [projectId, url, anchorText, userId]
    );
    return result.rows[0];
  }
}

module.exports = Project;
