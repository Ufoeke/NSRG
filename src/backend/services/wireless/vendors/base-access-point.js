/**
 * Base Access Point Driver
 * Abstract base class defining the common interface for all wireless access point vendors
 */

const { EventEmitter } = require('events');

class BaseAccessPoint extends EventEmitter {
    constructor(config) {
        super();
        
        if (this.constructor === BaseAccessPoint) {
            throw new Error('BaseAccessPoint is an abstract class and cannot be instantiated directly');
        }
        
        this.config = {
            host: null,
            port: null,
            username: null,
            password: null,
            apiKey: null,
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            ...config
        };
        
        this.vendor = null;
        this.model = null;
        this.connected = false;
        this.lastError = null;
        this.capabilities = {
            maxSSIDs: 16,
            supportedBands: ['2.4GHz', '5GHz'],
            maxClients: 256
        };
        
        // Connection pool and state management
        this.connectionPool = new Map();
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }

    // Abstract methods that must be implemented by vendor-specific drivers
    
    /**
     * Connect to the access point management interface
     * @returns {Promise<boolean>} Connection success status
     */
    async connect() {
        throw new Error('connect() method must be implemented by vendor-specific driver');
    }

    /**
     * Disconnect from the access point management interface
     * @returns {Promise<boolean>} Disconnection success status
     */
    async disconnect() {
        throw new Error('disconnect() method must be implemented by vendor-specific driver');
    }

    /**
     * Authenticate with the access point management system
     * @returns {Promise<boolean>} Authentication success status
     */
    async authenticate() {
        throw new Error('authenticate() method must be implemented by vendor-specific driver');
    }

    /**
     * Get access point system information
     * @returns {Promise<Object>} System information object
     */
    async getSystemInfo() {
        throw new Error('getSystemInfo() method must be implemented by vendor-specific driver');
    }

    /**
     * Create a new SSID on the access point
     * @param {Object} ssidConfig - SSID configuration object
     * @returns {Promise<Object>} Created SSID details
     */
    async createSSID(ssidConfig) {
        throw new Error('createSSID() method must be implemented by vendor-specific driver');
    }

    /**
     * Update an existing SSID configuration
     * @param {string} ssidId - SSID identifier
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>} Updated SSID details
     */
    async updateSSID(ssidId, updates) {
        throw new Error('updateSSID() method must be implemented by vendor-specific driver');
    }

    /**
     * Delete an SSID from the access point
     * @param {string} ssidId - SSID identifier
     * @returns {Promise<boolean>} Deletion success status
     */
    async deleteSSID(ssidId) {
        throw new Error('deleteSSID() method must be implemented by vendor-specific driver');
    }

    /**
     * List all configured SSIDs
     * @returns {Promise<Array>} Array of SSID objects
     */
    async listSSIDs() {
        throw new Error('listSSIDs() method must be implemented by vendor-specific driver');
    }

    /**
     * Apply security profile to SSID
     * @param {string} ssidId - SSID identifier
     * @param {Object} securityProfile - Security configuration
     * @returns {Promise<boolean>} Application success status
     */
    async applySecurityProfile(ssidId, securityProfile) {
        throw new Error('applySecurityProfile() method must be implemented by vendor-specific driver');
    }

    /**
     * Configure VLAN mapping for SSID
     * @param {string} ssidId - SSID identifier
     * @param {number} vlanId - VLAN ID
     * @returns {Promise<boolean>} Configuration success status
     */
    async configureVLAN(ssidId, vlanId) {
        throw new Error('configureVLAN() method must be implemented by vendor-specific driver');
    }

    /**
     * Get current wireless client information
     * @returns {Promise<Array>} Array of connected client objects
     */
    async getClients() {
        throw new Error('getClients() method must be implemented by vendor-specific driver');
    }

    /**
     * Get wireless statistics and performance metrics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        throw new Error('getStatistics() method must be implemented by vendor-specific driver');
    }

    /**
     * Reboot the access point
     * @returns {Promise<boolean>} Reboot initiation success status
     */
    async reboot() {
        throw new Error('reboot() method must be implemented by vendor-specific driver');
    }

    // Common utility methods available to all vendor implementations

