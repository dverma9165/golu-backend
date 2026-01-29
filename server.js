const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const auth = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug Logging
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Connect Database
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('MongoDB Connected'))
        .catch(err => console.log(err));
}

// --- INLINE AUTH ROUTES ---

const authController = require('./controllers/authController');

// Register
app.post('/api/auth/register', authController.register);

// Verify OTP
app.post('/api/auth/verify-otp', authController.verifyOtp);

// Login
app.post('/api/auth/login', authController.login);

// Cart Routes (Inline)
// Cart Routes
app.post('/api/auth/cart', auth, authController.addToCart);
app.get('/api/auth/cart', auth, authController.getCart);

// File Routes
try {
    app.use('/api/files', require('./routes/fileRoutes'));
    app.use('/api/notifications', require('./routes/notificationRoutes'));
} catch (e) {
    console.error("FileRoutes Error", e);
}

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 404 Handler
app.use((req, res) => {
    console.log(`[404] Route Not Found: ${req.url}`);
    res.status(404).json({ msg: `Route Not Found: ${req.url}` });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
