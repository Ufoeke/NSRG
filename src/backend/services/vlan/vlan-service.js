/**
 * VLAN Service - Main orchestrator for VLAN/LAN management
 * Provides unified interface for multi-vendor switch operations
 */

const EventEmitter = require('events');
const switchFactory = require('./vendors/switch-factory');
const VlanSuggestionEngine = require('./vlan-suggestion-engine');
const IPSubnetCalculator = require('./ip-subnet-calculator');
const VLANNamingConventionEngine = require('./naming-convention-engine');

class VlanService extends EventEmitter {
    constructor(dbConnection = null) {
        super();
        
        this.db = dbConnection;
        this.connectedSwitches = new Map();
        this.vlanSuggestionEngine = new VlanSuggestionEngine(dbConnection);
        this.subnetCalculator = new IPSubnetCalculator();
        this.namingConventions = new VLANNamingConventionEngine();
        
        // Cache for frequently accessed data
        this.cache = {
            vlans: new Map(),
            switches: new Map(),
            subnets: new Map(),
            lastUpdated: new Map()
        };
        
        // Configuration
        this.config = {
            cacheTimeout: 300000, // 5 minutes
            batchSize: 50,
            maxConcurrentOperations: 10,
            autoSave: true,
            validationLevel: 'strict' // 'strict', 'moderate', 'permissive'
        };
    }

