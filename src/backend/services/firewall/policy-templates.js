const logger = require('../../shared/logger');

/**
 * Firewall Policy Templates
 * Provides pre-built policy templates for different industries and security frameworks
 */
class PolicyTemplates {
    constructor() {
        this.templates = this.loadTemplates();
    }

    /**
     * Get all available policy templates
     * @returns {Array<object>} Available templates
     */
    getAvailableTemplates() {
        return Object.keys(this.templates).map(key => ({
            id: key,
            name: this.templates[key].name,
            description: this.templates[key].description,
            category: this.templates[key].category,
            compliance: this.templates[key].compliance,
            difficulty: this.templates[key].difficulty,
            ruleCount: this.templates[key].rules.length
        }));
    }

    /**
     * Get a specific template by ID
     * @param {string} templateId - Template identifier
     * @returns {object} Template data
     */
    getTemplate(templateId) {
        return this.templates[templateId] || null;
    }

    /**
     * Apply a template to generate rules
     * @param {string} templateId - Template to apply
     * @param {object} context - Application context (network info, etc.)
     * @returns {Array<object>} Generated rules
     */
    applyTemplate(templateId, context = {}) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        const rules = [];
        let ruleOrder = context.startingOrder || 100;

        for (const ruleTemplate of template.rules) {
            const rule = this.processRuleTemplate(ruleTemplate, context);
            rule.rule_order = ruleOrder;
            rule.template_id = templateId;
            rule.template_name = template.name;
            rules.push(rule);
            ruleOrder += 10;
        }

