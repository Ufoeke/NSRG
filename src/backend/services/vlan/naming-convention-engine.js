const EventEmitter = require('events');

class VLANNamingConventionEngine extends EventEmitter {
    constructor() {
        super();
        this.conventions = new Map();
        this.organizations = new Map();
        this.nameHistory = new Map();
        this.reservedNames = new Set();
        this.abbreviations = new Map();
        this.patterns = new Map();
        
        this._initializeDefaultConventions();
        this._initializeCommonAbbreviations();
        this._initializeNamingPatterns();
    }

    /**
     * Register a naming convention for an organization
     * @param {Object} convention - Naming convention configuration
     * @returns {Object} Registration result
     */
    registerNamingConvention(convention) {
        const {
            organizationId,
            name,
            description,
            pattern,
            rules = [],
            examples = [],
            constraints = {},
            priority = 1,
            isActive = true
        } = convention;

        const conventionId = `${organizationId}_${name.replace(/\s+/g, '_').toLowerCase()}`;
        
        const conventionObj = {
            id: conventionId,
            organizationId: organizationId,
            name: name,
            description: description,
            pattern: pattern,
            rules: rules,
            examples: examples,
            constraints: {
                maxLength: constraints.maxLength || 32,
                minLength: constraints.minLength || 3,
                allowedCharacters: constraints.allowedCharacters || /^[a-zA-Z0-9_-]+$/,
                requirePrefix: constraints.requirePrefix || false,
                requireSuffix: constraints.requireSuffix || false,
                caseStyle: constraints.caseStyle || 'mixed', // upper, lower, mixed, camel, pascal
                ...constraints
            },
            priority: priority,
            isActive: isActive,
            createdAt: new Date().toISOString(),
            usageCount: 0
        };

        this.conventions.set(conventionId, conventionObj);
        
        this.emit('conventionRegistered', conventionObj);
        
        return {
            success: true,
            conventionId: conventionId,
            convention: conventionObj
        };
    }

