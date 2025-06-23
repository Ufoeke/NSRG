/**
 * Coverage Planning and Bandwidth Policy API Routes
 * 
 * RESTful API endpoints for wireless coverage planning, heat map generation,
 * bandwidth policy management, and QoS template administration.
 */

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const CoveragePlanningEngine = require('../services/coverage-planning-engine');

const router = express.Router();

// Initialize Coverage Planning Engine
const coverageEngine = new CoveragePlanningEngine();

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
    if (!coverageEngine.isReady()) {
        return res.status(503).json({
            success: false,
            message: 'Coverage Planning Engine is not ready',
            timestamp: new Date().toISOString()
        });
    }
    next();
};

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Coverage Planning API is working',
        timestamp: new Date().toISOString(),
        engineReady: coverageEngine.isReady()
    });
});

// Engine status endpoint
router.get('/status', async (req, res) => {
    try {
        const status = await coverageEngine.getEngineStatus();
        res.json({
            success: true,
            message: 'Engine status retrieved successfully',
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get engine status',
            error: error.message
        });
    }
});

// Coverage Areas Management
router.get('/coverage-areas', checkEngineReady, (req, res) => {
    try {
        const areas = coverageEngine.getCoverageAreas();
        res.json({
            success: true,
            message: 'Coverage areas retrieved successfully',
            data: {
                total: areas.length,
                areas: areas
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve coverage areas',
            error: error.message
        });
    }
});

// Get specific coverage area
router.get('/coverage-areas/:areaId', 
    checkEngineReady,
    param('areaId').notEmpty().withMessage('Area ID is required'),
    handleValidationErrors,
    (req, res) => {
        try {
            const { areaId } = req.params;
            const areas = coverageEngine.getCoverageAreas();
            const area = areas.find(a => a.id === areaId);
            
            if (!area) {
                return res.status(404).json({
                    success: false,
                    message: `Coverage area ${areaId} not found`
                });
            }

            res.json({
                success: true,
                message: 'Coverage area retrieved successfully',
                data: area
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve coverage area',
                error: error.message
            });
        }
    }
);

// Calculate coverage for an area
router.post('/coverage-areas/:areaId/calculate',
    checkEngineReady,
    param('areaId').notEmpty().withMessage('Area ID is required'),
    body('algorithm').optional().isIn(['grid-based', 'genetic', 'simulated-annealing']).withMessage('Invalid algorithm'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { areaId } = req.params;
            const { algorithm = 'grid-based' } = req.body;

            const result = await coverageEngine.calculateCoverage(areaId, algorithm);
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Coverage calculation failed',
                    error: result.error
                });
            }

            res.json({
                success: true,
                message: 'Coverage calculated successfully',
                data: result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to calculate coverage',
                error: error.message
            });
        }
    }
);

// Get heat map for an area
router.get('/coverage-areas/:areaId/heatmap',
    checkEngineReady,
    param('areaId').notEmpty().withMessage('Area ID is required'),
    handleValidationErrors,
    (req, res) => {
        try {
            const { areaId } = req.params;
            const areas = coverageEngine.getCoverageAreas();
            const area = areas.find(a => a.id === areaId);
            
            if (!area) {
                return res.status(404).json({
                    success: false,
                    message: `Coverage area ${areaId} not found`
                });
            }

            if (!area.heatMap) {
                return res.status(404).json({
                    success: false,
                    message: 'Heat map not available. Calculate coverage first.'
                });
            }

            res.json({
                success: true,
                message: 'Heat map retrieved successfully',
                data: {
                    areaId,
                    heatMap: area.heatMap,
                    stats: area.coverageStats,
                    lastCalculated: area.lastCalculated
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve heat map',
                error: error.message
            });
        }
    }
);

// Bandwidth Policies Management
router.get('/bandwidth-policies', checkEngineReady, (req, res) => {
    try {
        const policies = coverageEngine.getBandwidthPolicies();
        res.json({
            success: true,
            message: 'Bandwidth policies retrieved successfully',
            data: {
                total: policies.length,
                policies: policies
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve bandwidth policies',
            error: error.message
        });
    }
});

// Get specific bandwidth policy
router.get('/bandwidth-policies/:policyId',
    checkEngineReady,
    param('policyId').notEmpty().withMessage('Policy ID is required'),
    handleValidationErrors,
    (req, res) => {
        try {
            const { policyId } = req.params;
            const policies = coverageEngine.getBandwidthPolicies();
            const policy = policies.find(p => p.id === policyId);
            
            if (!policy) {
                return res.status(404).json({
                    success: false,
                    message: `Bandwidth policy ${policyId} not found`
                });
            }

            res.json({
                success: true,
                message: 'Bandwidth policy retrieved successfully',
                data: policy
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve bandwidth policy',
                error: error.message
            });
        }
    }
);

// Apply bandwidth policy to device
router.post('/bandwidth-policies/apply',
    checkEngineReady,
    body('deviceInfo').isObject().withMessage('Device info is required'),
    body('deviceInfo.userGroup').notEmpty().withMessage('User group is required'),
    body('deviceInfo.deviceType').notEmpty().withMessage('Device type is required'),
    body('policyId').optional().isString().withMessage('Policy ID must be a string'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { deviceInfo, policyId } = req.body;

            const result = await coverageEngine.applyBandwidthPolicy(deviceInfo, policyId);
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to apply bandwidth policy',
                    error: result.error
                });
            }

            res.json({
                success: true,
                message: 'Bandwidth policy applied successfully',
                data: result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to apply bandwidth policy',
                error: error.message
            });
        }
    }
);

