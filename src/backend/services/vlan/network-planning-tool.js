const IPSubnetCalculator = require('./ip-subnet-calculator');
const VLANSuggestionEngine = require('./vlan-suggestion-engine');

class NetworkPlanningTool {
    constructor() {
        this.subnetCalculator = new IPSubnetCalculator();
        this.suggestionEngine = new VLANSuggestionEngine();
        this.commonNetworkPatterns = {
            'small-office': {
                description: 'Small office (1-50 users)',
                subnets: [
                    { name: 'Management', hosts: 10, vlanStart: 10 },
                    { name: 'Users', hosts: 50, vlanStart: 100 },
                    { name: 'Servers', hosts: 10, vlanStart: 200 },
                    { name: 'Guest', hosts: 20, vlanStart: 300 }
                ]
            },
            'medium-office': {
                description: 'Medium office (50-200 users)',
                subnets: [
                    { name: 'Management', hosts: 20, vlanStart: 10 },
                    { name: 'IT-Staff', hosts: 30, vlanStart: 50 },
                    { name: 'HR-Department', hosts: 40, vlanStart: 100 },
                    { name: 'Finance-Department', hosts: 50, vlanStart: 150 },
                    { name: 'Operations', hosts: 100, vlanStart: 200 },
                    { name: 'Servers', hosts: 30, vlanStart: 500 },
                    { name: 'DMZ', hosts: 10, vlanStart: 600 },
                    { name: 'Guest', hosts: 50, vlanStart: 700 }
                ]
            },
            'enterprise': {
                description: 'Enterprise (200+ users)',
                subnets: [
                    { name: 'Management', hosts: 50, vlanStart: 10 },
                    { name: 'IT-Infrastructure', hosts: 100, vlanStart: 50 },
                    { name: 'Executive', hosts: 30, vlanStart: 90 },
                    { name: 'HR-Department', hosts: 80, vlanStart: 100 },
                    { name: 'Finance-Department', hosts: 120, vlanStart: 150 },
                    { name: 'Sales-Department', hosts: 200, vlanStart: 200 },
                    { name: 'Operations', hosts: 300, vlanStart: 300 },
                    { name: 'Development', hosts: 150, vlanStart: 400 },
                    { name: 'Production-Servers', hosts: 100, vlanStart: 500 },
                    { name: 'Test-Servers', hosts: 50, vlanStart: 550 },
                    { name: 'DMZ', hosts: 50, vlanStart: 600 },
                    { name: 'Guest', hosts: 100, vlanStart: 700 },
                    { name: 'IoT-Devices', hosts: 200, vlanStart: 800 }
                ]
            }
        };
    }

