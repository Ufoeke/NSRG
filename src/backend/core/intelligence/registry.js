/**
 * Service Registry
 * Manages registration and discovery of available services
 */
class ServiceRegistry {
    constructor() {
        this.services = new Map();
        this.serviceInstances = new Map();
        this.healthChecks = new Map();
        this.lastHealthCheck = new Map();
        
        // Service categories
        this.categories = {
            FIREWALL: 'firewall',
            VLAN: 'vlan',
            WIRELESS: 'wireless',
            TEMPLATE: 'template',
            MONITORING: 'monitoring'
        };
        
        // Health check interval (5 minutes)
        this.healthCheckInterval = 5 * 60 * 1000;
        
        // Start periodic health checks
        this.startHealthChecks();
    }

    /**
     * Register a service
     */
    registerService(serviceConfig) {
        const {
            name,
            category,
            version,
            description,
            endpoints = [],
            capabilities = [],
            dependencies = [],
            healthCheckEndpoint = null,
            maxInstances = 1,
            loadBalancing = 'round-robin'
        } = serviceConfig;

        if (!name || !category) {
            throw new Error('Service name and category are required');
        }

        const service = {
            name,
            category,
            version: version || '1.0.0',
            description: description || '',
            endpoints,
            capabilities,
            dependencies,
            healthCheckEndpoint,
            maxInstances,
            loadBalancing,
            registeredAt: new Date().toISOString(),
            status: 'registered',
            instances: []
        };

        this.services.set(name, service);
        
        console.log(`Service registered: ${name} (${category})`);
        return service;
    }

