/**
 * VLAN Suggestion Engine - Intelligent VLAN recommendations
 * Provides smart VLAN ID and configuration suggestions based on context
 */

class VlanSuggestionEngine {
    constructor(dbConnection = null) {
        this.db = dbConnection;
        
        // VLAN ranges and purposes
        this.vlanRanges = {
            management: { start: 10, end: 19, description: 'Network management VLANs' },
            servers: { start: 20, end: 99, description: 'Server and infrastructure VLANs' },
            users: { start: 100, end: 299, description: 'User access VLANs' },
            departments: { start: 300, end: 499, description: 'Department-specific VLANs' },
            guest: { start: 500, end: 519, description: 'Guest access VLANs' },
            iot: { start: 520, end: 599, description: 'IoT and device VLANs' },
            voice: { start: 600, end: 699, description: 'Voice/VoIP VLANs' },
            dmz: { start: 700, end: 799, description: 'DMZ and external VLANs' },
            quarantine: { start: 800, end: 819, description: 'Security quarantine VLANs' },
            testing: { start: 900, end: 999, description: 'Testing and development VLANs' },
            custom: { start: 1000, end: 4094, description: 'Custom application VLANs' }
        };

        // Department-specific VLAN suggestions
        this.departmentMappings = {
            'IT': { baseRange: 'departments', offset: 0, priority: 'high' },
            'HR': { baseRange: 'departments', offset: 20, priority: 'medium' },
            'Finance': { baseRange: 'departments', offset: 40, priority: 'high' },
            'Sales': { baseRange: 'departments', offset: 60, priority: 'medium' },
            'Marketing': { baseRange: 'departments', offset: 80, priority: 'medium' },
            'Engineering': { baseRange: 'departments', offset: 100, priority: 'high' },
            'Operations': { baseRange: 'departments', offset: 120, priority: 'medium' },
            'Legal': { baseRange: 'departments', offset: 140, priority: 'high' },
            'Executive': { baseRange: 'departments', offset: 160, priority: 'high' }
        };

        // Common VLAN patterns and best practices
        this.commonPatterns = {
            'small-office': {
                description: 'Small office (< 50 users)',
                vlans: [
                    { purpose: 'management', vlanId: 10, name: 'Management' },
                    { purpose: 'users', vlanId: 100, name: 'Users' },
                    { purpose: 'voice', vlanId: 600, name: 'Voice' },
                    { purpose: 'guest', vlanId: 500, name: 'Guest' }
                ]
            },
            'medium-office': {
                description: 'Medium office (50-200 users)',
                vlans: [
                    { purpose: 'management', vlanId: 10, name: 'Management' },
                    { purpose: 'servers', vlanId: 20, name: 'Servers' },
                    { purpose: 'users', vlanId: 100, name: 'Users' },
                    { purpose: 'departments', vlanId: 300, name: 'IT' },
                    { purpose: 'departments', vlanId: 320, name: 'HR' },
                    { purpose: 'voice', vlanId: 600, name: 'Voice' },
                    { purpose: 'guest', vlanId: 500, name: 'Guest' }
                ]
            },
            'enterprise': {
                description: 'Enterprise (200+ users)',
                vlans: [
                    { purpose: 'management', vlanId: 10, name: 'Management' },
                    { purpose: 'management', vlanId: 11, name: 'Monitoring' },
                    { purpose: 'servers', vlanId: 20, name: 'Core-Servers' },
                    { purpose: 'servers', vlanId: 21, name: 'Web-Servers' },
                    { purpose: 'servers', vlanId: 22, name: 'DB-Servers' },
                    { purpose: 'users', vlanId: 100, name: 'Corporate-Users' },
                    { purpose: 'departments', vlanId: 300, name: 'IT' },
                    { purpose: 'departments', vlanId: 320, name: 'HR' },
                    { purpose: 'departments', vlanId: 340, name: 'Finance' },
                    { purpose: 'departments', vlanId: 360, name: 'Sales' },
                    { purpose: 'voice', vlanId: 600, name: 'Voice' },
                    { purpose: 'guest', vlanId: 500, name: 'Guest' },
                    { purpose: 'iot', vlanId: 520, name: 'IoT-Devices' },
                    { purpose: 'dmz', vlanId: 700, name: 'DMZ' },
                    { purpose: 'quarantine', vlanId: 800, name: 'Quarantine' }
                ]
            }
        };
    }

