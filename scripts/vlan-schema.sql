-- VLAN/LAN Service Module Database Schema
-- Supports: Cisco Catalyst, Meraki MS, FortiSwitch, HPE/Aruba switches
-- Features: VLAN management, subnet calculation, port mapping, automation

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Switch vendors and models
CREATE TABLE switch_vendors (
    id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    api_type VARCHAR(20) NOT NULL CHECK (api_type IN ('REST', 'SNMP', 'SSH', 'NETCONF')),
    default_credentials JSONB,
    supported_features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual switches
CREATE TABLE switches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id INTEGER REFERENCES switch_vendors(id),
    name VARCHAR(100) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    mac_address MACADDR,
    model VARCHAR(100),
    firmware_version VARCHAR(50),
    serial_number VARCHAR(100),
    location VARCHAR(255),
    site_id VARCHAR(50),
    management_vlan INTEGER,
    port_count INTEGER DEFAULT 48,
    stack_member INTEGER DEFAULT 1,
    stack_priority INTEGER DEFAULT 1,
    credentials JSONB,
    connection_config JSONB DEFAULT '{}',
    last_sync TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'failed')),
    sync_error TEXT,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostname),
    UNIQUE(ip_address)
);

-- VLAN definitions
CREATE TABLE vlans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vlan_id INTEGER NOT NULL CHECK (vlan_id >= 1 AND vlan_id <= 4094),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    subnet CIDR,
    gateway INET,
    dhcp_enabled BOOLEAN DEFAULT false,
    dhcp_pool_start INET,
    dhcp_pool_end INET,
    dns_servers INET[],
    domain_name VARCHAR(255),
    vlan_type VARCHAR(20) DEFAULT 'access' CHECK (vlan_type IN ('access', 'voice', 'management', 'guest', 'iot', 'dmz', 'quarantine')),
    security_profile VARCHAR(50),
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 7),
    site_id VARCHAR(50),
    department VARCHAR(100),
    is_reserved BOOLEAN DEFAULT false,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'deployed', 'deprecated', 'deleted')),
    deployed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vlan_id, site_id)
);

-- Switch ports
CREATE TABLE switch_ports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    switch_id UUID REFERENCES switches(id) ON DELETE CASCADE,
    port_number VARCHAR(20) NOT NULL,
    port_name VARCHAR(100),
    port_type VARCHAR(20) DEFAULT 'ethernet' CHECK (port_type IN ('ethernet', 'sfp', 'sfp+', 'qsfp', 'stack', 'mgmt')),
    port_mode VARCHAR(20) DEFAULT 'access' CHECK (port_mode IN ('access', 'trunk', 'hybrid', 'routed')),
    native_vlan_id INTEGER,
    allowed_vlans INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    voice_vlan_id INTEGER,
    access_vlan_id INTEGER,
    admin_status VARCHAR(10) DEFAULT 'up' CHECK (admin_status IN ('up', 'down', 'testing')),
    oper_status VARCHAR(20) DEFAULT 'unknown' CHECK (oper_status IN ('up', 'down', 'testing', 'unknown', 'dormant', 'notPresent', 'lowerLayerDown')),
    speed VARCHAR(20),
    duplex VARCHAR(10) CHECK (duplex IN ('full', 'half', 'auto')),
    mtu INTEGER DEFAULT 1500,
    mac_learning BOOLEAN DEFAULT true,
    storm_control JSONB DEFAULT '{}',
    security_config JSONB DEFAULT '{}',
    poe_enabled BOOLEAN DEFAULT false,
    poe_power_limit DECIMAL(6,2),
    connected_device VARCHAR(255),
    device_type VARCHAR(50),
    last_activity TIMESTAMP,
    error_counters JSONB DEFAULT '{}',
    utilization_stats JSONB DEFAULT '{}',
    cable_test_result JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(switch_id, port_number)
);

