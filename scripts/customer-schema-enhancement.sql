-- Customer Management System Schema Enhancement
-- This script enhances the existing customer database with comprehensive features
-- for smart search, autocomplete, contextual information, and template management

-- Enable extensions for advanced search capabilities
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- For accent-insensitive search

-- ============================================================================
-- ENHANCED CUSTOMERS TABLE
-- ============================================================================

-- Add additional columns to existing customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(50),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS country VARCHAR(50) DEFAULT 'US',
ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255),
ADD COLUMN IF NOT EXISTS department VARCHAR(100),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'standard', -- 'low', 'standard', 'high', 'critical'
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[], -- Array of tags for categorization
ADD COLUMN IF NOT EXISTS search_vector tsvector, -- Full-text search vector
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- CUSTOMER DEVICES TABLE
-- ============================================================================

-- Track devices associated with customers
CREATE TABLE IF NOT EXISTS customer_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(100), -- 'firewall', 'switch', 'wireless_ap', 'router'
    vendor VARCHAR(100), -- 'cisco', 'fortinet', 'meraki', 'palo_alto'
    model VARCHAR(255),
    ip_address INET,
    mac_address MACADDR,
    serial_number VARCHAR(255),
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'maintenance'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER SERVICE HISTORY
-- ============================================================================

-- Enhanced service history with detailed tracking
CREATE TABLE IF NOT EXISTS customer_service_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    service_request_id UUID REFERENCES service_requests(id),
    service_type VARCHAR(100) NOT NULL,
    service_category VARCHAR(100), -- 'firewall_rule', 'vlan_config', 'wireless_setup'
    summary TEXT NOT NULL,
    technician_notes TEXT,
    resolution_notes TEXT,
    priority VARCHAR(20),
    status VARCHAR(50),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER-SPECIFIC TEMPLATES
-- ============================================================================

-- Link customers to their preferred templates
CREATE TABLE IF NOT EXISTS customer_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    template_name VARCHAR(255) NOT NULL, -- Denormalized for quick access
    service_type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT false, -- Whether this is the default template for this service type
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, template_id)
);

-- ============================================================================
-- CUSTOMER CONTACTS
-- ============================================================================

-- Multiple contacts per customer
CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(100), -- 'primary', 'technical', 'billing', 'manager'
    is_primary BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER SEARCH METADATA
-- ============================================================================

-- Optimized search metadata for autocomplete and smart search
CREATE TABLE IF NOT EXISTS customer_search_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    search_terms TEXT[] NOT NULL, -- Array of searchable terms
    search_score INTEGER DEFAULT 0, -- Relevance score based on activity
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER ACTIVITY LOG
-- ============================================================================

-- Track all customer interactions for contextual information
CREATE TABLE IF NOT EXISTS customer_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL, -- 'service_request', 'template_used', 'contact_updated'
    description TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PERFORMANCE INDEXES FOR SMART SEARCH
-- ============================================================================