    /**
     * Generate comprehensive network plan based on requirements
     * @param {Object} requirements - Network planning requirements
     * @returns {Object} Complete network plan
     */
    generateNetworkPlan(requirements) {
        const {
            organizationName,
            totalUsers,
            departments = [],
            pattern = null,
            parentNetwork = '10.0.0.0/16',
            includeRedundancy = true,
            securityLevel = 'medium',
            growthFactor = 1.5,
            customSubnets = []
        } = requirements;

        // Start with pattern-based or custom requirements
        let subnets = [];
        
        if (pattern && this.commonNetworkPatterns[pattern]) {
            subnets = [...this.commonNetworkPatterns[pattern].subnets];
        } else if (departments.length > 0) {
            subnets = this._generateDepartmentSubnets(departments, totalUsers);
        } else if (customSubnets.length > 0) {
            subnets = [...customSubnets];
        } else {
            // Auto-detect pattern based on user count
            const detectedPattern = this._detectPattern(totalUsers);
            subnets = [...this.commonNetworkPatterns[detectedPattern].subnets];
        }

        // Apply growth factor
        subnets = subnets.map(subnet => ({
            ...subnet,
            hostsNeeded: Math.ceil(subnet.hosts * growthFactor)
        }));

        // Generate subnet allocation
        const allocation = this.subnetCalculator.optimizeSubnetAllocation(subnets, parentNetwork);
        
        // Generate VLAN assignments
        const vlanPlan = this._generateVLANPlan(allocation.allocations, securityLevel);
        
        // Generate DHCP scopes if requested
        const dhcpPlan = this._generateDHCPPlan(allocation.allocations);
        
        // Generate security recommendations
        const securityPlan = this._generateSecurityPlan(vlanPlan, securityLevel);
        
        // Generate implementation timeline
        const implementationPlan = this._generateImplementationPlan(vlanPlan, securityLevel);

        return {
            metadata: {
                organizationName,
                totalUsers,
                pattern: pattern || this._detectPattern(totalUsers),
                parentNetwork,
                growthFactor,
                securityLevel,
                generatedAt: new Date().toISOString()
            },
            summary: {
                totalSubnets: allocation.allocations.length,
                totalVLANs: vlanPlan.length,
                ipUtilization: this._calculateIPUtilization(allocation),
                estimatedCost: this._estimateImplementationCost(vlanPlan)
            },
            allocation: allocation,
            vlanPlan: vlanPlan,
            dhcpPlan: dhcpPlan,
            securityPlan: securityPlan,
            implementationPlan: implementationPlan,
            documentation: this._generateDocumentation(allocation.allocations, vlanPlan)
        };
    }

    /**
     * Analyze existing network and suggest improvements
     * @param {Object} existingNetwork - Current network configuration
     * @returns {Object} Analysis and improvement suggestions
     */
    analyzeExistingNetwork(existingNetwork) {
        const {
            subnets = [],
            vlans = [],
            utilization = {},
            issues = []
        } = existingNetwork;

        const analysis = {
            overview: {
                totalSubnets: subnets.length,
                totalVLANs: vlans.length,
                averageUtilization: this._calculateAverageUtilization(utilization)
            },
            issues: [],
            improvements: [],
            recommendations: []
        };

        // Analyze subnet overlaps
        for (let i = 0; i < subnets.length; i++) {
            for (let j = i + 1; j < subnets.length; j++) {
                const overlap = this.subnetCalculator.detectOverlap(subnets[i].cidr, subnets[j].cidr);
                if (overlap.overlaps) {
                    analysis.issues.push({
                        type: 'subnet_overlap',
                        severity: 'critical',
                        description: `Subnet overlap detected between ${overlap.subnet1} and ${overlap.subnet2}`,
                        relationship: overlap.relationship
                    });
                }
            }
        }

        // Analyze VLAN utilization
        vlans.forEach(vlan => {
            const util = utilization[vlan.id] || { used: 0, total: 0 };
            const utilizationPercent = util.total > 0 ? (util.used / util.total) * 100 : 0;
            
            if (utilizationPercent > 90) {
                analysis.issues.push({
                    type: 'high_utilization',
                    severity: 'warning',
                    description: `VLAN ${vlan.id} (${vlan.name}) is ${utilizationPercent.toFixed(1)}% utilized`,
                    vlanId: vlan.id
                });
            } else if (utilizationPercent < 10 && util.total > 50) {
                analysis.improvements.push({
                    type: 'underutilized_subnet',
                    description: `VLAN ${vlan.id} (${vlan.name}) is only ${utilizationPercent.toFixed(1)}% utilized - consider consolidation`,
                    vlanId: vlan.id,
                    potentialSavings: util.total - util.used
                });
            }
        });

        // Generate recommendations
        analysis.recommendations = this._generateNetworkRecommendations(analysis);

        return analysis;
    }

