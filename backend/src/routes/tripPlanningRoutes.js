const express = require('express');
const tripPlanningController = require('../controllers/tripPlanningController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);


router.post('/', tripPlanningController.sync);

router.get('/', tripPlanningController.list);
router.get('/:id', tripPlanningController.getById);

router.post('/sync', tripPlanningController.sync);



router.put('/:id/assign-vehicle', tripPlanningController.assignVehicle);
router.post('/:id/assign-vehicle', tripPlanningController.assignVehicle);
router.delete('/:id', tripPlanningController.remove);

module.exports = router;