    /**
     * Initialize the suggestion engine
     */
    async initialize() {
        // Load existing VLAN data if database available
        if (this.db) {
            await this.loadExistingVlans();
        }
        console.log('VLAN Suggestion Engine initialized');
    }

    /**
     * Generate VLAN suggestions based on requirements
     * @param {Object} requirements - VLAN requirements
     * @returns {Promise<Object>} VLAN suggestions
     */
    async generateSuggestions(requirements) {
        const {
            purpose,
            department,
            location,
            userCount,
            deviceCount,
            securityLevel,
            pattern,
            existingVlans = []
        } = requirements;

        const suggestions = {
            recommended: [],
            alternatives: [],
            patterns: [],
            bestPractices: []
        };

        try {
            // Pattern-based suggestions
            if (pattern) {
                suggestions.patterns = this.getPatternSuggestions(pattern, existingVlans);
            }

            // Purpose-based suggestions
            if (purpose) {
                const purposeSuggestions = this.getPurposeSuggestions(purpose, existingVlans);
                suggestions.recommended.push(...purposeSuggestions.recommended);
                suggestions.alternatives.push(...purposeSuggestions.alternatives);
            }

            // Department-based suggestions
            if (department) {
                const deptSuggestions = this.getDepartmentSuggestions(department, existingVlans);
                suggestions.recommended.push(...deptSuggestions);
            }

            // Size-based pattern suggestions
            if (userCount) {
                const sizeSuggestions = this.getSizeBasedSuggestions(userCount, existingVlans);
                suggestions.patterns.push(...sizeSuggestions);
            }

            // Security-based suggestions
            if (securityLevel) {
                const securitySuggestions = this.getSecuritySuggestions(securityLevel, existingVlans);
                suggestions.recommended.push(...securitySuggestions);
            }

            // Best practices
            suggestions.bestPractices = this.getBestPractices(requirements);

            // Remove duplicates and sort by score
            suggestions.recommended = this.deduplicateAndScore(suggestions.recommended);
            suggestions.alternatives = this.deduplicateAndScore(suggestions.alternatives);

            return suggestions;
        } catch (error) {
            console.error('Error generating VLAN suggestions:', error);
            throw error;
        }
    }

    /**
     * Get pattern-based suggestions
     * @param {string} pattern - Pattern type
     * @param {Array} existingVlans - Existing VLANs
     * @returns {Array} Pattern suggestions
     */
    getPatternSuggestions(pattern, existingVlans) {
        const patternConfig = this.commonPatterns[pattern];
        if (!patternConfig) {
            return [];
        }

        const existingIds = new Set(existingVlans.map(v => v.vlanId));
        
        return patternConfig.vlans
            .filter(vlan => !existingIds.has(vlan.vlanId))
            .map(vlan => ({
                ...vlan,
                score: 100,
                reason: `Part of ${pattern} pattern`,
                subnet: this.generateSubnetSuggestion(vlan.purpose),
                security: this.getSecurityRecommendations(vlan.purpose)
            }));
    }

    /**
     * Get purpose-based suggestions
     * @param {string} purpose - VLAN purpose
     * @param {Array} existingVlans - Existing VLANs
     * @returns {Object} Purpose suggestions
     */
    getPurposeSuggestions(purpose, existingVlans) {
        const range = this.vlanRanges[purpose];
        if (!range) {
            return { recommended: [], alternatives: [] };
        }

        const existingIds = new Set(existingVlans.map(v => v.vlanId));
        const recommended = [];
        const alternatives = [];

        // Find available IDs in the purpose range
        for (let id = range.start; id <= range.end; id++) {
            if (!existingIds.has(id)) {
                const suggestion = {
                    vlanId: id,
                    name: this.generateVlanName(purpose, id),
                    purpose,
                    description: range.description,
                    score: this.calculatePurposeScore(id, range),
                    reason: `Optimal for ${purpose} purpose`,
                    subnet: this.generateSubnetSuggestion(purpose),
                    security: this.getSecurityRecommendations(purpose)
                };

                if (recommended.length < 5) {
                    recommended.push(suggestion);
                } else if (alternatives.length < 10) {
                    alternatives.push(suggestion);
                } else {
                    break;
                }
            }
        }

        return { recommended, alternatives };
    }

