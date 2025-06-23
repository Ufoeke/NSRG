const VendorFactory = require('./vendors/vendor-factory');
const logger = require('../../shared/logger');

/**
 * Main Firewall Service Manager
 * Provides a unified interface for managing multiple firewall vendors
 */
class FirewallService {
    constructor() {
        this.vendorInstances = new Map();
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Register a firewall vendor with the service
     * @param {string} vendorId - Unique identifier for this vendor instance
     * @param {string} vendorType - Type of vendor (fortigate, cisco-fmc, etc.)
     * @param {object} config - Vendor configuration
     * @returns {Promise<object>} Registration result
     */
    async registerVendor(vendorId, vendorType, config) {
        try {
            // Validate configuration
            const validation = VendorFactory.validateConfig(vendorType, config);
            if (!validation.valid) {
                throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
            }

            // Create vendor instance
            const vendor = VendorFactory.createVendor(vendorType, config);
            
            // Test connection
            const connectionTest = await vendor.testConnection();
            if (!connectionTest) {
                throw new Error('Failed to connect to vendor API');
            }

            // Store vendor instance
            this.vendorInstances.set(vendorId, {
                vendor,
                config: VendorFactory.normalizeConfig(vendorType, config),
                type: vendorType,
                registeredAt: new Date().toISOString(),
                lastConnected: new Date().toISOString()
            });

            logger.info(`Vendor registered successfully: ${vendorId} (${vendorType})`);
            
            return {
                success: true,
                vendorId,
                vendorType,
                capabilities: validation.vendorInfo.capabilities,
                warnings: validation.warnings
            };
        } catch (error) {
            logger.error(`Failed to register vendor ${vendorId}:`, error);
            throw error;
        }
    }

    /**
     * Get all registered vendors
     * @returns {Array<object>} List of registered vendors
     */
    getRegisteredVendors() {
        const vendors = [];
        for (const [vendorId, vendorInfo] of this.vendorInstances) {
            vendors.push({
                id: vendorId,
                type: vendorInfo.type,
                name: vendorInfo.config.name || vendorId,
                registeredAt: vendorInfo.registeredAt,
                lastConnected: vendorInfo.lastConnected,
                capabilities: VendorFactory.getVendorInfo(vendorInfo.type).capabilities
            });
        }
        return vendors;
    }

    /**
     * Get vendor instance by ID
     * @param {string} vendorId - Vendor ID
     * @returns {object} Vendor instance info
     */
    getVendor(vendorId) {
        const vendorInfo = this.vendorInstances.get(vendorId);
        if (!vendorInfo) {
            throw new Error(`Vendor not found: ${vendorId}`);
        }
        return vendorInfo;
    }

    /**
     * Get all devices from all vendors
     * @returns {Promise<Array<object>>} List of all devices
     */
    async getAllDevices() {
        const cacheKey = 'all_devices';
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const allDevices = [];
        
        for (const [vendorId, vendorInfo] of this.vendorInstances) {
            try {
                const devices = await vendorInfo.vendor.getDevices();
                const enrichedDevices = devices.map(device => ({
                    ...device,
                    vendorId,
                    vendorType: vendorInfo.type
                }));
                allDevices.push(...enrichedDevices);
            } catch (error) {
                logger.error(`Failed to get devices from vendor ${vendorId}:`, error);
                // Continue with other vendors
            }
        }

        this.setCachedData(cacheKey, allDevices);
        return allDevices;
    }

    /**
     * Get devices from a specific vendor
     * @param {string} vendorId - Vendor ID
     * @returns {Promise<Array<object>>} List of devices
     */
    async getDevices(vendorId) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            const devices = await vendorInfo.vendor.getDevices();
            return devices.map(device => ({
                ...device,
                vendorId,
                vendorType: vendorInfo.type
            }));
        } catch (error) {
            logger.error(`Failed to get devices from vendor ${vendorId}:`, error);
            throw error;
        }
    }

    /**
     * Get firewall rules from all vendors
     * @param {object} filters - Filters to apply
     * @returns {Promise<Array<object>>} List of all rules
     */
    async getAllRules(filters = {}) {
        const cacheKey = `all_rules_${JSON.stringify(filters)}`;
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const allRules = [];
        
        for (const [vendorId, vendorInfo] of this.vendorInstances) {
            try {
                const devices = await vendorInfo.vendor.getDevices();
                
                for (const device of devices) {
                    const rules = await vendorInfo.vendor.getRules(device.id, filters);
                    const enrichedRules = rules.map(rule => ({
                        ...rule,
                        vendorId,
                        vendorType: vendorInfo.type,
                        deviceId: device.id,
                        deviceName: device.name
                    }));
                    allRules.push(...enrichedRules);
                }
            } catch (error) {
                logger.error(`Failed to get rules from vendor ${vendorId}:`, error);
                // Continue with other vendors
            }
        }

        this.setCachedData(cacheKey, allRules);
        return allRules;
    }

    /**
     * Get rules from a specific device
     * @param {string} vendorId - Vendor ID
     * @param {string} deviceId - Device ID
     * @param {object} filters - Filters to apply
     * @returns {Promise<Array<object>>} List of rules
     */
    async getRules(vendorId, deviceId, filters = {}) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            const rules = await vendorInfo.vendor.getRules(deviceId, filters);
            return rules.map(rule => ({
                ...rule,
                vendorId,
                vendorType: vendorInfo.type,
                deviceId
            }));
        } catch (error) {
            logger.error(`Failed to get rules from ${vendorId}/${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Create a new firewall rule
     * @param {string} vendorId - Vendor ID
     * @param {string} deviceId - Device ID
     * @param {object} ruleData - Rule data
     * @returns {Promise<object>} Created rule
     */
    async createRule(vendorId, deviceId, ruleData) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            // Validate rule
            const validation = await vendorInfo.vendor.validateRule(ruleData);
            if (!validation.valid) {
                throw new Error(`Rule validation failed: ${validation.errors.join(', ')}`);
            }

            // Create rule
            const rule = await vendorInfo.vendor.createRule(deviceId, ruleData);
            
            // Clear cache
            this.clearCache();
            
            logger.info(`Rule created successfully: ${rule.id} on ${vendorId}/${deviceId}`);
            
            return {
                ...rule,
                vendorId,
                vendorType: vendorInfo.type,
                deviceId
            };
        } catch (error) {
            logger.error(`Failed to create rule on ${vendorId}/${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Update an existing firewall rule
     * @param {string} vendorId - Vendor ID
     * @param {string} deviceId - Device ID
     * @param {string} ruleId - Rule ID
     * @param {object} ruleData - Updated rule data
     * @returns {Promise<object>} Updated rule
     */
    async updateRule(vendorId, deviceId, ruleId, ruleData) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            // Validate rule
            const validation = await vendorInfo.vendor.validateRule(ruleData);
            if (!validation.valid) {
                throw new Error(`Rule validation failed: ${validation.errors.join(', ')}`);
            }

            // Update rule
            const rule = await vendorInfo.vendor.updateRule(deviceId, ruleId, ruleData);
            
            // Clear cache
            this.clearCache();
            
            logger.info(`Rule updated successfully: ${ruleId} on ${vendorId}/${deviceId}`);
            
            return {
                ...rule,
                vendorId,
                vendorType: vendorInfo.type,
                deviceId
            };
        } catch (error) {
            logger.error(`Failed to update rule ${ruleId} on ${vendorId}/${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a firewall rule
     * @param {string} vendorId - Vendor ID
     * @param {string} deviceId - Device ID
     * @param {string} ruleId - Rule ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteRule(vendorId, deviceId, ruleId) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            const success = await vendorInfo.vendor.deleteRule(deviceId, ruleId);
            
            // Clear cache
            this.clearCache();
            
            logger.info(`Rule deleted successfully: ${ruleId} on ${vendorId}/${deviceId}`);
            
            return success;
        } catch (error) {
            logger.error(`Failed to delete rule ${ruleId} on ${vendorId}/${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Deploy configuration changes to a device
     * @param {string} vendorId - Vendor ID
     * @param {string} deviceId - Device ID
     * @returns {Promise<object>} Deployment result
     */
    async deployChanges(vendorId, deviceId) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            const result = await vendorInfo.vendor.deployChanges(deviceId);
            logger.info(`Configuration deployed successfully on ${vendorId}/${deviceId}`);
            return result;
        } catch (error) {
            logger.error(`Failed to deploy configuration on ${vendorId}/${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get available ports and services from all vendors
     * @returns {Promise<object>} Consolidated ports and services
     */
    async getPortsAndServices() {
        const cacheKey = 'ports_and_services';
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const consolidatedData = {
            services: [],
            serviceGroups: [],
            commonPorts: []
        };

        for (const [vendorId, vendorInfo] of this.vendorInstances) {
            try {
                const data = await vendorInfo.vendor.getPortsAndServices();
                
                // Add vendor-specific data with vendor context
                if (data.services) {
                    consolidatedData.services.push(...data.services.map(service => ({
                        ...service,
                        vendorId,
                        vendorType: vendorInfo.type
                    })));
                }
                
                if (data.serviceGroups) {
                    consolidatedData.serviceGroups.push(...data.serviceGroups.map(group => ({
                        ...group,
                        vendorId,
                        vendorType: vendorInfo.type
                    })));
                }
                
                if (data.commonPorts) {
                    consolidatedData.commonPorts.push(...data.commonPorts);
                }
            } catch (error) {
                logger.error(`Failed to get ports/services from vendor ${vendorId}:`, error);
                // Continue with other vendors
            }
        }

        // Remove duplicates from common ports
        consolidatedData.commonPorts = consolidatedData.commonPorts.filter((port, index, self) =>
            index === self.findIndex(p => p.port === port.port && p.protocol === port.protocol)
        );

        this.setCachedData(cacheKey, consolidatedData);
        return consolidatedData;
    }

    /**
     * Batch create rules across multiple devices
     * @param {Array<object>} ruleRequests - Array of rule creation requests
     * @returns {Promise<Array<object>>} Results of all rule creations
     */
    async batchCreateRules(ruleRequests) {
        const results = [];
        
        for (const request of ruleRequests) {
            try {
                const rule = await this.createRule(
                    request.vendorId,
                    request.deviceId,
                    request.ruleData
                );
                results.push({
                    success: true,
                    rule,
                    vendorId: request.vendorId,
                    deviceId: request.deviceId
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    vendorId: request.vendorId,
                    deviceId: request.deviceId
                });
            }
        }
        
        return results;
    }

    /**
     * Test connection to a specific vendor
     * @param {string} vendorId - Vendor ID
     * @returns {Promise<boolean>} Connection status
     */
    async testVendorConnection(vendorId) {
        const vendorInfo = this.getVendor(vendorId);
        
        try {
            const connected = await vendorInfo.vendor.testConnection();
            if (connected) {
                vendorInfo.lastConnected = new Date().toISOString();
            }
            return connected;
        } catch (error) {
            logger.error(`Connection test failed for vendor ${vendorId}:`, error);
            return false;
        }
    }

    /**
     * Get supported vendor types
     * @returns {Array<string>} List of supported vendor types
     */
    getSupportedVendorTypes() {
        return VendorFactory.getSupportedVendors();
    }

    /**
     * Get vendor information
     * @param {string} vendorType - Vendor type
     * @returns {object} Vendor information
     */
    getVendorInfo(vendorType) {
        return VendorFactory.getVendorInfo(vendorType);
    }

    // Cache management methods
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    /**
     * Get service statistics
     * @returns {object} Service statistics
     */
    getStats() {
        return {
            registeredVendors: this.vendorInstances.size,
            cacheSize: this.cache.size,
            supportedVendorTypes: this.getSupportedVendorTypes().length,
            uptime: process.uptime()
        };
    }
}

module.exports = FirewallService; 