const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    utr: {
        type: String,
        required: false // Made optional for online payments (or filled with paymentId)
    },
    amount: {
        type: Number,
        required: true
    },
    paymentScreenshot: {
        id: String,
        viewLink: String,
        downloadLink: String,
        mimeType: String
    },
    // Coupon Details
    couponCode: { type: String },
    discountAmount: { type: Number, default: 0 },

    // Razorpay Fields
    // Razorpay Fields
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    status: {
        type: String,
        default: 'Pending',
        enum: ['Pending', 'Approved', 'Rejected']
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    approvedAt: {
        type: Date
    }
});

module.exports = mongoose.model('Order', OrderSchema);
