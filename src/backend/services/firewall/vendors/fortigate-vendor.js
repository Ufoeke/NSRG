const BaseVendor = require('./base-vendor');

/**
 * FortiGate/FortiManager API Integration
 * Supports FortiGate devices managed through FortiManager or direct API
 */
class FortiGateVendor extends BaseVendor {
    constructor(config) {
        super({
            name: 'FortiGate',
            ...config
        });
        this.authToken = null;
        this.deviceId = config.deviceId || 'root';
        this.vdom = config.vdom || 'root';
    }

    async authenticate() {
        try {
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/logincheck`,
                data: new URLSearchParams({
                    username: this.credentials.username,
                    secretkey: this.credentials.password
                }),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // FortiGate returns session cookies for authentication
            if (response.status === 'success') {
                this.authToken = response.session || true;
                return { success: true, session: this.authToken };
            }
            throw new Error('Authentication failed');
        } catch (error) {
            this.handleApiError(error, 'authenticate');
        }
    }

    async testConnection() {
        try {
            await this.authenticate();
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/v2/monitor/system/status`,
                headers: this.getAuthHeaders()
            });
            return response && response.status === 'success';
        } catch (error) {
            console.error('FortiGate connection test failed:', error.message);
            return false;
        }
    }

    async getDevices() {
        try {
            if (!this.authToken) await this.authenticate();
            
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/v2/monitor/system/ha-peer`,
                headers: this.getAuthHeaders()
            });

            // For standalone FortiGate, return single device
            const devices = [{
                id: this.deviceId,
                name: 'FortiGate',
                model: response.results?.model || 'FortiGate',
                version: response.results?.version || 'Unknown',
                status: 'online',
                vendor: 'FortiGate'
            }];

            return devices.map(device => this.normalizeDevice(device));
        } catch (error) {
            this.handleApiError(error, 'getDevices');
        }
    }

    async getRules(deviceId = this.deviceId, filters = {}) {
        try {
            if (!this.authToken) await this.authenticate();

            let url = `${this.apiUrl}/api/v2/cmdb/firewall/policy`;
            if (this.vdom !== 'root') {
                url += `?vdom=${this.vdom}`;
            }

            const response = await this.makeRequest({
                method: 'GET',
                url,
                headers: this.getAuthHeaders()
            });

            if (response.status === 'success' && response.results) {
                let rules = response.results;

                // Apply filters
                if (filters.enabled !== undefined) {
                    rules = rules.filter(rule => rule.status === (filters.enabled ? 'enable' : 'disable'));
                }
                if (filters.action) {
                    rules = rules.filter(rule => rule.action === filters.action);
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

            const fortiRule = this.convertToFortiFormat(ruleData);
            
            let url = `${this.apiUrl}/api/v2/cmdb/firewall/policy`;
            if (this.vdom !== 'root') {
                url += `?vdom=${this.vdom}`;
            }

            const response = await this.makeRequest({
                method: 'POST',
                url,
                headers: this.getAuthHeaders(),
                data: fortiRule
            });

            if (response.status === 'success') {
                return this.normalizeRule({ ...fortiRule, ...response.results });
            }
            throw new Error('Rule creation failed');
        } catch (error) {
            this.handleApiError(error, 'createRule');
        }
    }

    async updateRule(deviceId, ruleId, ruleData) {
        try {
            if (!this.authToken) await this.authenticate();

            const fortiRule = this.convertToFortiFormat(ruleData);
            
            let url = `${this.apiUrl}/api/v2/cmdb/firewall/policy/${ruleId}`;
            if (this.vdom !== 'root') {
                url += `?vdom=${this.vdom}`;
            }

            const response = await this.makeRequest({
                method: 'PUT',
                url,
                headers: this.getAuthHeaders(),
                data: fortiRule
            });

            if (response.status === 'success') {
                return this.normalizeRule({ ...fortiRule, id: ruleId });
            }
            throw new Error('Rule update failed');
        } catch (error) {
            this.handleApiError(error, 'updateRule');
        }
    }

    async deleteRule(deviceId, ruleId) {
        try {
            if (!this.authToken) await this.authenticate();

            let url = `${this.apiUrl}/api/v2/cmdb/firewall/policy/${ruleId}`;
            if (this.vdom !== 'root') {
                url += `?vdom=${this.vdom}`;
            }

            const response = await this.makeRequest({
                method: 'DELETE',
                url,
                headers: this.getAuthHeaders()
            });

            return response.status === 'success';
        } catch (error) {
            this.handleApiError(error, 'deleteRule');
        }
    }

    async getPortsAndServices() {
        try {
            if (!this.authToken) await this.authenticate();

            const [servicesResponse, addressesResponse] = await Promise.all([
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/v2/cmdb/firewall.service/custom`,
                    headers: this.getAuthHeaders()
                }),
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/v2/cmdb/firewall/address`,
                    headers: this.getAuthHeaders()
                })
            ]);

            return {
                services: servicesResponse.results || [],
                addresses: addressesResponse.results || [],
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
        if (!ruleData.action || !['allow', 'deny'].includes(ruleData.action)) {
            errors.push('Valid action (allow/deny) is required');
        }

        // FortiGate specific validations
        if (ruleData.name && ruleData.name.length > 35) {
            warnings.push('Rule name should be less than 35 characters for FortiGate');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    async deployChanges(deviceId) {
        // FortiGate applies changes immediately, no explicit deployment needed
        return {
            success: true,
            message: 'FortiGate applies changes immediately',
            timestamp: new Date().toISOString()
        };
    }

    // Helper methods
    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-CSRFTOKEN': this.authToken || ''
        };
    }

    convertToFortiFormat(ruleData) {
        return {
            name: ruleData.name,
            status: ruleData.enabled !== false ? 'enable' : 'disable',
            action: ruleData.action === 'deny' ? 'deny' : 'accept',
            srcintf: [{ name: ruleData.sourceInterface || 'any' }],
            dstintf: [{ name: ruleData.destinationInterface || 'any' }],
            srcaddr: [{ name: ruleData.source || 'all' }],
            dstaddr: [{ name: ruleData.destination || 'all' }],
            service: [{ name: ruleData.service || 'ALL' }],
            comments: ruleData.description || '',
            logtraffic: ruleData.logging ? 'all' : 'disable'
        };
    }

    normalizeDevice(device) {
        return {
            id: device.id,
            name: device.name,
            model: device.model,
            version: device.version,
            status: device.status,
            vendor: 'FortiGate',
            capabilities: ['firewall_rules', 'nat_rules', 'vpn']
        };
    }

    getCommonPorts() {
        return [
            { name: 'HTTP', port: '80', protocol: 'TCP' },
            { name: 'HTTPS', port: '443', protocol: 'TCP' },
            { name: 'SSH', port: '22', protocol: 'TCP' },
            { name: 'FTP', port: '21', protocol: 'TCP' },
            { name: 'SMTP', port: '25', protocol: 'TCP' },
            { name: 'DNS', port: '53', protocol: 'UDP' },
            { name: 'DHCP', port: '67-68', protocol: 'UDP' }
        ];
    }
}

module.exports = FortiGateVendor; 