    /**
     * Get department-based suggestions
     * @param {string} department - Department name
     * @param {Array} existingVlans - Existing VLANs
     * @returns {Array} Department suggestions
     */
    getDepartmentSuggestions(department, existingVlans) {
        const deptConfig = this.departmentMappings[department];
        if (!deptConfig) {
            return [];
        }

        const baseRange = this.vlanRanges[deptConfig.baseRange];
        const startId = baseRange.start + deptConfig.offset;
        const endId = Math.min(startId + 19, baseRange.end);
        
        const existingIds = new Set(existingVlans.map(v => v.vlanId));
        const suggestions = [];

        for (let id = startId; id <= endId && suggestions.length < 5; id++) {
            if (!existingIds.has(id)) {
                suggestions.push({
                    vlanId: id,
                    name: `${department}-${id}`,
                    purpose: 'departments',
                    department,
                    description: `${department} department VLAN`,
                    score: this.calculateDepartmentScore(id, deptConfig),
                    reason: `Allocated for ${department} department`,
                    subnet: this.generateSubnetSuggestion('departments'),
                    security: this.getSecurityRecommendations('departments')
                });
            }
        }

        return suggestions;
    }

    /**
     * Get size-based suggestions
     * @param {number} userCount - Number of users
     * @param {Array} existingVlans - Existing VLANs
     * @returns {Array} Size-based suggestions
     */
    getSizeBasedSuggestions(userCount, existingVlans) {
        let pattern;
        
        if (userCount < 50) {
            pattern = 'small-office';
        } else if (userCount < 200) {
            pattern = 'medium-office';
        } else {
            pattern = 'enterprise';
        }

        return this.getPatternSuggestions(pattern, existingVlans);
    }

    /**
     * Get security-based suggestions
     * @param {string} securityLevel - Security level requirement
     * @param {Array} existingVlans - Existing VLANs
     * @returns {Array} Security suggestions
     */
    getSecuritySuggestions(securityLevel, existingVlans) {
        const suggestions = [];

        if (securityLevel === 'high' || securityLevel === 'strict') {
            // Suggest quarantine VLAN
            const quarantineRange = this.vlanRanges.quarantine;
            const existingIds = new Set(existingVlans.map(v => v.vlanId));
            
            for (let id = quarantineRange.start; id <= quarantineRange.end; id++) {
                if (!existingIds.has(id)) {
                    suggestions.push({
                        vlanId: id,
                        name: `Quarantine-${id}`,
                        purpose: 'quarantine',
                        description: 'Security quarantine VLAN',
                        score: 95,
                        reason: 'Required for high security environments',
                        subnet: this.generateSubnetSuggestion('quarantine'),
                        security: this.getSecurityRecommendations('quarantine')
                    });
                    break;
                }
            }

            // Suggest DMZ VLAN
            const dmzRange = this.vlanRanges.dmz;
            for (let id = dmzRange.start; id <= dmzRange.end; id++) {
                if (!existingIds.has(id)) {
                    suggestions.push({
                        vlanId: id,
                        name: `DMZ-${id}`,
                        purpose: 'dmz',
                        description: 'DMZ VLAN for external services',
                        score: 90,
                        reason: 'Recommended for secure external access',
                        subnet: this.generateSubnetSuggestion('dmz'),
                        security: this.getSecurityRecommendations('dmz')
                    });
                    break;
                }
            }
        }

        return suggestions;
    }

    /**
     * Generate VLAN name based on purpose and ID
     * @param {string} purpose - VLAN purpose
     * @param {number} vlanId - VLAN ID
     * @returns {string} Generated VLAN name
     */
    generateVlanName(purpose, vlanId) {
        const purposeNames = {
            management: 'MGMT',
            servers: 'SRV',
            users: 'USER',
            departments: 'DEPT',
            guest: 'GUEST',
            iot: 'IoT',
            voice: 'VOICE',
            dmz: 'DMZ',
            quarantine: 'QUARANTINE',
            testing: 'TEST',
            custom: 'CUSTOM'
        };

        const prefix = purposeNames[purpose] || purpose.toUpperCase();
        return `${prefix}-${vlanId}`;
    }

    /**
     * Generate subnet suggestion for purpose
     * @param {string} purpose - VLAN purpose
     * @returns {string} Suggested subnet
     */
    generateSubnetSuggestion(purpose) {
        const subnetMappings = {
            management: '10.0.10.0/24',
            servers: '10.0.20.0/24',
            users: '10.1.0.0/22',
            departments: '10.2.0.0/23',
            guest: '10.99.0.0/24',
            iot: '10.50.0.0/24',
            voice: '10.60.0.0/24',
            dmz: '192.168.100.0/24',
            quarantine: '10.0.200.0/24',
            testing: '10.0.250.0/24'
        };

        return subnetMappings[purpose] || '10.0.0.0/24';
    }

