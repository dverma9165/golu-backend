require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const getAccessToken = () => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // crucial for refresh token
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oauth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            console.log('\n--- SUCCESS! ---');
            console.log('Here is your Refresh Token (save this to your .env file as GOOGLE_REFRESH_TOKEN):');
            console.log('\n' + token.refresh_token + '\n');
            console.log('Access Token (valid for 1hr):', token.access_token);
        });
    });
};

getAccessToken();
