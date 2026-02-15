const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const auth = require('../middleware/auth');

// Public: Validate Coupon (Now potentially protected if we enforce single use, but let's see)
// To enforce one-time use, we need to know the user. So we should add auth.
router.post('/validate', auth, couponController.validateCoupon);

// Admin: Create Coupon (Need admin auth middleware or simple password check)
// For simplicity, using same header check as other admin routes in controller or middleware
// Ideally, add admin middleware. For now, we'll strip auth here and handle in controller or add custom middleware inline.

const adminCheck = (req, res, next) => {
    const adminPassword = req.header('x-admin-password');
    if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    next();
};

router.post('/', adminCheck, couponController.createCoupon);
router.get('/', adminCheck, couponController.getAllCoupons);
router.delete('/:id', adminCheck, couponController.deleteCoupon);

module.exports = router;
