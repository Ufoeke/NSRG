/**
 * Base Switch Adapter - Abstract class for multi-vendor switch integration
 * Provides unified interface for VLAN operations across different switch vendors
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class BaseSwitchAdapter extends EventEmitter {
    constructor(switchConfig) {
        super();
        this.config = {
            hostname: switchConfig.hostname,
            ipAddress: switchConfig.ipAddress,
            credentials: switchConfig.credentials || {},
            model: switchConfig.model,
            vendor: switchConfig.vendor,
            timeout: switchConfig.timeout || 30000,
            retryAttempts: switchConfig.retryAttempts || 3,
            retryDelay: switchConfig.retryDelay || 1000,
            ...switchConfig
        };
        
        this.connected = false;
        this.lastError = null;
        this.connectionAttempts = 0;
        this.sessionId = crypto.randomUUID();
        
        // Initialize vendor-specific capabilities
        this.capabilities = {
            vlans: true,
            trunking: true,
            portSecurity: false,
            stackable: false,
            poe: false,
            qos: false,
            stp: true,
            lacp: false,
            ...this.getDefaultCapabilities()
        };
    }

    // Abstract methods - must be implemented by vendor-specific adapters
    
    /**
     * Establish connection to the switch
     * @returns {Promise<boolean>} Connection success status
     */
    async connect() {
        throw new Error('connect() method must be implemented by vendor adapter');
    }

    /**
     * Disconnect from the switch
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() method must be implemented by vendor adapter');
    }

    /**
     * Test connectivity to switch
     * @returns {Promise<Object>} Connection test results
     */
    async testConnection() {
        throw new Error('testConnection() method must be implemented by vendor adapter');
    }

    /**
     * Get all VLANs configured on the switch
     * @returns {Promise<Array>} Array of VLAN objects
     */
    async getVlans() {
        throw new Error('getVlans() method must be implemented by vendor adapter');
    }

    /**
     * Create a new VLAN
     * @param {Object} vlanConfig - VLAN configuration
     * @returns {Promise<Object>} Created VLAN details
     */
    async createVlan(vlanConfig) {
        throw new Error('createVlan() method must be implemented by vendor adapter');
    }

    /**
     * Update existing VLAN configuration
     * @param {number} vlanId - VLAN ID to update
     * @param {Object} vlanConfig - New VLAN configuration
     * @returns {Promise<Object>} Updated VLAN details
     */
    async updateVlan(vlanId, vlanConfig) {
        throw new Error('updateVlan() method must be implemented by vendor adapter');
    }

    /**
     * Delete a VLAN
     * @param {number} vlanId - VLAN ID to delete
     * @returns {Promise<boolean>} Deletion success status
     */
    async deleteVlan(vlanId) {
        throw new Error('deleteVlan() method must be implemented by vendor adapter');
    }

    /**
     * Get all switch ports and their configuration
     * @returns {Promise<Array>} Array of port objects
     */
    async getPorts() {
        throw new Error('getPorts() method must be implemented by vendor adapter');
    }

    /**
     * Configure port VLAN settings
     * @param {string} portId - Port identifier
     * @param {Object} portConfig - Port configuration
     * @returns {Promise<Object>} Updated port configuration
     */
    async configurePort(portId, portConfig) {
        throw new Error('configurePort() method must be implemented by vendor adapter');
    }

    /**
     * Configure trunk port settings
     * @param {string} portId - Port identifier
     * @param {Object} trunkConfig - Trunk configuration
     * @returns {Promise<Object>} Updated trunk configuration
     */
    async configureTrunk(portId, trunkConfig) {
        throw new Error('configureTrunk() method must be implemented by vendor adapter');
    }

    /**
     * Get switch system information
     * @returns {Promise<Object>} System information
     */
    async getSystemInfo() {
        throw new Error('getSystemInfo() method must be implemented by vendor adapter');
    }

    /**
     * Save configuration to startup config
     * @returns {Promise<boolean>} Save success status
     */
    async saveConfiguration() {
        throw new Error('saveConfiguration() method must be implemented by vendor adapter');
    }

    // Common utility methods

    /**
     * Get vendor-specific default capabilities
     * @returns {Object} Default capabilities for this vendor
     */
    getDefaultCapabilities() {
        return {};
    }

    /**
     * Validate VLAN ID
     * @param {number} vlanId - VLAN ID to validate
     * @returns {boolean} Validation result
     */
    validateVlanId(vlanId) {
        return Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094;
    }

    /**
     * Validate port identifier
     * @param {string} portId - Port identifier to validate
     * @returns {boolean} Validation result
     */
    validatePortId(portId) {
        return typeof portId === 'string' && portId.length > 0;
    }

    /**
     * Normalize VLAN configuration
     * @param {Object} vlanConfig - Raw VLAN configuration
     * @returns {Object} Normalized VLAN configuration
     */
    normalizeVlanConfig(vlanConfig) {
        return {
            vlanId: parseInt(vlanConfig.vlanId),
            name: vlanConfig.name || `VLAN${vlanConfig.vlanId}`,
            description: vlanConfig.description || '',
            type: vlanConfig.type || 'ethernet',
            status: vlanConfig.status || 'active',
            ...vlanConfig
        };
    }

    /**
     * Normalize port configuration
     * @param {Object} portConfig - Raw port configuration
     * @returns {Object} Normalized port configuration
     */
    normalizePortConfig(portConfig) {
        return {
            mode: portConfig.mode || 'access',
            accessVlan: portConfig.accessVlan || 1,
            allowedVlans: Array.isArray(portConfig.allowedVlans) ? portConfig.allowedVlans : [],
            nativeVlan: portConfig.nativeVlan || 1,
            voiceVlan: portConfig.voiceVlan || null,
            adminStatus: portConfig.adminStatus || 'up',
            description: portConfig.description || '',
            ...portConfig
        };
    }

    /**
     * Execute command with retry logic
     * @param {Function} commandFunc - Function to execute
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<any>} Command result
     */
    async executeWithRetry(commandFunc, maxRetries = null) {
        const attempts = maxRetries || this.config.retryAttempts;
        let lastError;

        for (let i = 0; i < attempts; i++) {
            try {
                return await commandFunc();
            } catch (error) {
                lastError = error;
                
                if (i < attempts - 1) {
                    this.emit('retry', {
                        attempt: i + 1,
                        maxAttempts: attempts,
                        error: error.message
                    });
                    
                    await this.delay(this.config.retryDelay * Math.pow(2, i)); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    /**
     * Delay execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate configuration hash for change detection
     * @param {Object} config - Configuration object
     * @returns {string} SHA-256 hash
     */
    generateConfigHash(config) {
        const configString = JSON.stringify(config, Object.keys(config).sort());
        return crypto.createHash('sha256').update(configString).digest('hex');
    }

    /**
     * Log operation with context
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    log(level, message, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            sessionId: this.sessionId,
            switch: {
                hostname: this.config.hostname,
                vendor: this.config.vendor,
                model: this.config.model
            },
            ...context
        };

        this.emit('log', logEntry);
        
        // Also log to console for development
        console[level] || console.log(`[${level.toUpperCase()}] ${message}`, context);
    }

    /**
     * Handle connection events
     * @param {string} event - Event type
     * @param {Object} details - Event details
     */
    handleConnectionEvent(event, details = {}) {
        const eventData = {
            event,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            switch: this.config.hostname,
            ...details
        };

        this.emit('connectionEvent', eventData);
    }

    /**
     * Validate required configuration parameters
     * @param {Array} requiredParams - Array of required parameter names
     * @throws {Error} If required parameters missing
     */
    validateConfig(requiredParams = []) {
        const missing = requiredParams.filter(param => !this.config[param]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration parameters: ${missing.join(', ')}`);
        }
    }

    /**
     * Check if switch supports specific capability
     * @param {string} capability - Capability name
     * @returns {boolean} Support status
     */
    supportsCapability(capability) {
        return this.capabilities[capability] === true;
    }

    /**
     * Get connection status information
     * @returns {Object} Connection status
     */
    getConnectionStatus() {
        return {
            connected: this.connected,
            sessionId: this.sessionId,
            connectionAttempts: this.connectionAttempts,
            lastError: this.lastError,
            capabilities: this.capabilities,
            config: {
                hostname: this.config.hostname,
                vendor: this.config.vendor,
                model: this.config.model
            }
        };
    }

    /**
     * Convert vendor-specific error to standardized format
     * @param {Error} error - Original error
     * @returns {Object} Standardized error object
     */
    standardizeError(error) {
        return {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message,
            vendor: this.config.vendor,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            originalError: error
        };
    }

    /**
     * Cleanup resources on adapter destruction
     */
    async destroy() {
        try {
            if (this.connected) {
                await this.disconnect();
            }
        } catch (error) {
            this.log('error', 'Error during adapter cleanup', { error: error.message });
        }
        
        this.removeAllListeners();
    }
}

module.exports = BaseSwitchAdapter; 