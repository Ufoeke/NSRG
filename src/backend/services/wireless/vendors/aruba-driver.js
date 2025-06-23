/**
 * Aruba Access Point Driver
 * Implementation for Aruba access points using Aruba Central or on-premise controller
 */

const BaseAccessPoint = require('./base-access-point');
const axios = require('axios');
const https = require('https');

class ArubaDriver extends BaseAccessPoint {
    constructor(config) {
        super(config);
        
        this.vendor = 'aruba';
        this.managementMethod = config.managementMethod || 'central'; // 'central' or 'on-premise'
        this.centralRegion = config.centralRegion || 'us-west'; // for Aruba Central
        this.controllerHost = config.controllerHost || config.host;
        this.controllerPort = config.controllerPort || 4343;
        
        // Aruba-specific capabilities
        this.capabilities = {
            maxSSIDs: 32, // Aruba supports up to 32 SSIDs per AP
            supportedBands: ['2.4GHz', '5GHz', '6GHz'], // WiFi 6E support on newer models
            maxClients: 256,
            supportsVLAN: true,
            supportsWPA3: true,
            supportsRADIUS: true,
            supportsBandwidthLimits: true,
            supportsClientIsolation: true,
            supportsAirMatch: true, // Aruba's RF optimization
            supportsClientMatch: true // Aruba's client steering
        };
        
        // Base URL setup based on management method
        const baseURL = this.managementMethod === 'central' 
            ? `https://app-${this.centralRegion}.central.arubanetworks.com`
            : `https://${this.controllerHost}:${this.controllerPort}`;
        
        // Configure axios instance for Aruba API
        this.apiClient = axios.create({
            baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Allow self-signed certificates (common in on-premise environments)
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        
        this.accessToken = null;
        this.tokenExpiry = null;
        this.refreshToken = null;
    }    /**
     * Connect to Aruba system (Central or on-premise controller)
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            await this.authenticate();
            await this.getSystemInfo();
            
            this.connected = true;
            this.emit('connected', { vendor: this.vendor, method: this.managementMethod });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to connect to Aruba system: ${error.message}`);
        }
    }

    /**
     * Disconnect from Aruba system
     * @returns {Promise<boolean>}
     */
    async disconnect() {
        try {
            if (this.accessToken && this.managementMethod === 'central') {
                // Revoke token for Central
                await this.apiClient.post('/oauth2/revoke', {
                    token: this.accessToken
                });
            }
            
            this.accessToken = null;
            this.tokenExpiry = null;
            this.refreshToken = null;
            this.connected = false;
            
            this.emit('disconnected', { vendor: this.vendor });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to disconnect from Aruba system: ${error.message}`);
        }
    }    /**
     * Authenticate with Aruba system
     * @returns {Promise<boolean>}
     */
    async authenticate() {
        if (this.managementMethod === 'central') {
            return await this.authenticateWithCentral();
        } else {
            return await this.authenticateWithController();
        }
    }

    /**
     * Authenticate with Aruba Central (OAuth2)
     * @returns {Promise<boolean>}
     */
    async authenticateWithCentral() {
        try {
            const response = await this.apiClient.post('/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                scope: 'all'
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            this.refreshToken = response.data.refresh_token;

            // Update default headers
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

            return true;
        } catch (error) {
            throw new Error(`Aruba Central authentication failed: ${error.message}`);
        }
    }    /**
     * Authenticate with on-premise Aruba controller
     * @returns {Promise<boolean>}
     */
    async authenticateWithController() {
        try {
            // Initial login to get UIDARUBA cookie
            const loginResponse = await this.apiClient.post('/v1/api/login', {
                username: this.config.username,
                password: this.config.password
            });

            // Extract the UIDARUBA cookie from response
            const cookies = loginResponse.headers['set-cookie'];
            const uidarubaCookie = cookies?.find(cookie => cookie.startsWith('UIDARUBA='));
            
            if (!uidarubaCookie) {
                throw new Error('Failed to obtain UIDARUBA cookie');
            }

            // Update default headers with cookie
            this.apiClient.defaults.headers.common['Cookie'] = uidarubaCookie;

            return true;
        } catch (error) {
            throw new Error(`Aruba controller authentication failed: ${error.message}`);
        }
    }

    /**
     * Get system information from Aruba system
     * @returns {Promise<Object>}
     */
    async getSystemInfo() {
        try {
            let systemInfo;
            
            if (this.managementMethod === 'central') {
                systemInfo = await this.getSystemInfoFromCentral();
            } else {
                systemInfo = await this.getSystemInfoFromController();
            }

            this.systemInfo = systemInfo;
            return systemInfo;
        } catch (error) {
            throw new Error(`Failed to get Aruba system info: ${error.message}`);
        }
    }    /**
     * Get system information from Aruba Central
     * @returns {Promise<Object>}
     */
    async getSystemInfoFromCentral() {
        const [groups, devices, networkInfo] = await Promise.all([
            this.apiClient.get('/configuration/v1/groups'),
            this.apiClient.get('/monitoring/v1/devices'),
            this.apiClient.get('/platform/v1/customer_info')
        ]);

        return {
            platform: 'Aruba Central',
            region: this.centralRegion,
            groups: groups.data.data.length,
            devices: devices.data.devices.length,
            accessPoints: devices.data.devices.filter(d => d.device_type === 'ap').length,
            customer: networkInfo.data.customer_name,
            version: 'Cloud',
            capabilities: this.capabilities
        };
    }

    /**
     * Get system information from on-premise controller
     * @returns {Promise<Object>}
     */
    async getSystemInfoFromController() {
        const [systemInfo, accessPoints] = await Promise.all([
            this.apiClient.get('/v1/configuration/object/system_info'),
            this.apiClient.get('/v1/configuration/object/ap_name')
        ]);

        return {
            platform: 'Aruba Controller',
            host: this.controllerHost,
            version: systemInfo.data.version,
            model: systemInfo.data.model,
            accessPoints: accessPoints.data.length,
            capabilities: this.capabilities
        };
    }    /**
     * Create a new SSID in Aruba system
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

            let createdSSID;
            
            if (this.managementMethod === 'central') {
                createdSSID = await this.createSSIDInCentral(ssidConfig);
            } else {
                createdSSID = await this.createSSIDInController(ssidConfig);
            }
            
            this.emit('ssidCreated', { ssid: createdSSID });
            
            return createdSSID;
        } catch (error) {
            throw new Error(`Failed to create Aruba SSID: ${error.message}`);
        }
    }

    /**
     * Create SSID in Aruba Central
     * @param {Object} ssidConfig - SSID configuration
     * @returns {Promise<Object>}
     */
    async createSSIDInCentral(ssidConfig) {
        const arubaSSIDConfig = this.convertToArubaSSIDFormat(ssidConfig);
        
        const response = await this.apiClient.post(
            '/configuration/v2/wlan',
            arubaSSIDConfig
        );

        return this.convertFromArubaSSIDFormat(response.data);
    }    /**
     * Create SSID in on-premise controller
     * @param {Object} ssidConfig - SSID configuration
     * @returns {Promise<Object>}
     */
    async createSSIDInController(ssidConfig) {
        const arubaSSIDConfig = this.convertToArubaSSIDFormat(ssidConfig);
        
        // Create VAP (Virtual Access Point) profile
        const vapProfile = {
            profile: {
                name: ssidConfig.name,
                ssid: ssidConfig.name,
                ...arubaSSIDConfig
            }
        };

        const response = await this.apiClient.post(
            '/v1/configuration/object/virtual_ap',
            vapProfile
        );

        // Commit the configuration
        await this.apiClient.post('/v1/configuration/object/write_memory');

        return this.convertFromArubaSSIDFormat(response.data);
    }

    /**
     * Update existing SSID in Aruba system
     * @param {string} ssidId - SSID identifier
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSID(ssidId, updates) {
        try {
            await this.ensureAuthenticated();
            
            let updatedSSID;
            
            if (this.managementMethod === 'central') {
                updatedSSID = await this.updateSSIDInCentral(ssidId, updates);
            } else {
                updatedSSID = await this.updateSSIDInController(ssidId, updates);
            }
            
            this.emit('ssidUpdated', { ssid: updatedSSID });
            
            return updatedSSID;
        } catch (error) {
            throw new Error(`Failed to update Aruba SSID: ${error.message}`);
        }
    }    /**
     * Update SSID in Aruba Central
     * @param {string} ssidId - SSID identifier
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSIDInCentral(ssidId, updates) {
        const arubaUpdates = this.convertToArubaSSIDFormat(updates);
        
        const response = await this.apiClient.patch(
            `/configuration/v2/wlan/${ssidId}`,
            arubaUpdates
        );

        return this.convertFromArubaSSIDFormat(response.data);
    }

    /**
     * Update SSID in on-premise controller
     * @param {string} ssidId - SSID identifier
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSIDInController(ssidId, updates) {
        const arubaUpdates = this.convertToArubaSSIDFormat(updates);
        
        const response = await this.apiClient.put(
            `/v1/configuration/object/virtual_ap/${ssidId}`,
            { profile: arubaUpdates }
        );

        // Commit the configuration
        await this.apiClient.post('/v1/configuration/object/write_memory');

        return this.convertFromArubaSSIDFormat(response.data);
    }    /**
     * Delete SSID from Aruba system
     * @param {string} ssidId - SSID identifier
     * @returns {Promise<boolean>}
     */
    async deleteSSID(ssidId) {
        try {
            await this.ensureAuthenticated();
            
            if (this.managementMethod === 'central') {
                await this.apiClient.delete(`/configuration/v2/wlan/${ssidId}`);
            } else {
                await this.apiClient.delete(`/v1/configuration/object/virtual_ap/${ssidId}`);
                await this.apiClient.post('/v1/configuration/object/write_memory');
            }
            
            this.emit('ssidDeleted', { ssidId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to delete Aruba SSID: ${error.message}`);
        }
    }

    /**
     * List all SSIDs configured in Aruba system
     * @returns {Promise<Array>}
     */
    async listSSIDs() {
        try {
            await this.ensureAuthenticated();
            
            let response;
            
            if (this.managementMethod === 'central') {
                response = await this.apiClient.get('/configuration/v2/wlan');
            } else {
                response = await this.apiClient.get('/v1/configuration/object/virtual_ap');
            }

            return response.data.data.map(ssid => this.convertFromArubaSSIDFormat(ssid));
        } catch (error) {
            throw new Error(`Failed to list Aruba SSIDs: ${error.message}`);
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
            
            const arubaSecurityConfig = this.convertSecurityProfileToAruba(securityProfile);
            
            if (this.managementMethod === 'central') {
                await this.apiClient.patch(`/configuration/v2/wlan/${ssidId}`, arubaSecurityConfig);
            } else {
                await this.apiClient.put(`/v1/configuration/object/virtual_ap/${ssidId}`, {
                    profile: arubaSecurityConfig
                });
                await this.apiClient.post('/v1/configuration/object/write_memory');
            }
            
            this.emit('securityProfileApplied', { ssidId, securityProfile: securityProfile.name });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to apply security profile to Aruba SSID: ${error.message}`);
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
                vlan: vlanId,
                forward_mode: 'tunnel' // or 'bridge' for local switching
            };
            
            if (this.managementMethod === 'central') {
                await this.apiClient.patch(`/configuration/v2/wlan/${ssidId}`, vlanConfig);
            } else {
                await this.apiClient.put(`/v1/configuration/object/virtual_ap/${ssidId}`, {
                    profile: vlanConfig
                });
                await this.apiClient.post('/v1/configuration/object/write_memory');
            }
            
            this.emit('vlanConfigured', { ssidId, vlanId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to configure VLAN for Aruba SSID: ${error.message}`);
        }
    }    /**
     * Get connected wireless clients
     * @returns {Promise<Array>}
     */
    async getClients() {
        try {
            await this.ensureAuthenticated();
            
            let response;
            
            if (this.managementMethod === 'central') {
                response = await this.apiClient.get('/monitoring/v1/clients');
            } else {
                response = await this.apiClient.get('/v1/configuration/object/user_table');
            }

            return response.data.clients.map(client => ({
                id: client.macaddr || client.mac,
                mac: client.macaddr || client.mac,
                ip: client.ip,
                hostname: client.name || client.hostname,
                ssid: client.network || client.essid,
                location: client.site || client.location,
                apMac: client.associated_device_mac,
                apName: client.associated_device,
                status: client.connection_status || 'connected',
                rssi: client.signal_strength || client.rssi,
                snr: client.snr,
                channel: client.channel,
                frequency: client.radio_band,
                protocol: client.phy_type,
                usage: client.usage,
                connectedTime: client.connection_time,
                health: client.health_score
            }));
        } catch (error) {
            throw new Error(`Failed to get Aruba wireless clients: ${error.message}`);
        }
    }    /**
     * Get wireless statistics
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        try {
            await this.ensureAuthenticated();
            
            let stats;
            
            if (this.managementMethod === 'central') {
                const [networkStats, clientStats, deviceStats] = await Promise.all([
                    this.apiClient.get('/monitoring/v1/networks/bandwidth_usage'),
                    this.apiClient.get('/monitoring/v1/clients'),
                    this.apiClient.get('/monitoring/v1/aps')
                ]);

                stats = {
                    networkUtilization: networkStats.data,
                    clientCount: clientStats.data.clients.length,
                    accessPointCount: deviceStats.data.aps.length,
                    onlineAPCount: deviceStats.data.aps.filter(ap => ap.status === 'Up').length,
                    totalBandwidth: networkStats.data.total_bandwidth,
                    averageClientHealth: this.calculateAverageHealth(clientStats.data.clients)
                };
            } else {
                const [apStats, clientStats] = await Promise.all([
                    this.apiClient.get('/v1/configuration/object/ap_active'),
                    this.apiClient.get('/v1/configuration/object/user_table')
                ]);

                stats = {
                    clientCount: clientStats.data.length,
                    accessPointCount: apStats.data.length,
                    onlineAPCount: apStats.data.filter(ap => ap.status === 'up').length,
                    averageClientHealth: this.calculateAverageHealth(clientStats.data)
                };
            }

            return stats;
        } catch (error) {
            throw new Error(`Failed to get Aruba statistics: ${error.message}`);
        }
    }    /**
     * Reboot access points
     * @returns {Promise<boolean>}
     */
    async reboot() {
        try {
            await this.ensureAuthenticated();
            
            if (this.managementMethod === 'central') {
                // Get all access points first
                const apsResponse = await this.apiClient.get('/monitoring/v1/aps');
                const accessPoints = apsResponse.data.aps;

                // Reboot each access point
                const rebootPromises = accessPoints.map(ap => 
                    this.apiClient.post(`/device_management/v1/device/${ap.serial}/action/reboot`)
                );

                await Promise.all(rebootPromises);
                
                this.emit('rebootInitiated', { count: accessPoints.length });
            } else {
                // For on-premise controller, reboot all APs in the system
                await this.apiClient.post('/v1/configuration/object/ap_reboot_all');
                
                this.emit('rebootInitiated', { message: 'All access points rebooting' });
            }
            
            return true;
        } catch (error) {
            throw new Error(`Failed to reboot Aruba access points: ${error.message}`);
        }
    }

