/**
 * Base Vendor API Integration Class
 * Defines the interface all firewall vendor integrations must implement
 */
class BaseVendor {
    constructor(config) {
        this.name = config.name;
        this.apiUrl = config.apiUrl;
        this.credentials = config.credentials;
        this.timeout = config.timeout || 30000;
        this.retryAttempts = config.retryAttempts || 3;
    }

    /**
     * Test connection to the firewall management system
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        throw new Error('testConnection method must be implemented by vendor class');
    }

    /**
     * Authenticate with the vendor API
     * @returns {Promise<object>} Authentication token or session info
     */
    async authenticate() {
        throw new Error('authenticate method must be implemented by vendor class');
    }

    /**
     * Get all firewall devices managed by this system
     * @returns {Promise<Array>} List of firewall devices
     */
    async getDevices() {
        throw new Error('getDevices method must be implemented by vendor class');
    }

    /**
     * Get firewall rules from a specific device
     * @param {string} deviceId - Device identifier
     * @param {object} filters - Optional filters for rules
     * @returns {Promise<Array>} List of firewall rules
     */
    async getRules(deviceId, filters = {}) {
        throw new Error('getRules method must be implemented by vendor class');
    }

    /**
     * Create a new firewall rule
     * @param {string} deviceId - Device identifier
     * @param {object} ruleData - Rule configuration data
     * @returns {Promise<object>} Created rule information
     */
    async createRule(deviceId, ruleData) {
        throw new Error('createRule method must be implemented by vendor class');
    }

    /**
     * Update an existing firewall rule
     * @param {string} deviceId - Device identifier
     * @param {string} ruleId - Rule identifier
     * @param {object} ruleData - Updated rule configuration
     * @returns {Promise<object>} Updated rule information
     */
    async updateRule(deviceId, ruleId, ruleData) {
        throw new Error('updateRule method must be implemented by vendor class');
    }

    /**
     * Delete a firewall rule
     * @param {string} deviceId - Device identifier
     * @param {string} ruleId - Rule identifier
     * @returns {Promise<boolean>} Deletion success status
     */
    async deleteRule(deviceId, ruleId) {
        throw new Error('deleteRule method must be implemented by vendor class');
    }

    /**
     * Get available ports and services for autocomplete
     * @returns {Promise<object>} Ports and services data
     */
    async getPortsAndServices() {
        throw new Error('getPortsAndServices method must be implemented by vendor class');
    }

    /**
     * Validate rule configuration before creation
     * @param {object} ruleData - Rule configuration to validate
     * @returns {Promise<object>} Validation result
     */
    async validateRule(ruleData) {
        throw new Error('validateRule method must be implemented by vendor class');
    }

    /**
     * Deploy pending configuration changes
     * @param {string} deviceId - Device identifier
     * @returns {Promise<object>} Deployment result
     */
    async deployChanges(deviceId) {
        throw new Error('deployChanges method must be implemented by vendor class');
    }

    /**
     * Normalize rule data to standard format
     * @param {object} vendorRule - Vendor-specific rule data
     * @returns {object} Normalized rule data
     */
    normalizeRule(vendorRule) {
        return {
            id: vendorRule.id || vendorRule.uuid,
            name: vendorRule.name || vendorRule.label,
            enabled: vendorRule.enabled !== false,
            action: vendorRule.action || 'allow',
            source: vendorRule.source || 'any',
            destination: vendorRule.destination || 'any',
            service: vendorRule.service || vendorRule.port || 'any',
            description: vendorRule.description || vendorRule.comment || '',
            createdAt: vendorRule.created_at || vendorRule.createdAt,
            modifiedAt: vendorRule.modified_at || vendorRule.modifiedAt,
            vendor: this.name,
            rawData: vendorRule
        };
    }

    /**
     * Handle API errors consistently
     * @param {Error} error - Error object
     * @param {string} operation - Operation that failed
     */
    handleApiError(error, operation) {
        const errorInfo = {
            vendor: this.name,
            operation,
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            timestamp: new Date().toISOString()
        };

        console.error(`[${this.name}] ${operation} failed:`, errorInfo);
        throw new Error(`${this.name} API Error: ${error.message}`);
    }

    /**
     * Make HTTP request with retry logic
     * @param {object} options - Request options
     * @returns {Promise<object>} Response data
     */
    async makeRequest(options) {
        const axios = require('axios');
        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await axios({
                    timeout: this.timeout,
                    ...options
                });
                return response.data;
            } catch (error) {
                lastError = error;
                if (attempt === this.retryAttempts) break;
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }

        this.handleApiError(lastError, options.method?.toUpperCase() + ' ' + options.url);
    }
}

module.exports = BaseVendor; 