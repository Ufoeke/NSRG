/**
 * Coverage Planning Service Tests
 * Comprehensive test suite for RF coverage analysis, bandwidth management, and QoS policies
 */

const CoveragePlanningService = require('../services/wireless/coverage-planning-service');

describe('CoveragePlanningService', () => {
    let service;

    beforeEach(() => {
        service = new CoveragePlanningService();
    });

    afterEach(() => {
        if (service) {
            service.removeAllListeners();
        }
    });

    describe('Initialization', () => {
        test('should initialize with default configuration', () => {
            expect(service.config.defaultFrequency).toBe('5GHz');
            expect(service.config.signalThreshold).toBe(-70);
            expect(service.config.overlapPercentage).toBe(15);
            expect(service.config.usersPerAP).toBe(25);
        });

        test('should override default configuration', () => {
            const customConfig = {
                defaultFrequency: '2.4GHz',
                signalThreshold: -75,
                usersPerAP: 30
            };
            
            const customService = new CoveragePlanningService(customConfig);
            expect(customService.config.defaultFrequency).toBe('2.4GHz');
            expect(customService.config.signalThreshold).toBe(-75);
            expect(customService.config.usersPerAP).toBe(30);
        });

        test('should initialize default bandwidth policies', () => {
            const policies = service.getBandwidthPolicies();
            expect(policies.length).toBeGreaterThan(0);
            
            const execPolicy = policies.find(p => p.id === 'exec-policy');
            expect(execPolicy).toBeDefined();
            expect(execPolicy.name).toBe('Executive Policy');
            expect(execPolicy.priority).toBe('critical');
            expect(execPolicy.downloadLimit).toBe('unlimited');
        });

        test('should initialize default QoS templates', () => {
            const templates = service.getQoSTemplates();
            expect(templates.length).toBeGreaterThan(0);
            
            const voiceTemplate = templates.find(t => t.id === 'voice-qos');
            expect(voiceTemplate).toBeDefined();
            expect(voiceTemplate.name).toBe('Voice Optimized');
            expect(voiceTemplate.dscp).toBe(46);
            expect(voiceTemplate.priority).toBe(7);
        });

        test('should initialize load balancing rules', () => {
            expect(service.loadBalancingRules.length).toBeGreaterThan(0);
            
            const userCountRule = service.loadBalancingRules.find(r => r.type === 'user-count');
            expect(userCountRule).toBeDefined();
            expect(userCountRule.enabled).toBe(true);
            expect(userCountRule.threshold).toBe(20);
        });
    });

    describe('Coverage Area Management', () => {
        const validAreaConfig = {
            name: 'Main Office',
            location: 'Building A, Floor 1',
            dimensions: { width: 50, height: 30 },
            userDensity: 40,
            signalRequirements: {
                minSignalStrength: -70,
                coverage: 95,
                overlap: 15
            },
            environmentalFactors: {
                wallMaterial: 'drywall',
                ceilingHeight: 3,
                obstructions: []
            }
        };

        test('should create coverage area successfully', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            expect(area.id).toBeDefined();
            expect(area.name).toBe('Main Office');
            expect(area.dimensions.width).toBe(50);
            expect(area.dimensions.height).toBe(30);
            expect(area.userDensity).toBe(40);
            expect(area.accessPoints.length).toBeGreaterThan(0);
            expect(area.heatMap).toBeDefined();
            expect(area.createdAt).toBeInstanceOf(Date);
        });

        test('should validate area configuration', async () => {
            const invalidConfig = {
                // Missing name and dimensions
                location: 'Test Location'
            };

            await expect(service.createCoverageArea(invalidConfig))
                .rejects.toThrow('Invalid area configuration');
        });

        test('should emit coverageAreaCreated event', async () => {
            const eventSpy = jest.fn();
            service.on('coverageAreaCreated', eventSpy);

            const area = await service.createCoverageArea(validAreaConfig);
            
            expect(eventSpy).toHaveBeenCalledWith({
                areaId: area.id,
                area: area
            });
        });

        test('should calculate optimal access point placement', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            expect(area.accessPoints.length).toBeGreaterThan(0);
            
            area.accessPoints.forEach(ap => {
                expect(ap.id).toBeDefined();
                expect(ap.position.x).toBeGreaterThanOrEqual(0);
                expect(ap.position.y).toBeGreaterThanOrEqual(0);
                expect(ap.position.z).toBe(3); // Default ceiling height
                expect(ap.expectedSignalStrength).toBeLessThan(0);
                expect(ap.coverageRadius).toBeGreaterThan(0);
                expect(ap.expectedUsers).toBeGreaterThan(0);
                expect(ap.frequency).toBe('5GHz');
                expect(ap.channel).toBeDefined();
                expect(ap.power).toBeGreaterThan(0);
            });
        });

        test('should generate coverage heat map', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            expect(area.heatMap).toBeDefined();
            expect(area.heatMap.width).toBe(50);
            expect(area.heatMap.height).toBe(30);
            expect(area.heatMap.resolution).toBe(1);
            expect(area.heatMap.data.length).toBeGreaterThan(0);
            expect(area.heatMap.timestamp).toBeInstanceOf(Date);
            
            // Check heat map data structure
            const firstRow = area.heatMap.data[0];
            expect(firstRow.length).toBeGreaterThan(0);
            
            const firstPoint = firstRow[0];
            expect(firstPoint.x).toBeGreaterThanOrEqual(0);
            expect(firstPoint.y).toBeGreaterThanOrEqual(0);
            expect(firstPoint.signalStrength).toBeLessThan(0);
            expect(['excellent', 'good', 'fair', 'weak', 'poor']).toContain(firstPoint.quality);
            expect(firstPoint.apContributions).toBeInstanceOf(Array);
        });

        test('should retrieve coverage areas', async () => {
            const area1 = await service.createCoverageArea({
                ...validAreaConfig,
                name: 'Area 1'
            });
            
            const area2 = await service.createCoverageArea({
                ...validAreaConfig,
                name: 'Area 2'
            });

            const areas = service.getCoverageAreas();
            expect(areas.length).toBe(2);
            expect(areas.some(a => a.id === area1.id)).toBe(true);
            expect(areas.some(a => a.id === area2.id)).toBe(true);
        });

        test('should retrieve specific coverage area', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            const retrieved = service.getCoverageArea(area.id);
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(area.id);
            expect(retrieved.name).toBe(area.name);
        });

        test('should update coverage area', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            const updates = {
                name: 'Updated Office',
                userDensity: 50
            };
            
            const updated = await service.updateCoverageArea(area.id, updates);
            expect(updated.name).toBe('Updated Office');
            expect(updated.userDensity).toBe(50);
            expect(updated.updatedAt).toBeInstanceOf(Date);
        });

        test('should delete coverage area', async () => {
            const area = await service.createCoverageArea(validAreaConfig);
            
            const deleted = await service.deleteCoverageArea(area.id);
            expect(deleted).toBe(true);
            
            const retrieved = service.getCoverageArea(area.id);
            expect(retrieved).toBeUndefined();
        });

        test('should handle non-existent coverage area operations', async () => {
            await expect(service.updateCoverageArea('non-existent', {}))
                .rejects.toThrow('Coverage area with ID non-existent not found');
            
            await expect(service.deleteCoverageArea('non-existent'))
                .rejects.toThrow('Coverage area with ID non-existent not found');
        });
    });

    describe('Bandwidth Policy Management', () => {
        const validPolicyConfig = {
            name: 'Test Policy',
            description: 'Test bandwidth policy',
            downloadLimit: 100,
            uploadLimit: 50,
            priority: 'high',
            qosClass: 'gold',
            userGroups: ['test-users'],
            trafficShaping: {
                enabled: true,
                burstAllowance: '150Mbps',
                sustainedRate: '100Mbps'
            },
            applicationControl: {
                enabled: true,
                allowedCategories: ['business'],
                blockedCategories: ['gaming']
            }
        };

        test('should create bandwidth policy successfully', async () => {
            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            expect(policy.id).toBeDefined();
            expect(policy.name).toBe('Test Policy');
            expect(policy.downloadLimit).toBe(100);
            expect(policy.uploadLimit).toBe(50);
            expect(policy.priority).toBe('high');
            expect(policy.qosClass).toBe('gold');
            expect(policy.isDefault).toBe(false);
            expect(policy.isActive).toBe(true);
            expect(policy.createdAt).toBeInstanceOf(Date);
        });

        test('should validate policy configuration', async () => {
            const invalidConfig = {
                // Missing name and description
                downloadLimit: 100
            };

            await expect(service.createBandwidthPolicy(invalidConfig))
                .rejects.toThrow('Invalid policy configuration');
        });

        test('should emit bandwidthPolicyCreated event', async () => {
            const eventSpy = jest.fn();
            service.on('bandwidthPolicyCreated', eventSpy);

            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            expect(eventSpy).toHaveBeenCalledWith({
                policyId: policy.id,
                policy: policy
            });
        });

        test('should retrieve bandwidth policies', () => {
            const policies = service.getBandwidthPolicies();
            expect(policies.length).toBeGreaterThan(0);
            
            // Check default policies exist
            expect(policies.some(p => p.id === 'exec-policy')).toBe(true);
            expect(policies.some(p => p.id === 'corp-policy')).toBe(true);
            expect(policies.some(p => p.id === 'guest-policy')).toBe(true);
        });

        test('should retrieve specific bandwidth policy', async () => {
            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            const retrieved = service.getBandwidthPolicy(policy.id);
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(policy.id);
            expect(retrieved.name).toBe(policy.name);
        });

        test('should update bandwidth policy', async () => {
            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            const updates = {
                name: 'Updated Policy',
                downloadLimit: 200
            };
            
            const updated = await service.updateBandwidthPolicy(policy.id, updates);
            expect(updated.name).toBe('Updated Policy');
            expect(updated.downloadLimit).toBe(200);
            expect(updated.updatedAt).toBeInstanceOf(Date);
        });

        test('should delete bandwidth policy', async () => {
            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            const deleted = await service.deleteBandwidthPolicy(policy.id);
            expect(deleted).toBe(true);
            
            const retrieved = service.getBandwidthPolicy(policy.id);
            expect(retrieved).toBeUndefined();
        });

        test('should not delete default policy', async () => {
            await expect(service.deleteBandwidthPolicy('exec-policy'))
                .rejects.toThrow('Cannot delete default policy');
        });

        test('should apply policy to coverage area', async () => {
            const areaConfig = {
                name: 'Test Area',
                dimensions: { width: 20, height: 20 }
            };
            
            const area = await service.createCoverageArea(areaConfig);
            const policy = await service.createBandwidthPolicy(validPolicyConfig);
            
            const result = await service.applyPolicyToCoverage(area.id, policy.id);
            
            expect(result.area).toBeDefined();
            expect(result.policy).toBeDefined();
            expect(result.area.appliedPolicies).toContain(policy.id);
        });
    });

    describe('Load Balancing', () => {
        test('should generate load balancing recommendations', async () => {
            const areaConfig = {
                name: 'Test Area',
                dimensions: { width: 30, height: 20 },
                userDensity: 100 // High user density to trigger recommendations
            };
            
            const area = await service.createCoverageArea(areaConfig);
            const recommendations = await service.generateLoadBalancingRecommendations(area.id);
            
            expect(recommendations.areaId).toBe(area.id);
            expect(recommendations.timestamp).toBeInstanceOf(Date);
            expect(recommendations.currentLoad).toBeDefined();
            expect(recommendations.recommendations).toBeInstanceOf(Array);
            
            expect(recommendations.currentLoad.totalUsers).toBe(100);
            expect(recommendations.currentLoad.avgUsersPerAP).toBeGreaterThan(0);
            expect(recommendations.currentLoad.loadDistribution).toBeInstanceOf(Array);
        });

        test('should handle non-existent area for load balancing', async () => {
            await expect(service.generateLoadBalancingRecommendations('non-existent'))
                .rejects.toThrow('Coverage area with ID non-existent not found');
        });

        test('should prioritize recommendations correctly', async () => {
            const areaConfig = {
                name: 'Test Area',
                dimensions: { width: 30, height: 20 },
                userDensity: 100
            };
            
            const area = await service.createCoverageArea(areaConfig);
            const recommendations = await service.generateLoadBalancingRecommendations(area.id);
            
            // Check that recommendations are sorted by priority (highest first)
            for (let i = 1; i < recommendations.recommendations.length; i++) {
                expect(recommendations.recommendations[i-1].priority)
                    .toBeGreaterThanOrEqual(recommendations.recommendations[i].priority);
            }
        });
    });

    describe('Signal Calculations', () => {
        test('should calculate coverage radius correctly', () => {
            const environmentalFactors = {
                wallMaterial: 'drywall',
                ceilingHeight: 3
            };
            
            const radius = service.calculateCoverageRadius(-70, environmentalFactors);
            expect(radius).toBeGreaterThan(0);
            expect(radius).toBeLessThan(100); // Reasonable range
        });

        test('should apply attenuation factors', () => {
            const drywall = { wallMaterial: 'drywall', ceilingHeight: 3 };
            const concrete = { wallMaterial: 'concrete', ceilingHeight: 3 };
            const metal = { wallMaterial: 'metal', ceilingHeight: 3 };
            
            const drywallAttenuation = service.calculateAttenuationFactor(drywall);
            const concreteAttenuation = service.calculateAttenuationFactor(concrete);
            const metalAttenuation = service.calculateAttenuationFactor(metal);
            
            expect(concreteAttenuation).toBeGreaterThan(drywallAttenuation);
            expect(metalAttenuation).toBeGreaterThan(concreteAttenuation);
        });

        test('should calculate signal quality correctly', () => {
            expect(service.getSignalQuality(-45)).toBe('excellent');
            expect(service.getSignalQuality(-55)).toBe('good');
            expect(service.getSignalQuality(-65)).toBe('fair');
            expect(service.getSignalQuality(-75)).toBe('weak');
            expect(service.getSignalQuality(-85)).toBe('poor');
        });

        test('should calculate optimal channel assignment', () => {
            const existingPlacements = [
                { channel: '1' },
                { channel: '6' }
            ];
            
            const channel = service.calculateOptimalChannel(existingPlacements, { x: 10, y: 10 });
            expect(channel).not.toBe('1');
            expect(channel).not.toBe('6');
            expect(['11', '36', '40', '44', '48']).toContain(channel);
        });

        test('should calculate optimal power settings', () => {
            const power15m = service.calculateOptimalPower(15);
            const power30m = service.calculateOptimalPower(30);
            
            expect(power30m).toBeGreaterThan(power15m);
            expect(power15m).toBeGreaterThanOrEqual(20); // Base power
            expect(power30m).toBeLessThanOrEqual(30); // Max power
        });
    });

    describe('Statistics and Reporting', () => {
        test('should generate service statistics', async () => {
            // Create some test data
            const areaConfig = {
                name: 'Test Area',
                dimensions: { width: 20, height: 20 }
            };
            
            await service.createCoverageArea(areaConfig);
            await service.createBandwidthPolicy({
                name: 'Test Policy',
                description: 'Test policy',
                priority: 'medium'
            });
            
            const stats = service.getStatistics();
            
            expect(stats.coverageAreas.total).toBeGreaterThan(0);
            expect(stats.coverageAreas.avgAccessPoints).toBeGreaterThan(0);
            expect(stats.bandwidthPolicies.total).toBeGreaterThan(0);
            expect(stats.bandwidthPolicies.byPriority).toBeDefined();
            expect(stats.qosTemplates.total).toBeGreaterThan(0);
        });

        test('should group policies by priority', async () => {
            await service.createBandwidthPolicy({
                name: 'High Priority Policy',
                description: 'Test policy',
                priority: 'high'
            });
            
            await service.createBandwidthPolicy({
                name: 'Low Priority Policy',
                description: 'Test policy',
                priority: 'low'
            });
            
            const byPriority = service.getBandwidthPoliciesByPriority();
            expect(byPriority.high).toBeGreaterThan(0);
            expect(byPriority.low).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid area configuration gracefully', async () => {
            const invalidConfigs = [
                {}, // Empty config
                { name: 'Test' }, // Missing dimensions
                { dimensions: { width: 10 } }, // Missing height
                { name: 'Test', dimensions: { width: 10, height: -5 } } // Invalid dimensions
            ];

            for (const config of invalidConfigs) {
                await expect(service.createCoverageArea(config))
                    .rejects.toThrow();
            }
        });

        test('should handle invalid policy configuration gracefully', async () => {
            const invalidConfigs = [
                {}, // Empty config
                { name: 'Test' }, // Missing description
                { name: 'Test', description: 'Test', priority: 'invalid' } // Invalid priority
            ];

            for (const config of invalidConfigs) {
                await expect(service.createBandwidthPolicy(config))
                    .rejects.toThrow();
            }
        });

        test('should handle non-existent resource operations', async () => {
            await expect(service.applyPolicyToCoverage('invalid-area', 'invalid-policy'))
                .rejects.toThrow();
            
            await expect(service.updateBandwidthPolicy('non-existent', {}))
                .rejects.toThrow();
            
            await expect(service.deleteBandwidthPolicy('non-existent'))
                .rejects.toThrow();
        });
    });

    describe('Event Emission', () => {
        test('should emit appropriate events for coverage area operations', async () => {
            const createdSpy = jest.fn();
            const updatedSpy = jest.fn();
            const deletedSpy = jest.fn();
            
            service.on('coverageAreaCreated', createdSpy);
            service.on('coverageAreaUpdated', updatedSpy);
            service.on('coverageAreaDeleted', deletedSpy);
            
            const areaConfig = {
                name: 'Test Area',
                dimensions: { width: 20, height: 20 }
            };
            
            const area = await service.createCoverageArea(areaConfig);
            expect(createdSpy).toHaveBeenCalled();
            
            await service.updateCoverageArea(area.id, { name: 'Updated Area' });
            expect(updatedSpy).toHaveBeenCalled();
            
            await service.deleteCoverageArea(area.id);
            expect(deletedSpy).toHaveBeenCalled();
        });

        test('should emit appropriate events for policy operations', async () => {
            const createdSpy = jest.fn();
            const updatedSpy = jest.fn();
            const deletedSpy = jest.fn();
            const appliedSpy = jest.fn();
            
            service.on('bandwidthPolicyCreated', createdSpy);
            service.on('bandwidthPolicyUpdated', updatedSpy);
            service.on('bandwidthPolicyDeleted', deletedSpy);
            service.on('policyApplied', appliedSpy);
            
            const policy = await service.createBandwidthPolicy({
                name: 'Test Policy',
                description: 'Test policy'
            });
            expect(createdSpy).toHaveBeenCalled();
            
            await service.updateBandwidthPolicy(policy.id, { name: 'Updated Policy' });
            expect(updatedSpy).toHaveBeenCalled();
            
            // Test policy application
            const area = await service.createCoverageArea({
                name: 'Test Area',
                dimensions: { width: 20, height: 20 }
            });
            
            await service.applyPolicyToCoverage(area.id, policy.id);
            expect(appliedSpy).toHaveBeenCalled();
            
            await service.deleteBandwidthPolicy(policy.id);
            expect(deletedSpy).toHaveBeenCalled();
        });
    });
}); 