    // Helper methods for Aruba-specific operations

    /**
     * Ensure authentication token is valid
     * @returns {Promise<void>}
     */
    async ensureAuthenticated() {
        if (this.managementMethod === 'central') {
            if (!this.accessToken || Date.now() >= this.tokenExpiry) {
                await this.authenticateWithCentral();
            }
        }
        // On-premise controller uses session cookies, no token refresh needed
    }    /**
     * Calculate average health score from client array
     * @param {Array} clients - Array of client objects
     * @returns {number} Average health score
     */
    calculateAverageHealth(clients) {
        if (!clients || clients.length === 0) return 0;
        
        const totalHealth = clients.reduce((sum, client) => {
            return sum + (client.health_score || client.signal_strength || 0);
        }, 0);
        
        return Math.round(totalHealth / clients.length);
    }

    /**
     * Convert common SSID format to Aruba format
     * @param {Object} ssidConfig - Common SSID configuration
     * @returns {Object} Aruba-formatted configuration
     */
    convertToArubaSSIDFormat(ssidConfig) {
        const arubaConfig = {
            essid: ssidConfig.name,
            opmode: 'ap',
            max_authentication_failures: 3,
            authentication_server_failover: true
        };

        // Map security configuration
        if (ssidConfig.securityProfile) {
            Object.assign(arubaConfig, this.convertSecurityProfileToAruba(ssidConfig.securityProfile));
        }

        // Map VLAN configuration
        if (ssidConfig.vlanId) {
            arubaConfig.vlan = ssidConfig.vlanId;
            arubaConfig.forward_mode = 'tunnel';
        }

        // Map bandwidth limits
        if (ssidConfig.bandwidthLimits) {
            arubaConfig.bandwidth_contract = {
                upstream: ssidConfig.bandwidthLimits.upstream,
                downstream: ssidConfig.bandwidthLimits.downstream
            };
        }

        return arubaConfig;
    }    /**
     * Convert Aruba SSID format to common format
     * @param {Object} arubaSSID - Aruba SSID object
     * @returns {Object} Common SSID format
     */
    convertFromArubaSSIDFormat(arubaSSID) {
        return {
            id: arubaSSID.profile_name || arubaSSID.essid,
            name: arubaSSID.essid,
            enabled: arubaSSID.disable !== true,
            securityType: this.mapArubaSecurityType(arubaSSID),
            vlanId: arubaSSID.vlan || null,
            vendor: this.vendor,
            vendorSpecific: {
                opmode: arubaSSID.opmode,
                forward_mode: arubaSSID.forward_mode,
                max_authentication_failures: arubaSSID.max_authentication_failures,
                bandwidth_contract: arubaSSID.bandwidth_contract,
                airMatch: arubaSSID.rf_optimization,
                clientMatch: arubaSSID.client_match
            }
        };
    }