    /**
     * Calculate network capacity requirements
     * @param {Object} requirements - Capacity requirements
     * @returns {Object} Capacity analysis
     */
    calculateCapacityRequirements(requirements) {
        const {
            currentUsers,
            projectedGrowth = 0.2, // 20% growth
            timeHorizon = 3, // 3 years
            peakUsageFactor = 1.3,
            deviceMultiplier = 2.5 // Average devices per user
        } = requirements;

        const projectedUsers = Math.ceil(currentUsers * Math.pow(1 + projectedGrowth, timeHorizon));
        const totalDevices = Math.ceil(projectedUsers * deviceMultiplier);
        const peakCapacity = Math.ceil(totalDevices * peakUsageFactor);

        return {
            current: {
                users: currentUsers,
                estimatedDevices: Math.ceil(currentUsers * deviceMultiplier)
            },
            projected: {
                users: projectedUsers,
                devices: totalDevices,
                peakCapacity: peakCapacity,
                growthRate: projectedGrowth,
                timeHorizon: timeHorizon
            },
            recommendations: {
                minimumSubnetSize: this._calculateMinimumSubnetSize(peakCapacity),
                recommendedSubnetSize: this._calculateRecommendedSubnetSize(peakCapacity),
                infrastructureUpgrades: this._getInfrastructureRecommendations(peakCapacity)
            }
        };
    }

    /**
     * Generate disaster recovery network plan
     * @param {Object} primaryPlan - Primary network plan
     * @param {Object} drRequirements - DR requirements
     * @returns {Object} DR network plan
     */
    generateDRNetworkPlan(primaryPlan, drRequirements = {}) {
        const {
            drSite = 'secondary',
            networkOffset = '172.16.0.0/16',
            criticalVLANsOnly = false,
            bandwidth = 'standard'
        } = drRequirements;

        const drPlan = {
            metadata: {
                drSite,
                primarySite: primaryPlan.metadata.organizationName,
                networkOffset,
                generatedAt: new Date().toISOString()
            },
            networkMapping: [],
            vlanMapping: [],
            replicationPlan: [],
            failoverProcedure: []
        };

        // Generate DR network mappings
        primaryPlan.allocation.allocations.forEach((subnet, index) => {
            if (criticalVLANsOnly && !this._isCriticalSubnet(subnet.name)) {
                return;
            }

            const drSubnet = this._generateDRSubnet(subnet, networkOffset, index);
            drPlan.networkMapping.push({
                primary: subnet.cidr,
                dr: drSubnet.cidr,
                name: subnet.name,
                priority: this._getSubnetPriority(subnet.name)
            });
        });

        // Generate failover procedures
        drPlan.failoverProcedure = this._generateFailoverProcedure(primaryPlan, drPlan);

        return drPlan;
    }

    // Private helper methods

    _generateDepartmentSubnets(departments, totalUsers) {
        const avgUsersPerDept = Math.ceil(totalUsers / departments.length);
        return departments.map((dept, index) => ({
            name: dept.name || `Department-${index + 1}`,
            hosts: dept.users || avgUsersPerDept,
            vlanStart: 100 + (index * 50)
        }));
    }

    _detectPattern(totalUsers) {
        if (totalUsers <= 50) return 'small-office';
        if (totalUsers <= 200) return 'medium-office';
        return 'enterprise';
    }

    _generateVLANPlan(allocations, securityLevel) {
        return allocations.map((allocation, index) => {
            const vlanId = allocation.vlanStart || (100 + index * 10);
            const securityZone = this._determineSecurityZone(allocation.name, securityLevel);
            
            return {
                vlanId: vlanId,
                name: allocation.name,
                subnet: allocation.cidr,
                description: `${allocation.name} network segment`,
                securityZone: securityZone,
                accessPolicies: this._generateAccessPolicies(allocation.name, securityZone),
                qosPolicy: this._generateQoSPolicy(allocation.name),
                monitoring: this._generateMonitoringConfig(allocation.name, securityZone)
            };
        });
    }

