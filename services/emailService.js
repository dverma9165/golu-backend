const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    debug: true, // Show debug output
    logger: true // Log information to console
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
                <p>Please log in to the admin dashboard to approve this order.</p>
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