    /**
     * Get security recommendations for purpose
     * @param {string} purpose - VLAN purpose
     * @returns {Object} Security recommendations
     */
    getSecurityRecommendations(purpose) {
        const securityProfiles = {
            management: {
                isolation: 'strict',
                acls: ['deny-inter-vlan', 'allow-management-only'],
                monitoring: 'enhanced',
                encryption: 'required'
            },
            servers: {
                isolation: 'moderate',
                acls: ['deny-internet', 'allow-specific-ports'],
                monitoring: 'standard',
                encryption: 'recommended'
            },
            users: {
                isolation: 'basic',
                acls: ['allow-internet', 'deny-infrastructure'],
                monitoring: 'standard',
                encryption: 'optional'
            },
            guest: {
                isolation: 'strict',
                acls: ['internet-only', 'deny-internal'],
                monitoring: 'enhanced',
                encryption: 'recommended'
            },
            quarantine: {
                isolation: 'maximum',
                acls: ['deny-all', 'log-everything'],
                monitoring: 'maximum',
                encryption: 'required'
            }
        };

        return securityProfiles[purpose] || securityProfiles.users;
    }

    /**
     * Calculate score for purpose-based suggestion
     * @param {number} vlanId - VLAN ID
     * @param {Object} range - VLAN range
     * @returns {number} Score (0-100)
     */
    calculatePurposeScore(vlanId, range) {
        const rangeSize = range.end - range.start + 1;
        const position = vlanId - range.start;
        
        // Prefer earlier IDs in range (lower is better)
        const positionScore = 100 - (position / rangeSize) * 30;
        
        // Prefer "nice" numbers (multiples of 5 or 10)
        let niceScore = 0;
        if (vlanId % 10 === 0) niceScore = 20;
        else if (vlanId % 5 === 0) niceScore = 10;
        
        return Math.min(100, positionScore + niceScore);
    }

    /**
     * Calculate score for department-based suggestion
     * @param {number} vlanId - VLAN ID
     * @param {Object} deptConfig - Department configuration
     * @returns {number} Score (0-100)
     */
    calculateDepartmentScore(vlanId, deptConfig) {
        let score = 80; // Base score
        
        // Priority bonus
        if (deptConfig.priority === 'high') score += 15;
        else if (deptConfig.priority === 'medium') score += 10;
        
        // Nice number bonus
        if (vlanId % 10 === 0) score += 5;
        
        return Math.min(100, score);
    }

    /**
     * Remove duplicates and sort by score
     * @param {Array} suggestions - Array of suggestions
     * @returns {Array} Deduplicated and sorted suggestions
     */
    deduplicateAndScore(suggestions) {
        const seen = new Set();
        const unique = suggestions.filter(suggestion => {
            if (seen.has(suggestion.vlanId)) {
                return false;
            }
            seen.add(suggestion.vlanId);
            return true;
        });

        return unique.sort((a, b) => b.score - a.score);
    }

    /**
     * Get best practices recommendations
     * @param {Object} requirements - Original requirements
     * @returns {Array} Best practices
     */
    getBestPractices(requirements) {
        const practices = [
            'Reserve VLAN 1 as the default VLAN (do not use for production)',
            'Use consistent naming conventions across all VLANs',
            'Document VLAN purposes and IP ranges',
            'Implement proper security policies between VLANs',
            'Monitor VLAN utilization and performance',
            'Plan for growth - leave gaps in VLAN numbering',
            'Use voice VLANs for VoIP traffic quality of service',
            'Implement guest VLANs for visitor access',
            'Consider VLAN pruning to optimize trunk links'
        ];

        // Add specific practices based on requirements
        if (requirements.securityLevel === 'high') {
            practices.push('Implement VLAN-based security policies');
            practices.push('Use quarantine VLANs for unknown devices');
        }

        if (requirements.userCount > 100) {
            practices.push('Consider VLAN load balancing for large user populations');
            practices.push('Implement VLAN redundancy for high availability');
        }

        return practices;
    }

    /**
     * Load existing VLANs from database
     */
    async loadExistingVlans() {
        // Placeholder - would load from actual database
        console.log('Loading existing VLANs from database...');
    }
}

module.exports = VlanSuggestionEngine; 