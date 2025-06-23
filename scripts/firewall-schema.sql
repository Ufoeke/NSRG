-- Multi-Vendor Firewall Management Schema
-- Extends the existing database to support multiple firewall vendors

-- Firewall Vendors Table
CREATE TABLE IF NOT EXISTS firewall_vendors (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(50) UNIQUE NOT NULL,
    vendor_type VARCHAR(50) NOT NULL, -- fortigate, cisco-fmc, palo-alto, etc.
    name VARCHAR(100) NOT NULL,
    description TEXT,
    api_url VARCHAR(255) NOT NULL,
    credentials_encrypted TEXT NOT NULL, -- JSON encrypted credentials
    config_data JSONB, -- Additional vendor-specific configuration
    status ENUM('active', 'inactive', 'error') DEFAULT 'inactive',
    last_connected_at TIMESTAMP,
    capabilities JSONB, -- Array of supported capabilities
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    
    -- Indexes
    INDEX idx_vendor_type (vendor_type),
    INDEX idx_vendor_status (status),
    INDEX idx_vendor_id (vendor_id),
    
    -- Foreign Keys
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Firewall Devices Table
CREATE TABLE IF NOT EXISTS firewall_devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    version VARCHAR(50),
    ip_address INET,
    status ENUM('online', 'offline', 'maintenance', 'error') DEFAULT 'offline',
    capabilities JSONB, -- Device-specific capabilities
    metadata JSONB, -- Additional device information
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_device_vendor (device_id, vendor_id),
    
    -- Indexes
    INDEX idx_device_vendor (vendor_id),
    INDEX idx_device_status (status),
    INDEX idx_device_ip (ip_address),
    
    -- Foreign Keys
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE
);

-- Firewall Rules Table
CREATE TABLE IF NOT EXISTS firewall_rules (
    id SERIAL PRIMARY KEY,
    rule_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_address TEXT,
    destination_address TEXT,
    source_port TEXT,
    destination_port TEXT,
    protocol VARCHAR(20),
    action ENUM('allow', 'deny', 'drop', 'reject', 'reset') NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    priority INT,
    rule_order INT,
    rule_data JSONB, -- Raw vendor-specific rule data
    normalized_data JSONB, -- Normalized rule representation
    tags JSONB, -- Array of tags
    customer_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deployed_at TIMESTAMP,
    
    -- Unique constraint
    UNIQUE KEY unique_rule_device (rule_id, device_id, vendor_id),
    
    -- Indexes
    INDEX idx_rule_device (device_id, vendor_id),
    INDEX idx_rule_customer (customer_id),
    INDEX idx_rule_action (action),
    INDEX idx_rule_enabled (enabled),
    INDEX idx_rule_tags (tags),
    INDEX idx_rule_order (rule_order),
    
    -- Foreign Keys
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE
);

-- Firewall Rule Templates Table
CREATE TABLE IF NOT EXISTS firewall_rule_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- web, database, vpn, etc.
    template_data JSONB NOT NULL, -- Template rule structure
    supported_vendors JSONB, -- Array of supported vendor types
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_template_category (category),
    INDEX idx_template_public (is_public),
    INDEX idx_template_usage (usage_count),
    INDEX idx_template_creator (created_by),
    
    -- Foreign Keys
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Firewall Deployments Table
CREATE TABLE IF NOT EXISTS firewall_deployments (
    id SERIAL PRIMARY KEY,
    deployment_id VARCHAR(100) UNIQUE NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'failed', 'rolled_back') DEFAULT 'pending',
    deployment_type ENUM('rule_create', 'rule_update', 'rule_delete', 'batch_update', 'template_apply') NOT NULL,
    rules_affected JSONB, -- Array of rule IDs affected
    deployment_data JSONB, -- Deployment details and parameters
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_deployment_vendor (vendor_id),
    INDEX idx_deployment_device (device_id),
    INDEX idx_deployment_status (status),
    INDEX idx_deployment_type (deployment_type),
    INDEX idx_deployment_created (created_at),
    
    -- Foreign Keys
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Firewall Policies Table
CREATE TABLE IF NOT EXISTS firewall_policies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_data JSONB NOT NULL, -- Policy configuration
    applicable_vendors JSONB, -- Array of vendor types this applies to
    priority INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    customer_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_policy_customer (customer_id),
    INDEX idx_policy_active (is_active),
    INDEX idx_policy_priority (priority),
    
    -- Foreign Keys
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Firewall Rule Conflicts Table
CREATE TABLE IF NOT EXISTS firewall_rule_conflicts (
    id SERIAL PRIMARY KEY,
    rule_id_1 VARCHAR(100) NOT NULL,
    rule_id_2 VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    conflict_type ENUM('shadowing', 'contradiction', 'redundancy', 'overlap') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    description TEXT,
    auto_resolved BOOLEAN DEFAULT FALSE,
    resolution_data JSONB,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_conflict_device (device_id, vendor_id),
    INDEX idx_conflict_severity (severity),
    INDEX idx_conflict_type (conflict_type),
    INDEX idx_conflict_detected (detected_at),
    INDEX idx_conflict_resolved (auto_resolved, resolved_at),
    
    -- Foreign Keys
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE
);

-- Firewall Analytics Table
CREATE TABLE IF NOT EXISTS firewall_analytics (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- rule_count, deployment_time, error_rate, etc.
    metric_value DECIMAL(15,4),
    metric_data JSONB, -- Additional metric details
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_analytics_vendor (vendor_id),
    INDEX idx_analytics_device (device_id),
    INDEX idx_analytics_metric (metric_type),
    INDEX idx_analytics_period (period_start, period_end),
    
    -- Foreign Keys
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE
);

