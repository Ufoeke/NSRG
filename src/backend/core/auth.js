const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { logger } = require('../database/connection');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Password hashing utilities
const hashPassword = async (password) => {
  try {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  } catch (err) {
    logger.error('Password hashing error', err);
    throw new Error('Password hashing failed');
  }
};

const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (err) {
    logger.error('Password comparison error', err);
    return false;
  }
};

// JWT token utilities
const generateTokens = (payload) => {
  try {
    const accessToken = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'nsrg-api',
      audience: 'nsrg-client'
    });
    
    const refreshToken = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'nsrg-api',
      audience: 'nsrg-client'
    });
    
    return { accessToken, refreshToken };
  } catch (err) {
    logger.error('Token generation error', err);
    throw new Error('Token generation failed');
  }
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'nsrg-api',
      audience: 'nsrg-client'
    });
  } catch (err) {
    logger.error('Token verification error', err);
    return null;
  }
};

// User authentication functions
const authenticateUser = async (username, password) => {
  try {
    const result = await query(
      'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1 AND is_active = true',
      [username]
    );
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Invalid credentials' };
    }
    
    const user = result.rows[0];
    const isValidPassword = await comparePassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return { success: false, message: 'Invalid credentials' };
    }
    
    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    const tokens = generateTokens(tokenPayload);
    
    // Update last login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      tokens
    };
  } catch (err) {
    logger.error('User authentication error', err);
    return { success: false, message: 'Authentication failed' };
  }
};

const createUser = async (userData) => {
  try {
    const { username, email, password, role = 'user' } = userData;
    
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return { success: false, message: 'User already exists' };
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role, is_active, created_at) 
       VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP) 
       RETURNING id, username, email, role, created_at`,
      [username, email, hashedPassword, role]
    );
    
    const newUser = result.rows[0];
    
    // Generate tokens
    const tokenPayload = {
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role
    };
    
    const tokens = generateTokens(tokenPayload);
    
    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.created_at
      },
      tokens
    };
  } catch (err) {
    logger.error('User creation error', err);
    return { success: false, message: 'User creation failed' };
  }
};

const getUserById = async (userId) => {
  try {
    const result = await query(
      'SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (err) {
    logger.error('Get user by ID error', err);
    return null;
  }
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
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
    
    // Verify user still exists and is active
    const user = await getUserById(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(403).json({
        error: 'User not found or inactive',
        message: 'User account is not active'
      });
    }
    
    // Add user info to request
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    next();
  } catch (err) {
    logger.error('Authentication middleware error', err);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
};

// Role-based authorization middleware
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first'
      });
    }
    
    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Role '${requiredRole}' or 'admin' required`
      });
    }
    
    next();
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await getUserById(decoded.userId);
        if (user && user.is_active) {
          req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          };
        }
      }
    }
    
    next();
  } catch (err) {
    logger.error('Optional auth middleware error', err);
    next(); // Continue without authentication
  }
};

module.exports = {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyToken,
  authenticateUser,
  createUser,
  getUserById,
  authenticateToken,
  requireRole,
  optionalAuth
}; 