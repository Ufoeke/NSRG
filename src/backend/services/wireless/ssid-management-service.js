/**
 * SSID Management and Naming Convention Engine
 * Provides lifecycle management for SSIDs with configurable naming conventions,
 * validation rules, and automated provisioning across multiple vendor platforms
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

// Import vendor drivers
const CiscoCatalystDriver = require('./vendors/cisco-catalyst-driver');
const CiscoMerakiDriver = require('./vendors/cisco-meraki-driver');
const FortiAPDriver = require('./vendors/fortiap-driver');
const ArubaDriver = require('./vendors/aruba-driver');

class SSIDManagementService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Default naming convention settings
            maxSSIDLength: 32,
            allowedCharacters: /^[a-zA-Z0-9_-]+$/,
            reservedNames: ['admin', 'system', 'guest', 'default'],
            templateVariables: ['location', 'department', 'purpose', 'floor', 'building'],
            deploymentTimeout: 120000, // 2 minutes
            rollbackTimeout: 60000, // 1 minute
            ...config
        };

        // Store for active drivers by vendor type
        this.drivers = new Map();
        
        // Template storage
        this.templates = new Map();
        
        // Deployment history for rollback
        this.deploymentHistory = new Map();
        
        // Active deployment jobs
        this.activeDeployments = new Map();
        
        // Initialize default templates
        this.initializeDefaultTemplates();
        
        // Bind event handlers
        this.setupEventHandlers();
    }

    /**
     * Initialize default SSID templates
     */
    initializeDefaultTemplates() {
        const defaultTemplates = [
            {
                id: 'corporate-template',
                name: 'Corporate Network',
                pattern: '{department}-{location}-CORP',
                description: 'Standard corporate network naming',
                variables: {
                    department: { required: true, type: 'string', maxLength: 8 },
                    location: { required: true, type: 'string', maxLength: 6 }
                },
                securityProfile: 'wpa3_enterprise',
                vlanMapping: 'auto',
                bandwidthPolicy: 'standard'
            },
            {
                id: 'guest-template', 
                name: 'Guest Network',
                pattern: 'Guest-{building}-{floor}',
                description: 'Guest network with location-based naming',
                variables: {
                    building: { required: true, type: 'string', maxLength: 4 },
                    floor: { required: false, type: 'number', default: '1' }
                },
                securityProfile: 'wpa2_psk',
                vlanMapping: 'guest_vlan',
                bandwidthPolicy: 'limited'
            },
            {
                id: 'iot-template',
                name: 'IoT Device Network', 
                pattern: 'IoT-{purpose}-{location}',
                description: 'IoT device network with purpose-based naming',
                variables: {
                    purpose: { required: true, type: 'string', maxLength: 10 },
                    location: { required: true, type: 'string', maxLength: 6 }
                },
                securityProfile: 'wpa2_psk',
                vlanMapping: 'iot_vlan',
                bandwidthPolicy: 'restricted'
            }
        ];

        defaultTemplates.forEach(template => {
            this.templates.set(template.id, template);
        });
    }    /**
     * Setup event handlers for driver events
     */
    setupEventHandlers() {
        // Listen for driver events and propagate them
        this.on('driverAdded', (data) => {
            console.log(`Driver added: ${data.vendor} (${data.id})`);
        });
        
        this.on('deploymentStarted', (data) => {
            console.log(`SSID deployment started: ${data.ssidName} to ${data.targetCount} devices`);
        });
        
        this.on('deploymentCompleted', (data) => {
            console.log(`SSID deployment completed: ${data.ssidName} (${data.successCount}/${data.totalCount} successful)`);
        });
        
        this.on('rollbackStarted', (data) => {
            console.log(`SSID rollback started: ${data.deploymentId}`);
        });
    }

    /**
     * Add a vendor driver to the management service
     * @param {string} id - Unique identifier for this driver instance
     * @param {string} vendor - Vendor type (cisco-meraki, fortiap, cisco-catalyst, aruba)
     * @param {Object} config - Driver configuration
     * @returns {Promise<string>} Driver ID
     */
    async addDriver(id, vendor, config) {
        try {
            let driver;
            
            switch (vendor.toLowerCase()) {
                case 'cisco-meraki':
                    driver = new CiscoMerakiDriver(config);
                    break;
                case 'fortiap':
                    driver = new FortiAPDriver(config);
                    break;
                case 'cisco-catalyst':
                    driver = new CiscoCatalystDriver(config);
                    break;
                case 'aruba':
                    driver = new ArubaDriver(config);
                    break;
                default:
                    throw new Error(`Unsupported vendor: ${vendor}`);
            }

            // Connect to the vendor system
            await driver.connect();
            
            // Store the driver
            this.drivers.set(id, {
                driver,
                vendor,
                config,
                connected: true,
                addedAt: new Date()
            });

            this.emit('driverAdded', { id, vendor, connected: true });
            
            return id;
        } catch (error) {
            throw new Error(`Failed to add ${vendor} driver: ${error.message}`);
        }
    }    /**
     * Remove a driver from the management service
     * @param {string} id - Driver ID to remove
     * @returns {Promise<boolean>}
     */
    async removeDriver(id) {
        try {
            const driverData = this.drivers.get(id);
            if (!driverData) {
                throw new Error(`Driver ${id} not found`);
            }

            // Disconnect the driver
            await driverData.driver.disconnect();
            
            // Remove from storage
            this.drivers.delete(id);

            this.emit('driverRemoved', { id, vendor: driverData.vendor });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to remove driver ${id}: ${error.message}`);
        }
    }

    /**
     * Get all connected drivers
     * @returns {Array} List of driver information
     */
    getDrivers() {
        const drivers = [];
        for (const [id, data] of this.drivers) {
            drivers.push({
                id,
                vendor: data.vendor,
                connected: data.connected,
                addedAt: data.addedAt,
                systemInfo: data.driver.systemInfo
            });
        }
        return drivers;
    }    // ===============================
    // TEMPLATE MANAGEMENT
    // ===============================

    /**
     * Add a new SSID template
     * @param {Object} template - Template configuration
     * @returns {string} Template ID
     */
    addTemplate(template) {
        const id = template.id || uuidv4();
        
        // Validate template structure
        this.validateTemplate(template);
        
        this.templates.set(id, {
            id,
            ...template,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        this.emit('templateAdded', { id, name: template.name });
        
        return id;
    }

    /**
     * Update an existing template
     * @param {string} id - Template ID
     * @param {Object} updates - Template updates
     * @returns {boolean}
     */
    updateTemplate(id, updates) {
        const template = this.templates.get(id);
        if (!template) {
            throw new Error(`Template ${id} not found`);
        }

        const updatedTemplate = {
            ...template,
            ...updates,
            id, // Preserve original ID
            updatedAt: new Date()
        };

        this.validateTemplate(updatedTemplate);
        
        this.templates.set(id, updatedTemplate);

        this.emit('templateUpdated', { id, name: updatedTemplate.name });
        
        return true;
    }    /**
     * Remove a template
     * @param {string} id - Template ID
     * @returns {boolean}
     */
    removeTemplate(id) {
        const template = this.templates.get(id);
        if (!template) {
            throw new Error(`Template ${id} not found`);
        }

        this.templates.delete(id);

        this.emit('templateRemoved', { id, name: template.name });
        
        return true;
    }

    /**
     * Get all templates
     * @returns {Array} List of templates
     */
    getTemplates() {
        return Array.from(this.templates.values());
    }

    /**
     * Get template by ID
     * @param {string} id - Template ID
     * @returns {Object} Template object
     */
    getTemplate(id) {
        const template = this.templates.get(id);
        if (!template) {
            throw new Error(`Template ${id} not found`);
        }
        return template;
    }    /**
     * Validate template structure
     * @param {Object} template - Template to validate
     * @throws {Error} If template is invalid
     */
    validateTemplate(template) {
        // Required fields
        if (!template.name || typeof template.name !== 'string') {
            throw new Error('Template name is required and must be a string');
        }
        
        if (!template.pattern || typeof template.pattern !== 'string') {
            throw new Error('Template pattern is required and must be a string');
        }

        // Validate pattern variables
        const patternVariables = this.extractVariablesFromPattern(template.pattern);
        if (template.variables) {
            for (const varName of patternVariables) {
                if (!template.variables[varName]) {
                    throw new Error(`Pattern variable '${varName}' is not defined in template variables`);
                }
            }
        }

        // Validate security profile
        const validSecurityProfiles = ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'];
        if (template.securityProfile && !validSecurityProfiles.includes(template.securityProfile)) {
            throw new Error(`Invalid security profile: ${template.securityProfile}`);
        }

        return true;
    }

    /**
     * Extract variables from template pattern
     * @param {string} pattern - Template pattern (e.g., '{department}-{location}-CORP')
     * @returns {Array} List of variable names
     */
    extractVariablesFromPattern(pattern) {
        const matches = pattern.match(/\{([^}]+)\}/g) || [];
        return matches.map(match => match.slice(1, -1)); // Remove { and }
    }    // ===============================
    // SSID NAME GENERATION & VALIDATION
    // ===============================

    /**
     * Generate SSID name from template
     * @param {string} templateId - Template ID
     * @param {Object} variables - Variable values for substitution
     * @returns {Object} Generated SSID configuration
     */
    generateSSIDFromTemplate(templateId, variables = {}) {
        const template = this.getTemplate(templateId);
        
        // Validate required variables
        if (template.variables) {
            for (const [varName, varConfig] of Object.entries(template.variables)) {
                if (varConfig.required && !variables[varName]) {
                    throw new Error(`Required variable '${varName}' is missing`);
                }
                
                // Apply defaults
                if (!variables[varName] && varConfig.default) {
                    variables[varName] = varConfig.default;
                }
                
                // Validate variable value
                if (variables[varName]) {
                    this.validateVariable(varName, variables[varName], varConfig);
                }
            }
        }

        // Generate SSID name by substituting variables
        let ssidName = template.pattern;
        for (const [varName, value] of Object.entries(variables)) {
            const placeholder = `{${varName}}`;
            ssidName = ssidName.replace(new RegExp(placeholder, 'g'), value);
        }

        // Validate the generated name
        this.validateSSIDName(ssidName);

        // Build complete SSID configuration
        const ssidConfig = {
            id: uuidv4(),
            name: ssidName,
            templateId: templateId,
            variables: variables,
            securityProfile: template.securityProfile,
            vlanMapping: template.vlanMapping,
            bandwidthPolicy: template.bandwidthPolicy,
            enabled: true,
            createdAt: new Date()
        };

        return ssidConfig;
    }    /**
     * Validate variable value against its configuration
     * @param {string} varName - Variable name
     * @param {*} value - Variable value
     * @param {Object} varConfig - Variable configuration
     * @throws {Error} If variable is invalid
     */
    validateVariable(varName, value, varConfig) {
        // Type validation
        if (varConfig.type === 'string' && typeof value !== 'string') {
            throw new Error(`Variable '${varName}' must be a string`);
        }
        
        if (varConfig.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
            throw new Error(`Variable '${varName}' must be a number`);
        }

        // Length validation for strings
        if (varConfig.type === 'string' && varConfig.maxLength && value.length > varConfig.maxLength) {
            throw new Error(`Variable '${varName}' exceeds maximum length of ${varConfig.maxLength}`);
        }

        if (varConfig.type === 'string' && varConfig.minLength && value.length < varConfig.minLength) {
            throw new Error(`Variable '${varName}' is below minimum length of ${varConfig.minLength}`);
        }

        // Range validation for numbers
        if (varConfig.type === 'number') {
            const numValue = Number(value);
            if (varConfig.min !== undefined && numValue < varConfig.min) {
                throw new Error(`Variable '${varName}' is below minimum value of ${varConfig.min}`);
            }
            if (varConfig.max !== undefined && numValue > varConfig.max) {
                throw new Error(`Variable '${varName}' exceeds maximum value of ${varConfig.max}`);
            }
        }

        // Pattern validation
        if (varConfig.pattern && !new RegExp(varConfig.pattern).test(value)) {
            throw new Error(`Variable '${varName}' does not match required pattern`);
        }

        return true;
    }    /**
     * Validate SSID name against naming conventions
     * @param {string} ssidName - SSID name to validate
     * @throws {Error} If SSID name is invalid
     */
    validateSSIDName(ssidName) {
        // Check length
        if (ssidName.length > this.config.maxSSIDLength) {
            throw new Error(`SSID name exceeds maximum length of ${this.config.maxSSIDLength} characters`);
        }

        if (ssidName.length === 0) {
            throw new Error('SSID name cannot be empty');
        }

        // Check allowed characters
        if (!this.config.allowedCharacters.test(ssidName)) {
            throw new Error('SSID name contains invalid characters. Only alphanumeric characters, hyphens, and underscores are allowed');
        }

        // Check reserved names
        const lowerName = ssidName.toLowerCase();
        if (this.config.reservedNames.includes(lowerName)) {
            throw new Error(`SSID name '${ssidName}' is reserved and cannot be used`);
        }

        // Check for leading/trailing special characters
        if (ssidName.startsWith('-') || ssidName.startsWith('_') || 
            ssidName.endsWith('-') || ssidName.endsWith('_')) {
            throw new Error('SSID name cannot start or end with hyphens or underscores');
        }

        return true;
    }

    /**
     * Check if SSID name is unique across all drivers
     * @param {string} ssidName - SSID name to check
     * @returns {Promise<boolean>} True if unique, false if exists
     */
    async isSSIDNameUnique(ssidName) {
        for (const [id, driverData] of this.drivers) {
            try {
                const existingSSIDs = await driverData.driver.listSSIDs();
                const nameExists = existingSSIDs.some(ssid => 
                    ssid.name.toLowerCase() === ssidName.toLowerCase()
                );
                
                if (nameExists) {
                    return false;
                }
            } catch (error) {
                console.warn(`Failed to check SSIDs on driver ${id}: ${error.message}`);
            }
        }
        
        return true;
    }    // ===============================
    // DEPLOYMENT ORCHESTRATION
    // ===============================

    /**
     * Deploy SSID to multiple access points across vendors
     * @param {Object} ssidConfig - SSID configuration
     * @param {Array} targetDrivers - Array of driver IDs to deploy to (null = all drivers)
     * @param {Object} options - Deployment options
     * @returns {Promise<Object>} Deployment result
     */
    async deploySSID(ssidConfig, targetDrivers = null, options = {}) {
        const deploymentId = uuidv4();
        
        try {
            // Validate SSID configuration
            this.validateSSIDName(ssidConfig.name);
            
            // Check name uniqueness if required
            if (options.enforceUniqueness !== false) {
                const isUnique = await this.isSSIDNameUnique(ssidConfig.name);
                if (!isUnique) {
                    throw new Error(`SSID name '${ssidConfig.name}' already exists`);
                }
            }

            // Determine target drivers
            const drivers = targetDrivers ? 
                targetDrivers.map(id => ({ id, ...this.drivers.get(id) })).filter(d => d.driver) :
                Array.from(this.drivers.entries()).map(([id, data]) => ({ id, ...data }));

            if (drivers.length === 0) {
                throw new Error('No drivers available for deployment');
            }

            // Create deployment record
            const deployment = {
                id: deploymentId,
                ssidConfig: ssidConfig,
                targetDrivers: drivers.map(d => d.id),
                status: 'in-progress',
                startTime: new Date(),
                results: [],
                rollbackData: []
            };

            this.activeDeployments.set(deploymentId, deployment);
            this.emit('deploymentStarted', {
                deploymentId,
                ssidName: ssidConfig.name,
                targetCount: drivers.length
            });

            // Deploy to each driver in parallel
            const deploymentPromises = drivers.map(driverData => 
                this.deployToSingleDriver(deploymentId, ssidConfig, driverData, options)
            );

            const results = await Promise.allSettled(deploymentPromises);
            
            // Process results
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failureCount = results.length - successCount;

            // Update deployment record
            deployment.status = failureCount === 0 ? 'completed' : 'partial';
            deployment.endTime = new Date();
            deployment.successCount = successCount;
            deployment.failureCount = failureCount;
            deployment.results = results.map((result, index) => ({
                driverId: drivers[index].id,
                vendor: drivers[index].vendor,
                status: result.status,
                value: result.value,
                reason: result.reason?.message
            }));

            // Store deployment history for rollback
            this.deploymentHistory.set(deploymentId, deployment);
            this.activeDeployments.delete(deploymentId);

            this.emit('deploymentCompleted', {
                deploymentId,
                ssidName: ssidConfig.name,
                totalCount: drivers.length,
                successCount,
                failureCount,
                status: deployment.status
            });

            return deployment;

        } catch (error) {
            // Clean up failed deployment
            if (this.activeDeployments.has(deploymentId)) {
                this.activeDeployments.delete(deploymentId);
            }
            
            this.emit('deploymentFailed', {
                deploymentId,
                ssidName: ssidConfig?.name,
                error: error.message
            });
            
            throw error;
        }
    }    /**
     * Deploy SSID to a single driver
     * @param {string} deploymentId - Deployment ID for tracking
     * @param {Object} ssidConfig - SSID configuration
     * @param {Object} driverData - Driver data object
     * @param {Object} options - Deployment options
     * @returns {Promise<Object>} Deployment result for this driver
     */
    async deployToSingleDriver(deploymentId, ssidConfig, driverData, options) {
        const timeout = options.timeout || this.config.deploymentTimeout;
        
        try {
            // Set timeout for deployment
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Deployment timeout')), timeout);
            });

            // Perform the actual deployment
            const deploymentPromise = driverData.driver.createSSID(ssidConfig);
            
            const result = await Promise.race([deploymentPromise, timeoutPromise]);

            // Store rollback data
            const deployment = this.activeDeployments.get(deploymentId);
            if (deployment) {
                deployment.rollbackData.push({
                    driverId: driverData.id,
                    vendor: driverData.vendor,
                    ssidId: result.id,
                    action: 'delete'
                });
            }

            return {
                driverId: driverData.id,
                vendor: driverData.vendor,
                ssidId: result.id,
                success: true,
                deployedAt: new Date()
            };

        } catch (error) {
            return {
                driverId: driverData.id,
                vendor: driverData.vendor,
                success: false,
                error: error.message,
                failedAt: new Date()
            };
        }
    }    // ===============================
    // ROLLBACK CAPABILITIES
    // ===============================

    /**
     * Rollback a deployment
     * @param {string} deploymentId - Deployment ID to rollback
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackDeployment(deploymentId, options = {}) {
        try {
            const deployment = this.deploymentHistory.get(deploymentId);
            if (!deployment) {
                throw new Error(`Deployment ${deploymentId} not found in history`);
            }

            if (!deployment.rollbackData || deployment.rollbackData.length === 0) {
                throw new Error(`No rollback data available for deployment ${deploymentId}`);
            }

            this.emit('rollbackStarted', { deploymentId, ssidName: deployment.ssidConfig.name });

            const rollbackPromises = deployment.rollbackData.map(rollbackItem => 
                this.executeRollbackAction(rollbackItem, options)
            );

            const results = await Promise.allSettled(rollbackPromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failureCount = results.length - successCount;

            const rollbackResult = {
                deploymentId,
                rollbackId: uuidv4(),
                totalActions: results.length,
                successCount,
                failureCount,
                results: results.map((result, index) => ({
                    ...deployment.rollbackData[index],
                    status: result.status,
                    value: result.value,
                    reason: result.reason?.message
                })),
                rolledBackAt: new Date()
            };

            this.emit('rollbackCompleted', rollbackResult);

            return rollbackResult;

        } catch (error) {
            this.emit('rollbackFailed', { deploymentId, error: error.message });
            throw error;
        }
    }

    /**
     * Execute a single rollback action
     * @param {Object} rollbackItem - Rollback action details
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Action result
     */
    async executeRollbackAction(rollbackItem, options) {
        const timeout = options.timeout || this.config.rollbackTimeout;
        const driverData = this.drivers.get(rollbackItem.driverId);
        
        if (!driverData) {
            throw new Error(`Driver ${rollbackItem.driverId} not found`);
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Rollback timeout')), timeout);
        });

        if (rollbackItem.action === 'delete' && rollbackItem.ssidId) {
            const deletePromise = driverData.driver.deleteSSID(rollbackItem.ssidId);
            await Promise.race([deletePromise, timeoutPromise]);
            
            return {
                driverId: rollbackItem.driverId,
                action: 'delete',
                ssidId: rollbackItem.ssidId,
                success: true
            };
        }

        throw new Error(`Unknown rollback action: ${rollbackItem.action}`);
    }    // ===============================
    // UTILITY METHODS
    // ===============================

    /**
     * Get deployment history
     * @param {number} limit - Maximum number of deployments to return
     * @returns {Array} List of historical deployments
     */
    getDeploymentHistory(limit = 50) {
        const deployments = Array.from(this.deploymentHistory.values())
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
            .slice(0, limit);

        return deployments.map(deployment => ({
            id: deployment.id,
            ssidName: deployment.ssidConfig.name,
            status: deployment.status,
            startTime: deployment.startTime,
            endTime: deployment.endTime,
            targetDrivers: deployment.targetDrivers,
            successCount: deployment.successCount,
            failureCount: deployment.failureCount
        }));
    }

    /**
     * Get active deployments
     * @returns {Array} List of active deployments
     */
    getActiveDeployments() {
        return Array.from(this.activeDeployments.values()).map(deployment => ({
            id: deployment.id,
            ssidName: deployment.ssidConfig.name,
            status: deployment.status,
            startTime: deployment.startTime,
            targetDrivers: deployment.targetDrivers
        }));
    }

    /**
     * Update SSID across all drivers where it exists
     * @param {string} ssidName - SSID name to update
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>} Update results
     */
    async updateSSID(ssidName, updates) {
        const updateResults = [];
        
        for (const [driverId, driverData] of this.drivers) {
            try {
                const existingSSIDs = await driverData.driver.listSSIDs();
                const targetSSID = existingSSIDs.find(ssid => ssid.name === ssidName);
                
                if (targetSSID) {
                    const result = await driverData.driver.updateSSID(targetSSID.id, updates);
                    updateResults.push({
                        driverId,
                        vendor: driverData.vendor,
                        success: true,
                        ssidId: targetSSID.id,
                        result
                    });
                }
            } catch (error) {
                updateResults.push({
                    driverId,
                    vendor: driverData.vendor,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = updateResults.filter(r => r.success).length;
        
        this.emit('ssidUpdated', {
            ssidName,
            totalDrivers: updateResults.length,
            successCount,
            failureCount: updateResults.length - successCount,
            results: updateResults
        });

        return {
            ssidName,
            totalDrivers: updateResults.length,
            successCount,
            failureCount: updateResults.length - successCount,
            results: updateResults
        };
    }    /**
     * Delete SSID from all drivers where it exists
     * @param {string} ssidName - SSID name to delete
     * @returns {Promise<Object>} Deletion results
     */
    async deleteSSID(ssidName) {
        const deleteResults = [];
        
        for (const [driverId, driverData] of this.drivers) {
            try {
                const existingSSIDs = await driverData.driver.listSSIDs();
                const targetSSID = existingSSIDs.find(ssid => ssid.name === ssidName);
                
                if (targetSSID) {
                    await driverData.driver.deleteSSID(targetSSID.id);
                    deleteResults.push({
                        driverId,
                        vendor: driverData.vendor,
                        success: true,
                        ssidId: targetSSID.id
                    });
                }
            } catch (error) {
                deleteResults.push({
                    driverId,
                    vendor: driverData.vendor,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = deleteResults.filter(r => r.success).length;
        
        this.emit('ssidDeleted', {
            ssidName,
            totalDrivers: deleteResults.length,
            successCount,
            failureCount: deleteResults.length - successCount,
            results: deleteResults
        });

        return {
            ssidName,
            totalDrivers: deleteResults.length,
            successCount,
            failureCount: deleteResults.length - successCount,
            results: deleteResults
        };
    }

    /**
     * Get comprehensive status of all SSIDs across all drivers
     * @returns {Promise<Object>} SSID status summary
     */
    async getSSIDStatus() {
        const driverStatuses = [];
        
        for (const [driverId, driverData] of this.drivers) {
            try {
                const ssids = await driverData.driver.listSSIDs();
                driverStatuses.push({
                    driverId,
                    vendor: driverData.vendor,
                    connected: driverData.connected,
                    ssidCount: ssids.length,
                    ssids: ssids.map(ssid => ({
                        id: ssid.id,
                        name: ssid.name,
                        enabled: ssid.enabled,
                        securityType: ssid.securityType
                    }))
                });
            } catch (error) {
                driverStatuses.push({
                    driverId,
                    vendor: driverData.vendor,
                    connected: false,
                    error: error.message,
                    ssidCount: 0,
                    ssids: []
                });
            }
        }

        return {
            totalDrivers: this.drivers.size,
            connectedDrivers: driverStatuses.filter(d => d.connected).length,
            totalSSIDs: driverStatuses.reduce((sum, d) => sum + d.ssidCount, 0),
            driverStatuses
        };
    }

    /**
     * Cleanup resources and disconnect all drivers
     * @returns {Promise<void>}
     */
    async cleanup() {
        const disconnectPromises = [];
        
        for (const [id, driverData] of this.drivers) {
            disconnectPromises.push(
                driverData.driver.disconnect().catch(error => 
                    console.warn(`Failed to disconnect driver ${id}: ${error.message}`)
                )
            );
        }

        await Promise.allSettled(disconnectPromises);
        
        this.drivers.clear();
        this.activeDeployments.clear();
        
        this.emit('cleanup', { message: 'All drivers disconnected and resources cleaned up' });
    }
}

module.exports = SSIDManagementService;