        return rules;
    }

    /**
     * Generate rules based on multiple templates
     * @param {Array<string>} templateIds - Templates to combine
     * @param {object} context - Application context
     * @returns {Array<object>} Combined generated rules
     */
    combineTemplates(templateIds, context = {}) {
        const allRules = [];
        let currentOrder = context.startingOrder || 100;

        for (const templateId of templateIds) {
            const templateRules = this.applyTemplate(templateId, {
                ...context,
                startingOrder: currentOrder
            });
            allRules.push(...templateRules);
            currentOrder += templateRules.length * 10;
        }

        return this.optimizeRuleSet(allRules);
    }

    /**
     * Process a single rule template
     * @param {object} ruleTemplate - Template rule definition
     * @param {object} context - Application context
     * @returns {object} Generated rule
     */
    processRuleTemplate(ruleTemplate, context) {
        let rule = { ...ruleTemplate };

        // Replace template variables
        rule = this.replaceTemplateVariables(rule, context);

        // Set default values
        rule.enabled = rule.enabled !== false;
        rule.created_at = new Date().toISOString();
        rule.created_by = context.userId || 'system';

        // Generate unique rule ID if not provided
        if (!rule.rule_id) {
            rule.rule_id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        return rule;
    }

    /**
     * Replace template variables with actual values
     * @param {object} rule - Rule with variables
     * @param {object} context - Context with variable values
     * @returns {object} Rule with resolved variables
     */
    replaceTemplateVariables(rule, context) {
        const processed = { ...rule };
        const variables = context.variables || {};

        // Standard variable mappings
        const standardVariables = {
            '{{INTERNAL_NETWORKS}}': context.internalNetworks || '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
            '{{DMZ_NETWORKS}}': context.dmzNetworks || '192.168.100.0/24',
            '{{ADMIN_NETWORKS}}': context.adminNetworks || '192.168.1.0/24',
            '{{WEB_SERVERS}}': context.webServers || '192.168.10.0/24',
            '{{DATABASE_SERVERS}}': context.databaseServers || '192.168.20.0/24',
            '{{EMAIL_SERVERS}}': context.emailServers || '192.168.30.0/24',
            '{{DNS_SERVERS}}': context.dnsServers || '8.8.8.8,8.8.4.4',
            '{{NTP_SERVERS}}': context.ntpServers || 'pool.ntp.org',
            '{{COMPANY_NAME}}': context.companyName || 'Organization'
        };

        // Merge with custom variables
        const allVariables = { ...standardVariables, ...variables };

        // Replace variables in all string fields
        Object.keys(processed).forEach(key => {
            if (typeof processed[key] === 'string') {
                Object.keys(allVariables).forEach(variable => {
                    processed[key] = processed[key].replace(
                        new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                        allVariables[variable]
                    );
                });
            }
        });

        return processed;
    }

    /**
     * Optimize a rule set by removing duplicates and conflicts
     * @param {Array<object>} rules - Rules to optimize
     * @returns {Array<object>} Optimized rules
     */
    optimizeRuleSet(rules) {
        // Remove exact duplicates
        const uniqueRules = [];
        const seen = new Set();

        for (const rule of rules) {
            const signature = this.getRuleSignature(rule);
            if (!seen.has(signature)) {
                seen.add(signature);
                uniqueRules.push(rule);
            }
        }

        // Sort by priority and order
        return uniqueRules.sort((a, b) => {
            const priorityA = parseInt(a.priority) || 50;
            const priorityB = parseInt(b.priority) || 50;
            if (priorityA !== priorityB) {
                return priorityB - priorityA; // Higher priority first
            }
            return (a.rule_order || 0) - (b.rule_order || 0);
        });
    }

    /**
     * Generate a signature for rule deduplication
     * @param {object} rule - Rule to generate signature for
     * @returns {string} Rule signature
     */
    getRuleSignature(rule) {
        return `${rule.source_address}_${rule.destination_address}_${rule.destination_port}_${rule.protocol}_${rule.action}`;
    }

    /**
     * Load all policy templates
     * @returns {object} Templates object
     */
    loadTemplates() {
        return {
            // Basic Security Template
            basic_security: {
                name: 'Basic Security',
                description: 'Fundamental security rules for any network',
                category: 'Security',
                compliance: ['General'],
                difficulty: 'Beginner',
                rules: [
                    {
                        name: 'Block External Access to Internal Services',
                        description: 'Prevent external access to internal network services',
                        source_address: 'any',
                        destination_address: '{{INTERNAL_NETWORKS}}',
                        destination_port: '135,139,445,1433,3306,3389',
                        protocol: 'TCP',
                        action: 'deny',
                        priority: 95,
                        tags: ['security', 'basic']
                    },
                    {
                        name: 'Block Telnet Access',
                        description: 'Block insecure Telnet protocol',
                        source_address: 'any',
                        destination_address: 'any',
                        destination_port: '23',
                        protocol: 'TCP',
                        action: 'deny',
                        priority: 90,
                        tags: ['security', 'telnet']
                    },
                    {
                        name: 'Allow DNS Queries',
                        description: 'Allow DNS resolution',
                        source_address: '{{INTERNAL_NETWORKS}}',
                        destination_address: 'any',
                        destination_port: '53',
                        protocol: 'UDP',
                        action: 'allow',
                        priority: 80,
                        tags: ['dns', 'essential']
                    },
                    {
                        name: 'Allow NTP Synchronization',
                        description: 'Allow time synchronization',
                        source_address: '{{INTERNAL_NETWORKS}}',
                        destination_address: 'any',
                        destination_port: '123',
                        protocol: 'UDP',
                        action: 'allow',
                        priority: 75,
                        tags: ['ntp', 'essential']
                    }
                ]
            },

            // Web Server Template
            web_server: {
                name: 'Web Server Protection',
                description: 'Security rules for web server environments',
                category: 'Web Services',
                compliance: ['OWASP'],
                difficulty: 'Intermediate',
                rules: [
                    {
                        name: 'Allow HTTP Traffic',
                        description: 'Allow inbound HTTP traffic to web servers',
                        source_address: 'any',
                        destination_address: '{{WEB_SERVERS}}',
                        destination_port: '80',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 85,
                        tags: ['web', 'http']
                    },
                    {
                        name: 'Allow HTTPS Traffic',
                        description: 'Allow inbound HTTPS traffic to web servers',
                        source_address: 'any',
                        destination_address: '{{WEB_SERVERS}}',
                        destination_port: '443',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 85,
                        tags: ['web', 'https']
                    },
                    {
                        name: 'Block Direct Database Access',
                        description: 'Prevent direct access to database from web DMZ',
                        source_address: '{{WEB_SERVERS}}',
                        destination_address: '{{DATABASE_SERVERS}}',
                        destination_port: '1433,3306,5432',
                        protocol: 'TCP',
                        action: 'deny',
                        priority: 90,
                        tags: ['database', 'security']
                    },
                    {
                        name: 'Allow Web to App Server',
                        description: 'Allow web servers to communicate with application servers',
                        source_address: '{{WEB_SERVERS}}',
                        destination_address: '{{INTERNAL_NETWORKS}}',
                        destination_port: '8080,8443',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 80,
                        tags: ['web', 'application']
                    }
                ]
            },

            // PCI DSS Compliance Template
            pci_dss: {
                name: 'PCI DSS Compliance',
                description: 'Payment Card Industry compliance rules',
                category: 'Compliance',
                compliance: ['PCI DSS'],
                difficulty: 'Advanced',
                rules: [
                    {
                        name: 'Isolate Cardholder Data Environment',
                        description: 'Isolate CDE from other networks',
                        source_address: 'any',
                        destination_address: '{{CDE_NETWORKS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 99,
                        tags: ['pci', 'isolation']
                    },
                    {
                        name: 'Allow CDE Admin Access',
                        description: 'Allow administrative access to CDE',
                        source_address: '{{ADMIN_NETWORKS}}',
                        destination_address: '{{CDE_NETWORKS}}',
                        destination_port: '22,3389',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 95,
                        tags: ['pci', 'admin']
                    },
                    {
                        name: 'Log All CDE Traffic',
                        description: 'Ensure all CDE traffic is logged',
                        source_address: 'any',
                        destination_address: '{{CDE_NETWORKS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'monitor',
                        priority: 98,
                        log_enabled: true,
                        tags: ['pci', 'logging']
                    }
                ]
            },

            // HIPAA Compliance Template
            hipaa: {
                name: 'HIPAA Compliance',
                description: 'Healthcare information protection rules',
                category: 'Compliance',
                compliance: ['HIPAA'],
                difficulty: 'Advanced',
                rules: [
                    {
                        name: 'Restrict PHI Database Access',
                        description: 'Limit access to PHI databases',
                        source_address: '{{PHI_AUTHORIZED_SYSTEMS}}',
                        destination_address: '{{PHI_DATABASES}}',
                        destination_port: '1433,3306,5432',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 95,
                        tags: ['hipaa', 'phi', 'database']
                    },
                    {
                        name: 'Block Unauthorized PHI Access',
                        description: 'Block all other access to PHI systems',
                        source_address: 'any',
                        destination_address: '{{PHI_DATABASES}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 98,
                        tags: ['hipaa', 'phi', 'security']
                    },
                    {
                        name: 'Audit PHI Access',
                        description: 'Log all access to PHI systems',
                        source_address: 'any',
                        destination_address: '{{PHI_DATABASES}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'monitor',
                        priority: 99,
                        log_enabled: true,
                        tags: ['hipaa', 'audit', 'logging']
                    }
                ]
            },

            // Zero Trust Template
            zero_trust: {
                name: 'Zero Trust Architecture',
                description: 'Zero trust network security model',
                category: 'Architecture',
                compliance: ['NIST'],
                difficulty: 'Expert',
                rules: [
                    {
                        name: 'Default Deny All',
                        description: 'Default deny rule for zero trust',
                        source_address: 'any',
                        destination_address: 'any',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 1,
                        tags: ['zero-trust', 'default-deny']
                    },
                    {
                        name: 'Authenticate Internal Communications',
                        description: 'Require authentication for internal communications',
                        source_address: '{{INTERNAL_NETWORKS}}',
                        destination_address: '{{INTERNAL_NETWORKS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'authenticate',
                        priority: 95,
                        tags: ['zero-trust', 'authentication']
                    },
                    {
                        name: 'Micro-segment by Function',
                        description: 'Isolate systems by function',
                        source_address: '{{WEB_SERVERS}}',
                        destination_address: '{{DATABASE_SERVERS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 90,
                        tags: ['zero-trust', 'micro-segmentation']
                    }
                ]
            },

            // Remote Work Template
            remote_work: {
                name: 'Remote Work Security',
                description: 'Security rules for remote work environments',
                category: 'Remote Access',
                compliance: ['General'],
                difficulty: 'Intermediate',
                rules: [
                    {
                        name: 'Allow VPN Access',
                        description: 'Allow VPN connections',
                        source_address: 'any',
                        destination_address: '{{VPN_SERVERS}}',
                        destination_port: '1194,443,500,4500',
                        protocol: 'UDP,TCP',
                        action: 'allow',
                        priority: 85,
                        tags: ['vpn', 'remote-access']
                    },
                    {
                        name: 'Restrict VPN User Access',
                        description: 'Limit VPN users to specific resources',
                        source_address: '{{VPN_CLIENTS}}',
                        destination_address: '{{INTERNAL_NETWORKS}}',
                        destination_port: '80,443,22',
                        protocol: 'TCP',
                        action: 'allow',
                        priority: 80,
                        tags: ['vpn', 'access-control']
                    },
                    {
                        name: 'Block VPN Admin Access',
                        description: 'Block VPN users from admin networks',
                        source_address: '{{VPN_CLIENTS}}',
                        destination_address: '{{ADMIN_NETWORKS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 90,
                        tags: ['vpn', 'admin-security']
                    }
                ]
            },

            // IoT Security Template
            iot_security: {
                name: 'IoT Device Security',
                description: 'Security rules for IoT device networks',
                category: 'IoT',
                compliance: ['General'],
                difficulty: 'Advanced',
                rules: [
                    {
                        name: 'Isolate IoT Networks',
                        description: 'Isolate IoT devices from main network',
                        source_address: '{{IOT_NETWORKS}}',
                        destination_address: '{{INTERNAL_NETWORKS}}',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 95,
                        tags: ['iot', 'isolation']
                    },
                    {
                        name: 'Block IoT Internet Access',
                        description: 'Prevent IoT devices from internet access',
                        source_address: '{{IOT_NETWORKS}}',
                        destination_address: 'any',
                        destination_port: 'any',
                        protocol: 'any',
                        action: 'deny',
                        priority: 90,
                        tags: ['iot', 'internet-block']
                    },
                    {
                        name: 'Allow IoT Management',
                        description: 'Allow management traffic to IoT devices',
                        source_address: '{{ADMIN_NETWORKS}}',
                        destination_address: '{{IOT_NETWORKS}}',
                        destination_port: '22,80,443,161',
                        protocol: 'TCP,UDP',
                        action: 'allow',
                        priority: 85,
                        tags: ['iot', 'management']
                    }
                ]
            }
        };
    }
}

module.exports = PolicyTemplates; 