    _generateDHCPPlan(allocations) {
        return allocations.map(allocation => {
            if (allocation.status !== 'allocated') return null;
            
            return {
                subnet: allocation.cidr,
                name: allocation.name,
                scope: this.subnetCalculator.generateDHCPScope(allocation.cidr, {
                    reserveStaticIPs: this._getStaticIPReservation(allocation.name),
                    dhcpPoolPercentage: this._getDHCPPoolPercentage(allocation.name)
                })
            };
        }).filter(Boolean);
    }

    _generateSecurityPlan(vlanPlan, securityLevel) {
        const zones = {};
        vlanPlan.forEach(vlan => {
            if (!zones[vlan.securityZone]) {
                zones[vlan.securityZone] = [];
            }
            zones[vlan.securityZone].push(vlan);
        });

        return {
            securityZones: Object.keys(zones).map(zoneName => ({
                name: zoneName,
                vlans: zones[zoneName],
                firewallRules: this._generateFirewallRules(zones[zoneName], securityLevel),
                accessMatrix: this._generateAccessMatrix(zoneName, zones)
            })),
            recommendations: this._generateSecurityRecommendations(securityLevel)
        };
    }

    _generateImplementationPlan(vlanPlan, securityLevel) {
        const phases = [
            {
                phase: 1,
                name: 'Core Infrastructure',
                description: 'Setup management and server networks',
                duration: '1-2 weeks',
                vlans: vlanPlan.filter(v => ['Management', 'Servers'].includes(v.name))
            },
            {
                phase: 2,
                name: 'User Networks',
                description: 'Deploy user and departmental networks',
                duration: '2-3 weeks', 
                vlans: vlanPlan.filter(v => v.name.includes('Department') || v.name === 'Users')
            },
            {
                phase: 3,
                name: 'Security & Guest',
                description: 'Implement security zones and guest access',
                duration: '1-2 weeks',
                vlans: vlanPlan.filter(v => ['DMZ', 'Guest'].includes(v.name))
            }
        ];

        return {
            phases: phases,
            totalDuration: '4-7 weeks',
            prerequisites: this._getImplementationPrerequisites(),
            riskAssessment: this._getImplementationRisks(securityLevel)
        };
    }

    _calculateIPUtilization(allocation) {
        const totalRequested = allocation.allocations.reduce((sum, alloc) => 
            sum + (alloc.hostsNeeded || 0), 0);
        const totalAllocated = allocation.allocations.reduce((sum, alloc) => 
            sum + (alloc.usableHosts || 0), 0);
        
        return {
            requested: totalRequested,
            allocated: totalAllocated,
            efficiency: totalRequested > 0 ? (totalRequested / totalAllocated * 100).toFixed(1) : 0
        };
    }

    _estimateImplementationCost(vlanPlan) {
        // Simplified cost estimation
        const baseCost = vlanPlan.length * 500; // $500 per VLAN
        const complexityMultiplier = vlanPlan.length > 10 ? 1.5 : 1.2;
        
        return {
            estimated: Math.ceil(baseCost * complexityMultiplier),
            breakdown: {
                planning: Math.ceil(baseCost * 0.2),
                implementation: Math.ceil(baseCost * 0.6),
                testing: Math.ceil(baseCost * 0.2)
            }
        };
    }

    _generateDocumentation(allocations, vlanPlan) {
        return {
            networkDiagram: 'Generated network topology diagram would be created here',
            addressPlan: allocations.map(alloc => ({
                name: alloc.name,
                network: alloc.network,
                cidr: alloc.cidr,
                usableHosts: alloc.usableHosts,
                gateway: alloc.suggestedGateway
            })),
            vlanTable: vlanPlan.map(vlan => ({
                vlanId: vlan.vlanId,
                name: vlan.name,
                subnet: vlan.subnet,
                securityZone: vlan.securityZone
            })),
            configurationTemplates: this._generateConfigTemplates(vlanPlan)
        };
    }

