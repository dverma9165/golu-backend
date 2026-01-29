const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    price: {
        type: Number,
        default: 0
    },
    salePrice: {
        type: Number
    },
    version: {
        type: String
    },
    fileType: { // 'CDR', 'PSD' etc
        type: String
    },
    fontsIncluded: {
        type: String,
        default: 'No'
    },
    
    // Thumbnail (Public)
    thumbnail: {
        originalName: String,
        mimeType: String,
        googleDriveId: String,
        viewLink: String
    },
    
    // Main Source File (Private/Paid)
    sourceFile: {
        originalName: String,
        mimeType: String, // zip, crd, etc
        size: Number,
        googleDriveId: String,
        downloadLink: String
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Product', ProductSchema);
