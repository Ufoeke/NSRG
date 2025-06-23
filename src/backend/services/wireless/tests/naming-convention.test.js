/**
 * Test Suite for SSID Naming Convention Module
 * Comprehensive tests for advanced naming utilities and validation
 */

const SSIDNamingConvention = require('../naming-convention-module');

// Test configuration
const testConfig = {
    maxLength: 25,
    patterns: {
        test: /^TEST-[A-Z]{2,4}-\d{3}$/
    },
    hierarchies: {
        test: ['department', 'location', 'number']
    }
};

describe('SSID Naming Convention Module', () => {
    let namingConvention;

    beforeEach(() => {
        namingConvention = new SSIDNamingConvention(testConfig);
    });

    describe('Basic Validation', () => {
        test('should validate length constraints', () => {
            const result1 = namingConvention.validateName('CORP');
            expect(result1.valid).toBe(true);
            expect(result1.errors).toHaveLength(0);

            const longName = 'A'.repeat(30);
            const result2 = namingConvention.validateName(longName);
            expect(result2.valid).toBe(false);
            expect(result2.errors.some(e => e.includes('length'))).toBe(true);
        });

        test('should validate allowed characters', () => {
            const result1 = namingConvention.validateName('Valid-Name_123');
            expect(result1.valid).toBe(true);

            const result2 = namingConvention.validateName('Invalid@Name#123');
            expect(result2.valid).toBe(false);
            expect(result2.errors.some(e => e.includes('characters'))).toBe(true);
        });

        test('should reject reserved names', () => {
            const result = namingConvention.validateName('admin');
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('reserved'))).toBe(true);
        });

        test('should reject names with leading/trailing special characters', () => {
            const result1 = namingConvention.validateName('-test');
            const result2 = namingConvention.validateName('test_');
            
            expect(result1.valid).toBe(false);
            expect(result2.valid).toBe(false);
        });
    });

    describe('Pattern Validation', () => {
        test('should validate against predefined patterns', () => {
            const result1 = namingConvention.validateName('CORP-ABC123-CORP', { pattern: 'corporate' });
            expect(result1.valid).toBe(true);

            const result2 = namingConvention.validateName('WRONG-FORMAT', { pattern: 'corporate' });
            expect(result2.valid).toBe(false);
            expect(result2.errors.some(e => e.includes('pattern'))).toBe(true);
        });

        test('should handle unknown patterns gracefully', () => {
            const result = namingConvention.validateName('TEST', { pattern: 'unknown' });
            expect(result.warnings.some(w => w.includes('Unknown pattern'))).toBe(true);
        });
    });

    describe('Hierarchy Validation', () => {
        test('should validate hierarchical structure', () => {
            const result1 = namingConvention.validateName('DEPT-LOC-001', { hierarchy: 'test' });
            expect(result1.valid).toBe(true);

            const result2 = namingConvention.validateName('INCOMPLETE', { hierarchy: 'test' });
            expect(result2.valid).toBe(false);
            expect(result2.errors.some(e => e.includes('hierarchy'))).toBe(true);
        });
    });

    describe('Security Validation', () => {
        test('should warn about security-sensitive terms', () => {
            const result1 = namingConvention.validateName('PASSWORD-WIFI');
            expect(result1.warnings.some(w => w.includes('password'))).toBe(true);

            const result2 = namingConvention.validateName('ADMIN-NETWORK');
            expect(result2.warnings.some(w => w.includes('administrative'))).toBe(true);

            const result3 = namingConvention.validateName('TEST-12345');
            expect(result3.warnings.some(w => w.includes('numeric'))).toBe(true);
        });
    });

    describe('Unique Name Generation', () => {
        test('should generate unique names from templates', () => {
            const template = { pattern: 'CORP-{location}-{dept}' };
            const variables = { location: 'NYC', dept: 'IT' };

            const name1 = namingConvention.generateUniqueName(template, variables);
            const name2 = namingConvention.generateUniqueName(template, variables);

            expect(name1).toBe('CORP-NYC-IT');
            expect(name2).toMatch(/^CORP-NYC-IT-\d{3}$/);
            expect(name1).not.toBe(name2);
        });

        test('should handle collision resolution strategies', () => {
            // Test increment strategy
            const incrementConfig = {
                collisionResolution: { 
                    strategy: 'increment',
                    maxAttempts: 1000 
                }
            };
            const incrementNaming = new SSIDNamingConvention(incrementConfig);
            
            const template = { pattern: 'TEST-COLLISION' };
            const name1 = incrementNaming.generateUniqueName(template);
            const name2 = incrementNaming.generateUniqueName(template);

            expect(name1).toBe('TEST-COLLISION');
            expect(name2).toMatch(/^TEST-COLLISION-\d{3}$/);

            // Test timestamp strategy
            const timestampConfig = {
                collisionResolution: { strategy: 'timestamp' }
            };
            const timestampNaming = new SSIDNamingConvention(timestampConfig);
            
            const name3 = timestampNaming.generateUniqueName(template);
            const name4 = timestampNaming.generateUniqueName(template);

            expect(name3).toBe('TEST-COLLISION');
            expect(name4).toMatch(/^TEST-COLLISION-\d{6}$/);
        });

        test('should throw error after max attempts', () => {
            const limitedConfig = {
                collisionResolution: { maxAttempts: 2 }
            };
            const limitedNaming = new SSIDNamingConvention(limitedConfig);
            
            const template = { pattern: 'LIMITED' };
            
            // Generate first few names
            limitedNaming.generateUniqueName(template);
            limitedNaming.generateUniqueName(template);
            
            // This should throw after max attempts
            expect(() => {
                limitedNaming.generateUniqueName(template);
            }).toThrow('Failed to generate unique SSID name');
        });
    });

    describe('Sequential Name Generation', () => {
        test('should generate sequential names for bulk operations', () => {
            const template = { pattern: 'BULK-{location}' };
            const variables = { location: 'LAB' };

            const names = namingConvention.generateSequentialNames(template, variables, 5);

            expect(names).toHaveLength(5);
            expect(names[0]).toBe('BULK-LAB-001');
            expect(names[1]).toBe('BULK-LAB-002');
            expect(names[4]).toBe('BULK-LAB-005');
        });
    });

    describe('Compliance Analysis', () => {
        test('should analyze enterprise compliance levels', () => {
            // Enterprise-level compliant name
            const analysis1 = namingConvention.analyzeCompliance('CORP-NYC-IT');
            expect(analysis1.level).toBe('enterprise');
            expect(analysis1.riskLevel).toBe('low');
            expect(analysis1.compliant).toBe(true);

            // Non-compliant name (empty string will fail multiple checks)
            const analysis2 = namingConvention.analyzeCompliance('');
            expect(analysis2.level).toBe('none');
            expect(analysis2.riskLevel).toBe('high');
            expect(analysis2.compliant).toBe(false);

            // Partially compliant name (should fail structure for enterprise patterns)
            const analysis3 = namingConvention.analyzeCompliance('OK');
            expect(analysis3.level).toMatch(/basic|standard/);
            expect(analysis3.compliant).toBe(true);
        });

        test('should provide specific compliance recommendations', () => {
            const analysis = namingConvention.analyzeCompliance('badname');
            expect(analysis.recommendations).toContain('Follow hierarchical naming: DEPT-LOC-PURPOSE');
        });
    });

    describe('Alternative Suggestions', () => {
        test('should suggest alternatives for invalid names', () => {
            const validationResult = namingConvention.validateName('Invalid@Name#123');
            const alternatives = namingConvention.suggestAlternatives('Invalid@Name#123', validationResult);

            expect(alternatives.length).toBeGreaterThan(0);
            expect(alternatives.some(alt => alt.includes('CORP'))).toBe(true);
        });

        test('should truncate overly long names', () => {
            const longName = 'ThisIsAVeryLongSSIDNameThatExceedsTheMaximumLength';
            const validationResult = namingConvention.validateName(longName);
            const alternatives = namingConvention.suggestAlternatives(longName, validationResult);

            expect(alternatives.some(alt => alt.length <= namingConvention.config.maxLength)).toBe(true);
        });
    });

    describe('Configuration Management', () => {
        test('should export configuration', () => {
            const config = namingConvention.exportConfig();
            expect(config).toHaveProperty('maxLength');
            expect(config).toHaveProperty('patterns');
            expect(config).toHaveProperty('generatedNamesCount');
        });

        test('should import configuration', () => {
            const newConfig = { maxLength: 20 };
            namingConvention.importConfig(newConfig);
            
            expect(namingConvention.config.maxLength).toBe(20);
        });
    });

    describe('Score Calculation', () => {
        test('should calculate appropriate scores', () => {
            const perfectResult = namingConvention.validateName('PERFECT-NAME');
            expect(perfectResult.score).toBe(100);

            const warningResult = namingConvention.validateName('TEST-NETWORK');
            expect(warningResult.score).toBeLessThan(100);
            expect(warningResult.score).toBeGreaterThan(80);

            const errorResult = namingConvention.validateName('');
            expect(errorResult.score).toBeLessThan(80);
        });
    });
});

