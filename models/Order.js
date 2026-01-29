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
        required: true
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