-- VLAN assignments to switches
CREATE TABLE switch_vlans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    switch_id UUID REFERENCES switches(id) ON DELETE CASCADE,
    vlan_id UUID REFERENCES vlans(id) ON DELETE CASCADE,
    local_vlan_id INTEGER NOT NULL,
    is_native BOOLEAN DEFAULT false,
    is_management BOOLEAN DEFAULT false,
    deployment_status VARCHAR(20) DEFAULT 'pending' CHECK (deployment_status IN ('pending', 'deploying', 'deployed', 'failed', 'removing')),
    deployment_error TEXT,
    deployed_at TIMESTAMP,
    config_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(switch_id, local_vlan_id),
    UNIQUE(switch_id, vlan_id)
);

-- IP subnet tracking and suggestions
CREATE TABLE ip_subnets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subnet CIDR NOT NULL UNIQUE,
    description VARCHAR(255),
    vlan_id UUID REFERENCES vlans(id),
    site_id VARCHAR(50),
    location VARCHAR(255),
    purpose VARCHAR(100),
    ip_version INTEGER DEFAULT 4 CHECK (ip_version IN (4, 6)),
    available_ips INTEGER,
    allocated_ips INTEGER DEFAULT 0,
    reserved_ips INTEGER DEFAULT 0,
    utilization_percent DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN available_ips > 0 
            THEN (allocated_ips::DECIMAL / available_ips::DECIMAL) * 100 
            ELSE 0 
        END
    ) STORED,
    dhcp_scope JSONB,
    dns_zone VARCHAR(255),
    is_supernet BOOLEAN DEFAULT false,
    parent_subnet UUID REFERENCES ip_subnets(id),
    allocation_method VARCHAR(20) DEFAULT 'manual' CHECK (allocation_method IN ('manual', 'dhcp', 'slaac', 'static')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('planning', 'active', 'deprecated', 'reclaimed')),
    created_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VLAN naming conventions and templates
CREATE TABLE vlan_naming_conventions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    pattern VARCHAR(255) NOT NULL,
    description TEXT,
    variables JSONB DEFAULT '{}',
    validation_regex VARCHAR(500),
    example VARCHAR(100),
    site_id VARCHAR(50),
    department VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VLAN templates for common configurations
CREATE TABLE vlan_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_category VARCHAR(50),
    vlan_config JSONB NOT NULL,
    subnet_config JSONB,
    port_config JSONB,
    security_settings JSONB DEFAULT '{}',
    qos_settings JSONB DEFAULT '{}',
    variables JSONB DEFAULT '{}',
    compliance_tags VARCHAR(100)[],
    difficulty_level VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    vendor_compatibility VARCHAR(100)[] DEFAULT ARRAY['cisco-catalyst', 'meraki-ms', 'fortiswitch', 'aruba-cx'],
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configuration deployment tracking
CREATE TABLE vlan_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployment_name VARCHAR(100) NOT NULL,
    description TEXT,
    target_switches UUID[] NOT NULL,
    vlan_configs JSONB NOT NULL,
    deployment_plan JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'validating', 'deploying', 'completed', 'failed', 'rolled_back')),
    progress_percent INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    initiated_by VARCHAR(100) NOT NULL,
    validation_results JSONB,
    deployment_results JSONB,
    rollback_plan JSONB,
    error_details JSONB,
    approval_required BOOLEAN DEFAULT false,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for all VLAN operations
CREATE TABLE vlan_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    switch_id UUID,
    vlan_id UUID,
    user_id VARCHAR(100) NOT NULL,
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    operation_details JSONB NOT NULL,
    old_values JSONB,
    new_values JSONB,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Network topology and discovery
CREATE TABLE network_topology (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_switch_id UUID REFERENCES switches(id),
    source_port VARCHAR(20),
    destination_switch_id UUID REFERENCES switches(id),
    destination_port VARCHAR(20),
    connection_type VARCHAR(20) DEFAULT 'ethernet' CHECK (connection_type IN ('ethernet', 'fiber', 'dac', 'stack', 'wireless')),
    link_speed VARCHAR(20),
    discovered_method VARCHAR(20) CHECK (discovered_method IN ('lldp', 'cdp', 'stp', 'manual', 'snmp')),
    last_discovered TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    notes TEXT
);

