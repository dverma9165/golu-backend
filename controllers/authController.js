const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const emailService = require('../services/emailService');

exports.register = async (req, res) => {
    const { name, email, phone, password } = req.body;

    try {
        // Check Main User Collection
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save/Update Pending User
        // If email exists in pending, update it. If not, create new.
        let pendingUser = await PendingUser.findOne({ email });
        if (pendingUser) {
            pendingUser.name = name;
            pendingUser.phone = phone;
            pendingUser.password = hashedPassword;
            pendingUser.otp = otp;
            await pendingUser.save();
        } else {
            pendingUser = new PendingUser({
                name,
                email,
                phone,
                password: hashedPassword,
                otp
            });
            await pendingUser.save();
        }

        // Send OTP
        await emailService.sendOtp(email, otp);

        res.json({ msg: 'OTP sent to email', userId: pendingUser.id });
    } catch (err) {
        console.error("Register Error:", err.message);
        // Return specific error message for debugging (e.g. Email failure)
        res.status(500).json({ msg: `Registration Failed: ${err.message}` });
    }
};

exports.verifyOtp = async (req, res) => {
    const { userId, otp } = req.body;
    try {
        // Find in Pending
        let pendingUser = await PendingUser.findById(userId);
        if (!pendingUser) return res.status(400).json({ msg: 'Invalid or Expired Request' });

        if (pendingUser.otp !== otp) return res.status(400).json({ msg: 'Invalid OTP' });

        // Move to Real User Collection
        const newUser = new User({
            name: pendingUser.name,
            email: pendingUser.email,
            phone: pendingUser.phone,
            password: pendingUser.password, // Already Hashed
            isVerified: true
        });

        await newUser.save();

        // Delete Pending
        await PendingUser.findByIdAndDelete(userId);

        const payload = { user: { id: newUser.id } };
        jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: 360000 }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        if (!user.isVerified) {
            return res.status(400).json({ msg: 'Email not verified. Please register again to verify.' });
        }

        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret',
            { expiresIn: 360000 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.addToCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const productId = req.body.productId;

        // Check if already in cart? 
        // Allow duplicates? Let's check.
        const isPresent = user.cart.some(item => item.product.toString() === productId);
        if (isPresent) {
            return res.status(400).json({ msg: 'Already in cart' });
        }

        user.cart.push({ product: productId });
        await user.save();
        res.json(user.cart);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getCart = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const user = await User.findById(req.user.id).populate('cart.product');

        // Pagination for embedded array
        const totalItems = user.cart.length;
        const paginatedCart = user.cart.slice(skip, skip + limit);

        res.json({
            cart: paginatedCart,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page,
            totalItems: totalItems
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const productId = req.params.productId;

        user.cart = user.cart.filter(item => item.product.toString() !== productId);
        await user.save();

        // Return updated cart
        const updatedUser = await User.findById(req.user.id).populate('cart.product');
        res.json({ cart: updatedUser.cart });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
