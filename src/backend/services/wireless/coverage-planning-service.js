/**
 * Coverage Planning and Bandwidth Policy Engine
 * Advanced wireless network planning with RF coverage analysis, bandwidth management,
 * and QoS policy enforcement for enterprise wireless deployments
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class CoveragePlanningService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // RF Planning Parameters
            defaultFrequency: '5GHz',
            signalThreshold: -70, // dBm
            overlapPercentage: 15, // Minimum overlap between APs
            wallAttenuationFactor: 6, // dB loss per wall
            floorAttenuationFactor: 15, // dB loss per floor
            
            // Coverage Planning
            minSignalStrength: -75, // dBm
            maxSignalStrength: -30, // dBm
            optimalSignalStrength: -50, // dBm
            
            // Capacity Planning
            usersPerAP: 25,
            bandwidthPerUser: 5, // Mbps
            peakUsageMultiplier: 2.5,
            
            // Heat Map Resolution
            gridResolution: 1, // meters
            
            ...config
        };

        // Storage for coverage areas and policies
        this.coverageAreas = new Map();
        this.accessPointPlacements = new Map();
        this.bandwidthPolicies = new Map();
        this.qosTemplates = new Map();
        this.heatMapCache = new Map();
        this.loadBalancingRules = [];
        
        // Initialize default configurations
        this.initializeDefaultPolicies();
        this.initializeQoSTemplates();
        this.initializeLoadBalancingRules();
    }

    /**
     * Initialize default bandwidth policies
     */
    initializeDefaultPolicies() {
        const defaultPolicies = [
            {
                id: 'exec-policy',
                name: 'Executive Policy',
                description: 'Unlimited bandwidth with highest priority',
                downloadLimit: 'unlimited',
                uploadLimit: 'unlimited',
                priority: 'critical',
                qosClass: 'platinum',
                userGroups: ['executives', 'c-level'],
                trafficShaping: { enabled: false, burstAllowance: 'unlimited' },
                applicationControl: {
                    enabled: true,
                    allowedCategories: ['business', 'productivity', 'communication'],
                    blockedCategories: ['entertainment', 'social-media', 'streaming']
                },
                timeRestrictions: { enabled: false },
                createdAt: new Date(),
                isDefault: true,
                isActive: true
            },
            {
                id: 'corp-policy',
                name: 'Corporate Policy',
                description: 'Standard corporate access with moderate limits',
                downloadLimit: 100, // Mbps
                uploadLimit: 50, // Mbps
                priority: 'high',
                qosClass: 'gold',
                userGroups: ['employees', 'staff'],
                trafficShaping: {
                    enabled: true,
                    burstAllowance: '150Mbps',
                    sustainedRate: '100Mbps'
                },
                applicationControl: {
                    enabled: true,
                    allowedCategories: ['business', 'productivity', 'communication', 'research'],
                    blockedCategories: ['gaming', 'p2p']
                },
                timeRestrictions: { enabled: false },
                createdAt: new Date(),
                isDefault: true,
                isActive: true
            },
            {
                id: 'guest-policy',
                name: 'Guest Access Policy',
                description: 'Limited guest access with content filtering',
                downloadLimit: 25, // Mbps
                uploadLimit: 10, // Mbps
                priority: 'low',
                qosClass: 'bronze',
                userGroups: ['guests', 'visitors'],
                trafficShaping: {
                    enabled: true,
                    burstAllowance: '50Mbps',
                    sustainedRate: '25Mbps'
                },
                applicationControl: {
                    enabled: true,
                    allowedCategories: ['web-browsing', 'email'],
                    blockedCategories: ['streaming', 'gaming', 'p2p', 'social-media']
                },
                timeRestrictions: {
                    enabled: true,
                    allowedHours: {
                        monday: ['08:00', '18:00'],
                        tuesday: ['08:00', '18:00'],
                        wednesday: ['08:00', '18:00'],
                        thursday: ['08:00', '18:00'],
                        friday: ['08:00', '18:00'],
                        saturday: ['10:00', '16:00'],
                        sunday: ['10:00', '16:00']
                    }
                },
                createdAt: new Date(),
                isDefault: true,
                isActive: true
            }
        ];

        defaultPolicies.forEach(policy => {
            this.bandwidthPolicies.set(policy.id, policy);
        });
    }

    /**
     * Initialize QoS templates
     */
    initializeQoSTemplates() {
        const qosTemplates = [
            {
                id: 'voice-qos',
                name: 'Voice Optimized',
                description: 'Optimized for VoIP and video conferencing',
                dscp: 46, // EF (Expedited Forwarding)
                priority: 7,
                bandwidthAllocation: {
                    guaranteed: '128kbps',
                    maximum: '1Mbps'
                },
                latencyTarget: '10ms',
                jitterTarget: '5ms',
                packetLoss: '0.1%',
                queueing: {
                    algorithm: 'priority',
                    weight: 100
                },
                createdAt: new Date(),
                isDefault: true
            },
            {
                id: 'video-qos',
                name: 'Video Conferencing',
                description: 'Optimized for video conferencing and streaming',
                dscp: 34, // AF41
                priority: 6,
                bandwidthAllocation: {
                    guaranteed: '2Mbps',
                    maximum: '10Mbps'
                },
                latencyTarget: '50ms',
                jitterTarget: '10ms',
                packetLoss: '0.5%',
                queueing: {
                    algorithm: 'weighted-fair',
                    weight: 80
                },
                createdAt: new Date(),
                isDefault: true
            }
        ];

        qosTemplates.forEach(template => {
            this.qosTemplates.set(template.id, template);
        });
    }

    /**
     * Initialize load balancing rules
     */
    initializeLoadBalancingRules() {
        this.loadBalancingRules = [
            {
                id: 'user-count-balancing',
                name: 'User Count Balancing',
                type: 'user-count',
                enabled: true,
                threshold: 20,
                action: 'redistribute',
                weight: 0.4
            },
            {
                id: 'bandwidth-utilization',
                name: 'Bandwidth Utilization',
                type: 'bandwidth',
                enabled: true,
                threshold: 80, // percentage
                action: 'throttle-new-connections',
                weight: 0.3
            }
        ];
    }

    /**
     * Create coverage area plan
     */
    async createCoverageArea(areaConfig) {
        const validation = this.validateAreaConfig(areaConfig);
        if (!validation.isValid) {
            throw new Error(`Invalid area configuration: ${validation.errors.join(', ')}`);
        }

        const areaId = areaConfig.id || uuidv4();
        const coverageArea = {
            id: areaId,
            name: areaConfig.name,
            location: areaConfig.location,
            dimensions: areaConfig.dimensions,
            floorPlan: areaConfig.floorPlan || null,
            userDensity: areaConfig.userDensity || 25,
            signalRequirements: areaConfig.signalRequirements || {
                minSignalStrength: this.config.minSignalStrength,
                coverage: 95, // percentage
                overlap: this.config.overlapPercentage
            },
            environmentalFactors: areaConfig.environmentalFactors || {
                wallMaterial: 'drywall',
                ceilingHeight: 3, // meters
                obstructions: []
            },
            accessPoints: [],
            heatMap: null,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Calculate optimal access point placement
        const apPlacements = await this.calculateAccessPointPlacement(coverageArea);
        coverageArea.accessPoints = apPlacements;

        // Generate coverage heat map
        const heatMap = await this.generateCoverageHeatMap(coverageArea);
        coverageArea.heatMap = heatMap;

        this.coverageAreas.set(areaId, coverageArea);

        this.emit('coverageAreaCreated', {
            areaId,
            area: coverageArea
        });

        return coverageArea;
    }

    /**
     * Calculate optimal access point placement
     */
    async calculateAccessPointPlacement(coverageArea) {
        const { dimensions, userDensity, signalRequirements } = coverageArea;
        const placements = [];

        // Calculate coverage radius based on signal requirements
        const coverageRadius = this.calculateCoverageRadius(
            signalRequirements.minSignalStrength,
            coverageArea.environmentalFactors
        );

        // Calculate number of APs needed
        const areaSize = dimensions.width * dimensions.height;
        const apCoverageArea = Math.PI * Math.pow(coverageRadius, 2);
        const requiredAPs = Math.ceil(areaSize / (apCoverageArea * (1 - signalRequirements.overlap / 100)));

        // Calculate grid placement
        const gridSpacing = Math.sqrt(areaSize / requiredAPs);
        const cols = Math.ceil(dimensions.width / gridSpacing);
        const rows = Math.ceil(dimensions.height / gridSpacing);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = (col + 0.5) * (dimensions.width / cols);
                const y = (row + 0.5) * (dimensions.height / rows);

                const placement = {
                    id: `ap-${coverageArea.id}-${row}-${col}`,
                    position: { x, y, z: 3 }, // 3m ceiling height
                    expectedSignalStrength: this.calculateExpectedSignal(
                        { x, y },
                        coverageRadius,
                        coverageArea.environmentalFactors
                    ),
                    coverageRadius: coverageRadius,
                    expectedUsers: Math.ceil(userDensity / requiredAPs),
                    frequency: this.config.defaultFrequency,
                    channel: this.calculateOptimalChannel(placements, { x, y }),
                    power: this.calculateOptimalPower(coverageRadius)
                };

                placements.push(placement);
            }
        }

        return placements;
    }

    /**
     * Generate coverage heat map
     */
    async generateCoverageHeatMap(coverageArea) {
        const { dimensions } = coverageArea;
        const resolution = this.config.gridResolution;
        const heatMap = {
            width: dimensions.width,
            height: dimensions.height,
            resolution: resolution,
            data: [],
            timestamp: new Date()
        };

        const gridWidth = Math.ceil(dimensions.width / resolution);
        const gridHeight = Math.ceil(dimensions.height / resolution);

        for (let y = 0; y < gridHeight; y++) {
            const row = [];
            for (let x = 0; x < gridWidth; x++) {
                const position = {
                    x: x * resolution,
                    y: y * resolution
                };

                const signalStrength = this.calculateSignalStrengthAtPoint(
                    position,
                    coverageArea.accessPoints,
                    coverageArea.environmentalFactors
                );

                row.push({
                    x: position.x,
                    y: position.y,
                    signalStrength: signalStrength,
                    quality: this.getSignalQuality(signalStrength),
                    apContributions: this.getAPContributions(position, coverageArea.accessPoints)
                });
            }
            heatMap.data.push(row);
        }

        return heatMap;
    }

    /**
     * Create bandwidth policy
     */
    async createBandwidthPolicy(policyConfig) {
        const validation = this.validatePolicyConfig(policyConfig);
        if (!validation.isValid) {
            throw new Error(`Invalid policy configuration: ${validation.errors.join(', ')}`);
        }

        const policyId = policyConfig.id || uuidv4();
        const policy = {
            id: policyId,
            name: policyConfig.name,
            description: policyConfig.description,
            downloadLimit: policyConfig.downloadLimit,
            uploadLimit: policyConfig.uploadLimit,
            priority: policyConfig.priority || 'medium',
            qosClass: policyConfig.qosClass || 'standard',
            userGroups: policyConfig.userGroups || [],
            deviceTypes: policyConfig.deviceTypes || [],
            trafficShaping: policyConfig.trafficShaping || { enabled: false },
            applicationControl: policyConfig.applicationControl || { enabled: false },
            timeRestrictions: policyConfig.timeRestrictions || { enabled: false },
            isDefault: false,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.bandwidthPolicies.set(policyId, policy);

        this.emit('bandwidthPolicyCreated', {
            policyId,
            policy
        });

        return policy;
    }

    /**
     * Apply bandwidth policy to coverage area
     */
    async applyPolicyToCoverage(areaId, policyId) {
        const area = this.coverageAreas.get(areaId);
        const policy = this.bandwidthPolicies.get(policyId);

        if (!area) {
            throw new Error(`Coverage area with ID ${areaId} not found`);
        }

        if (!policy) {
            throw new Error(`Bandwidth policy with ID ${policyId} not found`);
        }

        area.appliedPolicies = area.appliedPolicies || [];
        area.appliedPolicies.push(policyId);
        area.updatedAt = new Date();

        this.coverageAreas.set(areaId, area);

        this.emit('policyApplied', {
            areaId,
            policyId,
            area,
            policy
        });

        return { area, policy };
    }

    /**
     * Generate load balancing recommendations
     */
    async generateLoadBalancingRecommendations(areaId) {
        const area = this.coverageAreas.get(areaId);
        if (!area) {
            throw new Error(`Coverage area with ID ${areaId} not found`);
        }

        const recommendations = [];

        // Analyze current load distribution
        const loadAnalysis = this.analyzeCurrentLoad(area);

        // Apply load balancing rules
        for (const rule of this.loadBalancingRules) {
            if (!rule.enabled) continue;

            const ruleRecommendations = this.applyLoadBalancingRule(rule, loadAnalysis);
            recommendations.push(...ruleRecommendations);
        }

        return {
            areaId,
            timestamp: new Date(),
            currentLoad: loadAnalysis,
            recommendations: recommendations.sort((a, b) => b.priority - a.priority)
        };
    }

    /**
     * Helper methods
     */
    calculateCoverageRadius(minSignalStrength, environmentalFactors) {
        // Simplified path loss calculation
        const txPower = 20; // dBm
        const pathLoss = txPower - Math.abs(minSignalStrength); // Ensure positive path loss
        
        // Use more realistic formula for indoor environments
        // Formula: R = 10^((TxPower - RxPower - 40.05 - 20*log10(f)) / 20)
        // Where f = 2.4 GHz, simplified to reasonable indoor range
        const frequency = 2400; // MHz
        const logDistance = (pathLoss - 40.05 - 20 * Math.log10(frequency)) / 20;
        let radius = Math.pow(10, logDistance);
        
        // Cap radius for indoor environments (max 50m)
        radius = Math.min(radius, 50);
        
        // Apply environmental attenuation
        const attenuationFactor = this.calculateAttenuationFactor(environmentalFactors);
        const finalRadius = radius / attenuationFactor;
        
        // Ensure minimum and maximum reasonable values
        return Math.max(1, Math.min(finalRadius, 50));
    }

    calculateAttenuationFactor(environmentalFactors) {
        let attenuation = 1;
        
        // Wall attenuation
        if (environmentalFactors.wallMaterial === 'concrete') {
            attenuation *= 2;
        } else if (environmentalFactors.wallMaterial === 'metal') {
            attenuation *= 3;
        }
        
        // Ceiling height factor
        if (environmentalFactors.ceilingHeight > 4) {
            attenuation *= 1.2;
        }
        
        return attenuation;
    }

    calculateExpectedSignal(position, coverageRadius, environmentalFactors) {
        const distance = Math.max(0.1, Math.sqrt(Math.pow(position.x, 2) + Math.pow(position.y, 2))); // Minimum 0.1m distance
        
        // Free space path loss formula for 2.4GHz
        const frequency = 2400; // MHz
        const pathLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequency) - 27.55;
        const environmentalLoss = this.calculateEnvironmentalLoss(distance, environmentalFactors);
        
        const signalStrength = 20 - pathLoss - environmentalLoss; // 20dBm TX power
        
        // Ensure signal strength is reasonable (between -100 and 0 dBm)
        return Math.max(-100, Math.min(0, signalStrength));
    }

    calculateEnvironmentalLoss(distance, environmentalFactors) {
        let loss = 0;
        
        // Add wall losses based on distance
        const estimatedWalls = Math.floor(distance / 5); // Assume wall every 5m
        loss += estimatedWalls * this.config.wallAttenuationFactor;
        
        return loss;
    }

    calculateOptimalChannel(existingPlacements, position) {
        // Simplified channel assignment - avoid co-channel interference
        const channels = ['1', '6', '11', '36', '40', '44', '48'];
        const usedChannels = existingPlacements.map(ap => ap.channel);
        
        return channels.find(channel => !usedChannels.includes(channel)) || channels[0];
    }

    calculateOptimalPower(coverageRadius) {
        // Calculate power based on desired coverage radius
        const basePower = 20; // dBm
        const adjustment = Math.max(0, Math.log10(coverageRadius / 15) * 10);
        return Math.min(30, basePower + adjustment); // Max 30dBm
    }

    calculateSignalStrengthAtPoint(position, accessPoints, environmentalFactors) {
        let maxSignalStrength = -100; // Start with very weak signal
        
        accessPoints.forEach(ap => {
            const distance = Math.max(0.1, Math.sqrt(
                Math.pow(position.x - ap.position.x, 2) + 
                Math.pow(position.y - ap.position.y, 2)
            ));
            
            // Calculate signal strength using proper path loss formula
            const frequency = 2400; // MHz
            const pathLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequency) - 27.55;
            const environmentalLoss = this.calculateEnvironmentalLoss(distance, environmentalFactors);
            
            const signalStrength = (ap.power || 20) - pathLoss - environmentalLoss;
            const clampedSignal = Math.max(-100, Math.min(0, signalStrength));
            
            maxSignalStrength = Math.max(maxSignalStrength, clampedSignal);
        });
        
        return maxSignalStrength;
    }

    getSignalQuality(signalStrength) {
        if (signalStrength >= -50) return 'excellent';
        if (signalStrength >= -60) return 'good';
        if (signalStrength >= -70) return 'fair';
        if (signalStrength >= -80) return 'weak';
        return 'poor';
    }

    getAPContributions(position, accessPoints) {
        return accessPoints.map(ap => {
            const distance = Math.max(0.1, Math.sqrt(
                Math.pow(position.x - ap.position.x, 2) + 
                Math.pow(position.y - ap.position.y, 2)
            ));
            
            return {
                apId: ap.id,
                distance: distance,
                signalContribution: Math.max(-100, (ap.power || 20) - (20 * Math.log10(distance)))
            };
        }).sort((a, b) => b.signalContribution - a.signalContribution);
    }

    analyzeCurrentLoad(area) {
        // Simulate current load analysis
        return {
            totalUsers: area.userDensity,
            avgUsersPerAP: area.userDensity / area.accessPoints.length,
            bandwidthUtilization: Math.random() * 80 + 10, // 10-90%
            peakLoadTime: '14:00',
            loadDistribution: area.accessPoints.map(ap => ({
                apId: ap.id,
                userCount: ap.expectedUsers,
                bandwidthUsage: Math.random() * 100,
                signalQuality: 'good'
            }))
        };
    }

    applyLoadBalancingRule(rule, loadAnalysis) {
        const recommendations = [];
        
        switch (rule.type) {
            case 'user-count':
                loadAnalysis.loadDistribution.forEach(ap => {
                    if (ap.userCount > rule.threshold) {
                        recommendations.push({
                            type: 'redistribute-users',
                            apId: ap.apId,
                            priority: rule.weight * 100,
                            description: `AP ${ap.apId} has ${ap.userCount} users, exceeding threshold of ${rule.threshold}`,
                            action: 'Consider load balancing or adding additional AP'
                        });
                    }
                });
                break;
                
            case 'bandwidth':
                loadAnalysis.loadDistribution.forEach(ap => {
                    if (ap.bandwidthUsage > rule.threshold) {
                        recommendations.push({
                            type: 'bandwidth-management',
                            apId: ap.apId,
                            priority: rule.weight * 100,
                            description: `AP ${ap.apId} bandwidth utilization at ${ap.bandwidthUsage.toFixed(1)}%`,
                            action: 'Apply traffic shaping or increase bandwidth allocation'
                        });
                    }
                });
                break;
        }
        
        return recommendations;
    }

    validateAreaConfig(config) {
        const errors = [];
        
        if (!config.name) errors.push('Area name is required');
        
        if (!config.dimensions || !config.dimensions.width || !config.dimensions.height) {
            errors.push('Area dimensions (width, height) are required');
        } else {
            if (config.dimensions.width <= 0) {
                errors.push('Area width must be positive');
            }
            if (config.dimensions.height <= 0) {
                errors.push('Area height must be positive');
            }
        }
        
        if (config.userDensity && config.userDensity < 0) {
            errors.push('User density must be positive');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    validatePolicyConfig(config) {
        const errors = [];
        
        if (!config.name) errors.push('Policy name is required');
        if (!config.description) errors.push('Policy description is required');
        
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (config.priority && !validPriorities.includes(config.priority)) {
            errors.push('Priority must be one of: low, medium, high, critical');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Public API methods
    getCoverageAreas() {
        return Array.from(this.coverageAreas.values());
    }

    getCoverageArea(id) {
        return this.coverageAreas.get(id);
    }

    getBandwidthPolicies() {
        return Array.from(this.bandwidthPolicies.values());
    }

    getBandwidthPolicy(id) {
        return this.bandwidthPolicies.get(id);
    }

    getQoSTemplates() {
        return Array.from(this.qosTemplates.values());
    }

    async updateCoverageArea(id, updates) {
        const area = this.coverageAreas.get(id);
        if (!area) {
            throw new Error(`Coverage area with ID ${id} not found`);
        }

        Object.assign(area, updates, { updatedAt: new Date() });
        this.coverageAreas.set(id, area);

        this.emit('coverageAreaUpdated', { areaId: id, area, updates });
        return area;
    }

    async deleteCoverageArea(id) {
        const area = this.coverageAreas.get(id);
        if (!area) {
            throw new Error(`Coverage area with ID ${id} not found`);
        }

        this.coverageAreas.delete(id);
        this.heatMapCache.delete(id);

        this.emit('coverageAreaDeleted', { areaId: id, area });
        return true;
    }

    async updateBandwidthPolicy(id, updates) {
        const policy = this.bandwidthPolicies.get(id);
        if (!policy) {
            throw new Error(`Bandwidth policy with ID ${id} not found`);
        }

        Object.assign(policy, updates, { updatedAt: new Date() });
        this.bandwidthPolicies.set(id, policy);

        this.emit('bandwidthPolicyUpdated', { policyId: id, policy, updates });
        return policy;
    }

    async deleteBandwidthPolicy(id) {
        const policy = this.bandwidthPolicies.get(id);
        if (!policy) {
            throw new Error(`Bandwidth policy with ID ${id} not found`);
        }

        if (policy.isDefault) {
            throw new Error('Cannot delete default policy');
        }

        this.bandwidthPolicies.delete(id);

        this.emit('bandwidthPolicyDeleted', { policyId: id, policy });
        return true;
    }

    getStatistics() {
        return {
            coverageAreas: {
                total: this.coverageAreas.size,
                avgAccessPoints: this.getCoverageAreas().reduce((sum, area) => sum + area.accessPoints.length, 0) / this.coverageAreas.size || 0
            },
            bandwidthPolicies: {
                total: this.bandwidthPolicies.size,
                byPriority: this.getBandwidthPoliciesByPriority()
            },
            qosTemplates: {
                total: this.qosTemplates.size
            }
        };
    }

    getBandwidthPoliciesByPriority() {
        const policies = this.getBandwidthPolicies();
        return policies.reduce((acc, policy) => {
            acc[policy.priority] = (acc[policy.priority] || 0) + 1;
            return acc;
        }, {});
    }
}

module.exports = CoveragePlanningService; 