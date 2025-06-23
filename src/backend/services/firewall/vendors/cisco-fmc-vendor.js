const BaseVendor = require('./base-vendor');

/**
 * Cisco Firepower Management Center (FMC) API Integration
 * Manages Cisco FTD devices through FMC
 */
class CiscoFMCVendor extends BaseVendor {
    constructor(config) {
        super({
            name: 'Cisco FMC',
            ...config
        });
        this.authToken = null;
        this.refreshToken = null;
        this.domainUUID = config.domainUUID || 'e276abec-e0f2-11e3-8169-6d9ed49b625f'; // Default global domain
    }

    async authenticate() {
        try {
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/fmc_platform/v1/auth/generatetoken`,
                auth: {
                    username: this.credentials.username,
                    password: this.credentials.password
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // FMC returns tokens in headers
            this.authToken = response.headers['x-auth-access-token'];
            this.refreshToken = response.headers['x-auth-refresh-token'];
            this.domainUUID = response.headers['domain_uuid'] || this.domainUUID;

            return {
                success: true,
                token: this.authToken,
                domain: this.domainUUID
            };
        } catch (error) {
            this.handleApiError(error, 'authenticate');
        }
    }

    async testConnection() {
        try {
            await this.authenticate();
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_platform/v1/info/serverversion`,
                headers: this.getAuthHeaders()
            });
            return response && response.items && response.items.length > 0;
        } catch (error) {
            console.error('Cisco FMC connection test failed:', error.message);
            return false;
        }
    }

    async getDevices() {
        try {
            if (!this.authToken) await this.authenticate();
            
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/devices/devicerecords`,
                headers: this.getAuthHeaders()
            });

            if (response.items) {
                return response.items.map(device => this.normalizeDevice(device));
            }
            return [];
        } catch (error) {
            this.handleApiError(error, 'getDevices');
        }
    }

    async getRules(deviceId, filters = {}) {
        try {
            if (!this.authToken) await this.authenticate();

            // Get access control policy for the device
            const deviceResponse = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/devices/devicerecords/${deviceId}`,
                headers: this.getAuthHeaders()
            });

            const policyId = deviceResponse.accessPolicy?.id;
            if (!policyId) {
                throw new Error('No access control policy found for device');
            }

            // Get rules from the access control policy
            let url = `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/policy/accesspolicies/${policyId}/accessrules`;
            
            const queryParams = new URLSearchParams();
            if (filters.limit) queryParams.append('limit', filters.limit);
            if (filters.offset) queryParams.append('offset', filters.offset);
            if (queryParams.toString()) url += '?' + queryParams.toString();

            const response = await this.makeRequest({
                method: 'GET',
                url,
                headers: this.getAuthHeaders()
            });

            if (response.items) {
                let rules = response.items;

                // Apply filters
                if (filters.enabled !== undefined) {
                    rules = rules.filter(rule => rule.enabled === filters.enabled);
                }
                if (filters.action) {
                    rules = rules.filter(rule => rule.action === filters.action.toUpperCase());
                }
                if (filters.name) {
                    rules = rules.filter(rule => 
                        rule.name.toLowerCase().includes(filters.name.toLowerCase())
                    );
                }

                return rules.map(rule => this.normalizeRule(rule));
            }
            return [];
        } catch (error) {
            this.handleApiError(error, 'getRules');
        }
    }

    async createRule(deviceId, ruleData) {
        try {
            if (!this.authToken) await this.authenticate();

            // Get device's access control policy
            const deviceResponse = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/devices/devicerecords/${deviceId}`,
                headers: this.getAuthHeaders()
            });

            const policyId = deviceResponse.accessPolicy?.id;
            if (!policyId) {
                throw new Error('No access control policy found for device');
            }

            const fmcRule = this.convertToFMCFormat(ruleData);
            
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/policy/accesspolicies/${policyId}/accessrules`,
                headers: this.getAuthHeaders(),
                data: fmcRule
            });

            return this.normalizeRule(response);
        } catch (error) {
            this.handleApiError(error, 'createRule');
        }
    }

    async updateRule(deviceId, ruleId, ruleData) {
        try {
            if (!this.authToken) await this.authenticate();

            // Get device's access control policy
            const deviceResponse = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/devices/devicerecords/${deviceId}`,
                headers: this.getAuthHeaders()
            });

            const policyId = deviceResponse.accessPolicy?.id;
            if (!policyId) {
                throw new Error('No access control policy found for device');
            }

            const fmcRule = this.convertToFMCFormat(ruleData);
            fmcRule.id = ruleId;
            
            const response = await this.makeRequest({
                method: 'PUT',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/policy/accesspolicies/${policyId}/accessrules/${ruleId}`,
                headers: this.getAuthHeaders(),
                data: fmcRule
            });

            return this.normalizeRule(response);
        } catch (error) {
            this.handleApiError(error, 'updateRule');
        }
    }

    async deleteRule(deviceId, ruleId) {
        try {
            if (!this.authToken) await this.authenticate();

            // Get device's access control policy
            const deviceResponse = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/devices/devicerecords/${deviceId}`,
                headers: this.getAuthHeaders()
            });

            const policyId = deviceResponse.accessPolicy?.id;
            if (!policyId) {
                throw new Error('No access control policy found for device');
            }

            await this.makeRequest({
                method: 'DELETE',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/policy/accesspolicies/${policyId}/accessrules/${ruleId}`,
                headers: this.getAuthHeaders()
            });

            return true;
        } catch (error) {
            this.handleApiError(error, 'deleteRule');
        }
    }

    async getPortsAndServices() {
        try {
            if (!this.authToken) await this.authenticate();

            const [portsResponse, networkGroupsResponse] = await Promise.all([
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/object/ports`,
                    headers: this.getAuthHeaders()
                }),
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/object/networkgroups`,
                    headers: this.getAuthHeaders()
                })
            ]);

            return {
                ports: portsResponse.items || [],
                services: portsResponse.items || [],
                networkGroups: networkGroupsResponse.items || [],
                commonPorts: this.getCommonPorts()
            };
        } catch (error) {
            this.handleApiError(error, 'getPortsAndServices');
        }
    }

    async validateRule(ruleData) {
        const errors = [];
        const warnings = [];

        // Required fields validation
        if (!ruleData.name || ruleData.name.trim() === '') {
            errors.push('Rule name is required');
        }
        if (!ruleData.action || !['ALLOW', 'BLOCK', 'MONITOR'].includes(ruleData.action.toUpperCase())) {
            errors.push('Valid action (ALLOW, BLOCK, MONITOR) is required');
        }

        // FMC specific validations
        if (ruleData.name && ruleData.name.length > 50) {
            warnings.push('Rule name should be less than 50 characters for FMC');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    async deployChanges(deviceId) {
        try {
            if (!this.authToken) await this.authenticate();

            const deploymentData = {
                type: 'DeploymentRequest',
                version: '1.0',
                deviceList: [deviceId],
                deploymentNote: 'Auto-deployment from NSRG Platform',
                forceDeploy: false
            };

            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/fmc_config/v1/domain/${this.domainUUID}/deployment/deploymentrequests`,
                headers: this.getAuthHeaders(),
                data: deploymentData
            });

            return {
                success: !!response.id,
                deploymentId: response.id,
                message: 'Deployment initiated successfully',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.handleApiError(error, 'deployChanges');
        }
    }

    // Helper methods
    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-auth-access-token': this.authToken
        };
    }

    convertToFMCFormat(ruleData) {
        return {
            name: ruleData.name,
            enabled: ruleData.enabled !== false,
            action: ruleData.action?.toUpperCase() || 'ALLOW',
            sourceZones: ruleData.sourceZones ? { 
                objects: ruleData.sourceZones.map(zone => ({ id: zone.id, name: zone.name }))
            } : undefined,
            destinationZones: ruleData.destinationZones ? {
                objects: ruleData.destinationZones.map(zone => ({ id: zone.id, name: zone.name }))
            } : undefined,
            sourceNetworks: ruleData.source && ruleData.source !== 'any' ? {
                objects: [{ id: ruleData.source.id, name: ruleData.source.name }]
            } : undefined,
            destinationNetworks: ruleData.destination && ruleData.destination !== 'any' ? {
                objects: [{ id: ruleData.destination.id, name: ruleData.destination.name }]
            } : undefined,
            destinationPorts: ruleData.service && ruleData.service !== 'any' ? {
                objects: [{ id: ruleData.service.id, name: ruleData.service.name }]
            } : undefined,
            logBegin: ruleData.logging || false,
            logEnd: ruleData.logging || false,
            sendEventsToFMC: ruleData.logging || false,
            commentHistoryList: ruleData.description ? [{
                comment: ruleData.description,
                date: new Date().toISOString()
            }] : undefined
        };
    }

    normalizeDevice(device) {
        return {
            id: device.id,
            name: device.name,
            model: device.model,
            version: device.sw_version,
            status: device.healthStatus,
            vendor: 'Cisco FMC',
            capabilities: ['firewall_rules', 'intrusion_policy', 'vpn'],
            metadata: {
                type: device.type,
                accessPolicy: device.accessPolicy
            }
        };
    }

    getCommonPorts() {
        return [
            { name: 'HTTP', port: '80', protocol: 'TCP' },
            { name: 'HTTPS', port: '443', protocol: 'TCP' },
            { name: 'SSH', port: '22', protocol: 'TCP' },
            { name: 'FTP', port: '21', protocol: 'TCP' },
            { name: 'Telnet', port: '23', protocol: 'TCP' },
            { name: 'SMTP', port: '25', protocol: 'TCP' },
            { name: 'DNS', port: '53', protocol: 'UDP' },
            { name: 'SNMP', port: '161', protocol: 'UDP' }
        ];
    }
}

module.exports = CiscoFMCVendor; 