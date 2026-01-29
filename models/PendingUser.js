const mongoose = require('mongoose');

const PendingUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true }, // Hashed
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // Auto-delete after 10 mins (600 seconds)
});

module.exports = mongoose.model('PendingUser', PendingUserSchema);
