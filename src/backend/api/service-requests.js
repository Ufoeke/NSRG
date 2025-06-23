const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../database/connection');
const { authenticateToken, requireRole } = require('../core/auth');
const { validate, validateServiceDetails, schemas } = require('../core/validation');
const { cacheMiddleware, cache } = require('../database/cache');
const { logger } = require('../database/connection');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/service-requests - Get all service requests with pagination and filtering
router.get('/',
  cacheMiddleware(300), // Cache for 5 minutes
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status = '',
        service_type = '',
        customer_id = '',
        search = '',
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      // Validate sort parameters
      const validSortFields = ['created_at', 'updated_at', 'status', 'service_type'];
      const sortBy = validSortFields.includes(sort_by) ? sort_by : 'created_at';
      const validSortOrders = ['ASC', 'DESC'];
      const sortOrder = validSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

      // Build dynamic WHERE clause
      const conditions = [];
      const params = [];
      let paramCount = 0;

      // Non-admin users can only see their own requests
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

      if (customer_id) {
        conditions.push(`sr.customer_id = $${++paramCount}`);
        params.push(customer_id);
      }

      if (search) {
        conditions.push(`(sr.service_type ILIKE $${++paramCount} OR sr.request_data::text ILIKE $${++paramCount})`);
        params.push(`%${search}%`, `%${search}%`);
        paramCount++; // Account for second parameter
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM service_requests sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        ${whereClause}
      `;

      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Calculate pagination
      const offset = (page - 1) * limit;
      const totalPages = Math.ceil(total / limit);

      // Get paginated results with only existing columns
      const dataQuery = `
        SELECT 
          sr.id,
          sr.user_id,
          sr.customer_id,
          sr.service_type,
          sr.status,
          sr.request_data,
          sr.servicenow_ticket,
          sr.created_at,
          sr.updated_at,
          c.name as customer_name,
          c.email as customer_email,
          c.company as customer_company,
          u.username as created_by_username
        FROM service_requests sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        LEFT JOIN users u ON sr.user_id = u.id
        ${whereClause}
        ORDER BY sr.${sortBy} ${sortOrder}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;

      params.push(limit, offset);
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
          status,
          service_type,
          customer_id,
          search
        }
      });

    } catch (err) {
      logger.error('Get service requests error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve service requests'
      });
    }
  }
);

// GET /api/service-requests/:id - Get single service request
router.get('/:id',
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await query(`
        SELECT 
          sr.*,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.company as customer_company,
          u.username as created_by_username,
          u.email as created_by_email
        FROM service_requests sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        LEFT JOIN users u ON sr.user_id = u.id
        WHERE sr.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Service request not found',
          message: 'The requested service request does not exist'
        });
      }

      const serviceRequest = result.rows[0];

      // Check authorization (non-admin users can only view their own requests)
      if (req.user.role !== 'admin' && serviceRequest.user_id !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only view your own service requests'
        });
      }

      res.json({
        success: true,
        data: serviceRequest
      });

    } catch (err) {
      logger.error('Get service request error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve service request'
      });
    }
  }
);

// POST /api/service-requests - Create new service request
router.post('/',
  validate(schemas.serviceRequest.create),
  async (req, res) => {
    try {
      const {
        service_type,
        customer_id,
        request_data = {}
      } = req.body;

      // Verify customer exists
      const customerCheck = await query('SELECT id FROM customers WHERE id = $1', [customer_id]);
      if (customerCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid customer',
          message: 'The specified customer does not exist'
        });
      }

      const serviceRequestId = uuidv4();
      
      const result = await query(`
        INSERT INTO service_requests (
          id, user_id, customer_id, service_type, status, request_data, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        serviceRequestId,
        req.user.id,
        customer_id,
        service_type,
        'pending',
        JSON.stringify(request_data)
      ]);

      // Clear cache
      await cache.del('cache:/api/service-requests*');

      logger.info('Service request created', {
        id: result.rows[0].id,
        service_type,
        user_id: req.user.id,
        customer_id
      });

      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Service request created successfully'
      });

    } catch (err) {
      logger.error('Create service request error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create service request'
      });
    }
  }
);

