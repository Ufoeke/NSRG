/**
 * Security Profile API Routes
 * RESTful API endpoints for managing wireless security profiles, templates, 
 * certificates, and RADIUS server configurations
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const SecurityProfileService = require('../services/wireless/security-profile-service');

// Initialize the security profile service
const securityProfileService = new SecurityProfileService();

// ===============================
// MIDDLEWARE
// ===============================

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

/**
 * Middleware to handle async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ===============================
// SECURITY PROFILE ROUTES
// ===============================

/**
 * @route GET /api/security-profiles
 * @desc Get all security profiles
 * @access Public
 */
router.get('/', [
    query('type').optional().isIn(['default', 'custom', 'template-based']),
    query('authType').optional().isIn(['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise']),
    query('securityLevel').optional().isIn(['low', 'medium', 'high', 'maximum']),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    try {
        let profiles = securityProfileService.getProfiles();

        // Apply filters
        if (req.query.type) {
            if (req.query.type === 'default') {
                profiles = profiles.filter(p => p.isDefault);
            } else if (req.query.type === 'custom') {
                profiles = profiles.filter(p => !p.isDefault && !p.basedOnTemplate);
            } else if (req.query.type === 'template-based') {
                profiles = profiles.filter(p => p.basedOnTemplate);
            }
        }

        if (req.query.authType) {
            profiles = profiles.filter(p => p.authType === req.query.authType);
        }

        if (req.query.securityLevel) {
            profiles = profiles.filter(p => p.securityLevel === req.query.securityLevel);
        }

        res.json({
            success: true,
            data: profiles,
            count: profiles.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve security profiles',
            details: error.message
        });
    }
}));

/**
 * @route POST /api/security-profiles
 * @desc Create a new security profile
 * @access Public
 */
router.post('/', [
    body('name').notEmpty().withMessage('Profile name is required'),
    body('authType').isIn(['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'])
        .withMessage('Invalid authentication type'),
    body('encryption').optional().isIn(['none', 'AES-128', 'AES-256', 'TKIP'])
        .withMessage('Invalid encryption type'),
    body('securityLevel').optional().isIn(['low', 'medium', 'high', 'maximum'])
        .withMessage('Invalid security level'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    try {
        const profileId = securityProfileService.createProfile(req.body);
        const profile = securityProfileService.getProfile(profileId);
        
        res.status(201).json({
            success: true,
            data: profile,
            message: 'Security profile created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Failed to create security profile',
            details: error.message
        });
    }
}));

/**
 * @route GET /api/security-profiles/:id/compatibility/:vendor
 * @desc Check vendor compatibility for a security profile
 * @access Public
 */
router.get('/:id/compatibility/:vendor', [
    param('id').notEmpty().withMessage('Profile ID is required'),
    param('vendor').isIn(['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba'])
        .withMessage('Invalid vendor'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    try {
        const compatibility = securityProfileService.checkVendorCompatibility(
            req.params.id, 
            req.params.vendor
        );
        
        res.json({
            success: true,
            data: compatibility
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: 'Security profile not found',
                details: error.message
            });
        }
        res.status(400).json({
            success: false,
            error: 'Failed to check vendor compatibility',
            details: error.message
        });
    }
}));

/**
 * @route GET /api/security-profiles/templates
 * @desc Get all security profile templates
 * @access Public
 */
router.get('/templates', asyncHandler(async (req, res) => {
    try {
        const templates = securityProfileService.getTemplates();
        res.json({
            success: true,
            data: templates,
            count: templates.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve security templates',
            details: error.message
        });
    }
}));

/**
 * @route POST /api/security-profiles/templates/:id/create
 * @desc Create security profile from template
 * @access Public
 */
router.post('/templates/:id/create', [
    param('id').notEmpty().withMessage('Template ID is required'),
    body('name').optional().isString(),
    body('description').optional().isString(),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    try {
        const profileId = securityProfileService.createFromTemplate(req.params.id, req.body);
        const profile = securityProfileService.getProfile(profileId);
        
        res.status(201).json({
            success: true,
            data: profile,
            message: 'Security profile created from template successfully'
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: 'Security template not found',
                details: error.message
            });
        }
        res.status(400).json({
            success: false,
            error: 'Failed to create profile from template',
            details: error.message
        });
    }
}));

/**
 * @route GET /api/security-profiles/statistics
 * @desc Get security profile statistics
 * @access Public
 */
router.get('/statistics', asyncHandler(async (req, res) => {
    try {
        const statistics = securityProfileService.getStatistics();
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            details: error.message
        });
    }
}));

module.exports = router;
