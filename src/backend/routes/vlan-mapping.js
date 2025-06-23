/**
 * VLAN Mapping API Routes
 * 
 * RESTful API endpoints for VLAN assignment and network mapping functionality
 */

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const VLANMappingEngine = require('../services/vlan-mapping-engine');

const router = express.Router();

// Initialize VLAN Mapping Engine
const vlanEngine = new VLANMappingEngine();

// Error handling middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation errors',
            errors: errors.array()
        });
    }
    next();
};

// Check if engine is ready middleware
const checkEngineReady = (req, res, next) => {
    if (!vlanEngine.isReady()) {
        return res.status(503).json({
            success: false,
            message: 'VLAN Mapping Engine is not ready yet'
        });
    }
    next();
};

/**
 * @route GET /api/vlan-mapping/status
 * @desc Get VLAN mapping engine status
 * @access Public
 */
router.get('/status', (req, res) => {
    try {
        res.json({
            success: true,
            status: vlanEngine.isReady() ? 'ready' : 'initializing',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get status',
            error: error.message
        });
    }
});

/**
 * @route POST /api/vlan-mapping/assign
 * @desc Assign VLAN to a device
 * @access Public
 */
router.post('/assign',
    checkEngineReady,
    [
        body('macAddress').isString().notEmpty().withMessage('MAC address is required'),
        body('deviceType').isString().notEmpty().withMessage('Device type is required'),
        body('userGroup').optional().isString(),
        body('location').optional().isString(),
        body('accessPointId').optional().isString(),
        body('authenticationType').optional().isString()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const deviceInfo = req.body;
            const result = await vlanEngine.assignVLAN(deviceInfo);
            
            if (result.success) {
                res.json({
                    success: true,
                    message: 'VLAN assigned successfully',
                    data: result
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'VLAN assignment failed',
                    error: result.error
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error during VLAN assignment',
                error: error.message
            });
        }
    }
);

/**
 * @route GET /api/vlan-mapping/rules
 * @desc Get all mapping rules
 * @access Public
 */
