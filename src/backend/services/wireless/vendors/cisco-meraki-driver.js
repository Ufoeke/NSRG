/**
 * Cisco Meraki MR Access Point Driver
 * Implementation for Cisco Meraki cloud-managed access points using Dashboard API
 */

const BaseAccessPoint = require('./base-access-point');
const axios = require('axios');

class CiscoMerakiDriver extends BaseAccessPoint {
    constructor(config) {
        super(config);
        
        this.vendor = 'cisco-meraki';
        this.baseURL = 'https://api.meraki.com/api/v1';
        this.organizationId = config.organizationId;
        this.networkId = config.networkId;
        
        // Meraki-specific capabilities
        this.capabilities = {
            maxSSIDs: 15, // Meraki supports up to 15 SSIDs per network
            supportedBands: ['2.4GHz', '5GHz'],
            maxClients: 256,
            supportsVLAN: true,
            supportsWPA3: true,
            supportsRADIUS: true,
            supportsBandwidthLimits: true
        };
        
        // Configure axios instance for Meraki API
        this.apiClient = axios.create({
            baseURL: this.baseURL,
            timeout: this.config.timeout,
            headers: {
                'X-Cisco-Meraki-API-Key': this.config.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'NetworkPlatform-WirelessService/1.0'
            }
        });
        
        // Rate limiting for Meraki API (5 requests per second)
        this.rateLimiter = {
            requests: [],
            maxRequests: 5,
            timeWindow: 1000 // 1 second
        };
    }

    /**
     * Connect to Meraki Dashboard API
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            // Test connection by getting organization info
            const response = await this.makeRateLimitedRequest(
                () => this.apiClient.get(`/organizations/${this.organizationId}`)
            );
            
            this.connected = true;
            this.emit('connected', { vendor: this.vendor, organization: response.data.name });
            
            return true;
        } catch (error) {
            this.connected = false;
            this.lastError = error;
            this.emit('connectionError', { vendor: this.vendor, error: error.message });
            throw new Error(`Failed to connect to Meraki API: ${error.message}`);
        }
    }

    /**
     * Disconnect from Meraki API (no explicit disconnect needed)
     * @returns {Promise<boolean>}
     */
    async disconnect() {
        this.connected = false;
        this.emit('disconnected', { vendor: this.vendor });
        return true;
    }

    /**
     * Authenticate with Meraki API (handled via API key in headers)
     * @returns {Promise<boolean>}
     */
    async authenticate() {
        // Authentication is handled via API key in request headers
        // Test authentication by making a simple API call
        try {
            await this.makeRateLimitedRequest(
                () => this.apiClient.get(`/organizations/${this.organizationId}`)
            );
            return true;
        } catch (error) {
            throw new Error(`Meraki API authentication failed: ${error.message}`);
        }
    }

    /**
     * Get system information from Meraki network
     * @returns {Promise<Object>}
     */
    async getSystemInfo() {
        try {
            const [networkInfo, devices] = await Promise.all([
                this.makeRateLimitedRequest(
                    () => this.apiClient.get(`/networks/${this.networkId}`)
                ),
                this.makeRateLimitedRequest(
                    () => this.apiClient.get(`/networks/${this.networkId}/devices`)
                )
            ]);

            const accessPoints = devices.data.filter(device => 
                device.model && device.model.startsWith('MR')
            );

            return {
                vendor: this.vendor,
                networkName: networkInfo.data.name,
                networkId: this.networkId,
                timezone: networkInfo.data.timeZone,
                accessPointCount: accessPoints.length,
                accessPoints: accessPoints.map(ap => ({
                    serial: ap.serial,
                    model: ap.model,
                    name: ap.name,
                    status: ap.status,
                    lanIp: ap.lanIp,
                    mac: ap.mac,
                    firmware: ap.firmware
                }))
            };
        } catch (error) {
            throw new Error(`Failed to get Meraki system info: ${error.message}`);
        }
    }

