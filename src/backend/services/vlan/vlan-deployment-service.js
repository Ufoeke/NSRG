/**
 * VLAN Configuration Deployment and Validation Service
 * Handles deployment of VLAN configurations to switches and validates applied settings
 */

const { EventEmitter } = require('events');
const { SwitchFactory } = require('./vendors/switch-factory');
const VlanService = require('./vlan-service');
const { createServiceLogger } = require('../../../shared/logger');

class VLANDeploymentService extends EventEmitter {
    constructor() {
        super();
        this.vlanService = new VlanService();
        this.auditLogger = createServiceLogger('vlan-deployment');
        this.deploymentQueue = [];
        this.isProcessing = false;
        this.deploymentHistory = new Map();
    }

    /**
     * Deploy VLAN configuration to switch
     */
    async deployConfiguration(switchId, configuration, options = {}) {
        const deployment = {
            id: this.generateDeploymentId(),
            switchId,
            configuration,
            options,
            status: 'pending',
            startTime: new Date(),
            steps: []
        };

        try {
            this.auditLogger.info('Starting VLAN deployment', { deploymentId: deployment.id, switchId });

            // Validate configuration
            const validationResult = await this.validateConfiguration(configuration);
            if (!validationResult.isValid) {
                throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
            }

            deployment.steps.push({
                step: 'validation',
                status: 'completed',
                timestamp: new Date(),
                result: validationResult
            });

            // Get switch adapter
            const switchAdapter = await SwitchFactory.createAdapter(switchId);
            
            // Pre-deployment checks
            await this.performPreDeploymentChecks(switchAdapter, configuration);
            deployment.steps.push({
                step: 'pre_checks',
                status: 'completed',
                timestamp: new Date()
            });

            // Execute deployment
            let deploymentResult;
            if (options.dryRun) {
                deploymentResult = await this.performDryRun(switchAdapter, configuration);
            } else {
                deploymentResult = await this.performActualDeployment(switchAdapter, configuration);
            }

            deployment.steps.push({
                step: options.dryRun ? 'dry_run' : 'deployment',
                status: 'completed',
                timestamp: new Date(),
                result: deploymentResult
            });

            // Post-deployment validation (if not dry run)
            if (!options.dryRun) {
                const validationResult = await this.performPostDeploymentValidation(
                    switchAdapter, configuration
                );
                deployment.steps.push({
                    step: 'post_validation',
                    status: validationResult.isValid ? 'completed' : 'failed',
                    timestamp: new Date(),
                    result: validationResult
                });

                if (!validationResult.isValid) {
                    // Attempt rollback if validation fails
                    await this.performRollback(switchAdapter, configuration);
                    deployment.steps.push({
                        step: 'rollback',
                        status: 'completed',
                        timestamp: new Date()
                    });
                    throw new Error('Post-deployment validation failed, changes rolled back');
                }
            }

            deployment.status = 'completed';
            deployment.endTime = new Date();

            this.deploymentHistory.set(deployment.id, deployment);
            this.auditLogger.info('VLAN deployment completed successfully', { deploymentId: deployment.id });

            this.emit('deploymentCompleted', deployment);
            return deployment;

        } catch (error) {
            deployment.status = 'failed';
            deployment.error = error.message;
            deployment.endTime = new Date();
            
            this.deploymentHistory.set(deployment.id, deployment);
            this.auditLogger.error('VLAN deployment failed', { 
                deploymentId: deployment.id, 
                error: error.message 
            });

            this.emit('deploymentFailed', deployment);
            throw error;
        }
    }

