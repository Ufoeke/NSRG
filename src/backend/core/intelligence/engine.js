const ServiceRouter = require('./router');
const RequestStateManager = require('./state-manager');
const ServiceRegistry = require('./registry');
const { validateServiceRequest } = require('../validation');
const logger = require('../../../shared/logger');

/**
 * Core Intelligence Engine
 * Orchestrates the processing of network service requests
 * Routes requests to appropriate service handlers and manages state
 */
class IntelligenceEngine {
  constructor(options = {}) {
    this.router = new ServiceRouter();
    this.stateManager = new RequestStateManager();
    this.serviceRegistry = new ServiceRegistry();
    this.config = {
      maxConcurrentRequests: options.maxConcurrentRequests || 10,
      requestTimeout: options.requestTimeout || 30000, // 30 seconds
      retryAttempts: options.retryAttempts || 3,
      ...options
    };
    
    this.activeRequests = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the intelligence engine
   * Sets up service registry and routing configuration
   */
  async initialize() {
    try {
      logger.info('Initializing Intelligence Engine...');
      
      // Register some default services for demo purposes
      // In a real implementation, services would be registered by separate modules
      this.registerDefaultServices();
      
      // Configure router with available services
      this.router.configure(this.serviceRegistry.getServicesMap());
      
      // State manager is ready (no initialization needed)
      
      this.initialized = true;
      logger.info('Intelligence Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Intelligence Engine:', error);
      throw error;
    }
  }

  /**
   * Process a network service request
   * @param {Object} request - The service request object
   * @param {Object} context - Request context (user, session, etc.)
   * @returns {Promise<Object>} Processing result
   */
  async processRequest(request, context = {}) {
    if (!this.initialized) {
      throw new Error('Intelligence Engine not initialized');
    }

    let requestState = null;
    let requestId = null;
    
    try {
      // Validate the request
      const validationResult = await validateServiceRequest(request);
      if (!validationResult.isValid) {
        throw new Error(`Invalid request: ${validationResult.errors.join(', ')}`);
      }

      // Create request state
      const requestType = request.service_type || request.service_details?.type || 'unknown';
      requestState = this.stateManager.createRequest({
        type: requestType,
        originalRequest: request,
        context,
        priority: request.priority || 'normal'
      });

      requestId = requestState.id;
      logger.info(`Processing request ${requestId} of type: ${requestType}`);

      // Route request to appropriate service
      const routingDecision = await this.router.route(request, context);
      
      this.stateManager.updateRequestState(requestId, 'processing', 'Request routed successfully');

      // Execute the service request
      const result = await this.executeServiceRequest(requestId, routingDecision);

      // Update final state
      this.stateManager.updateRequestState(requestId, 'completed', 'Request processed successfully');

      logger.info(`Request ${requestId} completed successfully`);
      return {
        requestId,
        status: 'success',
        result
      };

    } catch (error) {
      logger.error(`Request ${requestId || 'unknown'} failed:`, error);
      
      // Only update state if request was created
      if (requestState && requestId) {
        this.stateManager.updateRequestState(requestId, 'failed', error.message);
      }

      return {
        requestId: requestId || this.generateRequestId(),
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Execute a routed service request
   * @private
   */
  async executeServiceRequest(requestId, routingDecision) {
    const { serviceName, handler, parameters } = routingDecision;
    
    try {
      // Get service instance
      const service = this.serviceRegistry.getService(serviceName);
      if (!service) {
        throw new Error(`Service '${serviceName}' not available`);
      }

      // Track active request
      this.activeRequests.set(requestId, {
        serviceName,
        startedAt: new Date(),
        handler
      });

      // Execute with timeout
      const result = await Promise.race([
        service[handler](parameters),
        this.createTimeoutPromise(this.config.requestTimeout)
      ]);

      this.activeRequests.delete(requestId);
      return result;

    } catch (error) {
      this.activeRequests.delete(requestId);
      throw error;
    }
  }

  /**
   * Get request status and details
   */
  getRequestStatus(requestId) {
    return this.stateManager.getRequest(requestId);
  }

  /**
   * Get system health and metrics
   */
  getSystemHealth() {
    return {
      initialized: this.initialized,
      activeRequests: this.activeRequests.size,
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      availableServices: this.serviceRegistry.getAllServices().length,
      systemLoad: this.calculateSystemLoad()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down Intelligence Engine...');
    
    // Wait for active requests to complete or timeout
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeRequests.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeRequests.size > 0) {
      logger.warn(`Forcing shutdown with ${this.activeRequests.size} active requests`);
    }
    
    await this.stateManager.shutdown();
    this.initialized = false;
    logger.info('Intelligence Engine shutdown complete');
  }

  // Private helper methods
  registerDefaultServices() {
    // Register firewall service
    this.serviceRegistry.registerService({
      name: 'firewall-service',
      category: 'network-security',
      version: '1.0.0',
      description: 'Firewall rule management service',
      endpoints: {
        create: '/api/firewall/rules',
        modify: '/api/firewall/rules/:id',
        batch: '/api/firewall/batch'
      },
      capabilities: ['rule-creation', 'rule-modification', 'batch-operations'],
      dependencies: [],
      healthCheckEndpoint: '/health',
      maxInstances: 3,
      loadBalancing: 'round-robin'
    });

    // Register firewall service instance
    this.serviceRegistry.registerServiceInstance('firewall-service', {
      id: 'firewall-instance-1',
      endpoint: 'http://localhost:3001',
      metadata: { zone: 'main' },
      weight: 1
    });

    // Register VLAN service
    this.serviceRegistry.registerService({
      name: 'vlan-service',
      category: 'network-infrastructure',
      version: '1.0.0',
      description: 'VLAN provisioning and management service',
      endpoints: {
        provision: '/api/vlan/provision',
        modify: '/api/vlan/:id'
      },
      capabilities: ['vlan-provisioning', 'vlan-modification'],
      dependencies: [],
      healthCheckEndpoint: '/health',
      maxInstances: 2,
      loadBalancing: 'round-robin'
    });

    // Register VLAN service instance
    this.serviceRegistry.registerServiceInstance('vlan-service', {
      id: 'vlan-instance-1',
      endpoint: 'http://localhost:3002',
      metadata: { zone: 'main' },
      weight: 1
    });

    // Register wireless service
    this.serviceRegistry.registerService({
      name: 'wireless-service',
      category: 'network-wireless',
      version: '1.0.0',
      description: 'Wireless network setup and configuration service',
      endpoints: {
        setup: '/api/wireless/setup',
        configure: '/api/wireless/configure'
      },
      capabilities: ['wireless-setup', 'wireless-configuration'],
      dependencies: [],
      healthCheckEndpoint: '/health',
      maxInstances: 2,
      loadBalancing: 'round-robin'
    });

    // Register wireless service instance
    this.serviceRegistry.registerServiceInstance('wireless-service', {
      id: 'wireless-instance-1',
      endpoint: 'http://localhost:3003',
      metadata: { zone: 'main' },
      weight: 1
    });

    logger.info('Default services registered');
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeout);
    });
  }

  calculateSystemLoad() {
    const loadPercentage = (this.activeRequests.size / this.config.maxConcurrentRequests) * 100;
    return Math.min(loadPercentage, 100);
  }
}

module.exports = IntelligenceEngine; 