    /**
     * Create SSID in Meraki network
     * @param {Object} ssidConfig - SSID configuration
     * @returns {Promise<Object>}
     */
    async createSSID(ssidConfig) {
        const validation = this.validateSSIDConfig(ssidConfig);
        if (!validation.valid) {
            throw new Error(`SSID validation failed: ${validation.errors.join(', ')}`);
        }

        try {
            // Find available SSID number (0-14)
            const existingSSIDs = await this.listSSIDs();
            const usedNumbers = existingSSIDs.map(ssid => ssid.number);
            const availableNumber = Array.from({length: 15}, (_, i) => i)
                .find(num => !usedNumbers.includes(num));

            if (availableNumber === undefined) {
                throw new Error('Maximum number of SSIDs (15) reached for this network');
            }

            const merakiSSIDConfig = this.convertToMerakiSSIDFormat(ssidConfig, availableNumber);
            
            const response = await this.makeRateLimitedRequest(
                () => this.apiClient.put(
                    `/networks/${this.networkId}/wireless/ssids/${availableNumber}`,
                    merakiSSIDConfig
                )
            );

            const createdSSID = this.convertFromMerakiSSIDFormat(response.data);
            
            this.emit('ssidCreated', { ssid: createdSSID });
            
            return createdSSID;
        } catch (error) {
            throw new Error(`Failed to create Meraki SSID: ${error.message}`);
        }
    }

