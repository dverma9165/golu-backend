const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
    endpoint: {
        type: String,
        required: true,
        unique: true
    },
    keys: {
        p256dh: {
            type: String,
            required: true
        },
        auth: {
            type: String,
            required: true
        }
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
