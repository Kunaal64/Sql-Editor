class QueryExecutionService {
  constructor(provider) {
    this.provider = provider;
  }

  async execute(sql) {
    return this.provider.execute(sql);
  }

  async getSchema() {
    return this.provider.getSchema();
  }
}

module.exports = { QueryExecutionService };
