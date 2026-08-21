const express = require('express');
const trackingController = require('../controllers/trackingController');

const router = express.Router();







router.post('/', trackingController.ingest);




router.post('/emergency', trackingController.emergency);

module.exports = router;
