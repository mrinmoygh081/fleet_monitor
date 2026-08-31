const express = require('express');
const routeController = require('../controllers/routeController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

router.post('/search', routeController.searchRoutes);

router.get('/stoppages', routeController.getStoppagesByCoordinates);
router.post('/stoppages', routeController.getStoppagesByCoordinates);

router.get('/:id/hubs', routeController.getHubs);
router.get('/:id/stoppages', routeController.getStoppages);
router.get('/:id', routeController.getById);

module.exports = router;
