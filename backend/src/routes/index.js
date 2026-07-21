const { Router } = require('express');
const { QueryController } = require('../controllers/QueryController');

function createRouter(provider) {
  const router = Router();
  const controller = new QueryController(provider);

  router.get('/health', controller.health);
  router.get('/schema', controller.getSchema);
  router.post('/execute-query', controller.executeQuery);

  return router;
}

module.exports = { createRouter };
