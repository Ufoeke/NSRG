-- NSRG Database Schema Enhancement
-- This script enhances the existing basic schema with additional tables and features

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TEMPLATES MANAGEMENT
-- ============================================================================

-- Service request templates for reusable configurations
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL, -- 'firewall', 'vlan', 'wireless'
    template_data JSONB NOT NULL,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- HISTORY AND TRACKING
-- ============================================================================

-- Service request history for audit trail
CREATE TABLE IF NOT EXISTS service_request_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'submitted', 'approved', 'rejected'
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User input history for intelligent suggestions
CREATE TABLE IF NOT EXISTS input_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    service_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_value TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- BATCH OPERATIONS
-- ============================================================================

-- Batch operations for bulk request processing
CREATE TABLE IF NOT EXISTS batch_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    operation_type VARCHAR(50) NOT NULL, -- 'bulk_create', 'bulk_update', 'bulk_submit'
    service_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    batch_data JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Individual items within batch operations
CREATE TABLE IF NOT EXISTS batch_operation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_operation_id UUID REFERENCES batch_operations(id) ON DELETE CASCADE,
    service_request_id UUID REFERENCES service_requests(id),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    item_data JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SERVICE-SPECIFIC ENHANCEMENTS
-- ============================================================================

-- Firewall rule presets and common configurations
CREATE TABLE IF NOT EXISTS firewall_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    preset_data JSONB NOT NULL,
    is_system_preset BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- VLAN configurations and templates
CREATE TABLE IF NOT EXISTS vlan_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    vlan_range_start INTEGER,
    vlan_range_end INTEGER,
    preset_data JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wireless network configurations
CREATE TABLE IF NOT EXISTS wireless_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    security_type VARCHAR(50), -- 'WPA2', 'WPA3', 'Open'
    preset_data JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATIONS AND ALERTS
-- ============================================================================

-- System notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
    is_read BOOLEAN DEFAULT false,
    related_entity_type VARCHAR(50), -- 'service_request', 'batch_operation'
    related_entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_service_type ON service_requests(service_type);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_templates_service_type ON templates(service_type);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_is_public ON templates(is_public);

CREATE INDEX IF NOT EXISTS idx_service_request_history_service_request_id ON service_request_history(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_request_history_created_at ON service_request_history(created_at);

CREATE INDEX IF NOT EXISTS idx_input_history_user_id ON input_history(user_id);
CREATE INDEX IF NOT EXISTS idx_input_history_service_type ON input_history(service_type);
CREATE INDEX IF NOT EXISTS idx_input_history_field_name ON input_history(field_name);

CREATE INDEX IF NOT EXISTS idx_batch_operations_created_by ON batch_operations(created_by);
CREATE INDEX IF NOT EXISTS idx_batch_operations_status ON batch_operations(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ============================================================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_operations_updated_at BEFORE UPDATE ON batch_operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA INSERTION
-- ============================================================================

-- Insert sample users (if not exists)
INSERT INTO users (id, username, email, password_hash, role, is_active)
SELECT 
    uuid_generate_v4(),
    'admin',
    'admin@nsrg.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/xAJY5.Kxe', -- password: admin123
    'admin',
    true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT INTO users (id, username, email, password_hash, role, is_active)
SELECT 
    uuid_generate_v4(),
    'user1',
    'user1@nsrg.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/xAJY5.Kxe', -- password: admin123
    'user',
    true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'user1');

-- Insert sample customers (if not exists)
INSERT INTO customers (id, name, email, phone, company, metadata)
SELECT 
    uuid_generate_v4(),
    'Acme Corporation',
    'contact@acme.com',
    '+1-555-0123',
    'Acme Corp',
    '{"industry": "technology", "size": "large", "priority": "high"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE name = 'Acme Corporation');

INSERT INTO customers (id, name, email, phone, company, metadata)
SELECT 
    uuid_generate_v4(),
    'TechStart Inc',
    'info@techstart.com',
    '+1-555-0456',
    'TechStart Inc',
    '{"industry": "startup", "size": "small", "priority": "medium"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE name = 'TechStart Inc');

-- Insert sample firewall presets
INSERT INTO firewall_presets (name, description, preset_data, is_system_preset)
VALUES 
    ('Web Server Access', 'Standard web server firewall rules', '{"rules": [{"protocol": "TCP", "port": "80", "action": "ALLOW"}, {"protocol": "TCP", "port": "443", "action": "ALLOW"}], "default_action": "DENY"}', true),
    ('Database Server', 'Standard database server access', '{"rules": [{"protocol": "TCP", "port": "3306", "action": "ALLOW", "source": "internal"}, {"protocol": "TCP", "port": "5432", "action": "ALLOW", "source": "internal"}], "default_action": "DENY"}', true);

-- Insert sample VLAN presets
INSERT INTO vlan_presets (name, description, vlan_range_start, vlan_range_end, preset_data)
VALUES 
    ('Guest Network', 'Standard guest network configuration', 100, 199, '{"isolation": true, "internet_access": true, "bandwidth_limit": "10Mbps"}'),
    ('Employee Network', 'Standard employee network configuration', 200, 299, '{"isolation": false, "internet_access": true, "bandwidth_limit": "100Mbps"}');

-- Insert sample wireless presets
INSERT INTO wireless_presets (name, description, security_type, preset_data)
VALUES 
    ('Corporate WiFi', 'Standard corporate wireless configuration', 'WPA3', '{"encryption": "AES", "authentication": "802.1X", "guest_access": false}'),
    ('Guest WiFi', 'Guest wireless network configuration', 'WPA2', '{"encryption": "AES", "authentication": "PSK", "guest_access": true, "time_limit": "4h"}');

-- Insert sample templates
INSERT INTO templates (name, description, service_type, template_data, is_public, created_by)
SELECT 
    'Basic Firewall Request',
    'Template for basic firewall rule requests',
    'firewall',
    '{"request_type": "new_rule", "priority": "medium", "business_justification": "", "source_ip": "", "destination_ip": "", "port": "", "protocol": "TCP", "action": "ALLOW"}'::jsonb,
    true,
    (SELECT id FROM users WHERE username = 'admin' LIMIT 1);

INSERT INTO templates (name, description, service_type, template_data, is_public, created_by)
SELECT 
    'VLAN Setup Request',
    'Template for new VLAN configuration',
    'vlan',
    '{"request_type": "new_vlan", "vlan_id": "", "vlan_name": "", "subnet": "", "gateway": "", "dhcp_enabled": true, "isolation": false}'::jsonb,
    true,
    (SELECT id FROM users WHERE username = 'admin' LIMIT 1);

-- ============================================================================
-- SCHEMA VALIDATION
-- ============================================================================

-- Verify all tables were created successfully
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    RAISE NOTICE 'Schema enhancement complete. Total tables: %', table_count;
END $$; 