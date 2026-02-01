const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Explicit host
    port: 465, // Explicit port for secure connection
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
    debug: true,
    logger: true
});

exports.sendOrderNotification = async (order, product, customerName, utr) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'deepeshv9926@gmail.com', // Admin Email to receive notifications
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
                <p style="margin-top: 10px; font-size: 12px; color: #666;">If the button doesn't work, verify at: ${process.env.CLIENT_URL || 'https://golu-frontend.onrender.com'}/admin</p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully: ' + info.response);
        return info;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR:', error);
        throw error; // Re-throw to be caught by controller
    }
};

exports.sendOtp = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            html: `
                <h2>Your OTP Code</h2>
                <p>Your OTP code is: <strong>${otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('OTP Email sent successfully: ' + info.response);
        return info;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR:', error);
        throw error;
    }
};