-- Performance and analytics
CREATE TABLE vlan_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    switch_id UUID REFERENCES switches(id),
    vlan_id UUID REFERENCES vlans(id),
    metric_type VARCHAR(50) NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit VARCHAR(20),
    measurement_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggregation_period VARCHAR(20) DEFAULT 'realtime' CHECK (aggregation_period IN ('realtime', 'hourly', 'daily', 'weekly', 'monthly')),
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_switches_vendor ON switches(vendor_id);
CREATE INDEX idx_switches_site ON switches(site_id);
CREATE INDEX idx_switches_active ON switches(is_active);
CREATE INDEX idx_vlans_site_vlan_id ON vlans(site_id, vlan_id);
CREATE INDEX idx_vlans_status ON vlans(status);
CREATE INDEX idx_vlans_type ON vlans(vlan_type);
CREATE INDEX idx_switch_ports_switch ON switch_ports(switch_id);
CREATE INDEX idx_switch_ports_mode ON switch_ports(port_mode);
CREATE INDEX idx_switch_vlans_switch ON switch_vlans(switch_id);
CREATE INDEX idx_switch_vlans_vlan ON switch_vlans(vlan_id);
CREATE INDEX idx_ip_subnets_vlan ON ip_subnets(vlan_id);
CREATE INDEX idx_ip_subnets_site ON ip_subnets(site_id);
CREATE INDEX idx_vlan_audit_user ON vlan_audit_log(user_id);
CREATE INDEX idx_vlan_audit_time ON vlan_audit_log(created_at);
CREATE INDEX idx_vlan_analytics_switch_time ON vlan_analytics(switch_id, measurement_time);

-- Functions and triggers for automation
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update timestamp triggers
CREATE TRIGGER update_switches_timestamp 
    BEFORE UPDATE ON switches FOR EACH ROW 
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_vlans_timestamp 
    BEFORE UPDATE ON vlans FOR EACH ROW 
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_switch_ports_timestamp 
    BEFORE UPDATE ON switch_ports FOR EACH ROW 
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_switch_vlans_timestamp 
    BEFORE UPDATE ON switch_vlans FOR EACH ROW 
    EXECUTE FUNCTION update_timestamp();

-- Function to calculate subnet utilization
CREATE OR REPLACE FUNCTION calculate_subnet_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate available IPs based on subnet mask
    NEW.available_ips = CASE 
        WHEN family(NEW.subnet) = 4 THEN 
            power(2, 32 - masklen(NEW.subnet))::INTEGER - 2  -- Subtract network and broadcast
        ELSE 
            CASE 
                WHEN masklen(NEW.subnet) <= 64 THEN 999999999  -- IPv6 /64 or larger
                ELSE power(2, 128 - masklen(NEW.subnet))::INTEGER
            END
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_ip_subnet_stats 
    BEFORE INSERT OR UPDATE ON ip_subnets FOR EACH ROW 
    EXECUTE FUNCTION calculate_subnet_stats();

-- Sample data for switch vendors
INSERT INTO switch_vendors (vendor_name, display_name, api_type, supported_features) VALUES
('cisco-catalyst', 'Cisco Catalyst', 'SSH', '{"snmp": true, "netconf": true, "restconf": false, "stack": true, "poe": true}'),
('meraki-ms', 'Cisco Meraki MS', 'REST', '{"api": true, "cloud": true, "stack": true, "poe": true}'),
('fortiswitch', 'Fortinet FortiSwitch', 'SSH', '{"snmp": true, "fortios": true, "stack": true, "poe": true}'),
('aruba-cx', 'HPE Aruba CX', 'REST', '{"rest": true, "netconf": true, "pyaoscx": true, "stack": true, "poe": true}'),
('aruba-procurve', 'HPE Aruba ProCurve', 'SSH', '{"snmp": true, "cli": true, "stack": false, "poe": true}');

