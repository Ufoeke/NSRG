/**
 * Cisco Catalyst WiFi Access Point Driver
 * Implementation for Cisco Catalyst WiFi access points using DNA Center or direct SSH/NETCONF
 */

const BaseAccessPoint = require('./base-access-point');
const axios = require('axios');
const https = require('https');

class CiscoCatalystDriver extends BaseAccessPoint {
    constructor(config) {
        super(config);
        
        this.vendor = 'cisco-catalyst';
        this.dnaCenterHost = config.dnaCenterHost || config.host;
        this.dnaCenterPort = config.dnaCenterPort || 443;
        this.managementMethod = config.managementMethod || 'dna-center'; // 'dna-center' or 'direct'
        
        // Cisco Catalyst WiFi-specific capabilities
        this.capabilities = {
            maxSSIDs: 16, // Catalyst 9800 supports up to 16 SSIDs per radio
            supportedBands: ['2.4GHz', '5GHz', '6GHz'], // WiFi 6E support
            maxClients: 512, // High-density deployments
            supportsVLAN: true,
            supportsWPA3: true,
            supportsRADIUS: true,
            supportsBandwidthLimits: true,
            supportsQoS: true,
            supportsRRM: true, // Radio Resource Management
            supportsFastRoaming: true
        };
        
        // Configure axios instance for DNA Center API
        this.apiClient = axios.create({
            baseURL: `https://${this.dnaCenterHost}:${this.dnaCenterPort}/dna`,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Allow self-signed certificates (common in enterprise environments)
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        
        this.authToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Connect to DNA Center or direct device management
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            if (this.managementMethod === 'dna-center') {
                await this.authenticateWithDNACenter();
                
                // Verify DNA Center connectivity
                const response = await this.apiClient.get('/system/api/v1/auth/user-info', {
                    headers: { 'X-Auth-Token': this.authToken }
                });
                
                this.connected = true;
                this.emit('connected', { 
                    vendor: this.vendor, 
                    method: 'dna-center',
                    host: this.dnaCenterHost,
                    user: response.data.userId 
                });
            } else {
                // Direct device management would require SSH/NETCONF implementation
                throw new Error('Direct device management not yet implemented');
            }
            
            return true;
        } catch (error) {
            this.connected = false;
            this.lastError = error;
            this.emit('connectionError', { vendor: this.vendor, error: error.message });
            throw new Error(`Failed to connect to Cisco Catalyst: ${error.message}`);
        }
    }    /**
     * Disconnect from DNA Center
     * @returns {Promise<boolean>}
     */
    async disconnect() {
        try {
            if (this.authToken && this.managementMethod === 'dna-center') {
                // DNA Center doesn't have explicit logout, token will expire
                this.authToken = null;
                this.tokenExpiry = null;
            }
            
            this.connected = false;
            this.emit('disconnected', { vendor: this.vendor });
            return true;
        } catch (error) {
            throw new Error(`Failed to disconnect from Cisco Catalyst: ${error.message}`);
        }
    }

    /**
     * Authenticate with DNA Center
     * @returns {Promise<boolean>}
     */
    async authenticate() {
        return await this.authenticateWithDNACenter();
    }

    /**
     * Authenticate with DNA Center using username/password
     * @returns {Promise<boolean>}
     */
    async authenticateWithDNACenter() {
        try {
            const authPayload = {
                username: this.config.username,
                password: this.config.password
            };

            const response = await this.apiClient.post('/system/api/v1/auth/token', authPayload);
            
            this.authToken = response.data.Token;
            this.tokenExpiry = Date.now() + (3600 * 1000); // DNA Center tokens typically expire in 1 hour
            
            return true;
        } catch (error) {
            throw new Error(`DNA Center authentication failed: ${error.message}`);
        }
    }    /**
     * Get system information from DNA Center
     * @returns {Promise<Object>}
     */
    async getSystemInfo() {
        try {
            await this.ensureAuthenticated();
            
            const [networkDevices, wirelessSettings, sites] = await Promise.all([
                this.apiClient.get('/intent/api/v1/network-device', {
                    headers: { 'X-Auth-Token': this.authToken }
                }),
                this.apiClient.get('/intent/api/v1/wireless/dynamic-interface', {
                    headers: { 'X-Auth-Token': this.authToken }
                }),
                this.apiClient.get('/intent/api/v1/site', {
                    headers: { 'X-Auth-Token': this.authToken }
                })
            ]);

            const accessPoints = networkDevices.data.response.filter(device => 
                device.family && (device.family.includes('Wireless') || device.type === 'Cisco Catalyst 9800 Series Wireless LAN Controller')
            );

            return {
                vendor: this.vendor,
                managementMethod: this.managementMethod,
                dnaCenterHost: this.dnaCenterHost,
                accessPointCount: accessPoints.length,
                accessPoints: accessPoints.map(ap => ({
                    id: ap.id,
                    hostname: ap.hostname,
                    model: ap.platformId,
                    series: ap.series,
                    softwareVersion: ap.softwareVersion,
                    managementIp: ap.managementIpAddress,
                    macAddress: ap.macAddress,
                    location: ap.location,
                    reachabilityStatus: ap.reachabilityStatus,
                    role: ap.role
                })),
                sitesCount: sites.data.response.length,
                interfaceCount: wirelessSettings.data.length
            };
        } catch (error) {
            throw new Error(`Failed to get Cisco Catalyst system info: ${error.message}`);
        }
    }    /**
     * Create a new SSID (Wireless LAN) in DNA Center
     * @param {Object} ssidConfig - SSID configuration object
     * @returns {Promise<Object>}
     */
    async createSSID(ssidConfig) {
        try {
            await this.ensureAuthenticated();
            
            const validation = this.validateSSIDConfig(ssidConfig);
            if (!validation.valid) {
                throw new Error(`Invalid SSID configuration: ${validation.errors.join(', ')}`);
            }

            const catalystSSIDConfig = this.convertToCatalystSSIDFormat(ssidConfig);
            
            const response = await this.apiClient.post(
                '/intent/api/v1/enterprise-ssid',
                catalystSSIDConfig,
                { headers: { 'X-Auth-Token': this.authToken } }
            );

            // Wait for task completion
            const taskResult = await this.waitForTask(response.data.response.taskId);
            
            if (taskResult.isError) {
                throw new Error(`SSID creation failed: ${taskResult.failureReason}`);
            }

            const createdSSID = await this.getSSIDById(taskResult.data);
            
            this.emit('ssidCreated', { ssid: createdSSID });
            
            return createdSSID;
        } catch (error) {
            throw new Error(`Failed to create Cisco Catalyst SSID: ${error.message}`);
        }
    }

    /**
     * Update existing SSID in DNA Center
     * @param {string} ssidId - SSID identifier
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSID(ssidId, updates) {
        try {
            await this.ensureAuthenticated();
            
            const catalystUpdates = this.convertToCatalystSSIDFormat(updates);
            
            const response = await this.apiClient.put(
                `/intent/api/v1/enterprise-ssid/${ssidId}`,
                catalystUpdates,
                { headers: { 'X-Auth-Token': this.authToken } }
            );

            const taskResult = await this.waitForTask(response.data.response.taskId);
            
            if (taskResult.isError) {
                throw new Error(`SSID update failed: ${taskResult.failureReason}`);
            }

            const updatedSSID = await this.getSSIDById(ssidId);
            
            this.emit('ssidUpdated', { ssid: updatedSSID });
            
            return updatedSSID;
        } catch (error) {
            throw new Error(`Failed to update Cisco Catalyst SSID: ${error.message}`);
        }
    }    /**
     * Delete SSID from DNA Center
     * @param {string} ssidId - SSID identifier
     * @returns {Promise<boolean>}
     */
    async deleteSSID(ssidId) {
        try {
            await this.ensureAuthenticated();
            
            const response = await this.apiClient.delete(
                `/intent/api/v1/enterprise-ssid/${ssidId}`,
                { headers: { 'X-Auth-Token': this.authToken } }
            );

            const taskResult = await this.waitForTask(response.data.response.taskId);
            
            if (taskResult.isError) {
                throw new Error(`SSID deletion failed: ${taskResult.failureReason}`);
            }

            this.emit('ssidDeleted', { ssidId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to delete Cisco Catalyst SSID: ${error.message}`);
        }
    }

    /**
     * List all SSIDs configured in DNA Center
     * @returns {Promise<Array>}
     */
    async listSSIDs() {
        try {
            await this.ensureAuthenticated();
            
            const response = await this.apiClient.get('/intent/api/v1/enterprise-ssid', {
                headers: { 'X-Auth-Token': this.authToken }
            });

            return response.data.response.map(ssid => this.convertFromCatalystSSIDFormat(ssid));
        } catch (error) {
            throw new Error(`Failed to list Cisco Catalyst SSIDs: ${error.message}`);
        }
    }    /**
     * Apply security profile to SSID
     * @param {string} ssidId - SSID identifier
     * @param {Object} securityProfile - Security configuration
     * @returns {Promise<boolean>}
     */
    async applySecurityProfile(ssidId, securityProfile) {
        try {
            await this.ensureAuthenticated();
            
            const catalystSecurityConfig = this.convertSecurityProfileToCatalyst(securityProfile);
            
            const response = await this.apiClient.put(
                `/intent/api/v1/enterprise-ssid/${ssidId}`,
                catalystSecurityConfig,
                { headers: { 'X-Auth-Token': this.authToken } }
            );

            const taskResult = await this.waitForTask(response.data.response.taskId);
            
            if (taskResult.isError) {
                throw new Error(`Security profile application failed: ${taskResult.failureReason}`);
            }

            this.emit('securityProfileApplied', { ssidId, securityProfile: securityProfile.name });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to apply security profile to Cisco Catalyst SSID: ${error.message}`);
        }
    }

    /**
     * Configure VLAN mapping for SSID
     * @param {string} ssidId - SSID identifier
     * @param {number} vlanId - VLAN ID
     * @returns {Promise<boolean>}
     */
    async configureVLAN(ssidId, vlanId) {
        try {
            await this.ensureAuthenticated();
            
            const vlanConfig = {
                flexConnect: {
                    enableFlexConnect: true,
                    localToVlan: vlanId
                }
            };
            
            const response = await this.apiClient.put(
                `/intent/api/v1/enterprise-ssid/${ssidId}`,
                vlanConfig,
                { headers: { 'X-Auth-Token': this.authToken } }
            );

            const taskResult = await this.waitForTask(response.data.response.taskId);
            
            if (taskResult.isError) {
                throw new Error(`VLAN configuration failed: ${taskResult.failureReason}`);
            }

            this.emit('vlanConfigured', { ssidId, vlanId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to configure VLAN for Cisco Catalyst SSID: ${error.message}`);
        }
    }    /**
     * Get connected wireless clients
     * @returns {Promise<Array>}
     */
    async getClients() {
        try {
            await this.ensureAuthenticated();
            
            const response = await this.apiClient.get('/intent/api/v1/client-health', {
                headers: { 'X-Auth-Token': this.authToken }
            });

            return response.data.response.map(client => ({
                id: client.id,
                mac: client.macAddress,
                ip: client.ipAddress,
                hostname: client.hostName,
                ssid: client.ssid,
                location: client.location,
                apMac: client.apMacAddress,
                apName: client.apName,
                status: client.clientType,
                rssi: client.rssi,
                snr: client.snr,
                channel: client.channel,
                frequency: client.frequency,
                protocol: client.protocol,
                healthScore: client.overallScore,
                connectedTime: client.connectedTime,
                trafficUsage: client.trafficUsage
            }));
        } catch (error) {
            throw new Error(`Failed to get Cisco Catalyst wireless clients: ${error.message}`);
        }
    }    /**
     * Get wireless statistics
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        try {
            await this.ensureAuthenticated();
            
            const [networkHealth, clientHealth, deviceHealth] = await Promise.all([
                this.apiClient.get('/intent/api/v1/network-health', {
                    headers: { 'X-Auth-Token': this.authToken }
                }),
                this.apiClient.get('/intent/api/v1/client-health', {
                    headers: { 'X-Auth-Token': this.authToken }
                }),
                this.apiClient.get('/intent/api/v1/device-detail', {
                    headers: { 'X-Auth-Token': this.authToken }
                })
            ]);

            return {
                networkHealth: networkHealth.data.response,
                clientHealth: clientHealth.data.response,
                deviceHealth: deviceHealth.data.response,
                totalClients: clientHealth.data.response.length,
                healthyClients: clientHealth.data.response.filter(c => c.overallScore > 7).length,
                issueCount: networkHealth.data.response.filter(n => n.healthScore < 7).length
            };
        } catch (error) {
            throw new Error(`Failed to get Cisco Catalyst statistics: ${error.message}`);
        }
    }    /**
     * Reboot access points (through DNA Center task)
     * @returns {Promise<boolean>}
     */
    async reboot() {
        try {
            await this.ensureAuthenticated();
            
            // Get all wireless access points
            const devicesResponse = await this.apiClient.get('/intent/api/v1/network-device', {
                headers: { 'X-Auth-Token': this.authToken }
            });

            const accessPoints = devicesResponse.data.response.filter(device => 
                device.family && device.family.includes('Wireless')
            );

            const rebootTasks = [];
            
            for (const ap of accessPoints) {
                const rebootResponse = await this.apiClient.post(
                    '/intent/api/v1/device-reboot',
                    { deviceUuid: ap.id },
                    { headers: { 'X-Auth-Token': this.authToken } }
                );
                
                rebootTasks.push(rebootResponse.data.response.taskId);
            }

            // Wait for all reboot tasks to complete
            const taskResults = await Promise.all(
                rebootTasks.map(taskId => this.waitForTask(taskId))
            );

            const failedReboots = taskResults.filter(result => result.isError);
            
            if (failedReboots.length > 0) {
                throw new Error(`${failedReboots.length} access points failed to reboot`);
            }

            this.emit('rebootInitiated', { count: accessPoints.length });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to reboot Cisco Catalyst access points: ${error.message}`);
        }
    }    // Helper methods for Cisco Catalyst-specific operations

    /**
     * Ensure authentication token is valid
     * @returns {Promise<void>}
     */
    async ensureAuthenticated() {
        if (!this.authToken || Date.now() >= this.tokenExpiry) {
            await this.authenticateWithDNACenter();
        }
    }

    /**
     * Wait for DNA Center task completion
     * @param {string} taskId - Task ID to monitor
     * @returns {Promise<Object>} Task result
     */
    async waitForTask(taskId, timeoutMs = 60000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await this.apiClient.get(`/intent/api/v1/task/${taskId}`, {
                    headers: { 'X-Auth-Token': this.authToken }
                });

                const task = response.data.response;
                
                if (task.isError) {
                    return task;
                }
                
                if (task.endTime) {
                    return task;
                }
                
                // Wait 2 seconds before checking again
                await this.delay(2000);
            } catch (error) {
                throw new Error(`Failed to monitor task ${taskId}: ${error.message}`);
            }
        }
        
        throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
    }    /**
     * Get SSID by ID from DNA Center
     * @param {string} ssidId - SSID identifier
     * @returns {Promise<Object>}
     */
    async getSSIDById(ssidId) {
        try {
            const response = await this.apiClient.get(`/intent/api/v1/enterprise-ssid/${ssidId}`, {
                headers: { 'X-Auth-Token': this.authToken }
            });

            return this.convertFromCatalystSSIDFormat(response.data.response);
        } catch (error) {
            throw new Error(`Failed to get SSID ${ssidId}: ${error.message}`);
        }
    }

    /**
     * Convert common SSID format to Cisco Catalyst format
     * @param {Object} ssidConfig - Common SSID configuration
     * @returns {Object} Catalyst-formatted configuration
     */
    convertToCatalystSSIDFormat(ssidConfig) {
        const catalystConfig = {
            name: ssidConfig.name,
            ssidName: ssidConfig.name,
            enableFabric: false,
            enableFlexConnect: true,
            enableMacFiltering: false
        };

        // Map security configuration
        if (ssidConfig.securityProfile) {
            Object.assign(catalystConfig, this.convertSecurityProfileToCatalyst(ssidConfig.securityProfile));
        }

        // Map VLAN configuration for FlexConnect
        if (ssidConfig.vlanId) {
            catalystConfig.flexConnect = {
                enableFlexConnect: true,
                localToVlan: ssidConfig.vlanId
            };
        }

        return catalystConfig;
    }    /**
     * Convert Cisco Catalyst SSID format to common format
     * @param {Object} catalystSSID - Catalyst SSID object
     * @returns {Object} Common SSID format
     */
    convertFromCatalystSSIDFormat(catalystSSID) {
        return {
            id: catalystSSID.instanceUuid,
            name: catalystSSID.ssidName,
            enabled: catalystSSID.status === 'enabled',
            securityType: catalystSSID.securityLevel,
            authMode: catalystSSID.authenticationMode,
            vlanId: catalystSSID.flexConnect ? catalystSSID.flexConnect.localToVlan : null,
            vendor: this.vendor,
            vendorSpecific: {
                enableFabric: catalystSSID.enableFabric,
                enableFlexConnect: catalystSSID.enableFlexConnect,
                enableMacFiltering: catalystSSID.enableMacFiltering,
                radioPolicy: catalystSSID.radioPolicy,
                trafficShaping: catalystSSID.trafficShaping
            }
        };
    }

    /**
     * Convert common security profile to Cisco Catalyst format
     * @param {Object} securityProfile - Common security profile
     * @returns {Object} Catalyst security configuration
     */
    convertSecurityProfileToCatalyst(securityProfile) {
        const catalystSecurity = {};

        switch (securityProfile.authType) {
            case 'open':
                catalystSecurity.securityLevel = 'WPA2_OPEN';
                catalystSecurity.authenticationMode = 'open';
                break;
            case 'wpa2_psk':
                catalystSecurity.securityLevel = 'WPA2_PERSONAL';
                catalystSecurity.authenticationMode = 'WPA2_PSK';
                catalystSecurity.passphrase = securityProfile.passphrase;
                break;
            case 'wpa3_psk':
                catalystSecurity.securityLevel = 'WPA3_PERSONAL';
                catalystSecurity.authenticationMode = 'WPA3_PSK';
                catalystSecurity.passphrase = securityProfile.passphrase;
                break;
            case 'wpa2_enterprise':
                catalystSecurity.securityLevel = 'WPA2_ENTERPRISE';
                catalystSecurity.authenticationMode = 'WPA2_802.1X';
                if (securityProfile.radiusConfig) {
                    catalystSecurity.aaaOverride = false;
                    catalystSecurity.rsnCheck = true;
                }
                break;
            case 'wpa3_enterprise':
                catalystSecurity.securityLevel = 'WPA3_ENTERPRISE';
                catalystSecurity.authenticationMode = 'WPA3_802.1X';
                if (securityProfile.radiusConfig) {
                    catalystSecurity.aaaOverride = false;
                    catalystSecurity.rsnCheck = true;
                }
                break;
        }

        return catalystSecurity;
    }
}

module.exports = CiscoCatalystDriver;