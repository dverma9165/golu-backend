const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Initialize VAPID keys
// Ideally these should be set in environment variables
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(
        'mailto:example@yourdomain.org',
        publicVapidKey,
        privateVapidKey
    );
} else {
    console.warn('VAPID keys not set. Push notifications will not work until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set in .env');
}

exports.getPublicKey = () => {
    return process.env.VAPID_PUBLIC_KEY;
};

// Send notification to a specific subscription object
const sendNotification = async (subscription, payload) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
        console.error('Error sending notification:', err);
        if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription is no longer valid, remove it
            console.log('Subscription expired or invalid, removing from DB');
            await PushSubscription.findOneAndDelete({ endpoint: subscription.endpoint });
        }
    }
};

// Send to all Admins
exports.sendToAdmins = async (payload) => {
    try {
        const subscriptions = await PushSubscription.find({ role: 'admin' });
        console.log(`Sending admin notification to ${subscriptions.length} subscriptions`);

        const notifications = subscriptions.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: sub.keys
            };
            return sendNotification(pushSubscription, payload);
        });

        await Promise.all(notifications);
    } catch (err) {
        console.error('Error in sendToAdmins:', err);
    }
};

// Send to a specific User
exports.sendToUser = async (userId, payload) => {
    try {
        const subscriptions = await PushSubscription.find({ user: userId });
        console.log(`Sending user notification to ${subscriptions.length} subscriptions for user ${userId}`);

        const notifications = subscriptions.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: sub.keys
            };
            return sendNotification(pushSubscription, payload);
        });

        await Promise.all(notifications);
    } catch (err) {
        console.error('Error in sendToUser:', err);
    }
};
