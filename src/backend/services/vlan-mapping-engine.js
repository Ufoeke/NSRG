/**
 * VLAN Mapping Engine Service
 * 
 * Provides comprehensive VLAN assignment and network segmentation capabilities
 * with dynamic mapping based on user groups, device types, and location-based policies.
 * 
 * Features:
 * - Dynamic VLAN assignment rules
 * - Network topology discovery
 * - Guest network isolation
 * - IoT device segregation
 * - Integration with existing network infrastructure
 */

const EventEmitter = require('events');

class VLANMappingEngine extends EventEmitter {
    constructor() {
        super();
        this.mappingRules = new Map();
        this.networkTopology = new Map();
        this.deviceRegistry = new Map();
        this.userGroups = new Map();
        this.vlanPools = new Map();
        this.assignmentHistory = [];
        this.isInitialized = false;
        
        // Default VLAN configurations
        this.defaultVLANs = {
            management: { id: 1, name: 'Management', description: 'Network management traffic' },
            corporate: { id: 10, name: 'Corporate', description: 'Employee corporate network' },
            guest: { id: 100, name: 'Guest', description: 'Guest network with internet-only access' },
            iot: { id: 200, name: 'IoT', description: 'IoT devices with restricted access' },
            voice: { id: 150, name: 'Voice', description: 'VoIP traffic with QoS priority' },
            dmz: { id: 50, name: 'DMZ', description: 'Demilitarized zone for public services' }
        };
        
        this.initialize();
    }

    async initialize() {
        try {
            await this.loadNetworkTopology();
            await this.loadDefaultMappingRules();
            await this.loadUserGroups();
            await this.loadDeviceProfiles();
            await this.loadVLANPools();
            
            this.isInitialized = true;
            this.emit('initialized', { timestamp: new Date().toISOString() });
            
            console.log('VLAN Mapping Engine initialized successfully');
        } catch (error) {
            console.error('Failed to initialize VLAN Mapping Engine:', error);
            this.emit('error', { error: error.message, timestamp: new Date().toISOString() });
        }
    }

    async loadNetworkTopology() {
        // Discover network topology and available VLANs
        const topology = {
            switches: [
                {
                    id: 'sw-core-01',
                    name: 'Core Switch 1',
                    type: 'core',
                    vlans: [1, 10, 50, 100, 150, 200],
                    ports: 48,
                    location: 'Data Center',
                    management_ip: '192.168.1.10'
                },
                {
                    id: 'sw-access-01',
                    name: 'Access Switch Floor 1',
                    type: 'access',
                    vlans: [1, 10, 100, 200],
                    ports: 24,
                    location: 'Floor 1',
                    management_ip: '192.168.1.20'
                }
            ],
            accessPoints: [
                {
                    id: 'ap-floor1-01',
                    name: 'AP Floor 1 Zone A',
                    switch_id: 'sw-access-01',
                    port: 12,
                    location: 'Floor 1 Zone A',
                    supported_vlans: [10, 100, 200]
                }
            ]
        };

        topology.switches.forEach(sw => {
            this.networkTopology.set(sw.id, sw);
        });

        topology.accessPoints.forEach(ap => {
            this.networkTopology.set(ap.id, ap);
        });

        console.log(`Loaded network topology: ${topology.switches.length} switches, ${topology.accessPoints.length} access points`);
    }

    async loadDefaultMappingRules() {
        const defaultRules = [
            {
                id: 'rule-corporate-employees',
                name: 'Corporate Employee Access',
                priority: 100,
                conditions: {
                    userGroup: ['employees', 'contractors'],
                    deviceType: ['laptop', 'smartphone'],
                    authenticationType: ['certificate', 'domain']
                },
                action: {
                    vlanId: 10,
                    qosPolicy: 'standard',
                    bandwidthLimit: null,
                    internetAccess: true,
                    internalAccess: true
                },
                timeRestrictions: null
            },
            {
                id: 'rule-guest-access',
                name: 'Guest Network Access',
                priority: 50,
                conditions: {
                    userGroup: ['guests'],
                    deviceType: ['any'],
                    authenticationType: ['captive-portal', 'psk']
                },
                action: {
                    vlanId: 100,
                    qosPolicy: 'limited',
                    bandwidthLimit: '50Mbps',
                    internetAccess: true,
                    internalAccess: false
                },
                timeRestrictions: {
                    maxSessionTime: '4 hours',
                    businessHoursOnly: false
                }
            }
        ];

        defaultRules.forEach(rule => {
            this.mappingRules.set(rule.id, rule);
        });

        console.log(`Loaded ${defaultRules.length} default mapping rules`);
    }

