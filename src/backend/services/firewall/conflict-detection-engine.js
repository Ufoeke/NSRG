const logger = require('../../shared/logger');

/**
 * Advanced Firewall Rule Conflict Detection Engine
 * Detects various types of conflicts between firewall rules
 */
class ConflictDetectionEngine {
    constructor() {
        this.conflictTypes = {
            SHADOWING: 'shadowing',
            CONTRADICTION: 'contradiction', 
            REDUNDANCY: 'redundancy',
            OVERLAP: 'overlap',
            GENERALIZATION: 'generalization',
            CORRELATION: 'correlation'
        };
        
        this.severityLevels = {
            CRITICAL: 'critical',
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low'
        };
    }

    /**
     * Analyze rules for conflicts
     * @param {Array<object>} rules - Firewall rules to analyze
     * @param {object} options - Analysis options
     * @returns {Promise<Array<object>>} Detected conflicts
     */
    async analyzeConflicts(rules, options = {}) {
        const conflicts = [];
        
        try {
            // Sort rules by priority for analysis
            const sortedRules = this.sortRulesByPriority(rules);
            
            // Perform different types of conflict detection
            conflicts.push(...await this.detectShadowing(sortedRules));
            conflicts.push(...await this.detectContradictions(sortedRules));
            conflicts.push(...await this.detectRedundancy(sortedRules));
            conflicts.push(...await this.detectOverlaps(sortedRules));
            conflicts.push(...await this.detectGeneralization(sortedRules));
            conflicts.push(...await this.detectCorrelation(sortedRules));
            
            // Analyze policy violations if policies provided
            if (options.policies) {
                conflicts.push(...await this.detectPolicyViolations(sortedRules, options.policies));
            }
            
            // Filter and prioritize conflicts
            return this.prioritizeConflicts(conflicts);
            
        } catch (error) {
            logger.error('Error analyzing rule conflicts:', error);
            throw error;
        }
    }

