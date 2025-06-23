const SwitchFactory = require('./vendors/switch-factory');
const VLANService = require('./vlan-service');

class PortMappingManager {
    constructor() {
        this.switchFactory = new SwitchFactory();
        this.vlanService = new VLANService();
        this.portProfiles = new Map();
        this.bulkOperations = new Map();
        this.portTemplates = this._initializePortTemplates();
    }

    /**
     * Discover and inventory all ports on a switch
     * @param {string} switchId - Switch identifier
     * @returns {Promise<Object>} Port inventory
     */
    async discoverSwitchPorts(switchId) {
        try {
            const switchAdapter = await this.switchFactory.createSwitch(switchId);
            const portInfo = await switchAdapter.getPortInventory();
            
            const inventory = {
                switchId: switchId,
                totalPorts: portInfo.ports.length,
                portsByType: this._categorizePortsByType(portInfo.ports),
                portsByStatus: this._categorizePortsByStatus(portInfo.ports),
                uplinks: portInfo.ports.filter(port => port.isUplink),
                accessPorts: portInfo.ports.filter(port => port.type === 'access'),
                trunkPorts: portInfo.ports.filter(port => port.type === 'trunk'),
                unusedPorts: portInfo.ports.filter(port => port.status === 'down' && !port.isConnected),
                discoveredAt: new Date().toISOString()
            };

            // Store inventory in database
            await this._storePortInventory(switchId, inventory);
            
            return inventory;
        } catch (error) {
            throw new Error(`Failed to discover ports on switch ${switchId}: ${error.message}`);
        }
    }

    /**
     * Map a port to a VLAN with configuration
     * @param {Object} portMapping - Port mapping configuration
     * @returns {Promise<Object>} Mapping result
     */
    async mapPortToVLAN(portMapping) {
        const {
            switchId,
            portNumber,
            vlanId,
            portType = 'access', // access, trunk, hybrid
            allowedVLANs = [],
            nativeVLAN = null,
            portProfile = null,
            description = null,
            securitySettings = {}
        } = portMapping;

        try {
            // Validate inputs
            await this._validatePortMapping(portMapping);
            
            const switchAdapter = await this.switchFactory.createSwitch(switchId);
            
            // Get current port configuration
            const currentConfig = await switchAdapter.getPortConfiguration(portNumber);
            
            // Prepare new configuration
            const newConfig = {
                portNumber: portNumber,
                type: portType,
                vlanId: portType === 'access' ? vlanId : nativeVLAN,
                allowedVLANs: portType === 'trunk' ? allowedVLANs : [vlanId],
                nativeVLAN: nativeVLAN,
                description: description || `Port ${portNumber} - VLAN ${vlanId}`,
                securitySettings: {
                    portSecurity: securitySettings.portSecurity || false,
                    maxMacAddresses: securitySettings.maxMacAddresses || 1,
                    violationAction: securitySettings.violationAction || 'restrict',
                    ...securitySettings
                }
            };

            // Apply port profile if specified
            if (portProfile) {
                const profile = this.portProfiles.get(portProfile);
                if (profile) {
                    Object.assign(newConfig, profile);
                }
            }

            // Configure the port
            const result = await switchAdapter.configurePort(newConfig);
            
            // Store mapping in database
            await this._storePortMapping({
                switchId,
                portNumber,
                vlanId,
                configuration: newConfig,
                previousConfiguration: currentConfig,
                appliedAt: new Date().toISOString(),
                appliedBy: 'system' // Would be user ID in real system
            });

            // Verify configuration was applied correctly
            const verificationResult = await this._verifyPortConfiguration(switchId, portNumber, newConfig);
            
            return {
                success: true,
                switchId: switchId,
                portNumber: portNumber,
                vlanId: vlanId,
                configuration: newConfig,
                verificationResult: verificationResult,
                appliedAt: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`Failed to map port ${portNumber} to VLAN ${vlanId}: ${error.message}`);
        }
    }