    async loadUserGroups() {
        const userGroups = [
            {
                id: 'employees',
                name: 'Employees',
                description: 'Full-time employees',
                defaultVlan: 10,
                permissions: ['internet', 'internal', 'email', 'file-sharing']
            },
            {
                id: 'guests',
                name: 'Guests',
                description: 'Temporary visitors',
                defaultVlan: 100,
                permissions: ['internet'],
                restrictions: ['internal', 'email', 'file-sharing']
            }
        ];

        userGroups.forEach(group => {
            this.userGroups.set(group.id, group);
        });

        console.log(`Loaded ${userGroups.length} user groups`);
    }

    async loadDeviceProfiles() {
        const deviceProfiles = [
            {
                type: 'laptop',
                category: 'endpoint',
                defaultVlan: 10,
                characteristics: {
                    os: ['windows', 'macos', 'linux'],
                    capabilities: ['wifi', 'ethernet'],
                    securityLevel: 'high'
                }
            },
            {
                type: 'iot',
                category: 'iot',
                defaultVlan: 200,
                characteristics: {
                    os: ['embedded', 'linux'],
                    capabilities: ['wifi'],
                    securityLevel: 'low'
                }
            }
        ];

        deviceProfiles.forEach(profile => {
            this.deviceRegistry.set(profile.type, profile);
        });

        console.log(`Loaded ${deviceProfiles.length} device profiles`);
    }

    async loadVLANPools() {
        const vlanPools = [
            {
                name: 'dynamic-corporate',
                range: { start: 20, end: 49 },
                purpose: 'Dynamic corporate assignment',
                available: true
            }
        ];

        vlanPools.forEach(pool => {
            this.vlanPools.set(pool.name, pool);
        });

        console.log(`Loaded ${vlanPools.length} VLAN pools`);
    }

