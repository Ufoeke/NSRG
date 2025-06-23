const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/connection');
const { authenticateToken } = require('../core/auth');
const { validate, schemas } = require('../core/validation');
const { cache, cacheMiddleware } = require('../database/cache');
const { logger } = require('../database/connection');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/customers/search - Smart search customers with fuzzy matching
router.get('/search',
  validate(schemas.customer.search, 'query'),
  async (req, res) => {
    try {
      const { q: searchQuery, limit = 10 } = req.query;

      if (!searchQuery || searchQuery.trim().length < 2) {
        return res.json({
          success: true,
          data: [],
          message: 'Search query must be at least 2 characters'
        });
      }

      // Use the custom search function from our schema
      const result = await query(`
        SELECT * FROM search_customers($1, $2)
      `, [searchQuery.trim(), parseInt(limit)]);

      res.json({
        success: true,
        data: result.rows,
        query: searchQuery.trim()
      });

    } catch (err) {
      logger.error('Customer search error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search customers'
      });
    }
  }
);

// GET /api/customers - Get all customers with filtering and pagination (enhanced)
router.get('/',
  validate(schemas.customer.query, 'query'),
  cacheMiddleware(300), // Cache for 5 minutes
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        company,
        status,
        priority,
        tags,
        sort_by = 'last_activity',
        sort_order = 'desc'
      } = req.query;

      // Build WHERE clause with enhanced filtering
      const conditions = [];
      const params = [];
      let paramCount = 0;

      // Smart search across multiple fields
      if (search) {
        conditions.push(`(
          c.search_vector @@ plainto_tsquery('english', $${++paramCount})
          OR c.name ILIKE $${++paramCount}
          OR c.email ILIKE $${++paramCount}
          OR c.company ILIKE $${++paramCount}
          OR c.contact_person ILIKE $${++paramCount}
        )`);
        const searchPattern = `%${search}%`;
        params.push(search, searchPattern, searchPattern, searchPattern, searchPattern);
        paramCount += 4; // Account for additional parameters
      }

      if (company) {
        conditions.push(`c.company ILIKE $${++paramCount}`);
        params.push(`%${company}%`);
      }

      if (status) {
        conditions.push(`c.status = $${++paramCount}`);
        params.push(status);
      }

      if (priority) {
        conditions.push(`c.priority = $${++paramCount}`);
        params.push(priority);
      }

      if (tags) {
        conditions.push(`c.tags && $${++paramCount}`);
        params.push(tags.split(','));
      }

      // Only show active customers by default
      if (!status) {
        conditions.push(`c.status = 'active'`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM customers c ${whereClause}`;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Calculate pagination
      const offset = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      // Get paginated results with enhanced data
      const dataQuery = `
        SELECT 
          c.id,
          c.name,
          c.email,
          c.phone,
          c.company,
          c.contact_person,
          c.department,
          c.address,
          c.city,
          c.state,
          c.zip_code,
          c.country,
          c.status,
          c.priority,
          c.tags,
          c.notes,
          c.last_activity,
          c.created_at,
          c.updated_at,
          COUNT(cd.id) as device_count,
          COUNT(sr.id) as service_request_count,
          COUNT(CASE WHEN sr.status = 'pending' THEN 1 END) as pending_requests
        FROM customers c
        LEFT JOIN customer_devices cd ON c.id = cd.customer_id
        LEFT JOIN service_requests sr ON c.id = sr.customer_id
        ${whereClause}
        GROUP BY c.id
        ORDER BY 
          CASE 
            WHEN $${++paramCount} = 'last_activity' THEN c.last_activity
            WHEN $${paramCount} = 'name' THEN c.name::text
            WHEN $${paramCount} = 'company' THEN c.company::text
            WHEN $${paramCount} = 'created_at' THEN c.created_at::text
            ELSE c.name::text
          END ${sort_order.toUpperCase()} NULLS LAST,
          c.name
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;

      params.push(sort_by, limit, offset);
      const dataResult = await query(dataQuery, params);

      res.json({
        success: true,
        data: dataResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          search,
          company,
          status,
          priority,
          tags
        }
      });

    } catch (err) {
      logger.error('Get customers error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customers'
      });
    }
  }
);