    /**
     * Configure multiple ports in bulk
     * @param {Array} portMappings - Array of port mapping configurations
     * @param {Object} options - Bulk operation options
     * @returns {Promise<Object>} Bulk operation result
     */
    async bulkConfigurePorts(portMappings, options = {}) {
        const {
            rollbackOnFailure = true,
            batchSize = 10,
            delayBetweenBatches = 1000,
            validateFirst = true
        } = options;

        const operationId = `bulk_${Date.now()}`;
        const results = {
            operationId: operationId,
            totalPorts: portMappings.length,
            successful: [],
            failed: [],
            rollbackRequired: false,
            startedAt: new Date().toISOString()
        };

        try {
            // Validate all mappings first if requested
            if (validateFirst) {
                for (const mapping of portMappings) {
                    await this._validatePortMapping(mapping);
                }
            }

            // Store operation info for potential rollback
            this.bulkOperations.set(operationId, {
                originalConfigurations: new Map(),
                appliedConfigurations: new Map()
            });

            // Process in batches
            for (let i = 0; i < portMappings.length; i += batchSize) {
                const batch = portMappings.slice(i, i + batchSize);
                
                // Execute batch in parallel
                const batchPromises = batch.map(async (mapping) => {
                    try {
                        // Store original configuration for rollback
                        const switchAdapter = await this.switchFactory.createSwitch(mapping.switchId);
                        const originalConfig = await switchAdapter.getPortConfiguration(mapping.portNumber);
                        
                        this.bulkOperations.get(operationId).originalConfigurations.set(
                            `${mapping.switchId}-${mapping.portNumber}`, 
                            originalConfig
                        );

                        // Apply new configuration
                        const result = await this.mapPortToVLAN(mapping);
                        results.successful.push(result);
                        
                        return result;
                    } catch (error) {
                        const failureResult = {
                            switchId: mapping.switchId,
                            portNumber: mapping.portNumber,
                            error: error.message,
                            failedAt: new Date().toISOString()
                        };
                        results.failed.push(failureResult);
                        
                        if (rollbackOnFailure) {
                            results.rollbackRequired = true;
                            throw error; // Stop processing if rollback is required
                        }
                        
                        return failureResult;
                    }
                });

                await Promise.allSettled(batchPromises);
                
                // Delay between batches to avoid overwhelming switches
                if (i + batchSize < portMappings.length) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            }

            // Handle rollback if required
            if (results.rollbackRequired && rollbackOnFailure) {
                const rollbackResult = await this._rollbackBulkOperation(operationId);
                results.rollbackResult = rollbackResult;
            }

            results.completedAt = new Date().toISOString();
            return results;
            
        } catch (error) {
            results.error = error.message;
            results.completedAt = new Date().toISOString();
            
            if (rollbackOnFailure) {
                try {
                    const rollbackResult = await this._rollbackBulkOperation(operationId);
                    results.rollbackResult = rollbackResult;
                } catch (rollbackError) {
                    results.rollbackError = rollbackError.message;
                }
            }
            
            throw error;
        } finally {
            // Clean up operation data after delay
            setTimeout(() => {
                this.bulkOperations.delete(operationId);
            }, 300000); // 5 minutes
        }
    }

    /**
     * Create and apply a port profile
     * @param {Object} profileConfig - Port profile configuration
     * @returns {Promise<Object>} Profile creation result
     */
    async createPortProfile(profileConfig) {
        const {
            name,
            description,
            type = 'access',
            defaultVLAN = null,
            allowedVLANs = [],
            securitySettings = {},
            qosSettings = {},
            powerSettings = {},
            monitoringSettings = {}
        } = profileConfig;

        const profile = {
            name: name,
            description: description,
            type: type,
            defaultVLAN: defaultVLAN,
            allowedVLANs: allowedVLANs,
            securitySettings: {
                portSecurity: securitySettings.portSecurity || false,
                maxMacAddresses: securitySettings.maxMacAddresses || 1,
                violationAction: securitySettings.violationAction || 'restrict',
                dhcpSnooping: securitySettings.dhcpSnooping || false,
                arpInspection: securitySettings.arpInspection || false,
                ...securitySettings
            },
            qosSettings: {
                enabled: qosSettings.enabled || false,
                trustMode: qosSettings.trustMode || 'none',
                defaultCos: qosSettings.defaultCos || 0,
                queueSettings: qosSettings.queueSettings || {},
                ...qosSettings
            },
            powerSettings: {
                poeEnabled: powerSettings.poeEnabled || false,
                powerLimit: powerSettings.powerLimit || null,
                powerPriority: powerSettings.powerPriority || 'low',
                ...powerSettings
            },
            monitoringSettings: {
                snmpEnabled: monitoringSettings.snmpEnabled || true,
                sflowEnabled: monitoringSettings.sflowEnabled || false,
                portMirroring: monitoringSettings.portMirroring || false,
                ...monitoringSettings
            },
            createdAt: new Date().toISOString()
        };

        // Store profile
        this.portProfiles.set(name, profile);
        await this._storePortProfile(profile);

        return {
            success: true,
            profileName: name,
            profile: profile
        };
    }