-- Firewall Configuration Backups Table
CREATE TABLE IF NOT EXISTS firewall_config_backups (
    id SERIAL PRIMARY KEY,
    backup_id VARCHAR(100) UNIQUE NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    backup_type ENUM('scheduled', 'manual', 'pre_deployment', 'emergency') NOT NULL,
    config_data JSONB NOT NULL, -- Full configuration backup
    file_path VARCHAR(500), -- Optional file storage path
    size_bytes BIGINT,
    checksum VARCHAR(64),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_backup_vendor (vendor_id),
    INDEX idx_backup_device (device_id),
    INDEX idx_backup_type (backup_type),
    INDEX idx_backup_created (created_at),
    INDEX idx_backup_expires (expires_at),
    
    -- Foreign Keys
    FOREIGN KEY (vendor_id) REFERENCES firewall_vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Views for easier querying

-- Active Firewall Rules View
CREATE VIEW active_firewall_rules AS
SELECT 
    fr.*,
    fv.vendor_type,
    fv.name AS vendor_name,
    fd.name AS device_name,
    fd.ip_address AS device_ip,
    c.name AS customer_name
FROM firewall_rules fr
JOIN firewall_vendors fv ON fr.vendor_id = fv.vendor_id
JOIN firewall_devices fd ON fr.device_id = fd.device_id AND fr.vendor_id = fd.vendor_id
LEFT JOIN customers c ON fr.customer_id = c.id
WHERE fr.enabled = TRUE AND fv.status = 'active' AND fd.status = 'online';

-- Firewall Summary View
CREATE VIEW firewall_summary AS
SELECT 
    fv.vendor_id,
    fv.vendor_type,
    fv.name AS vendor_name,
    COUNT(DISTINCT fd.id) AS device_count,
    COUNT(DISTINCT fr.id) AS total_rules,
    COUNT(DISTINCT CASE WHEN fr.enabled = TRUE THEN fr.id END) AS active_rules,
    COUNT(DISTINCT CASE WHEN frc.id IS NOT NULL THEN frc.id END) AS conflict_count,
    MAX(fd.last_sync_at) AS last_sync_time
FROM firewall_vendors fv
LEFT JOIN firewall_devices fd ON fv.vendor_id = fd.vendor_id
LEFT JOIN firewall_rules fr ON fd.device_id = fr.device_id AND fd.vendor_id = fr.vendor_id
LEFT JOIN firewall_rule_conflicts frc ON fd.device_id = frc.device_id AND fd.vendor_id = frc.vendor_id
GROUP BY fv.vendor_id, fv.vendor_type, fv.name;

-- Functions and Triggers

-- Function to update the updated_at timestamp
DELIMITER $$
CREATE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update timestamp triggers
CREATE TRIGGER firewall_vendors_update_timestamp
    BEFORE UPDATE ON firewall_vendors
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER firewall_devices_update_timestamp
    BEFORE UPDATE ON firewall_devices
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER firewall_rules_update_timestamp
    BEFORE UPDATE ON firewall_rules
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER firewall_rule_templates_update_timestamp
    BEFORE UPDATE ON firewall_rule_templates
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER firewall_policies_update_timestamp
    BEFORE UPDATE ON firewall_policies
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Function to automatically detect simple rule conflicts
DELIMITER $$
CREATE FUNCTION detect_rule_conflicts()
RETURNS TRIGGER AS $$
BEGIN
    -- Simple overlapping rules detection
    INSERT INTO firewall_rule_conflicts (
        rule_id_1, rule_id_2, device_id, vendor_id, 
        conflict_type, severity, description
    )
    SELECT 
        NEW.rule_id,
        fr.rule_id,
        NEW.device_id,
        NEW.vendor_id,
        'overlap' as conflict_type,
        'medium' as severity,
        CONCAT('Rules may overlap: ', NEW.name, ' and ', fr.name) as description
    FROM firewall_rules fr
    WHERE fr.device_id = NEW.device_id 
        AND fr.vendor_id = NEW.vendor_id
        AND fr.rule_id != NEW.rule_id
        AND fr.enabled = TRUE
        AND NEW.enabled = TRUE
        AND fr.source_address = NEW.source_address
        AND fr.destination_address = NEW.destination_address
        AND fr.destination_port = NEW.destination_port
        AND fr.protocol = NEW.protocol
        AND fr.action != NEW.action
    ON DUPLICATE KEY UPDATE detected_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply conflict detection trigger
CREATE TRIGGER firewall_rules_conflict_detection
    AFTER INSERT OR UPDATE ON firewall_rules
    FOR EACH ROW EXECUTE FUNCTION detect_rule_conflicts();

-- Sample data for testing (optional)
INSERT INTO firewall_vendors (vendor_id, vendor_type, name, description, api_url, credentials_encrypted, capabilities, status) VALUES
('demo-fortigate', 'fortigate', 'Demo FortiGate', 'Demo FortiGate firewall for testing', 'https://demo-fortigate.local', '{"username":"admin","password":"encrypted_password"}', '["firewall_rules", "nat_rules", "vpn", "utm"]', 'active'),
('demo-paloalto', 'palo-alto', 'Demo Palo Alto', 'Demo Palo Alto firewall for testing', 'https://demo-paloalto.local', '{"username":"admin","password":"encrypted_password"}', '["firewall_rules", "nat_rules", "vpn", "url_filtering", "threat_prevention"]', 'active');

-- Add some indexes for performance optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firewall_rules_composite ON firewall_rules (vendor_id, device_id, enabled, action);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firewall_rules_jsonb_tags ON firewall_rules USING GIN (tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firewall_rules_jsonb_data ON firewall_rules USING GIN (rule_data);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_firewall_devices_jsonb_capabilities ON firewall_devices USING GIN (capabilities); 