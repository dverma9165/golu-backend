const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number
    },
    googleDriveId: {
        type: String,
        required: true
    },
    webViewLink: {
        type: String
    },
    webContentLink: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('File', FileSchema);
