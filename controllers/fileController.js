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
            category: req.body.category,


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

exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ msg: 'Product not found' });

        // Delete from Google Drive
        try {
            if (product.thumbnail && product.thumbnail.googleDriveId) {
                await driveService.deleteFile(product.thumbnail.googleDriveId);
            }
            if (product.sourceFile && product.sourceFile.googleDriveId) {
                await driveService.deleteFile(product.sourceFile.googleDriveId);
            }
        } catch (driveErr) {
            console.error('Error deleting file from Google Drive:', driveErr);
            // Continue to delete from DB even if Drive delete fails
        }

        await Product.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Product and associated files removed' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9; // Default 9 for grid
        const skip = (page - 1) * limit;

        const total = await Order.countDocuments({ user: req.user.id });
        const orders = await Order.find({ user: req.user.id })
            .populate('product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            orders,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalOrders: total
        });
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
        const search = req.query.search || '';
        const sort = req.query.sort || 'newest';

        // Build Query
        const query = {};
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const orConditions = [
                { title: searchRegex },
                { category: searchRegex },
                { fileType: searchRegex },
                { description: searchRegex } // Included description in search
            ];

            // If user searches for 'font', explicitly include products with fonts
            if (search.toLowerCase().includes('font')) {
                orConditions.push({ fontsIncluded: 'Yes' });
            }

            // If user searches for a number, try to match price
            const searchNum = Number(search);
            if (!isNaN(searchNum)) {
                orConditions.push({ price: searchNum });
                orConditions.push({ salePrice: searchNum });
            }

            query.$or = orConditions;
        }
        if (req.query.category && req.query.category !== 'All') {
            query.category = req.query.category;
        }

        // Price Filter (considers both price and salePrice)
        if (req.query.priceRange && req.query.priceRange !== 'All') {
            const range = req.query.priceRange;
            if (range === 'Custom') {
                const min = req.query.minPrice ? Number(req.query.minPrice) : 0;
                const max = req.query.maxPrice ? Number(req.query.maxPrice) : Infinity;
                const priceCondition = {};
                if (!isNaN(min)) priceCondition.$gte = min;
                if (!isNaN(max) && max !== Infinity) priceCondition.$lte = max;
                if (Object.keys(priceCondition).length > 0) {
                    query.$or = query.$or || [];
                    // Use $and to combine with any existing $or from search
                    const searchOr = query.$or.length ? [...query.$or] : null;
                    delete query.$or;
                    const priceFilter = {
                        $or: [
                            { salePrice: { $exists: true, $ne: null, ...priceCondition } },
                            { $and: [{ $or: [{ salePrice: { $exists: false } }, { salePrice: null }] }, { price: priceCondition }] }
                        ]
                    };
                    if (searchOr) {
                        query.$and = [{ $or: searchOr }, priceFilter];
                    } else {
                        Object.assign(query, priceFilter);
                    }
                }
            } else if (range === 'Free') {
                // Match products where effective price is 0 (salePrice=0 or price=0 with no salePrice)
                const freeFilter = {
                    $or: [
                        { salePrice: 0 },
                        { price: 0 }
                    ]
                };
                const searchOr = query.$or;
                if (searchOr) {
                    delete query.$or;
                    query.$and = [{ $or: searchOr }, freeFilter];
                } else {
                    Object.assign(query, freeFilter);
                }
            } else if (range.includes('-')) {
                const [min, max] = range.split('-').map(Number);
                if (!isNaN(min) && !isNaN(max)) {
                    const priceCondition = { $gte: min, $lte: max };
                    const priceFilter = {
                        $or: [
                            { salePrice: { $exists: true, $ne: null, ...priceCondition } },
                            { $and: [{ $or: [{ salePrice: { $exists: false } }, { salePrice: null }] }, { price: priceCondition }] }
                        ]
                    };
                    const searchOr = query.$or;
                    if (searchOr) {
                        delete query.$or;
                        query.$and = [{ $or: searchOr }, priceFilter];
                    } else {
                        Object.assign(query, priceFilter);
                    }
                }
            } else if (range.endsWith('+')) { // 500+
                const min = Number(range.replace('+', ''));
                if (!isNaN(min)) {
                    const priceCondition = { $gt: min };
                    const priceFilter = {
                        $or: [
                            { salePrice: { $exists: true, $ne: null, ...priceCondition } },
                            { $and: [{ $or: [{ salePrice: { $exists: false } }, { salePrice: null }] }, { price: priceCondition }] }
                        ]
                    };
                    const searchOr = query.$or;
                    if (searchOr) {
                        delete query.$or;
                        query.$and = [{ $or: searchOr }, priceFilter];
                    } else {
                        Object.assign(query, priceFilter);
                    }
                }
            }
        }

        // File Type Filter (Multiple Selection Support)
        if (req.query.fileType && req.query.fileType !== 'All') {
            const fileTypes = Array.isArray(req.query.fileType)
                ? req.query.fileType
                : req.query.fileType.split(',');
            query.fileType = { $in: fileTypes };
        }

        // Version Filter
        if (req.query.version && req.query.version !== 'All') {
            query.version = req.query.version;
        }

        // Fonts Included Filter
        if (req.query.fontsIncluded && req.query.fontsIncluded !== 'All') {
            query.fontsIncluded = req.query.fontsIncluded;
        }

        // Build Sort
        let sortOption = { createdAt: -1 }; // Default Newest
        switch (sort) {
            case 'oldest':
                sortOption = { createdAt: 1 };
                break;
            case 'price-low':
                sortOption = { price: 1 };
                break;
            case 'price-high':
                sortOption = { price: -1 };
                break;
            case 'rating-high':
                sortOption = { rating: -1 };
                break;
            case 'rating-low':
                sortOption = { rating: 1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .select('-sourceFile')
            .sort(sortOption)
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

exports.addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const productId = req.params.id;

        // 1. Verify User Purchased & Approved
        const order = await Order.findOne({
            user: req.user.id,
            product: productId,
            status: 'Approved'
        });

        if (!order) {
            return res.status(403).json({ msg: 'You can only review products you have purchased and that have been approved.' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ msg: 'Product not found' });

        // Check if already reviewed
        const alreadyReviewed = product.reviews.find(
            r => r.user.toString() === req.user.id.toString()
        );

        if (alreadyReviewed) {
            return res.status(400).json({ msg: 'You have already reviewed this product' });
        }

        const review = {
            name: req.user.name || 'User', // Provided by auth middleware if populated? Or assume User model has name. 
            // Better fetch name from User model if needed, but req.user usually has id. 
            // Let's assume req.user might not have name if token payload only has id.
            // But auth middleware does: req.user = decoded.user.
            // Let's fetch user name to be safe.
            user: req.user.id,
            rating: Number(rating),
            comment,
            date: Date.now()
        };

        // Get user name
        const user = await require('../models/User').findById(req.user.id);
        if (user) review.name = user.name;

        product.reviews.push(review);

        product.numReviews = product.reviews.length;
        product.rating =
            product.reviews.reduce((acc, item) => item.rating + acc, 0) /
            product.reviews.length;

        await product.save();
        res.status(201).json({ msg: 'Review added' });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// === FEED SECTIONS (single endpoint for all home feed data) ===
exports.getFeedSections = async (req, res) => {
    try {
        const limit = 10;

        // Define all feed sections with their queries and sorts
        const sectionDefs = [
            // ── Curated / Smart Sections ──
            { id: 'newest', query: {}, sort: { createdAt: -1 } },
            { id: 'toprated', query: { rating: { $gte: 3 } }, sort: { rating: -1 } },
            { id: 'mostreviewed', query: { numReviews: { $gte: 1 } }, sort: { numReviews: -1 } },
            { id: 'free', query: { $or: [{ salePrice: 0 }, { price: 0 }] }, sort: { createdAt: -1 } },
            { id: 'under10', query: { $or: [{ salePrice: { $gt: 0, $lte: 10 } }, { $and: [{ salePrice: null }, { price: { $gt: 0, $lte: 10 } }] }] }, sort: { createdAt: -1 } },
            { id: 'under20', query: { $or: [{ salePrice: { $gt: 0, $lte: 20 } }, { $and: [{ salePrice: null }, { price: { $gt: 0, $lte: 20 } }] }] }, sort: { rating: -1 } },
            { id: 'under50', query: { $or: [{ salePrice: { $gt: 0, $lte: 50 } }, { $and: [{ salePrice: null }, { price: { $gt: 0, $lte: 50 } }] }] }, sort: { rating: -1 } },
            { id: 'premium', query: { $or: [{ salePrice: { $gte: 100 } }, { $and: [{ salePrice: null }, { price: { $gte: 100 } }] }] }, sort: { rating: -1 } },
            { id: 'discounted', query: { salePrice: { $exists: true, $ne: null, $gt: 0 } }, sort: { createdAt: -1 } },
            { id: 'withfonts', query: { fontsIncluded: 'Yes' }, sort: { createdAt: -1 } },
            { id: 'priceLow', query: { price: { $gt: 0 } }, sort: { price: 1 } },

            // ── Category Sections ──
            { id: 'wedding', query: { category: 'Wedding Card' }, sort: { createdAt: -1 } },
            { id: 'visiting', query: { category: 'Visiting Card' }, sort: { createdAt: -1 } },
            { id: 'invitation', query: { category: 'Invitation Card' }, sort: { createdAt: -1 } },
            { id: 'birthday', query: { category: 'Birthday Banner' }, sort: { createdAt: -1 } },
            { id: 'festival', query: { category: 'Festival Post' }, sort: { createdAt: -1 } },
            { id: 'political', query: { category: 'Political Banner' }, sort: { createdAt: -1 } },
            { id: 'social', query: { category: 'Social Media Post' }, sort: { createdAt: -1 } },
            { id: 'flyer', query: { category: 'Business Flyer' }, sort: { createdAt: -1 } },
            { id: 'logo', query: { category: 'Logo Design' }, sort: { createdAt: -1 } },
            { id: 'letterhead', query: { category: 'Letterhead' }, sort: { createdAt: -1 } },
            { id: 'billbook', query: { category: 'Bill Book' }, sort: { createdAt: -1 } },
            { id: 'pamphlet', query: { category: 'Pamphlet' }, sort: { createdAt: -1 } },
            { id: 'brochure', query: { category: 'Brochure' }, sort: { createdAt: -1 } },
            { id: 'menu', query: { category: 'Menu Card' }, sort: { createdAt: -1 } },
            { id: 'certificate', query: { category: 'Certificate' }, sort: { createdAt: -1 } },
            { id: 'resume', query: { category: 'Resume/CV' }, sort: { createdAt: -1 } },
            { id: 'calendar', query: { category: 'Calendar' }, sort: { createdAt: -1 } },
            { id: 'sticker', query: { category: 'Sticker/Label' }, sort: { createdAt: -1 } },
            { id: 'idcard', query: { category: 'ID Card' }, sort: { createdAt: -1 } },
            { id: 'poster', query: { category: 'Poster' }, sort: { createdAt: -1 } },
            { id: 'thumbnail', query: { category: 'Thumbnail' }, sort: { createdAt: -1 } },
            { id: 'webbanner', query: { category: 'Web Banner' }, sort: { createdAt: -1 } },
            { id: 'infographic', query: { category: 'Infographic' }, sort: { createdAt: -1 } },
            { id: 'presentation', query: { category: 'Presentation' }, sort: { createdAt: -1 } },
            { id: 'ebook', query: { category: 'E-Book Cover' }, sort: { createdAt: -1 } },
            { id: 'tshirt', query: { category: 'T-Shirt Design' }, sort: { createdAt: -1 } },
            { id: 'mug', query: { category: 'Mug Design' }, sort: { createdAt: -1 } },
            { id: 'standee', query: { category: 'Standee' }, sort: { createdAt: -1 } },
            { id: 'flex', query: { category: 'Flex Banner' }, sort: { createdAt: -1 } },
            { id: 'envelope', query: { category: 'Envelope' }, sort: { createdAt: -1 } },

            // ── File Type Sections ──
            { id: 'cdr', query: { fileType: 'CDR' }, sort: { createdAt: -1 } },
            { id: 'psd', query: { fileType: 'PSD' }, sort: { createdAt: -1 } },
            { id: 'ai', query: { fileType: 'AI' }, sort: { createdAt: -1 } },
            { id: 'pdf', query: { fileType: 'PDF' }, sort: { createdAt: -1 } },
        ];

        // Run all queries in parallel
        const results = await Promise.all(
            sectionDefs.map(async (sec) => {
                const items = await Product.find(sec.query)
                    .select('-sourceFile')
                    .sort(sec.sort)
                    .limit(limit);
                return { id: sec.id, items };
            })
        );

        // Convert to object { sectionId: [items] }
        const sections = {};
        results.forEach(r => {
            sections[r.id] = r.items;
        });

        res.json({ sections });
    } catch (err) {
        console.error('Feed sections error:', err);
        res.status(500).send('Server Error');
    }
};
