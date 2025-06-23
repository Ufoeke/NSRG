/**
 * FortiAP Access Point Driver
 * Implementation for Fortinet FortiAP wireless access points managed via FortiGate
 */

const BaseAccessPoint = require('./base-access-point');
const axios = require('axios');
const https = require('https');

class FortiAPDriver extends BaseAccessPoint {
    constructor(config) {
        super(config);
        
        this.vendor = 'fortiap';
        this.fortigateHost = config.fortigateHost || config.host;
        this.fortigatePort = config.fortigatePort || 443;
        this.vdom = config.vdom || 'root'; // Virtual domain
        
        // FortiAP-specific capabilities
        this.capabilities = {
            maxSSIDs: 8, // FortiAP typically supports 8 SSIDs per radio
            supportedBands: ['2.4GHz', '5GHz'],
            maxClients: 128,
            supportsVLAN: true,
            supportsWPA3: true,
            supportsRADIUS: true,
            supportsBandwidthLimits: true,
            supportsClientIsolation: true
        };
        
        // Configure axios instance for FortiGate API
        this.apiClient = axios.create({
            baseURL: `https://${this.fortigateHost}:${this.fortigatePort}/api/v2`,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json'
            },
            // Allow self-signed certificates (common in enterprise environments)
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
        
        this.accessToken = null;
        this.sessionId = null;
    }

    /**
     * Connect to FortiGate management interface
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            // Test connection by attempting to login
            await this.authenticate();
            
            // Verify we can access wireless controller features
            const response = await this.apiClient.get(
                `/cmdb/wireless-controller/wtp-profile?vdom=${this.vdom}`,
                { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
            );
            
            this.connected = true;
            this.emit('connected', { vendor: this.vendor, host: this.fortigateHost });
            
            return true;
        } catch (error) {
            this.connected = false;
            this.lastError = error;
            this.emit('connectionError', { vendor: this.vendor, error: error.message });
            throw new Error(`Failed to connect to FortiGate: ${error.message}`);
        }
    }

    /**
     * Disconnect from FortiGate
     * @returns {Promise<boolean>}
     */
    async disconnect() {
        try {
            if (this.accessToken) {
                // Logout to invalidate the session
                await this.apiClient.post(
                    `/cmdb/system/api-user/${this.config.username}/logout?vdom=${this.vdom}`,
                    {},
                    { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
                );
            }
            
            this.connected = false;
            this.accessToken = null;
            this.sessionId = null;
            this.emit('disconnected', { vendor: this.vendor });
            
            return true;
        } catch (error) {
            // Even if logout fails, mark as disconnected
            this.connected = false;
            this.accessToken = null;
            return true;
        }
    }

    /**
     * Authenticate with FortiGate using API key or username/password
     * @returns {Promise<boolean>}
     */
    async authenticate() {
        try {
            if (this.config.apiKey) {
                // Use API key authentication
                this.accessToken = this.config.apiKey;
                this.apiClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
            } else {
                // Use username/password authentication
                const loginResponse = await this.apiClient.post(
                    `/cmdb/system/api-user/${this.config.username}/login?vdom=${this.vdom}`,
                    {
                        username: this.config.username,
                        secretkey: this.config.password
                    }
                );
                
                this.accessToken = loginResponse.data.access_token;
                this.sessionId = loginResponse.data.session_id;
                this.apiClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
            }
            
            return true;
        } catch (error) {
            throw new Error(`FortiGate authentication failed: ${error.message}`);
        }
    }

    /**
     * Get system information from FortiGate wireless controller
     * @returns {Promise<Object>}
     */
    async getSystemInfo() {
        try {
            const [systemInfo, wtpStatus, profiles] = await Promise.all([
                this.apiClient.get(`/cmdb/system/global?vdom=${this.vdom}`),
                this.apiClient.get(`/cmdb/wireless-controller/wtp-status?vdom=${this.vdom}`),
                this.apiClient.get(`/cmdb/wireless-controller/wtp-profile?vdom=${this.vdom}`)
            ]);

            const accessPoints = wtpStatus.data.results.map(wtp => ({
                name: wtp.name,
                serial: wtp.serial,
                model: wtp.model,
                status: wtp.admin_status,
                ipAddress: wtp.ip,
                location: wtp.location,
                firmware: wtp.firmware_version
            }));

            return {
                vendor: this.vendor,
                hostname: systemInfo.data.results.hostname,
                version: systemInfo.data.results.version,
                vdom: this.vdom,
                accessPointCount: accessPoints.length,
                accessPoints,
                profileCount: profiles.data.results.length
            };
        } catch (error) {
            throw new Error(`Failed to get FortiAP system info: ${error.message}`);
        }
    }

    /**
     * Create SSID in FortiAP profile
     * @param {Object} ssidConfig - SSID configuration
     * @returns {Promise<Object>}
     */
    async createSSID(ssidConfig) {
        const validation = this.validateSSIDConfig(ssidConfig);
        if (!validation.valid) {
            throw new Error(`SSID validation failed: ${validation.errors.join(', ')}`);
        }

        try {
            // Create SSID profile in wireless controller
            const fortiapSSIDConfig = this.convertToFortiAPSSIDFormat(ssidConfig);
            
            const response = await this.apiClient.post(
                `/cmdb/wireless-controller/vap?vdom=${this.vdom}`,
                fortiapSSIDConfig
            );

            // Apply the SSID to the WTP profile (access point profile)
            await this.applySSIDToWTPProfile(ssidConfig.name, ssidConfig.wtpProfile || 'default');

            const createdSSID = this.convertFromFortiAPSSIDFormat(response.data.results);
            
            this.emit('ssidCreated', { ssid: createdSSID });
            
            return createdSSID;
        } catch (error) {
            throw new Error(`Failed to create FortiAP SSID: ${error.message}`);
        }
    }

    /**
     * Update existing SSID in FortiAP
     * @param {string} ssidId - SSID identifier (name)
     * @param {Object} updates - Configuration updates
     * @returns {Promise<Object>}
     */
    async updateSSID(ssidId, updates) {
        try {
            const fortiapUpdates = this.convertToFortiAPSSIDFormat(updates);
            
            const response = await this.apiClient.put(
                `/cmdb/wireless-controller/vap/${ssidId}?vdom=${this.vdom}`,
                fortiapUpdates
            );

            const updatedSSID = this.convertFromFortiAPSSIDFormat(response.data.results);
            
            this.emit('ssidUpdated', { ssid: updatedSSID });
            
            return updatedSSID;
        } catch (error) {
            throw new Error(`Failed to update FortiAP SSID: ${error.message}`);
        }
    }

    /**
     * Delete SSID from FortiAP
     * @param {string} ssidId - SSID identifier (name)
     * @returns {Promise<boolean>}
     */
    async deleteSSID(ssidId) {
        try {
            // Remove from WTP profiles first
            await this.removeSSIDFromWTPProfiles(ssidId);
            
            // Delete the VAP (Virtual Access Point) configuration
            await this.apiClient.delete(
                `/cmdb/wireless-controller/vap/${ssidId}?vdom=${this.vdom}`
            );

            this.emit('ssidDeleted', { ssidId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to delete FortiAP SSID: ${error.message}`);
        }
    }

    /**
     * List all SSIDs in FortiAP
     * @returns {Promise<Array>}
     */
    async listSSIDs() {
        try {
            const response = await this.apiClient.get(
                `/cmdb/wireless-controller/vap?vdom=${this.vdom}`
            );

            return response.data.results.map(vap => this.convertFromFortiAPSSIDFormat(vap));
        } catch (error) {
            throw new Error(`Failed to list FortiAP SSIDs: ${error.message}`);
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
            const fortiapSecurityConfig = this.convertSecurityProfileToFortiAP(securityProfile);
            
            await this.apiClient.put(
                `/cmdb/wireless-controller/vap/${ssidId}?vdom=${this.vdom}`,
                fortiapSecurityConfig
            );

            this.emit('securityProfileApplied', { ssidId, securityProfile: securityProfile.name });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to apply security profile to FortiAP SSID: ${error.message}`);
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
            await this.apiClient.put(
                `/cmdb/wireless-controller/vap/${ssidId}?vdom=${this.vdom}`,
                {
                    vlan_auto: 'disable',
                    vlan_id: vlanId
                }
            );

            this.emit('vlanConfigured', { ssidId, vlanId });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to configure VLAN for FortiAP SSID: ${error.message}`);
        }
    }

    /**
     * Get connected wireless clients
     * @returns {Promise<Array>}
     */
    async getClients() {
        try {
            const response = await this.apiClient.get(
                `/cmdb/wireless-controller/client-info?vdom=${this.vdom}`
            );

            return response.data.results.map(client => ({
                id: client.id,
                mac: client.mac,
                ip: client.ip,
                ssid: client.ssid,
                ap: client.ap,
                status: client.status,
                signal: client.signal,
                noise: client.noise,
                snr: client.snr,
                uptime: client.uptime,
                rxBytes: client.rx_bytes,
                txBytes: client.tx_bytes,
                manufacturer: client.manufacturer
            }));
        } catch (error) {
            throw new Error(`Failed to get FortiAP wireless clients: ${error.message}`);
        }
    }

    /**
     * Get wireless statistics
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        try {
            const [apStats, clientStats, radioStats] = await Promise.all([
                this.apiClient.get(`/cmdb/wireless-controller/wtp-status?vdom=${this.vdom}`),
                this.apiClient.get(`/cmdb/wireless-controller/client-info?vdom=${this.vdom}`),
                this.apiClient.get(`/cmdb/wireless-controller/radio-info?vdom=${this.vdom}`)
            ]);

            return {
                accessPointStats: apStats.data.results,
                clientStats: clientStats.data.results,
                radioStats: radioStats.data.results,
                totalClients: clientStats.data.results.length,
                onlineAPs: apStats.data.results.filter(ap => ap.admin_status === 'enable').length
            };
        } catch (error) {
            throw new Error(`Failed to get FortiAP statistics: ${error.message}`);
        }
    }

    /**
     * Reboot FortiAP access points
     * @returns {Promise<boolean>}
     */
    async reboot() {
        try {
            // Get list of all access points
            const wtpResponse = await this.apiClient.get(
                `/cmdb/wireless-controller/wtp-status?vdom=${this.vdom}`
            );

            const rebootPromises = wtpResponse.data.results.map(wtp =>
                this.apiClient.post(
                    `/cmdb/wireless-controller/wtp/${wtp.name}/reboot?vdom=${this.vdom}`
                )
            );

            await Promise.all(rebootPromises);
            
            this.emit('rebootInitiated', { count: wtpResponse.data.results.length });
            
            return true;
        } catch (error) {
            throw new Error(`Failed to reboot FortiAP access points: ${error.message}`);
        }
    }

    // Helper methods for FortiAP-specific operations

    /**
     * Convert common SSID format to FortiAP VAP format
     * @param {Object} ssidConfig - Common SSID configuration
     * @returns {Object} FortiAP VAP configuration
     */
    convertToFortiAPSSIDFormat(ssidConfig) {
        const vapConfig = {
            name: ssidConfig.name,
            ssid: ssidConfig.name,
            broadcast_ssid: ssidConfig.enabled !== false ? 'enable' : 'disable'
        };

        // Map VLAN configuration
        if (ssidConfig.vlanId) {
            vapConfig.vlan_auto = 'disable';
            vapConfig.vlan_id = ssidConfig.vlanId;
        }

        // Map security configuration
        if (ssidConfig.securityProfile) {
            Object.assign(vapConfig, this.convertSecurityProfileToFortiAP(ssidConfig.securityProfile));
        }

        // Map bandwidth configuration
        if (ssidConfig.bandwidthLimitUp || ssidConfig.bandwidthLimitDown) {
            vapConfig.max_clients = ssidConfig.maxClients || 64;
            if (ssidConfig.bandwidthLimitUp) {
                vapConfig.max_clients_ap = ssidConfig.bandwidthLimitUp;
            }
        }

        return vapConfig;
    }

    /**
     * Convert FortiAP VAP format to common format
     * @param {Object} vapConfig - FortiAP VAP configuration
     * @returns {Object} Common SSID format
     */
    convertFromFortiAPSSIDFormat(vapConfig) {
        return {
            id: vapConfig.name,
            name: vapConfig.ssid,
            enabled: vapConfig.broadcast_ssid === 'enable',
            vlanId: vapConfig.vlan_id,
            security: vapConfig.security,
            maxClients: vapConfig.max_clients,
            vendor: this.vendor,
            vendorSpecific: {
                vapName: vapConfig.name,
                vlanAuto: vapConfig.vlan_auto,
                schedules: vapConfig.schedule,
                utmProfile: vapConfig.utm_profile
            }
        };
    }

    /**
     * Convert common security profile to FortiAP format
     * @param {Object} securityProfile - Common security profile
     * @returns {Object} FortiAP security configuration
     */
    convertSecurityProfileToFortiAP(securityProfile) {
        const fortiapSecurity = {};

        switch (securityProfile.authType) {
            case 'open':
                fortiapSecurity.security = 'open';
                break;
            case 'wpa2_psk':
                fortiapSecurity.security = 'wpa2-only-personal';
                fortiapSecurity.passphrase = securityProfile.passphrase;
                break;
            case 'wpa3_psk':
                fortiapSecurity.security = 'wpa3-personal';
                fortiapSecurity.passphrase = securityProfile.passphrase;
                break;
            case 'wpa2_enterprise':
                fortiapSecurity.security = 'wpa2-only-enterprise';
                if (securityProfile.radiusConfig) {
                    fortiapSecurity.auth = 'radius';
                    fortiapSecurity.radius_server = this.convertRadiusConfig(securityProfile.radiusConfig);
                }
                break;
            case 'wpa3_enterprise':
                fortiapSecurity.security = 'wpa3-enterprise';
                if (securityProfile.radiusConfig) {
                    fortiapSecurity.auth = 'radius';
                    fortiapSecurity.radius_server = this.convertRadiusConfig(securityProfile.radiusConfig);
                }
                break;
        }

        return fortiapSecurity;
    }

    /**
     * Convert RADIUS configuration to FortiAP format
     * @param {Object} radiusConfig - RADIUS configuration
     * @returns {string} RADIUS server name (FortiGate uses RADIUS server objects)
     */
    convertRadiusConfig(radiusConfig) {
        // FortiGate typically uses RADIUS server objects that need to be created separately
        // For now, return the primary server host as identifier
        return radiusConfig.primaryServer ? radiusConfig.primaryServer.host : null;
    }

    /**
     * Apply SSID to WTP (Wireless Termination Point) profile
     * @param {string} ssidName - SSID name
     * @param {string} wtpProfile - WTP profile name
     * @returns {Promise<boolean>}
     */
    async applySSIDToWTPProfile(ssidName, wtpProfile = 'default') {
        try {
            // Get current WTP profile configuration
            const profileResponse = await this.apiClient.get(
                `/cmdb/wireless-controller/wtp-profile/${wtpProfile}?vdom=${this.vdom}`
            );

            const currentProfile = profileResponse.data.results;
            
            // Add SSID to radio configurations
            const updatedProfile = {
                ...currentProfile,
                radio_1: {
                    ...currentProfile.radio_1,
                    vaps: [...(currentProfile.radio_1.vaps || []), { name: ssidName }]
                },
                radio_2: {
                    ...currentProfile.radio_2,
                    vaps: [...(currentProfile.radio_2.vaps || []), { name: ssidName }]
                }
            };

            await this.apiClient.put(
                `/cmdb/wireless-controller/wtp-profile/${wtpProfile}?vdom=${this.vdom}`,
                updatedProfile
            );

            return true;
        } catch (error) {
            throw new Error(`Failed to apply SSID to WTP profile: ${error.message}`);
        }
    }

    /**
     * Remove SSID from all WTP profiles
     * @param {string} ssidName - SSID name to remove
     * @returns {Promise<boolean>}
     */
    async removeSSIDFromWTPProfiles(ssidName) {
        try {
            // Get all WTP profiles
            const profilesResponse = await this.apiClient.get(
                `/cmdb/wireless-controller/wtp-profile?vdom=${this.vdom}`
            );

            const updatePromises = profilesResponse.data.results.map(async (profile) => {
                let needsUpdate = false;
                const updatedProfile = { ...profile };

                // Remove from radio 1
                if (profile.radio_1 && profile.radio_1.vaps) {
                    const filteredVaps = profile.radio_1.vaps.filter(vap => vap.name !== ssidName);
                    if (filteredVaps.length !== profile.radio_1.vaps.length) {
                        updatedProfile.radio_1.vaps = filteredVaps;
                        needsUpdate = true;
                    }
                }

                // Remove from radio 2
                if (profile.radio_2 && profile.radio_2.vaps) {
                    const filteredVaps = profile.radio_2.vaps.filter(vap => vap.name !== ssidName);
                    if (filteredVaps.length !== profile.radio_2.vaps.length) {
                        updatedProfile.radio_2.vaps = filteredVaps;
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    return this.apiClient.put(
                        `/cmdb/wireless-controller/wtp-profile/${profile.name}?vdom=${this.vdom}`,
                        updatedProfile
                    );
                }
            });

            await Promise.all(updatePromises.filter(promise => promise));
            return true;
        } catch (error) {
            throw new Error(`Failed to remove SSID from WTP profiles: ${error.message}`);
        }
    }
}

module.exports = FortiAPDriver;