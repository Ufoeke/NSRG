-- Wireless Security Profile Templates Database Schema
-- Supporting comprehensive security profile management for wireless networks
-- Includes tables for security profiles, templates, certificates, and RADIUS configuration

-- Extensions for enhanced functionality
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- ===============================
-- SECURITY PROFILES TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_security_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN ('open', 'wpa2_psk', 'wpa3_psk', 'wpa2_enterprise', 'wpa3_enterprise')),
    encryption VARCHAR(50) NOT NULL CHECK (encryption IN ('none', 'AES-128', 'AES-256', 'TKIP')),
    security_level VARCHAR(20) NOT NULL CHECK (security_level IN ('low', 'medium', 'high', 'maximum')),
    use_case VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    is_template BOOLEAN DEFAULT false,
    
    -- WPA/WPA2/WPA3 specific settings
    pmf_required BOOLEAN DEFAULT false,
    pmf_capable BOOLEAN DEFAULT true,
    
    -- Enterprise settings
    radius_required BOOLEAN DEFAULT false,
    certificate_validation BOOLEAN DEFAULT false,
    cnsa BOOLEAN DEFAULT false, -- Commercial National Security Algorithm Suite
    
    -- Vendor compatibility (JSON array)
    vendor_support JSONB DEFAULT '[]',
    
    -- Configuration data (flexible JSON structure)
    configuration JSONB DEFAULT '{}',
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- ===============================
-- PSK CONFIGURATION TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_psk_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES wireless_security_profiles(id) ON DELETE CASCADE,
    
    -- PSK settings
    require_complex_password BOOLEAN DEFAULT true,
    min_length INTEGER DEFAULT 8 CHECK (min_length >= 8 AND min_length <= 63),
    max_length INTEGER DEFAULT 63 CHECK (max_length >= 8 AND max_length <= 63),
    rotation_policy VARCHAR(50), -- e.g., '90-days', '6-months'
    
    -- Character requirements
    require_uppercase BOOLEAN DEFAULT true,
    require_lowercase BOOLEAN DEFAULT true,
    require_numbers BOOLEAN DEFAULT true,
    require_special_chars BOOLEAN DEFAULT false,
    allowed_special_chars VARCHAR(50) DEFAULT '!@#$%^&*',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- SAE CONFIGURATION TABLE (WPA3)
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_sae_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES wireless_security_profiles(id) ON DELETE CASCADE,
    
    -- SAE specific settings
    anti_clogging_threshold INTEGER DEFAULT 5,
    sync_threshold INTEGER DEFAULT 5,
    rejection_threshold INTEGER DEFAULT 5,
    confirm_immediate BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- EAP METHODS TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_eap_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES wireless_security_profiles(id) ON DELETE CASCADE,
    eap_method VARCHAR(50) NOT NULL CHECK (eap_method IN ('EAP-TLS', 'EAP-PEAP', 'EAP-TTLS', 'EAP-FAST', 'EAP-SIM', 'EAP-AKA')),
    is_primary BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 1,
    
    -- Method-specific configuration
    configuration JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- SECURITY TEMPLATES TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_security_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 'enterprise', 'small-business', 'home', 'public'
    
    -- Template configuration
    base_profile_id UUID REFERENCES wireless_security_profiles(id),
    template_config JSONB NOT NULL DEFAULT '{}',
    
    -- Customization options
    customizable_fields JSONB DEFAULT '[]', -- Array of field names that can be customized
    required_fields JSONB DEFAULT '[]', -- Array of required field names
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    is_system_template BOOLEAN DEFAULT false,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- CERTIFICATES TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    certificate_type VARCHAR(50) NOT NULL CHECK (certificate_type IN ('CA', 'server', 'client', 'intermediate')),
    
    -- Certificate data
    certificate_data TEXT NOT NULL, -- PEM format
    private_key_data TEXT, -- PEM format (encrypted)
    certificate_chain TEXT, -- Full certificate chain
    
    -- Certificate metadata
    subject VARCHAR(500),
    issuer VARCHAR(500),
    serial_number VARCHAR(100),
    fingerprint_sha1 VARCHAR(60),
    fingerprint_sha256 VARCHAR(80),
    
    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_to TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT false,
    revocation_date TIMESTAMP WITH TIME ZONE,
    revocation_reason VARCHAR(100),
    
    -- Key information
    key_algorithm VARCHAR(50), -- RSA, ECDSA, etc.
    key_size INTEGER,
    signature_algorithm VARCHAR(100),
    
    -- Usage tracking
    profiles_using JSONB DEFAULT '[]', -- Array of profile IDs using this certificate
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- RADIUS SERVERS TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_radius_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Server connection details
    hostname VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 1812 CHECK (port > 0 AND port <= 65535),
    shared_secret VARCHAR(255) NOT NULL, -- Encrypted
    
    -- Server type and protocol
    server_type VARCHAR(50) DEFAULT 'authentication' CHECK (server_type IN ('authentication', 'accounting', 'both')),
    protocol VARCHAR(20) DEFAULT 'radius' CHECK (protocol IN ('radius', 'radius-tls')),
    
    -- Timeout and retry settings
    timeout_seconds INTEGER DEFAULT 5 CHECK (timeout_seconds > 0),
    max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0),
    
    -- Health monitoring
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
    response_time_ms INTEGER,
    
    -- Failover configuration
    priority INTEGER DEFAULT 1,
    weight INTEGER DEFAULT 1,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- PROFILE-RADIUS ASSOCIATIONS
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_profile_radius (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES wireless_security_profiles(id) ON DELETE CASCADE,
    radius_server_id UUID NOT NULL REFERENCES wireless_radius_servers(id) ON DELETE CASCADE,
    
    -- Association metadata
    server_role VARCHAR(50) DEFAULT 'primary' CHECK (server_role IN ('primary', 'secondary', 'backup')),
    priority INTEGER DEFAULT 1,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(profile_id, radius_server_id)
);

