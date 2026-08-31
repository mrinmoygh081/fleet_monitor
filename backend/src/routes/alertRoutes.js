const express = require('express');
const alertController = require('../controllers/alertController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);


router.get('/', alertController.list);

router.get('/:id', alertController.getById);
router.post('/:id/resolve', alertController.resolve);
router.post('/:id/wrong', alertController.markWrong);

module.exports = router;



