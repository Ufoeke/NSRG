const logger = require('../../shared/logger');

/**
 * Intelligent Rule Suggestion Engine
 * Analyzes traffic patterns, security best practices, and existing rules
 * to suggest optimized firewall rule configurations
 */
class RuleSuggestionEngine {
    constructor() {
        this.rulePatterns = this.loadRulePatterns();
        this.securityProfiles = this.loadSecurityProfiles();
        this.industryStandards = this.loadIndustryStandards();
    }

    /**
     * Generate rule suggestions based on multiple factors
     * @param {object} context - Analysis context
     * @returns {Promise<Array<object>>} Array of suggested rules
     */
    async generateSuggestions(context) {
        const suggestions = [];
        
        try {
            // Different types of suggestions
            const trafficBasedSuggestions = await this.analyzeTrafficPatterns(context.trafficData);
            const securitySuggestions = await this.generateSecuritySuggestions(context);
            const applicationSuggestions = await this.generateApplicationSuggestions(context.applications);
            const complianceSuggestions = await this.generateComplianceSuggestions(context.industry);
            const optimizationSuggestions = await this.generateOptimizationSuggestions(context.existingRules);

            // Combine and prioritize suggestions
            suggestions.push(
                ...trafficBasedSuggestions,
                ...securitySuggestions,
                ...applicationSuggestions,
                ...complianceSuggestions,
                ...optimizationSuggestions
            );

            // Remove duplicates and rank by priority
            const uniqueSuggestions = this.deduplicateAndRank(suggestions);
            
            return uniqueSuggestions;
        } catch (error) {
            logger.error('Error generating rule suggestions:', error);
            throw error;
        }
    }

    /**
     * Analyze traffic patterns to suggest rules
     * @param {Array<object>} trafficData - Network traffic data
     * @returns {Promise<Array<object>>} Traffic-based suggestions
     */
    async analyzeTrafficPatterns(trafficData) {
        const suggestions = [];
        
        if (!trafficData || trafficData.length === 0) {
            return suggestions;
        }

        // Group traffic by common patterns
        const trafficGroups = this.groupTrafficByPatterns(trafficData);
        
        for (const [pattern, flows] of trafficGroups) {
            // Only suggest rules for significant traffic patterns
            if (flows.length < 5) continue;

            const suggestion = this.createTrafficBasedRule(pattern, flows);
            if (suggestion) {
                suggestions.push({
                    ...suggestion,
                    type: 'traffic_pattern',
                    confidence: this.calculateTrafficConfidence(flows),
                    evidence: {
                        flowCount: flows.length,
                        totalBytes: flows.reduce((sum, flow) => sum + (flow.bytes || 0), 0),
                        timeSpan: this.getTimeSpan(flows)
                    }
                });
            }
        }

        return suggestions;
    }

    /**
     * Generate security-focused rule suggestions
     * @param {object} context - Security context
     * @returns {Promise<Array<object>>} Security suggestions
     */
    async generateSecuritySuggestions(context) {
        const suggestions = [];
        
        // Basic security hardening rules
        const hardeningRules = this.getSecurityHardeningRules(context.networkProfile);
        suggestions.push(...hardeningRules.map(rule => ({
            ...rule,
            type: 'security_hardening',
            confidence: 0.9,
            priority: 'high'
        })));

        // Threat-based suggestions
        if (context.threatIntelligence) {
            const threatRules = this.generateThreatBasedRules(context.threatIntelligence);
            suggestions.push(...threatRules);
        }

        // Zero-trust principles
        const zeroTrustRules = this.generateZeroTrustRules(context);
        suggestions.push(...zeroTrustRules);

        return suggestions;
    }

    /**
     * Generate application-specific rule suggestions
     * @param {Array<object>} applications - Detected applications
     * @returns {Promise<Array<object>>} Application suggestions
     */
    async generateApplicationSuggestions(applications) {
        const suggestions = [];
        
        if (!applications || applications.length === 0) {
            return suggestions;
        }

        for (const app of applications) {
            const appRules = this.getApplicationRules(app);
            suggestions.push(...appRules.map(rule => ({
                ...rule,
                type: 'application_specific',
                application: app.name,
                confidence: 0.85,
                evidence: {
                    detectedPorts: app.ports,
                    protocols: app.protocols,
                    usage: app.usage
                }
            })));
        }

        return suggestions;
    }

