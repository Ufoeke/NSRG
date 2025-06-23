const Joi = require('joi');
const { logger } = require('../database/connection');

// Common validation schemas
const commonSchemas = {
  uuid: Joi.string().uuid().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  role: Joi.string().valid('admin', 'user', 'viewer').default('user'),
  serviceType: Joi.string().valid('firewall', 'vlan', 'wireless').required(),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'failed', 'cancelled').default('pending'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium')
};

// Authentication validation schemas
const authSchemas = {
  login: Joi.object({
    username: commonSchemas.username,
    password: Joi.string().required() // Don't validate password strength on login
  }),
  
  register: Joi.object({
    username: commonSchemas.username,
    email: commonSchemas.email,
    password: commonSchemas.password,
    role: commonSchemas.role.optional()
  }),
  
  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  })
};

// Service request validation schemas
const serviceRequestSchemas = {
  create: Joi.object({
    service_type: commonSchemas.serviceType,
    title: Joi.string().min(5).max(255).required(),
    description: Joi.string().max(2000).optional(),
    customer_id: commonSchemas.uuid,
    priority: commonSchemas.priority,
    service_details: Joi.object().required(),
    requested_by: Joi.string().max(100).optional(),
    business_justification: Joi.string().max(1000).optional(),
    implementation_notes: Joi.string().max(2000).optional()
  }),
  
  update: Joi.object({
    title: Joi.string().min(5).max(255).optional(),
    description: Joi.string().max(2000).optional(),
    priority: commonSchemas.priority.optional(),
    status: commonSchemas.status.optional(),
    service_details: Joi.object().optional(),
    requested_by: Joi.string().max(100).optional(),
    business_justification: Joi.string().max(1000).optional(),
    implementation_notes: Joi.string().max(2000).optional(),
    completion_notes: Joi.string().max(2000).optional()
  }),
  
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('pending', 'in-progress', 'completed', 'failed', 'cancelled').optional(),
    service_type: commonSchemas.serviceType.optional(),
    priority: commonSchemas.priority.optional(),
    customer_id: commonSchemas.uuid.optional(),
    search: Joi.string().max(100).optional(),
    sort_by: Joi.string().valid('created_at', 'updated_at', 'priority', 'status').default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

// Customer validation schemas
const customerSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    email: commonSchemas.email.optional(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
    company: Joi.string().max(255).optional(),
    contact_person: Joi.string().max(255).optional(),
    department: Joi.string().max(100).optional(),
    address: Joi.string().max(500).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(50).optional(),
    zip_code: Joi.string().max(20).optional(),
    country: Joi.string().max(50).default('US'),
    priority: Joi.string().valid('low', 'standard', 'high', 'critical').default('standard'),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
    notes: Joi.string().max(2000).optional(),
    metadata: Joi.object().optional(),
    contacts: Joi.array().items(Joi.object({
      name: Joi.string().min(2).max(255).required(),
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
      role: Joi.string().max(100).default('contact'),
      is_primary: Joi.boolean().default(false),
      notes: Joi.string().max(500).optional()
    })).max(10).optional()
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    email: commonSchemas.email.optional(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
    company: Joi.string().max(255).optional(),
    contact_person: Joi.string().max(255).optional(),
    department: Joi.string().max(100).optional(),
    address: Joi.string().max(500).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(50).optional(),
    zip_code: Joi.string().max(20).optional(),
    country: Joi.string().max(50).optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    priority: Joi.string().valid('low', 'standard', 'high', 'critical').optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
    notes: Joi.string().max(2000).optional(),
    metadata: Joi.object().optional()
  }),
  
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(100).optional(),
    company: Joi.string().max(255).optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    priority: Joi.string().valid('low', 'standard', 'high', 'critical').optional(),
    tags: Joi.string().optional(), // Comma-separated list
    sort_by: Joi.string().valid('name', 'company', 'created_at', 'updated_at', 'last_activity', 'priority').default('last_activity'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  search: Joi.object({
    q: Joi.string().min(2).max(100).required(),
    limit: Joi.number().integer().min(1).max(50).default(10)
  })
};

// Customer device validation schemas
const customerDeviceSchemas = {
  create: Joi.object({
    device_name: Joi.string().min(2).max(255).required(),
    device_type: Joi.string().valid('firewall', 'switch', 'wireless_ap', 'router', 'server', 'other').required(),
    vendor: Joi.string().max(100).optional(),
    model: Joi.string().max(255).optional(),
    ip_address: Joi.string().ip({ version: ['ipv4', 'ipv6'] }).optional(),
    mac_address: Joi.string().pattern(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
    serial_number: Joi.string().max(255).optional(),
    location: Joi.string().max(255).optional(),
    status: Joi.string().valid('active', 'inactive', 'maintenance').default('active'),
    metadata: Joi.object().optional()
  }),

  update: Joi.object({
    device_name: Joi.string().min(2).max(255).optional(),
    device_type: Joi.string().valid('firewall', 'switch', 'wireless_ap', 'router', 'server', 'other').optional(),
    vendor: Joi.string().max(100).optional(),
    model: Joi.string().max(255).optional(),
    ip_address: Joi.string().ip({ version: ['ipv4', 'ipv6'] }).optional(),
    mac_address: Joi.string().pattern(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
    serial_number: Joi.string().max(255).optional(),
    location: Joi.string().max(255).optional(),
    status: Joi.string().valid('active', 'inactive', 'maintenance').optional(),
    metadata: Joi.object().optional()
  })
};

// Customer contact validation schemas
const customerContactSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
    role: Joi.string().valid('primary', 'technical', 'billing', 'manager', 'contact').default('contact'),
    is_primary: Joi.boolean().default(false),
    notes: Joi.string().max(500).optional()
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
    role: Joi.string().valid('primary', 'technical', 'billing', 'manager', 'contact').optional(),
    is_primary: Joi.boolean().optional(),
    notes: Joi.string().max(500).optional()
  })
};

