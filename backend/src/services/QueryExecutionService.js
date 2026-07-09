class QueryExecutionService {
  constructor(provider) {
    this.provider = provider;
  }

  async execute(sql, options = {}) {
    console.log(`[Service] executing SQL: ${sql}`, options);
    const result = await this.provider.execute(sql, options);
    console.log('[Service] SQL execution complete');
    return result;
  }

  async getSchema() {
    console.log('[Service] loading schema');
    const schema = await this.provider.getSchema();
    console.log(`[Service] schema loaded (${schema.tables.length} tables)`);
    return schema;
  }
}

module.exports = { QueryExecutionService };