    /**
     * Apply a port profile to multiple ports
     * @param {string} profileName - Name of the port profile
     * @param {Array} portTargets - Array of {switchId, portNumber} objects
     * @returns {Promise<Object>} Application result
     */
    async applyPortProfile(profileName, portTargets) {
        const profile = this.portProfiles.get(profileName);
        if (!profile) {
            throw new Error(`Port profile '${profileName}' not found`);
        }

        const portMappings = portTargets.map(target => ({
            switchId: target.switchId,
            portNumber: target.portNumber,
            vlanId: profile.defaultVLAN,
            portType: profile.type,
            allowedVLANs: profile.allowedVLANs,
            portProfile: profileName,
            securitySettings: profile.securitySettings
        }));

        return await this.bulkConfigurePorts(portMappings, {
            rollbackOnFailure: true,
            validateFirst: true
        });
    }

    /**
     * Generate port configuration templates for different scenarios
     * @param {string} templateType - Type of template to generate
     * @param {Object} parameters - Template parameters
     * @returns {Object} Configuration template
     */
    generatePortTemplate(templateType, parameters = {}) {
        const template = this.portTemplates[templateType];
        if (!template) {
            throw new Error(`Template type '${templateType}' not found`);
        }

        return template.generator(parameters);
    }

    /**
     * Detect and suggest port optimizations
     * @param {string} switchId - Switch to analyze
     * @returns {Promise<Object>} Optimization suggestions
     */
    async analyzePortUtilization(switchId) {
        try {
            const inventory = await this.discoverSwitchPorts(switchId);
            const switchAdapter = await this.switchFactory.createSwitch(switchId);
            
            const suggestions = {
                switchId: switchId,
                summary: {
                    totalPorts: inventory.totalPorts,
                    usedPorts: inventory.totalPorts - inventory.unusedPorts.length,
                    utilizationPercent: ((inventory.totalPorts - inventory.unusedPorts.length) / inventory.totalPorts * 100).toFixed(1)
                },
                optimizations: [],
                recommendations: []
            };

            // Analyze unused ports
            if (inventory.unusedPorts.length > 0) {
                suggestions.optimizations.push({
                    type: 'unused_ports',
                    count: inventory.unusedPorts.length,
                    description: `${inventory.unusedPorts.length} ports are unused and could be disabled for security`,
                    action: 'disable_unused_ports',
                    ports: inventory.unusedPorts.map(p => p.number)
                });
            }

            // Analyze VLAN distribution
            const vlanDistribution = await this._analyzeVLANDistribution(switchId);
            if (vlanDistribution.singleVLANPorts > 10) {
                suggestions.optimizations.push({
                    type: 'vlan_consolidation',
                    description: 'Consider consolidating VLANs with few ports',
                    action: 'review_vlan_allocation',
                    details: vlanDistribution
                });
            }

            // Check for security issues
            const securityIssues = await this._checkPortSecurity(switchId);
            if (securityIssues.length > 0) {
                suggestions.optimizations.push({
                    type: 'security_improvements',
                    issues: securityIssues,
                    action: 'apply_security_profile'
                });
            }

            // Generate recommendations
            suggestions.recommendations = this._generatePortRecommendations(inventory, suggestions.optimizations);

            return suggestions;
        } catch (error) {
            throw new Error(`Failed to analyze port utilization: ${error.message}`);
        }
    }

    /**
     * Export port configuration for documentation/backup
     * @param {string} switchId - Switch to export
     * @param {string} format - Export format (json, csv, text)
     * @returns {Promise<Object>} Export result
     */
    async exportPortConfiguration(switchId, format = 'json') {
        try {
            const inventory = await this.discoverSwitchPorts(switchId);
            const switchAdapter = await this.switchFactory.createSwitch(switchId);
            
            const configurations = [];
            for (const port of inventory.portsByType.all) {
                const config = await switchAdapter.getPortConfiguration(port.number);
                configurations.push({
                    portNumber: port.number,
                    type: port.type,
                    status: port.status,
                    vlan: config.vlanId,
                    description: config.description,
                    configuration: config
                });
            }

            const exportData = {
                switchId: switchId,
                exportedAt: new Date().toISOString(),
                totalPorts: configurations.length,
                configurations: configurations
            };

            // Format the export based on requested format
            switch (format.toLowerCase()) {
                case 'csv':
                    return this._formatAsCSV(exportData);
                case 'text':
                    return this._formatAsText(exportData);
                case 'json':
                default:
                    return exportData;
            }
        } catch (error) {
            throw new Error(`Failed to export port configuration: ${error.message}`);
        }
    }