    /**
     * Generate compliance-based rule suggestions
     * @param {string} industry - Industry type (healthcare, finance, etc.)
     * @returns {Promise<Array<object>>} Compliance suggestions
     */
    async generateComplianceSuggestions(industry) {
        const suggestions = [];
        
        if (!industry) return suggestions;

        const complianceRules = this.industryStandards[industry] || this.industryStandards.general;
        
        for (const standard of complianceRules) {
            suggestions.push(...standard.rules.map(rule => ({
                ...rule,
                type: 'compliance',
                standard: standard.name,
                confidence: 0.95,
                priority: 'high',
                compliance: {
                    framework: standard.framework,
                    requirement: standard.requirement,
                    description: standard.description
                }
            })));
        }

        return suggestions;
    }

    /**
     * Generate optimization suggestions for existing rules
     * @param {Array<object>} existingRules - Current firewall rules
     * @returns {Promise<Array<object>>} Optimization suggestions
     */
    async generateOptimizationSuggestions(existingRules) {
        const suggestions = [];
        
        if (!existingRules || existingRules.length === 0) {
            return suggestions;
        }

        // Detect redundant rules
        const redundantRules = this.detectRedundantRules(existingRules);
        suggestions.push(...redundantRules);

        // Suggest rule consolidation
        const consolidationSuggestions = this.suggestRuleConsolidation(existingRules);
        suggestions.push(...consolidationSuggestions);

        // Suggest rule ordering optimization
        const orderingSuggestions = this.suggestRuleOrdering(existingRules);
        suggestions.push(...orderingSuggestions);

        // Detect shadow rules
        const shadowRules = this.detectShadowRules(existingRules);
        suggestions.push(...shadowRules);

        return suggestions;
    }

    /**
     * Group traffic flows by common patterns
     * @param {Array<object>} trafficData - Traffic flow data
     * @returns {Map} Grouped traffic patterns
     */
    groupTrafficByPatterns(trafficData) {
        const groups = new Map();
        
        for (const flow of trafficData) {
            const pattern = this.extractTrafficPattern(flow);
            const key = JSON.stringify(pattern);
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(flow);
        }
        
        return groups;
    }

    /**
     * Extract traffic pattern from flow data
     * @param {object} flow - Traffic flow
     * @returns {object} Traffic pattern
     */
    extractTrafficPattern(flow) {
        return {
            destinationPort: flow.destinationPort,
            protocol: flow.protocol,
            sourceNetwork: this.normalizeNetwork(flow.sourceAddress),
            destinationNetwork: this.normalizeNetwork(flow.destinationAddress),
            application: flow.application || 'unknown'
        };
    }

    /**
     * Create a rule suggestion based on traffic pattern
     * @param {object} pattern - Traffic pattern
     * @param {Array<object>} flows - Related flows
     * @returns {object} Rule suggestion
     */
    createTrafficBasedRule(pattern, flows) {
        const patternObj = JSON.parse(pattern);
        
        // Determine if this should be allowed or monitored
        const action = this.determineRuleAction(patternObj, flows);
        
        return {
            name: `Traffic-Based Rule: ${patternObj.application} on port ${patternObj.destinationPort}`,
            description: `Allow ${patternObj.application} traffic on port ${patternObj.destinationPort} based on observed patterns`,
            source: patternObj.sourceNetwork,
            destination: patternObj.destinationNetwork,
            destinationPort: patternObj.destinationPort,
            protocol: patternObj.protocol,
            action: action,
            enabled: true,
            priority: this.calculateRulePriority(patternObj, flows),
            tags: ['auto-generated', 'traffic-analysis', patternObj.application]
        };
    }