    /**
     * Validate VLAN configuration before deployment
     */
    async validateConfiguration(configuration) {
        const errors = [];
        const warnings = [];

        // Validate VLAN IDs
        if (configuration.vlans) {
            for (const vlan of configuration.vlans) {
                if (!vlan.id || vlan.id < 1 || vlan.id > 4094) {
                    errors.push(`Invalid VLAN ID: ${vlan.id}`);
                }
                
                if (!vlan.name || vlan.name.length === 0) {
                    errors.push(`VLAN ${vlan.id} missing name`);
                }

                // Check for reserved VLAN ranges
                if (vlan.id === 1) {
                    warnings.push('Configuring default VLAN (1) - use with caution');
                }
                if (vlan.id >= 1002 && vlan.id <= 1005) {
                    warnings.push(`VLAN ${vlan.id} is in reserved range (1002-1005)`);
                }
            }
        }

        // Validate port configurations
        if (configuration.ports) {
            for (const port of configuration.ports) {
                if (!port.number || port.number < 1) {
                    errors.push(`Invalid port number: ${port.number}`);
                }

                if (port.mode === 'access' && !port.vlan) {
                    errors.push(`Access port ${port.number} missing VLAN assignment`);
                }

                if (port.mode === 'trunk' && (!port.allowedVlans || port.allowedVlans.length === 0)) {
                    warnings.push(`Trunk port ${port.number} has no allowed VLANs`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Perform pre-deployment checks
     */
    async performPreDeploymentChecks(switchAdapter, configuration) {
        // Check switch connectivity
        const isReachable = await switchAdapter.testConnection();
        if (!isReachable) {
            throw new Error('Switch is not reachable');
        }

        // Get current switch configuration
        const currentConfig = await switchAdapter.getCurrentConfiguration();
        
        // Check for conflicts
        const conflicts = this.detectConfigurationConflicts(currentConfig, configuration);
        if (conflicts.length > 0) {
            this.auditLogger.warn('Configuration conflicts detected', { conflicts });
        }

        // Check available resources
        const resources = await switchAdapter.getAvailableResources();
        if (!this.validateResourceAvailability(resources, configuration)) {
            throw new Error('Insufficient switch resources for deployment');
        }

        return { currentConfig, conflicts, resources };
    }

    /**
     * Perform dry run of configuration
     */
    async performDryRun(switchAdapter, configuration) {
        const result = {
            type: 'dry_run',
            changes: [],
            estimated_time: 0,
            risks: []
        };

        // Simulate VLAN creation
        if (configuration.vlans) {
            for (const vlan of configuration.vlans) {
                result.changes.push({
                    action: 'create_vlan',
                    vlan_id: vlan.id,
                    vlan_name: vlan.name,
                    estimated_time: 2000 // 2 seconds
                });
                result.estimated_time += 2000;
            }
        }

        // Simulate port configurations
        if (configuration.ports) {
            for (const port of configuration.ports) {
                result.changes.push({
                    action: 'configure_port',
                    port_number: port.number,
                    mode: port.mode,
                    vlan: port.vlan || port.allowedVlans,
                    estimated_time: 1000 // 1 second
                });
                result.estimated_time += 1000;

                // Add risk assessment
                if (port.mode === 'trunk' && port.allowedVlans?.includes(1)) {
                    result.risks.push({
                        level: 'medium',
                        description: `Port ${port.number} trunk includes management VLAN`
                    });
                }
            }
        }

        return result;
    }

    /**
     * Perform actual deployment
     */
    async performActualDeployment(switchAdapter, configuration) {
        const result = {
            type: 'deployment',
            applied_changes: [],
            failed_changes: [],
            total_time: 0
        };

        const startTime = Date.now();

        try {
            // Create VLANs first
            if (configuration.vlans) {
                for (const vlan of configuration.vlans) {
                    try {
                        await switchAdapter.createVLAN(vlan.id, vlan.name, vlan.description);
                        result.applied_changes.push({
                            action: 'create_vlan',
                            vlan_id: vlan.id,
                            status: 'success'
                        });
                    } catch (error) {
                        result.failed_changes.push({
                            action: 'create_vlan',
                            vlan_id: vlan.id,
                            error: error.message
                        });
                    }
                }
            }

            // Configure ports
            if (configuration.ports) {
                for (const port of configuration.ports) {
                    try {
                        if (port.mode === 'access') {
                            await switchAdapter.setPortAccessVLAN(port.number, port.vlan);
                        } else if (port.mode === 'trunk') {
                            await switchAdapter.setPortTrunkVLANs(port.number, port.allowedVlans);
                        }

                        result.applied_changes.push({
                            action: 'configure_port',
                            port_number: port.number,
                            status: 'success'
                        });
                    } catch (error) {
                        result.failed_changes.push({
                            action: 'configure_port',
                            port_number: port.number,
                            error: error.message
                        });
                    }
                }
            }

            result.total_time = Date.now() - startTime;
            return result;

        } catch (error) {
            result.total_time = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Validate deployed configuration
     */
    async performPostDeploymentValidation(switchAdapter, expectedConfiguration) {
        const validationResult = {
            isValid: true,
            validatedItems: [],
            discrepancies: []
        };

        try {
            // Validate VLANs
            if (expectedConfiguration.vlans) {
                const actualVlans = await switchAdapter.getAllVLANs();
                
                for (const expectedVlan of expectedConfiguration.vlans) {
                    const actualVlan = actualVlans.find(v => v.id === expectedVlan.id);
                    
                    if (!actualVlan) {
                        validationResult.discrepancies.push({
                            type: 'missing_vlan',
                            vlan_id: expectedVlan.id,
                            description: `VLAN ${expectedVlan.id} not found on switch`
                        });
                        validationResult.isValid = false;
                    } else if (actualVlan.name !== expectedVlan.name) {
                        validationResult.discrepancies.push({
                            type: 'vlan_name_mismatch',
                            vlan_id: expectedVlan.id,
                            expected: expectedVlan.name,
                            actual: actualVlan.name
                        });
                        validationResult.isValid = false;
                    } else {
                        validationResult.validatedItems.push({
                            type: 'vlan',
                            id: expectedVlan.id,
                            status: 'validated'
                        });
                    }
                }
            }

            // Validate port configurations
            if (expectedConfiguration.ports) {
                for (const expectedPort of expectedConfiguration.ports) {
                    const actualPort = await switchAdapter.getPortConfiguration(expectedPort.number);
                    
                    if (expectedPort.mode === 'access') {
                        if (actualPort.mode !== 'access' || actualPort.vlan !== expectedPort.vlan) {
                            validationResult.discrepancies.push({
                                type: 'port_config_mismatch',
                                port: expectedPort.number,
                                expected: { mode: 'access', vlan: expectedPort.vlan },
                                actual: { mode: actualPort.mode, vlan: actualPort.vlan }
                            });
                            validationResult.isValid = false;
                        } else {
                            validationResult.validatedItems.push({
                                type: 'port',
                                number: expectedPort.number,
                                status: 'validated'
                            });
                        }
                    }
                }
            }

            return validationResult;

        } catch (error) {
            validationResult.isValid = false;
            validationResult.error = error.message;
            return validationResult;
        }
    }

    /**
     * Rollback changes if validation fails
     */
    async performRollback(switchAdapter, configuration) {
        this.auditLogger.info('Starting configuration rollback');

        // Remove created VLANs
        if (configuration.vlans) {
            for (const vlan of configuration.vlans) {
                try {
                    await switchAdapter.deleteVLAN(vlan.id);
                } catch (error) {
                    this.auditLogger.error(`Failed to rollback VLAN ${vlan.id}`, { error: error.message });
                }
            }
        }

        // Reset port configurations
        if (configuration.ports) {
            for (const port of configuration.ports) {
                try {
                    await switchAdapter.resetPortToDefault(port.number);
                } catch (error) {
                    this.auditLogger.error(`Failed to rollback port ${port.number}`, { error: error.message });
                }
            }
        }

        this.auditLogger.info('Configuration rollback completed');
    }

    /**
     * Batch deployment operations
     */
    async deployBulkConfiguration(deployments) {
        const results = [];
        
        for (const deployment of deployments) {
            try {
                const result = await this.deployConfiguration(
                    deployment.switchId, 
                    deployment.configuration, 
                    deployment.options
                );
                results.push({ status: 'success', deployment: result });
            } catch (error) {
                results.push({ 
                    status: 'failed', 
                    switchId: deployment.switchId, 
                    error: error.message 
                });
            }
        }

        return results;
    }

    /**
     * Get deployment history
     */
    getDeploymentHistory(switchId = null) {
        const history = Array.from(this.deploymentHistory.values());
        
        if (switchId) {
            return history.filter(deployment => deployment.switchId === switchId);
        }
        
        return history;
    }

    /**
     * Get deployment status
     */
    getDeploymentStatus(deploymentId) {
        return this.deploymentHistory.get(deploymentId);
    }

    /**
     * Utility methods
     */
    generateDeploymentId() {
        return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    detectConfigurationConflicts(currentConfig, newConfig) {
        const conflicts = [];
        
        // Check for VLAN ID conflicts
        if (newConfig.vlans && currentConfig.vlans) {
            for (const newVlan of newConfig.vlans) {
                const existingVlan = currentConfig.vlans.find(v => v.id === newVlan.id);
                if (existingVlan && existingVlan.name !== newVlan.name) {
                    conflicts.push({
                        type: 'vlan_name_conflict',
                        vlan_id: newVlan.id,
                        existing_name: existingVlan.name,
                        new_name: newVlan.name
                    });
                }
            }
        }

        return conflicts;
    }

    validateResourceAvailability(resources, configuration) {
        // Check if switch has enough VLAN capacity
        if (configuration.vlans) {
            const requiredVlans = configuration.vlans.length;
            const availableVlans = resources.maxVlans - resources.usedVlans;
            
            if (requiredVlans > availableVlans) {
                return false;
            }
        }

        return true;
    }
}

module.exports = { VLANDeploymentService };