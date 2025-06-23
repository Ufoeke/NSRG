/**
 * Enhanced SSID Naming Convention Module
 * Advanced utilities for SSID naming conventions, validation, and unique identifier generation
 * Provides enterprise-grade naming patterns and collision detection
 */

class SSIDNamingConvention {
    constructor(config = {}) {
        const defaultConfig = {
            // Basic naming rules
            maxLength: 32,
            minLength: 1,
            allowedCharacters: /^[a-zA-Z0-9_-]+$/,
            reservedNames: ['admin', 'system', 'guest', 'default', 'test', 'setup', 'config'],
            
            // Advanced pattern rules
            patterns: {
                corporate: /^[A-Z]{2,4}-[A-Z0-9]{2,8}-(CORP|GUEST|IOT|DEV)$/,
                department: /^[A-Z]{2,6}-[A-Z]{2,4}-[0-9]{1,3}$/,
                location: /^[A-Z]{2,4}-[A-Z]{2,4}-[F][0-9]{1,2}$/,
                purpose: /^(CORP|GUEST|IOT|BYOD|DEV|TEST)-[A-Z0-9-]{1,20}$/
            },
            
            // Naming hierarchies
            hierarchies: {
                enterprise: ['organization', 'location', 'department', 'purpose'],
                simple: ['location', 'purpose'],
                minimal: ['purpose']
            },
            
            // Auto-generation rules
            autoIncrement: {
                enabled: true,
                padding: 3, // 001, 002, etc.
                separator: '-'
            },
            
            // Collision resolution
            collisionResolution: {
                strategy: 'increment', // 'increment', 'timestamp', 'random'
                maxAttempts: 1000
            }
        };
        
        // Deep merge config
        this.config = this._deepMerge(defaultConfig, config || {});
        
        // Cache for pattern validation
        this.patternCache = new Map();
        
        // History of generated names for uniqueness tracking
        this.generatedNames = new Set();
    }

    /**
     * Validate SSID name against all configured rules
     * @param {string} ssidName - SSID name to validate
     * @param {Object} options - Validation options
     * @returns {Object} Validation result with details
     */
    validateName(ssidName, options = {}) {
        const result = {
            valid: false,
            name: ssidName,
            errors: [],
            warnings: [],
            suggestions: [],
            score: 0
        };

        try {
            // Basic validation
            this._validateBasicRules(ssidName, result);
            
            // Pattern validation
            if (options.pattern) {
                this._validatePattern(ssidName, options.pattern, result);
            }
            
            // Hierarchy validation
            if (options.hierarchy) {
                this._validateHierarchy(ssidName, options.hierarchy, result);
            }
            
            // Security validation
            this._validateSecurity(ssidName, result);
            
            // Calculate overall score
            result.score = this._calculateScore(result);
            result.valid = result.errors.length === 0;
            
            return result;
            
        } catch (error) {
            result.errors.push(error.message);
            return result;
        }
    }

    /**
     * Generate unique SSID name using template and variables
     * @param {Object} template - Naming template
     * @param {Object} variables - Variable values
     * @param {Object} options - Generation options
     * @returns {string} Generated unique SSID name
     */
    generateUniqueName(template, variables = {}, options = {}) {
        let attempts = 0;
        const maxAttempts = options.maxAttempts || this.config.collisionResolution.maxAttempts;
        
        while (attempts < maxAttempts) {
            const name = this._generateName(template, variables, attempts);
            
            if (!this.generatedNames.has(name.toLowerCase())) {
                this.generatedNames.add(name.toLowerCase());
                return name;
            }
            
            attempts++;
        }
        
        throw new Error(`Failed to generate unique SSID name after ${maxAttempts} attempts`);
    }

    /**
     * Generate sequential SSID names for bulk operations
     * @param {Object} template - Base template
     * @param {Object} variables - Base variables
     * @param {number} count - Number of names to generate
     * @returns {Array} Array of unique SSID names
     */
    generateSequentialNames(template, variables, count) {
        const names = [];
        const basePattern = template.pattern || template;
        
        for (let i = 1; i <= count; i++) {
            const seqVariables = {
                ...variables,
                sequence: this._padNumber(i, this.config.autoIncrement.padding)
            };
            
            const name = this.generateUniqueName(
                { pattern: basePattern + '-{sequence}' },
                seqVariables
            );
            
            names.push(name);
        }
        
        return names;
    }

