// Mock process.env BEFORE requiring the service
process.env.RESEND_API_KEY = 're_GH6RVsK5_AJFBUKPCrvZ5yUikbhgb56wK';

const emailService = require('./services/emailService');

async function test() {
    console.log("Testing email service with unverified email...");
    try {
        // Use an unverified email to trigger the error
        const res = await emailService.sendOtp('test@example.com', '123456');
        console.log("Success! Response:", res);
    } catch (e) {
        console.error("Test Failed with error:", e.message);
    }
}

test();