// QoS Templates Management
router.get('/qos-templates', checkEngineReady, (req, res) => {
    try {
        const templates = coverageEngine.getQoSTemplates();
        res.json({
            success: true,
            message: 'QoS templates retrieved successfully',
            data: {
                total: templates.length,
                templates: templates
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve QoS templates',
            error: error.message
        });
    }
});

// Get specific QoS template
router.get('/qos-templates/:templateId',
    checkEngineReady,
    param('templateId').notEmpty().withMessage('Template ID is required'),
    handleValidationErrors,
    (req, res) => {
        try {
            const { templateId } = req.params;
            const templates = coverageEngine.getQoSTemplates();
            const template = templates.find(t => t.id === templateId);
            
            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: `QoS template ${templateId} not found`
                });
            }

            res.json({
                success: true,
                message: 'QoS template retrieved successfully',
                data: template
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve QoS template',
                error: error.message
            });
        }
    }
);

// RF Models Management
router.get('/rf-models', checkEngineReady, (req, res) => {
    try {
        const models = coverageEngine.getRFModels();
        res.json({
            success: true,
            message: 'RF models retrieved successfully',
            data: {
                total: models.length,
                models: models
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve RF models',
            error: error.message
        });
    }
});

// Planning Algorithms Management
router.get('/planning-algorithms', checkEngineReady, (req, res) => {
    try {
        const algorithms = coverageEngine.getPlanningAlgorithms();
        res.json({
            success: true,
            message: 'Planning algorithms retrieved successfully',
            data: {
                total: algorithms.length,
                algorithms: algorithms
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve planning algorithms',
            error: error.message
        });
    }
});

// Coverage Statistics and Analytics
router.get('/analytics/coverage-summary', checkEngineReady, (req, res) => {
    try {
        const areas = coverageEngine.getCoverageAreas();
        const summary = {
            totalAreas: areas.length,
            areasWithHeatMaps: areas.filter(a => a.heatMap).length,
            averageCoverage: 0,
            totalAccessPoints: 0,
            coverageDistribution: {
                excellent: 0,
                good: 0,
                fair: 0,
                poor: 0,
                'no-signal': 0
            }
        };

        let totalCoverage = 0;
        let areasWithStats = 0;

        areas.forEach(area => {
            summary.totalAccessPoints += area.accessPoints.length;
            
            if (area.coverageStats) {
                totalCoverage += area.coverageStats.coveragePercentage;
                areasWithStats++;
                
                // Aggregate signal quality distribution
                Object.keys(area.coverageStats.signalQualityDistribution).forEach(quality => {
                    summary.coverageDistribution[quality] += area.coverageStats.signalQualityDistribution[quality];
                });
            }
        });

        if (areasWithStats > 0) {
            summary.averageCoverage = Math.round((totalCoverage / areasWithStats) * 100) / 100;
        }

        res.json({
            success: true,
            message: 'Coverage summary retrieved successfully',
            data: summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve coverage summary',
            error: error.message
        });
    }
});

// Bandwidth Policy Analytics
router.get('/analytics/bandwidth-summary', checkEngineReady, (req, res) => {
    try {
        const policies = coverageEngine.getBandwidthPolicies();
        const summary = {
            totalPolicies: policies.length,
            policyDistribution: {},
            qosDistribution: {},
            averageDownloadLimit: 0,
            averageUploadLimit: 0
        };

        let totalDownload = 0;
        let totalUpload = 0;

        policies.forEach(policy => {
            // Policy distribution by user group
            policy.userGroups.forEach(group => {
                summary.policyDistribution[group] = (summary.policyDistribution[group] || 0) + 1;
            });

            // QoS template distribution
            summary.qosDistribution[policy.qosTemplate] = (summary.qosDistribution[policy.qosTemplate] || 0) + 1;

            // Calculate average limits (convert to Mbps for calculation)
            const downloadMbps = this.convertToMbps(policy.downloadLimit);
            const uploadMbps = this.convertToMbps(policy.uploadLimit);
            
            totalDownload += downloadMbps;
            totalUpload += uploadMbps;
        });

        summary.averageDownloadLimit = Math.round((totalDownload / policies.length) * 100) / 100;
        summary.averageUploadLimit = Math.round((totalUpload / policies.length) * 100) / 100;

        res.json({
            success: true,
            message: 'Bandwidth summary retrieved successfully',
            data: summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve bandwidth summary',
            error: error.message
        });
    }
});

// Helper function to convert bandwidth strings to Mbps
function convertToMbps(bandwidth) {
    const value = parseInt(bandwidth);
    const unit = bandwidth.toLowerCase();
    
    if (unit.includes('gbps')) {
        return value * 1000;
    } else if (unit.includes('kbps')) {
        return value / 1000;
    } else {
        return value; // Assume Mbps
    }
}

module.exports = router; 