    /**
     * Get security hardening rules based on network profile
     * @param {object} networkProfile - Network characteristics
     * @returns {Array<object>} Hardening rules
     */
    getSecurityHardeningRules(networkProfile) {
        const rules = [];
        
        // Block common attack vectors
        rules.push({
            name: 'Block External SSH Access',
            description: 'Block SSH access from external networks to prevent brute force attacks',
            source: 'any',
            destination: 'internal_networks',
            destinationPort: '22',
            protocol: 'TCP',
            action: 'deny',
            enabled: true,
            priority: 100
        });

        // Block unnecessary protocols
        rules.push({
            name: 'Block Telnet',
            description: 'Block insecure Telnet protocol',
            source: 'any',
            destination: 'any',
            destinationPort: '23',
            protocol: 'TCP',
            action: 'deny',
            enabled: true,
            priority: 90
        });

        // Allow only necessary web traffic
        rules.push({
            name: 'Allow HTTPS Outbound',
            description: 'Allow secure HTTPS traffic outbound',
            source: 'internal_networks',
            destination: 'any',
            destinationPort: '443',
            protocol: 'TCP',
            action: 'allow',
            enabled: true,
            priority: 80
        });

        return rules;
    }

    /**
     * Generate threat-based rules from threat intelligence
     * @param {object} threatIntel - Threat intelligence data
     * @returns {Array<object>} Threat-based rules
     */
    generateThreatBasedRules(threatIntel) {
        const rules = [];
        
        // Block known malicious IPs
        if (threatIntel.maliciousIPs) {
            for (const ip of threatIntel.maliciousIPs) {
                rules.push({
                    name: `Block Malicious IP: ${ip.address}`,
                    description: `Block traffic from known malicious IP: ${ip.reason}`,
                    source: ip.address,
                    destination: 'any',
                    action: 'deny',
                    enabled: true,
                    priority: 95,
                    type: 'threat_intelligence',
                    confidence: ip.confidence || 0.8,
                    threatInfo: {
                        category: ip.category,
                        firstSeen: ip.firstSeen,
                        lastSeen: ip.lastSeen
                    }
                });
            }
        }

        // Block suspicious ports
        if (threatIntel.suspiciousPorts) {
            for (const port of threatIntel.suspiciousPorts) {
                rules.push({
                    name: `Monitor Suspicious Port: ${port.number}`,
                    description: `Monitor traffic on suspicious port: ${port.reason}`,
                    source: 'any',
                    destination: 'internal_networks',
                    destinationPort: port.number.toString(),
                    protocol: port.protocol || 'TCP',
                    action: 'monitor',
                    enabled: true,
                    priority: 70,
                    type: 'threat_intelligence'
                });
            }
        }

        return rules;
    }

    /**
     * Generate zero-trust security rules
     * @param {object} context - Security context
     * @returns {Array<object>} Zero-trust rules
     */
    generateZeroTrustRules(context) {
        const rules = [];
        
        // Default deny rule
        rules.push({
            name: 'Default Deny All',
            description: 'Default deny rule for zero-trust security',
            source: 'any',
            destination: 'any',
            action: 'deny',
            enabled: true,
            priority: 1,
            type: 'zero_trust',
            confidence: 1.0
        });

        // Micro-segmentation rules
        if (context.networkSegments) {
            for (const segment of context.networkSegments) {
                rules.push({
                    name: `Isolate ${segment.name}`,
                    description: `Isolate ${segment.name} segment from other networks`,
                    source: segment.network,
                    destination: `!${segment.network}`,
                    action: 'deny',
                    enabled: true,
                    priority: 85,
                    type: 'micro_segmentation'
                });
            }
        }

        return rules;
    }

    /**
     * Get application-specific rules
     * @param {object} application - Application info
     * @returns {Array<object>} Application rules
     */
    getApplicationRules(application) {
        const appTemplates = {
            'web_server': [
                {
                    name: 'Allow HTTP Traffic',
                    destinationPort: '80',
                    protocol: 'TCP',
                    action: 'allow'
                },
                {
                    name: 'Allow HTTPS Traffic',
                    destinationPort: '443',
                    protocol: 'TCP',
                    action: 'allow'
                }
            ],
            'database': [
                {
                    name: 'Restrict Database Access',
                    destinationPort: application.port || '3306',
                    protocol: 'TCP',
                    action: 'allow',
                    source: 'application_servers'
                }
            ],
            'dns': [
                {
                    name: 'Allow DNS Queries',
                    destinationPort: '53',
                    protocol: 'UDP',
                    action: 'allow'
                }
            ]
        };

        const rules = appTemplates[application.type] || [];
        return rules.map(rule => ({
            ...rule,
            name: `${application.name}: ${rule.name}`,
            description: `Auto-generated rule for ${application.name} application`,
            source: rule.source || 'any',
            destination: rule.destination || application.network || 'any'
        }));
    }

