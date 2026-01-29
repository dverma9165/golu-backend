const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Only set credentials if refresh token exists
if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const uploadFile = async (fileObject) => {
    try {
        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileObject.buffer);

        const response = await drive.files.create({
            media: {
                mimeType: fileObject.mimeType,
                body: bufferStream,
            },
            requestBody: {
                name: fileObject.originalname,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root'], // Upload to specific folder
            },
            fields: 'id, name, webViewLink, webContentLink',
        });

        // Make file readable by anyone with the link
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        throw error;
    }
};

module.exports = {
    uploadFile,
};
