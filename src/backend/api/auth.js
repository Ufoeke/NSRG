const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateUser, createUser, verifyToken, generateTokens, getUserById } = require('../core/auth');
const { validate, schemas } = require('../core/validation');
const { logger } = require('../database/connection');
const { cache } = require('../database/cache');

const router = express.Router();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: {
    error: 'Too many registration attempts',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', 
  authLimiter,
  validate(schemas.auth.login),
  async (req, res) => {
    try {
      const { username, password } = req.body;
      
      logger.info('Login attempt', { username });
      
      const result = await authenticateUser(username, password);
      
      if (!result.success) {
        logger.warn('Failed login attempt', { username, reason: result.message });
        return res.status(401).json({
          error: 'Authentication failed',
          message: result.message
        });
      }
      
      // Cache user session
      const sessionKey = `session:${result.user.id}`;
      await cache.set(sessionKey, {
        userId: result.user.id,
        username: result.user.username,
        role: result.user.role,
        loginTime: new Date().toISOString()
      }, 24 * 3600); // 24 hours
      
      logger.info('Successful login', { 
        userId: result.user.id, 
        username: result.user.username,
        role: result.user.role
      });
      
      res.json({
        success: true,
        message: 'Login successful',
        user: result.user,
        tokens: result.tokens
      });
      
    } catch (err) {
      logger.error('Login endpoint error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Login failed due to server error'
      });
    }
  }
);

// POST /api/auth/register
router.post('/register',
  registerLimiter,
  validate(schemas.auth.register),
  async (req, res) => {
    try {
      const userData = req.body;
      
      logger.info('Registration attempt', { username: userData.username, email: userData.email });
      
      const result = await createUser(userData);
      
      if (!result.success) {
        logger.warn('Failed registration attempt', { 
          username: userData.username, 
          email: userData.email,
          reason: result.message 
        });
        return res.status(400).json({
          error: 'Registration failed',
          message: result.message
        });
      }
      
      // Cache user session
      const sessionKey = `session:${result.user.id}`;
      await cache.set(sessionKey, {
        userId: result.user.id,
        username: result.user.username,
        role: result.user.role,
        loginTime: new Date().toISOString()
      }, 24 * 3600); // 24 hours
      
      logger.info('Successful registration', { 
        userId: result.user.id, 
        username: result.user.username,
        email: result.user.email,
        role: result.user.role
      });
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        user: result.user,
        tokens: result.tokens
      });
      
    } catch (err) {
      logger.error('Registration endpoint error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Registration failed due to server error'
      });
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh',
  validate(schemas.auth.refreshToken),
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      const decoded = verifyToken(refreshToken);
      if (!decoded) {
        return res.status(403).json({
          error: 'Invalid refresh token',
          message: 'Refresh token is invalid or expired'
        });
      }
      
      // Verify user still exists and is active
      const user = await getUserById(decoded.userId);
      if (!user || !user.is_active) {
        return res.status(403).json({
          error: 'User not found or inactive',
          message: 'User account is not active'
        });
      }
      
      // Generate new tokens
      const tokenPayload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };
      
      const tokens = generateTokens(tokenPayload);
      
      // Update session cache
      const sessionKey = `session:${user.id}`;
      await cache.set(sessionKey, {
        userId: user.id,
        username: user.username,
        role: user.role,
        loginTime: new Date().toISOString()
      }, 24 * 3600); // 24 hours
      
      logger.info('Token refresh successful', { userId: user.id, username: user.username });
      
      res.json({
        success: true,
        message: 'Token refresh successful',
        tokens
      });
      
    } catch (err) {
      logger.error('Token refresh endpoint error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Token refresh failed due to server error'
      });
    }
  }
);

// POST /api/auth/logout
router.post('/logout',
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
          // Remove session from cache
          const sessionKey = `session:${decoded.userId}`;
          await cache.del(sessionKey);
          
          logger.info('User logged out', { userId: decoded.userId, username: decoded.username });
        }
      }
      
      res.json({
        success: true,
        message: 'Logout successful'
      });
      
    } catch (err) {
      logger.error('Logout endpoint error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Logout failed due to server error'
      });
    }
  }
);

// GET /api/auth/me
router.get('/me',
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({
          error: 'Access token required',
          message: 'Please provide a valid access token'
        });
      }
      
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(403).json({
          error: 'Invalid token',
          message: 'Token is invalid or expired'
        });
      }
      
      // Get fresh user data
      const user = await getUserById(decoded.userId);
      if (!user || !user.is_active) {
        return res.status(403).json({
          error: 'User not found or inactive',
          message: 'User account is not active'
        });
      }
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
          lastLogin: user.last_login
        }
      });
      
    } catch (err) {
      logger.error('Get user profile endpoint error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get user profile'
      });
    }
  }
);

// GET /api/auth/status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication service is running',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/register', 
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
      'GET /api/auth/me',
      'GET /api/auth/status'
    ]
  });
});

module.exports = router; 