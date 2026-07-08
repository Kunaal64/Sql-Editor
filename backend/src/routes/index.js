const { Router } = require('express');
const { QueryController } = require('../controllers/QueryController');
const { QueryExecutionService } = require('../services/QueryExecutionService');
const { InMemoryDataProvider } = require('../providers/InMemoryDataProvider');

function createRouter() {
  const router = Router();
  const provider = new InMemoryDataProvider();
  const service = new QueryExecutionService(provider);
  const controller = new QueryController(service);

  router.get('/health', controller.health);
  router.get('/schema', controller.getSchema);
  router.post('/execute-query', controller.executeQuery);

  return router;
}

module.exports = { createRouter };