// GET /api/customers/:id - Get single customer with full context
router.get('/:id',
  async (req, res) => {
    try {
      const { id } = req.params;

      // Use our custom context function
      const result = await query(`
        SELECT get_customer_context($1) as context
      `, [id]);

      if (!result.rows[0].context || !result.rows[0].context.customer) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      const context = result.rows[0].context;

      res.json({
        success: true,
        data: {
          ...context.customer,
          devices: context.devices,
          recent_services: context.recent_services,
          templates: context.templates,
          contacts: context.contacts,
          recent_activity: context.recent_activity
        }
      });

    } catch (err) {
      logger.error('Get customer error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customer'
      });
    }
  }
);

// POST /api/customers - Create new customer (enhanced)
router.post('/',
  validate(schemas.customer.create),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        company,
        contact_person,
        department,
        address,
        city,
        state,
        zip_code,
        country = 'US',
        priority = 'standard',
        tags = [],
        notes,
        metadata = {},
        contacts = []
      } = req.body;

      // Check if customer with same email already exists
      if (email) {
        const existingCustomer = await query('SELECT id FROM customers WHERE email = $1', [email]);
        if (existingCustomer.rows.length > 0) {
          return res.status(400).json({
            error: 'Customer already exists',
            message: 'A customer with this email address already exists'
          });
        }
      }

      const customerId = uuidv4();
      
      // Start transaction
      await query('BEGIN');

      try {
        // Create customer with enhanced fields
        const result = await query(`
          INSERT INTO customers (
            id, name, email, phone, company, contact_person, department,
            address, city, state, zip_code, country, priority, tags, notes,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `, [
          customerId, name, email, phone, company, contact_person, department,
          address, city, state, zip_code, country, priority, tags, notes,
          JSON.stringify(metadata)
        ]);

        // Add contacts if provided
        if (contacts && contacts.length > 0) {
          for (const contact of contacts) {
            await query(`
              INSERT INTO customer_contacts (customer_id, name, email, phone, role, is_primary, notes)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              customerId,
              contact.name,
              contact.email,
              contact.phone,
              contact.role || 'contact',
              contact.is_primary || false,
              contact.notes
            ]);
          }
        }

        // Log activity
        await query(`
          INSERT INTO customer_activity_log (customer_id, activity_type, description, user_id)
          VALUES ($1, 'customer_created', 'Customer account created', $2)
        `, [customerId, req.user.id]);

        await query('COMMIT');

        // Clear cache
        await cache.del('cache:/api/customers*');

        logger.info('Customer created', {
          id: result.rows[0].id,
          name,
          email,
          created_by: req.user.id
        });

        // Return customer with full context
        const contextResult = await query(`
          SELECT get_customer_context($1) as context
        `, [customerId]);

        res.status(201).json({
          success: true,
          message: 'Customer created successfully',
          data: contextResult.rows[0].context.customer
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }

    } catch (err) {
      logger.error('Create customer error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create customer'
      });
    }
  }
);

// PUT /api/customers/:id - Update customer (enhanced)
router.put('/:id',
  validate(schemas.customer.update),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if customer exists
      const existingCustomer = await query('SELECT id FROM customers WHERE id = $1', [id]);
      if (existingCustomer.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      // Check if email is being updated and if it conflicts with another customer
      if (updates.email) {
        const emailCheck = await query('SELECT id FROM customers WHERE email = $1 AND id != $2', [updates.email, id]);
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({
            error: 'Email already exists',
            message: 'Another customer with this email address already exists'
          });
        }
      }

      // Build update query dynamically for enhanced fields
      const allowedFields = [
        'name', 'email', 'phone', 'company', 'contact_person', 'department',
        'address', 'city', 'state', 'zip_code', 'country', 'status', 'priority',
        'tags', 'notes', 'metadata'
      ];

      const updateFields = [];
      const params = [];
      let paramCount = 0;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          updateFields.push(`${key} = $${++paramCount}`);
          if (key === 'metadata' && typeof updates[key] === 'object') {
            params.push(JSON.stringify(updates[key]));
          } else {
            params.push(updates[key]);
          }
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: 'No valid updates provided',
          message: 'Please provide at least one valid field to update'
        });
      }

      // Add updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);

      const result = await query(`
        UPDATE customers 
        SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount}
        RETURNING *
      `, params);

      // Log activity
      await query(`
        INSERT INTO customer_activity_log (customer_id, activity_type, description, user_id)
        VALUES ($1, 'customer_updated', 'Customer information updated', $2)
      `, [id, req.user.id]);

      // Clear cache
      await cache.del('cache:/api/customers*');

      logger.info('Customer updated', {
        id,
        updated_by: req.user.id,
        changes: Object.keys(updates).filter(key => allowedFields.includes(key))
      });

      res.json({
        success: true,
        message: 'Customer updated successfully',
        data: result.rows[0]
      });

    } catch (err) {
      logger.error('Update customer error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update customer'
      });
    }
  }
);

// DELETE /api/customers/:id - Delete customer (enhanced with cascading checks)
router.delete('/:id',
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if customer exists
      const customerResult = await query('SELECT name FROM customers WHERE id = $1', [id]);
      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      // Check if customer has any service requests
      const serviceRequestsResult = await query('SELECT COUNT(*) as count FROM service_requests WHERE customer_id = $1', [id]);
      const serviceRequestCount = parseInt(serviceRequestsResult.rows[0].count);

      if (serviceRequestCount > 0) {
        return res.status(400).json({
          error: 'Cannot delete customer',
          message: `Customer has ${serviceRequestCount} associated service request(s). Please reassign or delete them first.`
        });
      }

      // Start transaction for cascading deletion
      await query('BEGIN');

      try {
        // Delete will cascade to related tables due to foreign key constraints
        await query('DELETE FROM customers WHERE id = $1', [id]);

        // Log the deletion
        logger.info('Customer deleted', {
          id,
          name: customerResult.rows[0].name,
          deleted_by: req.user.id
        });

        await query('COMMIT');

        // Clear cache
        await cache.del('cache:/api/customers*');

        res.json({
          success: true,
          message: 'Customer and all related data deleted successfully'
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }

    } catch (err) {
      logger.error('Delete customer error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete customer'
      });
    }
  }
);

// GET /api/customers/:id/devices - Get customer devices
router.get('/:id/devices',
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if customer exists
      const customerCheck = await query('SELECT name FROM customers WHERE id = $1', [id]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      const result = await query(`
        SELECT 
          id, device_name, device_type, vendor, model, ip_address, 
          mac_address, serial_number, location, status, metadata,
          created_at, updated_at
        FROM customer_devices 
        WHERE customer_id = $1 
        ORDER BY device_name
      `, [id]);

      res.json({
        success: true,
        customer: customerCheck.rows[0],
        data: result.rows
      });

    } catch (err) {
      logger.error('Get customer devices error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customer devices'
      });
    }
  }
);

// POST /api/customers/:id/devices - Add customer device
router.post('/:id/devices',
  validate(schemas.customerDevice.create),
  async (req, res) => {
    try {
      const { id: customerId } = req.params;
      const deviceData = req.body;

      // Check if customer exists
      const customerCheck = await query('SELECT name FROM customers WHERE id = $1', [customerId]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      const deviceId = uuidv4();
      const result = await query(`
        INSERT INTO customer_devices (
          id, customer_id, device_name, device_type, vendor, model,
          ip_address, mac_address, serial_number, location, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        deviceId, customerId, deviceData.device_name, deviceData.device_type,
        deviceData.vendor, deviceData.model, deviceData.ip_address,
        deviceData.mac_address, deviceData.serial_number, deviceData.location,
        deviceData.status || 'active', JSON.stringify(deviceData.metadata || {})
      ]);

      // Log activity
      await query(`
        INSERT INTO customer_activity_log (customer_id, activity_type, description, user_id)
        VALUES ($1, 'device_added', $2, $3)
      `, [customerId, `Device ${deviceData.device_name} added`, req.user.id]);

      res.status(201).json({
        success: true,
        message: 'Device added successfully',
        data: result.rows[0]
      });

    } catch (err) {
      logger.error('Add customer device error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to add customer device'
      });
    }
  }
);