    /**
     * Detect shadowing conflicts where one rule makes another ineffective
     */
    async detectShadowing(rules) {
        const conflicts = [];
        
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const higherPriorityRule = rules[i];
                const lowerPriorityRule = rules[j];
                
                // Check if higher priority rule shadows the lower one
                if (this.isRuleShadowed(higherPriorityRule, lowerPriorityRule)) {
                    conflicts.push({
                        type: this.conflictTypes.SHADOWING,
                        severity: this.calculateShadowingSeverity(higherPriorityRule, lowerPriorityRule),
                        rule1: higherPriorityRule,
                        rule2: lowerPriorityRule,
                        description: `Rule "${lowerPriorityRule.name}" is shadowed by higher priority rule "${higherPriorityRule.name}"`,
                        impact: 'Rule will never be evaluated, potentially allowing unintended traffic',
                        recommendation: this.getShadowingRecommendation(higherPriorityRule, lowerPriorityRule),
                        autoResolvable: this.isShadowingAutoResolvable(higherPriorityRule, lowerPriorityRule)
                    });
                }
            }
        }
        
        return conflicts;
    }

    /**
     * Detect contradiction conflicts where rules have conflicting actions
     */
    async detectContradictions(rules) {
        const conflicts = [];
        
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const rule1 = rules[i];
                const rule2 = rules[j];
                
                if (this.areRulesContradictory(rule1, rule2)) {
                    conflicts.push({
                        type: this.conflictTypes.CONTRADICTION,
                        severity: this.severityLevels.HIGH,
                        rule1,
                        rule2,
                        description: `Rules "${rule1.name}" and "${rule2.name}" have contradictory actions for overlapping traffic`,
                        impact: 'Unpredictable behavior - rule order determines which action is taken',
                        recommendation: this.getContradictionRecommendation(rule1, rule2),
                        autoResolvable: false
                    });
                }
            }
        }
        
        return conflicts;
    }

    /**
     * Detect redundant rules that duplicate functionality
     */
    async detectRedundancy(rules) {
        const conflicts = [];
        
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const rule1 = rules[i];
                const rule2 = rules[j];
                
                if (this.areRulesRedundant(rule1, rule2)) {
                    conflicts.push({
                        type: this.conflictTypes.REDUNDANCY,
                        severity: this.severityLevels.MEDIUM,
                        rule1,
                        rule2,
                        description: `Rules "${rule1.name}" and "${rule2.name}" are functionally identical`,
                        impact: 'Unnecessary complexity and potential performance impact',
                        recommendation: 'Consider removing one of the redundant rules or consolidating them',
                        autoResolvable: true,
                        resolution: {
                            action: 'remove_rule',
                            targetRule: rule2.id,
                            reason: 'Lower priority redundant rule'
                        }
                    });
                }
            }
        }
        
        return conflicts;
    }

    /**
     * Detect overlapping rules that may cause confusion
     */
    async detectOverlaps(rules) {
        const conflicts = [];
        
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const rule1 = rules[i];
                const rule2 = rules[j];
                
                const overlap = this.calculateRuleOverlap(rule1, rule2);
                if (overlap.hasOverlap && overlap.percentage > 0.5) {
                    conflicts.push({
                        type: this.conflictTypes.OVERLAP,
                        severity: this.getOverlapSeverity(overlap.percentage),
                        rule1,
                        rule2,
                        description: `Rules "${rule1.name}" and "${rule2.name}" have ${Math.round(overlap.percentage * 100)}% traffic overlap`,
                        impact: 'Potential confusion about rule intent and possible optimization opportunity',
                        recommendation: this.getOverlapRecommendation(rule1, rule2, overlap),
                        autoResolvable: overlap.percentage > 0.8,
                        overlapDetails: overlap
                    });
                }
            }
        }
        
        return conflicts;
    }

    /**
     * Detect generalization opportunities
     */
    async detectGeneralization(rules) {
        const conflicts = [];
        const ruleGroups = this.groupSimilarRules(rules);
        
        for (const group of ruleGroups) {
            if (group.length >= 3) {
                const generalizedRule = this.createGeneralizedRule(group);
                
                conflicts.push({
                    type: this.conflictTypes.GENERALIZATION,
                    severity: this.severityLevels.LOW,
                    rules: group,
                    description: `${group.length} rules can be generalized into a single rule`,
                    impact: 'Opportunity to simplify rule set and improve maintainability',
                    recommendation: 'Consider creating a generalized rule to replace multiple specific rules',
                    autoResolvable: true,
                    resolution: {
                        action: 'generalize_rules',
                        targetRules: group.map(r => r.id),
                        proposedRule: generalizedRule
                    }
                });
            }
        }
        
        return conflicts;
    }

    /**
     * Detect correlation patterns that may indicate security issues
     */
    async detectCorrelation(rules) {
        const conflicts = [];
        
        // Detect unusual permission patterns
        const permissiveRules = rules.filter(rule => 
            rule.action === 'allow' && 
            (rule.source_address === 'any' || rule.destination_address === 'any')
        );
        
        if (permissiveRules.length > rules.length * 0.7) {
            conflicts.push({
                type: this.conflictTypes.CORRELATION,
                severity: this.severityLevels.MEDIUM,
                rules: permissiveRules,
                description: 'High percentage of permissive rules detected',
                impact: 'Potential security risk due to overly permissive rule set',
                recommendation: 'Review permissive rules and consider implementing more restrictive policies',
                autoResolvable: false
            });
        }
        
        // Detect port scanning opportunities
        const tcpAllowRules = rules.filter(rule => 
            rule.action === 'allow' && 
            rule.protocol === 'TCP' && 
            rule.destination_port && 
            rule.destination_port.includes(',')
        );
        
        if (tcpAllowRules.length > 0) {
            conflicts.push({
                type: this.conflictTypes.CORRELATION,
                severity: this.severityLevels.LOW,
                rules: tcpAllowRules,
                description: 'Rules allowing multiple TCP ports detected',
                impact: 'Potential port scanning opportunities',
                recommendation: 'Consider grouping ports into service definitions or using more specific rules',
                autoResolvable: false
            });
        }
        
        return conflicts;
    }

    /**
     * Check for policy violations
     */
    async detectPolicyViolations(rules, policies) {
        const violations = [];
        
        for (const policy of policies) {
            for (const rule of rules) {
                if (this.violatesPolicy(rule, policy)) {
                    violations.push({
                        type: 'policy_violation',
                        severity: policy.severity || this.severityLevels.HIGH,
                        rule: rule,
                        policy: policy,
                        description: `Rule "${rule.name}" violates policy "${policy.name}"`,
                        impact: policy.impact || 'Policy compliance violation',
                        recommendation: policy.recommendation || 'Review rule against policy requirements',
                        autoResolvable: false
                    });
                }
            }
        }
        
        return violations;
    }

    // Helper methods for conflict detection logic

    isRuleShadowed(higherRule, lowerRule) {
        // Check if higher priority rule completely encompasses lower priority rule
        return (
            this.isAddressSubset(lowerRule.source_address, higherRule.source_address) &&
            this.isAddressSubset(lowerRule.destination_address, higherRule.destination_address) &&
            this.isPortSubset(lowerRule.destination_port, higherRule.destination_port) &&
            this.isProtocolSubset(lowerRule.protocol, higherRule.protocol) &&
            (higherRule.action === 'deny' || higherRule.action === 'drop')
        );
    }

    areRulesContradictory(rule1, rule2) {
        // Check if rules match same traffic but have different actions
        return (
            rule1.action !== rule2.action &&
            this.doRulesMatchSameTraffic(rule1, rule2)
        );
    }

    areRulesRedundant(rule1, rule2) {
        // Check if rules are functionally identical
        return (
            rule1.source_address === rule2.source_address &&
            rule1.destination_address === rule2.destination_address &&
            rule1.destination_port === rule2.destination_port &&
            rule1.protocol === rule2.protocol &&
            rule1.action === rule2.action
        );
    }

    calculateRuleOverlap(rule1, rule2) {
        // Calculate overlap percentage between two rules
        const sourceOverlap = this.calculateAddressOverlap(rule1.source_address, rule2.source_address);
        const destOverlap = this.calculateAddressOverlap(rule1.destination_address, rule2.destination_address);
        const portOverlap = this.calculatePortOverlap(rule1.destination_port, rule2.destination_port);
        const protocolOverlap = this.calculateProtocolOverlap(rule1.protocol, rule2.protocol);
        
        const overallOverlap = (sourceOverlap + destOverlap + portOverlap + protocolOverlap) / 4;
        
        return {
            hasOverlap: overallOverlap > 0,
            percentage: overallOverlap,
            details: {
                source: sourceOverlap,
                destination: destOverlap,
                port: portOverlap,
                protocol: protocolOverlap
            }
        };
    }

    sortRulesByPriority(rules) {
        return [...rules].sort((a, b) => {
            const priorityA = parseInt(a.priority) || 50;
            const priorityB = parseInt(b.priority) || 50;
            return priorityB - priorityA; // Higher priority first
        });
    }

    prioritizeConflicts(conflicts) {
        const severityOrder = {
            [this.severityLevels.CRITICAL]: 4,
            [this.severityLevels.HIGH]: 3,
            [this.severityLevels.MEDIUM]: 2,
            [this.severityLevels.LOW]: 1
        };
        
        return conflicts.sort((a, b) => {
            const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
            if (severityDiff !== 0) return severityDiff;
            
            // Secondary sort by auto-resolvable (auto-resolvable first)
            if (a.autoResolvable && !b.autoResolvable) return -1;
            if (!a.autoResolvable && b.autoResolvable) return 1;
            
            return 0;
        });
    }

    calculateShadowingSeverity(higherRule, lowerRule) {
        // Critical if lower rule is a security rule
        if (lowerRule.name.toLowerCase().includes('security') || 
            lowerRule.name.toLowerCase().includes('block')) {
            return this.severityLevels.CRITICAL;
        }
        
        // High if it's a deny rule being shadowed
        if (lowerRule.action === 'deny' || lowerRule.action === 'drop') {
            return this.severityLevels.HIGH;
        }
        
        return this.severityLevels.MEDIUM;
    }

    getShadowingRecommendation(higherRule, lowerRule) {
        if (lowerRule.action === 'deny' && higherRule.action === 'allow') {
            return 'Move the deny rule to higher priority or make the allow rule more specific';
        }
        
        return 'Remove the shadowed rule or adjust rule priorities and specificity';
    }

    getContradictionRecommendation(rule1, rule2) {
        return 'Clarify rule intent and adjust conditions to eliminate overlap, or merge into a single rule with clear action';
    }

    getOverlapRecommendation(rule1, rule2, overlap) {
        if (overlap.percentage > 0.8) {
            return 'Consider merging these rules as they handle very similar traffic';
        }
        
        return 'Review rules to ensure distinct purposes or consider consolidation';
    }

    getOverlapSeverity(percentage) {
        if (percentage > 0.9) return this.severityLevels.HIGH;
        if (percentage > 0.7) return this.severityLevels.MEDIUM;
        return this.severityLevels.LOW;
    }

    isShadowingAutoResolvable(higherRule, lowerRule) {
        // Only auto-resolve if lower rule is clearly redundant
        return lowerRule.action === higherRule.action;
    }

    groupSimilarRules(rules) {
        // Group rules by similar characteristics for generalization
        const groups = new Map();
        
        for (const rule of rules) {
            const key = `${rule.destination_address}_${rule.action}_${rule.protocol}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(rule);
        }
        
        return Array.from(groups.values()).filter(group => group.length > 1);
    }

    createGeneralizedRule(ruleGroup) {
        // Create a generalized rule from a group of similar rules
        const firstRule = ruleGroup[0];
        const sourcePorts = new Set(ruleGroup.map(r => r.source_port).filter(Boolean));
        const destPorts = new Set(ruleGroup.map(r => r.destination_port).filter(Boolean));
        
        return {
            name: `Generalized Rule: ${firstRule.destination_address}`,
            description: `Generalized from ${ruleGroup.length} similar rules`,
            source_address: firstRule.source_address,
            destination_address: firstRule.destination_address,
            destination_port: Array.from(destPorts).join(','),
            protocol: firstRule.protocol,
            action: firstRule.action,
            priority: Math.max(...ruleGroup.map(r => r.priority || 50))
        };
    }

    violatesPolicy(rule, policy) {
        // Check if rule violates a specific policy
        if (policy.type === 'deny_external_access' && 
            rule.action === 'allow' && 
            rule.source_address === 'any') {
            return true;
        }
        
        if (policy.type === 'require_logging' && 
            !rule.log_enabled) {
            return true;
        }
        
        if (policy.type === 'block_suspicious_ports') {
            const suspiciousPorts = policy.ports || ['23', '135', '139', '445'];
            return rule.action === 'allow' && 
                   rule.destination_port && 
                   suspiciousPorts.some(port => rule.destination_port.includes(port));
        }
        
        return false;
    }

    // Network analysis helper methods
    isAddressSubset(subset, superset) {
        if (!subset || !superset) return false;
        if (superset === 'any') return true;
        if (subset === superset) return true;
        
        // Simple CIDR subset checking (would need proper IP library in production)
        if (superset.includes('/') && subset.includes('/')) {
            // Basic subnet comparison logic
            const [superNet, superMask] = superset.split('/');
            const [subNet, subMask] = subset.split('/');
            return parseInt(subMask) >= parseInt(superMask);
        }
        
        return false;
    }

    isPortSubset(subset, superset) {
        if (!subset || !superset) return false;
        if (superset === 'any') return true;
        if (subset === superset) return true;
        
        // Check if subset ports are contained in superset
        const subsetPorts = subset.split(',').map(p => p.trim());
        const supersetPorts = superset.split(',').map(p => p.trim());
        
        return subsetPorts.every(port => supersetPorts.includes(port));
    }

    isProtocolSubset(subset, superset) {
        if (!subset || !superset) return false;
        if (superset === 'any') return true;
        return subset === superset;
    }

    doRulesMatchSameTraffic(rule1, rule2) {
        return (
            rule1.source_address === rule2.source_address &&
            rule1.destination_address === rule2.destination_address &&
            rule1.destination_port === rule2.destination_port &&
            rule1.protocol === rule2.protocol
        );
    }

    calculateAddressOverlap(addr1, addr2) {
        if (!addr1 || !addr2) return 0;
        if (addr1 === addr2) return 1;
        if (addr1 === 'any' || addr2 === 'any') return 0.5;
        
        // Simplified overlap calculation
        return addr1.includes(addr2) || addr2.includes(addr1) ? 0.8 : 0;
    }

    calculatePortOverlap(port1, port2) {
        if (!port1 || !port2) return 0;
        if (port1 === port2) return 1;
        
        const ports1 = new Set(port1.split(',').map(p => p.trim()));
        const ports2 = new Set(port2.split(',').map(p => p.trim()));
        
        const intersection = new Set([...ports1].filter(p => ports2.has(p)));
        const union = new Set([...ports1, ...ports2]);
        
        return intersection.size / union.size;
    }

    calculateProtocolOverlap(proto1, proto2) {
        if (!proto1 || !proto2) return 0;
        return proto1 === proto2 ? 1 : 0;
    }
}

module.exports = ConflictDetectionEngine; 