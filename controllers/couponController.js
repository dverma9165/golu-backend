const Coupon = require('../models/Coupon');
const Order = require('../models/Order');

// Create a new coupon
exports.createCoupon = async (req, res) => {
    try {
        const { code, discountPercent } = req.body;

        if (!code || !discountPercent) {
            return res.status(400).json({ msg: 'Please provide code and discount percent' });
        }

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ msg: 'Coupon code already exists' });
        }

        const newCoupon = new Coupon({
            code: code.toUpperCase(),
            discountPercent
        });

        await newCoupon.save();
        res.status(201).json(newCoupon);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Get all coupons (Admin)
exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Delete a coupon
exports.deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Coupon removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Validate a coupon (Public/User)
exports.validateCoupon = async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ msg: 'No code provided' });
        }

        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ msg: 'Invalid Coupon Code' });
        }

        // Check if user has already used this coupon (Single Use Policy)
        // Since we added auth middleware, req.user should be available
        if (req.user) {
            const usedCoupon = await Order.findOne({
                user: req.user.id,
                couponCode: coupon.code,
                status: 'Approved' // Only count successful orders
            });

            if (usedCoupon) {
                return res.status(400).json({ msg: 'You have already used this coupon.' });
            }
        }

        res.json({
            valid: true,
            code: coupon.code,
            discountPercent: coupon.discountPercent,
            msg: `Coupon Applied! ${coupon.discountPercent}% Off`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};
