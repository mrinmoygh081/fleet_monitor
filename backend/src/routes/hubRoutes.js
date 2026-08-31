const express = require('express');
const hubController = require('../controllers/hubController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', hubController.list);
router.get('/:id', hubController.getById);
router.post('/', hubController.create);
router.put('/:id', hubController.update);
router.delete('/:id', hubController.remove);

module.exports = router;