    /**
     * Analyze SSID name compliance with enterprise standards
     * @param {string} ssidName - SSID name to analyze
     * @returns {Object} Compliance analysis
     */
    analyzeCompliance(ssidName) {
        const analysis = {
            name: ssidName,
            compliant: false,
            level: 'none', // none, basic, standard, enterprise
            checks: {
                length: false,
                characters: false,
                structure: false,
                security: false,
                uniqueness: false
            },
            recommendations: [],
            riskLevel: 'high' // low, medium, high
        };

        // Length check
        analysis.checks.length = ssidName.length >= this.config.minLength && 
                                ssidName.length <= this.config.maxLength;

        // Character check
        analysis.checks.characters = this.config.allowedCharacters.test(ssidName);

        // Structure check (hierarchical naming)
        analysis.checks.structure = this._checkStructure(ssidName);

        // Security check (non-revealing)
        analysis.checks.security = this._checkSecurity(ssidName);

        // Uniqueness check
        analysis.checks.uniqueness = !this.generatedNames.has(ssidName.toLowerCase());

        // Determine compliance level
        const passedChecks = Object.values(analysis.checks).filter(Boolean).length;
        if (passedChecks === 5) {
            analysis.level = 'enterprise';
            analysis.riskLevel = 'low';
        } else if (passedChecks >= 4) {
            analysis.level = 'standard';
            analysis.riskLevel = 'medium';
        } else if (passedChecks >= 3) {
            analysis.level = 'basic';
            analysis.riskLevel = 'medium';
        }

        analysis.compliant = analysis.level !== 'none';

        // Generate recommendations
        analysis.recommendations = this._generateRecommendations(analysis);

        return analysis;
    }

    /**
     * Suggest alternative names based on failed validation
     * @param {string} originalName - Original SSID name
     * @param {Object} validationResult - Validation result
     * @returns {Array} Array of suggested alternatives
     */
    suggestAlternatives(originalName, validationResult) {
        const suggestions = [];
        
        // Fix length issues
        if (validationResult.errors.some(e => e.includes('length'))) {
            if (originalName.length > this.config.maxLength) {
                suggestions.push(this._truncateName(originalName));
            }
        }
        
        // Fix character issues
        if (validationResult.errors.some(e => e.includes('characters'))) {
            suggestions.push(this._sanitizeCharacters(originalName));
        }
        
        // Add enterprise-compliant alternatives
        suggestions.push(...this._generateEnterpriseAlternatives(originalName));
        
        // Ensure uniqueness
        return suggestions.filter(name => !this.generatedNames.has(name.toLowerCase()));
    }

    /**
     * Export naming convention configuration
     * @returns {Object} Configuration object
     */
    exportConfig() {
        return {
            ...this.config,
            generatedNamesCount: this.generatedNames.size,
            patternCacheSize: this.patternCache.size
        };
    }

    /**
     * Import naming convention configuration
     * @param {Object} config - Configuration to import
     */
    importConfig(config) {
        this.config = { ...this.config, ...config };
        this.patternCache.clear(); // Clear cache after config change
    }

    // Private methods

    _validateBasicRules(name, result) {
        // Length validation
        if (name.length > this.config.maxLength) {
            result.errors.push(`Name exceeds maximum length of ${this.config.maxLength} characters`);
        }
        if (name.length < this.config.minLength) {
            result.errors.push(`Name is below minimum length of ${this.config.minLength} characters`);
        }

        // Character validation
        if (!this.config.allowedCharacters.test(name)) {
            result.errors.push('Name contains invalid characters');
        }

        // Reserved names
        if (this.config.reservedNames.includes(name.toLowerCase())) {
            result.errors.push('Name is reserved and cannot be used');
        }

        // Leading/trailing validation
        if (name.startsWith('-') || name.startsWith('_') || 
            name.endsWith('-') || name.endsWith('_')) {
            result.errors.push('Name cannot start or end with special characters');
        }
    }

    _validatePattern(name, patternName, result) {
        const pattern = this.config.patterns[patternName];
        if (!pattern) {
            result.warnings.push(`Unknown pattern: ${patternName}`);
            return;
        }

        if (!pattern.test(name)) {
            result.errors.push(`Name does not match required pattern: ${patternName}`);
            result.suggestions.push(`Use pattern: ${pattern.source}`);
        }
    }

