const Product = require('../models/Product');
const Order = require('../models/Order');
const driveService = require('../services/driveService');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

// === ADMIN ACTIONS ===

exports.uploadProduct = async (req, res) => {
    try {
        const { thumbnail, sourceFile } = req.files;

        if (!thumbnail || !sourceFile) {
            return res.status(400).json({ msg: 'Both Thumbnail and Source File are required' });
        }

        const thumbUpload = await driveService.uploadFile(thumbnail[0]);
        const sourceUpload = await driveService.uploadFile(sourceFile[0]);

        const newProduct = new Product({
            title: req.body.title,
            description: req.body.description,
            price: req.body.price,
            salePrice: req.body.salePrice,
            version: req.body.version,
            fileType: req.body.fileType,
            fontsIncluded: req.body.fontsIncluded,

            thumbnail: {
                originalName: thumbnail[0].originalname,
                mimeType: thumbnail[0].mimetype,
                googleDriveId: thumbUpload.id,
                viewLink: thumbUpload.webViewLink
            },
            sourceFile: {
                originalName: sourceFile[0].originalname,
                mimeType: sourceFile[0].mimetype,
                size: sourceFile[0].size,
                googleDriveId: sourceUpload.id,
                downloadLink: sourceUpload.webContentLink
            }
        });

        const savedProduct = await newProduct.save();
        res.json(savedProduct);

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
};

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('product').sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.approveOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        // Set Approved status AND approvedAt time
        const order = await Order.findByIdAndUpdate(
            orderId,
            {
                status: 'Approved',
                approvedAt: Date.now()
            },
            { new: true }
        );
        // Notify User
        if (order.user) {
            notificationService.sendToUser(order.user, {
                title: 'Order Approved',
                body: 'Your order has been approved! Click to download.',
                url: '/my-orders' // Frontend user route
            });
        }

        res.json(order);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// === PUBLIC / AUTH ACTIONS ===

exports.submitOrder = async (req, res) => {
    try {
        const { productId, customerName, utr } = req.body;
        const userId = req.user.id;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ msg: 'Product not found' });

        let screenshotData = {};
        if (req.file) {
            const uploadRes = await driveService.uploadFile(req.file);
            screenshotData = {
                id: uploadRes.id,
                viewLink: uploadRes.webViewLink,
                downloadLink: uploadRes.webContentLink,
                mimeType: req.file.mimetype
            };
        }

        const newOrder = new Order({
            user: userId,
            product: productId,
            customerName,
            utr,
            amount: product.price || 0,
            paymentScreenshot: screenshotData
        });

        await newOrder.save();

        // Notify Admins (Push)
        notificationService.sendToAdmins({
            title: 'New Order Received',
            body: `Order from ${customerName} for ₹${product.price}`,
            url: '/admin'
        });

        // Notify Admin (Email)
        console.log('Sending email notification to admin...');
        try {
            await emailService.sendOrderNotification(newOrder, product, customerName, utr);
            console.log('Email notification step complete.');
        } catch (emailErr) {
            console.error('Failed to send email:', emailErr);
        }

        res.json({ msg: 'Order Submitted', orderId: newOrder._id });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).populate('product');
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.downloadPaid = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId).populate('product');

        if (!order) return res.status(404).json({ msg: 'Order not found' });

        if (order.user && order.user.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Unauthorized to download this order' });
        }

        if (!order.product) return res.status(404).json({ msg: 'Product no longer exists' });

        if (order.status === 'Approved') {
            // Check Expiry (3 Days)
            // If approvedAt missing (legacy), maybe allow or default to createdAt? default allow for now.
            if (order.approvedAt) {
                const now = new Date();
                const approvedTime = new Date(order.approvedAt);
                const diffTime = Math.abs(now - approvedTime);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // 3 days limit (72 hours)
                // Using 72 * 60 * 60 * 1000 for precision
                if (diffTime > (72 * 60 * 60 * 1000)) {
                    return res.status(403).json({ msg: 'Download link expired (Limit: 3 Days)' });
                }
            }

            return res.json({
                status: 'Approved',
                downloadLink: order.product.sourceFile.downloadLink
            });
        } else {
            return res.json({ status: order.status });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const total = await Product.countDocuments();
        const products = await Product.find()
            .select('-sourceFile')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            files: products,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalFiles: total
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).select('-sourceFile');
        if (!product) return res.status(404).json({ msg: 'Product not found' });
        res.json(product);
    } catch (err) {
        console.error(err);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Product not found' });
        res.status(500).send('Server Error');
    }
};
