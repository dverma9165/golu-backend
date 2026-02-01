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
    },

    // Reviews
    reviews: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            },
            name: {
                type: String
            },
            rating: {
                type: Number,
                required: true
            },
            comment: {
                type: String
            },
            date: {
                type: Date,
                default: Date.now
            }
        }
    ],
    rating: {
        type: Number,
        default: 0
    },
    numReviews: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Product', ProductSchema);
