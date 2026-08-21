const express = require('express');
const placeController = require('../controllers/placeController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

router.get('/search', placeController.search);
router.get('/types', placeController.listTypes);
router.get('/', placeController.list);
router.post('/', placeController.create);
router.put('/:id', placeController.update);
router.delete('/:id', placeController.remove);

module.exports = router;
