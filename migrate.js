const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        
        // Access raw collection for old files
        const oldFiles = await mongoose.connection.db.collection('files').find({}).toArray();
        console.log(`Found ${oldFiles.length} old files`);
        
        for (const file of oldFiles) {
            // Check if already exists in Product (by googleDriveId)
            const exists = await Product.findOne({ 'thumbnail.googleDriveId': file.googleDriveId });
            if (exists) {
                console.log(`Skipping existing: ${file.originalName}`);
                continue;
            }
            
            console.log(`Migrating: ${file.originalName}`);

            const newProduct = new Product({
                title: file.originalName || "Untitled",
                description: "Migrated from old system",
                price: 0, // Free by default
                version: "Legacy",
                fileType: (file.mimeType && file.mimeType.split('/').length > 1) ? file.mimeType.split('/')[1].toUpperCase() : "FILE",
                fontsIncluded: "Unknown",
                
                thumbnail: {
                    originalName: file.originalName,
                    mimeType: file.mimeType,
                    googleDriveId: file.googleDriveId,
                    viewLink: file.webViewLink
                },
                sourceFile: {
                    originalName: file.originalName,
                    mimeType: file.mimeType,
                    size: file.size || 0,
                    googleDriveId: file.googleDriveId,
                    downloadLink: file.webContentLink
                }
            });
            
            await newProduct.save();
        }
        console.log("Migration Complete");
        process.exit(0);
    } catch (err) {
        console.error("Migration Failed:", err);
        process.exit(1);
    }
};

migrate();
