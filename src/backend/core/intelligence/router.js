const logger = require('../../../shared/logger');

/**
 * Service Router
 * Determines which service should handle incoming requests
 * Implements routing logic and load balancing
 */
class ServiceRouter {
  constructor() {
    this.serviceMap = new Map();
    this.routingRules = [];
    this.defaultService = null;
    this.loadBalancer = new LoadBalancer();
  }

  /**
   * Configure router with available services
   * @param {Map} serviceMap - Map of service name to service instance
   */
  configure(serviceMap) {
    this.serviceMap = serviceMap;
    this.setupDefaultRoutingRules();
    logger.info(`Service Router configured with ${serviceMap.size} services`);
  }

  /**
   * Route a request to appropriate service
   * @param {Object} request - The service request
   * @param {Object} context - Request context
   * @returns {Object} Routing decision
   */
  async route(request, context = {}) {
    try {
      // Find matching routing rule
      const rule = this.findMatchingRule(request, context);
      
      if (!rule) {
        throw new Error(`No routing rule found for request type: ${request.type}`);
      }

      // Select service instance (for load balancing)
      const serviceInstance = await this.selectServiceInstance(rule.serviceName, context);

      // Prepare parameters
      const parameters = await this.prepareParameters(request, context, rule);

      const decision = {
        serviceName: rule.serviceName,
        handler: rule.handler,
        parameters,
        rule: rule.name,
        priority: rule.priority || 'normal',
        estimatedDuration: rule.estimatedDuration || 'unknown'
      };

      logger.debug(`Routed request to service: ${decision.serviceName}, handler: ${decision.handler}`);
      return decision;

    } catch (error) {
      logger.error('Routing failed:', error);
      throw error;
    }
  }

  /**
   * Setup default routing rules for common service types
   * @private
   */
  setupDefaultRoutingRules() {
    this.routingRules = [
      // Firewall service routing
      {
        name: 'firewall_rule_creation',
        condition: (req, ctx) => req.service_type === 'firewall',
        serviceName: 'firewall-service',
        handler: 'createRule',
        priority: 'high',
        estimatedDuration: '5-10 minutes'
      },

      // VLAN service routing
      {
        name: 'vlan_provisioning',
        condition: (req, ctx) => req.service_type === 'vlan',
        serviceName: 'vlan-service',
        handler: 'provisionVlan',
        priority: 'high',
        estimatedDuration: '10-20 minutes'
      },

      // Wireless service routing
      {
        name: 'wireless_setup',
        condition: (req, ctx) => req.service_type === 'wireless',
        serviceName: 'wireless-service',
        handler: 'setupWireless',
        priority: 'medium',
        estimatedDuration: '10-25 minutes'
      },

      // Template service routing
      {
        name: 'template_generation',
        condition: (req, ctx) => req.type === 'template' || req.generateTemplate === true,
        serviceName: 'templates',
        handler: 'generateTemplate',
        priority: 'low',
        estimatedDuration: '2-5 minutes'
      },

      // Default fallback
      {
        name: 'default_handler',
        condition: () => true, // Always matches as fallback
        serviceName: 'default',
        handler: 'processGenericRequest',
        priority: 'low',
        estimatedDuration: 'unknown'
      }
    ];

    logger.info(`Configured ${this.routingRules.length} routing rules`);
  }

  /**
   * Find the first matching routing rule
   * @private
   */
  findMatchingRule(request, context) {
    for (const rule of this.routingRules) {
      try {
        if (rule.condition(request, context)) {
          return rule;
        }
      } catch (error) {
        logger.warn(`Error evaluating routing rule ${rule.name}:`, error);
        continue;
      }
    }
    return null;
  }

  /**
   * Select service instance for load balancing
   * @private
   */
  async selectServiceInstance(serviceName, context) {
    // For now, just return the service if it exists
    // This can be enhanced with actual load balancing logic
    if (this.serviceMap.has(serviceName)) {
      return this.serviceMap.get(serviceName);
    }
    
    // Fallback to default service if specific service not found
    if (this.serviceMap.has('default')) {
      logger.warn(`Service ${serviceName} not found, falling back to default`);
      return this.serviceMap.get('default');
    }
    
    throw new Error(`Service ${serviceName} not available and no default service configured`);
  }

  /**
   * Prepare parameters for the service handler
   * @private
   */
  async prepareParameters(request, context, rule) {
    // Extract and validate required parameters based on the rule
    const parameters = {
      ...request.parameters,
      requestId: context.requestId,
      userId: context.userId,
      timestamp: new Date().toISOString(),
      priority: rule.priority
    };

    // Add service-specific parameter preparation logic here
    switch (rule.serviceName) {
      case 'firewall-service':
        parameters.validateFirewallRules = true;
        parameters.generateServiceNowTicket = request.generateTicket !== false;
        break;
      
      case 'vlan-service':
        parameters.validateVlanRange = true;
        parameters.checkConflicts = true;
        break;
      
      case 'wireless-service':
        parameters.validateSSID = true;
        parameters.securityCheck = true;
        break;
      
      default:
        // No specific preparation needed
        break;
    }

    return parameters;
  }

  /**
   * Add custom routing rule
   */
  addRoutingRule(rule) {
    if (!rule.name || !rule.condition || !rule.serviceName || !rule.handler) {
      throw new Error('Invalid routing rule: missing required fields');
    }
    
    // Insert before the default rule (last rule)
    this.routingRules.splice(-1, 0, rule);
    logger.info(`Added custom routing rule: ${rule.name}`);
  }

  /**
   * Remove routing rule by name
   */
  removeRoutingRule(ruleName) {
    const index = this.routingRules.findIndex(rule => rule.name === ruleName);
    if (index !== -1) {
      this.routingRules.splice(index, 1);
      logger.info(`Removed routing rule: ${ruleName}`);
      return true;
    }
    return false;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    return {
      totalRules: this.routingRules.length,
      availableServices: Array.from(this.serviceMap.keys()),
      rules: this.routingRules.map(rule => ({
        name: rule.name,
        serviceName: rule.serviceName,
        handler: rule.handler,
        priority: rule.priority
      }))
    };
  }
}

/**
 * Simple load balancer placeholder
 * Can be enhanced with real load balancing algorithms
 */
class LoadBalancer {
  constructor() {
    this.roundRobinCounters = new Map();
  }

  // Placeholder for future load balancing logic
  selectInstance(instances, algorithm = 'round-robin') {
    if (instances.length === 1) {
      return instances[0];
    }
    
    // Simple round-robin for now
    const serviceName = instances[0].constructor.name;
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selected = instances[counter % instances.length];
    this.roundRobinCounters.set(serviceName, counter + 1);
    
    return selected;
  }
}

module.exports = ServiceRouter; 