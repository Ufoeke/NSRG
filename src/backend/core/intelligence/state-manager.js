const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

/**
 * Request State Manager
 * Manages the lifecycle and state of service requests
 */
class RequestStateManager extends EventEmitter {
    constructor() {
        super();
        this.requests = new Map();
        this.stateHistory = new Map();
        this.maxHistoryEntries = 1000;
        
        // Request states
        this.states = {
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            TIMEOUT: 'timeout',
            CANCELLED: 'cancelled'
        };
        
        // Auto-cleanup old requests
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldRequests();
        }, 300000); // 5 minutes
    }

    /**
     * Create a new request state
     */
    createRequest(requestData) {
        const requestId = uuidv4();
        const timestamp = new Date().toISOString();
        
        const requestState = {
            id: requestId,
            type: requestData.type,
            status: this.states.PENDING,
            data: requestData,
            createdAt: timestamp,
            updatedAt: timestamp,
            progress: 0,
            metadata: {
                attempts: 0,
                maxAttempts: 3,
                estimatedDuration: this.estimateRequestDuration(requestData.type),
                priority: requestData.priority || 'normal'
            },
            history: [{
                state: this.states.PENDING,
                timestamp,
                message: 'Request created'
            }]
        };
        
        this.requests.set(requestId, requestState);
        this.emit('requestCreated', requestState);
        
        return requestState;
    }

    /**
     * Update request state
     */
    updateRequestState(requestId, newState, message = '', progress = null) {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new Error(`Request ${requestId} not found`);
        }

        const timestamp = new Date().toISOString();
        const previousState = request.status;
        
        // Update request
        request.status = newState;
        request.updatedAt = timestamp;
        if (progress !== null) {
            request.progress = Math.min(100, Math.max(0, progress));
        }
        
        // Add to history
        request.history.push({
            state: newState,
            timestamp,
            message: message || `State changed from ${previousState} to ${newState}`,
            previousState
        });
        
        // Emit events
        this.emit('stateChanged', {
            requestId,
            previousState,
            newState,
            request
        });
        
        // Specific state events
        if (newState === this.states.COMPLETED) {
            this.emit('requestCompleted', request);
        } else if (newState === this.states.FAILED) {
            this.emit('requestFailed', request);
        }
        
        return request;
    }

    /**
     * Set request progress
     */
    setProgress(requestId, progress, message = '') {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new Error(`Request ${requestId} not found`);
        }

        request.progress = Math.min(100, Math.max(0, progress));
        request.updatedAt = new Date().toISOString();
        
        if (message) {
            request.history.push({
                state: request.status,
                timestamp: request.updatedAt,
                message,
                type: 'progress'
            });
        }
        
        this.emit('progressUpdated', {
            requestId,
            progress,
            message,
            request
        });
        
        return request;
    }

    /**
     * Get request by ID
     */
    getRequest(requestId) {
        return this.requests.get(requestId);
    }

    /**
     * Get all requests with optional filtering
     */
    getRequests(filter = {}) {
        let requests = Array.from(this.requests.values());
        
        // Apply filters
        if (filter.status) {
            requests = requests.filter(req => req.status === filter.status);
        }
        
        if (filter.type) {
            requests = requests.filter(req => req.type === filter.type);
        }
        
        if (filter.since) {
            const sinceDate = new Date(filter.since);
            requests = requests.filter(req => new Date(req.createdAt) >= sinceDate);
        }
        
        // Sort by creation date (newest first)
        requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return requests;
    }

    /**
     * Get active requests (pending or processing)
     */
    getActiveRequests() {
        return this.getRequests({
            status: [this.states.PENDING, this.states.PROCESSING]
        });
    }

    /**
     * Cancel a request
     */
    cancelRequest(requestId, reason = 'Request cancelled by user') {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new Error(`Request ${requestId} not found`);
        }
        
        if (request.status === this.states.COMPLETED) {
            throw new Error('Cannot cancel completed request');
        }
        
        this.updateRequestState(requestId, this.states.CANCELLED, reason);
        this.emit('requestCancelled', request);
        
        return request;
    }

    /**
     * Retry a failed request
     */
    retryRequest(requestId) {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new Error(`Request ${requestId} not found`);
        }
        
        if (request.status !== this.states.FAILED) {
            throw new Error('Can only retry failed requests');
        }
        
        if (request.metadata.attempts >= request.metadata.maxAttempts) {
            throw new Error('Maximum retry attempts exceeded');
        }
        
        request.metadata.attempts++;
        this.updateRequestState(requestId, this.states.PENDING, 'Request retry initiated');
        
        return request;
    }

    /**
     * Get request statistics
     */
    getStatistics() {
        const requests = Array.from(this.requests.values());
        const stats = {
            total: requests.length,
            byStatus: {},
            byType: {},
            averageCompletionTime: 0,
            successRate: 0
        };
        
        // Count by status
        Object.values(this.states).forEach(status => {
            stats.byStatus[status] = requests.filter(req => req.status === status).length;
        });
        
        // Count by type
        requests.forEach(req => {
            stats.byType[req.type] = (stats.byType[req.type] || 0) + 1;
        });
        
        // Calculate completion time for completed requests
        const completedRequests = requests.filter(req => req.status === this.states.COMPLETED);
        if (completedRequests.length > 0) {
            const totalTime = completedRequests.reduce((sum, req) => {
                const duration = new Date(req.updatedAt) - new Date(req.createdAt);
                return sum + duration;
            }, 0);
            stats.averageCompletionTime = Math.round(totalTime / completedRequests.length);
        }
        
        // Calculate success rate
        const finishedRequests = requests.filter(req => 
            [this.states.COMPLETED, this.states.FAILED].includes(req.status)
        );
        if (finishedRequests.length > 0) {
            stats.successRate = Math.round(
                (stats.byStatus[this.states.COMPLETED] / finishedRequests.length) * 100
            );
        }
        
        return stats;
    }

    /**
     * Estimate request duration based on type
     */
    estimateRequestDuration(requestType) {
        const durations = {
            'firewall.create': 30000,    // 30 seconds
            'firewall.modify': 20000,    // 20 seconds
            'firewall.batch': 120000,    // 2 minutes
            'vlan.provision': 45000,     // 45 seconds
            'vlan.modify': 25000,        // 25 seconds
            'wireless.setup': 60000,     // 1 minute
            'wireless.config': 30000,    // 30 seconds
            'template.generate': 10000   // 10 seconds
        };
        
        return durations[requestType] || 30000; // Default 30 seconds
    }

    /**
     * Clean up old completed/failed requests
     */
    cleanupOldRequests() {
        const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        
        for (const [requestId, request] of this.requests) {
            if ([this.states.COMPLETED, this.states.FAILED, this.states.CANCELLED].includes(request.status) &&
                new Date(request.updatedAt) < cutoffTime) {
                
                // Move to history before removing
                this.stateHistory.set(requestId, {
                    ...request,
                    archivedAt: new Date().toISOString()
                });
                
                this.requests.delete(requestId);
            }
        }
        
        // Limit history size
        if (this.stateHistory.size > this.maxHistoryEntries) {
            const entries = Array.from(this.stateHistory.entries());
            entries.sort((a, b) => new Date(b[1].archivedAt) - new Date(a[1].archivedAt));
            
            // Keep only the most recent entries
            this.stateHistory.clear();
            entries.slice(0, this.maxHistoryEntries).forEach(([id, data]) => {
                this.stateHistory.set(id, data);
            });
        }
    }

    /**
     * Shutdown and cleanup
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.removeAllListeners();
    }
}

module.exports = RequestStateManager; 