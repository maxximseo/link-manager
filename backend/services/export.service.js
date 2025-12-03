/**
 * Export service
 * Handles exporting placements and other data to CSV/JSON formats
 */

const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Convert array of objects to CSV format
 */
function arrayToCSV(data, headers) {
  if (data.length === 0) {
    return '';
  }

  // CSV header
  const csvHeaders = headers.join(',');

  // CSV rows
  const csvRows = data.map(row => {
    return headers
      .map(header => {
        const value = row[header];

        // Handle null/undefined
        if (value === null || value === undefined) {
          return '';
        }

        // Handle dates
        if (value instanceof Date) {
          return value.toISOString();
        }

        // Handle strings with commas or quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
      })
      .join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Export user placements to CSV or JSON
 * @param {number} userId - User ID
 * @param {string} format - Export format (csv or json)
 * @param {number|string} projectId - Optional project ID to filter by
 */
const exportUserPlacements = async (userId, format = 'csv', projectId = null) => {
  try {
    // Build WHERE clause with optional project filter
    let whereClause = 'WHERE p.user_id = $1';
    const params = [userId];

    if (projectId) {
      whereClause += ' AND p.project_id = $2';
      params.push(parseInt(projectId));
    }

    // Get placements for user (optionally filtered by project)
    const result = await query(
      `
      SELECT
        p.id,
        p.type,
        p.status,
        p.original_price,
        p.discount_applied,
        p.final_price,
        p.purchased_at,
        p.scheduled_publish_date,
        p.published_at,
        p.expires_at,
        p.auto_renewal,
        p.renewal_price,
        p.renewal_count,
        pr.name as project_name,
        s.site_name,
        s.site_url,
        s.dr as site_dr,
        s.da as site_da,
        s.tf as site_tf,
        s.cf as site_cf,
        s.ref_domains as site_ref_domains,
        s.rd_main as site_rd_main,
        s.norm as site_norm,
        s.keywords as site_keywords,
        s.traffic as site_traffic,
        s.geo as site_geo,
        (SELECT pl.anchor_text FROM placement_content pc
         LEFT JOIN project_links pl ON pc.link_id = pl.id
         WHERE pc.placement_id = p.id AND pc.link_id IS NOT NULL LIMIT 1) as link_anchor,
        (SELECT pl.url FROM placement_content pc
         LEFT JOIN project_links pl ON pc.link_id = pl.id
         WHERE pc.placement_id = p.id AND pc.link_id IS NOT NULL LIMIT 1) as link_url,
        (SELECT pa.title FROM placement_content pc
         LEFT JOIN project_articles pa ON pc.article_id = pa.id
         WHERE pc.placement_id = p.id AND pc.article_id IS NOT NULL LIMIT 1) as article_title
      FROM placements p
      JOIN projects pr ON p.project_id = pr.id
      JOIN sites s ON p.site_id = s.id
      ${whereClause}
      ORDER BY p.purchased_at DESC
    `,
      params
    );

    const placements = result.rows;

    if (format === 'csv') {
      const headers = [
        'id',
        'type',
        'status',
        'project_name',
        'site_name',
        'site_url',
        'site_dr',
        'site_da',
        'site_tf',
        'site_cf',
        'site_ref_domains',
        'site_rd_main',
        'site_norm',
        'site_keywords',
        'site_traffic',
        'site_geo',
        'link_anchor',
        'link_url',
        'article_title',
        'original_price',
        'discount_applied',
        'final_price',
        'purchased_at',
        'scheduled_publish_date',
        'published_at',
        'expires_at',
        'auto_renewal',
        'renewal_price',
        'renewal_count'
      ];

      const csv = arrayToCSV(placements, headers);
      return { format: 'csv', data: csv, filename: `placements-${userId}-${Date.now()}.csv` };
    } else {
      return {
        format: 'json',
        data: placements,
        filename: `placements-${userId}-${Date.now()}.json`
      };
    }
  } catch (error) {
    logger.error('Failed to export placements', { userId, format, error: error.message });
    throw error;
  }
};

/**
 * Export user transactions to CSV or JSON
 */
const exportUserTransactions = async (userId, format = 'csv') => {
  try {
    const result = await query(
      `
      SELECT
        id,
        type,
        amount,
        balance_before,
        balance_after,
        description,
        placement_id,
        created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
      [userId]
    );

    const transactions = result.rows;

    if (format === 'csv') {
      const headers = [
        'id',
        'type',
        'amount',
        'balance_before',
        'balance_after',
        'description',
        'placement_id',
        'created_at'
      ];

      const csv = arrayToCSV(transactions, headers);
      return { format: 'csv', data: csv, filename: `transactions-${userId}-${Date.now()}.csv` };
    } else {
      return {
        format: 'json',
        data: transactions,
        filename: `transactions-${userId}-${Date.now()}.json`
      };
    }
  } catch (error) {
    logger.error('Failed to export transactions', { userId, format, error: error.message });
    throw error;
  }
};

/**
 * Export admin revenue data to CSV or JSON
 */
const exportAdminRevenue = async (startDate, endDate, format = 'csv') => {
  try {
    const result = await query(
      `
      SELECT
        t.id,
        t.type,
        t.amount,
        t.created_at,
        u.username,
        u.email,
        p.id as placement_id,
        pr.name as project_name,
        s.site_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN placements p ON t.placement_id = p.id
      LEFT JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN sites s ON p.site_id = s.id
      WHERE t.type IN ('purchase', 'renewal', 'auto_renewal')
        AND t.created_at BETWEEN $1 AND $2
      ORDER BY t.created_at DESC
    `,
      [startDate, endDate]
    );

    const revenue = result.rows;

    if (format === 'csv') {
      const headers = [
        'id',
        'type',
        'amount',
        'created_at',
        'username',
        'email',
        'placement_id',
        'project_name',
        'site_name'
      ];

      const csv = arrayToCSV(revenue, headers);
      return { format: 'csv', data: csv, filename: `revenue-${Date.now()}.csv` };
    } else {
      return { format: 'json', data: revenue, filename: `revenue-${Date.now()}.json` };
    }
  } catch (error) {
    logger.error('Failed to export revenue', { startDate, endDate, format, error: error.message });
    throw error;
  }
};

module.exports = {
  exportUserPlacements,
  exportUserTransactions,
  exportAdminRevenue
};
