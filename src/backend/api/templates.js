const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/connection');
const { authenticateToken } = require('../core/auth');
const { validate, schemas } = require('../core/validation');
const { logger } = require('../database/connection');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/templates - Get all public templates and customer-specific templates
router.get('/', async (req, res) => {
  try {
    const { service_type, customer_id } = req.query;
    
    let whereClause = 'WHERE (t.is_public = true';
    let queryParams = [];
    let paramIndex = 1;

    // Add customer-specific templates if customer_id provided
    if (customer_id) {
      whereClause += ` OR ct.customer_id = $${paramIndex}`;
      queryParams.push(customer_id);
      paramIndex++;
    }
    
    whereClause += ')';

    // Filter by service type if provided
    if (service_type) {
      whereClause += ` AND t.service_type = $${paramIndex}`;
      queryParams.push(service_type);
      paramIndex++;
    }

    const templatesQuery = `
      SELECT DISTINCT
        t.id,
        t.name,
        t.description,
        t.service_type,
        t.template_data,
        t.is_public,
        t.created_at,
        ct.is_default as customer_default,
        ct.usage_count,
        ct.last_used,
        CASE WHEN ct.customer_id IS NOT NULL THEN true ELSE false END as is_customer_template
      FROM templates t
      LEFT JOIN customer_templates ct ON t.id = ct.template_id
      ${whereClause}
      ORDER BY 
        ct.is_default DESC NULLS LAST,
        ct.usage_count DESC NULLS LAST,
        t.created_at DESC
    `;

    const result = await query(templatesQuery, queryParams);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

// GET /api/templates/:id - Get specific template
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id } = req.query;

    const templateQuery = `
      SELECT 
        t.*,
        ct.is_default as customer_default,
        ct.usage_count,
        ct.last_used,
        CASE WHEN ct.customer_id IS NOT NULL THEN true ELSE false END as is_customer_template
      FROM templates t
      LEFT JOIN customer_templates ct ON t.id = ct.template_id AND ct.customer_id = $2
      WHERE t.id = $1 AND (t.is_public = true OR ct.customer_id = $2)
    `;

    const result = await query(templateQuery, [id, customer_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: 'Template does not exist or access denied'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      message: error.message
    });
  }
});

// POST /api/templates - Create new template
router.post('/',
  validate(schemas.template.create),
  async (req, res) => {
    try {
      const { name, description, service_type, template_data, is_public = false } = req.body;
      const created_by = req.user.userId;

      const templateId = uuidv4();
      const insertQuery = `
        INSERT INTO templates (id, name, description, service_type, template_data, is_public, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertQuery, [
        templateId, name, description, service_type, 
        JSON.stringify(template_data), is_public, created_by
      ]);

      logger.info('Template created successfully', { templateId, name, service_type });

      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Template created successfully'
      });

    } catch (error) {
      logger.error('Error creating template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create template',
        message: error.message
      });
    }
  }
);

// POST /api/templates/:id/assign - Assign template to customer
router.post('/:id/assign', async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const { customer_id, is_default = false } = req.body;

    // Check if template exists and is accessible
    const templateCheck = await query(
      'SELECT id FROM templates WHERE id = $1 AND (is_public = true OR created_by = $2)',
      [templateId, req.user.userId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: 'Template does not exist or access denied'
      });
    }

    // Check if customer exists
    const customerCheck = await query('SELECT id FROM customers WHERE id = $1', [customer_id]);
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        message: 'Customer does not exist'
      });
    }

    // If setting as default, unset other defaults for this customer and service type
    if (is_default) {
      await query(`
        UPDATE customer_templates 
        SET is_default = false 
        WHERE customer_id = $1 
          AND template_id IN (
            SELECT id FROM templates WHERE service_type = (
              SELECT service_type FROM templates WHERE id = $2
            )
          )
      `, [customer_id, templateId]);
    }

    // Insert or update customer template assignment
    const assignQuery = `
      INSERT INTO customer_templates (customer_id, template_id, template_name, service_type, is_default)
      SELECT $1, $2, t.name, t.service_type, $3
      FROM templates t WHERE t.id = $2
      ON CONFLICT (customer_id, template_id) 
      DO UPDATE SET 
        is_default = EXCLUDED.is_default,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await query(assignQuery, [customer_id, templateId, is_default]);

    logger.info('Template assigned to customer', { templateId, customer_id, is_default });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Template assigned to customer successfully'
    });

  } catch (error) {
    logger.error('Error assigning template to customer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign template',
      message: error.message
    });
  }
});

// DELETE /api/templates/:id/assign - Remove template assignment from customer
router.delete('/:id/assign', async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const { customer_id } = req.body;

    const deleteQuery = `
      DELETE FROM customer_templates 
      WHERE template_id = $1 AND customer_id = $2
      RETURNING *
    `;

    const result = await query(deleteQuery, [templateId, customer_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
        message: 'Template assignment does not exist'
      });
    }

    logger.info('Template assignment removed', { templateId, customer_id });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Template assignment removed successfully'
    });

  } catch (error) {
    logger.error('Error removing template assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove template assignment',
      message: error.message
    });
  }
});

// POST /api/templates/:id/use - Track template usage
router.post('/:id/use', async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const { customer_id } = req.body;

    // Update usage statistics
    const updateQuery = `
      UPDATE customer_templates 
      SET 
        usage_count = usage_count + 1,
        last_used = CURRENT_TIMESTAMP
      WHERE template_id = $1 AND customer_id = $2
      RETURNING *
    `;

    const result = await query(updateQuery, [templateId, customer_id]);

    if (result.rows.length === 0) {
      // If customer template assignment doesn't exist, create it
      const insertQuery = `
        INSERT INTO customer_templates (customer_id, template_id, template_name, service_type, usage_count, last_used)
        SELECT $1, $2, t.name, t.service_type, 1, CURRENT_TIMESTAMP
        FROM templates t WHERE t.id = $2
        RETURNING *
      `;
      
      const insertResult = await query(insertQuery, [customer_id, templateId]);
      
      res.json({
        success: true,
        data: insertResult.rows[0],
        message: 'Template usage tracked'
      });
    } else {
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Template usage updated'
      });
    }

  } catch (error) {
    logger.error('Error tracking template usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track template usage',
      message: error.message
    });
  }
});

// GET /api/templates/customer/:customerId - Get customer's templates
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { service_type } = req.query;

    let whereClause = 'WHERE ct.customer_id = $1';
    let queryParams = [customerId];

    if (service_type) {
      whereClause += ' AND t.service_type = $2';
      queryParams.push(service_type);
    }

    const templatesQuery = `
      SELECT 
        t.*,
        ct.is_default,
        ct.usage_count,
        ct.last_used,
        ct.created_at as assigned_at
      FROM customer_templates ct
      JOIN templates t ON ct.template_id = t.id
      ${whereClause}
      ORDER BY ct.is_default DESC, ct.usage_count DESC, ct.last_used DESC NULLS LAST
    `;

    const result = await query(templatesQuery, queryParams);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error fetching customer templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer templates',
      message: error.message
    });
  }
});

module.exports = router; 