const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// @route   POST api/auth/register
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @access  Public
router.post('/login', authController.login);

// @route   POST api/auth/cart
// @access  Private
router.post('/cart', auth, authController.addToCart);

// @route   GET api/auth/cart
// @access  Private
router.get('/cart', auth, authController.getCart);

// @route   DELETE api/auth/cart/:productId
// @access  Private
router.delete('/cart/:productId', auth, authController.removeFromCart);

module.exports = router;
