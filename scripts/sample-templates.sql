-- Sample Security Profile Templates and Initial Data
-- This script populates the wireless security tables with default profiles and templates

-- ===============================
-- DEFAULT SECURITY PROFILES
-- ===============================

-- Insert default admin user if not exists for foreign key reference
INSERT INTO users (id, username, email, password_hash, role) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system', 
    'system@nsrg.local', 
    '$2a$10$8K1p/a0dURXAm7QiK9Z5z.4T5XcJIgHKGQ2vgz8JqR5z.4T5XcJIgH', 
    'system'
) ON CONFLICT (username) DO NOTHING;

-- 1. Open Public Network Profile
INSERT INTO wireless_security_profiles (
    id, name, description, auth_type, encryption, security_level, use_case, 
    is_default, is_template, pmf_required, radius_required, vendor_support, 
    configuration, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Open Public Network',
    'Basic open network for public access areas like lobbies and waiting rooms',
    'open',
    'none',
    'low',
    'public-access',
    true,
    false,
    false,
    false,
    '["cisco-meraki", "fortiap", "cisco-catalyst", "aruba"]',
    '{"isolation": true, "bandwidth_limit": "10Mbps", "time_restrictions": false}',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 2. WPA2-PSK Standard Profile
INSERT INTO wireless_security_profiles (
    id, name, description, auth_type, encryption, security_level, use_case, 
    is_default, is_template, pmf_required, radius_required, vendor_support, 
    configuration, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000002',
    'WPA2-PSK Standard',
    'Standard WPA2 with pre-shared key for small to medium networks',
    'wpa2_psk',
    'AES-256',
    'medium',
    'general-purpose',
    true,
    false,
    false,
    false,
    '["cisco-meraki", "fortiap", "cisco-catalyst", "aruba"]',
    '{"key_rotation": "never", "broadcast_ssid": true}',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 3. WPA3-PSK Enhanced Profile
INSERT INTO wireless_security_profiles (
    id, name, description, auth_type, encryption, security_level, use_case, 
    is_default, is_template, pmf_required, radius_required, vendor_support, 
    configuration, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000003',
    'WPA3-PSK Enhanced',
    'Enhanced WPA3 with Simultaneous Authentication of Equals (SAE)',
    'wpa3_psk',
    'AES-256',
    'high',
    'modern-networks',
    true,
    false,
    true,
    false,
    '["cisco-meraki", "fortiap", "cisco-catalyst", "aruba"]',
    '{"sae_groups": ["19", "20", "21"], "transition_mode": false}',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 4. WPA2 Enterprise Standard Profile
INSERT INTO wireless_security_profiles (
    id, name, description, auth_type, encryption, security_level, use_case, 
    is_default, is_template, pmf_required, radius_required, vendor_support, 
    configuration, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000004',
    'WPA2 Enterprise (802.1X)',
    'Enterprise WPA2 with RADIUS authentication for corporate networks',
    'wpa2_enterprise',
    'AES-256',
    'high',
    'enterprise',
    true,
    false,
    false,
    true,
    '["cisco-meraki", "fortiap", "cisco-catalyst", "aruba"]',
    '{"fast_roaming": true, "accounting": true, "mac_filtering": false}',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 5. WPA3 Enterprise Maximum Security Profile
INSERT INTO wireless_security_profiles (
    id, name, description, auth_type, encryption, security_level, use_case, 
    is_default, is_template, pmf_required, radius_required, vendor_support, 
    configuration, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000005',
    'WPA3 Enterprise Maximum Security',
    'Maximum security WPA3 Enterprise with 192-bit encryption and CNSA compliance',
    'wpa3_enterprise',
    'AES-256',
    'maximum',
    'high-security',
    true,
    false,
    true,
    true,
    '["cisco-meraki", "fortiap", "cisco-catalyst", "aruba"]',
    '{"suite_b": true, "fast_roaming": true, "accounting": true}',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ===============================
-- PSK CONFIGURATIONS
-- ===============================

-- PSK config for WPA2-PSK Standard
INSERT INTO wireless_psk_config (
    profile_id, require_complex_password, min_length, max_length, 
    rotation_policy, require_uppercase, require_lowercase, 
    require_numbers, require_special_chars, allowed_special_chars
) VALUES (
    '10000000-0000-0000-0000-000000000002', 
    true, 8, 63, 
    '6-months', true, true, 
    true, false, '!@#$%^&*'
) ON CONFLICT DO NOTHING;

-- PSK config for WPA3-PSK Enhanced
INSERT INTO wireless_psk_config (
    profile_id, require_complex_password, min_length, max_length, 
    rotation_policy, require_uppercase, require_lowercase, 
    require_numbers, require_special_chars, allowed_special_chars
) VALUES (
    '10000000-0000-0000-0000-000000000003', 
    true, 12, 63, 
    '3-months', true, true, 
    true, true, '!@#$%^&*()_+-='
) ON CONFLICT DO NOTHING;

-- ===============================
-- SAE CONFIGURATIONS (WPA3)
-- ===============================

-- SAE config for WPA3-PSK Enhanced
INSERT INTO wireless_sae_config (
    profile_id, anti_clogging_threshold, sync_threshold, 
    rejection_threshold, confirm_immediate
) VALUES (
    '10000000-0000-0000-0000-000000000003', 
    5, 5, 5, false
) ON CONFLICT DO NOTHING;

-- SAE config for WPA3 Enterprise Maximum
INSERT INTO wireless_sae_config (
    profile_id, anti_clogging_threshold, sync_threshold, 
    rejection_threshold, confirm_immediate
) VALUES (
    '10000000-0000-0000-0000-000000000005', 
    3, 3, 3, true
) ON CONFLICT DO NOTHING;

-- ===============================
-- EAP METHODS
-- ===============================

-- EAP methods for WPA2 Enterprise
INSERT INTO wireless_eap_methods (profile_id, eap_method, is_primary, priority, configuration) VALUES
('10000000-0000-0000-0000-000000000004', 'EAP-TLS', true, 1, '{"certificate_validation": "strict"}'),
('10000000-0000-0000-0000-000000000004', 'EAP-PEAP', false, 2, '{"inner_method": "MSCHAPv2"}'),
('10000000-0000-0000-0000-000000000004', 'EAP-TTLS', false, 3, '{"inner_method": "PAP"}')
ON CONFLICT DO NOTHING;

-- EAP methods for WPA3 Enterprise Maximum (only EAP-TLS for maximum security)
INSERT INTO wireless_eap_methods (profile_id, eap_method, is_primary, priority, configuration) VALUES
('10000000-0000-0000-0000-000000000005', 'EAP-TLS', true, 1, '{"certificate_validation": "strict", "suite_b": true}')
ON CONFLICT DO NOTHING;

-- ===============================
-- SECURITY TEMPLATES
-- ===============================

-- 1. Guest Network Template
INSERT INTO wireless_security_templates (
    id, name, description, category, base_profile_id, 
    template_config, customizable_fields, required_fields, 
    is_system_template, created_by
) VALUES (
    '20000000-0000-0000-0000-000000000001',
    'Guest Network Security',
    'Standard security template for guest networks with isolation and bandwidth limits',
    'guest-access',
    '10000000-0000-0000-0000-000000000002',
    '{
        "isolation": true,
        "bandwidth_limit": true,
        "time_restrictions": true,
        "content_filtering": "basic",
        "captive_portal": true,
        "session_timeout": 480
    }',
    '["bandwidth_limit", "time_restrictions", "session_timeout", "captive_portal"]',
    '["isolation"]',
    true,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 2. Corporate Template
INSERT INTO wireless_security_templates (
    id, name, description, category, base_profile_id, 
    template_config, customizable_fields, required_fields, 
    is_system_template, created_by
) VALUES (
    '20000000-0000-0000-0000-000000000002',
    'Corporate Network Security',
    'Enterprise security template for corporate networks with full authentication',
    'enterprise',
    '10000000-0000-0000-0000-000000000004',
    '{
        "certificate_validation": "strict",
        "device_compliance": true,
        "audit_logging": "full",
        "rule_based_access": true,
        "fast_roaming": true,
        "load_balancing": true
    }',
    '["certificate_validation", "audit_logging", "fast_roaming"]',
    '["certificate_validation", "device_compliance"]',
    true,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 3. IoT Security Template
INSERT INTO wireless_security_templates (
    id, name, description, category, base_profile_id, 
    template_config, customizable_fields, required_fields, 
    is_system_template, created_by
) VALUES (
    '20000000-0000-0000-0000-000000000003',
    'IoT Device Security',
    'Specialized security template for IoT device networks with segmentation',
    'iot-devices',
    '10000000-0000-0000-0000-000000000002',
    '{
        "device_isolation": true,
        "mac_filtering": true,
        "vlan_segmentation": true,
        "bandwidth_restriction": true,
        "device_profiling": true,
        "anomaly_detection": true
    }',
    '["mac_filtering", "bandwidth_restriction", "device_profiling"]',
    '["device_isolation", "vlan_segmentation"]',
    true,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- 4. BYOD Template
INSERT INTO wireless_security_templates (
    id, name, description, category, base_profile_id, 
    template_config, customizable_fields, required_fields, 
    is_system_template, created_by
) VALUES (
    '20000000-0000-0000-0000-000000000004',
    'BYOD Security Profile',
    'Bring Your Own Device security template with compliance checking',
    'byod',
    '10000000-0000-0000-0000-000000000004',
    '{
        "device_registration": true,
        "compliance_checking": true,
        "containerization": true,
        "data_loss_prevention": true,
        "app_control": true,
        "conditional_access": true
    }',
    '["compliance_checking", "app_control", "conditional_access"]',
    '["device_registration", "compliance_checking"]',
    true,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ===============================
-- SAMPLE RADIUS SERVERS
-- ===============================

-- Sample RADIUS server for testing
INSERT INTO wireless_radius_servers (
    id, name, description, hostname, port, shared_secret, 
    server_type, protocol, timeout_seconds, max_retries, 
    is_active, priority, weight, created_by
) VALUES (
    '30000000-0000-0000-0000-000000000001',
    'Primary RADIUS Server',
    'Main authentication server for enterprise networks',
    'radius.nsrg.local',
    1812,
    'shared-secret-change-in-production',
    'both',
    'radius',
    5,
    3,
    true,
    1,
    100,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Secondary RADIUS server for failover
INSERT INTO wireless_radius_servers (
    id, name, description, hostname, port, shared_secret, 
    server_type, protocol, timeout_seconds, max_retries, 
    is_active, priority, weight, created_by
) VALUES (
    '30000000-0000-0000-0000-000000000002',
    'Secondary RADIUS Server',
    'Backup authentication server for enterprise networks',
    'radius-backup.nsrg.local',
    1812,
    'backup-secret-change-in-production',
    'both',
    'radius',
    5,
    3,
    true,
    2,
    50,
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ===============================
-- PROFILE-RADIUS ASSOCIATIONS
-- ===============================

-- Associate enterprise profiles with RADIUS servers
INSERT INTO wireless_profile_radius (profile_id, radius_server_id, server_role, priority) VALUES
('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'primary', 1),
('10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 'secondary', 2),
('10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'primary', 1),
('10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', 'backup', 3)
ON CONFLICT (profile_id, radius_server_id) DO NOTHING;

-- Success message
SELECT 'Security Profile Templates and initial data loaded successfully!' as status; 