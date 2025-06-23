/**
 * Switch Factory - Creates appropriate vendor adapter instances
 * Supports multiple switch vendors with unified interface
 */

const CiscoCatalystAdapter = require('./cisco-catalyst-adapter');

class SwitchFactory {
    constructor() {
        // Vendor mappings and aliases
        this.vendorMappings = {
            'cisco': CiscoCatalystAdapter,
            'cisco-catalyst': CiscoCatalystAdapter,
            'catalyst': CiscoCatalystAdapter,
            'meraki': null, // To be implemented
            'meraki-ms': null,
            'fortiswitch': null, // To be implemented
            'fortinet': null,
            'hpe': null, // To be implemented
            'aruba': null,
            'hpe-aruba': null
        };

        // Supported vendor information
        this.supportedVendors = {
            'cisco': {
                name: 'Cisco Catalyst',
                models: ['2960', '3560', '3750', '3850', '9200', '9300', '9400'],
                connectionTypes: ['ssh', 'telnet', 'snmp'],
                capabilities: ['vlans', 'trunking', 'portSecurity', 'stackable', 'poe', 'qos', 'stp', 'lacp']
            },
            'meraki': {
                name: 'Cisco Meraki MS',
                models: ['MS120', 'MS125', 'MS210', 'MS220', 'MS225', 'MS250', 'MS350', 'MS390', 'MS410', 'MS425'],
                connectionTypes: ['api'],
                capabilities: ['vlans', 'trunking', 'poe', 'qos', 'stp', 'lacp', 'cloud_managed']
            },
            'fortiswitch': {
                name: 'FortiSwitch',
                models: ['FS-108E', 'FS-124E', 'FS-148E', 'FS-224E', 'FS-248E', 'FS-448E', 'FS-524D', 'FS-548D'],
                connectionTypes: ['ssh', 'api', 'fortigate_managed'],
                capabilities: ['vlans', 'trunking', 'poe', 'qos', 'stp', 'lacp', 'fortigate_integration']
            },
            'hpe': {
                name: 'HPE/Aruba',
                models: ['2530', '2540', '2920', '2930F', '2930M', '3810M', '5400R', '6200F', '6300M', '6400'],
                connectionTypes: ['ssh', 'telnet', 'snmp', 'api'],
                capabilities: ['vlans', 'trunking', 'poe', 'qos', 'stp', 'lacp', 'stacking']
            }
        };
    }

    /**
     * Create switch adapter instance
     * @param {Object} switchConfig - Switch configuration
     * @returns {BaseSwitchAdapter} Switch adapter instance
     */
    createAdapter(switchConfig) {
        if (!switchConfig || !switchConfig.vendor) {
            throw new Error('Switch configuration with vendor is required');
        }

        const vendorKey = this.normalizeVendorName(switchConfig.vendor);
        const AdapterClass = this.vendorMappings[vendorKey];

        if (!AdapterClass) {
            throw new Error(`Unsupported switch vendor: ${switchConfig.vendor}. Supported vendors: ${this.getSupportedVendorNames().join(', ')}`);
        }

        try {
            return new AdapterClass(switchConfig);
        } catch (error) {
            throw new Error(`Failed to create ${switchConfig.vendor} adapter: ${error.message}`);
        }
    }