    _determineSecurityZone(name, securityLevel) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('management') || nameLower.includes('admin')) return 'high-security';
        if (nameLower.includes('server') || nameLower.includes('dmz')) return 'restricted';
        if (nameLower.includes('guest') || nameLower.includes('public')) return 'low-security';
        return 'standard';
    }

    _generateAccessPolicies(name, securityZone) {
        // Generate access policies based on subnet name and security zone
        const policies = [];
        
        if (securityZone === 'high-security') {
            policies.push('deny-all-by-default', 'management-only-access', 'logging-required');
        } else if (securityZone === 'restricted') {
            policies.push('controlled-access', 'server-to-server-allowed', 'logging-enabled');
        } else {
            policies.push('standard-access', 'internet-allowed');
        }
        
        return policies;
    }

    _generateQoSPolicy(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('voice') || nameLower.includes('video')) return 'high-priority';
        if (nameLower.includes('management')) return 'medium-priority';
        return 'standard';
    }

    _generateMonitoringConfig(name, securityZone) {
        return {
            snmpEnabled: true,
            logLevel: securityZone === 'high-security' ? 'debug' : 'info',
            alertThresholds: {
                utilization: securityZone === 'high-security' ? 70 : 85,
                errorRate: 5
            }
        };
    }

    _getStaticIPReservation(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('server')) return 50;
        if (nameLower.includes('management')) return 30;
        return 20;
    }

    _getDHCPPoolPercentage(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('server')) return 30; // Servers mostly static
        if (nameLower.includes('guest')) return 90; // Guests mostly DHCP
        return 70; // Standard mix
    }

    _generateFirewallRules(vlans, securityLevel) {
        // Generate basic firewall rules for the security zone
        return [
            'default-deny-all',
            'allow-established-connections',
            'allow-zone-internal-traffic',
            ...(securityLevel === 'high' ? ['log-all-traffic'] : [])
        ];
    }

    _generateAccessMatrix(zoneName, zones) {
        const matrix = {};
        Object.keys(zones).forEach(targetZone => {
            matrix[targetZone] = this._determineZoneAccess(zoneName, targetZone);
        });
        return matrix;
    }

    _determineZoneAccess(sourceZone, targetZone) {
        // Define access rules between security zones
        if (sourceZone === targetZone) return 'full';
        if (sourceZone === 'high-security') return 'full';
        if (targetZone === 'high-security') return 'deny';
        if (sourceZone === 'low-security' && targetZone === 'restricted') return 'deny';
        return 'limited';
    }

    _generateSecurityRecommendations(securityLevel) {
        return [
            'Implement network segmentation',
            'Enable VLAN access control lists',
            'Configure port security on access switches',
            'Deploy network monitoring tools',
            ...(securityLevel === 'high' ? [
                'Implement 802.1X authentication',
                'Deploy network access control (NAC)',
                'Enable advanced threat detection'
            ] : [])
        ];
    }

    _getImplementationPrerequisites() {
        return [
            'Network equipment supporting VLANs',
            'Layer 3 routing capability',
            'DHCP server configuration',
            'DNS server updates',
            'Firewall rule configuration',
            'Network monitoring tools'
        ];
    }

    _getImplementationRisks(securityLevel) {
        return [
            {
                risk: 'Network outage during migration',
                probability: 'medium',
                impact: 'high',
                mitigation: 'Implement during maintenance window with rollback plan'
            },
            {
                risk: 'VLAN misconfiguration',
                probability: 'low',
                impact: 'medium',
                mitigation: 'Thorough testing and configuration validation'
            },
            {
                risk: 'Security policy gaps',
                probability: securityLevel === 'high' ? 'low' : 'medium',
                impact: 'high',
                mitigation: 'Security review and penetration testing'
            }
        ];
    }

    _generateConfigTemplates(vlanPlan) {
        return {
            ciscoSwitch: this._generateCiscoSwitchConfig(vlanPlan),
            firewallRules: this._generateFirewallConfig(vlanPlan),
            dhcpServer: this._generateDHCPConfig(vlanPlan)
        };
    }

    _generateCiscoSwitchConfig(vlanPlan) {
        let config = '! VLAN Configuration\n';
        vlanPlan.forEach(vlan => {
            config += `vlan ${vlan.vlanId}\n`;
            config += ` name ${vlan.name}\n`;
            config += ` exit\n`;
        });
        return config;
    }

    _generateFirewallConfig(vlanPlan) {
        return vlanPlan.map(vlan => 
            `# ${vlan.name} (VLAN ${vlan.vlanId}) - ${vlan.securityZone}`
        ).join('\n');
    }

    _generateDHCPConfig(vlanPlan) {
        return vlanPlan.map(vlan => 
            `# DHCP scope for ${vlan.name} - ${vlan.subnet}`
        ).join('\n');
    }

    _calculateAverageUtilization(utilization) {
        const values = Object.values(utilization);
        if (values.length === 0) return 0;
        
        const totalUtil = values.reduce((sum, util) => {
            const percent = util.total > 0 ? (util.used / util.total) * 100 : 0;
            return sum + percent;
        }, 0);
        
        return totalUtil / values.length;
    }

    _generateNetworkRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.issues.length > 0) {
            recommendations.push('Address critical network issues identified in analysis');
        }
        
        if (analysis.improvements.length > 0) {
            recommendations.push('Consider network optimization opportunities');
        }
        
        recommendations.push('Implement regular network capacity planning');
        recommendations.push('Establish network performance baselines');
        
        return recommendations;
    }

    _calculateMinimumSubnetSize(devices) {
        // Next power of 2 that accommodates devices + 20% overhead
        const needed = Math.ceil(devices * 1.2);
        return Math.pow(2, Math.ceil(Math.log2(needed)));
    }

    _calculateRecommendedSubnetSize(devices) {
        // Double the minimum for growth
        return this._calculateMinimumSubnetSize(devices) * 2;
    }

    _getInfrastructureRecommendations(peakCapacity) {
        const recommendations = [];
        
        if (peakCapacity > 1000) {
            recommendations.push('Consider enterprise-grade core switches');
            recommendations.push('Implement redundant uplinks');
        }
        
        if (peakCapacity > 500) {
            recommendations.push('Deploy dedicated DHCP servers');
            recommendations.push('Implement network monitoring');
        }
        
        recommendations.push('Plan for adequate switch port density');
        
        return recommendations;
    }

    _isCriticalSubnet(name) {
        const criticalNames = ['management', 'server', 'production', 'finance', 'hr'];
        return criticalNames.some(critical => 
            name.toLowerCase().includes(critical)
        );
    }

    _generateDRSubnet(primarySubnet, drNetwork, index) {
        // Generate DR subnet in different network range
        const drBase = drNetwork.split('/')[0];
        const drPrefix = parseInt(drNetwork.split('/')[1]);
        
        // Simple DR subnet generation (would be more sophisticated in practice)
        const subnetIncrement = Math.pow(2, 32 - primarySubnet.prefix);
        const drSubnetAddr = this.subnetCalculator._addToIP(drBase, index * subnetIncrement);
        
        return {
            cidr: `${drSubnetAddr}/${primarySubnet.prefix}`,
            name: `DR-${primarySubnet.name}`
        };
    }

    _getSubnetPriority(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('management')) return 'critical';
        if (nameLower.includes('server') || nameLower.includes('production')) return 'high';
        if (nameLower.includes('user') || nameLower.includes('department')) return 'medium';
        return 'low';
    }

    _generateFailoverProcedure(primaryPlan, drPlan) {
        return [
            'Activate DR site network equipment',
            'Update DNS records to point to DR site',
            'Redirect critical traffic to DR subnets',
            'Verify connectivity and functionality',
            'Monitor and troubleshoot as needed'
        ];
    }
}

module.exports = NetworkPlanningTool;