    /**
     * Initialize the VLAN service
     */
    async initialize() {
        try {
            if (this.db) {
                await this.validateDatabaseSchema();
            }
            
            await this.vlanSuggestionEngine.initialize();
            this.emit('initialized');
            
            console.log('VLAN Service initialized successfully');
            return true;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize VLAN service: ${error.message}`);
        }
    }

    /**
     * Add switch configuration and connect
     * @param {Object} switchConfig - Switch configuration
     * @returns {Promise<string>} Switch ID
     */
    async addSwitch(switchConfig) {
        try {
            // Validate configuration
            const validationErrors = switchFactory.validateConfig(switchConfig);
            if (validationErrors.length > 0) {
                throw new Error(`Invalid switch configuration: ${validationErrors.join(', ')}`);
            }

            // Create adapter
            const adapter = switchFactory.createAdapter(switchConfig);
            const switchId = `${switchConfig.vendor}-${switchConfig.hostname}`;

            // Store in database if available
            if (this.db) {
                await this.storeSwitchConfig(switchId, switchConfig);
            }

            // Connect to switch
            await adapter.connect();
            
            // Store connected adapter
            this.connectedSwitches.set(switchId, adapter);
            
            // Set up event handlers
            this.setupSwitchEventHandlers(switchId, adapter);
            
            this.emit('switchAdded', { switchId, config: switchConfig });
            console.log(`Switch ${switchId} added and connected successfully`);
            
            return switchId;
        } catch (error) {
            this.emit('error', { operation: 'addSwitch', error });
            throw error;
        }
    }

    /**
     * Remove switch and disconnect
     * @param {string} switchId - Switch identifier
     */
    async removeSwitch(switchId) {
        try {
            const adapter = this.connectedSwitches.get(switchId);
            if (adapter) {
                await adapter.disconnect();
                this.connectedSwitches.delete(switchId);
            }

            // Remove from database if available
            if (this.db) {
                await this.removeSwitchConfig(switchId);
            }

            // Clear cache
            this.clearSwitchCache(switchId);
            
            this.emit('switchRemoved', { switchId });
            console.log(`Switch ${switchId} removed successfully`);
        } catch (error) {
            this.emit('error', { operation: 'removeSwitch', switchId, error });
            throw error;
        }
    }

    /**
     * Get all connected switches
     * @returns {Array<Object>} Switch information
     */
    async getSwitches() {
        const switches = [];
        
        for (const [switchId, adapter] of this.connectedSwitches) {
            const status = adapter.getConnectionStatus();
            const systemInfo = status.connected ? await adapter.getSystemInfo() : null;
            
            switches.push({
                switchId,
                connected: status.connected,
                capabilities: status.capabilities,
                config: status.config,
                systemInfo
            });
        }
        
        return switches;
    }

    /**
     * Get VLANs from all switches or specific switch
     * @param {string} switchId - Optional specific switch ID
     * @returns {Promise<Object>} VLAN information
     */
    async getVlans(switchId = null) {
        try {
            if (switchId) {
                return await this.getSwitchVlans(switchId);
            }

            // Get VLANs from all switches
            const allVlans = {};
            const promises = Array.from(this.connectedSwitches.keys()).map(async (id) => {
                try {
                    allVlans[id] = await this.getSwitchVlans(id);
                } catch (error) {
                    console.error(`Failed to get VLANs from switch ${id}:`, error.message);
                    allVlans[id] = { error: error.message, vlans: [] };
                }
            });

            await Promise.all(promises);
            return allVlans;
        } catch (error) {
            this.emit('error', { operation: 'getVlans', switchId, error });
            throw error;
        }
    }

    /**
     * Get VLANs from specific switch
     * @param {string} switchId - Switch identifier
     * @returns {Promise<Object>} VLAN information
     */
    async getSwitchVlans(switchId) {
        const adapter = this.getAdapter(switchId);
        
        // Check cache first
        const cacheKey = `vlans-${switchId}`;
        if (this.isCacheValid(cacheKey)) {
            return this.cache.vlans.get(cacheKey);
        }

        const vlans = await adapter.getVlans();
        
        // Cache result
        this.cache.vlans.set(cacheKey, vlans);
        this.cache.lastUpdated.set(cacheKey, Date.now());
        
        return vlans;
    }

    /**
     * Create VLAN on specific switch or all switches
     * @param {Object} vlanConfig - VLAN configuration
     * @param {string} switchId - Optional specific switch ID
     * @returns {Promise<Object>} Creation results
     */
    async createVlan(vlanConfig, switchId = null) {
        try {
            // Validate VLAN configuration
            this.validateVlanConfig(vlanConfig);
            
            // Apply naming conventions if not specified
            if (!vlanConfig.name && vlanConfig.purpose) {
                vlanConfig.name = this.namingConventions.generateVlanName(vlanConfig);
            }

            if (switchId) {
                return await this.createSwitchVlan(switchId, vlanConfig);
            }

            // Create on all switches
            const results = {};
            const promises = Array.from(this.connectedSwitches.keys()).map(async (id) => {
                try {
                    results[id] = await this.createSwitchVlan(id, vlanConfig);
                } catch (error) {
                    console.error(`Failed to create VLAN on switch ${id}:`, error.message);
                    results[id] = { error: error.message, success: false };
                }
            });

            await Promise.all(promises);
            
            // Store in database if available
            if (this.db && !Object.values(results).some(r => r.error)) {
                await this.storeVlanConfig(vlanConfig, results);
            }

            this.emit('vlanCreated', { vlanConfig, results });
            return results;
        } catch (error) {
            this.emit('error', { operation: 'createVlan', vlanConfig, switchId, error });
            throw error;
        }
    }

    /**
     * Create VLAN on specific switch
     * @param {string} switchId - Switch identifier
     * @param {Object} vlanConfig - VLAN configuration
     * @returns {Promise<Object>} Creation result
     */
    async createSwitchVlan(switchId, vlanConfig) {
        const adapter = this.getAdapter(switchId);
        
        const result = await adapter.createVlan(vlanConfig);
        
        // Save configuration if auto-save enabled
        if (this.config.autoSave) {
            await adapter.saveConfiguration();
        }
        
        // Clear cache
        this.clearSwitchCache(switchId);
        
        return { success: true, vlan: result };
    }

    /**
     * Update VLAN configuration
     * @param {number} vlanId - VLAN ID to update
     * @param {Object} vlanConfig - New VLAN configuration
     * @param {string} switchId - Optional specific switch ID
     * @returns {Promise<Object>} Update results
     */
    async updateVlan(vlanId, vlanConfig, switchId = null) {
        try {
            this.validateVlanConfig(vlanConfig);

            if (switchId) {
                return await this.updateSwitchVlan(switchId, vlanId, vlanConfig);
            }

            // Update on all switches
            const results = {};
            const promises = Array.from(this.connectedSwitches.keys()).map(async (id) => {
                try {
                    results[id] = await this.updateSwitchVlan(id, vlanId, vlanConfig);
                } catch (error) {
                    console.error(`Failed to update VLAN on switch ${id}:`, error.message);
                    results[id] = { error: error.message, success: false };
                }
            });

            await Promise.all(promises);
            
            this.emit('vlanUpdated', { vlanId, vlanConfig, results });
            return results;
        } catch (error) {
            this.emit('error', { operation: 'updateVlan', vlanId, vlanConfig, switchId, error });
            throw error;
        }
    }

    /**
     * Update VLAN on specific switch
     * @param {string} switchId - Switch identifier
     * @param {number} vlanId - VLAN ID
     * @param {Object} vlanConfig - VLAN configuration
     * @returns {Promise<Object>} Update result
     */
    async updateSwitchVlan(switchId, vlanId, vlanConfig) {
        const adapter = this.getAdapter(switchId);
        
        const result = await adapter.updateVlan(vlanId, vlanConfig);
        
        if (this.config.autoSave) {
            await adapter.saveConfiguration();
        }
        
        this.clearSwitchCache(switchId);
        
        return { success: true, vlan: result };
    }

    /**
     * Delete VLAN
     * @param {number} vlanId - VLAN ID to delete
     * @param {string} switchId - Optional specific switch ID
     * @returns {Promise<Object>} Deletion results
     */
    async deleteVlan(vlanId, switchId = null) {
        try {
            if (switchId) {
                return await this.deleteSwitchVlan(switchId, vlanId);
            }

            // Delete from all switches
            const results = {};
            const promises = Array.from(this.connectedSwitches.keys()).map(async (id) => {
                try {
                    results[id] = await this.deleteSwitchVlan(id, vlanId);
                } catch (error) {
                    console.error(`Failed to delete VLAN from switch ${id}:`, error.message);
                    results[id] = { error: error.message, success: false };
                }
            });

            await Promise.all(promises);
            
            this.emit('vlanDeleted', { vlanId, results });
            return results;
        } catch (error) {
            this.emit('error', { operation: 'deleteVlan', vlanId, switchId, error });
            throw error;
        }
    }

    /**
     * Delete VLAN from specific switch
     * @param {string} switchId - Switch identifier
     * @param {number} vlanId - VLAN ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteSwitchVlan(switchId, vlanId) {
        const adapter = this.getAdapter(switchId);
        
        const result = await adapter.deleteVlan(vlanId);
        
        if (this.config.autoSave) {
            await adapter.saveConfiguration();
        }
        
        this.clearSwitchCache(switchId);
        
        return { success: result };
    }

    /**
     * Get available VLAN IDs
     * @param {string} switchId - Optional specific switch ID
     * @returns {Promise<Array<number>>} Available VLAN IDs
     */
    async getAvailableVlanIds(switchId = null) {
        const vlansData = await this.getVlans(switchId);
        
        if (switchId) {
            const usedIds = vlansData.map(vlan => vlan.vlanId);
            return this.generateAvailableIds(usedIds);
        }

        // Find commonly available IDs across all switches
        const allUsedIds = new Set();
        for (const switchVlans of Object.values(vlansData)) {
            if (Array.isArray(switchVlans)) {
                switchVlans.forEach(vlan => allUsedIds.add(vlan.vlanId));
            }
        }

        return this.generateAvailableIds(Array.from(allUsedIds));
    }

    /**
     * Generate available VLAN IDs
     * @param {Array<number>} usedIds - Currently used VLAN IDs
     * @returns {Array<number>} Available VLAN IDs
     */
    generateAvailableIds(usedIds) {
        const available = [];
        const usedSet = new Set(usedIds);
        
        // Standard ranges: 2-1001 (normal), 1002-1005 (reserved), 1006-4094 (extended)
        const ranges = [
            { start: 2, end: 1001 },      // Normal range
            { start: 1006, end: 4094 }    // Extended range
        ];
        
        for (const range of ranges) {
            for (let id = range.start; id <= range.end; id++) {
                if (!usedSet.has(id)) {
                    available.push(id);
                }
                
                // Limit suggestions to reasonable number
                if (available.length >= 100) {
                    break;
                }
            }
            if (available.length >= 100) break;
        }
        
        return available;
    }

    /**
     * Get VLAN suggestions based on purpose and network requirements
     * @param {Object} requirements - VLAN requirements
     * @returns {Promise<Object>} VLAN suggestions
     */
    async getVlanSuggestions(requirements) {
        return await this.vlanSuggestionEngine.generateSuggestions(requirements);
    }

    /**
     * Calculate subnet information
     * @param {Object} subnetRequirements - Subnet requirements
     * @returns {Promise<Object>} Subnet calculations
     */
    async calculateSubnet(subnetRequirements) {
        return this.subnetCalculator.calculate(subnetRequirements);
    }

    /**
     * Get switch adapter
     * @param {string} switchId - Switch identifier
     * @returns {BaseSwitchAdapter} Switch adapter
     */
    getAdapter(switchId) {
        const adapter = this.connectedSwitches.get(switchId);
        if (!adapter) {
            throw new Error(`Switch ${switchId} not found or not connected`);
        }
        return adapter;
    }

    /**
     * Set up event handlers for switch adapter
     * @param {string} switchId - Switch identifier
     * @param {BaseSwitchAdapter} adapter - Switch adapter
     */
    setupSwitchEventHandlers(switchId, adapter) {
        adapter.on('connectionEvent', (event) => {
            this.emit('switchEvent', { switchId, ...event });
        });

        adapter.on('error', (error) => {
            this.emit('switchError', { switchId, error });
        });

        adapter.on('log', (logEntry) => {
            this.emit('switchLog', { switchId, ...logEntry });
        });
    }

    /**
     * Validate VLAN configuration
     * @param {Object} vlanConfig - VLAN configuration to validate
     */
    validateVlanConfig(vlanConfig) {
        if (!vlanConfig) {
            throw new Error('VLAN configuration is required');
        }

        if (!vlanConfig.vlanId || !Number.isInteger(vlanConfig.vlanId)) {
            throw new Error('Valid VLAN ID is required');
        }

        if (vlanConfig.vlanId < 1 || vlanConfig.vlanId > 4094) {
            throw new Error('VLAN ID must be between 1 and 4094');
        }

        if (vlanConfig.name && vlanConfig.name.length > 32) {
            throw new Error('VLAN name cannot exceed 32 characters');
        }
    }

    /**
     * Check if cache is valid
     * @param {string} key - Cache key
     * @returns {boolean} Cache validity
     */
    isCacheValid(key) {
        const lastUpdated = this.cache.lastUpdated.get(key);
        if (!lastUpdated) return false;
        
        return (Date.now() - lastUpdated) < this.config.cacheTimeout;
    }

    /**
     * Clear cache for specific switch
     * @param {string} switchId - Switch identifier
     */
    clearSwitchCache(switchId) {
        const keysToDelete = [];
        
        for (const key of this.cache.vlans.keys()) {
            if (key.includes(switchId)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            this.cache.vlans.delete(key);
            this.cache.lastUpdated.delete(key);
        });
    }

    /**
     * Validate database schema (placeholder)
     */
    async validateDatabaseSchema() {
        // Would validate required tables exist
        return true;
    }

    /**
     * Store switch configuration in database (placeholder)
     */
    async storeSwitchConfig(switchId, config) {
        // Would store in database
        console.log(`Storing switch config for ${switchId}`);
    }

    /**
     * Remove switch configuration from database (placeholder)
     */
    async removeSwitchConfig(switchId) {
        // Would remove from database
        console.log(`Removing switch config for ${switchId}`);
    }

    /**
     * Store VLAN configuration in database (placeholder)
     */
    async storeVlanConfig(vlanConfig, results) {
        // Would store in database
        console.log(`Storing VLAN config for VLAN ${vlanConfig.vlanId}`);
    }

    /**
     * Cleanup resources
     */
    async destroy() {
        // Disconnect all switches
        const disconnectPromises = Array.from(this.connectedSwitches.values()).map(adapter => 
            adapter.destroy().catch(error => 
                console.error('Error disconnecting adapter:', error.message)
            )
        );
        
        await Promise.all(disconnectPromises);
        
        this.connectedSwitches.clear();
        this.removeAllListeners();
        
        console.log('VLAN Service destroyed');
    }
}

module.exports = VlanService;