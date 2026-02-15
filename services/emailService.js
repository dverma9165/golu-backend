const nodemailer = require('nodemailer');

// Initialize Nodemailer Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT, // 587
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Default sender
const DEFAULT_SENDER = `"Diksha Design" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

exports.sendOrderNotification = async (order, product, customerName, utr) => {
    try {
        const info = await transporter.sendMail({
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
            `,
        });

        console.log('Order Notification Sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR (Order Notification):', error);
        throw error;
    }
};

exports.sendOtp = async (email, otp) => {
    try {
        console.log(`Attempting to send OTP to ${email} via Brevo SMTP...`);

        const info = await transporter.sendMail({
            from: DEFAULT_SENDER,
            to: email,
            subject: 'Your OTP Code',
            html: `
                <h2>Your OTP Code</h2>
                <p>Your OTP code is: <strong>${otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
            `,
        });

        console.log('OTP Email Sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR (OTP):', error);
        throw error;
    }
};
