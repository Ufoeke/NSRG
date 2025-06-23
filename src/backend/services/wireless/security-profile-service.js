/**
 * Security Profile Template System
 * Comprehensive security profile management with pre-configured templates,
 * authentication methods, encryption standards, and multi-vendor compatibility
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class SecurityProfileService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Certificate validation settings
            certificateValidation: true,
            radiusTimeout: 5000,
            radiusRetries: 3,
            
            // Encryption standards
            supportedCiphers: ['AES-128', 'AES-256', 'TKIP'],
            supportedKeyMgmt: ['WPA2-PSK', 'WPA3-PSK', 'WPA2-802.1X', 'WPA3-802.1X'],
            
            // Password policies
            pskMinLength: 8,
            pskMaxLength: 63,
            pskComplexity: true,
            
            ...config
        };

        // Security profile storage
        this.profiles = new Map();
        
        // Certificate store
        this.certificates = new Map();
        
        // RADIUS server configurations
        this.radiusServers = new Map();
        
        // Template library
        this.templates = new Map();
        
        // Vendor compatibility matrix
        this.vendorCompatibility = this.initializeVendorCompatibility();
        
        // Initialize default security profiles
        this.initializeDefaultProfiles();
        
        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Initialize vendor compatibility matrix
     */
    initializeVendorCompatibility() {
        return {
            'cisco-meraki': {
                supportedAuthTypes: ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'],
                supportedEncryption: ['AES-128', 'AES-256'],
                supportsRadius: true,
                supportsCertificates: true,
                supportsPMF: true,
                maxRadiusServers: 3,
                limitations: ['No TKIP support in WPA3', 'PMF required for WPA3']
            },
            'fortiap': {
                supportedAuthTypes: ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'],
                supportedEncryption: ['AES-128', 'AES-256', 'TKIP'],
                supportsRadius: true,
                supportsCertificates: true,
                supportsPMF: true,
                maxRadiusServers: 5,
                limitations: ['TKIP only with WPA2', 'Certificate validation required for enterprise']
            },
            'cisco-catalyst': {
                supportedAuthTypes: ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'],
                supportedEncryption: ['AES-128', 'AES-256'],
                supportsRadius: true,
                supportsCertificates: true,
                supportsPMF: true,
                maxRadiusServers: 3,
                limitations: ['FlexConnect mode limitations', 'PMF mandatory for WPA3']
            },
            'aruba': {
                supportedAuthTypes: ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'],
                supportedEncryption: ['AES-128', 'AES-256', 'TKIP'],
                supportsRadius: true,
                supportsCertificates: true,
                supportsPMF: true,
                maxRadiusServers: 8,
                limitations: ['TKIP deprecated in newer firmware', 'Enhanced open support available']
            }
        };
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.on('profileCreated', (data) => {
            console.log(`Security profile created: ${data.name} (${data.id})`);
        });
        
        this.on('profileValidated', (data) => {
            console.log(`Security profile validated: ${data.profileId} for ${data.vendor}`);
        });
        
        this.on('certificateInstalled', (data) => {
            console.log(`Certificate installed: ${data.name} (${data.id})`);
        });
    }    /**
     * Initialize default security profiles
     */
    initializeDefaultProfiles() {
        const defaultProfiles = [
            {
                id: 'open-public',
                name: 'Open Public Network',
                description: 'Unsecured network for public access',
                authType: 'open',
                encryption: 'none',
                securityLevel: 'low',
                useCase: 'public-access',
                vendorSupport: ['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']
            },
            {
                id: 'wpa2-psk-standard',
                name: 'WPA2-PSK Standard',
                description: 'Standard WPA2 with pre-shared key',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium',
                useCase: 'small-office',
                pskConfig: {
                    requireComplexPassword: true,
                    minLength: 12,
                    rotationPolicy: '90-days'
                },
                vendorSupport: ['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']
            },
            {
                id: 'wpa3-psk-enhanced',
                name: 'WPA3-PSK Enhanced Security',
                description: 'Enhanced WPA3 with SAE (Simultaneous Authentication of Equals)',
                authType: 'wpa3_psk',
                encryption: 'AES-256',
                securityLevel: 'high',
                useCase: 'modern-devices',
                pmfRequired: true,
                saeConfig: {
                    antiCloggingThreshold: 5,
                    syncThreshold: 5
                },
                vendorSupport: ['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']
            },
            {
                id: 'wpa2-enterprise-standard',
                name: 'WPA2 Enterprise (802.1X)',
                description: 'Enterprise WPA2 with RADIUS authentication',
                authType: 'wpa2_enterprise',
                encryption: 'AES-256',
                securityLevel: 'high',
                useCase: 'enterprise',
                radiusRequired: true,
                eapMethods: ['EAP-TLS', 'EAP-PEAP', 'EAP-TTLS'],
                certificateValidation: true,
                vendorSupport: ['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']
            },
            {
                id: 'wpa3-enterprise-maximum',
                name: 'WPA3 Enterprise Maximum Security',
                description: 'Maximum security WPA3 Enterprise with 192-bit encryption',
                authType: 'wpa3_enterprise',
                encryption: 'AES-256',
                securityLevel: 'maximum',
                useCase: 'high-security',
                pmfRequired: true,
                radiusRequired: true,
                eapMethods: ['EAP-TLS'],
                certificateValidation: true,
                cnsa: true, // Commercial National Security Algorithm Suite
                vendorSupport: ['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']
            }
        ];

        defaultProfiles.forEach(profile => {
            profile.createdAt = new Date();
            profile.isDefault = true;
            this.profiles.set(profile.id, profile);
        });

        // Initialize default templates
        this.initializeDefaultTemplates();
    }    /**
     * Initialize default security templates
     */
    initializeDefaultTemplates() {
        const defaultTemplates = [
            {
                id: 'guest-network-template',
                name: 'Guest Network Security',
                description: 'Standard security template for guest networks',
                baseProfile: 'wpa2-psk-standard',
                customizations: {
                    isolation: true,
                    bandwidthLimit: true,
                    timeRestrictions: true,
                    contentFiltering: 'basic'
                },
                applicableUseCase: 'guest-access'
            },
            {
                id: 'corporate-template',
                name: 'Corporate Network Security',
                description: 'Enterprise security template for corporate networks',
                baseProfile: 'wpa2-enterprise-standard',
                customizations: {
                    certificateValidation: 'strict',
                    deviceCompliance: true,
                    auditLogging: 'full',
                    ruleBasedAccess: true
                },
                applicableUseCase: 'corporate'
            },
            {
                id: 'iot-security-template',
                name: 'IoT Device Security',
                description: 'Specialized security for IoT device networks',
                baseProfile: 'wpa2-psk-standard',
                customizations: {
                    deviceIsolation: true,
                    macFiltering: true,
                    vlanSegmentation: true,
                    bandwidthRestriction: true
                },
                applicableUseCase: 'iot-devices'
            },
            {
                id: 'byod-template',
                name: 'BYOD Security Profile',
                description: 'Bring Your Own Device security template',
                baseProfile: 'wpa2-enterprise-standard',
                customizations: {
                    deviceRegistration: true,
                    complianceChecking: true,
                    containerization: true,
                    dataLossPrevention: true
                },
                applicableUseCase: 'byod'
            }
        ];

        defaultTemplates.forEach(template => {
            template.createdAt = new Date();
            template.isDefault = true;
            this.templates.set(template.id, template);
        });
    }

    // ===============================
    // SECURITY PROFILE MANAGEMENT
    // ===============================

    /**
     * Create a new security profile
     * @param {Object} profileConfig - Security profile configuration
     * @returns {string} Profile ID
     */
    createProfile(profileConfig) {
        const id = profileConfig.id || uuidv4();
        
        // Validate profile configuration
        this.validateProfileConfig(profileConfig);
        
        const profile = {
            id,
            ...profileConfig,
            createdAt: new Date(),
            updatedAt: new Date(),
            isDefault: false
        };

        this.profiles.set(id, profile);

        this.emit('profileCreated', { id, name: profile.name });
        
        return id;
    }    /**
     * Update an existing security profile
     * @param {string} id - Profile ID
     * @param {Object} updates - Profile updates
     * @returns {boolean}
     */
    updateProfile(id, updates) {
        const profile = this.profiles.get(id);
        if (!profile) {
            throw new Error(`Security profile ${id} not found`);
        }

        // Prevent updating default profiles
        if (profile.isDefault) {
            throw new Error('Cannot modify default security profiles');
        }

        const updatedProfile = {
            ...profile,
            ...updates,
            id, // Preserve original ID
            updatedAt: new Date()
        };

        this.validateProfileConfig(updatedProfile);
        
        this.profiles.set(id, updatedProfile);

        this.emit('profileUpdated', { id, name: updatedProfile.name });
        
        return true;
    }

    /**
     * Delete a security profile
     * @param {string} id - Profile ID
     * @returns {boolean}
     */
    deleteProfile(id) {
        const profile = this.profiles.get(id);
        if (!profile) {
            throw new Error(`Security profile ${id} not found`);
        }

        // Prevent deleting default profiles
        if (profile.isDefault) {
            throw new Error('Cannot delete default security profiles');
        }

        this.profiles.delete(id);

        this.emit('profileDeleted', { id, name: profile.name });
        
        return true;
    }

    /**
     * Get all security profiles
     * @returns {Array} List of security profiles
     */
    getProfiles() {
        return Array.from(this.profiles.values());
    }

    /**
     * Get security profile by ID
     * @param {string} id - Profile ID
     * @returns {Object} Security profile
     */
    getProfile(id) {
        const profile = this.profiles.get(id);
        if (!profile) {
            throw new Error(`Security profile ${id} not found`);
        }
        return profile;
    }    /**
     * Validate security profile configuration
     * @param {Object} profileConfig - Profile configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateProfileConfig(profileConfig) {
        // Required fields
        if (!profileConfig.name || typeof profileConfig.name !== 'string') {
            throw new Error('Profile name is required and must be a string');
        }
        
        if (!profileConfig.authType || typeof profileConfig.authType !== 'string') {
            throw new Error('Authentication type is required');
        }

        // Validate authentication type
        const validAuthTypes = ['open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise'];
        if (!validAuthTypes.includes(profileConfig.authType)) {
            throw new Error(`Invalid authentication type: ${profileConfig.authType}`);
        }

        // Validate encryption
        if (profileConfig.encryption && !this.config.supportedCiphers.includes(profileConfig.encryption)) {
            throw new Error(`Unsupported encryption: ${profileConfig.encryption}`);
        }

        // Validate PSK configuration for PSK-based auth
        if (profileConfig.authType.includes('psk') && profileConfig.pskConfig) {
            this.validatePSKConfig(profileConfig.pskConfig);
        }

        // Validate RADIUS configuration for enterprise auth
        if (profileConfig.authType.includes('enterprise') && profileConfig.radiusRequired) {
            if (!profileConfig.radiusServers || profileConfig.radiusServers.length === 0) {
                throw new Error('RADIUS servers required for enterprise authentication');
            }
        }

        // Validate EAP methods for enterprise auth
        if (profileConfig.authType.includes('enterprise') && profileConfig.eapMethods) {
            const validEapMethods = ['EAP-TLS', 'EAP-PEAP', 'EAP-TTLS', 'EAP-FAST'];
            profileConfig.eapMethods.forEach(method => {
                if (!validEapMethods.includes(method)) {
                    throw new Error(`Invalid EAP method: ${method}`);
                }
            });
        }

        // Validate WPA3 requirements
        if (profileConfig.authType.includes('wpa3')) {
            if (!profileConfig.pmfRequired) {
                console.warn('PMF (Protected Management Frames) is recommended for WPA3');
            }
        }

        return true;
    }

    /**
     * Validate PSK configuration
     * @param {Object} pskConfig - PSK configuration
     * @throws {Error} If PSK configuration is invalid
     */
    validatePSKConfig(pskConfig) {
        if (pskConfig.minLength && pskConfig.minLength < this.config.pskMinLength) {
            throw new Error(`PSK minimum length cannot be less than ${this.config.pskMinLength}`);
        }

        if (pskConfig.minLength && pskConfig.minLength > this.config.pskMaxLength) {
            throw new Error(`PSK minimum length cannot exceed ${this.config.pskMaxLength}`);
        }

        return true;
    }    // ===============================
    // VENDOR COMPATIBILITY
    // ===============================

    /**
     * Check vendor compatibility for a security profile
     * @param {string} profileId - Security profile ID
     * @param {string} vendor - Vendor name
     * @returns {Object} Compatibility result
     */
    checkVendorCompatibility(profileId, vendor) {
        const profile = this.getProfile(profileId);
        const vendorCaps = this.vendorCompatibility[vendor];
        
        if (!vendorCaps) {
            throw new Error(`Unknown vendor: ${vendor}`);
        }

        const compatibility = {
            vendor,
            profileId,
            profileName: profile.name,
            compatible: true,
            warnings: [],
            errors: [],
            adaptations: []
        };

        // Check authentication type support
        if (!vendorCaps.supportedAuthTypes.includes(profile.authType)) {
            compatibility.compatible = false;
            compatibility.errors.push(`Authentication type ${profile.authType} not supported by ${vendor}`);
        }

        // Check encryption support
        if (profile.encryption && !vendorCaps.supportedEncryption.includes(profile.encryption)) {
            compatibility.compatible = false;
            compatibility.errors.push(`Encryption ${profile.encryption} not supported by ${vendor}`);
        }

        // Check RADIUS requirements
        if (profile.radiusRequired && !vendorCaps.supportsRadius) {
            compatibility.compatible = false;
            compatibility.errors.push(`RADIUS authentication not supported by ${vendor}`);
        }

        // Check PMF requirements for WPA3
        if (profile.authType.includes('wpa3') && !vendorCaps.supportsPMF) {
            compatibility.compatible = false;
            compatibility.errors.push(`WPA3 requires PMF support which is not available on ${vendor}`);
        }

        // Check vendor-specific limitations
        if (vendorCaps.limitations) {
            vendorCaps.limitations.forEach(limitation => {
                if (this.checkLimitationApplies(profile, limitation)) {
                    compatibility.warnings.push(limitation);
                }
            });
        }

        // Generate vendor-specific adaptations
        compatibility.adaptations = this.generateVendorAdaptations(profile, vendor);

        this.emit('profileValidated', { 
            profileId, 
            vendor, 
            compatible: compatibility.compatible 
        });

        return compatibility;
    }

    /**
     * Check if a vendor limitation applies to the profile
     * @param {Object} profile - Security profile
     * @param {string} limitation - Limitation description
     * @returns {boolean}
     */
    checkLimitationApplies(profile, limitation) {
        const lowerLimitation = limitation.toLowerCase();
        
        if (lowerLimitation.includes('tkip') && profile.encryption === 'TKIP') {
            return true;
        }
        
        if (lowerLimitation.includes('pmf') && profile.authType.includes('wpa3')) {
            return true;
        }
        
        if (lowerLimitation.includes('flexconnect') && profile.authType.includes('enterprise')) {
            return true;
        }
        
        return false;
    }    /**
     * Generate vendor-specific adaptations for a security profile
     * @param {Object} profile - Security profile
     * @param {string} vendor - Vendor name
     * @returns {Array} List of adaptations
     */
    generateVendorAdaptations(profile, vendor) {
        const adaptations = [];
        const vendorCaps = this.vendorCompatibility[vendor];

        // Encryption adaptations
        if (profile.encryption === 'TKIP' && vendor === 'cisco-meraki') {
            adaptations.push({
                type: 'encryption',
                original: 'TKIP',
                adapted: 'AES-128',
                reason: 'Cisco Meraki does not support TKIP with WPA3'
            });
        }

        // RADIUS server adaptations
        if (profile.radiusServers && profile.radiusServers.length > vendorCaps.maxRadiusServers) {
            adaptations.push({
                type: 'radius',
                original: `${profile.radiusServers.length} servers`,
                adapted: `${vendorCaps.maxRadiusServers} servers`,
                reason: `${vendor} supports maximum ${vendorCaps.maxRadiusServers} RADIUS servers`
            });
        }

        // EAP method adaptations
        if (profile.eapMethods && vendor === 'cisco-meraki') {
            const supportedEap = profile.eapMethods.filter(method => 
                ['EAP-TLS', 'EAP-PEAP'].includes(method)
            );
            
            if (supportedEap.length !== profile.eapMethods.length) {
                adaptations.push({
                    type: 'eap-methods',
                    original: profile.eapMethods,
                    adapted: supportedEap,
                    reason: 'Cisco Meraki supports only EAP-TLS and EAP-PEAP'
                });
            }
        }

        // WPA3 adaptations for older vendors
        if (profile.authType === 'wpa3_psk' && !vendorCaps.supportedAuthTypes.includes('wpa3_psk')) {
            adaptations.push({
                type: 'authentication',
                original: 'wpa3_psk',
                adapted: 'wpa2_psk',
                reason: `${vendor} does not support WPA3, falling back to WPA2`
            });
        }

        return adaptations;
    }

    // ===============================
    // CERTIFICATE MANAGEMENT
    // ===============================

    /**
     * Install a certificate for enterprise authentication
     * @param {Object} certificateData - Certificate data
     * @returns {string} Certificate ID
     */
    installCertificate(certificateData) {
        const id = certificateData.id || uuidv4();
        
        // Validate certificate
        this.validateCertificate(certificateData);
        
        const certificate = {
            id,
            ...certificateData,
            installedAt: new Date(),
            status: 'active'
        };

        this.certificates.set(id, certificate);

        this.emit('certificateInstalled', { 
            id, 
            name: certificate.name,
            type: certificate.type 
        });
        
        return id;
    }

    /**
     * Validate certificate data
     * @param {Object} certificateData - Certificate to validate
     * @throws {Error} If certificate is invalid
     */
    validateCertificate(certificateData) {
        if (!certificateData.name || typeof certificateData.name !== 'string') {
            throw new Error('Certificate name is required');
        }
        
        if (!certificateData.pemData || typeof certificateData.pemData !== 'string') {
            throw new Error('Certificate PEM data is required');
        }

        if (!certificateData.pemData.includes('-----BEGIN CERTIFICATE-----')) {
            throw new Error('Invalid PEM format');
        }

        if (!certificateData.type || !['server', 'client', 'ca'].includes(certificateData.type)) {
            throw new Error('Certificate type must be server, client, or ca');
        }

        return true;
    }    /**
     * Get all certificates
     * @returns {Array} List of certificates
     */
    getCertificates() {
        return Array.from(this.certificates.values());
    }

    /**
     * Get certificate by ID
     * @param {string} id - Certificate ID
     * @returns {Object} Certificate data
     */
    getCertificate(id) {
        const certificate = this.certificates.get(id);
        if (!certificate) {
            throw new Error(`Certificate ${id} not found`);
        }
        return certificate;
    }

    /**
     * Revoke a certificate
     * @param {string} id - Certificate ID
     * @returns {boolean}
     */
    revokeCertificate(id) {
        const certificate = this.certificates.get(id);
        if (!certificate) {
            throw new Error(`Certificate ${id} not found`);
        }

        certificate.status = 'revoked';
        certificate.revokedAt = new Date();

        this.emit('certificateRevoked', { id, name: certificate.name });
        
        return true;
    }

    // ===============================
    // RADIUS SERVER MANAGEMENT
    // ===============================

    /**
     * Add RADIUS server configuration
     * @param {Object} radiusConfig - RADIUS server configuration
     * @returns {string} RADIUS server ID
     */
    addRadiusServer(radiusConfig) {
        const id = radiusConfig.id || uuidv4();
        
        // Validate RADIUS configuration
        this.validateRadiusConfig(radiusConfig);
        
        const radiusServer = {
            id,
            ...radiusConfig,
            addedAt: new Date(),
            status: 'active'
        };

        this.radiusServers.set(id, radiusServer);

        this.emit('radiusServerAdded', { 
            id, 
            host: radiusServer.host,
            port: radiusServer.port 
        });
        
        return id;
    }

    /**
     * Validate RADIUS server configuration
     * @param {Object} radiusConfig - RADIUS configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateRadiusConfig(radiusConfig) {
        if (!radiusConfig.host || typeof radiusConfig.host !== 'string') {
            throw new Error('RADIUS server host is required');
        }
        
        if (!radiusConfig.port || typeof radiusConfig.port !== 'number') {
            throw new Error('RADIUS server port is required and must be a number');
        }

        if (radiusConfig.port < 1 || radiusConfig.port > 65535) {
            throw new Error('RADIUS server port must be between 1 and 65535');
        }

        if (!radiusConfig.sharedSecret || typeof radiusConfig.sharedSecret !== 'string') {
            throw new Error('RADIUS shared secret is required');
        }

        if (radiusConfig.sharedSecret.length < 8) {
            throw new Error('RADIUS shared secret must be at least 8 characters');
        }

        return true;
    }    /**
     * Test RADIUS server connectivity
     * @param {string} radiusId - RADIUS server ID
     * @returns {Promise<Object>} Test result
     */
    async testRadiusConnectivity(radiusId) {
        const radiusServer = this.radiusServers.get(radiusId);
        if (!radiusServer) {
            throw new Error(`RADIUS server ${radiusId} not found`);
        }

        try {
            // Simulate RADIUS connectivity test
            // In a real implementation, this would use actual RADIUS protocol
            const testResult = {
                radiusId,
                host: radiusServer.host,
                port: radiusServer.port,
                reachable: true,
                responseTime: Math.floor(Math.random() * 100) + 10, // Simulated response time
                authService: 'available',
                acctService: radiusServer.accounting ? 'available' : 'disabled',
                testedAt: new Date()
            };

            this.emit('radiusTestCompleted', testResult);
            
            return testResult;
        } catch (error) {
            const testResult = {
                radiusId,
                host: radiusServer.host,
                port: radiusServer.port,
                reachable: false,
                error: error.message,
                testedAt: new Date()
            };

            this.emit('radiusTestFailed', testResult);
            
            return testResult;
        }
    }

    /**
     * Get all RADIUS servers
     * @returns {Array} List of RADIUS servers
     */
    getRadiusServers() {
        return Array.from(this.radiusServers.values());
    }

    // ===============================
    // TEMPLATE MANAGEMENT
    // ===============================

    /**
     * Create security profile from template
     * @param {string} templateId - Template ID
     * @param {Object} customizations - Custom overrides
     * @returns {string} New profile ID
     */
    createFromTemplate(templateId, customizations = {}) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Security template ${templateId} not found`);
        }

        const baseProfile = this.getProfile(template.baseProfile);
        
        const profileConfig = {
            name: customizations.name || `${template.name} - Custom`,
            description: customizations.description || `Generated from ${template.name}`,
            ...baseProfile,
            ...template.customizations,
            ...customizations,
            templateId: templateId,
            basedOnTemplate: true
        };

        // Remove fields that shouldn't be copied
        delete profileConfig.id;
        delete profileConfig.createdAt;
        delete profileConfig.updatedAt;
        delete profileConfig.isDefault;

        return this.createProfile(profileConfig);
    }

    /**
     * Get all security templates
     * @returns {Array} List of templates
     */
    getTemplates() {
        return Array.from(this.templates.values());
    }

    /**
     * Get template by ID
     * @param {string} id - Template ID
     * @returns {Object} Template data
     */
    getTemplate(id) {
        const template = this.templates.get(id);
        if (!template) {
            throw new Error(`Security template ${id} not found`);
        }
        return template;
    }

    // ===============================
    // UTILITY METHODS
    // ===============================

    /**
     * Get security profile statistics
     * @returns {Object} Profile statistics
     */
    getStatistics() {
        const profiles = this.getProfiles();
        const templates = this.getTemplates();
        const certificates = this.getCertificates();
        const radiusServers = this.getRadiusServers();

        const authTypeStats = {};
        const securityLevelStats = {};

        profiles.forEach(profile => {
            authTypeStats[profile.authType] = (authTypeStats[profile.authType] || 0) + 1;
            securityLevelStats[profile.securityLevel] = (securityLevelStats[profile.securityLevel] || 0) + 1;
        });

        return {
            totalProfiles: profiles.length,
            defaultProfiles: profiles.filter(p => p.isDefault).length,
            customProfiles: profiles.filter(p => !p.isDefault).length,
            authTypeDistribution: authTypeStats,
            securityLevelDistribution: securityLevelStats,
            totalTemplates: templates.length,
            totalCertificates: certificates.length,
            activeCertificates: certificates.filter(c => c.status === 'active').length,
            totalRadiusServers: radiusServers.length,
            activeRadiusServers: radiusServers.filter(r => r.status === 'active').length
        };
    }

    /**
     * Generate security audit report
     * @returns {Object} Security audit report
     */
    generateSecurityAudit() {
        const profiles = this.getProfiles();
        const audit = {
            timestamp: new Date(),
            summary: {
                total: profiles.length,
                secureProfiles: 0,
                weakProfiles: 0,
                recommendations: []
            },
            profileAudits: []
        };

        profiles.forEach(profile => {
            const profileAudit = {
                id: profile.id,
                name: profile.name,
                securityLevel: profile.securityLevel,
                issues: [],
                score: 100
            };

            // Check for weak authentication
            if (profile.authType === 'open') {
                profileAudit.issues.push('Open authentication provides no security');
                profileAudit.score -= 50;
            }

            // Check for weak encryption
            if (profile.encryption === 'TKIP') {
                profileAudit.issues.push('TKIP encryption is deprecated and vulnerable');
                profileAudit.score -= 30;
            }

            // Check for WPA3 adoption
            if (profile.authType.includes('wpa2') && !profile.authType.includes('wpa3')) {
                profileAudit.issues.push('Consider upgrading to WPA3 for enhanced security');
                profileAudit.score -= 10;
            }

            // Check for PMF
            if (profile.authType.includes('wpa3') && !profile.pmfRequired) {
                profileAudit.issues.push('PMF (Protected Management Frames) should be required for WPA3');
                profileAudit.score -= 15;
            }

            // Categorize profile
            if (profileAudit.score >= 80) {
                audit.summary.secureProfiles++;
            } else {
                audit.summary.weakProfiles++;
            }

            audit.profileAudits.push(profileAudit);
        });

        // Generate recommendations
        if (audit.summary.weakProfiles > 0) {
            audit.summary.recommendations.push('Review and upgrade weak security profiles');
        }

        const wpa2Count = profiles.filter(p => p.authType.includes('wpa2')).length;
        if (wpa2Count > 0) {
            audit.summary.recommendations.push('Consider migrating from WPA2 to WPA3 where possible');
        }

        const openCount = profiles.filter(p => p.authType === 'open').length;
        if (openCount > 0) {
            audit.summary.recommendations.push('Minimize use of open authentication networks');
        }

        return audit;
    }
}

module.exports = SecurityProfileService;