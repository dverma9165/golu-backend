const { Resend } = require('resend');

// Initialize Resend Client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender for testing (works only to the account owner's email)
// Once domain is verified, this can be changed to 'Admin <admin@yourdomain.com>'
const DEFAULT_SENDER = 'onboarding@resend.dev';

exports.sendOrderNotification = async (order, product, customerName, utr) => {
    try {
        const { data, error } = await resend.emails.send({
            from: DEFAULT_SENDER,
            to: 'deepeshv9926@gmail.com', // Admin Email
            subject: `New Order Received: ₹${order.amount} - ${customerName}`,
            html: `
                <h2>New Order Received</h2>
                <p><strong>Customer:</strong> ${customerName}</p>
                <p><strong>Product:</strong> ${product.title}</p>
                <p><strong>Amount:</strong> ₹${order.amount}</p>
                <p><strong>UTR:</strong> ${utr}</p>
                <br/>
                <p>
                    <a href="${process.env.CLIENT_URL || 'https://golu-frontend.onrender.com'}/admin" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Approve Order in Dashboard
                    </a>
                </p>
            `
        });

        if (error) {
            console.error('RESEND ERROR:', error);
            throw new Error(error.message);
        }

        console.log('Order Notification Sent:', data);
        return data;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR:', error);
        throw error;
    }
};

exports.sendOtp = async (email, otp) => {
    try {
        console.log(`Attempting to send OTP to ${email} via Resend...`);

        // Note: 'onboarding@resend.dev' can only send to the email address you signed up with on Resend.
        // For production, you MUST verify your domain in Resend dashboard.
        const { data, error } = await resend.emails.send({
            from: DEFAULT_SENDER,
            to: email,
            subject: 'Your OTP Code',
            html: `
                <h2>Your OTP Code</h2>
                <p>Your OTP code is: <strong>${otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
            `
        });

        if (error) {
            console.error('RESEND ERROR:', error);
            // Resend specific error for "test mode" restriction
            if (error.message.includes("can only send to yourself")) {
                throw new Error("Resend Test Mode: You can only send to your own email until you verify a domain.");
            }
            throw new Error(error.message);
        }

        console.log('OTP Email Sent:', data);
        return data;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR:', error);
        throw error;
    }
};