// PUT /api/service-requests/:id - Update service request
router.put('/:id',
  validate(schemas.serviceRequest.update),
  validateServiceDetails,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Get current service request
      const currentResult = await query('SELECT * FROM service_requests WHERE id = $1', [id]);
      
      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Service request not found',
          message: 'The requested service request does not exist'
        });
      }

      const currentRequest = currentResult.rows[0];

      // Check authorization
      if (req.user.role !== 'admin' && currentRequest.created_by !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own service requests'
        });
      }

      // Build update query
      const updateFields = [];
      const params = [];
      let paramCount = 0;

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          updateFields.push(`${key} = $${++paramCount}`);
          params.push(key === 'service_details' ? JSON.stringify(updates[key]) : updates[key]);
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: 'No updates provided',
          message: 'Please provide at least one field to update'
        });
      }

      // Add updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);

      const result = await transaction(async (client) => {
        // Update service request
        const updateResult = await client.query(`
          UPDATE service_requests 
          SET ${updateFields.join(', ')}
          WHERE id = $${++paramCount}
          RETURNING *
        `, params);

        // Log the update in history
        await client.query(`
          INSERT INTO service_request_history (
            id, service_request_id, action, old_values, new_values,
            changed_by, changed_at, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        `, [
          uuidv4(),
          id,
          'updated',
          JSON.stringify(currentRequest),
          JSON.stringify(updateResult.rows[0]),
          req.user.id,
          `Service request updated`
        ]);

        return updateResult.rows[0];
      });

      // Clear cache
      await cache.del('cache:/api/service-requests*');

      logger.info('Service request updated', {
        id,
        updated_by: req.user.id,
        changes: Object.keys(updates)
      });

      res.json({
        success: true,
        message: 'Service request updated successfully',
        data: result
      });

    } catch (err) {
      logger.error('Update service request error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update service request'
      });
    }
  }
);

// DELETE /api/service-requests/:id - Delete service request
router.delete('/:id',
  requireRole('admin'), // Only admins can delete
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await transaction(async (client) => {
        // Get service request before deletion
        const serviceRequest = await client.query('SELECT * FROM service_requests WHERE id = $1', [id]);
        
        if (serviceRequest.rows.length === 0) {
          throw new Error('Service request not found');
        }

        // Log the deletion in history
        await client.query(`
          INSERT INTO service_request_history (
            id, service_request_id, action, old_values, new_values,
            changed_by, changed_at, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        `, [
          uuidv4(),
          id,
          'deleted',
          JSON.stringify(serviceRequest.rows[0]),
          JSON.stringify({}),
          req.user.id,
          `Service request deleted: ${serviceRequest.rows[0].title}`
        ]);

        // Delete service request
        await client.query('DELETE FROM service_requests WHERE id = $1', [id]);

        return serviceRequest.rows[0];
      });

      // Clear cache
      await cache.del('cache:/api/service-requests*');

      logger.info('Service request deleted', {
        id,
        title: result.title,
        deleted_by: req.user.id
      });

      res.json({
        success: true,
        message: 'Service request deleted successfully'
      });

    } catch (err) {
      if (err.message === 'Service request not found') {
        return res.status(404).json({
          error: 'Service request not found',
          message: 'The requested service request does not exist'
        });
      }

      logger.error('Delete service request error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete service request'
      });
    }
  }
);

// GET /api/service-requests/:id/history - Get service request history
router.get('/:id/history',
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if service request exists and user has access
      const serviceRequestResult = await query('SELECT created_by FROM service_requests WHERE id = $1', [id]);
      
      if (serviceRequestResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Service request not found',
          message: 'The requested service request does not exist'
        });
      }

      // Check authorization
      if (req.user.role !== 'admin' && serviceRequestResult.rows[0].created_by !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only view history for your own service requests'
        });
      }

      const historyResult = await query(`
        SELECT 
          h.*,
          u.username as changed_by_username
        FROM service_request_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.service_request_id = $1
        ORDER BY h.changed_at DESC
      `, [id]);

      res.json({
        success: true,
        data: historyResult.rows
      });

    } catch (err) {
      logger.error('Get service request history error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve service request history'
      });
    }
  }
);

// GET /api/service-requests/stats - Get service request statistics
router.get('/stats', 
  cacheMiddleware(600), // Cache for 10 minutes
  async (req, res) => {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE service_type = 'firewall') as firewall,
          COUNT(*) FILTER (WHERE service_type = 'vlan') as vlan,
          COUNT(*) FILTER (WHERE service_type = 'wireless') as wireless,
          COUNT(*) FILTER (WHERE priority = 'critical') as critical,
          COUNT(*) FILTER (WHERE priority = 'high') as high,
          COUNT(*) FILTER (WHERE priority = 'medium') as medium,
          COUNT(*) FILTER (WHERE priority = 'low') as low
        FROM service_requests
        ${req.user.role !== 'admin' ? 'WHERE created_by = $1' : ''}
      `;

      const params = req.user.role !== 'admin' ? [req.user.id] : [];
      const result = await query(statsQuery, params);

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (err) {
      logger.error('Get service request stats error', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve service request statistics'
      });
    }
  }
);

module.exports = router; 