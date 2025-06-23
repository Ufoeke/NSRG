const FortiGateVendor = require('./fortigate-vendor');
const CiscoFMCVendor = require('./cisco-fmc-vendor');
const PaloAltoVendor = require('./palo-alto-vendor');

/**
 * Vendor Factory for creating firewall vendor instances
 * Centralizes vendor management and configuration
 */
class VendorFactory {
    static vendors = {
        'fortigate': FortiGateVendor,
        'fortinet': FortiGateVendor, // Alias
        'cisco-fmc': CiscoFMCVendor,
        'cisco-ftd': CiscoFMCVendor, // Alias - FTD managed through FMC
        'firepower': CiscoFMCVendor, // Alias
        'palo-alto': PaloAltoVendor,
        'pan-os': PaloAltoVendor, // Alias
        'panorama': PaloAltoVendor // Alias
    };

    /**
     * Create a vendor instance based on vendor type
     * @param {string} vendorType - Type of vendor (fortigate, cisco-fmc, palo-alto, etc.)
     * @param {object} config - Vendor configuration
     * @returns {BaseVendor} Vendor instance
     */
    static createVendor(vendorType, config) {
        const normalizedType = vendorType.toLowerCase().trim();
        const VendorClass = this.vendors[normalizedType];
        
        if (!VendorClass) {
            throw new Error(`Unsupported vendor type: ${vendorType}. Supported vendors: ${Object.keys(this.vendors).join(', ')}`);
        }

        return new VendorClass(config);
    }

    /**
     * Get list of supported vendor types
     * @returns {Array<string>} List of supported vendor types
     */
    static getSupportedVendors() {
        return Object.keys(this.vendors);
    }

    /**
     * Get vendor capabilities and information
     * @param {string} vendorType - Type of vendor
     * @returns {object} Vendor information
     */
    static getVendorInfo(vendorType) {
        const normalizedType = vendorType.toLowerCase().trim();
        
        const vendorInfo = {
            'fortigate': {
                name: 'FortiGate/FortiManager',
                description: 'Fortinet FortiGate firewalls managed through FortiOS API or FortiManager',
                capabilities: ['firewall_rules', 'nat_rules', 'vpn', 'utm'],
                authMethods: ['username_password'],
                configFields: ['apiUrl', 'username', 'password', 'vdom', 'deviceId'],
                apiVersion: 'v2',
                documentationUrl: 'https://docs.fortinet.com/document/fortigate/7.0.0/administration-guide'
            },
            'cisco-fmc': {
                name: 'Cisco Firepower Management Center',
                description: 'Cisco FTD devices managed through Firepower Management Center',
                capabilities: ['firewall_rules', 'intrusion_policy', 'vpn', 'url_filtering'],
                authMethods: ['username_password'],
                configFields: ['apiUrl', 'username', 'password', 'domainUUID'],
                apiVersion: 'v1',
                documentationUrl: 'https://www.cisco.com/c/en/us/td/docs/security/firepower/623/api/REST'
            },
            'palo-alto': {
                name: 'Palo Alto Networks',
                description: 'PAN-OS devices managed through XML API or Panorama',
                capabilities: ['firewall_rules', 'nat_rules', 'vpn', 'url_filtering', 'threat_prevention'],
                authMethods: ['username_password', 'api_key'],
                configFields: ['apiUrl', 'username', 'password', 'deviceGroup', 'vsys'],
                apiVersion: 'XML API',
                documentationUrl: 'https://docs.paloaltonetworks.com/pan-os/10-2/pan-os-panorama-api'
            }
        };

        if (vendorInfo[normalizedType]) {
            return vendorInfo[normalizedType];
        }

        // Check aliases
        for (const [key, info] of Object.entries(vendorInfo)) {
            if (this.vendors[normalizedType] === this.vendors[key]) {
                return { ...info, alias: normalizedType };
            }
        }

        throw new Error(`Unknown vendor type: ${vendorType}`);
    }

