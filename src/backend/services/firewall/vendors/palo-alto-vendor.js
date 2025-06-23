const BaseVendor = require('./base-vendor');

/**
 * Palo Alto Networks API Integration
 * Supports PAN-OS devices and Panorama management
 */
class PaloAltoVendor extends BaseVendor {
    constructor(config) {
        super({
            name: 'Palo Alto',
            ...config
        });
        this.apiKey = null;
        this.sessionId = null;
        this.deviceGroup = config.deviceGroup || 'shared';
        this.vsys = config.vsys || 'vsys1';
    }

    async authenticate() {
        try {
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'keygen',
                    user: this.credentials.username,
                    password: this.credentials.password
                }
            });

            // Parse XML response
            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            if (result.response.$.status === 'success') {
                this.apiKey = result.response.result[0].key[0];
                return { success: true, key: this.apiKey };
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
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'op',
                    cmd: '<show><system><info></info></system></show>',
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            return result.response.$.status === 'success';
        } catch (error) {
            console.error('Palo Alto connection test failed:', error.message);
            return false;
        }
    }

    async getDevices() {
        try {
            if (!this.apiKey) await this.authenticate();
            
            // For Panorama, get managed devices
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'op',
                    cmd: '<show><devices><all></all></devices></show>',
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            if (result.response.$.status === 'success') {
                const devices = result.response.result[0].devices?.[0]?.entry || [];
                return devices.map(device => this.normalizeDevice(device));
            }
            
            // For standalone device, return self
            return [{
                id: 'local',
                name: 'Palo Alto Firewall',
                model: 'PA Series',
                version: 'Unknown',
                status: 'online',
                vendor: 'Palo Alto'
            }];
        } catch (error) {
            this.handleApiError(error, 'getDevices');
        }
    }

    async getRules(deviceId = 'local', filters = {}) {
        try {
            if (!this.apiKey) await this.authenticate();

            const xpath = this.buildSecurityRuleXPath();
            const response = await this.makeRequest({
                method: 'GET',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'config',
                    action: 'get',
                    xpath: xpath,
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            if (result.response.$.status === 'success' && result.response.result[0].rules) {
                let rules = result.response.result[0].rules[0].entry || [];

                // Apply filters
                if (filters.enabled !== undefined) {
                    rules = rules.filter(rule => 
                        (rule.disabled?.[0] === 'yes') !== filters.enabled
                    );
                }
                if (filters.action) {
                    rules = rules.filter(rule => rule.action?.[0] === filters.action);
                }
                if (filters.name) {
                    rules = rules.filter(rule => 
                        rule.$.name.toLowerCase().includes(filters.name.toLowerCase())
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
            if (!this.apiKey) await this.authenticate();

            const ruleXml = this.convertToPaloAltoFormat(ruleData);
            const xpath = `${this.buildSecurityRuleXPath()}/entry[@name='${ruleData.name}']`;
            
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'config',
                    action: 'set',
                    xpath: xpath,
                    element: ruleXml,
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            if (result.response.$.status === 'success') {
                return this.normalizeRule(ruleData);
            }
            throw new Error('Rule creation failed');
        } catch (error) {
            this.handleApiError(error, 'createRule');
        }
    }

    async updateRule(deviceId, ruleId, ruleData) {
        try {
            if (!this.apiKey) await this.authenticate();

            const ruleXml = this.convertToPaloAltoFormat(ruleData);
            const xpath = `${this.buildSecurityRuleXPath()}/entry[@name='${ruleId}']`;
            
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'config',
                    action: 'edit',
                    xpath: xpath,
                    element: ruleXml,
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            if (result.response.$.status === 'success') {
                return this.normalizeRule({ ...ruleData, id: ruleId });
            }
            throw new Error('Rule update failed');
        } catch (error) {
            this.handleApiError(error, 'updateRule');
        }
    }

    async deleteRule(deviceId, ruleId) {
        try {
            if (!this.apiKey) await this.authenticate();

            const xpath = `${this.buildSecurityRuleXPath()}/entry[@name='${ruleId}']`;
            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'config',
                    action: 'delete',
                    xpath: xpath,
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            return result.response.$.status === 'success';
        } catch (error) {
            this.handleApiError(error, 'deleteRule');
        }
    }

    async getPortsAndServices() {
        try {
            if (!this.apiKey) await this.authenticate();

            const [servicesResponse, serviceGroupsResponse] = await Promise.all([
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/`,
                    params: {
                        type: 'config',
                        action: 'get',
                        xpath: '/config/shared/service',
                        key: this.apiKey
                    }
                }),
                this.makeRequest({
                    method: 'GET',
                    url: `${this.apiUrl}/api/`,
                    params: {
                        type: 'config',
                        action: 'get',
                        xpath: '/config/shared/service-group',
                        key: this.apiKey
                    }
                })
            ]);

            const parser = require('xml2js');
            const [servicesResult, serviceGroupsResult] = await Promise.all([
                parser.parseStringPromise(servicesResponse),
                parser.parseStringPromise(serviceGroupsResponse)
            ]);

            return {
                services: servicesResult.response?.result?.[0]?.service?.[0]?.entry || [],
                serviceGroups: serviceGroupsResult.response?.result?.[0]?.['service-group']?.[0]?.entry || [],
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
        if (!ruleData.action || !['allow', 'deny', 'drop', 'reset-client', 'reset-server', 'reset-both'].includes(ruleData.action)) {
            errors.push('Valid action is required');
        }

        // Palo Alto specific validations
        if (ruleData.name && ruleData.name.length > 31) {
            errors.push('Rule name must be 31 characters or less for Palo Alto');
        }
        if (ruleData.name && !/^[a-zA-Z0-9._-]+$/.test(ruleData.name)) {
            errors.push('Rule name can only contain alphanumeric characters, dots, underscores, and hyphens');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    async deployChanges(deviceId) {
        try {
            if (!this.apiKey) await this.authenticate();

            const response = await this.makeRequest({
                method: 'POST',
                url: `${this.apiUrl}/api/`,
                params: {
                    type: 'commit',
                    cmd: '<commit></commit>',
                    key: this.apiKey
                }
            });

            const parser = require('xml2js');
            const result = await parser.parseStringPromise(response);
            
            return {
                success: result.response.$.status === 'success',
                message: 'Configuration committed successfully',
                jobId: result.response.result?.[0]?.job?.[0],
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.handleApiError(error, 'deployChanges');
        }
    }

    // Helper methods
    buildSecurityRuleXPath() {
        if (this.deviceGroup && this.deviceGroup !== 'shared') {
            return `/config/devices/entry[@name='localhost.localdomain']/device-group/entry[@name='${this.deviceGroup}']/pre-rulebase/security/rules`;
        }
        return `/config/devices/entry[@name='localhost.localdomain']/vsys/entry[@name='${this.vsys}']/rulebase/security/rules`;
    }

    convertToPaloAltoFormat(ruleData) {
        const elements = [];
        
        if (ruleData.source && ruleData.source !== 'any') {
            elements.push(`<source><member>${ruleData.source}</member></source>`);
        } else {
            elements.push('<source><member>any</member></source>');
        }
        
        if (ruleData.destination && ruleData.destination !== 'any') {
            elements.push(`<destination><member>${ruleData.destination}</member></destination>`);
        } else {
            elements.push('<destination><member>any</member></destination>');
        }
        
        if (ruleData.service && ruleData.service !== 'any') {
            elements.push(`<service><member>${ruleData.service}</member></service>`);
        } else {
            elements.push('<service><member>any</member></service>');
        }
        
        elements.push(`<action>${ruleData.action || 'allow'}</action>`);
        elements.push('<from><member>any</member></from>');
        elements.push('<to><member>any</member></to>');
        elements.push('<source-user><member>any</member></source-user>');
        elements.push('<category><member>any</member></category>');
        elements.push('<application><member>any</member></application>');
        
        if (ruleData.description) {
            elements.push(`<description>${ruleData.description}</description>`);
        }
        
        if (ruleData.enabled === false) {
            elements.push('<disabled>yes</disabled>');
        }

        return elements.join('');
    }

    normalizeDevice(device) {
        return {
            id: device.$.name,
            name: device.$.name,
            model: device.model?.[0] || 'PA Series',
            version: device['sw-version']?.[0] || 'Unknown',
            status: device.connected?.[0] === 'yes' ? 'online' : 'offline',
            vendor: 'Palo Alto',
            capabilities: ['firewall_rules', 'nat_rules', 'vpn', 'url_filtering']
        };
    }

    getCommonPorts() {
        return [
            { name: 'web-browsing', port: '80', protocol: 'TCP' },
            { name: 'ssl', port: '443', protocol: 'TCP' },
            { name: 'ssh', port: '22', protocol: 'TCP' },
            { name: 'ftp', port: '21', protocol: 'TCP' },
            { name: 'telnet', port: '23', protocol: 'TCP' },
            { name: 'smtp', port: '25', protocol: 'TCP' },
            { name: 'dns', port: '53', protocol: 'UDP' },
            { name: 'snmp', port: '161', protocol: 'UDP' }
        ];
    }
}

module.exports = PaloAltoVendor; 