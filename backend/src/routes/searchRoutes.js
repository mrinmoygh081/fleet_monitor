const express = require('express');
const searchController = require('../controllers/searchController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

router.get('/:entity', searchController.search);

module.exports = router;
