require('dotenv').config();
const emailService = require('./services/emailService');

(async () => {
    try {
        console.log("Testing Brevo SMTP...");
        console.log("SMTP HOST:", process.env.SMTP_HOST);
        console.log("SMTP USER:", process.env.SMTP_USER);

        const testEmail = 'deepeshv6263@gmail.com'; // Sending to self/admin for test
        const testOtp = '123456';

        console.log(`Sending test OTP to ${testEmail}...`);
        await emailService.sendOtp(testEmail, testOtp);
        console.log("Test execution finished successfully.");
    } catch (error) {
        console.error("TEST FAILED:", error);
    }
})();