    /**
     * Normalize vendor name to match mapping keys
     * @param {string} vendor - Raw vendor name
     * @returns {string} Normalized vendor name
     */
    normalizeVendorName(vendor) {
        if (!vendor) return null;
        
        const normalized = vendor.toLowerCase().trim();
        
        // Direct match first
        if (this.vendorMappings[normalized]) {
            return normalized;
        }

        // Check for partial matches
        for (const [key] of Object.entries(this.vendorMappings)) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return key;
            }
        }

        return normalized;
    }

    /**
     * Get list of supported vendor names
     * @returns {Array<string>} Supported vendor names
     */
    getSupportedVendorNames() {
        return Object.keys(this.supportedVendors);
    }

    /**
     * Get detailed information about supported vendors
     * @returns {Object} Vendor information
     */
    getSupportedVendors() {
        return this.supportedVendors;
    }

    /**
     * Check if vendor is supported
     * @param {string} vendor - Vendor name to check
     * @returns {boolean} Support status
     */
    isVendorSupported(vendor) {
        const normalizedVendor = this.normalizeVendorName(vendor);
        return this.vendorMappings[normalizedVendor] !== undefined;
    }

    /**
     * Get vendor information
     * @param {string} vendor - Vendor name
     * @returns {Object|null} Vendor information
     */
    getVendorInfo(vendor) {
        const normalizedVendor = this.normalizeVendorName(vendor);
        
        // Find the base vendor name
        for (const [baseVendor, info] of Object.entries(this.supportedVendors)) {
            if (normalizedVendor === baseVendor || normalizedVendor.includes(baseVendor)) {
                return info;
            }
        }
        
        return null;
    }

    /**
     * Detect vendor from system information
     * @param {Object} systemInfo - System information from device
     * @returns {string|null} Detected vendor
     */
    detectVendor(systemInfo) {
        if (!systemInfo) return null;

        const { manufacturer, model, version, description } = systemInfo;
        const searchText = [manufacturer, model, version, description]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        // Cisco detection
        if (searchText.includes('cisco') || searchText.includes('catalyst')) {
            if (searchText.includes('meraki')) {
                return 'meraki';
            }
            return 'cisco';
        }

        // FortiSwitch detection
        if (searchText.includes('forti') || searchText.includes('fortinet')) {
            return 'fortiswitch';
        }

        // HPE/Aruba detection
        if (searchText.includes('hpe') || searchText.includes('aruba') || 
            searchText.includes('hewlett') || searchText.includes('procurve')) {
            return 'hpe';
        }

        return null;
    }

    /**
     * Get recommended configuration for vendor
     * @param {string} vendor - Vendor name
     * @returns {Object} Recommended configuration
     */
    getRecommendedConfig(vendor) {
        const vendorInfo = this.getVendorInfo(vendor);
        if (!vendorInfo) {
            return null;
        }

        const baseConfig = {
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000
        };

        switch (vendor.toLowerCase()) {
            case 'cisco':
            case 'cisco-catalyst':
                return {
                    ...baseConfig,
                    sshPort: 22,
                    enableMode: true,
                    configMode: true,
                    saveCommand: 'write memory'
                };

            case 'meraki':
                return {
                    ...baseConfig,
                    apiVersion: 'v1',
                    rateLimitPerSecond: 5,
                    batchSize: 10
                };

            case 'fortiswitch':
                return {
                    ...baseConfig,
                    sshPort: 22,
                    adminMode: true,
                    configMode: true
                };

            case 'hpe':
            case 'aruba':
                return {
                    ...baseConfig,
                    sshPort: 22,
                    enableMode: true,
                    configMode: true,
                    saveCommand: 'write memory'
                };

            default:
                return baseConfig;
        }
    }

    /**
     * Validate switch configuration
     * @param {Object} switchConfig - Configuration to validate
     * @returns {Array<string>} Validation errors
     */
    validateConfig(switchConfig) {
        const errors = [];

        if (!switchConfig) {
            errors.push('Switch configuration is required');
            return errors;
        }

        // Required fields
        const requiredFields = ['vendor', 'hostname', 'ipAddress'];
        for (const field of requiredFields) {
            if (!switchConfig[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Vendor validation
        if (switchConfig.vendor && !this.isVendorSupported(switchConfig.vendor)) {
            errors.push(`Unsupported vendor: ${switchConfig.vendor}`);
        }

        // IP address validation
        if (switchConfig.ipAddress && !this.isValidIP(switchConfig.ipAddress)) {
            errors.push(`Invalid IP address: ${switchConfig.ipAddress}`);
        }

        // Credentials validation
        if (!switchConfig.credentials || typeof switchConfig.credentials !== 'object') {
            errors.push('Credentials object is required');
        } else {
            if (!switchConfig.credentials.username) {
                errors.push('Username is required in credentials');
            }
            if (!switchConfig.credentials.password && !switchConfig.credentials.privateKeyPath) {
                errors.push('Password or private key path is required in credentials');
            }
        }

        return errors;
    }

    /**
     * Validate IP address format
     * @param {string} ip - IP address to validate
     * @returns {boolean} Valid IP address
     */
    isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * Create multiple adapters from configuration array
     * @param {Array<Object>} switchConfigs - Array of switch configurations
     * @returns {Array<BaseSwitchAdapter>} Array of adapter instances
     */
    createMultipleAdapters(switchConfigs) {
        if (!Array.isArray(switchConfigs)) {
            throw new Error('Switch configurations must be an array');
        }

        const adapters = [];
        const errors = [];

        for (let i = 0; i < switchConfigs.length; i++) {
            try {
                const adapter = this.createAdapter(switchConfigs[i]);
                adapters.push(adapter);
            } catch (error) {
                errors.push(`Switch ${i}: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Failed to create some adapters:\n${errors.join('\n')}`);
        }

        return adapters;
    }

    /**
     * Get statistics about factory usage
     * @returns {Object} Factory statistics
     */
    getStatistics() {
        return {
            supportedVendors: Object.keys(this.supportedVendors).length,
            implementedVendors: Object.values(this.vendorMappings).filter(v => v !== null).length,
            totalMappings: Object.keys(this.vendorMappings).length
        };
    }
}

// Export singleton instance
module.exports = new SwitchFactory(); 