// Template validation schemas
const templateSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    service_type: commonSchemas.serviceType,
    template_data: Joi.object().required(),
    is_public: Joi.boolean().default(false),
    category: Joi.string().max(100).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    template_data: Joi.object().optional(),
    is_public: Joi.boolean().optional(),
    category: Joi.string().max(100).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),
  
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    service_type: commonSchemas.serviceType.optional(),
    is_public: Joi.boolean().optional(),
    category: Joi.string().max(100).optional(),
    search: Joi.string().max(100).optional(),
    sort_by: Joi.string().valid('name', 'created_at', 'updated_at', 'usage_count').default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Customer template assignment schemas
  assign: Joi.object({
    customer_id: commonSchemas.uuid.required(),
    is_default: Joi.boolean().default(false)
  }),

  use: Joi.object({
    customer_id: commonSchemas.uuid.required()
  })
};

// Service-specific validation schemas
const firewallSchemas = {
  serviceDetails: Joi.object({
    rule_type: Joi.string().valid('allow', 'deny').required(),
    source_ip: Joi.string().ip({ version: ['ipv4', 'ipv6'], cidr: 'optional' }).required(),
    destination_ip: Joi.string().ip({ version: ['ipv4', 'ipv6'], cidr: 'optional' }).required(),
    port: Joi.alternatives().try(
      Joi.number().integer().min(1).max(65535),
      Joi.string().pattern(/^\d+(-\d+)?$/)
    ).required(),
    protocol: Joi.string().valid('tcp', 'udp', 'icmp', 'any').required(),
    action_type: Joi.string().valid('permit', 'deny').required(),
    direction: Joi.string().valid('inbound', 'outbound', 'bidirectional').default('inbound')
  })
};

