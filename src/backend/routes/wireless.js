/**
 * Wireless Service API Routes
 * RESTful API endpoints for SSID management, access point deployment, 
 * and security policy configuration supporting multi-vendor environments
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

const router = express.Router();

// Simple middleware placeholders (will be enhanced in future tasks)
const authMiddleware = (req, res, next) => {
    // TODO: Implement proper authentication in Task 14
    next();
};

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request parameters',
                details: errors.array()
            },
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
        });
    }
    next();
};

// Mock data for development (will be replaced with actual database integration)
let mockSSIDs = [
    {
        id: 'ssid-001',
        name: 'Corporate-WiFi',
        enabled: true,
        securityProfileId: 'sec-prof-001',
        vlanId: 100,
        bandwidthPolicyId: 'bw-pol-001',
        vendor: 'cisco-meraki',
        accessPoints: ['ap-001', 'ap-002'],
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            createdBy: 'admin',
            description: 'Main corporate network'
        }
    },
    {
        id: 'ssid-002',
        name: 'Guest-Network',
        enabled: true,
        securityProfileId: 'sec-prof-002',
        vlanId: 200,
        vendor: 'aruba',
        accessPoints: ['ap-003', 'ap-004'],
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            createdBy: 'admin',
            description: 'Guest access network'
        }
    }
];

let mockAccessPoints = [
    {
        id: 'ap-001',
        name: 'Lobby-AP-01',
        vendor: 'cisco-meraki',
        model: 'MR46',
        serialNumber: 'Q2HP-XXXX-XXXX',
        macAddress: '00:18:0a:12:34:56',
        ipAddress: '192.168.1.101',
        location: {
            building: 'Main Building',
            floor: '1',
            room: 'Lobby',
            coordinates: { latitude: 37.7749, longitude: -122.4194 }
        },
        status: 'online',
        ssids: ['ssid-001'],
        capabilities: {
            maxSSIDs: 15,
            supportedBands: ['2.4GHz', '5GHz'],
            maxClients: 256
        },
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            lastSeen: '2024-01-20T12:00:00Z',
            firmware: '28.7.1'
        }
    },
    {
        id: 'ap-002',
        name: 'Conference-AP-01',
        vendor: 'aruba',
        model: 'AP-515',
        serialNumber: 'CN12345678',
        macAddress: '00:1a:1e:ab:cd:ef',
        ipAddress: '192.168.1.102',
        location: {
            building: 'Main Building',
            floor: '2',
            room: 'Conference Room A'
        },
        status: 'online',
        ssids: ['ssid-001', 'ssid-002'],
        capabilities: {
            maxSSIDs: 16,
            supportedBands: ['2.4GHz', '5GHz', '6GHz'],
            maxClients: 512
        },
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            lastSeen: '2024-01-20T12:00:00Z',
            firmware: '8.10.0.0'
        }
    }
];

let mockSecurityProfiles = [
    {
        id: 'sec-prof-001',
        name: 'WPA2-Enterprise',
        authType: 'wpa2_enterprise',
        encryption: 'aes',
        radiusConfig: {
            primaryServer: {
                host: '192.168.1.10',
                port: 1812,
                secret: '***REDACTED***'
            }
        },
        isTemplate: true,
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            createdBy: 'admin',
            description: 'Standard enterprise security profile'
        }
    },
    {
        id: 'sec-prof-002',
        name: 'Guest-Open',
        authType: 'open',
        encryption: 'none',
        isTemplate: true,
        metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            createdBy: 'admin',
            description: 'Open guest network profile'
        }
    }
];

// SSID Management Endpoints
router.get('/ssids', 
    authMiddleware,
    [
        query('networkId').optional().isString(),
        query('vendor').optional().isIn(['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']),
        query('enabled').optional().isBoolean(),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { networkId, vendor, enabled, limit = 20, offset = 0 } = req.query;
            
            let filteredSSIDs = mockSSIDs;
            
            // Apply filters
            if (vendor) {
                filteredSSIDs = filteredSSIDs.filter(ssid => ssid.vendor === vendor);
            }
            if (enabled !== undefined) {
                filteredSSIDs = filteredSSIDs.filter(ssid => ssid.enabled === (enabled === 'true'));
            }
            
            // Apply pagination
            const total = filteredSSIDs.length;
            const paginatedSSIDs = filteredSSIDs.slice(offset, offset + limit);
            
            res.json({
                data: paginatedSSIDs,
                meta: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasNext: offset + limit < total,
                    hasPrevious: offset > 0
                }
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to retrieve SSIDs',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.post('/ssids',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 1, max: 32 }).matches(/^[a-zA-Z0-9_-]+$/),
        body('enabled').optional().isBoolean(),
        body('securityProfileId').isString().notEmpty(),
        body('vlanId').optional().isInt({ min: 1, max: 4094 }),
        body('bandwidthPolicyId').optional().isString(),
        body('coveragePlanId').optional().isString(),
        body('accessPoints').optional().isArray(),
        body('description').optional().isString().isLength({ max: 255 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                name,
                enabled = true,
                securityProfileId,
                vlanId,
                bandwidthPolicyId,
                coveragePlanId,
                accessPoints = [],
                vendorSpecific = {},
                description
            } = req.body;
            
            // Check for duplicate SSID name
            const existingSSID = mockSSIDs.find(ssid => ssid.name === name);
            if (existingSSID) {
                return res.status(409).json({
                    error: {
                        code: 'SSID_NAME_CONFLICT',
                        message: `SSID with name "${name}" already exists`,
                        details: { existingId: existingSSID.id }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            // Validate security profile exists
            const securityProfile = mockSecurityProfiles.find(profile => profile.id === securityProfileId);
            if (!securityProfile) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_SECURITY_PROFILE',
                        message: `Security profile "${securityProfileId}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            // Create new SSID
            const newSSID = {
                id: `ssid-${Date.now()}`,
                name,
                enabled,
                securityProfileId,
                vlanId,
                bandwidthPolicyId,
                coveragePlanId,
                vendor: 'cisco-meraki', // Default vendor, would be determined by access points
                accessPoints,
                vendorSpecific,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system', // Would be extracted from auth token
                    description
                }
            };
            
            mockSSIDs.push(newSSID);
            
            res.status(201).json(newSSID);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'SSID_CREATION_FAILED',
                    message: 'Failed to create SSID',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.get('/ssids/:ssidId',
    authMiddleware,
    [param('ssidId').isString().notEmpty()],
    validateRequest,
    async (req, res) => {
        try {
            const { ssidId } = req.params;
            const ssid = mockSSIDs.find(s => s.id === ssidId);
            
            if (!ssid) {
                return res.status(404).json({
                    error: {
                        code: 'SSID_NOT_FOUND',
                        message: `SSID with ID "${ssidId}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            res.json(ssid);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to retrieve SSID',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.put('/ssids/:ssidId',
    authMiddleware,
    [
        param('ssidId').isString().notEmpty(),
        body('name').optional().isString().isLength({ min: 1, max: 32 }).matches(/^[a-zA-Z0-9_-]+$/),
        body('enabled').optional().isBoolean(),
        body('securityProfileId').optional().isString(),
        body('vlanId').optional().isInt({ min: 1, max: 4094 }),
        body('bandwidthPolicyId').optional().isString(),
        body('coveragePlanId').optional().isString(),
        body('accessPoints').optional().isArray(),
        body('description').optional().isString().isLength({ max: 255 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { ssidId } = req.params;
            const updates = req.body;
            
            const ssidIndex = mockSSIDs.findIndex(s => s.id === ssidId);
            if (ssidIndex === -1) {
                return res.status(404).json({
                    error: {
                        code: 'SSID_NOT_FOUND',
                        message: `SSID with ID "${ssidId}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            // Check for name conflicts (excluding current SSID)
            if (updates.name) {
                const existingSSID = mockSSIDs.find(ssid => ssid.name === updates.name && ssid.id !== ssidId);
                if (existingSSID) {
                    return res.status(409).json({
                        error: {
                            code: 'SSID_NAME_CONFLICT',
                            message: `SSID with name "${updates.name}" already exists`,
                            details: { existingId: existingSSID.id }
                        },
                        timestamp: new Date().toISOString(),
                        requestId: req.headers['x-request-id'] || 'unknown'
                    });
                }
            }
            
            // Update SSID
            const updatedSSID = {
                ...mockSSIDs[ssidIndex],
                ...updates,
                metadata: {
                    ...mockSSIDs[ssidIndex].metadata,
                    updatedAt: new Date().toISOString(),
                    description: updates.description || mockSSIDs[ssidIndex].metadata.description
                }
            };
            
            mockSSIDs[ssidIndex] = updatedSSID;
            
            res.json(updatedSSID);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'SSID_UPDATE_FAILED',
                    message: 'Failed to update SSID',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.delete('/ssids/:ssidId',
    authMiddleware,
    [param('ssidId').isString().notEmpty()],
    validateRequest,
    async (req, res) => {
        try {
            const { ssidId } = req.params;
            const ssidIndex = mockSSIDs.findIndex(s => s.id === ssidId);
            
            if (ssidIndex === -1) {
                return res.status(404).json({
                    error: {
                        code: 'SSID_NOT_FOUND',
                        message: `SSID with ID "${ssidId}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            mockSSIDs.splice(ssidIndex, 1);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'SSID_DELETION_FAILED',
                    message: 'Failed to delete SSID',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Access Point Management Endpoints
router.get('/access-points',
    authMiddleware,
    [
        query('vendor').optional().isIn(['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']),
        query('status').optional().isIn(['online', 'offline', 'maintenance']),
        query('location').optional().isString()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { vendor, status, location } = req.query;
            
            let filteredAPs = mockAccessPoints;
            
            if (vendor) {
                filteredAPs = filteredAPs.filter(ap => ap.vendor === vendor);
            }
            if (status) {
                filteredAPs = filteredAPs.filter(ap => ap.status === status);
            }
            if (location) {
                filteredAPs = filteredAPs.filter(ap => 
                    ap.location.building.toLowerCase().includes(location.toLowerCase()) ||
                    ap.location.floor.toLowerCase().includes(location.toLowerCase()) ||
                    ap.location.room.toLowerCase().includes(location.toLowerCase())
                );
            }
            
            res.json({
                data: filteredAPs,
                meta: {
                    total: filteredAPs.length,
                    limit: filteredAPs.length,
                    offset: 0,
                    hasNext: false,
                    hasPrevious: false
                }
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to retrieve access points',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.post('/access-points',
    authMiddleware,
    [
        body('name').isString().notEmpty(),
        body('vendor').isIn(['cisco-meraki', 'fortiap', 'cisco-catalyst', 'aruba']),
        body('model').isString().notEmpty(),
        body('macAddress').matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/),
        body('serialNumber').optional().isString(),
        body('ipAddress').optional().isIP(4),
        body('location').optional().isObject()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                name,
                vendor,
                model,
                macAddress,
                serialNumber,
                ipAddress,
                location,
                vendorSpecific = {}
            } = req.body;
            
            // Check for duplicate MAC address
            const existingAP = mockAccessPoints.find(ap => ap.macAddress === macAddress);
            if (existingAP) {
                return res.status(409).json({
                    error: {
                        code: 'MAC_ADDRESS_CONFLICT',
                        message: `Access point with MAC address "${macAddress}" already exists`,
                        details: { existingId: existingAP.id }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            const newAP = {
                id: `ap-${Date.now()}`,
                name,
                vendor,
                model,
                serialNumber,
                macAddress,
                ipAddress,
                location,
                status: 'offline', // Default status
                ssids: [],
                capabilities: {
                    maxSSIDs: vendor === 'cisco-meraki' ? 15 : 16,
                    supportedBands: ['2.4GHz', '5GHz'],
                    maxClients: 256
                },
                vendorSpecific,
                metadata: {
                    createdAt: new Date().toISOString(),
                    lastSeen: null,
                    firmware: 'unknown'
                }
            };
            
            mockAccessPoints.push(newAP);
            
            res.status(201).json(newAP);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'AP_CREATION_FAILED',
                    message: 'Failed to create access point',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Security Profile Management Endpoints
router.get('/security-profiles',
    authMiddleware,
    async (req, res) => {
        try {
            // Sanitize sensitive data before returning
            const sanitizedProfiles = mockSecurityProfiles.map(profile => ({
                ...profile,
                passphrase: profile.passphrase ? '***REDACTED***' : undefined,
                radiusConfig: profile.radiusConfig ? {
                    ...profile.radiusConfig,
                    primaryServer: profile.radiusConfig.primaryServer ? {
                        ...profile.radiusConfig.primaryServer,
                        secret: '***REDACTED***'
                    } : undefined,
                    secondaryServer: profile.radiusConfig.secondaryServer ? {
                        ...profile.radiusConfig.secondaryServer,
                        secret: '***REDACTED***'
                    } : undefined
                } : undefined
            }));
            
            res.json({
                data: sanitizedProfiles
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to retrieve security profiles',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

router.post('/security-profiles',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 1, max: 64 }),
        body('authType').isIn(['open', 'wep', 'wpa2_psk', 'wpa2_enterprise', 'wpa3_psk', 'wpa3_enterprise']),
        body('encryption').optional().isIn(['none', 'wep', 'tkip', 'aes', 'mixed']),
        body('passphrase').optional().isString().isLength({ min: 8, max: 63 }),
        body('isTemplate').optional().isBoolean(),
        body('description').optional().isString().isLength({ max: 255 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                name,
                authType,
                encryption,
                passphrase,
                radiusConfig,
                certificateConfig,
                vendorSpecific = {},
                isTemplate = false,
                description
            } = req.body;
            
            // Check for duplicate profile name
            const existingProfile = mockSecurityProfiles.find(profile => profile.name === name);
            if (existingProfile) {
                return res.status(409).json({
                    error: {
                        code: 'PROFILE_NAME_CONFLICT',
                        message: `Security profile with name "${name}" already exists`,
                        details: { existingId: existingProfile.id }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            const newProfile = {
                id: `sec-prof-${Date.now()}`,
                name,
                authType,
                encryption,
                passphrase,
                radiusConfig,
                certificateConfig,
                vendorSpecific,
                isTemplate,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system',
                    description
                }
            };
            
            mockSecurityProfiles.push(newProfile);
            
            // Sanitize response
            const sanitizedProfile = {
                ...newProfile,
                passphrase: newProfile.passphrase ? '***REDACTED***' : undefined,
                radiusConfig: newProfile.radiusConfig ? {
                    ...newProfile.radiusConfig,
                    primaryServer: newProfile.radiusConfig.primaryServer ? {
                        ...newProfile.radiusConfig.primaryServer,
                        secret: '***REDACTED***'
                    } : undefined
                } : undefined
            };
            
            res.status(201).json(sanitizedProfile);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'PROFILE_CREATION_FAILED',
                    message: 'Failed to create security profile',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Bulk Operations Endpoint
router.post('/ssids/bulk',
    authMiddleware,
    [
        body('operation').isIn(['create', 'update', 'delete']),
        body('ssids').isArray().isLength({ min: 1 }),
        body('options.continueOnError').optional().isBoolean(),
        body('options.validateOnly').optional().isBoolean()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { operation, ssids, options = {} } = req.body;
            const { continueOnError = false, validateOnly = false } = options;
            
            const operationId = `bulk-${Date.now()}`;
            const results = {
                operationId,
                status: 'pending',
                totalItems: ssids.length,
                processedItems: 0,
                successfulItems: 0,
                failedItems: 0,
                errors: [],
                startedAt: new Date().toISOString(),
                completedAt: null
            };
            
            if (validateOnly) {
                // Just validate without actually performing operations
                results.status = 'completed';
                results.processedItems = ssids.length;
                results.successfulItems = ssids.length;
                results.completedAt = new Date().toISOString();
                
                return res.status(202).json(results);
            }
            
            // TODO: Implement actual bulk processing
            // For now, simulate async operation
            setTimeout(() => {
                results.status = 'completed';
                results.processedItems = ssids.length;
                results.successfulItems = ssids.length;
                results.completedAt = new Date().toISOString();
            }, 1000);
            
            res.status(202).json(results);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'BULK_OPERATION_FAILED',
                    message: 'Failed to initiate bulk operation',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('Wireless API Error:', error);
    
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            details: {}
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

// Coverage Areas Management
let mockCoverageAreas = [
    {
        id: 'cov-001',
        name: 'Main Office Floor 1',
        location: 'Building A, Floor 1',
        areaSize: '5000 sq ft',
        userDensity: '50 users',
        accessPoints: ['AP-001', 'AP-002', 'AP-003'],
        signalStrength: '95%',
        coverage: 'indoor',
        frequency: '5GHz',
        status: 'active',
        notes: 'Primary work area with high device density',
        coordinates: {
            x: 0,
            y: 0,
            width: 100,
            height: 60
        },
        metadata: {
            createdAt: '2024-01-15T10:30:00Z',
            updatedAt: '2024-01-15T10:30:00Z',
            createdBy: 'admin'
        }
    },
    {
        id: 'cov-002',
        name: 'Warehouse Zone',
        location: 'Building B, Warehouse',
        areaSize: '15000 sq ft',
        userDensity: '20 users',
        accessPoints: ['AP-004', 'AP-005'],
        signalStrength: '88%',
        coverage: 'outdoor',
        frequency: '2.4GHz',
        status: 'planning',
        notes: 'Large warehouse area requiring extended range coverage',
        coordinates: {
            x: 0,
            y: 0,
            width: 200,
            height: 100
        },
        metadata: {
            createdAt: '2024-01-15T09:15:00Z',
            updatedAt: '2024-01-15T09:15:00Z',
            createdBy: 'admin'
        }
    }
];

let mockBandwidthPolicies = [
    {
        id: 'pol-001',
        name: 'Executive Policy',
        description: 'High-priority access for executives',
        downloadLimit: 'unlimited',
        uploadLimit: 'unlimited',
        priority: 'high',
        qosClass: 'premium',
        trafficShaping: true,
        contentFiltering: false,
        applicationControl: true,
        timeRestrictions: false,
        userGroups: ['executives', 'administrators'],
        deviceTypes: ['laptop', 'smartphone'],
        status: 'active',
        metadata: {
            createdAt: '2024-01-10T10:00:00Z',
            updatedAt: '2024-01-10T10:00:00Z',
            createdBy: 'admin'
        }
    },
    {
        id: 'pol-002',
        name: 'Guest Policy',
        description: 'Limited access for guest users',
        downloadLimit: '50 Mbps',
        uploadLimit: '10 Mbps',
        priority: 'low',
        qosClass: 'basic',
        trafficShaping: true,
        contentFiltering: true,
        applicationControl: true,
        timeRestrictions: true,
        userGroups: ['guests'],
        deviceTypes: ['any'],
        status: 'active',
        metadata: {
            createdAt: '2024-01-10T11:00:00Z',
            updatedAt: '2024-01-10T11:00:00Z',
            createdBy: 'admin'
        }
    },
    {
        id: 'pol-003',
        name: 'IoT Device Policy',
        description: 'Restricted bandwidth for IoT devices',
        downloadLimit: '5 Mbps',
        uploadLimit: '2 Mbps',
        priority: 'low',
        qosClass: 'basic',
        trafficShaping: true,
        contentFiltering: false,
        applicationControl: true,
        timeRestrictions: false,
        userGroups: ['iot'],
        deviceTypes: ['iot', 'sensor'],
        status: 'active',
        metadata: {
            createdAt: '2024-01-10T12:00:00Z',
            updatedAt: '2024-01-10T12:00:00Z',
            createdBy: 'admin'
        }
    }
];

// Coverage Areas Endpoints

// GET /wireless/coverage-areas - List all coverage areas
router.get('/coverage-areas',
    authMiddleware,
    [
        query('status').optional().isIn(['active', 'planning', 'inactive']),
        query('coverage').optional().isIn(['indoor', 'outdoor']),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { status, coverage, limit = 20, offset = 0 } = req.query;
            
            let filteredAreas = mockCoverageAreas;
            
            if (status) {
                filteredAreas = filteredAreas.filter(area => area.status === status);
            }
            if (coverage) {
                filteredAreas = filteredAreas.filter(area => area.coverage === coverage);
            }
            
            const total = filteredAreas.length;
            const paginatedAreas = filteredAreas.slice(offset, offset + limit);
            
            res.json({
                data: paginatedAreas,
                meta: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasNext: offset + limit < total,
                    hasPrevious: offset > 0
                }
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'COVERAGE_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve coverage areas',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// POST /wireless/coverage-areas - Create new coverage area
router.post('/coverage-areas',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 1, max: 100 }),
        body('location').isString().isLength({ min: 1, max: 200 }),
        body('areaSize').isString().isLength({ min: 1, max: 50 }),
        body('userDensity').isString().isLength({ min: 1, max: 50 }),
        body('coverage').isIn(['indoor', 'outdoor']),
        body('frequency').isIn(['2.4GHz', '5GHz', '6GHz', 'dual-band', 'tri-band']),
        body('accessPoints').optional().isArray(),
        body('signalStrength').optional().isString(),
        body('notes').optional().isString().isLength({ max: 500 }),
        body('coordinates').optional().isObject()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                name,
                location,
                areaSize,
                userDensity,
                coverage,
                frequency,
                accessPoints = [],
                signalStrength = '',
                notes = '',
                coordinates = { x: 0, y: 0, width: 100, height: 60 }
            } = req.body;

            // Check for duplicate name
            const existingArea = mockCoverageAreas.find(area => area.name === name);
            if (existingArea) {
                return res.status(409).json({
                    error: {
                        code: 'COVERAGE_NAME_CONFLICT',
                        message: `Coverage area with name "${name}" already exists`,
                        details: { existingId: existingArea.id }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }

            const newArea = {
                id: `cov-${Date.now()}`,
                name,
                location,
                areaSize,
                userDensity,
                accessPoints,
                signalStrength,
                coverage,
                frequency,
                status: 'planning',
                notes,
                coordinates,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system'
                }
            };

            mockCoverageAreas.push(newArea);

            res.status(201).json(newArea);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'COVERAGE_CREATION_FAILED',
                    message: 'Failed to create coverage area',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// POST /wireless/coverage-areas/validate - Validate coverage area data
router.post('/coverage-areas/validate',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 3, max: 100 }),
        body('location').isString().isLength({ min: 3, max: 200 }),
        body('areaSize').isString().matches(/^\d+(\.\d+)?\s*(sq ft|sq m|ft²|m²|sqft|sqm)$/i),
        body('userDensity').isInt({ min: 1, max: 1000 }),
        body('accessPoints').optional().isArray()
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json({
                isValid: false,
                errors: errors.array().reduce((acc, error) => {
                    acc[error.path] = error.msg;
                    return acc;
                }, {})
            });
        }

        // Additional business logic validation can go here
        const { name, location, areaSize, userDensity } = req.body;
        
        // Check for duplicate names
        const existingArea = mockCoverageAreas.find(area => 
            area.name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingArea) {
            return res.status(200).json({
                isValid: false,
                errors: { name: 'Coverage area with this name already exists' }
            });
        }

        res.json({
            isValid: true,
            errors: {}
        });
    }
);

// GET /wireless/coverage-areas/:id - Get specific coverage area
router.get('/coverage-areas/:id',
    authMiddleware,
    [param('id').isString()],
    validateRequest,
    async (req, res) => {
        try {
            const { id } = req.params;
            const area = mockCoverageAreas.find(area => area.id === id);
            
            if (!area) {
                return res.status(404).json({
                    error: {
                        code: 'COVERAGE_NOT_FOUND',
                        message: `Coverage area with ID "${id}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            res.json(area);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'COVERAGE_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve coverage area',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Bandwidth Policies Endpoints

// GET /wireless/bandwidth-policies - List all bandwidth policies
router.get('/bandwidth-policies',
    authMiddleware,
    [
        query('status').optional().isIn(['active', 'inactive']),
        query('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { status, priority, limit = 20, offset = 0 } = req.query;
            
            let filteredPolicies = mockBandwidthPolicies;
            
            if (status) {
                filteredPolicies = filteredPolicies.filter(policy => policy.status === status);
            }
            if (priority) {
                filteredPolicies = filteredPolicies.filter(policy => policy.priority === priority);
            }
            
            const total = filteredPolicies.length;
            const paginatedPolicies = filteredPolicies.slice(offset, offset + limit);
            
            res.json({
                data: paginatedPolicies,
                meta: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasNext: offset + limit < total,
                    hasPrevious: offset > 0
                }
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'BANDWIDTH_POLICY_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve bandwidth policies',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// POST /wireless/bandwidth-policies - Create new bandwidth policy
router.post('/bandwidth-policies',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 1, max: 100 }),
        body('description').isString().isLength({ min: 1, max: 500 }),
        body('downloadLimit').optional().isString(),
        body('uploadLimit').optional().isString(),
        body('priority').isIn(['low', 'medium', 'high', 'critical']),
        body('qosClass').isIn(['basic', 'standard', 'premium', 'enterprise']),
        body('trafficShaping').optional().isBoolean(),
        body('contentFiltering').optional().isBoolean(),
        body('applicationControl').optional().isBoolean(),
        body('timeRestrictions').optional().isBoolean(),
        body('userGroups').optional().isArray(),
        body('deviceTypes').optional().isArray()
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                name,
                description,
                downloadLimit = '',
                uploadLimit = '',
                priority,
                qosClass,
                trafficShaping = false,
                contentFiltering = false,
                applicationControl = false,
                timeRestrictions = false,
                userGroups = [],
                deviceTypes = []
            } = req.body;

            // Check for duplicate name
            const existingPolicy = mockBandwidthPolicies.find(policy => policy.name === name);
            if (existingPolicy) {
                return res.status(409).json({
                    error: {
                        code: 'POLICY_NAME_CONFLICT',
                        message: `Bandwidth policy with name "${name}" already exists`,
                        details: { existingId: existingPolicy.id }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }

            const newPolicy = {
                id: `pol-${Date.now()}`,
                name,
                description,
                downloadLimit,
                uploadLimit,
                priority,
                qosClass,
                trafficShaping,
                contentFiltering,
                applicationControl,
                timeRestrictions,
                userGroups,
                deviceTypes,
                status: 'active',
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'system'
                }
            };

            mockBandwidthPolicies.push(newPolicy);

            res.status(201).json(newPolicy);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'BANDWIDTH_POLICY_CREATION_FAILED',
                    message: 'Failed to create bandwidth policy',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// POST /wireless/bandwidth-policies/validate - Validate bandwidth policy data
router.post('/bandwidth-policies/validate',
    authMiddleware,
    [
        body('name').isString().isLength({ min: 3, max: 100 }),
        body('description').isString().isLength({ min: 1, max: 500 }),
        body('downloadLimit').isString().matches(/^\d+(\.\d+)?\s*(Mbps|Gbps|mbps|gbps|KB\/s|MB\/s|GB\/s)$/i),
        body('uploadLimit').isString().matches(/^\d+(\.\d+)?\s*(Mbps|Gbps|mbps|gbps|KB\/s|MB\/s|GB\/s)$/i),
        body('priority').isIn(['low', 'medium', 'high', 'critical']),
        body('qosClass').optional().isIn(['besteffort', 'bronze', 'silver', 'gold', 'platinum']),
        body('userGroups').optional().isArray(),
        body('deviceTypes').optional().isArray()
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json({
                isValid: false,
                errors: errors.array().reduce((acc, error) => {
                    acc[error.path] = error.msg;
                    return acc;
                }, {})
            });
        }

        // Additional business logic validation
        const { name, downloadLimit, uploadLimit } = req.body;
        
        // Check for duplicate names
        const existingPolicy = mockBandwidthPolicies.find(policy => 
            policy.name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingPolicy) {
            return res.status(200).json({
                isValid: false,
                errors: { name: 'Bandwidth policy with this name already exists' }
            });
        }

        // Validate download/upload limits relationship
        const downloadValue = parseFloat(downloadLimit);
        const uploadValue = parseFloat(uploadLimit);
        
        if (uploadValue > downloadValue) {
            return res.status(200).json({
                isValid: false,
                errors: { uploadLimit: 'Upload limit cannot exceed download limit' }
            });
        }

        res.json({
            isValid: true,
            errors: {}
        });
    }
);

// GET /wireless/bandwidth-policies/:id - Get specific bandwidth policy
router.get('/bandwidth-policies/:id',
    authMiddleware,
    [param('id').isString()],
    validateRequest,
    async (req, res) => {
        try {
            const { id } = req.params;
            const policy = mockBandwidthPolicies.find(policy => policy.id === id);
            
            if (!policy) {
                return res.status(404).json({
                    error: {
                        code: 'POLICY_NOT_FOUND',
                        message: `Bandwidth policy with ID "${id}" not found`,
                        details: {}
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                });
            }
            
            res.json(policy);
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'BANDWIDTH_POLICY_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve bandwidth policy',
                    details: { error: error.message }
                },
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            });
        }
    }
);

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('Wireless API Error:', error);
    
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            details: {}
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

module.exports = router;