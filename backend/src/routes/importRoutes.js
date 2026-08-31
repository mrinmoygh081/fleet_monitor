const express = require('express');
const multer = require('multer');
const importController = require('../controllers/importController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only .xlsx or .xls files are accepted.'));
    }
    cb(null, true);
  },
});

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/:entity/sample', importController.downloadSampleTemplate);
router.post('/:entity', upload.single('file'), importController.importExcel);

module.exports = router;
