const { PAGINATION } = require('../config/constants');

class BaseService {
  constructor(Model, entityName) {
    this.Model = Model;
    this.entityName = entityName;
  }

  async getAll(userId, page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, filters = {}) {
    const offset = (page - 1) * limit;
    const validLimit = Math.min(limit, PAGINATION.MAX_LIMIT);

    const data = await this.Model.getAll(userId, validLimit, offset);
    const total = await this.Model.count(userId);

    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit)
      }
    };
  }

  async getById(id, userId) {
    const entity = await this.Model.findById(id, userId);
    if (!entity) {
      throw { status: 404, message: `${this.entityName} not found`, isOperational: true };
    }
    return entity;
  }

  async create(userId, data) {
    return await this.Model.create(userId, data);
  }

  async update(id, userId, data) {
    const entity = await this.Model.update(id, userId, data);
    if (!entity) {
      throw { status: 404, message: `${this.entityName} not found`, isOperational: true };
    }
    return entity;
  }

  async delete(id, userId) {
    const entity = await this.Model.delete(id, userId);
    if (!entity) {
      throw { status: 404, message: `${this.entityName} not found`, isOperational: true };
    }
    return entity;
  }
}

module.exports = BaseService;
