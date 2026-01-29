const express = require('express');
const router = express.Router();
const PushSubscription = require('../models/PushSubscription');
const notificationService = require('../services/notificationService');
const auth = require('../middleware/auth');

// Get Public Key
router.get('/config', (req, res) => {
    const key = notificationService.getPublicKey();
    if (!key) {
        return res.status(500).json({ error: 'VAPID Public Key not configured' });
    }
    res.json({ publicKey: key });
});

// Subscribe
router.post('/subscribe', async (req, res) => {
    const subscription = req.body;

    // Determine Role and User
    let role = 'user';
    let userId = null;

    // Check if Admin via Header
    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword === process.env.ADMIN_PASSWORD) {
        role = 'admin';
    }
    // Check if User via Token (manually decoding/verifying since this route might be mixed)
    // Alternatively, we can rely on client to send token and use middleware, 
    // but the frontend implementation might call this from different contexts.
    // Let's check headers.
    else if (req.headers['x-auth-token']) {
        // We could use the auth middleware, but we want to fail passively for auth if it's public? 
        // No, subscription implies logged in usually.
        // Let's try to verify token here if present
        try {
            const jwt = require('jsonwebtoken');
            const token = req.headers['x-auth-token'];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
            userId = decoded.user.id;
            role = 'user';
        } catch (err) {
            // Invalid token
            console.warn('Subscribe: Invalid token provided');
        }
    }

    if (role === 'user' && !userId) {
        // Allow anonymous? Maybe not. Let's assume only logged in users subscribe.
        // Or if neither, maybe just return error or save as 'guest'?
        // Request requirement says: "user ... admin". 
        // If neither, we can't notify 'user when order approved' effectively without userId.
        return res.status(401).json({ msg: 'Unauthorized subscription request' });
    }

    try {
        // Upsert? Or just add. Endpoints are unique.
        // If endpoint exists, update user/role just in case.
        let sub = await PushSubscription.findOne({ endpoint: subscription.endpoint });

        if (!sub) {
            sub = new PushSubscription({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth
                },
                user: userId,
                role: role
            });
        } else {
            // Update existing
            sub.user = userId;
            sub.role = role;
            sub.keys = {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth
            };
        }

        await sub.save();
        res.status(201).json({});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

module.exports = router;
