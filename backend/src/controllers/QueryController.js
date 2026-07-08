class QueryController {
  constructor(service) {
    this.service = service;

    this.health = this.health.bind(this);
    this.getSchema = this.getSchema.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
  }

  health(_req, res) {
    res.json({ status: 'ok' });
  }

  async getSchema(_req, res) {
    try {
      const schema = await this.service.getSchema();
      res.json(schema);
    } catch (err) {
      res.status(500).json(this.toApiError(err));
    }
  }

  async executeQuery(req, res) {
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({
        code: 'SYNTAX_ERROR',
        message: 'Missing or invalid "sql" field',
      });
    }

    try {
      const result = await this.service.execute(sql);
      res.json(result);
    } catch (err) {
      const apiError = this.toApiError(err);
      const status = this.statusForCode(apiError.code);
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