    /**
     * Validate vendor configuration
     * @param {string} vendorType - Type of vendor
     * @param {object} config - Configuration to validate
     * @returns {object} Validation result
     */
    static validateConfig(vendorType, config) {
        const errors = [];
        const warnings = [];
        
        try {
            const vendorInfo = this.getVendorInfo(vendorType);
            
            // Check required fields
            if (!config.apiUrl) {
                errors.push('API URL is required');
            } else {
                try {
                    new URL(config.apiUrl);
                } catch {
                    errors.push('Invalid API URL format');
                }
            }

            if (!config.credentials) {
                errors.push('Credentials are required');
            } else {
                if (!config.credentials.username) {
                    errors.push('Username is required');
                }
                if (!config.credentials.password && !config.credentials.apiKey) {
                    errors.push('Password or API key is required');
                }
            }

            // Vendor-specific validations
            if (vendorType.includes('cisco-fmc')) {
                if (!config.domainUUID) {
                    warnings.push('Domain UUID not specified, will use global domain');
                }
            }

            if (vendorType.includes('palo-alto')) {
                if (!config.vsys && !config.deviceGroup) {
                    warnings.push('Virtual system or device group not specified, will use defaults');
                }
            }

            if (vendorType.includes('fortigate')) {
                if (!config.vdom) {
                    warnings.push('VDOM not specified, will use root');
                }
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings,
                vendorInfo
            };
        } catch (error) {
            return {
                valid: false,
                errors: [error.message],
                warnings: []
            };
        }
    }

    /**
     * Test connection to vendor API
     * @param {string} vendorType - Type of vendor
     * @param {object} config - Vendor configuration
     * @returns {Promise<object>} Test result
     */
    static async testConnection(vendorType, config) {
        try {
            const validation = this.validateConfig(vendorType, config);
            if (!validation.valid) {
                return {
                    success: false,
                    error: 'Configuration validation failed',
                    details: validation.errors
                };
            }

            const vendor = this.createVendor(vendorType, config);
            const connected = await vendor.testConnection();
            
            return {
                success: connected,
                vendor: vendorType,
                message: connected ? 'Connection successful' : 'Connection failed',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                vendor: vendorType,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get example configuration for a vendor
     * @param {string} vendorType - Type of vendor
     * @returns {object} Example configuration
     */
    static getExampleConfig(vendorType) {
        const normalizedType = vendorType.toLowerCase().trim();
        
        const examples = {
            'fortigate': {
                apiUrl: 'https://fortigate.example.com',
                credentials: {
                    username: 'admin',
                    password: 'your_password'
                },
                vdom: 'root',
                deviceId: 'FGT60F1234567890',
                timeout: 30000,
                retryAttempts: 3
            },
            'cisco-fmc': {
                apiUrl: 'https://fmc.example.com',
                credentials: {
                    username: 'admin',
                    password: 'your_password'
                },
                domainUUID: 'e276abec-e0f2-11e3-8169-6d9ed49b625f',
                timeout: 45000,
                retryAttempts: 3
            },
            'palo-alto': {
                apiUrl: 'https://panorama.example.com',
                credentials: {
                    username: 'admin',
                    password: 'your_password'
                },
                deviceGroup: 'shared',
                vsys: 'vsys1',
                timeout: 30000,
                retryAttempts: 3
            }
        };

        // Handle aliases
        for (const [key, config] of Object.entries(examples)) {
            if (this.vendors[normalizedType] === this.vendors[key]) {
                return config;
            }
        }

        throw new Error(`No example configuration available for vendor: ${vendorType}`);
    }

    /**
     * Normalize vendor configuration
     * @param {string} vendorType - Type of vendor
     * @param {object} config - Raw configuration
     * @returns {object} Normalized configuration
     */
    static normalizeConfig(vendorType, config) {
        const normalized = {
            ...config,
            vendorType: vendorType.toLowerCase().trim(),
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3
        };

        // Ensure credentials object exists
        if (!normalized.credentials) {
            normalized.credentials = {};
        }

        // Vendor-specific normalization
        if (vendorType.includes('cisco-fmc')) {
            normalized.domainUUID = normalized.domainUUID || 'e276abec-e0f2-11e3-8169-6d9ed49b625f';
        }

        if (vendorType.includes('palo-alto')) {
            normalized.deviceGroup = normalized.deviceGroup || 'shared';
            normalized.vsys = normalized.vsys || 'vsys1';
        }

        if (vendorType.includes('fortigate')) {
            normalized.vdom = normalized.vdom || 'root';
            normalized.deviceId = normalized.deviceId || 'root';
        }

        return normalized;
    }
}

module.exports = VendorFactory; 