-- ===============================
-- VENDOR COMPATIBILITY TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_vendor_compatibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_name VARCHAR(100) NOT NULL,
    vendor_model VARCHAR(100),
    firmware_version VARCHAR(100),
    
    -- Supported features
    supported_auth_types JSONB DEFAULT '[]',
    supported_encryption JSONB DEFAULT '[]',
    supports_radius BOOLEAN DEFAULT false,
    supports_certificates BOOLEAN DEFAULT false,
    supports_pmf BOOLEAN DEFAULT false,
    max_radius_servers INTEGER DEFAULT 1,
    
    -- Limitations and notes
    limitations JSONB DEFAULT '[]',
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(vendor_name, vendor_model, firmware_version)
);

-- ===============================
-- AUDIT LOG TABLE
-- ===============================
CREATE TABLE IF NOT EXISTS wireless_security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- 'profile', 'template', 'certificate', 'radius'
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'activated', 'deactivated'
    
    -- Change details
    old_values JSONB,
    new_values JSONB,
    changes_summary TEXT,
    
    -- Actor information
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- INDEXES FOR PERFORMANCE
-- ===============================

-- Security Profiles indexes
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_auth_type ON wireless_security_profiles(auth_type);
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_security_level ON wireless_security_profiles(security_level);
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_is_default ON wireless_security_profiles(is_default);
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_is_template ON wireless_security_profiles(is_template);
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_created_at ON wireless_security_profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_wireless_security_profiles_vendor_support ON wireless_security_profiles USING GIN(vendor_support);

-- PSK Config indexes
CREATE INDEX IF NOT EXISTS idx_wireless_psk_config_profile_id ON wireless_psk_config(profile_id);

-- SAE Config indexes
CREATE INDEX IF NOT EXISTS idx_wireless_sae_config_profile_id ON wireless_sae_config(profile_id);

-- EAP Methods indexes
CREATE INDEX IF NOT EXISTS idx_wireless_eap_methods_profile_id ON wireless_eap_methods(profile_id);
CREATE INDEX IF NOT EXISTS idx_wireless_eap_methods_method ON wireless_eap_methods(eap_method);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_wireless_security_templates_category ON wireless_security_templates(category);
CREATE INDEX IF NOT EXISTS idx_wireless_security_templates_base_profile ON wireless_security_templates(base_profile_id);
CREATE INDEX IF NOT EXISTS idx_wireless_security_templates_system ON wireless_security_templates(is_system_template);

