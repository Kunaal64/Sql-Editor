class QueryController {
  constructor(service) {
    this.service = service;

    this.health = this.health.bind(this);
    this.getSchema = this.getSchema.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
  }

  health(_req, res) {
    console.log('[Controller] health check');
    res.json({ status: 'ok' });
  }

  async getSchema(_req, res) {
    console.log('[Controller] fetching schema');
    try {
      const schema = await this.service.getSchema();
      console.log(`[Controller] schema returned ${schema.tables?.length || 0} tables`);
      res.json(schema);
    } catch (err) {
      console.error('[Controller] schema failed:', err.message);
      res.status(500).json(this.toApiError(err));
    }
  }

  async executeQuery(req, res) {
    const { sql } = req.body;
    console.log(`[Controller] executeQuery received sql="${sql}"`);

    if (!sql || typeof sql !== 'string') {
      console.warn('[Controller] executeQuery rejected: missing or invalid sql field');
      return res.status(400).json({
        code: 'SYNTAX_ERROR',
        message: 'Missing or invalid "sql" field',
      });
    }

    try {
      const result = await this.service.execute(sql);
      console.log(`[Controller] executeQuery succeeded, rows=${Array.isArray(result) ? result.length : '-'}`);
      res.json(result);
    } catch (err) {
      const apiError = this.toApiError(err);
      const status = this.statusForCode(apiError.code);
      console.error(`[Controller] executeQuery failed: [${apiError.code}] ${apiError.message}`);
      res.status(status).json(apiError);
    }
  }

  toApiError(err) {
    if (err instanceof Error && 'code' in err) {
      return {
        code: err.code,
        message: err.message,
      };
    }

    if (err instanceof Error) {
      return {
        code: 'INTERNAL_ERROR',
        message: err.message,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  statusForCode(code) {
    switch (code) {
      case 'SYNTAX_ERROR':
      case 'UNSUPPORTED_SQL':
        return 400;
      case 'UNKNOWN_TABLE':
        return 404;
      default:
        return 500;
    }
  }
}

module.exports = { QueryController };