    /**
     * Detect redundant rules
     * @param {Array<object>} rules - Existing rules
     * @returns {Array<object>} Redundancy suggestions
     */
    detectRedundantRules(rules) {
        const suggestions = [];
        
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                if (this.areRulesRedundant(rules[i], rules[j])) {
                    suggestions.push({
                        type: 'redundancy_removal',
                        action: 'remove_rule',
                        targetRule: rules[j].id,
                        reason: `Rule is redundant with rule ${rules[i].id}`,
                        confidence: 0.9,
                        priority: 'medium',
                        name: `Remove Redundant Rule: ${rules[j].name}`,
                        description: `Rule ${rules[j].name} is redundant and can be safely removed`
                    });
                }
            }
        }
        
        return suggestions;
    }

    /**
     * Suggest rule consolidation opportunities
     * @param {Array<object>} rules - Existing rules
     * @returns {Array<object>} Consolidation suggestions
     */
    suggestRuleConsolidation(rules) {
        const suggestions = [];
        const ruleGroups = this.groupSimilarRules(rules);
        
        for (const group of ruleGroups) {
            if (group.length > 2) {
                suggestions.push({
                    type: 'rule_consolidation',
                    action: 'merge_rules',
                    targetRules: group.map(r => r.id),
                    consolidatedRule: this.createConsolidatedRule(group),
                    confidence: 0.8,
                    priority: 'medium',
                    name: `Consolidate ${group.length} Similar Rules`,
                    description: `Merge ${group.length} similar rules into one consolidated rule`
                });
            }
        }
        
        return suggestions;
    }

    /**
     * Load rule patterns from knowledge base
     * @returns {object} Rule patterns
     */
    loadRulePatterns() {
        return {
            web_traffic: {
                ports: [80, 443, 8080, 8443],
                protocols: ['HTTP', 'HTTPS'],
                common_sources: ['any']
            },
            database_traffic: {
                ports: [3306, 5432, 1433, 1521],
                protocols: ['MySQL', 'PostgreSQL', 'MSSQL', 'Oracle'],
                common_sources: ['application_servers']
            },
            management_traffic: {
                ports: [22, 3389, 443],
                protocols: ['SSH', 'RDP', 'HTTPS'],
                common_sources: ['admin_networks']
            }
        };
    }

    /**
     * Load security profiles
     * @returns {object} Security profiles
     */
    loadSecurityProfiles() {
        return {
            high_security: {
                default_action: 'deny',
                logging: 'enabled',
                inspection: 'deep'
            },
            balanced: {
                default_action: 'allow',
                logging: 'selective',
                inspection: 'moderate'
            },
            performance: {
                default_action: 'allow',
                logging: 'minimal',
                inspection: 'basic'
            }
        };
    }

    /**
     * Load industry standards and compliance requirements
     * @returns {object} Industry standards
     */
    loadIndustryStandards() {
        return {
            healthcare: [
                {
                    name: 'HIPAA',
                    framework: 'HIPAA',
                    requirement: 'Access Controls',
                    description: 'Implement access controls for PHI',
                    rules: [
                        {
                            name: 'Restrict PHI Database Access',
                            source: 'authorized_systems',
                            destination: 'phi_databases',
                            action: 'allow',
                            priority: 95
                        }
                    ]
                }
            ],
            finance: [
                {
                    name: 'PCI DSS',
                    framework: 'PCI DSS',
                    requirement: 'Network Segmentation',
                    description: 'Segment cardholder data environment',
                    rules: [
                        {
                            name: 'Isolate Card Data Environment',
                            source: 'cde_networks',
                            destination: '!cde_networks',
                            action: 'deny',
                            priority: 99
                        }
                    ]
                }
            ],
            general: [
                {
                    name: 'Basic Security',
                    framework: 'General',
                    requirement: 'Basic Protection',
                    description: 'Basic security measures',
                    rules: [
                        {
                            name: 'Block Unnecessary Services',
                            source: 'any',
                            destination: 'internal_networks',
                            destinationPort: '135,139,445',
                            protocol: 'TCP',
                            action: 'deny',
                            priority: 80
                        }
                    ]
                }
            ]
        };
    }

    // Helper methods
    deduplicateAndRank(suggestions) {
        // Remove duplicates and rank by confidence and priority
        const unique = suggestions.filter((suggestion, index, self) =>
            index === self.findIndex(s => s.name === suggestion.name)
        );
        
        return unique.sort((a, b) => {
            const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
            const scoreA = (a.confidence || 0.5) * (priorityWeight[a.priority] || 1);
            const scoreB = (b.confidence || 0.5) * (priorityWeight[b.priority] || 1);
            return scoreB - scoreA;
        });
    }

    calculateTrafficConfidence(flows) {
        const totalFlows = flows.length;
        const uniqueSources = new Set(flows.map(f => f.sourceAddress)).size;
        const timeSpan = this.getTimeSpan(flows);
        
        // Higher confidence for consistent patterns
        let confidence = Math.min(0.9, 0.5 + (totalFlows / 100) * 0.3);
        if (uniqueSources > 5) confidence += 0.1;
        if (timeSpan > 24 * 60 * 60 * 1000) confidence += 0.1; // More than 24 hours
        
        return Math.min(0.95, confidence);
    }

    normalizeNetwork(address) {
        // Simplify network addressing for pattern matching
        if (address.includes('/')) return address;
        
        const parts = address.split('.');
        if (parts.length === 4) {
            // Convert to subnet for pattern matching
            if (parts[0] === '192' && parts[1] === '168') return '192.168.0.0/16';
            if (parts[0] === '10') return '10.0.0.0/8';
            if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return '172.16.0.0/12';
        }
        
        return address;
    }

    getTimeSpan(flows) {
        if (flows.length === 0) return 0;
        
        const timestamps = flows.map(f => new Date(f.timestamp).getTime()).filter(t => !isNaN(t));
        if (timestamps.length === 0) return 0;
        
        return Math.max(...timestamps) - Math.min(...timestamps);
    }

    determineRuleAction(pattern, flows) {
        // Simple heuristics to determine if traffic should be allowed
        const knownGoodPorts = [80, 443, 53, 123]; // HTTP, HTTPS, DNS, NTP
        const suspiciousPorts = [23, 135, 139, 445]; // Telnet, RPC, NetBIOS
        
        if (suspiciousPorts.includes(parseInt(pattern.destinationPort))) {
            return 'deny';
        }
        
        if (knownGoodPorts.includes(parseInt(pattern.destinationPort))) {
            return 'allow';
        }
        
        // Default to monitoring for unknown patterns
        return 'monitor';
    }

    calculateRulePriority(pattern, flows) {
        // Calculate priority based on various factors
        let priority = 50; // Base priority
        
        // Higher priority for more frequent traffic
        priority += Math.min(30, flows.length);
        
        // Higher priority for well-known services
        const wellKnownPorts = [80, 443, 22, 53];
        if (wellKnownPorts.includes(parseInt(pattern.destinationPort))) {
            priority += 20;
        }
        
        return Math.min(100, priority);
    }

    areRulesRedundant(rule1, rule2) {
        // Simple redundancy check
        return (
            rule1.source === rule2.source &&
            rule1.destination === rule2.destination &&
            rule1.destinationPort === rule2.destinationPort &&
            rule1.protocol === rule2.protocol &&
            rule1.action === rule2.action
        );
    }

    groupSimilarRules(rules) {
        // Group rules that could potentially be consolidated
        const groups = new Map();
        
        for (const rule of rules) {
            const key = `${rule.destination}_${rule.destinationPort}_${rule.action}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(rule);
        }
        
        return Array.from(groups.values()).filter(group => group.length > 1);
    }

    createConsolidatedRule(ruleGroup) {
        // Create a single rule that replaces multiple similar rules
        const firstRule = ruleGroup[0];
        const sources = ruleGroup.map(r => r.source);
        
        return {
            name: `Consolidated Rule: ${firstRule.destination}:${firstRule.destinationPort}`,
            description: `Consolidated rule replacing ${ruleGroup.length} similar rules`,
            source: sources.join(','),
            destination: firstRule.destination,
            destinationPort: firstRule.destinationPort,
            protocol: firstRule.protocol,
            action: firstRule.action,
            enabled: true,
            priority: Math.max(...ruleGroup.map(r => r.priority || 50))
        };
    }
}

module.exports = RuleSuggestionEngine; 