    _validateHierarchy(name, hierarchyName, result) {
        const hierarchy = this.config.hierarchies[hierarchyName];
        if (!hierarchy) {
            result.warnings.push(`Unknown hierarchy: ${hierarchyName}`);
            return;
        }

        const parts = name.split('-');
        if (parts.length < hierarchy.length) {
            result.errors.push(`Name does not follow ${hierarchyName} hierarchy`);
            result.suggestions.push(`Include: ${hierarchy.join(' -> ')}`);
        }
    }

    _validateSecurity(name, result) {
        // Check for common security issues
        const securityIssues = [
            { pattern: /password|pwd|pass/i, message: 'Avoid password-related terms' },
            { pattern: /admin|root|super/i, message: 'Avoid administrative terms' },
            { pattern: /test|debug|dev/i, message: 'Avoid development terms in production' },
            { pattern: /\d{4,}/i, message: 'Avoid long numeric sequences' }
        ];

        securityIssues.forEach(issue => {
            if (issue.pattern.test(name)) {
                result.warnings.push(issue.message);
            }
        });
    }

    _calculateScore(result) {
        let score = 100;
        score -= result.errors.length * 20;
        score -= result.warnings.length * 5;
        return Math.max(0, score);
    }

    _generateName(template, variables, attempt) {
        let name = template.pattern || template;
        
        // Substitute variables
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            name = name.replace(new RegExp(placeholder, 'g'), value);
        }
        
        // Apply collision resolution if needed
        if (attempt > 0) {
            name = this._applyCollisionResolution(name, attempt);
        }
        
        return name;
    }

    _applyCollisionResolution(name, attempt) {
        switch (this.config.collisionResolution.strategy) {
            case 'increment':
                return `${name}${this.config.autoIncrement.separator}${this._padNumber(attempt, this.config.autoIncrement.padding)}`;
            case 'timestamp':
                return `${name}${this.config.autoIncrement.separator}${Date.now().toString().slice(-6)}`;
            case 'random':
                return `${name}${this.config.autoIncrement.separator}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            default:
                return `${name}${attempt}`;
        }
    }

    _padNumber(num, padding) {
        return num.toString().padStart(padding, '0');
    }

    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && 
                !Array.isArray(source[key]) && !(source[key] instanceof RegExp)) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    _checkStructure(name) {
        // Check if name follows hierarchical structure
        const parts = name.split('-');
        return parts.length >= 2 && parts.every(part => part.length > 0);
    }

    _checkSecurity(name) {
        // Basic security check - not revealing sensitive information
        const sensitivePatterns = [
            /password|pwd|pass/i,
            /secret|key|token/i,
            /admin|root|super/i,
            /\d{3,}/i // Long numbers
        ];
        
        return !sensitivePatterns.some(pattern => pattern.test(name));
    }

    _generateRecommendations(analysis) {
        const recommendations = [];
        
        if (!analysis.checks.length) {
            recommendations.push(`Adjust name length to ${this.config.minLength}-${this.config.maxLength} characters`);
        }
        
        if (!analysis.checks.characters) {
            recommendations.push('Use only alphanumeric characters, hyphens, and underscores');
        }
        
        if (!analysis.checks.structure) {
            recommendations.push('Follow hierarchical naming: DEPT-LOC-PURPOSE');
        }
        
        if (!analysis.checks.security) {
            recommendations.push('Avoid revealing sensitive or system information');
        }
        
        return recommendations;
    }

    _truncateName(name) {
        if (name.length <= this.config.maxLength) return name;
        return name.substring(0, this.config.maxLength - 3) + '...';
    }

    _sanitizeCharacters(name) {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _generateEnterpriseAlternatives(originalName) {
        const alternatives = [];
        const baseName = originalName.replace(/[^a-zA-Z0-9]/g, '');
        
        // Corporate patterns
        alternatives.push(`CORP-${baseName.toUpperCase()}`);
        alternatives.push(`ENT-${baseName.substring(0, 8).toUpperCase()}`);
        alternatives.push(`${baseName.substring(0, 4).toUpperCase()}-NET`);
        
        return alternatives.filter(alt => alt.length <= this.config.maxLength);
    }
}

module.exports = SSIDNamingConvention; 