    /**
     * Generate VLAN name based on organization's naming convention
     * @param {Object} vlanSpec - VLAN specification
     * @returns {Object} Generated name result
     */
    generateVLANName(vlanSpec) {
        const {
            organizationId,
            purpose,
            department = null,
            location = null,
            vlanId = null,
            environment = 'prod', // prod, dev, test, staging
            securityLevel = 'standard', // high, standard, low
            conventionPreference = null,
            customProperties = {}
        } = vlanSpec;

        try {
            // Get applicable conventions for the organization
            const conventions = this._getApplicableConventions(organizationId, conventionPreference);
            
            if (conventions.length === 0) {
                throw new Error(`No naming conventions found for organization ${organizationId}`);
            }

            // Try each convention in priority order
            for (const convention of conventions) {
                try {
                    const generatedName = this._generateNameUsingConvention(convention, vlanSpec);
                    
                    // Validate the generated name
                    const validation = this._validateGeneratedName(generatedName, convention);
                    
                    if (validation.valid) {
                        // Check for uniqueness
                        const uniqueCheck = this._checkNameUniqueness(generatedName, organizationId);
                        
                        if (uniqueCheck.unique) {
                            // Track name generation
                            this._trackNameGeneration(generatedName, convention, vlanSpec);
                            
                            return {
                                success: true,
                                generatedName: generatedName,
                                convention: convention.name,
                                alternatives: this._generateAlternatives(convention, vlanSpec, 3),
                                metadata: {
                                    pattern: convention.pattern,
                                    appliedRules: validation.appliedRules,
                                    generatedAt: new Date().toISOString()
                                }
                            };
                        } else {
                            // Try with suffix if name exists
                            const uniqueName = this._makeNameUnique(generatedName, organizationId);
                            return {
                                success: true,
                                generatedName: uniqueName,
                                convention: convention.name,
                                wasModifiedForUniqueness: true,
                                originalSuggestion: generatedName,
                                alternatives: this._generateAlternatives(convention, vlanSpec, 3),
                                metadata: {
                                    pattern: convention.pattern,
                                    appliedRules: validation.appliedRules,
                                    generatedAt: new Date().toISOString()
                                }
                            };
                        }
                    }
                } catch (error) {
                    console.warn(`Convention ${convention.name} failed: ${error.message}`);
                    continue;
                }
            }
            
            throw new Error('Unable to generate valid name using any available convention');
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                fallbackSuggestions: this._generateFallbackNames(vlanSpec)
            };
        }
    }

    /**
     * Validate an existing VLAN name against naming conventions
     * @param {string} vlanName - VLAN name to validate
     * @param {string} organizationId - Organization ID
     * @returns {Object} Validation result
     */
    validateVLANName(vlanName, organizationId) {
        const conventions = this._getApplicableConventions(organizationId);
        const validationResults = [];

        for (const convention of conventions) {
            const result = this._validateNameAgainstConvention(vlanName, convention);
            validationResults.push({
                convention: convention.name,
                ...result
            });
        }

        const bestMatch = validationResults.find(r => r.valid) || validationResults[0];
        
        return {
            isValid: bestMatch?.valid || false,
            bestMatchingConvention: bestMatch?.convention,
            score: bestMatch?.score || 0,
            violations: bestMatch?.violations || [],
            suggestions: bestMatch?.suggestions || [],
            allResults: validationResults
        };
    }

    /**
     * Suggest improvements for existing VLAN names
     * @param {Array} existingNames - Array of existing VLAN names
     * @param {string} organizationId - Organization ID
     * @returns {Object} Improvement suggestions
     */
    suggestNamingImprovements(existingNames, organizationId) {
        const improvements = {
            organizationId: organizationId,
            totalNames: existingNames.length,
            suggestions: [],
            patterns: {
                consistent: [],
                inconsistent: [],
                violations: []
            },
            summary: {
                compliantNames: 0,
                nonCompliantNames: 0,
                commonViolations: new Map()
            }
        };

        for (const name of existingNames) {
            const validation = this.validateVLANName(name, organizationId);
            
            if (validation.isValid) {
                improvements.summary.compliantNames++;
                improvements.patterns.consistent.push(name);
            } else {
                improvements.summary.nonCompliantNames++;
                improvements.patterns.inconsistent.push(name);
                
                // Track common violations
                validation.violations.forEach(violation => {
                    const count = improvements.summary.commonViolations.get(violation) || 0;
                    improvements.summary.commonViolations.set(violation, count + 1);
                });
                
                // Add specific improvement suggestion
                improvements.suggestions.push({
                    currentName: name,
                    issues: validation.violations,
                    suggestedName: validation.suggestions[0] || null,
                    alternativeSuggestions: validation.suggestions.slice(1, 4)
                });
            }
        }

        // Generate organizational recommendations
        improvements.organizationalRecommendations = this._generateOrganizationalRecommendations(improvements);
        
        return improvements;
    }

    /**
     * Bulk rename VLANs to comply with naming conventions
     * @param {Array} vlanList - List of VLANs to rename
     * @param {string} organizationId - Organization ID
     * @param {Object} options - Renaming options
     * @returns {Object} Bulk rename plan
     */
    generateBulkRenamePlan(vlanList, organizationId, options = {}) {
        const {
            dryRun = true,
            preferredConvention = null,
            preserveExistingCompliant = true,
            generateBackupPlan = true
        } = options;

        const renamePlan = {
            organizationId: organizationId,
            totalVLANs: vlanList.length,
            operations: [],
            summary: {
                toRename: 0,
                toKeep: 0,
                conflicts: 0
            },
            dryRun: dryRun,
            generatedAt: new Date().toISOString()
        };

        const usedNames = new Set();
        
        for (const vlan of vlanList) {
            const currentName = vlan.name;
            const validation = this.validateVLANName(currentName, organizationId);
            
            if (validation.isValid && preserveExistingCompliant) {
                renamePlan.operations.push({
                    vlanId: vlan.id,
                    currentName: currentName,
                    action: 'keep',
                    reason: 'Already compliant with naming convention'
                });
                renamePlan.summary.toKeep++;
                usedNames.add(currentName);
            } else {
                // Generate new name
                const nameResult = this.generateVLANName({
                    organizationId: organizationId,
                    purpose: vlan.purpose || 'general',
                    department: vlan.department,
                    location: vlan.location,
                    vlanId: vlan.id,
                    environment: vlan.environment || 'prod',
                    conventionPreference: preferredConvention
                });

                if (nameResult.success) {
                    let proposedName = nameResult.generatedName;
                    
                    // Check if proposed name conflicts with existing names in this batch
                    if (usedNames.has(proposedName)) {
                        proposedName = this._resolveNameConflict(proposedName, usedNames);
                        renamePlan.summary.conflicts++;
                    }
                    
                    renamePlan.operations.push({
                        vlanId: vlan.id,
                        currentName: currentName,
                        proposedName: proposedName,
                        action: 'rename',
                        convention: nameResult.convention,
                        alternatives: nameResult.alternatives,
                        issues: validation.violations
                    });
                    
                    usedNames.add(proposedName);
                    renamePlan.summary.toRename++;
                } else {
                    renamePlan.operations.push({
                        vlanId: vlan.id,
                        currentName: currentName,
                        action: 'error',
                        error: nameResult.error,
                        fallbackSuggestions: nameResult.fallbackSuggestions
                    });
                }
            }
        }

        // Generate backup plan if requested
        if (generateBackupPlan) {
            renamePlan.backupPlan = this._generateBackupPlan(renamePlan.operations);
        }

        return renamePlan;
    }

    /**
     * Export naming convention documentation
     * @param {string} organizationId - Organization ID
     * @param {string} format - Export format (markdown, json, html)
     * @returns {Object} Documentation export
     */
    exportNamingDocumentation(organizationId, format = 'markdown') {
        const conventions = this._getApplicableConventions(organizationId);
        const organization = this.organizations.get(organizationId);
        
        const documentation = {
            organizationId: organizationId,
            organizationName: organization?.name || organizationId,
            conventions: conventions,
            generatedAt: new Date().toISOString(),
            format: format
        };

        switch (format.toLowerCase()) {
            case 'markdown':
                documentation.content = this._generateMarkdownDocumentation(documentation);
                break;
            case 'html':
                documentation.content = this._generateHTMLDocumentation(documentation);
                break;
            case 'json':
            default:
                documentation.content = JSON.stringify(documentation, null, 2);
                break;
        }

        return documentation;
    }

    // Private helper methods

    _initializeDefaultConventions() {
        // Standard enterprise naming convention
        this.registerNamingConvention({
            organizationId: 'default',
            name: 'Enterprise Standard',
            description: 'Standard enterprise VLAN naming convention',
            pattern: '{location}_{purpose}_{environment}_{id}',
            rules: [
                'Use underscores as separators',
                'Keep names under 32 characters',
                'Use standard abbreviations',
                'Include location when applicable'
            ],
            examples: [
                'NYC_USERS_PROD_100',
                'LA_SERVERS_DEV_200',
                'CHI_GUEST_PROD_300'
            ],
            constraints: {
                maxLength: 32,
                caseStyle: 'upper'
            }
        });

        // Simple departmental convention
        this.registerNamingConvention({
            organizationId: 'default',
            name: 'Departmental Simple',
            description: 'Simple department-based naming',
            pattern: '{department}_{purpose}',
            rules: [
                'Department abbreviation followed by purpose',
                'Use title case',
                'No special characters except hyphens'
            ],
            examples: [
                'IT-Management',
                'HR-Users',
                'Finance-Servers'
            ],
            constraints: {
                maxLength: 24,
                caseStyle: 'mixed',
                allowedCharacters: /^[a-zA-Z0-9-]+$/
            }
        });
    }

    _initializeCommonAbbreviations() {
        const abbreviations = {
            // Locations
            'New York': 'NYC',
            'Los Angeles': 'LA',
            'Chicago': 'CHI',
            'San Francisco': 'SF',
            'Boston': 'BOS',
            'Seattle': 'SEA',
            'Atlanta': 'ATL',
            'Dallas': 'DAL',
            
            // Departments
            'Information Technology': 'IT',
            'Human Resources': 'HR',
            'Research and Development': 'RND',
            'Customer Service': 'CS',
            'Quality Assurance': 'QA',
            'Operations': 'OPS',
            'Marketing': 'MKTG',
            'Sales': 'SALES',
            'Finance': 'FIN',
            'Legal': 'LEGAL',
            'Facilities': 'FAC',
            
            // Purposes
            'Management': 'MGMT',
            'Users': 'USERS',
            'Servers': 'SRVR',
            'Database': 'DB',
            'Web Servers': 'WEB',
            'Application': 'APP',
            'Voice over IP': 'VOIP',
            'Wireless': 'WIFI',
            'Internet of Things': 'IOT',
            'Guest Network': 'GUEST',
            'Demilitarized Zone': 'DMZ',
            'Backup': 'BKUP',
            'Storage': 'STOR',
            'Printer': 'PRINT',
            
            // Environments
            'Production': 'PROD',
            'Development': 'DEV',
            'Testing': 'TEST',
            'Staging': 'STAGE',
            'Quality Assurance': 'QA',
            'User Acceptance Testing': 'UAT'
        };

        for (const [full, abbrev] of Object.entries(abbreviations)) {
            this.abbreviations.set(full.toLowerCase(), abbrev);
        }
    }

    _initializeNamingPatterns() {
        this.patterns.set('location_purpose_env', {
            pattern: '{location}_{purpose}_{environment}',
            description: 'Location, purpose, and environment',
            example: 'NYC_USERS_PROD'
        });

        this.patterns.set('dept_purpose_id', {
            pattern: '{department}_{purpose}_{id}',
            description: 'Department, purpose, and VLAN ID',
            example: 'IT_MGMT_10'
        });

        this.patterns.set('simple_descriptive', {
            pattern: '{purpose}_{modifier}',
            description: 'Simple descriptive naming',
            example: 'USERS_MAIN'
        });
    }

    _getApplicableConventions(organizationId, preferredConvention = null) {
        const conventions = Array.from(this.conventions.values())
            .filter(conv => conv.organizationId === organizationId || conv.organizationId === 'default')
            .filter(conv => conv.isActive)
            .sort((a, b) => b.priority - a.priority);

        if (preferredConvention) {
            const preferred = conventions.find(conv => conv.name === preferredConvention);
            if (preferred) {
                return [preferred, ...conventions.filter(conv => conv.name !== preferredConvention)];
            }
        }

        return conventions;
    }

    _generateNameUsingConvention(convention, vlanSpec) {
        let pattern = convention.pattern;
        const substitutions = {
            location: this._getLocationCode(vlanSpec.location),
            department: this._getDepartmentCode(vlanSpec.department),
            purpose: this._getPurposeCode(vlanSpec.purpose),
            environment: this._getEnvironmentCode(vlanSpec.environment),
            security: this._getSecurityCode(vlanSpec.securityLevel),
            id: vlanSpec.vlanId ? vlanSpec.vlanId.toString() : null
        };

        // Add custom property substitutions
        Object.assign(substitutions, vlanSpec.customProperties || {});

        // Replace pattern placeholders
        for (const [key, value] of Object.entries(substitutions)) {
            if (value !== null && value !== undefined) {
                pattern = pattern.replace(new RegExp(`{${key}}`, 'g'), value);
            }
        }

        // Remove any remaining placeholders
        pattern = pattern.replace(/{[^}]+}/g, '');
        
        // Clean up multiple separators
        pattern = pattern.replace(/[_-]+/g, match => match[0]);
        
        // Remove leading/trailing separators
        pattern = pattern.replace(/^[_-]+|[_-]+$/g, '');

        // Apply case style
        pattern = this._applyCaseStyle(pattern, convention.constraints.caseStyle);

        return pattern;
    }

    _validateGeneratedName(name, convention) {
        const validation = {
            valid: true,
            appliedRules: [],
            violations: []
        };

        // Check length constraints
        if (name.length > convention.constraints.maxLength) {
            validation.valid = false;
            validation.violations.push(`Exceeds maximum length of ${convention.constraints.maxLength}`);
        }

        if (name.length < convention.constraints.minLength) {
            validation.valid = false;
            validation.violations.push(`Below minimum length of ${convention.constraints.minLength}`);
        }

        // Check character constraints
        if (!convention.constraints.allowedCharacters.test(name)) {
            validation.valid = false;
            validation.violations.push('Contains invalid characters');
        }

        // Check reserved names
        if (this.reservedNames.has(name.toLowerCase())) {
            validation.valid = false;
            validation.violations.push('Name is reserved');
        }

        return validation;
    }

    _checkNameUniqueness(name, organizationId) {
        const nameKey = `${organizationId}:${name.toLowerCase()}`;
        return {
            unique: !this.nameHistory.has(nameKey),
            existingUsage: this.nameHistory.get(nameKey) || null
        };
    }

    _makeNameUnique(baseName, organizationId) {
        let counter = 1;
        let uniqueName = baseName;
        
        while (!this._checkNameUniqueness(uniqueName, organizationId).unique) {
            uniqueName = `${baseName}_${counter}`;
            counter++;
            
            if (counter > 999) {
                // Fallback to timestamp suffix
                uniqueName = `${baseName}_${Date.now().toString().slice(-6)}`;
                break;
            }
        }
        
        return uniqueName;
    }

    _generateAlternatives(convention, vlanSpec, count = 3) {
        const alternatives = [];
        
        // Try different pattern variations
        const alternativePatterns = [
            convention.pattern.replace('{environment}', ''),
            convention.pattern.replace('{location}', ''),
            convention.pattern.replace('{id}', '')
        ];

        for (const altPattern of alternativePatterns) {
            if (alternatives.length >= count) break;
            
            try {
                const altConvention = { ...convention, pattern: altPattern };
                const altName = this._generateNameUsingConvention(altConvention, vlanSpec);
                
                if (altName !== convention.pattern && !alternatives.includes(altName)) {
                    alternatives.push(altName);
                }
            } catch (error) {
                continue;
            }
        }

        return alternatives;
    }

    _generateFallbackNames(vlanSpec) {
        const fallbacks = [];
        
        // Simple concatenation fallbacks
        if (vlanSpec.purpose) {
            fallbacks.push(vlanSpec.purpose.toUpperCase());
        }
        
        if (vlanSpec.department && vlanSpec.purpose) {
            fallbacks.push(`${vlanSpec.department.toUpperCase()}_${vlanSpec.purpose.toUpperCase()}`);
        }
        
        if (vlanSpec.vlanId) {
            fallbacks.push(`VLAN_${vlanSpec.vlanId}`);
        }
        
        return fallbacks;
    }

    _validateNameAgainstConvention(name, convention) {
        // Implement convention-specific validation logic
        return {
            valid: convention.constraints.allowedCharacters.test(name) && 
                   name.length <= convention.constraints.maxLength &&
                   name.length >= convention.constraints.minLength,
            score: 85, // Simplified scoring
            violations: [],
            suggestions: []
        };
    }

    _getLocationCode(location) {
        if (!location) return null;
        return this.abbreviations.get(location.toLowerCase()) || location.substring(0, 3).toUpperCase();
    }

    _getDepartmentCode(department) {
        if (!department) return null;
        return this.abbreviations.get(department.toLowerCase()) || department.substring(0, 4).toUpperCase();
    }

    _getPurposeCode(purpose) {
        if (!purpose) return null;
        return this.abbreviations.get(purpose.toLowerCase()) || purpose.toUpperCase();
    }

    _getEnvironmentCode(environment) {
        if (!environment) return null;
        return this.abbreviations.get(environment.toLowerCase()) || environment.substring(0, 4).toUpperCase();
    }

    _getSecurityCode(securityLevel) {
        const codes = {
            'high': 'SEC',
            'medium': 'STD',
            'low': 'PUB'
        };
        return codes[securityLevel] || null;
    }

    _applyCaseStyle(text, caseStyle) {
        switch (caseStyle) {
            case 'upper':
                return text.toUpperCase();
            case 'lower':
                return text.toLowerCase();
            case 'camel':
                return text.replace(/_(.)/g, (_, char) => char.toUpperCase()).replace(/^(.)/, char => char.toLowerCase());
            case 'pascal':
                return text.replace(/_(.)/g, (_, char) => char.toUpperCase()).replace(/^(.)/, char => char.toUpperCase());
            case 'mixed':
            default:
                return text;
        }
    }

    _trackNameGeneration(name, convention, vlanSpec) {
        const nameKey = `${vlanSpec.organizationId}:${name.toLowerCase()}`;
        this.nameHistory.set(nameKey, {
            name: name,
            convention: convention.name,
            generatedAt: new Date().toISOString(),
            vlanSpec: vlanSpec
        });
        
        convention.usageCount++;
    }

    _generateOrganizationalRecommendations(improvements) {
        const recommendations = [];
        
        const complianceRate = (improvements.summary.compliantNames / improvements.totalNames) * 100;
        
        if (complianceRate < 50) {
            recommendations.push('Consider implementing stricter naming conventions');
            recommendations.push('Provide naming convention training to network administrators');
        }
        
        if (improvements.summary.commonViolations.size > 0) {
            const topViolation = Array.from(improvements.summary.commonViolations.entries())
                .sort(([,a], [,b]) => b - a)[0];
            recommendations.push(`Address common violation: ${topViolation[0]} (affects ${topViolation[1]} VLANs)`);
        }
        
        recommendations.push('Implement automated name validation in VLAN creation workflows');
        
        return recommendations;
    }

    _resolveNameConflict(baseName, usedNames) {
        let counter = 1;
        let resolvedName = `${baseName}_${counter}`;
        
        while (usedNames.has(resolvedName)) {
            counter++;
            resolvedName = `${baseName}_${counter}`;
        }
        
        return resolvedName;
    }

    _generateBackupPlan(operations) {
        return {
            description: 'Rollback plan for bulk rename operation',
            rollbackOperations: operations
                .filter(op => op.action === 'rename')
                .map(op => ({
                    vlanId: op.vlanId,
                    restoreName: op.currentName,
                    currentName: op.proposedName
                }))
        };
    }

    _generateMarkdownDocumentation(documentation) {
        let markdown = `# VLAN Naming Conventions\n\n`;
        markdown += `**Organization:** ${documentation.organizationName}\n`;
        markdown += `**Generated:** ${documentation.generatedAt}\n\n`;
        
        for (const convention of documentation.conventions) {
            markdown += `## ${convention.name}\n\n`;
            markdown += `${convention.description}\n\n`;
            markdown += `**Pattern:** \`${convention.pattern}\`\n\n`;
            
            if (convention.rules.length > 0) {
                markdown += `**Rules:**\n`;
                convention.rules.forEach(rule => markdown += `- ${rule}\n`);
                markdown += `\n`;
            }
            
            if (convention.examples.length > 0) {
                markdown += `**Examples:**\n`;
                convention.examples.forEach(example => markdown += `- \`${example}\`\n`);
                markdown += `\n`;
            }
        }
        
        return markdown;
    }

    _generateHTMLDocumentation(documentation) {
        // Simplified HTML generation - would be more comprehensive in practice
        return `<html><head><title>VLAN Naming Conventions</title></head><body>
            <h1>VLAN Naming Conventions</h1>
            <p><strong>Organization:</strong> ${documentation.organizationName}</p>
            <p><strong>Generated:</strong> ${documentation.generatedAt}</p>
            <!-- Convention details would be rendered here -->
            </body></html>`;
    }
}

module.exports = VLANNamingConventionEngine;