    /**
     * Register a service instance
     */
    registerServiceInstance(serviceName, instanceConfig) {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service ${serviceName} not found`);
        }

        const {
            id,
            endpoint,
            metadata = {},
            weight = 1
        } = instanceConfig;

        if (!id || !endpoint) {
            throw new Error('Instance ID and endpoint are required');
        }

        // Check max instances limit
        if (service.instances.length >= service.maxInstances) {
            throw new Error(`Maximum instances (${service.maxInstances}) reached for service ${serviceName}`);
        }

        const instance = {
            id,
            serviceName,
            endpoint,
            metadata,
            weight,
            status: 'active',
            registeredAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            requestCount: 0,
            errorCount: 0
        };

        service.instances.push(instance);
        this.serviceInstances.set(id, instance);
        
        console.log(`Service instance registered: ${serviceName}/${id}`);
        return instance;
    }

    /**
     * Unregister a service
     */
    unregisterService(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) {
            return false;
        }

        // Remove all instances
        service.instances.forEach(instance => {
            this.serviceInstances.delete(instance.id);
        });

        this.services.delete(serviceName);
        this.healthChecks.delete(serviceName);
        this.lastHealthCheck.delete(serviceName);
        
        console.log(`Service unregistered: ${serviceName}`);
        return true;
    }

    /**
     * Unregister a service instance
     */
    unregisterServiceInstance(instanceId) {
        const instance = this.serviceInstances.get(instanceId);
        if (!instance) {
            return false;
        }

        const service = this.services.get(instance.serviceName);
        if (service) {
            service.instances = service.instances.filter(inst => inst.id !== instanceId);
        }

        this.serviceInstances.delete(instanceId);
        
        console.log(`Service instance unregistered: ${instanceId}`);
        return true;
    }

    /**
     * Get service by name
     */
    getService(serviceName) {
        return this.services.get(serviceName);
    }

    /**
     * Get all services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }

    /**
     * Get services as a Map (for router configuration)
     */
    getServicesMap() {
        return new Map(this.services);
    }

    /**
     * Get services by category
     */
    getServicesByCategory(category) {
        return Array.from(this.services.values()).filter(service => 
            service.category === category
        );
    }

    /**
     * Get services by capability
     */
    getServicesByCapability(capability) {
        return Array.from(this.services.values()).filter(service => 
            service.capabilities.includes(capability)
        );
    }

    /**
     * Find services that can handle a specific request type
     */
    findServicesForRequest(requestType) {
        const services = [];
        
        for (const service of this.services.values()) {
            // Check if service can handle this request type
            if (this.canServiceHandleRequest(service, requestType)) {
                // Only include services with active instances
                const activeInstances = service.instances.filter(inst => 
                    inst.status === 'active'
                );
                
                if (activeInstances.length > 0) {
                    services.push({
                        ...service,
                        instances: activeInstances
                    });
                }
            }
        }
        
        return services;
    }

    /**
     * Get available service instance for a service
     */
    getServiceInstance(serviceName, strategy = 'round-robin') {
        const service = this.services.get(serviceName);
        if (!service || service.instances.length === 0) {
            return null;
        }

        const activeInstances = service.instances.filter(inst => 
            inst.status === 'active'
        );

        if (activeInstances.length === 0) {
            return null;
        }

        return this.selectInstance(activeInstances, strategy);
    }

    /**
     * Select instance based on load balancing strategy
     */
    selectInstance(instances, strategy) {
        switch (strategy) {
            case 'round-robin':
                // Simple round-robin based on request count
                return instances.reduce((min, current) => 
                    current.requestCount < min.requestCount ? current : min
                );
                
            case 'weighted':
                // Weighted selection based on instance weight
                const totalWeight = instances.reduce((sum, inst) => sum + inst.weight, 0);
                const random = Math.random() * totalWeight;
                let currentWeight = 0;
                
                for (const instance of instances) {
                    currentWeight += instance.weight;
                    if (random <= currentWeight) {
                        return instance;
                    }
                }
                return instances[0];
                
            case 'least-errors':
                // Select instance with least errors
                return instances.reduce((min, current) => 
                    current.errorCount < min.errorCount ? current : min
                );
                
            default:
                return instances[0];
        }
    }

    /**
     * Check if service can handle a request type
     */
    canServiceHandleRequest(service, requestType) {
        // Handle both string and object request types
        let typeString = requestType;
        
        if (typeof requestType === 'object') {
            typeString = `${requestType.type}.${requestType.action}`;
        }
        
        // Map request types to service categories
        const requestTypeMapping = {
            'firewall.create_rule': 'network-security',
            'firewall.modify_rule': 'network-security',
            'firewall.batch': 'network-security',
            'firewall.delete': 'network-security',
            'vlan.provision': 'network-infrastructure',
            'vlan.modify': 'network-infrastructure',
            'vlan.delete': 'network-infrastructure',
            'wireless.setup': 'network-wireless',
            'wireless.configure': 'network-wireless',
            'wireless.modify': 'network-wireless',
            'template.generate': 'template',
            'template.customize': 'template'
        };

        const requiredCategory = requestTypeMapping[typeString];
        if (!requiredCategory) {
            // Fallback: try matching just the base type
            const baseType = typeof requestType === 'object' ? requestType.type : requestType.split('.')[0];
            const categoryMapping = {
                'firewall': 'network-security',
                'vlan': 'network-infrastructure',
                'wireless': 'network-wireless'
            };
            
            return service.category === categoryMapping[baseType];
        }

        return service.category === requiredCategory;
    }

    /**
     * Update instance metrics
     */
    updateInstanceMetrics(instanceId, metrics) {
        const instance = this.serviceInstances.get(instanceId);
        if (!instance) {
            return false;
        }

        const { requestCount, errorCount, status } = metrics;
        
        if (requestCount !== undefined) {
            instance.requestCount = requestCount;
        }
        
        if (errorCount !== undefined) {
            instance.errorCount = errorCount;
        }
        
        if (status !== undefined) {
            instance.status = status;
        }
        
        instance.lastSeen = new Date().toISOString();
        return true;
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks() {
        setInterval(() => {
            this.performHealthChecks();
        }, this.healthCheckInterval);
    }

    /**
     * Perform health checks on all services
     */
    async performHealthChecks() {
        for (const service of this.services.values()) {
            try {
                await this.checkServiceHealth(service);
            } catch (error) {
                console.error(`Health check failed for service ${service.name}:`, error.message);
            }
        }
    }

    /**
     * Check health of a specific service
     */
    async checkServiceHealth(service) {
        if (!service.healthCheckEndpoint) {
            return; // No health check configured
        }

        const lastCheck = this.lastHealthCheck.get(service.name);
        const now = Date.now();
        
        // Skip if recently checked (within last minute)
        if (lastCheck && (now - lastCheck) < 60000) {
            return;
        }

        this.lastHealthCheck.set(service.name, now);

        // Check each instance
        for (const instance of service.instances) {
            try {
                const healthUrl = `${instance.endpoint}${service.healthCheckEndpoint}`;
                // Simple timeout-based health check
                const isHealthy = await this.pingEndpoint(healthUrl, 5000);
                
                instance.status = isHealthy ? 'active' : 'inactive';
                instance.lastSeen = new Date().toISOString();
                
            } catch (error) {
                console.warn(`Health check failed for instance ${instance.id}:`, error.message);
                instance.status = 'inactive';
            }
        }
    }

    /**
     * Simple endpoint ping for health checks
     */
    async pingEndpoint(url, timeout = 5000) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => resolve(false), timeout);
            
            // In a real implementation, you would make an HTTP request
            // For now, we'll simulate a basic check
            const isUp = Math.random() > 0.1; // 90% uptime simulation
            
            clearTimeout(timeoutId);
            resolve(isUp);
        });
    }

    /**
     * Get registry statistics
     */
    getStatistics() {
        const services = Array.from(this.services.values());
        const instances = Array.from(this.serviceInstances.values());
        
        return {
            totalServices: services.length,
            totalInstances: instances.length,
            servicesByCategory: this.getServiceCountByCategory(),
            activeInstances: instances.filter(inst => inst.status === 'active').length,
            inactiveInstances: instances.filter(inst => inst.status === 'inactive').length,
            averageRequestsPerInstance: instances.length > 0 ? 
                Math.round(instances.reduce((sum, inst) => sum + inst.requestCount, 0) / instances.length) : 0
        };
    }

    /**
     * Get service count by category
     */
    getServiceCountByCategory() {
        const counts = {};
        
        for (const category of Object.values(this.categories)) {
            counts[category] = 0;
        }
        
        for (const service of this.services.values()) {
            if (counts[service.category] !== undefined) {
                counts[service.category]++;
            }
        }
        
        return counts;
    }

    /**
     * Shutdown registry
     */
    shutdown() {
        console.log('Service registry shutting down...');
        this.services.clear();
        this.serviceInstances.clear();
        this.healthChecks.clear();
        this.lastHealthCheck.clear();
    }
}

module.exports = ServiceRegistry; 