class QueryController {
  constructor(provider) {
    this.provider = provider;

    this.health = this.health.bind(this);
    this.getSchema = this.getSchema.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
  }

  health(_req, res) {
    res.json({ status: 'ok' });
  }

  async getSchema(_req, res) {
    try {
      const schema = await this.provider.getSchema();
      res.json(schema);
    } catch (err) {
      console.error('[Controller] schema failed:', err.message);
      res.status(500).json(this.toApiError(err));
    }
  }

  async executeQuery(req, res) {
    const { sql, page, pageSize, includeTotalRows } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        code: 'SYNTAX_ERROR',
        message: 'Missing or invalid "sql" field',
      });
    }

    const options = this.buildExecutionOptions(page, pageSize, includeTotalRows);

    try {
      const result = await this.provider.execute(sql, options);
      res.json(result);
    } catch (err) {
      const apiError = this.toApiError(err);
      const status = this.statusForCode(apiError.code);
      console.error(`[Controller] executeQuery failed: [${apiError.code}] ${apiError.message}`);
      res.status(status).json(apiError);
    }
  }

  buildExecutionOptions(page, pageSize, includeTotalRows) {
    const parsedPage = Number.isFinite(Number(page)) ? Number(page) : undefined;
    const parsedPageSize = Number.isFinite(Number(pageSize))
      ? Number(pageSize)
      : undefined;

    const options = {};

    if (parsedPage != null && parsedPageSize != null) {
      const maxPageSize = Number(process.env.MAX_PAGE_SIZE) || 5000;
      options.page = Math.max(0, Math.floor(parsedPage));
      options.pageSize = Math.max(1, Math.min(maxPageSize, Math.floor(parsedPageSize)));
    }

    if (typeof includeTotalRows === 'boolean') {
      options.includeTotalRows = includeTotalRows;
    }

    return options;
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
