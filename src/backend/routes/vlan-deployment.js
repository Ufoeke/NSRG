/**
 * VLAN Deployment API Routes
 * Handles VLAN configuration deployment, validation, and monitoring
 */

const express = require('express');
const { VLANDeploymentService } = require('../services/vlan/vlan-deployment-service');
const { body, param, query } = require('express-validator');

const router = express.Router();
const deploymentService = new VLANDeploymentService();

// Simple validation middleware
const validateRequest = (req, res, next) => {
    // For now, just pass through - in production, use express-validator
    next();
};

// Simple auth middleware placeholder
const authMiddleware = (req, res, next) => {
    // For now, just pass through - in production, implement proper auth
    next();
};

/**
 * Deploy VLAN configuration to a switch
 */
router.post('/deploy', 
    authMiddleware,
    validateRequest,
    async (req, res) => {
        try {
            const { switchId, configuration, options = {} } = req.body;

            if (!switchId || !configuration) {
                return res.status(400).json({
                    success: false,
                    error: 'switchId and configuration are required'
                });
            }

            const deployment = await deploymentService.deployConfiguration(
                switchId, 
                configuration, 
                options
            );

            res.json({
                success: true,
                deploymentId: deployment.id,
                status: deployment.status,
                steps: deployment.steps,
                duration: deployment.endTime ? 
                    deployment.endTime.getTime() - deployment.startTime.getTime() : null
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
                details: error.details || null
            });
        }
    }
);

/**
 * Perform bulk VLAN assignment
 */
router.post('/bulk-assign',
    authMiddleware,
    validateRequest,
    async (req, res) => {
        try {
            const { switchId, operation, vlanId, ports, dryRun = false } = req.body;

            if (!switchId || !operation || !ports || !Array.isArray(ports)) {
                return res.status(400).json({
                    success: false,
                    error: 'switchId, operation, and ports array are required'
                });
            }

            let configuration;
            if (operation === 'vlan_assignment') {
                configuration = {
                    ports: ports.map(portNumber => ({
                        number: portNumber,
                        mode: 'access',
                        vlan: vlanId
                    }))
                };
            }

            const deployment = await deploymentService.deployConfiguration(
                switchId,
                configuration,
                { dryRun }
            );

            res.json({
                success: true,
                deploymentId: deployment.id,
                affectedPorts: ports,
                vlanId: vlanId,
                dryRun: dryRun,
                result: deployment.steps[deployment.steps.length - 1]?.result
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * Validate configuration without deploying
 */
router.post('/validate',
    authMiddleware,
    validateRequest,
    async (req, res) => {
        try {
            const { configuration } = req.body;

            if (!configuration) {
                return res.status(400).json({
                    success: false,
                    error: 'Configuration object is required'
                });
            }

            const validation = await deploymentService.validateConfiguration(configuration);

            res.json({
                success: true,
                validation
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * Get deployment status
 */
router.get('/deployment/:deploymentId',
    authMiddleware,
    validateRequest,
    async (req, res) => {
        try {
            const { deploymentId } = req.params;

            if (!deploymentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Deployment ID is required'
                });
            }

            const deployment = deploymentService.getDeploymentStatus(deploymentId);

            if (!deployment) {
                return res.status(404).json({
                    success: false,
                    error: 'Deployment not found'
                });
            }

            res.json({
                success: true,
                deployment: {
                    id: deployment.id,
                    switchId: deployment.switchId,
                    status: deployment.status,
                    startTime: deployment.startTime,
                    endTime: deployment.endTime,
                    steps: deployment.steps,
                    error: deployment.error
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * Get deployment history
 */
router.get('/history',
    authMiddleware,
    validateRequest,
    async (req, res) => {
        try {
            const { switchId, limit = 50, offset = 0 } = req.query;

            let history = deploymentService.getDeploymentHistory(switchId);
            
            // Sort by start time (newest first)
            history.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

            // Apply pagination
            const total = history.length;
            history = history.slice(offset, offset + parseInt(limit));

            res.json({
                success: true,
                history: history.map(deployment => ({
                    id: deployment.id,
                    switchId: deployment.switchId,
                    status: deployment.status,
                    startTime: deployment.startTime,
                    endTime: deployment.endTime,
                    duration: deployment.endTime ? 
                        deployment.endTime.getTime() - deployment.startTime.getTime() : null,
                    stepsCount: deployment.steps.length
                })),
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: offset + parseInt(limit) < total
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * Get switch deployment statistics
 */
router.get('/stats/:switchId?',
    authMiddleware,
    async (req, res) => {
        try {
            const { switchId } = req.params;
            const history = deploymentService.getDeploymentHistory(switchId);

            const stats = {
                totalDeployments: history.length,
                successful: history.filter(d => d.status === 'completed').length,
                failed: history.filter(d => d.status === 'failed').length,
                inProgress: history.filter(d => d.status === 'pending').length,
                averageDuration: 0,
                recentActivity: []
            };

            // Calculate average duration for completed deployments
            const completedDeployments = history.filter(d => d.status === 'completed' && d.endTime);
            if (completedDeployments.length > 0) {
                const totalDuration = completedDeployments.reduce((sum, d) => 
                    sum + (d.endTime.getTime() - d.startTime.getTime()), 0
                );
                stats.averageDuration = Math.round(totalDuration / completedDeployments.length);
            }

            // Get recent activity (last 10 deployments)
            stats.recentActivity = history
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                .slice(0, 10)
                .map(d => ({
                    id: d.id,
                    status: d.status,
                    startTime: d.startTime,
                    duration: d.endTime ? d.endTime.getTime() - d.startTime.getTime() : null
                }));

            res.json({
                success: true,
                stats
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Event listeners for deployment service
deploymentService.on('deploymentCompleted', (deployment) => {
    console.log(`Deployment ${deployment.id} completed successfully`);
});

deploymentService.on('deploymentFailed', (deployment) => {
    console.error(`Deployment ${deployment.id} failed: ${deployment.error}`);
});

module.exports = router;