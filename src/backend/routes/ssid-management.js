/**
 * SSID Management API Routes
 * RESTful endpoints for the SSID Management and Naming Convention Engine
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const SSIDManagementService = require('../services/wireless/ssid-management-service');

const router = express.Router();

// Initialize the SSID management service
const ssidService = new SSIDManagementService();

/**
 * Error handler middleware
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
 * Async error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ===============================
// DRIVER MANAGEMENT
// ===============================

/**
 * GET /api/ssid-management/drivers
 * Get all connected drivers
 */
router.get('/drivers', asyncHandler(async (req, res) => {
    const drivers = ssidService.getDrivers();
    res.json({
        success: true,
        data: drivers
    });
}));

/**
 * POST /api/ssid-management/drivers
 * Add a new driver
 */
router.post('/drivers', [
    body('id').notEmpty().withMessage('Driver ID is required'),
    body('vendor').isIn(['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba'])
        .withMessage('Invalid vendor type'),
    body('config').isObject().withMessage('Driver config must be an object'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id, vendor, config } = req.body;
    
    const driverId = await ssidService.addDriver(id, vendor, config);
    
    res.status(201).json({
        success: true,
        data: { driverId },
        message: `${vendor} driver added successfully`
    });
}));

/**
 * DELETE /api/ssid-management/drivers/:id
 * Remove a driver
 */
router.delete('/drivers/:id', [
    param('id').notEmpty().withMessage('Driver ID is required'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const removed = await ssidService.removeDriver(id);
    
    res.json({
        success: true,
        data: { removed },
        message: `Driver ${id} removed successfully`
    });
}));// ===============================
// TEMPLATE MANAGEMENT
// ===============================

/**
 * GET /api/ssid-management/templates
 * Get all SSID templates
 */
router.get('/templates', asyncHandler(async (req, res) => {
    const templates = ssidService.getTemplates();
    res.json({
        success: true,
        data: templates
    });
}));

/**
 * GET /api/ssid-management/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', [
    param('id').notEmpty().withMessage('Template ID is required'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const template = ssidService.getTemplate(id);
    
    res.json({
        success: true,
        data: template
    });
}));

/**
 * POST /api/ssid-management/templates
 * Create a new SSID template
 */
router.post('/templates', [
    body('name').notEmpty().withMessage('Template name is required'),
    body('pattern').notEmpty().withMessage('Template pattern is required'),
    body('description').optional().isString(),
    body('variables').optional().isObject(),
    body('securityProfile').optional().isIn(['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise']),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const template = req.body;
    
    const templateId = ssidService.addTemplate(template);
    
    res.status(201).json({
        success: true,
        data: { templateId, template: ssidService.getTemplate(templateId) },
        message: 'Template created successfully'
    });
}));

/**
 * PUT /api/ssid-management/templates/:id
 * Update an existing template
 */
router.put('/templates/:id', [
    param('id').notEmpty().withMessage('Template ID is required'),
    body('name').optional().isString(),
    body('pattern').optional().isString(),
    body('description').optional().isString(),
    body('variables').optional().isObject(),
    body('securityProfile').optional().isIn(['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise']),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    const updated = ssidService.updateTemplate(id, updates);
    
    res.json({
        success: true,
        data: { updated, template: ssidService.getTemplate(id) },
        message: 'Template updated successfully'
    });
}));

/**
 * DELETE /api/ssid-management/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', [
    param('id').notEmpty().withMessage('Template ID is required'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const removed = ssidService.removeTemplate(id);
    
    res.json({
        success: true,
        data: { removed },
        message: 'Template deleted successfully'
    });
}));// ===============================
// SSID GENERATION & VALIDATION
// ===============================

/**
 * POST /api/ssid-management/ssid/generate
 * Generate SSID from template
 */
router.post('/ssid/generate', [
    body('templateId').notEmpty().withMessage('Template ID is required'),
    body('variables').isObject().withMessage('Variables must be an object'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { templateId, variables } = req.body;
    
    const ssidConfig = ssidService.generateSSIDFromTemplate(templateId, variables);
    
    res.json({
        success: true,
        data: ssidConfig,
        message: 'SSID generated successfully'
    });
}));

/**
 * POST /api/ssid-management/ssid/validate-name
 * Validate SSID name against naming conventions
 */
