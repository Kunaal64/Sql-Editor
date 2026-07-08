class QueryExecutionService {
  constructor(provider) {
    this.provider = provider;
  }

  async execute(sql) {
    console.log(`[Service] executing SQL: ${sql}`);
    const result = await this.provider.execute(sql);
    console.log('[Service] SQL execution complete');
    return result;
  }

  async getSchema() {
    console.log('[Service] loading schema');
    const schema = await this.provider.getSchema();
    console.log('[Service] schema loaded');
    return schema;
  }
}

module.exports = { QueryExecutionService };
