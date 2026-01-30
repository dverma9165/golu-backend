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
                url: `/product/${order.product}` // Redirect to the specific product page
            });
        }

        res.json(order);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// === PUBLIC / AUTH ACTIONS ===

exports.rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByIdAndUpdate(
            orderId,
            { status: 'Rejected' },
            { new: true }
        );
        // Notify User
        if (order.user) {
            notificationService.sendToUser(order.user, {
                title: 'Order Rejected',
                body: 'Your order was not approved. Please contact support.',
                url: `/cart`
            });
        }
        res.json(order);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.submitOrder = async (req, res) => {
    try {
        console.log('Submit Order Payload:', req.body);
        const { productId, customerName, utr, cartItems } = req.body;
        const userId = req.user.id;

        // 1. Determine Product(s)
        let productsToOrder = [];
        let parsedItemIds = [];

        // Parsing cartItems
        if (cartItems) {
            if (Array.isArray(cartItems)) {
                parsedItemIds = cartItems;
            } else if (typeof cartItems === 'string') {
                try {
                    parsedItemIds = JSON.parse(cartItems);
                } catch (e) {
                    console.error("Failed to parse cartItems:", e.message);
                }
            }
        }

        if (parsedItemIds.length > 0) {
            console.log('Processing Bulk Order. IDs:', parsedItemIds);
            productsToOrder = await Product.find({ _id: { $in: parsedItemIds } });

            if (productsToOrder.length === 0) {
                return res.status(404).json({ msg: 'No valid products found for the provided IDs' });
            }
        } else {
            // Fallback to Single Product
            console.log('Processing Single Order. ID:', productId);
            if (!productId) {
                return res.status(400).json({ msg: 'No Product ID or Cart Items provided' });
            }
            const product = await Product.findById(productId);
            if (!product) return res.status(404).json({ msg: 'Product not found' });
            productsToOrder = [product];
        }

        // 2. Handle Payment Screenshot
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

        // 3. Create Orders
        const createdOrders = [];
        let totalAmount = 0;

        for (const product of productsToOrder) {
            // Check for existing order
            const existingOrder = await Order.findOne({
                user: userId,
                product: product._id,
                status: { $in: ['Pending', 'Approved'] }
            }).sort({ createdAt: -1 });

            if (existingOrder) {
                if (existingOrder.status === 'Pending') {
                    // Skip if pending
                    continue;
                }
                if (existingOrder.status === 'Approved') {
                    // Check expiry (7 Days as requested)
                    const now = new Date();
                    const approvedTime = existingOrder.approvedAt ? new Date(existingOrder.approvedAt) : new Date(existingOrder.createdAt);
                    const diffTime = Math.abs(now - approvedTime);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays <= 7) {
                        continue; // Skip if owned and not expired
                    }
                }
            }

            const newOrder = new Order({
                user: userId,
                product: product._id,
                customerName,
                utr,
                amount: product.price || 0,
                paymentScreenshot: screenshotData
            });

            await newOrder.save();
            createdOrders.push(newOrder);
            totalAmount += (product.price || 0);
        }

        if (createdOrders.length === 0) {
            return res.status(400).json({ msg: 'Order(s) skipped: You already have these items pending or approved.' });
        }

        // 4. Notifications
        // Push Notification
        notificationService.sendToAdmins({
            title: 'New Order Received',
            body: `Order from ${customerName} for ₹${totalAmount} (${createdOrders.length} items)`,
            url: `${process.env.CLIENT_URL || 'https://golu-frontend.onrender.com'}/admin` // Redirect to Admin Dashboard
        });

        // Email Notification
        // Send email for each order to ensure clarity
        try {
            for (const order of createdOrders) {
                // Determine product details again for the email
                const productDetails = productsToOrder.find(p => p._id.toString() === order.product.toString());
                if (productDetails) {
                    await emailService.sendOrderNotification(order, productDetails, customerName, utr);
                }
            }
        } catch (emailErr) {
            console.error('Failed to send email:', emailErr);
        }

        res.json({ msg: 'Order(s) Submitted', orderIds: createdOrders.map(o => o._id) });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }

}

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
