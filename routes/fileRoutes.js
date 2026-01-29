const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const multer = require('multer');
const auth = require('../middleware/auth');

// Memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const isAdmin = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(403).json({ msg: 'Unauthorized: Incorrect Admin Password' });
    }
};

// Handle Multiple Files
const uploadFields = upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'sourceFile', maxCount: 1 }
]);

// Admin Routes (Protected)
router.post('/upload', isAdmin, uploadFields, fileController.uploadProduct);
router.get('/orders', isAdmin, fileController.getOrders);
router.post('/approve', isAdmin, fileController.approveOrder);

// Authenticated Routes
router.post('/order', auth, upload.single('paymentScreenshot'), fileController.submitOrder);
router.get('/my-orders', auth, fileController.getMyOrders);
router.post('/download', auth, fileController.downloadPaid);

// Public Routes
router.get('/', fileController.getProducts);
router.get('/:id', fileController.getProductById);

module.exports = router;