    async assignVLAN(deviceInfo) {
        try {
            if (!this.isInitialized) {
                throw new Error('VLAN Mapping Engine not initialized');
            }

            const assignment = await this.evaluateAssignmentRules(deviceInfo);
            
            // Validate VLAN availability on target access point
            const validationResult = await this.validateVLANAssignment(assignment, deviceInfo);
            
            if (!validationResult.isValid) {
                throw new Error(`VLAN assignment validation failed: ${validationResult.reason}`);
            }

            // Record assignment history
            const assignmentRecord = {
                id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                deviceInfo,
                assignment,
                timestamp: new Date().toISOString(),
                status: 'active'
            };

            this.assignmentHistory.push(assignmentRecord);

            // Emit assignment event
            this.emit('vlan-assigned', {
                device: deviceInfo,
                assignment,
                timestamp: assignmentRecord.timestamp
            });

            console.log(`VLAN assigned: Device ${deviceInfo.macAddress} -> VLAN ${assignment.vlanId}`);
            
            return {
                success: true,
                assignment,
                assignmentId: assignmentRecord.id
            };

        } catch (error) {
            console.error('VLAN assignment failed:', error);
            this.emit('assignment-error', {
                device: deviceInfo,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async evaluateAssignmentRules(deviceInfo) {
        const applicableRules = [];

        // Find all rules that match device criteria
        for (const [ruleId, rule] of this.mappingRules) {
            if (await this.evaluateRuleConditions(rule.conditions, deviceInfo)) {
                applicableRules.push({ ruleId, rule });
            }
        }

        if (applicableRules.length === 0) {
            // Use default assignment based on device type
            const deviceProfile = this.deviceRegistry.get(deviceInfo.deviceType) || 
                                 this.deviceRegistry.get('iot'); // Default to IoT VLAN
            
            return {
                vlanId: deviceProfile.defaultVlan,
                rule: 'default',
                qosPolicy: 'standard',
                bandwidthLimit: null,
                internetAccess: true,
                internalAccess: false
            };
        }

        // Sort by priority (highest first) and return the best match
        applicableRules.sort((a, b) => b.rule.priority - a.rule.priority);
        const selectedRule = applicableRules[0];

        return {
            vlanId: selectedRule.rule.action.vlanId,
            rule: selectedRule.ruleId,
            qosPolicy: selectedRule.rule.action.qosPolicy,
            bandwidthLimit: selectedRule.rule.action.bandwidthLimit,
            internetAccess: selectedRule.rule.action.internetAccess,
            internalAccess: selectedRule.rule.action.internalAccess,
            timeRestrictions: selectedRule.rule.timeRestrictions
        };
    }

    async evaluateRuleConditions(conditions, deviceInfo) {
        // Check user group condition
        if (conditions.userGroup && conditions.userGroup.length > 0) {
            if (!deviceInfo.userGroup || !conditions.userGroup.includes(deviceInfo.userGroup)) {
                return false;
            }
        }

        // Check device type condition
        if (conditions.deviceType && conditions.deviceType.length > 0) {
            if (!conditions.deviceType.includes('any') && 
                (!deviceInfo.deviceType || !conditions.deviceType.includes(deviceInfo.deviceType))) {
                return false;
            }
        }

        return true;
    }

    async validateVLANAssignment(assignment, deviceInfo) {
        try {
            // Check if VLAN exists in network topology
            const vlanExists = this.checkVLANExists(assignment.vlanId);
            if (!vlanExists) {
                return {
                    isValid: false,
                    reason: `VLAN ${assignment.vlanId} does not exist in network topology`
                };
            }

            return { isValid: true };

        } catch (error) {
            return {
                isValid: false,
                reason: `Validation error: ${error.message}`
            };
        }
    }

    checkVLANExists(vlanId) {
        // Check if VLAN exists on any switch in the topology
        for (const [deviceId, device] of this.networkTopology) {
            if (device.type === 'core' || device.type === 'access') {
                if (device.vlans && device.vlans.includes(vlanId)) {
                    return true;
                }
            }
        }
        return false;
    }

    async getNetworkTopology() {
        const topology = {
            switches: [],
            accessPoints: [],
            vlans: Object.values(this.defaultVLANs)
        };

        for (const [deviceId, device] of this.networkTopology) {
            if (device.type === 'core' || device.type === 'access') {
                topology.switches.push(device);
            } else if (device.id && device.id.startsWith('ap-')) {
                topology.accessPoints.push(device);
            }
        }

        return topology;
    }

    async getAssignmentHistory(filters = {}) {
        let history = [...this.assignmentHistory];

        // Apply filters
        if (filters.vlanId) {
            history = history.filter(record => record.assignment.vlanId == filters.vlanId);
        }

        if (filters.deviceType) {
            history = history.filter(record => record.deviceInfo.deviceType === filters.deviceType);
        }

        if (filters.status) {
            history = history.filter(record => record.status === filters.status);
        }

        if (filters.startDate) {
            history = history.filter(record => new Date(record.timestamp) >= new Date(filters.startDate));
        }

        if (filters.endDate) {
            history = history.filter(record => new Date(record.timestamp) <= new Date(filters.endDate));
        }

        // Sort by timestamp (newest first)
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
            total: history.length,
            assignments: history.slice(0, filters.limit || 100)
        };
    }

    async revokeVLANAssignment(assignmentId) {
        try {
            const assignmentIndex = this.assignmentHistory.findIndex(
                record => record.id === assignmentId
            );

            if (assignmentIndex === -1) {
                throw new Error(`Assignment with ID ${assignmentId} not found`);
            }

            const assignment = this.assignmentHistory[assignmentIndex];
            assignment.status = 'revoked';
            assignment.revokedAt = new Date().toISOString();

            this.emit('assignment-revoked', {
                assignmentId,
                device: assignment.deviceInfo,
                timestamp: assignment.revokedAt
            });

            console.log(`Revoked VLAN assignment: ${assignmentId}`);
            
            return {
                success: true,
                assignmentId
            };

        } catch (error) {
            console.error('Failed to revoke VLAN assignment:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getVLANStatistics() {
        const stats = {
            totalAssignments: this.assignmentHistory.length,
            activeAssignments: this.assignmentHistory.filter(r => r.status === 'active').length,
            vlanDistribution: {},
            deviceTypeDistribution: {},
            userGroupDistribution: {},
            recentActivity: []
        };

        // Calculate VLAN distribution
        this.assignmentHistory.forEach(record => {
            if (record.status === 'active') {
                const vlanId = record.assignment.vlanId;
                stats.vlanDistribution[vlanId] = (stats.vlanDistribution[vlanId] || 0) + 1;
            }
        });

        // Calculate device type distribution
        this.assignmentHistory.forEach(record => {
            if (record.status === 'active') {
                const deviceType = record.deviceInfo.deviceType || 'unknown';
                stats.deviceTypeDistribution[deviceType] = (stats.deviceTypeDistribution[deviceType] || 0) + 1;
            }
        });

        // Calculate user group distribution
        this.assignmentHistory.forEach(record => {
            if (record.status === 'active') {
                const userGroup = record.deviceInfo.userGroup || 'unknown';
                stats.userGroupDistribution[userGroup] = (stats.userGroupDistribution[userGroup] || 0) + 1;
            }
        });

        // Get recent activity (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        stats.recentActivity = this.assignmentHistory
            .filter(record => new Date(record.timestamp) > oneDayAgo)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);

        return stats;
    }

    getMappingRules() {
        return Array.from(this.mappingRules.values());
    }

    getUserGroups() {
        return Array.from(this.userGroups.values());
    }

    getDeviceProfiles() {
        return Array.from(this.deviceRegistry.values());
    }

    getDefaultVLANs() {
        return Object.values(this.defaultVLANs);
    }

    isReady() {
        return this.isInitialized;
    }
}

module.exports = VLANMappingEngine; 