// GET /api/customers/:id/contacts - Get customer contacts
router.get('/:id/contacts',
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if customer exists
      const customerCheck = await query('SELECT name FROM customers WHERE id = $1', [id]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      const result = await query(`
        SELECT id, name, email, phone, role, is_primary, notes, created_at, updated_at
        FROM customer_contacts 
        WHERE customer_id = $1 
        ORDER BY is_primary DESC, name
      `, [id]);

      res.json({
        success: true,
        customer: customerCheck.rows[0],
        data: result.rows
      });

    } catch (err) {
      logger.error('Get customer contacts error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customer contacts'
      });
    }
  }
);

// POST /api/customers/:id/contacts - Add customer contact
router.post('/:id/contacts',
  validate(schemas.customerContact.create),
  async (req, res) => {
    try {
      const { id: customerId } = req.params;
      const contactData = req.body;

      // Check if customer exists
      const customerCheck = await query('SELECT name FROM customers WHERE id = $1', [customerId]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      // If this is being set as primary, unset other primary contacts
      if (contactData.is_primary) {
        await query(`
          UPDATE customer_contacts 
          SET is_primary = false 
          WHERE customer_id = $1
        `, [customerId]);
      }

      const contactId = uuidv4();
      const result = await query(`
        INSERT INTO customer_contacts (
          id, customer_id, name, email, phone, role, is_primary, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        contactId, customerId, contactData.name, contactData.email,
        contactData.phone, contactData.role || 'contact',
        contactData.is_primary || false, contactData.notes
      ]);

      // Log activity
      await query(`
        INSERT INTO customer_activity_log (customer_id, activity_type, description, user_id)
        VALUES ($1, 'contact_added', $2, $3)
      `, [customerId, `Contact ${contactData.name} added`, req.user.id]);

      res.status(201).json({
        success: true,
        message: 'Contact added successfully',
        data: result.rows[0]
      });

    } catch (err) {
      logger.error('Add customer contact error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to add customer contact'
      });
    }
  }
);

// GET /api/customers/:id/service-requests - Get all service requests for a customer (enhanced)
router.get('/:id/service-requests',
  validate(schemas.serviceRequest.query, 'query'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status, service_type, sort_by = 'created_at', sort_order = 'desc' } = req.query;

      // Check if customer exists
      const customerResult = await query('SELECT name FROM customers WHERE id = $1', [id]);
      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      // Build WHERE clause
      const conditions = [`sr.customer_id = $1`];
      const params = [id];
      let paramCount = 1;

      // Add user-specific filtering (non-admin users only see their requests)
      if (req.user.role !== 'admin') {
        conditions.push(`sr.user_id = $${++paramCount}`);
        params.push(req.user.id);
      }

      if (status) {
        conditions.push(`sr.status = $${++paramCount}`);
        params.push(status);
      }

      if (service_type) {
        conditions.push(`sr.service_type = $${++paramCount}`);
        params.push(service_type);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM service_requests sr ${whereClause}`;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Calculate pagination
      const offset = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      // Get paginated results
      const dataQuery = `
        SELECT 
          sr.id,
          sr.service_type,
          sr.status,
          sr.request_data,
          sr.servicenow_ticket,
          sr.created_at,
          sr.updated_at,
          u.username as created_by_username
        FROM service_requests sr
        LEFT JOIN users u ON sr.user_id = u.id
        ${whereClause}
        ORDER BY sr.${sort_by} ${sort_order.toUpperCase()}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;

      params.push(limit, offset);
      const dataResult = await query(dataQuery, params);

      res.json({
        success: true,
        customer: customerResult.rows[0],
        data: dataResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });

    } catch (err) {
      logger.error('Get customer service requests error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customer service requests'
      });
    }
  }
);

// GET /api/customers/:id/activity - Get customer activity log
router.get('/:id/activity',
  async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;

      // Check if customer exists
      const customerCheck = await query('SELECT name FROM customers WHERE id = $1', [id]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer not found',
          message: 'The requested customer does not exist'
        });
      }

      const result = await query(`
        SELECT 
          cal.id,
          cal.activity_type,
          cal.description,
          cal.details,
          cal.created_at,
          u.username as performed_by
        FROM customer_activity_log cal
        LEFT JOIN users u ON cal.user_id = u.id
        WHERE cal.customer_id = $1
        ORDER BY cal.created_at DESC
        LIMIT $2
      `, [id, parseInt(limit)]);

      res.json({
        success: true,
        customer: customerCheck.rows[0],
        data: result.rows
      });

    } catch (err) {
      logger.error('Get customer activity error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve customer activity'
      });
    }
  }
);

module.exports = router; 