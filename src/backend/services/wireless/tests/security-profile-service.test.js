/**
 * Security Profile Service Tests
 * Comprehensive test suite for the Security Profile Template System
 */

const SecurityProfileService = require('../security-profile-service');

describe('SecurityProfileService', () => {
    let service;

    beforeEach(() => {
        service = new SecurityProfileService();
    });

    afterEach(() => {
        service.removeAllListeners();
    });

    describe('Initialization', () => {
        test('should initialize with default profiles', () => {
            const profiles = service.getProfiles();
            expect(profiles.length).toBeGreaterThan(0);
            expect(profiles.some(p => p.id === 'open-public')).toBe(true);
            expect(profiles.some(p => p.id === 'wpa2-psk-standard')).toBe(true);
            expect(profiles.some(p => p.id === 'wpa3-enterprise-maximum')).toBe(true);
        });

        test('should initialize with default templates', () => {
            const templates = service.getTemplates();
            expect(templates.length).toBeGreaterThan(0);
            expect(templates.some(t => t.id === 'guest-network-template')).toBe(true);
            expect(templates.some(t => t.id === 'corporate-template')).toBe(true);
        });

        test('should initialize vendor compatibility matrix', () => {
            expect(service.vendorCompatibility).toBeDefined();
            expect(service.vendorCompatibility['cisco-meraki']).toBeDefined();
            expect(service.vendorCompatibility['fortiap']).toBeDefined();
            expect(service.vendorCompatibility['cisco-catalyst']).toBeDefined();
            expect(service.vendorCompatibility['aruba']).toBeDefined();
        });
    });

    describe('Profile Management', () => {
        test('should create a custom security profile', () => {
            const profileConfig = {
                name: 'Test Profile',
                description: 'Test security profile',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            };

            const profileId = service.createProfile(profileConfig);
            expect(profileId).toBeDefined();

            const profile = service.getProfile(profileId);
            expect(profile.name).toBe('Test Profile');
            expect(profile.authType).toBe('wpa2_psk');
            expect(profile.isDefault).toBe(false);
        });

        test('should update existing profile', () => {
            const profileConfig = {
                name: 'Original Name',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            };

            const profileId = service.createProfile(profileConfig);
            
            service.updateProfile(profileId, {
                name: 'Updated Name',
                securityLevel: 'high'
            });

            const profile = service.getProfile(profileId);
            expect(profile.name).toBe('Updated Name');
            expect(profile.securityLevel).toBe('high');
            expect(profile.authType).toBe('wpa2_psk'); // Should remain unchanged
        });

        test('should not allow updating default profiles', () => {
            expect(() => {
                service.updateProfile('open-public', { name: 'Modified' });
            }).toThrow('Cannot modify default security profiles');
        });

        test('should delete custom profile', () => {
            const profileConfig = {
                name: 'To Delete',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            };

            const profileId = service.createProfile(profileConfig);
            expect(service.getProfile(profileId)).toBeDefined();

            service.deleteProfile(profileId);
            
            expect(() => {
                service.getProfile(profileId);
            }).toThrow('not found');
        });

        test('should not allow deleting default profiles', () => {
            expect(() => {
                service.deleteProfile('open-public');
            }).toThrow('Cannot delete default security profiles');
        });
    });

    describe('Profile Validation', () => {
        test('should validate valid profile configuration', () => {
            const validConfig = {
                name: 'Valid Profile',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            };

            expect(() => {
                service.validateProfileConfig(validConfig);
            }).not.toThrow();
        });

        test('should reject profile without name', () => {
            const invalidConfig = {
                authType: 'wpa2_psk',
                encryption: 'AES-256'
            };

            expect(() => {
                service.validateProfileConfig(invalidConfig);
            }).toThrow('Profile name is required');
        });

        test('should reject invalid authentication type', () => {
            const invalidConfig = {
                name: 'Invalid Auth',
                authType: 'invalid_auth',
                encryption: 'AES-256'
            };

            expect(() => {
                service.validateProfileConfig(invalidConfig);
            }).toThrow('Invalid authentication type');
        });

        test('should reject unsupported encryption', () => {
            const invalidConfig = {
                name: 'Invalid Encryption',
                authType: 'wpa2_psk',
                encryption: 'UNSUPPORTED_CIPHER'
            };

            expect(() => {
                service.validateProfileConfig(invalidConfig);
            }).toThrow('Unsupported encryption');
        });
    });

    describe('Vendor Compatibility', () => {
        test('should check compatibility for supported configuration', () => {
            const profileConfig = {
                name: 'Compatible Profile',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            };

            const profileId = service.createProfile(profileConfig);
            const compatibility = service.checkVendorCompatibility(profileId, 'cisco-meraki');

            expect(compatibility.vendor).toBe('cisco-meraki');
            expect(compatibility.profileId).toBe(profileId);
            expect(compatibility.compatible).toBe(true);
            expect(compatibility.issues).toHaveLength(0);
        });

        test('should detect incompatible configuration', () => {
            const profileConfig = {
                name: 'Incompatible Profile',
                authType: 'wpa3_psk',
                encryption: 'TKIP', // TKIP not supported with WPA3 on Meraki
                securityLevel: 'high'
            };

            const profileId = service.createProfile(profileConfig);
            const compatibility = service.checkVendorCompatibility(profileId, 'cisco-meraki');

            expect(compatibility.compatible).toBe(false);
            expect(compatibility.issues.length).toBeGreaterThan(0);
            expect(compatibility.adaptations.length).toBeGreaterThan(0);
        });

        test('should provide adaptations for incompatible features', () => {
            const profileConfig = {
                name: 'Needs Adaptation',
                authType: 'wpa2_psk',
                encryption: 'TKIP',
                securityLevel: 'medium'
            };

            const profileId = service.createProfile(profileConfig);
            const compatibility = service.checkVendorCompatibility(profileId, 'cisco-meraki');

            if (!compatibility.compatible) {
                expect(compatibility.adaptations.length).toBeGreaterThan(0);
                expect(compatibility.adaptations[0]).toHaveProperty('type');
                expect(compatibility.adaptations[0]).toHaveProperty('original');
                expect(compatibility.adaptations[0]).toHaveProperty('adapted');
                expect(compatibility.adaptations[0]).toHaveProperty('reason');
            }
        });
    });

    describe('Template Management', () => {
        test('should create profile from template', () => {
            const customizations = {
                name: 'Custom Guest Network',
                description: 'Customized guest access'
            };

            const profileId = service.createFromTemplate('guest-network-template', customizations);
            const profile = service.getProfile(profileId);

            expect(profile.name).toBe('Custom Guest Network');
            expect(profile.description).toBe('Customized guest access');
            expect(profile.basedOnTemplate).toBe(true);
            expect(profile.templateId).toBe('guest-network-template');
        });

        test('should throw error for non-existent template', () => {
            expect(() => {
                service.createFromTemplate('non-existent-template');
            }).toThrow('Security template non-existent-template not found');
        });

        test('should get template by ID', () => {
            const template = service.getTemplate('corporate-template');
            expect(template.id).toBe('corporate-template');
            expect(template.name).toBe('Corporate Network Security');
            expect(template.baseProfile).toBeDefined();
        });
    });

    describe('Statistics and Reporting', () => {
        test('should generate profile statistics', () => {
            // Create some test profiles
            service.createProfile({
                name: 'Test PSK',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            });

            service.createProfile({
                name: 'Test Enterprise',
                authType: 'wpa2_enterprise',
                encryption: 'AES-256',
                securityLevel: 'high'
            });

            const stats = service.getStatistics();

            expect(stats.totalProfiles).toBeGreaterThan(0);
            expect(stats.defaultProfiles).toBeGreaterThan(0);
            expect(stats.customProfiles).toBeGreaterThanOrEqual(2);
            expect(stats.authTypeDistribution).toHaveProperty('wpa2_psk');
            expect(stats.authTypeDistribution).toHaveProperty('wpa2_enterprise');
            expect(stats.securityLevelDistribution).toHaveProperty('medium');
            expect(stats.securityLevelDistribution).toHaveProperty('high');
        });

        test('should generate security audit report', () => {
            const auditReport = service.generateSecurityAudit();

            expect(auditReport.timestamp).toBeDefined();
            expect(auditReport.summary).toBeDefined();
            expect(auditReport.summary.total).toBeGreaterThan(0);
            expect(auditReport.profileAudits).toBeInstanceOf(Array);
            expect(auditReport.summary.recommendations).toBeInstanceOf(Array);

            // Check that open networks are flagged
            const openProfileAudit = auditReport.profileAudits.find(
                audit => audit.name === 'Open Public Network'
            );
            expect(openProfileAudit).toBeDefined();
            expect(openProfileAudit.issues.length).toBeGreaterThan(0);
            expect(openProfileAudit.score).toBeLessThan(100);
        });
    });

    describe('Event Emission', () => {
        test('should emit profileCreated event', (done) => {
            service.on('profileCreated', (data) => {
                expect(data.id).toBeDefined();
                expect(data.name).toBe('Event Test Profile');
                done();
            });

            service.createProfile({
                name: 'Event Test Profile',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            });
        });

        test('should emit profileValidated event', (done) => {
            const profileId = service.createProfile({
                name: 'Validation Test',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            });

            service.on('profileValidated', (data) => {
                expect(data.profileId).toBe(profileId);
                expect(data.vendor).toBe('cisco-meraki');
                done();
            });

            service.checkVendorCompatibility(profileId, 'cisco-meraki');
        });
    });

    describe('Error Handling', () => {
        test('should handle non-existent profile lookup', () => {
            expect(() => {
                service.getProfile('non-existent-id');
            }).toThrow('Security profile non-existent-id not found');
        });

        test('should handle non-existent template lookup', () => {
            expect(() => {
                service.getTemplate('non-existent-template');
            }).toThrow('Security template non-existent-template not found');
        });

        test('should handle invalid vendor in compatibility check', () => {
            const profileId = service.createProfile({
                name: 'Test Profile',
                authType: 'wpa2_psk',
                encryption: 'AES-256',
                securityLevel: 'medium'
            });

            expect(() => {
                service.checkVendorCompatibility(profileId, 'invalid-vendor');
            }).toThrow();
        });
    });

    describe('Edge Cases', () => {
        test('should handle profile with minimal configuration', () => {
            const minimalConfig = {
                name: 'Minimal Profile',
                authType: 'open'
            };

            const profileId = service.createProfile(minimalConfig);
            const profile = service.getProfile(profileId);

            expect(profile.name).toBe('Minimal Profile');
            expect(profile.authType).toBe('open');
        });

        test('should handle profile with maximum configuration', () => {
            const maximalConfig = {
                name: 'Maximal Profile',
                description: 'Profile with all features',
                authType: 'wpa3_enterprise',
                encryption: 'AES-256',
                securityLevel: 'maximum',
                pmfRequired: true,
                radiusRequired: true,
                eapMethods: ['EAP-TLS'],
                certificateValidation: true,
                cnsa: true,
                customField: 'custom value'
            };

            const profileId = service.createProfile(maximalConfig);
            const profile = service.getProfile(profileId);

            expect(profile.name).toBe('Maximal Profile');
            expect(profile.authType).toBe('wpa3_enterprise');
            expect(profile.pmfRequired).toBe(true);
            expect(profile.cnsa).toBe(true);
            expect(profile.customField).toBe('custom value');
        });
    });
});

// Mock data for testing
const mockCertificateData = {
    name: 'Test Certificate',
    type: 'server',
    format: 'PEM',
    certificate: '-----BEGIN CERTIFICATE-----\\nMIIC...\\n-----END CERTIFICATE-----',
    privateKey: '-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----',
    issuer: 'Test CA',
    subject: 'CN=test.example.com',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
};

const mockRadiusConfig = {
    name: 'Test RADIUS Server',
    host: '192.168.1.100',
    port: 1812,
    sharedSecret: 'test-secret',
    timeout: 5000,
    retries: 3,
    description: 'Test RADIUS server for authentication'
}; 