-- Primary search indexes
CREATE INDEX IF NOT EXISTS idx_customers_search_vector ON customers USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON customers USING gin(email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_trgm ON customers USING gin(company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_priority ON customers(priority);
CREATE INDEX IF NOT EXISTS idx_customers_last_activity ON customers(last_activity);

-- Device indexes
CREATE INDEX IF NOT EXISTS idx_customer_devices_customer_id ON customer_devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_devices_device_type ON customer_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_customer_devices_vendor ON customer_devices(vendor);
CREATE INDEX IF NOT EXISTS idx_customer_devices_ip_address ON customer_devices(ip_address);

-- Service history indexes
CREATE INDEX IF NOT EXISTS idx_customer_service_history_customer_id ON customer_service_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_service_history_service_type ON customer_service_history(service_type);
CREATE INDEX IF NOT EXISTS idx_customer_service_history_created_at ON customer_service_history(created_at);

-- Template indexes
CREATE INDEX IF NOT EXISTS idx_customer_templates_customer_id ON customer_templates(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_templates_service_type ON customer_templates(service_type);
CREATE INDEX IF NOT EXISTS idx_customer_templates_is_default ON customer_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_customer_templates_usage_count ON customer_templates(usage_count);

-- Contact indexes
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_primary ON customer_contacts(is_primary);

-- Search metadata indexes
CREATE INDEX IF NOT EXISTS idx_customer_search_metadata_customer_id ON customer_search_metadata(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_search_metadata_terms ON customer_search_metadata USING gin(search_terms);
CREATE INDEX IF NOT EXISTS idx_customer_search_metadata_score ON customer_search_metadata(search_score);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_customer_activity_log_customer_id ON customer_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activity_log_activity_type ON customer_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_customer_activity_log_created_at ON customer_activity_log(created_at);

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update search vector when customer data changes
CREATE OR REPLACE FUNCTION update_customer_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.company, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.contact_person, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.department, '')), 'D') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
    
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update search vector
CREATE TRIGGER trigger_update_customer_search_vector
    BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_customer_search_vector();

-- Function to update customer activity timestamp
CREATE OR REPLACE FUNCTION update_customer_last_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE customers 
    SET last_activity = CURRENT_TIMESTAMP 
    WHERE id = NEW.customer_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update last activity
CREATE TRIGGER trigger_service_request_activity
    AFTER INSERT ON service_requests
    FOR EACH ROW EXECUTE FUNCTION update_customer_last_activity();

CREATE TRIGGER trigger_activity_log_update
    AFTER INSERT ON customer_activity_log
    FOR EACH ROW EXECUTE FUNCTION update_customer_last_activity();

-- Function to automatically update search metadata
CREATE OR REPLACE FUNCTION update_customer_search_metadata()
RETURNS TRIGGER AS $$
DECLARE
    search_terms_array TEXT[];
BEGIN
    -- Build search terms array
    search_terms_array := ARRAY[
        LOWER(NEW.name),
        LOWER(COALESCE(NEW.email, '')),
        LOWER(COALESCE(NEW.company, '')),
        LOWER(COALESCE(NEW.contact_person, ''))
    ];
    
    -- Add individual words
    search_terms_array := search_terms_array || string_to_array(LOWER(NEW.name), ' ');
    search_terms_array := search_terms_array || string_to_array(LOWER(COALESCE(NEW.company, '')), ' ');
    
    -- Remove empty strings and duplicates
    search_terms_array := array_remove(search_terms_array, '');
    
    -- Insert or update search metadata
    INSERT INTO customer_search_metadata (customer_id, search_terms, last_updated)
    VALUES (NEW.id, search_terms_array, CURRENT_TIMESTAMP)
    ON CONFLICT (customer_id) 
    DO UPDATE SET 
        search_terms = EXCLUDED.search_terms,
        last_updated = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain search metadata
CREATE TRIGGER trigger_update_customer_search_metadata
    AFTER INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_customer_search_metadata();

-- ============================================================================
-- UTILITY FUNCTIONS FOR SMART SEARCH
-- ============================================================================

-- Function for fuzzy customer search with ranking
CREATE OR REPLACE FUNCTION search_customers(
    search_query TEXT,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    customer_id UUID,
    name VARCHAR,
    email VARCHAR,
    company VARCHAR,
    similarity_score REAL,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.email,
        c.company,
        GREATEST(
            similarity(c.name, search_query),
            similarity(COALESCE(c.email, ''), search_query),
            similarity(COALESCE(c.company, ''), search_query)
        ) as similarity_score,
        c.last_activity
    FROM customers c
    WHERE 
        c.status = 'active' AND (
            c.search_vector @@ plainto_tsquery('english', search_query)
            OR c.name ILIKE '%' || search_query || '%'
            OR c.email ILIKE '%' || search_query || '%'
            OR c.company ILIKE '%' || search_query || '%'
            OR similarity(c.name, search_query) > 0.3
            OR similarity(COALESCE(c.email, ''), search_query) > 0.3
            OR similarity(COALESCE(c.company, ''), search_query) > 0.3
        )
    ORDER BY 
        similarity_score DESC,
        c.last_activity DESC NULLS LAST,
        c.name
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer context (for contextual information display)
CREATE OR REPLACE FUNCTION get_customer_context(customer_uuid UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'customer', row_to_json(c.*),
        'devices', (
            SELECT COALESCE(json_agg(row_to_json(cd.*)), '[]'::json)
            FROM customer_devices cd 
            WHERE cd.customer_id = customer_uuid 
            ORDER BY cd.device_name
        ),
        'recent_services', (
            SELECT COALESCE(json_agg(row_to_json(csh.*)), '[]'::json)
            FROM customer_service_history csh 
            WHERE csh.customer_id = customer_uuid 
            ORDER BY csh.created_at DESC 
            LIMIT 10
        ),
        'templates', (
            SELECT COALESCE(json_agg(row_to_json(ct.*)), '[]'::json)
            FROM customer_templates ct 
            WHERE ct.customer_id = customer_uuid 
            ORDER BY ct.usage_count DESC, ct.is_default DESC
        ),
        'contacts', (
            SELECT COALESCE(json_agg(row_to_json(cc.*)), '[]'::json)
            FROM customer_contacts cc 
            WHERE cc.customer_id = customer_uuid 
            ORDER BY cc.is_primary DESC, cc.name
        ),
        'recent_activity', (
            SELECT COALESCE(json_agg(row_to_json(cal.*)), '[]'::json)
            FROM customer_activity_log cal 
            WHERE cal.customer_id = customer_uuid 
            ORDER BY cal.created_at DESC 
            LIMIT 5
        )
    ) INTO result
    FROM customers c
    WHERE c.id = customer_uuid;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Insert sample customer data for testing
INSERT INTO customers (name, email, phone, company, contact_person, department, priority, tags, notes) 
VALUES 
    ('Acme Corporation', 'contact@acme.com', '+1-555-0100', 'Acme Corp', 'John Smith', 'IT', 'high', 
     ARRAY['enterprise', 'priority'], 'Major enterprise client with complex network requirements'),
    ('TechStart Inc', 'admin@techstart.com', '+1-555-0200', 'TechStart Inc', 'Sarah Johnson', 'Engineering', 'standard', 
     ARRAY['startup', 'fast-growth'], 'Growing startup needing scalable solutions'),
    ('Global Systems Ltd', 'support@globalsys.com', '+1-555-0300', 'Global Systems', 'Mike Chen', 'Network Operations', 'critical', 
     ARRAY['global', 'enterprise', '24x7'], 'Critical infrastructure client requiring 24/7 support')
ON CONFLICT (email) DO NOTHING;

-- Insert sample devices
DO $$
DECLARE
    acme_id UUID;
    techstart_id UUID;
    global_id UUID;
BEGIN
    SELECT id INTO acme_id FROM customers WHERE email = 'contact@acme.com';
    SELECT id INTO techstart_id FROM customers WHERE email = 'admin@techstart.com';
    SELECT id INTO global_id FROM customers WHERE email = 'support@globalsys.com';
    
    IF acme_id IS NOT NULL THEN
        INSERT INTO customer_devices (customer_id, device_name, device_type, vendor, model, ip_address, location) VALUES
        (acme_id, 'FW-ACME-01', 'firewall', 'fortinet', 'FortiGate 100F', '192.168.1.1', 'Main Office'),
        (acme_id, 'SW-ACME-01', 'switch', 'cisco', 'Catalyst 2960', '192.168.1.10', 'Server Room');
    END IF;
    
    IF techstart_id IS NOT NULL THEN
        INSERT INTO customer_devices (customer_id, device_name, device_type, vendor, model, ip_address, location) VALUES
        (techstart_id, 'MX-TECH-01', 'firewall', 'meraki', 'MX84', '10.0.0.1', 'Cloud-managed');
    END IF;
    
    IF global_id IS NOT NULL THEN
        INSERT INTO customer_devices (customer_id, device_name, device_type, vendor, model, ip_address, location) VALUES
        (global_id, 'PA-GLOBAL-01', 'firewall', 'palo_alto', 'PA-3220', '172.16.0.1', 'Primary DC'),
        (global_id, 'PA-GLOBAL-02', 'firewall', 'palo_alto', 'PA-3220', '172.16.0.2', 'Backup DC');
    END IF;
END $$; 