router.post('/ssid/validate-name', [
    body('name').notEmpty().withMessage('SSID name is required'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    try {
        ssidService.validateSSIDName(name);
        const isUnique = await ssidService.isSSIDNameUnique(name);
        
        res.json({
            success: true,
            data: {
                name,
                valid: true,
                unique: isUnique,
                message: isUnique ? 'SSID name is valid and unique' : 'SSID name is valid but already exists'
            }
        });
    } catch (error) {
        res.json({
            success: true,
            data: {
                name,
                valid: false,
                unique: false,
                message: error.message
            }
        });
    }
}));

// ===============================
// SSID DEPLOYMENT
// ===============================

/**
 * POST /api/ssid-management/ssid/deploy
 * Deploy SSID to access points
 */
router.post('/ssid/deploy', [
    body('ssidConfig').isObject().withMessage('SSID configuration is required'),
    body('ssidConfig.name').notEmpty().withMessage('SSID name is required'),
    body('targetDrivers').optional().isArray(),
    body('options').optional().isObject(),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { ssidConfig, targetDrivers, options } = req.body;
    
    const deployment = await ssidService.deploySSID(ssidConfig, targetDrivers, options);
    
    res.status(201).json({
        success: true,
        data: deployment,
        message: `SSID deployment initiated for ${ssidConfig.name}`
    });
}));

/**
 * GET /api/ssid-management/deployments
 * Get deployment history
 */
router.get('/deployments', [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const limit = req.query.limit || 50;
    
    const deployments = ssidService.getDeploymentHistory(limit);
    
    res.json({
        success: true,
        data: deployments
    });
}));

/**
 * GET /api/ssid-management/deployments/active
 * Get active deployments
 */
router.get('/deployments/active', asyncHandler(async (req, res) => {
    const activeDeployments = ssidService.getActiveDeployments();
    
    res.json({
        success: true,
        data: activeDeployments
    });
}));/**
 * POST /api/ssid-management/deployments/:id/rollback
 * Rollback a deployment
 */
router.post('/deployments/:id/rollback', [
    param('id').notEmpty().withMessage('Deployment ID is required'),
    body('options').optional().isObject(),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { options } = req.body;
    
    const rollbackResult = await ssidService.rollbackDeployment(id, options);
    
    res.json({
        success: true,
        data: rollbackResult,
        message: `Rollback initiated for deployment ${id}`
    });
}));

// ===============================
// SSID OPERATIONS
// ===============================

/**
 * PUT /api/ssid-management/ssid/:name
 * Update SSID across all drivers
 */
router.put('/ssid/:name', [
    param('name').notEmpty().withMessage('SSID name is required'),
    body('updates').isObject().withMessage('Updates must be an object'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { updates } = req.body;
    
    const result = await ssidService.updateSSID(name, updates);
    
    res.json({
        success: true,
        data: result,
        message: `SSID ${name} update completed`
    });
}));

/**
 * DELETE /api/ssid-management/ssid/:name
 * Delete SSID from all drivers
 */
router.delete('/ssid/:name', [
    param('name').notEmpty().withMessage('SSID name is required'),
    handleValidationErrors
], asyncHandler(async (req, res) => {
    const { name } = req.params;
    
    const result = await ssidService.deleteSSID(name);
    
    res.json({
        success: true,
        data: result,
        message: `SSID ${name} deletion completed`
    });
}));

/**
 * GET /api/ssid-management/ssid/status
 * Get comprehensive SSID status across all drivers
 */
router.get('/ssid/status', asyncHandler(async (req, res) => {
    const status = await ssidService.getSSIDStatus();
    
    res.json({
        success: true,
        data: status
    });
}));

// ===============================
// SERVICE MANAGEMENT
// ===============================

/**
 * GET /api/ssid-management/health
 * Health check endpoint
 */
router.get('/health', asyncHandler(async (req, res) => {
    const drivers = ssidService.getDrivers();
    const activeDeployments = ssidService.getActiveDeployments();
    
    res.json({
        success: true,
        data: {
            service: 'SSID Management Service',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            drivers: {
                total: drivers.length,
                connected: drivers.filter(d => d.connected).length
            },
            activeDeployments: activeDeployments.length,
            templates: ssidService.getTemplates().length
        }
    });
}));

/**
 * POST /api/ssid-management/cleanup
 * Cleanup service resources
 */
router.post('/cleanup', asyncHandler(async (req, res) => {
    await ssidService.cleanup();
    
    res.json({
        success: true,
        message: 'Service cleanup completed'
    });
}));

// ===============================
// ERROR HANDLING
// ===============================

/**
 * Global error handler for this router
 */
router.use((error, req, res, next) => {
    console.error('SSID Management API Error:', error);
    
    res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;