router.get('/rules', checkEngineReady, (req, res) => {
    try {
        const rules = vlanEngine.getMappingRules();
        res.json({
            success: true,
            message: 'Mapping rules retrieved successfully',
            data: {
                total: rules.length,
                rules
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve mapping rules',
            error: error.message
        });
    }
});

/**
 * @route GET /api/vlan-mapping/user-groups
 * @desc Get all user groups
 * @access Public
 */
router.get('/user-groups', checkEngineReady, (req, res) => {
    try {
        const userGroups = vlanEngine.getUserGroups();
        res.json({
            success: true,
            message: 'User groups retrieved successfully',
            data: {
                total: userGroups.length,
                userGroups
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user groups',
            error: error.message
        });
    }
});

/**
 * @route GET /api/vlan-mapping/device-profiles
 * @desc Get all device profiles
 * @access Public
 */
router.get('/device-profiles', checkEngineReady, (req, res) => {
    try {
        const deviceProfiles = vlanEngine.getDeviceProfiles();
        res.json({
            success: true,
            message: 'Device profiles retrieved successfully',
            data: {
                total: deviceProfiles.length,
                deviceProfiles
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve device profiles',
            error: error.message
        });
    }
});

/**
 * @route GET /api/vlan-mapping/vlans
 * @desc Get all default VLANs
 * @access Public
 */
router.get('/vlans', checkEngineReady, (req, res) => {
    try {
        const vlans = vlanEngine.getDefaultVLANs();
        res.json({
            success: true,
            message: 'VLANs retrieved successfully',
            data: {
                total: vlans.length,
                vlans
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve VLANs',
            error: error.message
        });
    }
});

/**
 * @route GET /api/vlan-mapping/topology
 * @desc Get network topology
 * @access Public
 */
router.get('/topology', checkEngineReady, async (req, res) => {
    try {
        const topology = await vlanEngine.getNetworkTopology();
        res.json({
            success: true,
            message: 'Network topology retrieved successfully',
            data: topology
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve network topology',
            error: error.message
        });
    }
});

/**
 * @route GET /api/vlan-mapping/assignments
 * @desc Get assignment history with optional filters
 * @access Public
 */
router.get('/assignments',
    checkEngineReady,
    [
        query('vlanId').optional().isInt().withMessage('VLAN ID must be an integer'),
        query('deviceType').optional().isString(),
        query('status').optional().isString(),
        query('startDate').optional().isISO8601().withMessage('Start date must be in ISO format'),
        query('endDate').optional().isISO8601().withMessage('End date must be in ISO format'),
        query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const filters = req.query;
            const history = await vlanEngine.getAssignmentHistory(filters);
            res.json({
                success: true,
                message: 'Assignment history retrieved successfully',
                data: history
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve assignment history',
                error: error.message
            });
        }
    }
);

/**
 * @route GET /api/vlan-mapping/statistics
 * @desc Get VLAN assignment statistics
 * @access Public
 */
router.get('/statistics', checkEngineReady, async (req, res) => {
    try {
        const stats = await vlanEngine.getVLANStatistics();
        res.json({
            success: true,
            message: 'VLAN statistics retrieved successfully',
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve VLAN statistics',
            error: error.message
        });
    }
});

/**
 * @route POST /api/vlan-mapping/validate
 * @desc Validate a potential VLAN assignment without actually assigning
 * @access Public
 */
router.post('/validate',
    checkEngineReady,
    [
        body('macAddress').isString().notEmpty().withMessage('MAC address is required'),
        body('deviceType').isString().notEmpty().withMessage('Device type is required'),
        body('userGroup').optional().isString(),
        body('location').optional().isString(),
        body('accessPointId').optional().isString(),
        body('authenticationType').optional().isString()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const deviceInfo = req.body;
            
            // Get assignment without actually assigning
            const assignment = await vlanEngine.evaluateAssignmentRules(deviceInfo);
            const validation = await vlanEngine.validateVLANAssignment(assignment, deviceInfo);
            
            res.json({
                success: true,
                message: 'VLAN assignment validated',
                data: {
                    assignment,
                    validation,
                    wouldAssign: validation.isValid
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to validate VLAN assignment',
                error: error.message
            });
        }
    }
);

/**
 * @route DELETE /api/vlan-mapping/assignments/:assignmentId
 * @desc Revoke a VLAN assignment
 * @access Public
 */
router.delete('/assignments/:assignmentId',
    checkEngineReady,
    [
        param('assignmentId').isString().notEmpty().withMessage('Assignment ID is required')
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { assignmentId } = req.params;
            const result = await vlanEngine.revokeVLANAssignment(assignmentId);
            
            if (result.success) {
                res.json({
                    success: true,
                    message: 'VLAN assignment revoked successfully',
                    data: result
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to revoke VLAN assignment',
                    error: result.error
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Internal server error during assignment revocation',
                error: error.message
            });
        }
    }
);

/**
 * @route GET /api/vlan-mapping/test
 * @desc Test endpoint for development
 * @access Public
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'VLAN Mapping API is working',
        timestamp: new Date().toISOString(),
        engineReady: vlanEngine.isReady()
    });
});

// Event listeners for VLAN engine events
vlanEngine.on('vlan-assigned', (data) => {
    console.log(`VLAN Assignment Event: Device ${data.device.macAddress} assigned to VLAN ${data.assignment.vlanId}`);
});

vlanEngine.on('assignment-error', (data) => {
    console.error(`VLAN Assignment Error: Device ${data.device.macAddress} - ${data.error}`);
});

vlanEngine.on('assignment-revoked', (data) => {
    console.log(`VLAN Assignment Revoked: Assignment ${data.assignmentId} for device ${data.device.macAddress}`);
});

vlanEngine.on('initialized', (data) => {
    console.log(`VLAN Mapping Engine initialized at ${data.timestamp}`);
});

vlanEngine.on('error', (data) => {
    console.error(`VLAN Mapping Engine Error: ${data.error} at ${data.timestamp}`);
});

module.exports = router; 