-- Certificates indexes
CREATE INDEX IF NOT EXISTS idx_wireless_certificates_type ON wireless_certificates(certificate_type);
CREATE INDEX IF NOT EXISTS idx_wireless_certificates_valid_to ON wireless_certificates(valid_to);
CREATE INDEX IF NOT EXISTS idx_wireless_certificates_is_revoked ON wireless_certificates(is_revoked);
CREATE INDEX IF NOT EXISTS idx_wireless_certificates_fingerprint_sha256 ON wireless_certificates(fingerprint_sha256);

-- RADIUS Servers indexes
CREATE INDEX IF NOT EXISTS idx_wireless_radius_servers_hostname ON wireless_radius_servers(hostname);
CREATE INDEX IF NOT EXISTS idx_wireless_radius_servers_is_active ON wireless_radius_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_wireless_radius_servers_health_status ON wireless_radius_servers(health_status);

-- Profile-RADIUS associations indexes
CREATE INDEX IF NOT EXISTS idx_wireless_profile_radius_profile_id ON wireless_profile_radius(profile_id);
CREATE INDEX IF NOT EXISTS idx_wireless_profile_radius_server_id ON wireless_profile_radius(radius_server_id);

-- Vendor Compatibility indexes
CREATE INDEX IF NOT EXISTS idx_wireless_vendor_compatibility_vendor ON wireless_vendor_compatibility(vendor_name);

-- Audit Log indexes
CREATE INDEX IF NOT EXISTS idx_wireless_security_audit_log_entity ON wireless_security_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_wireless_security_audit_log_action ON wireless_security_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_wireless_security_audit_log_created_at ON wireless_security_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_wireless_security_audit_log_user_id ON wireless_security_audit_log(user_id);

-- ===============================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ===============================

-- Update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_wireless_security_profiles_updated_at BEFORE UPDATE ON wireless_security_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_psk_config_updated_at BEFORE UPDATE ON wireless_psk_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_sae_config_updated_at BEFORE UPDATE ON wireless_sae_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_security_templates_updated_at BEFORE UPDATE ON wireless_security_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_certificates_updated_at BEFORE UPDATE ON wireless_certificates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_radius_servers_updated_at BEFORE UPDATE ON wireless_radius_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wireless_vendor_compatibility_updated_at BEFORE UPDATE ON wireless_vendor_compatibility FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===============================
-- AUDIT LOG TRIGGER
-- ===============================

-- Audit log trigger function
CREATE OR REPLACE FUNCTION log_wireless_security_changes()
RETURNS TRIGGER AS $$
DECLARE
    table_name TEXT;
    entity_id UUID;
    action_type TEXT;
