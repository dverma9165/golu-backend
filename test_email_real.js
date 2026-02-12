
require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

(async () => {
    console.log("Testing Resend API Key:", process.env.RESEND_API_KEY ? "Present" : "MISSING");
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'deepeshv6263@gmail.com',
            subject: 'Test Email from Debug Script',
            html: '<p>If you see this, email sending works!</p>'
        });

        if (error) {
            console.error('RESEND ERROR:', error);
        } else {
            console.log('Email Sent Successfully:', data);
        }
    } catch (err) {
        console.error('SCRIPT ERROR:', err);
    }
})();