    /**
     * Convert common security profile to Aruba format
     * @param {Object} securityProfile - Common security profile
     * @returns {Object} Aruba security configuration
     */
    convertSecurityProfileToAruba(securityProfile) {
        const arubaSecurity = {};

        switch (securityProfile.authType) {
            case 'open':
                arubaSecurity.wpa_passphrase_type = 'ascii';
                arubaSecurity.wpa_hexkey = '';
                break;
            case 'wpa2_psk':
                arubaSecurity.wpa_passphrase_type = 'ascii';
                arubaSecurity.wpa_passphrase = securityProfile.passphrase;
                arubaSecurity.wpa_hexkey = '';
                arubaSecurity.wpa2 = true;
                break;
            case 'wpa3_psk':
                arubaSecurity.wpa_passphrase_type = 'ascii';
                arubaSecurity.wpa_passphrase = securityProfile.passphrase;
                arubaSecurity.wpa3 = true;
                arubaSecurity.pmf = 'required';
                break;
            case 'wpa2_enterprise':
                arubaSecurity.wpa2 = true;
                arubaSecurity.wpa_key_mgmt = 'wpa2-802.1x';
                if (securityProfile.radiusConfig) {
                    arubaSecurity.dot1x_default_role = 'authenticated';
                    arubaSecurity.dot1x_server_group = 'default';
                }
                break;
            case 'wpa3_enterprise':
                arubaSecurity.wpa3 = true;
                arubaSecurity.wpa_key_mgmt = 'wpa3-802.1x';
                arubaSecurity.pmf = 'required';
                if (securityProfile.radiusConfig) {
                    arubaSecurity.dot1x_default_role = 'authenticated';
                    arubaSecurity.dot1x_server_group = 'default';
                }
                break;
        }

        return arubaSecurity;
    }    /**
     * Map Aruba security type to common format
     * @param {Object} arubaSSID - Aruba SSID configuration
     * @returns {string} Security type
     */
    mapArubaSecurityType(arubaSSID) {
        if (arubaSSID.wpa3 && arubaSSID.wpa_key_mgmt === 'wpa3-802.1x') {
            return 'wpa3_enterprise';
        } else if (arubaSSID.wpa3 && arubaSSID.wpa_passphrase) {
            return 'wpa3_psk';
        } else if (arubaSSID.wpa2 && arubaSSID.wpa_key_mgmt === 'wpa2-802.1x') {
            return 'wpa2_enterprise';
        } else if (arubaSSID.wpa2 && arubaSSID.wpa_passphrase) {
            return 'wpa2_psk';
        } else {
            return 'open';
        }
    }
}

module.exports = ArubaDriver;