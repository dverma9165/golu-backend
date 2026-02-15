const SibApiV3Sdk = require('sib-api-v3-sdk');

// Initialize Brevo API Client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
const sender = { email: process.env.EMAIL_FROM || 'otp@dikshadesign.in', name: 'Diksha Design' };

exports.sendOrderNotification = async (order, product, customerName, utr) => {
    try {
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `New Order Received: ₹${order.amount} - ${customerName}`;
        sendSmtpEmail.htmlContent = `
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
        `;
        sendSmtpEmail.sender = sender;
        sendSmtpEmail.to = [{ email: 'deepeshv9926@gmail.com' }];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('Order Notification Sent via Brevo API:', data);
        return data;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR (Order Notification):', error);
        throw error;
    }
};

exports.sendOtp = async (email, otp) => {
    try {
        console.log(`Attempting to send OTP to ${email} via Brevo API...`);
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = 'Your OTP Code';
        sendSmtpEmail.htmlContent = `
            <h2>Your OTP Code</h2>
            <p>Your OTP code is: <strong>${otp}</strong></p>
            <p>This code will expire in 10 minutes.</p>
        `;
        sendSmtpEmail.sender = sender;
        sendSmtpEmail.to = [{ email: email }];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('OTP Email Sent via Brevo API:', data);
        return data;
    } catch (error) {
        console.error('CRITICAL EMAIL ERROR (OTP):', error);
        throw error;
    }
};