    // Private helper methods

    _initializePortTemplates() {
        return {
            'user-access': {
                description: 'Standard user access port template',
                generator: (params) => ({
                    type: 'access',
                    vlanId: params.userVLAN || 100,
                    securitySettings: {
                        portSecurity: true,
                        maxMacAddresses: 3,
                        violationAction: 'restrict'
                    },
                    qosSettings: {
                        enabled: true,
                        trustMode: 'dscp'
                    }
                })
            },
            'server-access': {
                description: 'Server access port template',
                generator: (params) => ({
                    type: 'access',
                    vlanId: params.serverVLAN || 200,
                    securitySettings: {
                        portSecurity: true,
                        maxMacAddresses: 1,
                        violationAction: 'shutdown'
                    },
                    qosSettings: {
                        enabled: true,
                        trustMode: 'dscp',
                        defaultCos: 4
                    }
                })
            },
            'uplink-trunk': {
                description: 'Inter-switch trunk port template',
                generator: (params) => ({
                    type: 'trunk',
                    nativeVLAN: params.nativeVLAN || 1,
                    allowedVLANs: params.allowedVLANs || [1, 100, 200, 300],
                    securitySettings: {
                        portSecurity: false
                    },
                    qosSettings: {
                        enabled: true,
                        trustMode: 'dscp'
                    }
                })
            },
            'ap-access': {
                description: 'Wireless access point port template',
                generator: (params) => ({
                    type: 'trunk',
                    nativeVLAN: params.managementVLAN || 10,
                    allowedVLANs: params.wirelessVLANs || [10, 100, 300],
                    powerSettings: {
                        poeEnabled: true,
                        powerPriority: 'high'
                    },
                    qosSettings: {
                        enabled: true,
                        trustMode: 'dscp'
                    }
                })
            },
            'iot-device': {
                description: 'IoT device port template',
                generator: (params) => ({
                    type: 'access',
                    vlanId: params.iotVLAN || 800,
                    securitySettings: {
                        portSecurity: true,
                        maxMacAddresses: 1,
                        violationAction: 'restrict',
                        dhcpSnooping: true
                    },
                    qosSettings: {
                        enabled: false
                    },
                    monitoringSettings: {
                        enhanced: true
                    }
                })
            }
        };
    }

    async _validatePortMapping(mapping) {
        // Validate switch exists
        if (!mapping.switchId) {
            throw new Error('Switch ID is required');
        }

        // Validate port number
        if (!mapping.portNumber || mapping.portNumber < 1) {
            throw new Error('Valid port number is required');
        }

        // Validate VLAN exists if specified
        if (mapping.vlanId) {
            const vlanExists = await this.vlanService.vlanExists(mapping.vlanId);
            if (!vlanExists) {
                throw new Error(`VLAN ${mapping.vlanId} does not exist`);
            }
        }

        // Validate port type and VLAN configuration consistency
        if (mapping.portType === 'trunk' && (!mapping.allowedVLANs || mapping.allowedVLANs.length === 0)) {
            throw new Error('Trunk ports require allowed VLANs to be specified');
        }

        if (mapping.portType === 'access' && mapping.allowedVLANs && mapping.allowedVLANs.length > 1) {
            throw new Error('Access ports can only be assigned to one VLAN');
        }
    }

    _categorizePortsByType(ports) {
        return {
            all: ports,
            access: ports.filter(p => p.type === 'access'),
            trunk: ports.filter(p => p.type === 'trunk'),
            hybrid: ports.filter(p => p.type === 'hybrid'),
            uplink: ports.filter(p => p.isUplink)
        };
    }

    _categorizePortsByStatus(ports) {
        return {
            up: ports.filter(p => p.status === 'up'),
            down: ports.filter(p => p.status === 'down'),
            disabled: ports.filter(p => p.adminStatus === 'disabled'),
            errDisabled: ports.filter(p => p.status === 'err-disabled')
        };
    }

