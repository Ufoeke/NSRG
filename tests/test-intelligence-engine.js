const assert = require('assert');
const { IntelligenceEngine, ServiceRouter, RequestStateManager, ServiceRegistry } = require('../src/backend/core/intelligence');
const dbConnection = require('../src/backend/database/connection');

// Mock database connection
const mockDb = {
  query: async (sql, params) => {
    console.log(`Mock DB Query: ${sql}`, params);
    return { rows: [], rowCount: 0 };
  }
};

// Mock logger
const mockLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg) => console.log(`ERROR: ${msg}`),
  warn: (msg) => console.log(`WARN: ${msg}`),
  debug: (msg) => console.log(`DEBUG: ${msg}`)
};

async function testIntelligenceEngine() {
  console.log('🧪 Starting Intelligence Engine Tests...\n');

  try {
    // Test 1: Engine Initialization
    console.log('Test 1: Engine Initialization');
    const engine = new IntelligenceEngine({
      maxConcurrentRequests: 5,
      requestTimeout: 30000,
      retryAttempts: 3
    });

    await engine.initialize();
    console.log('✅ Engine initialized successfully\n');

    // Test 2: Service Registration (already done in engine.initialize())
    console.log('Test 2: Service Registration');
    const serviceRegistry = engine.serviceRegistry;
    
    // Services are already registered during initialization
    const allServices = serviceRegistry.getAllServices();
    assert(allServices.length >= 3, 'Should have at least 3 default services');
    console.log('✅ Service registration verified\n');

    // Test 3: Service Discovery
    console.log('Test 3: Service Discovery');
    const firewallServices = serviceRegistry.findServicesForRequest({
      type: 'firewall',
      action: 'create_rule'
    });
    assert(firewallServices.length > 0, 'Should find firewall service');
    console.log('✅ Service discovery working\n');

    // Test 4: Request Routing
    console.log('Test 4: Request Routing');
    const router = engine.router;
    
    const mockRequest = {
      service_type: 'firewall',
      title: 'Create firewall rule for web traffic',
      customer_id: '550e8400-e29b-41d4-a716-446655440000',
      priority: 'high',
      service_details: {
        rule_type: 'allow',
        source_ip: '192.168.1.0/24',
        destination_ip: '10.0.0.0/8',
        port: 80,
        protocol: 'tcp',
        action_type: 'permit',
        direction: 'inbound'
      }
    };

    const routingResult = await router.route(mockRequest);
    assert(routingResult.serviceName === 'firewall-service', 'Should route to firewall service');
    console.log('✅ Request routing working\n');

    // Test 5: State Management
    console.log('Test 5: State Management');
    const stateManager = engine.stateManager;
    
    const requestState = stateManager.createRequest({
      type: 'firewall',
      action: 'create_rule',
      parameters: mockRequest.parameters
    });

    stateManager.updateRequestState(requestState.id, 'processing', 'Starting rule creation');
    stateManager.updateRequestState(requestState.id, 'completed', 'Rule created successfully');

    const finalState = stateManager.getRequest(requestState.id);
    assert(finalState.status === 'completed', 'Request should be completed');
    console.log('✅ State management working\n');

    // Test 6: Request Processing (Mock)
    console.log('Test 6: Request Processing');
    
    // Mock service instance to avoid actual network calls
    const mockServiceInstance = {
      processRequest: async (request) => {
        return {
          success: true,
          result: {
            ruleId: 'rule-12345',
            status: 'created',
            message: 'Firewall rule created successfully'
          }
        };
      }
    };

    // Test the engine's request processing with mock service
    const originalExecuteServiceRequest = engine.executeServiceRequest;
    engine.executeServiceRequest = async (instance, request) => {
      return await mockServiceInstance.processRequest(request);
    };

    const processResult = await engine.processRequest(mockRequest);
    assert(processResult.status === 'success', 'Request processing should succeed');
    console.log('✅ Request processing working\n');

    // Test 7: Health Checks
    console.log('Test 7: Health Checks');
    const systemHealth = engine.getSystemHealth();
    assert(systemHealth.initialized === true, 'System should be initialized');
    console.log('✅ Health checks working\n');

    // Test 8: Statistics
    console.log('Test 8: Statistics');
    const stats = stateManager.getStatistics();
    console.log('Statistics:', JSON.stringify(stats, null, 2));
    // The engine's state manager should have processed at least one request
    const engineStats = engine.stateManager.getStatistics();
    console.log('Engine Statistics:', JSON.stringify(engineStats, null, 2));
    assert(engineStats.total >= 1, 'Should have processed at least one request');
    console.log('✅ Statistics tracking working\n');

    // Test 9: Graceful Shutdown
    console.log('Test 9: Graceful Shutdown');
    engine.shutdown();
    console.log('✅ Graceful shutdown working\n');

    console.log('🎉 All Intelligence Engine tests passed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Mock service request executor for testing
async function mockServiceRequest(serviceInfo, requestData) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  // Simulate success/failure based on service type
  if (Math.random() > 0.1) { // 90% success rate
    return {
      success: true,
      data: {
        requestId: requestData.id,
        service: serviceInfo.service,
        instance: serviceInfo.instance,
        result: `Processed ${requestData.operation} successfully`,
        timestamp: new Date().toISOString()
      }
    };
  } else {
    throw new Error(`Service ${serviceInfo.service} temporarily unavailable`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testIntelligenceEngine().catch(console.error);
}

module.exports = { testIntelligenceEngine, mockServiceRequest }; 