    /**
     * Validate SSID configuration against vendor capabilities
     * @param {Object} ssidConfig - SSID configuration to validate
     * @returns {Object} Validation result with errors if any
     */
    validateSSIDConfig(ssidConfig) {
        const errors = [];
        
        // Common validation rules
        if (!ssidConfig.name || ssidConfig.name.length === 0) {
            errors.push('SSID name is required');
        }
        
        if (ssidConfig.name && ssidConfig.name.length > 32) {
            errors.push('SSID name cannot exceed 32 characters');
        }
        
        if (ssidConfig.name && !/^[a-zA-Z0-9_-]+$/.test(ssidConfig.name)) {
            errors.push('SSID name contains invalid characters');
        }
        
        if (ssidConfig.vlanId && (ssidConfig.vlanId < 1 || ssidConfig.vlanId > 4094)) {
            errors.push('VLAN ID must be between 1 and 4094');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Execute API request with retry logic and error handling
     * @param {Function} requestFunction - Function that makes the API request
     * @param {Object} options - Request options
     * @returns {Promise<any>} Request result
     */
    async executeWithRetry(requestFunction, options = {}) {
        const { 
            retryAttempts = this.config.retryAttempts,
            retryDelay = this.config.retryDelay,
            timeout = this.config.timeout
        } = options;
        
        let lastError;
        
        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                // Set timeout for the request
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timeout')), timeout);
                });
                
                const result = await Promise.race([
                    requestFunction(),
                    timeoutPromise
                ]);
                
                // Success - emit event and return result
                this.emit('requestSuccess', {
                    attempt,
                    totalAttempts: retryAttempts
                });
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                this.emit('requestError', {
                    error,
                    attempt,
                    totalAttempts: retryAttempts
                });
                
                // If this is the last attempt, don't wait
                if (attempt === retryAttempts) {
                    break;
                }
                
                // Wait before retry
                await this.delay(retryDelay * attempt); // Exponential backoff
            }
        }
        
        // All attempts failed
        this.lastError = lastError;
        throw new Error(`Request failed after ${retryAttempts} attempts: ${lastError.message}`);
    }

    /**
     * Queue request for processing to avoid overwhelming the access point
     * @param {Function} requestFunction - Function that makes the request
     * @returns {Promise<any>} Request result
     */
    async queueRequest(requestFunction) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                function: requestFunction,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            this.processQueue();
        });
    }

    /**
     * Process queued requests sequentially
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            
            try {
                const result = await this.executeWithRetry(request.function);
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }
            
            // Small delay between requests to avoid overwhelming the AP
            await this.delay(100);
        }
        
        this.isProcessingQueue = false;
    }

    /**
     * Utility method for creating delays
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Sanitize configuration data for logging (remove sensitive information)
     * @param {Object} config - Configuration object to sanitize
     * @returns {Object} Sanitized configuration
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        
        // Remove sensitive fields
        const sensitiveFields = ['password', 'apiKey', 'secret', 'token', 'passphrase'];
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '***REDACTED***';
            }
        });
        
        return sanitized;
    }

    /**
     * Get vendor-specific configuration template
     * @returns {Object} Configuration template with required fields
     */
    getConfigTemplate() {
        return {
            host: 'Access point IP address or hostname',
            port: 'Management port (optional)',
            username: 'Admin username',
            password: 'Admin password',
            apiKey: 'API key (if supported)',
            timeout: 'Request timeout in milliseconds',
            retryAttempts: 'Number of retry attempts',
            retryDelay: 'Delay between retries in milliseconds'
        };
    }

    /**
     * Test connection to the access point
     * @returns {Promise<Object>} Connection test result
     */
    async testConnection() {
        const startTime = Date.now();
        
        try {
            await this.connect();
            await this.authenticate();
            const systemInfo = await this.getSystemInfo();
            await this.disconnect();
            
            const endTime = Date.now();
            
            return {
                success: true,
                responseTime: endTime - startTime,
                systemInfo,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get current driver status and health information
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            vendor: this.vendor,
            model: this.model,
            connected: this.connected,
            config: this.sanitizeConfig(this.config),
            capabilities: this.capabilities,
            queueLength: this.requestQueue.length,
            isProcessingQueue: this.isProcessingQueue,
            lastError: this.lastError ? this.lastError.message : null,
            uptime: process.uptime()
        };
    }

    /**
     * Cleanup resources and connections
     */
    async cleanup() {
        try {
            if (this.connected) {
                await this.disconnect();
            }
            
            // Clear any pending requests
            this.requestQueue.forEach(request => {
                request.reject(new Error('Driver cleanup - request cancelled'));
            });
            this.requestQueue = [];
            
            // Remove all event listeners
            this.removeAllListeners();
            
        } catch (error) {
            console.error('Error during driver cleanup:', error);
        }
    }
}

module.exports = BaseAccessPoint;