-- Sample VLAN naming conventions
INSERT INTO vlan_naming_conventions (name, pattern, description, variables, validation_regex, example) VALUES
('Department-Location', '{department}-{location}-{purpose}', 'Department based naming with location', 
 '{"department": ["IT", "HR", "Finance", "Sales"], "location": ["HQ", "Branch1", "Branch2"], "purpose": ["Data", "Voice", "Guest"]}',
 '^[A-Z]{2,10}-[A-Z0-9]{2,10}-[A-Z]{3,10}$', 'IT-HQ-Data'),
('VLAN-ID-Purpose', 'VLAN{vlan_id}-{purpose}', 'Simple VLAN ID with purpose',
 '{"purpose": ["Management", "User", "Server", "DMZ", "Guest"]}',
 '^VLAN[0-9]{1,4}-[A-Z]{3,15}$', 'VLAN100-Management'),
('Site-Department-ID', '{site_code}{department_code}{sequence}', 'Site and department codes with sequence',
 '{"site_code": ["NYC", "LAX", "CHI"], "department_code": ["IT", "HR", "FN"], "sequence": ["01", "02", "03"]}',
 '^[A-Z]{3}[A-Z]{2}[0-9]{2}$', 'NYCIT01');

-- Sample VLAN templates
INSERT INTO vlan_templates (name, description, template_category, vlan_config, subnet_config, security_settings) VALUES
('Standard User VLAN', 'Basic user access VLAN with DHCP', 'user-access', 
 '{"vlan_type": "access", "priority": 0}',
 '{"dhcp_enabled": true, "dns_servers": ["8.8.8.8", "8.8.4.4"]}',
 '{"port_security": true, "dhcp_snooping": true}'),
('Guest Network', 'Isolated guest access with internet only', 'guest-access',
 '{"vlan_type": "guest", "priority": 1}',
 '{"dhcp_enabled": true, "dns_servers": ["1.1.1.1", "1.0.0.1"]}',
 '{"isolation": true, "captive_portal": true, "bandwidth_limit": "10Mbps"}'),
('Server VLAN', 'High-priority server network', 'server-access',
 '{"vlan_type": "access", "priority": 6}',
 '{"dhcp_enabled": false}',
 '{"port_security": true, "arp_inspection": true}');

-- Create views for common queries
CREATE VIEW vlan_summary AS
SELECT 
    v.vlan_id,
    v.name,
    v.subnet,
    v.vlan_type,
    v.status,
    COUNT(DISTINCT sv.switch_id) as switch_count,
    COUNT(DISTINCT sp.id) as port_count,
    s.available_ips,
    s.allocated_ips,
    s.utilization_percent
FROM vlans v
LEFT JOIN switch_vlans sv ON v.id = sv.vlan_id
LEFT JOIN switch_ports sp ON sv.local_vlan_id = sp.access_vlan_id OR sv.local_vlan_id = ANY(sp.allowed_vlans)
LEFT JOIN ip_subnets s ON v.id = s.vlan_id
GROUP BY v.id, v.vlan_id, v.name, v.subnet, v.vlan_type, v.status, s.available_ips, s.allocated_ips, s.utilization_percent;

CREATE VIEW switch_port_summary AS
SELECT 
    s.name as switch_name,
    s.hostname,
    sp.port_number,
    sp.port_mode,
    sp.admin_status,
    sp.oper_status,
    CASE 
        WHEN sp.port_mode = 'access' THEN ARRAY[sp.access_vlan_id]
        ELSE sp.allowed_vlans
    END as vlan_list,
    sp.connected_device,
    sp.last_activity
FROM switches s
JOIN switch_ports sp ON s.id = sp.switch_id
ORDER BY s.name, sp.port_number;