// Integration test with actual usage patterns
describe('Integration Tests', () => {
    test('should handle real-world enterprise naming scenarios', () => {
        const enterpriseNaming = new SSIDNamingConvention({
            patterns: {
                corporate: /^[A-Z]{2,4}-[A-Z]{2,4}-(CORP|GUEST|IOT)$/,
                department: /^(IT|HR|SALES|MKT)-[A-Z]{2,4}-\d{2,3}$/
            },
            hierarchies: {
                enterprise: ['company', 'location', 'department', 'purpose']
            }
        });

        // Test corporate naming
        const corpTemplate = { pattern: '{company}-{location}-CORP' };
        const corpVars = { company: 'ACME', location: 'NYC' };
        const corpName = enterpriseNaming.generateUniqueName(corpTemplate, corpVars);
        expect(corpName).toBe('ACME-NYC-CORP');

        // Validate enterprise compliance
        const compliance = enterpriseNaming.analyzeCompliance(corpName);
        expect(compliance.level).toMatch(/standard|enterprise/);

        // Test pattern validation
        const validation = enterpriseNaming.validateName(corpName, { pattern: 'corporate' });
        expect(validation.valid).toBe(true);
    });

    test('should handle bulk generation for large deployments', () => {
        const bulkNaming = new SSIDNamingConvention();
        
        const floorTemplate = { pattern: 'FLOOR-{building}-{floor}' };
        const buildingA_Names = bulkNaming.generateSequentialNames(
            floorTemplate, 
            { building: 'A', floor: 'F' }, 
            10
        );

        expect(buildingA_Names).toHaveLength(10);
        expect(buildingA_Names.every(name => name.startsWith('FLOOR-A-F'))).toBe(true);
        expect(new Set(buildingA_Names).size).toBe(10); // All unique
    });
});

module.exports = {
    SSIDNamingConvention,
    testConfig
}; 