const vlanSchemas = {
  serviceDetails: Joi.object({
    vlan_id: Joi.number().integer().min(1).max(4094).required(),
    vlan_name: Joi.string().min(1).max(32).required(),
    subnet: Joi.string().ip({ version: 'ipv4', cidr: 'required' }).required(),
    gateway: Joi.string().ip({ version: 'ipv4' }).optional(),
    dhcp_enabled: Joi.boolean().default(false),
    dhcp_range_start: Joi.string().ip({ version: 'ipv4' }).when('dhcp_enabled', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    dhcp_range_end: Joi.string().ip({ version: 'ipv4' }).when('dhcp_enabled', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    dns_servers: Joi.array().items(Joi.string().ip({ version: 'ipv4' })).max(3).optional()
  })
};

const wirelessSchemas = {
  serviceDetails: Joi.object({
    ssid: Joi.string().min(1).max(32).required(),
    security_type: Joi.string().valid('open', 'wep', 'wpa', 'wpa2', 'wpa3').required(),
    password: Joi.string().min(8).max(63).when('security_type', {
      is: Joi.valid('wep', 'wpa', 'wpa2', 'wpa3'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    frequency_band: Joi.string().valid('2.4ghz', '5ghz', 'dual').default('dual'),
    max_clients: Joi.number().integer().min(1).max(500).default(50),
    vlan_id: Joi.number().integer().min(1).max(4094).optional(),
    guest_network: Joi.boolean().default(false),
    bandwidth_limit: Joi.number().integer().min(1).optional()
  })
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });
    
    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      logger.warn('Validation error', {
        property,
        errors: errorDetails,
        originalValue: req[property]
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input data',
        details: errorDetails
      });
    }
    
    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

// Service-specific validation middleware
const validateServiceDetails = (req, res, next) => {
  const { service_type, service_details } = req.body;
  
  if (!service_details) {
    return next();
  }
  
  let schema;
  switch (service_type) {
    case 'firewall':
      schema = firewallSchemas.serviceDetails;
      break;
    case 'vlan':
      schema = vlanSchemas.serviceDetails;
      break;
    case 'wireless':
      schema = wirelessSchemas.serviceDetails;
      break;
    default:
      return res.status(400).json({
        error: 'Invalid service type',
        message: 'Unsupported service type for validation'
      });
  }
  
  const { error, value } = schema.validate(service_details, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true
  });
  
  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: `service_details.${detail.path.join('.')}`,
      message: detail.message,
      value: detail.context?.value
    }));
    
    logger.warn('Service details validation error', {
      service_type,
      errors: errorDetails
    });
    
    return res.status(400).json({
      error: 'Service details validation failed',
      message: `Invalid ${service_type} configuration`,
      details: errorDetails
    });
  }
  
  req.body.service_details = value;
  next();
};

/**
 * Validate a service request object for the Intelligence Engine
 * @param {Object} request - The service request to validate
 * @returns {Promise<Object>} Validation result with isValid and errors
 */
async function validateServiceRequest(request) {
  try {
    // Basic request validation using the serviceRequest.create schema
    const { error: basicError, value: basicValue } = serviceRequestSchemas.create.validate(request, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: false
    });

    if (basicError) {
      const errors = basicError.details.map(detail => detail.message);
      return {
        isValid: false,
        errors,
        validatedData: null
      };
    }

    // Service-specific validation if service_details exist
    if (request.service_details && request.service_type) {
      let serviceSchema;
      switch (request.service_type) {
        case 'firewall':
          serviceSchema = firewallSchemas.serviceDetails;
          break;
        case 'vlan':
          serviceSchema = vlanSchemas.serviceDetails;
          break;
        case 'wireless':
          serviceSchema = wirelessSchemas.serviceDetails;
          break;
        default:
          return {
            isValid: false,
            errors: [`Unsupported service type: ${request.service_type}`],
            validatedData: null
          };
      }

      const { error: serviceError, value: serviceValue } = serviceSchema.validate(request.service_details, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
      });

      if (serviceError) {
        const errors = serviceError.details.map(detail => 
          `service_details.${detail.path.join('.')}: ${detail.message}`
        );
        return {
          isValid: false,
          errors,
          validatedData: null
        };
      }

      // Merge validated service details back into the main object
      basicValue.service_details = serviceValue;
    }

    return {
      isValid: true,
      errors: [],
      validatedData: basicValue
    };

  } catch (error) {
    logger.error('Error during service request validation:', error);
    return {
      isValid: false,
      errors: ['Internal validation error'],
      validatedData: null
    };
  }
}



// Export all schemas and validation middleware
module.exports = {
  schemas: {
    auth: authSchemas,
    serviceRequest: serviceRequestSchemas,
    customer: customerSchemas,
    customerDevice: customerDeviceSchemas,
    customerContact: customerContactSchemas,
    template: templateSchemas,
    firewall: firewallSchemas,
    vlan: vlanSchemas,
    wireless: wirelessSchemas
  },
  validate,
  validateServiceDetails,
  validateServiceRequest,
  commonSchemas
}; 