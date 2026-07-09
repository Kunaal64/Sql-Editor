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
    const { sql, page, pageSize } = req.body;
    console.log(`[Controller] executeQuery received sql="${sql}" page=${page} pageSize=${pageSize}`);

    if (!sql || typeof sql !== 'string') {
      console.warn('[Controller] executeQuery rejected: missing or invalid sql field');
      return res.status(400).json({
        code: 'SYNTAX_ERROR',
        message: 'Missing or invalid "sql" field',
      });
    }

    const paginationOptions = this.parsePagination(page, pageSize);

    try {
      const result = await this.service.execute(sql, paginationOptions);
      console.log(`[Controller] executeQuery succeeded, rows=${result.rowCount}/${result.totalRowCount}`);
      res.json(result);
    } catch (err) {
      const apiError = this.toApiError(err);
      const status = this.statusForCode(apiError.code);
      console.error(`[Controller] executeQuery failed: [${apiError.code}] ${apiError.message}`);
      res.status(status).json(apiError);
    }
  }

  parsePagination(page, pageSize) {
    const parsedPage = Number.isFinite(Number(page)) ? Number(page) : undefined;
    const parsedPageSize = Number.isFinite(Number(pageSize)) ? Number(pageSize) : undefined;

    if (parsedPage == null || parsedPageSize == null) {
      return {};
    }

    const maxPageSize = Number(process.env.MAX_PAGE_SIZE) || 5000;
    const safePage = Math.max(0, Math.floor(parsedPage));
    const safePageSize = Math.max(1, Math.min(maxPageSize, Math.floor(parsedPageSize)));

    return { page: safePage, pageSize: safePageSize };
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
