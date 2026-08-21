const express = require('express');
const tripController = require('../controllers/tripController');
const trackingController = require('../controllers/trackingController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

router.post('/', tripController.create);
router.get('/', tripController.list);
router.get('/:id', tripController.getById);




router.post('/:id/save', tripController.save);
router.post('/:id/start', tripController.start);
router.post('/:id/complete', tripController.complete);
router.post('/:id/cancel', tripController.cancel);




router.get('/:id/current-location', trackingController.currentLocation);

module.exports = router;