    /**
     * Update existing SSID in Meraki network
     * @param {string} ssidId - SSID identifier (number for Meraki)
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSID(ssidId, updates) {
        try {
            const ssidNumber = parseInt(ssidId);
            const merakiUpdates = this.convertToMerakiSSIDFormat(updates, ssidNumber);
            
            const response = await this.makeRateLimitedRequest(
                () => this.apiClient.put(
                    `/networks/${this.networkId}/wireless/ssids/${ssidNumber}`,
                    merakiUpdates
                )
            );

            const updatedSSID = this.convertFromMerakiSSIDFormat(response.data);
            
            this.emit('ssidUpdated', { ssid: updatedSSID });
            
            return updatedSSID;
        } catch (error) {
            throw new Error(`Failed to update Meraki SSID: ${error.message}`);
        }
    }

    /**
     * Delete SSID from Meraki network (disable it)
     * @param {string} ssidId - SSID identifier
     * @returns {Promise<boolean>}
     */
    async deleteSSID(ssidId) {
        try {
            const ssidNumber = parseInt(ssidId);
            
            // Meraki doesn't actually delete SSIDs, just disables them
            await this.makeRateLimitedRequest(
                () => this.apiClient.put(
                    `/networks/${this.networkId}/wireless/ssids/${ssidNumber}`,
                    { enabled: false, name: `Disabled SSID ${ssidNumber}` }
                )
            );

            this.emit('ssidDeleted', { ssidId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to delete Meraki SSID: ${error.message}`);
        }
    }

    /**
     * List all SSIDs in Meraki network
     * @returns {Promise<Array>}
     */
    async listSSIDs() {
        try {
            const response = await this.makeRateLimitedRequest(
                () => this.apiClient.get(`/networks/${this.networkId}/wireless/ssids`)
            );

            return response.data
                .filter(ssid => ssid.enabled) // Only return enabled SSIDs
                .map(ssid => this.convertFromMerakiSSIDFormat(ssid));
        } catch (error) {
            throw new Error(`Failed to list Meraki SSIDs: ${error.message}`);
        }
    }

    /**
     * Apply security profile to SSID
     * @param {string} ssidId - SSID identifier
     * @param {Object} securityProfile - Security configuration
     * @returns {Promise<boolean>}
     */
    async applySecurityProfile(ssidId, securityProfile) {
        try {
            const ssidNumber = parseInt(ssidId);
            const merakiSecurityConfig = this.convertSecurityProfileToMeraki(securityProfile);
            
            await this.makeRateLimitedRequest(
                () => this.apiClient.put(
                    `/networks/${this.networkId}/wireless/ssids/${ssidNumber}`,
                    merakiSecurityConfig
                )
            );

            this.emit('securityProfileApplied', { ssidId, securityProfile: securityProfile.name });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to apply security profile to Meraki SSID: ${error.message}`);
        }
    }

    /**
     * Configure VLAN for SSID
     * @param {string} ssidId - SSID identifier
     * @param {number} vlanId - VLAN ID
     * @returns {Promise<boolean>}
     */
    async configureVLAN(ssidId, vlanId) {
        try {
            const ssidNumber = parseInt(ssidId);
            
            await this.makeRateLimitedRequest(
                () => this.apiClient.put(
                    `/networks/${this.networkId}/wireless/ssids/${ssidNumber}`,
                    {
                        useVlanTagging: true,
                        defaultVlanId: vlanId
                    }
                )
            );

            this.emit('vlanConfigured', { ssidId, vlanId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to configure VLAN for Meraki SSID: ${error.message}`);
        }
    }

    /**
     * Get connected wireless clients
     * @returns {Promise<Array>}
     */
    async getClients() {
        try {
            const response = await this.makeRateLimitedRequest(
                () => this.apiClient.get(`/networks/${this.networkId}/wireless/clients`)
            );

            return response.data.map(client => ({
                id: client.id,
                mac: client.mac,
                description: client.description,
                ip: client.ip,
                ip6: client.ip6,
                user: client.user,
                ssid: client.ssid,
                status: client.status,
                usage: client.usage,
                firstSeen: client.firstSeen,
                lastSeen: client.lastSeen,
                manufacturer: client.manufacturer,
                os: client.os,
                recentDeviceMac: client.recentDeviceMac
            }));
        } catch (error) {
            throw new Error(`Failed to get Meraki wireless clients: ${error.message}`);
        }
    }

    /**
     * Get wireless statistics
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        try {
            const [connectionStats, latencyStats] = await Promise.all([
                this.makeRateLimitedRequest(
                    () => this.apiClient.get(`/networks/${this.networkId}/wireless/connectionStats`)
                ),
                this.makeRateLimitedRequest(
                    () => this.apiClient.get(`/networks/${this.networkId}/wireless/latencyStats`)
                )
            ]);

            return {
                connectionStats: connectionStats.data,
                latencyStats: latencyStats.data
            };
        } catch (error) {
            throw new Error(`Failed to get Meraki statistics: ${error.message}`);
        }
    }

    /**
     * Reboot access points in the network
     * @returns {Promise<boolean>}
     */
    async reboot() {
        try {
            const devices = await this.makeRateLimitedRequest(
                () => this.apiClient.get(`/networks/${this.networkId}/devices`)
            );

            const accessPoints = devices.data.filter(device => 
                device.model && device.model.startsWith('MR')
            );

            // Reboot all access points
            const rebootPromises = accessPoints.map(ap =>
                this.makeRateLimitedRequest(
                    () => this.apiClient.post(`/devices/${ap.serial}/reboot`)
                )
            );

            await Promise.all(rebootPromises);
            
            this.emit('rebootInitiated', { count: accessPoints.length });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to reboot Meraki access points: ${error.message}`);
        }
    }

    // Helper methods for Meraki-specific operations

    /**
     * Make rate-limited request to respect Meraki API limits
     * @param {Function} requestFunction - Function that makes the request
     * @returns {Promise<any>}
     */
    async makeRateLimitedRequest(requestFunction) {
        // Remove requests older than the time window
        const now = Date.now();
        this.rateLimiter.requests = this.rateLimiter.requests.filter(
            timestamp => now - timestamp < this.rateLimiter.timeWindow
        );

        // Wait if we've hit the rate limit
        if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
            const oldestRequest = Math.min(...this.rateLimiter.requests);
            const waitTime = this.rateLimiter.timeWindow - (now - oldestRequest);
            
            if (waitTime > 0) {
                await this.delay(waitTime);
            }
        }

        // Record this request
        this.rateLimiter.requests.push(now);

        // Execute the request with retry logic
        return this.executeWithRetry(requestFunction);
    }

    /**
     * Convert common SSID format to Meraki-specific format
     * @param {Object} ssidConfig - Common SSID configuration
     * @param {number} ssidNumber - SSID number (0-14)
     * @returns {Object} Meraki-formatted configuration
     */
    convertToMerakiSSIDFormat(ssidConfig, ssidNumber) {
        const merakiConfig = {
            name: ssidConfig.name,
            enabled: ssidConfig.enabled !== false,
            number: ssidNumber
        };

        // Map VLAN configuration
        if (ssidConfig.vlanId) {
            merakiConfig.useVlanTagging = true;
            merakiConfig.defaultVlanId = ssidConfig.vlanId;
        }

        // Map security configuration (will be detailed in security profile conversion)
        if (ssidConfig.securityProfile) {
            Object.assign(merakiConfig, this.convertSecurityProfileToMeraki(ssidConfig.securityProfile));
        }

        // Map bandwidth configuration
        if (ssidConfig.bandwidthLimitUp) {
            merakiConfig.perClientBandwidthLimitUp = ssidConfig.bandwidthLimitUp;
        }
        if (ssidConfig.bandwidthLimitDown) {
            merakiConfig.perClientBandwidthLimitDown = ssidConfig.bandwidthLimitDown;
        }

        return merakiConfig;
    }

    /**
     * Convert Meraki SSID format to common format
     * @param {Object} merakiSSID - Meraki SSID object
     * @returns {Object} Common SSID format
     */
    convertFromMerakiSSIDFormat(merakiSSID) {
        return {
            id: merakiSSID.number.toString(),
            name: merakiSSID.name,
            enabled: merakiSSID.enabled,
            number: merakiSSID.number,
            vlanId: merakiSSID.defaultVlanId,
            authMode: merakiSSID.authMode,
            encryptionMode: merakiSSID.encryptionMode,
            bandwidthLimitUp: merakiSSID.perClientBandwidthLimitUp,
            bandwidthLimitDown: merakiSSID.perClientBandwidthLimitDown,
            vendor: this.vendor,
            vendorSpecific: {
                splashPage: merakiSSID.splashPage,
                radiusServers: merakiSSID.radiusServers,
                wpaEncryptionMode: merakiSSID.wpaEncryptionMode
            }
        };
    }

    /**
     * Convert common security profile to Meraki format
     * @param {Object} securityProfile - Common security profile
     * @returns {Object} Meraki security configuration
     */
    convertSecurityProfileToMeraki(securityProfile) {
        const merakiSecurity = {};

        switch (securityProfile.authType) {
            case 'open':
                merakiSecurity.authMode = 'open';
                break;
            case 'wpa2_psk':
                merakiSecurity.authMode = 'psk';
                merakiSecurity.encryptionMode = 'wpa';
                merakiSecurity.wpaEncryptionMode = 'WPA2 only';
                merakiSecurity.psk = securityProfile.passphrase;
                break;
            case 'wpa3_psk':
                merakiSecurity.authMode = 'psk';
                merakiSecurity.encryptionMode = 'wpa';
                merakiSecurity.wpaEncryptionMode = 'WPA3 only';
                merakiSecurity.psk = securityProfile.passphrase;
                break;
            case 'wpa2_enterprise':
                merakiSecurity.authMode = '8021x-radius';
                merakiSecurity.encryptionMode = 'wpa';
                merakiSecurity.wpaEncryptionMode = 'WPA2 only';
                if (securityProfile.radiusConfig) {
                    merakiSecurity.radiusServers = this.convertRadiusConfig(securityProfile.radiusConfig);
                }
                break;
            case 'wpa3_enterprise':
                merakiSecurity.authMode = '8021x-radius';
                merakiSecurity.encryptionMode = 'wpa';
                merakiSecurity.wpaEncryptionMode = 'WPA3 only';
                if (securityProfile.radiusConfig) {
                    merakiSecurity.radiusServers = this.convertRadiusConfig(securityProfile.radiusConfig);
                }
                break;
        }

        return merakiSecurity;
    }

    /**
     * Convert RADIUS configuration to Meraki format
     * @param {Object} radiusConfig - RADIUS configuration
     * @returns {Array} Meraki RADIUS servers array
     */
    convertRadiusConfig(radiusConfig) {
        const servers = [];

        if (radiusConfig.primaryServer) {
            servers.push({
                host: radiusConfig.primaryServer.host,
                port: radiusConfig.primaryServer.port || 1812,
                secret: radiusConfig.primaryServer.secret
            });
        }

        if (radiusConfig.secondaryServer) {
            servers.push({
                host: radiusConfig.secondaryServer.host,
                port: radiusConfig.secondaryServer.port || 1812,
                secret: radiusConfig.secondaryServer.secret
            });
        }

        return servers;
    }
}

module.exports = CiscoMerakiDriver;