BEGIN
    table_name := TG_TABLE_NAME;
    
    -- Determine action type
    IF TG_OP = 'DELETE' THEN
        action_type := 'deleted';
        entity_id := OLD.id;
        INSERT INTO wireless_security_audit_log (entity_type, entity_id, action, old_values)
        VALUES (table_name, entity_id, action_type, row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'updated';
        entity_id := NEW.id;
        INSERT INTO wireless_security_audit_log (entity_type, entity_id, action, old_values, new_values)
        VALUES (table_name, entity_id, action_type, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        action_type := 'created';
        entity_id := NEW.id;
        INSERT INTO wireless_security_audit_log (entity_type, entity_id, action, new_values)
        VALUES (table_name, entity_id, action_type, row_to_json(NEW));
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to main tables
CREATE TRIGGER wireless_security_profiles_audit AFTER INSERT OR UPDATE OR DELETE ON wireless_security_profiles FOR EACH ROW EXECUTE FUNCTION log_wireless_security_changes();
CREATE TRIGGER wireless_security_templates_audit AFTER INSERT OR UPDATE OR DELETE ON wireless_security_templates FOR EACH ROW EXECUTE FUNCTION log_wireless_security_changes();
CREATE TRIGGER wireless_certificates_audit AFTER INSERT OR UPDATE OR DELETE ON wireless_certificates FOR EACH ROW EXECUTE FUNCTION log_wireless_security_changes();
CREATE TRIGGER wireless_radius_servers_audit AFTER INSERT OR UPDATE OR DELETE ON wireless_radius_servers FOR EACH ROW EXECUTE FUNCTION log_wireless_security_changes();

-- ===============================
-- VIEWS FOR COMMON QUERIES
-- ===============================

-- View for profile summary with associated configurations
CREATE OR REPLACE VIEW wireless_security_profiles_summary AS
SELECT 
    p.id,
    p.name,
    p.description,
    p.auth_type,
    p.encryption,
    p.security_level,
    p.use_case,
    p.is_default,
    p.is_template,
    p.pmf_required,
    p.radius_required,
    p.vendor_support,
    p.created_at,
    p.updated_at,
    
    -- PSK configuration
    psk.require_complex_password,
    psk.min_length as psk_min_length,
    psk.rotation_policy,
    
    -- SAE configuration
    sae.anti_clogging_threshold,
    sae.sync_threshold,
    
    -- EAP methods (aggregated)
    COALESCE(
        json_agg(
            json_build_object(
                'method', eap.eap_method,
                'is_primary', eap.is_primary,
                'priority', eap.priority
            )
        ) FILTER (WHERE eap.eap_method IS NOT NULL),
        '[]'::json
    ) as eap_methods,
    
    -- RADIUS servers count
    (
        SELECT COUNT(*)
        FROM wireless_profile_radius pr
        WHERE pr.profile_id = p.id
    ) as radius_servers_count

FROM wireless_security_profiles p
LEFT JOIN wireless_psk_config psk ON p.id = psk.profile_id
LEFT JOIN wireless_sae_config sae ON p.id = sae.profile_id
LEFT JOIN wireless_eap_methods eap ON p.id = eap.profile_id
GROUP BY p.id, p.name, p.description, p.auth_type, p.encryption, p.security_level, 
         p.use_case, p.is_default, p.is_template, p.pmf_required, p.radius_required, 
         p.vendor_support, p.created_at, p.updated_at, psk.require_complex_password, 
         psk.min_length, psk.rotation_policy, sae.anti_clogging_threshold, sae.sync_threshold;

-- View for certificate expiration monitoring
CREATE OR REPLACE VIEW wireless_certificates_expiring AS
SELECT 
    id,
    name,
    certificate_type,
    subject,
    valid_to,
    EXTRACT(DAYS FROM (valid_to - NOW())) as days_until_expiry,
    profiles_using
FROM wireless_certificates
WHERE valid_to IS NOT NULL 
  AND valid_to > NOW()
  AND valid_to < NOW() + INTERVAL '90 days'
  AND is_revoked = false
ORDER BY valid_to ASC;

-- ===============================
-- INITIAL DATA INSERT
-- ===============================

-- Insert vendor compatibility data
INSERT INTO wireless_vendor_compatibility (vendor_name, supported_auth_types, supported_encryption, supports_radius, supports_certificates, supports_pmf, max_radius_servers, limitations) VALUES
('cisco-meraki', '["open", "wpa2_psk", "wpa3_psk", "wpa2_enterprise", "wpa3_enterprise"]', '["AES-128", "AES-256"]', true, true, true, 3, '["No TKIP support in WPA3", "PMF required for WPA3"]'),
('fortiap', '["open", "wpa2_psk", "wpa3_psk", "wpa2_enterprise", "wpa3_enterprise"]', '["AES-128", "AES-256", "TKIP"]', true, true, true, 5, '["TKIP only with WPA2", "Certificate validation required for enterprise"]'),
('cisco-catalyst', '["open", "wpa2_psk", "wpa3_psk", "wpa2_enterprise", "wpa3_enterprise"]', '["AES-128", "AES-256"]', true, true, true, 3, '["FlexConnect mode limitations", "PMF mandatory for WPA3"]'),
('aruba', '["open", "wpa2_psk", "wpa3_psk", "wpa2_enterprise", "wpa3_enterprise"]', '["AES-128", "AES-256", "TKIP"]', true, true, true, 8, '["TKIP deprecated in newer firmware", "Enhanced open support available"]')
ON CONFLICT (vendor_name, vendor_model, firmware_version) DO NOTHING;

-- Success message
SELECT 'Wireless Security Profile Templates Database Schema created successfully!' as status; 