    async _verifyPortConfiguration(switchId, portNumber, expectedConfig) {
        try {
            const switchAdapter = await this.switchFactory.createSwitch(switchId);
            const actualConfig = await switchAdapter.getPortConfiguration(portNumber);
            
            const verification = {
                success: true,
                mismatches: []
            };

            // Compare key configuration elements
            const keysToCheck = ['type', 'vlanId', 'allowedVLANs', 'nativeVLAN'];
            
            for (const key of keysToCheck) {
                if (expectedConfig[key] !== undefined) {
                    if (JSON.stringify(expectedConfig[key]) !== JSON.stringify(actualConfig[key])) {
                        verification.success = false;
                        verification.mismatches.push({
                            field: key,
                            expected: expectedConfig[key],
                            actual: actualConfig[key]
                        });
                    }
                }
            }

            return verification;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async _rollbackBulkOperation(operationId) {
        const operation = this.bulkOperations.get(operationId);
        if (!operation) {
            throw new Error(`Bulk operation ${operationId} not found`);
        }

        const rollbackResults = {
            operationId: operationId,
            portsRolledBack: 0,
            failures: [],
            startedAt: new Date().toISOString()
        };

        try {
            for (const [portKey, originalConfig] of operation.originalConfigurations) {
                const [switchId, portNumber] = portKey.split('-');
                
                try {
                    const switchAdapter = await this.switchFactory.createSwitch(switchId);
                    await switchAdapter.configurePort(originalConfig);
                    rollbackResults.portsRolledBack++;
                } catch (error) {
                    rollbackResults.failures.push({
                        switchId: switchId,
                        portNumber: portNumber,
                        error: error.message
                    });
                }
            }

            rollbackResults.completedAt = new Date().toISOString();
            return rollbackResults;
        } catch (error) {
            rollbackResults.error = error.message;
            rollbackResults.completedAt = new Date().toISOString();
            throw error;
        }
    }

    async _analyzeVLANDistribution(switchId) {
        // Simplified VLAN distribution analysis
        return {
            totalVLANs: 10,
            singleVLANPorts: 5,
            averagePortsPerVLAN: 4.2,
            mostUsedVLAN: 100,
            leastUsedVLAN: 300
        };
    }

    async _checkPortSecurity(switchId) {
        // Simplified port security check
        return [
            {
                type: 'no_port_security',
                ports: [1, 2, 3],
                description: 'Ports without port security enabled'
            },
            {
                type: 'unused_ports_enabled',
                ports: [20, 21, 22],
                description: 'Unused ports that should be disabled'
            }
        ];
    }

    _generatePortRecommendations(inventory, optimizations) {
        const recommendations = [];
        
        if (inventory.unusedPorts.length > 0) {
            recommendations.push('Disable unused ports for security');
        }
        
        if (optimizations.some(opt => opt.type === 'security_improvements')) {
            recommendations.push('Implement consistent port security policies');
        }
        
        recommendations.push('Regular port utilization reviews');
        recommendations.push('Standardize port configurations using profiles');
        
        return recommendations;
    }

    _formatAsCSV(exportData) {
        const headers = ['Port', 'Type', 'Status', 'VLAN', 'Description'];
        const rows = exportData.configurations.map(config => [
            config.portNumber,
            config.type,
            config.status,
            config.vlan,
            config.description || ''
        ]);
        
        return {
            format: 'csv',
            data: [headers, ...rows].map(row => row.join(',')).join('\n')
        };
    }

    _formatAsText(exportData) {
        let text = `Port Configuration Export for Switch ${exportData.switchId}\n`;
        text += `Exported at: ${exportData.exportedAt}\n`;
        text += `Total Ports: ${exportData.totalPorts}\n\n`;
        
        exportData.configurations.forEach(config => {
            text += `Port ${config.portNumber}: ${config.type} port, VLAN ${config.vlan}, Status: ${config.status}\n`;
            if (config.description) {
                text += `  Description: ${config.description}\n`;
            }
        });
        
        return {
            format: 'text',
            data: text
        };
    }

    async _storePortInventory(switchId, inventory) {
        // Store inventory in database - placeholder for database integration
        console.log(`Storing port inventory for switch ${switchId}`);
    }

    async _storePortMapping(mapping) {
        // Store port mapping in database - placeholder for database integration
        console.log(`Storing port mapping: ${mapping.switchId}:${mapping.portNumber} -> VLAN ${mapping.vlanId}`);
    }

    async _storePortProfile(profile) {
        // Store port profile in database - placeholder for database integration
        console.log(`Storing port profile: ${profile.name}`);
    }
}

module.exports = PortMappingManager;