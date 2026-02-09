const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (req, res) => {
    try {
        const { productId, cartItems, couponCode } = req.body;
        const userId = req.user.id;

        let totalAmount = 0;
        let productIds = [];
        let discountAmount = 0;

        // 1. Calculate Total Amount
        if (cartItems && cartItems.length > 0) {
            // Bulk Order
            if (Array.isArray(cartItems)) {
                productIds = cartItems;
            } else if (typeof cartItems === 'string') {
                try {
                    productIds = JSON.parse(cartItems);
                } catch (e) {
                    return res.status(400).json({ msg: 'Invalid cartItems format' });
                }
            }

            const products = await Product.find({ _id: { $in: productIds } });
            if (products.length === 0) return res.status(400).json({ msg: 'No valid products found' });

            totalAmount = products.reduce((sum, p) => {
                const effectivePrice = (p.salePrice && p.salePrice < p.price) ? p.salePrice : p.price;
                return sum + (effectivePrice || 0);
            }, 0);

            // Check if user already bought ANY of these
            const existingOrders = await Order.find({
                user: userId,
                product: { $in: productIds },
                status: 'Approved'
            });

            if (existingOrders.length > 0) {
                return res.status(400).json({ msg: 'You have already purchased some of these products.' });
            }

        } else if (productId) {
            // Fallback to Single Order
            const product = await Product.findById(productId);
            if (!product) return res.status(404).json({ msg: 'Product not found' });

            const effectivePrice = (product.salePrice && product.salePrice < product.price) ? product.salePrice : product.price;
            totalAmount = effectivePrice || 0;
            productIds = [productId];

            // Check if user already bought THIS product
            const existingOrder = await Order.findOne({
                user: userId,
                product: productId,
                status: 'Approved'
            });

            if (existingOrder) {
                return res.status(400).json({ msg: 'You have already purchased this product.' });
            }
        } else {
            return res.status(400).json({ msg: 'No product or cart items provided' });
        }

        if (totalAmount === 0) {
            return res.status(400).json({ msg: 'Total amount cannot be 0' });
        }

        // 2. Apply Coupon Logic
        if (couponCode === 'DIKSHA99') {
            discountAmount = Math.round(totalAmount * 0.25); // 25% Discount
            totalAmount = totalAmount - discountAmount;
        }

        if (totalAmount < 1) totalAmount = 1; // Minimum for Razorpay

        // 3. Create Razorpay Order
        const options = {
            amount: totalAmount * 100, // Amount in paise
            currency: "INR",
            receipt: `receipt_order_${Date.now()}`,
            notes: {
                userId: userId,
                productIds: JSON.stringify(productIds),
                couponCode: couponCode || '',
                discountAmount: discountAmount || 0
            }
        };

        const order = await razorpay.orders.create(options);

        if (!order) return res.status(500).send("Some error occured");

        res.json(order);

    } catch (err) {
        console.error("Create Order Error:", err);
        res.status(500).send(err.message);
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            customerName // Optional context from frontend
        } = req.body;

        const userId = req.user.id;

        // 1. Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // 2. Initializing Success - Create Orders in DB

            // a. Fetch Order Details from Razorpay (to get notes/products)
            // or we can insist frontend sends products. 
            // Better: use the notes we attached in createOrder.
            const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
            if (!rzpOrder) return res.status(400).json({ msg: 'Invalid Razorpay Order' });

            const productIds = JSON.parse(rzpOrder.notes.productIds);
            const couponCode = rzpOrder.notes.couponCode;
            const discountAmount = Number(rzpOrder.notes.discountAmount) || 0;

            const products = await Product.find({ _id: { $in: productIds } });

            const createdOrders = [];

            for (const product of products) {
                // Check if already exists (idempotency)
                const existingOrder = await Order.findOne({
                    razorpayOrderId: razorpay_order_id,
                    product: product._id
                });

                if (existingOrder) {
                    createdOrders.push(existingOrder);
                    continue;
                }

                const effectivePrice = (product.salePrice && product.salePrice < product.price) ? product.salePrice : product.price;

                const newOrder = new Order({
                    user: userId,
                    product: product._id,
                    customerName: customerName || 'Razorpay User',
                    amount: effectivePrice, // Original price (or sale price) of individual item
                    discountAmount: 0, // We might need to distribute discount, or just store total discount on one?
                    // Simpler: Just store the fact that a coupon was used on the order entry. 
                    // Since specific discount amount is global, we can perhaps store 0 here or distribute it.
                    // Let's just store the coupon code for record.
                    couponCode: couponCode,
                    // Optional: If we want to track precise effective paid per item, we'd distribute the discount.
                    // For now, let's leave amount as the product price and maybe add a 'paidAmount' field? 
                    // Or just accept that 'amount' is list price and we look at Razorpay payment for total paid.
                    // Let's keep it simple: just track coupon.

                    status: 'Approved', // Auto-Approve!
                    approvedAt: Date.now(),
                    razorpayOrderId: razorpay_order_id,
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    utr: `RZP-${razorpay_payment_id}` // Stores Rzp Payment ID as UTR for reference
                });

                await newOrder.save();
                createdOrders.push(newOrder);
            }

            // 3. Post-Order Actions (Clear Cart, Notify)
            // Clear bought items from cart
            const user = await User.findById(userId);
            if (user) {
                user.cart = user.cart.filter(item => !productIds.includes(item.product.toString()));
                await user.save();
            }

            // Notifications
            notificationService.sendToAdmins({
                title: 'New Online Order Received',
                body: `Payment of ₹${rzpOrder.amount / 100} received via Razorpay.`,
                url: `${process.env.CLIENT_URL}/admin`
            });

            try {
                // Send email to user
                // Note: We might want to send one email for bulk, or individual.
                // Current emailService might need update or we reuse existing loop.
                for (const order of createdOrders) {
                    const productDetails = products.find(p => p._id.toString() === order.product.toString());
                    if (productDetails) {
                        await emailService.sendOrderNotification(order, productDetails, customerName || user.name, newOrder.utr);
                    }
                }
            } catch (emailErr) {
                console.error('Failed to send email:', emailErr);
            }


            res.json({
                msg: "Payment Successful. Orders Placed.",
                orderIds: createdOrders.map(o => o._id)
            });

        } else {
            res.status(400).json({ msg: "Payment Verification Failed: Invalid Signature" });
        }

    } catch (err) {
        console.error("Verify Payment Error:", err);
        res.status(500).send("Server Error");
    }
};
