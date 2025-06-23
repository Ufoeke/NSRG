# Security Profile Template System

## Overview

The Security Profile Template System provides comprehensive wireless security management for multi-vendor wireless networks. It supports enterprise-grade security profiles, pre-configured templates, and vendor-specific compatibility checking.

## Architecture

```
Security Profile System
├── Core Service (security-profile-service.js)
├── API Routes (/api/security-profiles)
├── Vendor Compatibility Matrix
├── Certificate Management
├── RADIUS Server Management
└── Template Library
```

## Features

### 🔐 Security Profile Management
- **Default Profiles**: Pre-configured security profiles for common use cases
- **Custom Profiles**: Create custom security configurations
- **Template-Based**: Generate profiles from enterprise templates
- **Multi-Vendor Support**: Compatible with Cisco Meraki, FortiAP, Cisco Catalyst, and Aruba

### 🏢 Enterprise Templates
- **Guest Network Security**: Isolated guest access with bandwidth limits
- **Corporate Network Security**: Enterprise authentication with device compliance
- **IoT Device Security**: Segmented IoT networks with device isolation
- **BYOD Security Profile**: Secure bring-your-own-device access

### 🛡️ Security Features
- **WPA2/WPA3 Support**: Modern authentication protocols
- **Enterprise 802.1X**: RADIUS-based authentication
- **Certificate Management**: X.509 certificate installation and validation
- **PMF Support**: Protected Management Frame enforcement
- **Compliance Checking**: Security audit and compliance reports

## Security Profiles

### Default Profiles

#### 1. Open Public Network
```json
{
  "id": "open-public",
  "name": "Open Public Network",
  "authType": "open",
  "encryption": "none",
  "securityLevel": "low",
  "useCase": "public-access"
}
```

#### 2. WPA2-PSK Standard
```json
{
  "id": "wpa2-psk-standard",
  "name": "WPA2-PSK Standard",
  "authType": "wpa2_psk",
  "encryption": "AES-256",
  "securityLevel": "medium",
  "pskConfig": {
    "requireComplexPassword": true,
    "minLength": 12,
    "rotationPolicy": "90-days"
  }
}
```

#### 3. WPA3-PSK Enhanced Security
```json
{
  "id": "wpa3-psk-enhanced",
  "name": "WPA3-PSK Enhanced Security",
  "authType": "wpa3_psk",
  "encryption": "AES-256",
  "securityLevel": "high",
  "pmfRequired": true,
  "saeConfig": {
    "antiCloggingThreshold": 5,
    "syncThreshold": 5
  }
}
```

#### 4. WPA2 Enterprise (802.1X)
```json
{
  "id": "wpa2-enterprise-standard",
  "name": "WPA2 Enterprise (802.1X)",
  "authType": "wpa2_enterprise",
  "encryption": "AES-256",
  "securityLevel": "high",
  "radiusRequired": true,
  "eapMethods": ["EAP-TLS", "EAP-PEAP", "EAP-TTLS"],
  "certificateValidation": true
}
```

#### 5. WPA3 Enterprise Maximum Security
```json
{
  "id": "wpa3-enterprise-maximum",
  "name": "WPA3 Enterprise Maximum Security",
  "authType": "wpa3_enterprise",
  "encryption": "AES-256",
  "securityLevel": "maximum",
  "pmfRequired": true,
  "radiusRequired": true,
  "eapMethods": ["EAP-TLS"],
  "certificateValidation": true,
  "cnsa": true
}
```

## Vendor Compatibility Matrix

| Feature | Cisco Meraki | FortiAP | Cisco Catalyst | Aruba |
|---------|--------------|---------|----------------|-------|
| WPA2/WPA3 | ✅ | ✅ | ✅ | ✅ |
| TKIP Encryption | ❌ | ✅ | ❌ | ✅ |
| PMF Support | ✅ | ✅ | ✅ | ✅ |
| Max RADIUS Servers | 3 | 5 | 3 | 8 |
| Certificate Validation | ✅ | ✅ | ✅ | ✅ |

### Vendor-Specific Limitations

#### Cisco Meraki
- No TKIP support in WPA3
- PMF required for WPA3
- Maximum 3 RADIUS servers

#### FortiAP
- TKIP only with WPA2
- Certificate validation required for enterprise
- Maximum 5 RADIUS servers

#### Cisco Catalyst
- FlexConnect mode limitations
- PMF mandatory for WPA3
- Maximum 3 RADIUS servers

#### Aruba
- TKIP deprecated in newer firmware
- Enhanced open support available
- Maximum 8 RADIUS servers

## API Endpoints

### Security Profiles

#### Get All Profiles
```http
GET /api/security-profiles
Query Parameters:
- type: default|custom|template-based
- authType: open|wpa2_psk|wpa3_psk|wpa2_enterprise|wpa3_enterprise
- securityLevel: low|medium|high|maximum
```

#### Create Profile
```http
POST /api/security-profiles
Content-Type: application/json

{
  "name": "Custom Corporate Profile",
  "authType": "wpa2_enterprise",
  "encryption": "AES-256",
  "securityLevel": "high",
  "radiusServers": ["radius-server-1"],
  "eapMethods": ["EAP-TLS"],
  "certificateValidation": true
}
```

#### Check Vendor Compatibility
```http
GET /api/security-profiles/{id}/compatibility/{vendor}
GET /api/security-profiles/{id}/compatibility
```

### Templates

#### Get Templates
```http
GET /api/security-profiles/templates
```

#### Create from Template
```http
POST /api/security-profiles/templates/{templateId}/create
Content-Type: application/json

{
  "name": "Custom Guest Network",
  "description": "Guest network for conference room"
}
```

### Utility Endpoints

#### Statistics
```http
GET /api/security-profiles/statistics
```

#### Security Audit
```http
GET /api/security-profiles/security-audit
```

## Configuration Examples

### Guest Network Template Usage
```javascript
// Create guest network from template
const profileId = await securityProfileService.createFromTemplate(
  'guest-network-template',
  {
    name: 'Conference Room Guest',
    description: 'Guest access for conference attendees',
    bandwidthLimit: '10Mbps',
    timeRestrictions: {
      enabled: true,
      schedule: '08:00-18:00'
    }
  }
);
```

### Enterprise Profile with RADIUS
```javascript
// Create enterprise profile with RADIUS
const profileId = await securityProfileService.createProfile({
  name: 'Corporate WiFi',
  authType: 'wpa2_enterprise',
  encryption: 'AES-256',
  securityLevel: 'high',
  radiusServers: ['10.1.1.100', '10.1.1.101'],
  eapMethods: ['EAP-TLS'],
  certificateValidation: true,
  pmfRequired: false
});
```

### Vendor Compatibility Check
```javascript
// Check compatibility before deployment
const compatibility = await securityProfileService.checkVendorCompatibility(
  profileId,
  'cisco-meraki'
);

if (!compatibility.compatible) {
  console.log('Compatibility issues:', compatibility.issues);
  console.log('Suggested adaptations:', compatibility.adaptations);
}
```

## Security Best Practices

### 1. Authentication Hierarchy
- **Public Access**: Open networks (limited use)
- **Basic Security**: WPA2-PSK for small offices
- **Standard Security**: WPA3-PSK for modern devices
- **Enterprise Security**: WPA2/WPA3 Enterprise for organizations
- **Maximum Security**: WPA3 Enterprise with CNSA for high-security environments

### 2. Encryption Standards
- **Avoid TKIP**: Use AES-128 or AES-256 encryption
- **PMF Required**: Enable Protected Management Frames for WPA3
- **Certificate Validation**: Always validate certificates in enterprise environments

### 3. RADIUS Configuration
- **Multiple Servers**: Configure backup RADIUS servers
- **Certificate-Based**: Use EAP-TLS for strongest authentication
- **Regular Testing**: Test RADIUS connectivity periodically

### 4. Compliance Monitoring
- **Security Audits**: Regular security profile audits
- **Update Policies**: Keep security profiles updated
- **Vendor Compatibility**: Verify compatibility before deployment

## Integration with SSID Management

The Security Profile System integrates seamlessly with the SSID Management Service:

```javascript
// Create SSID with security profile
const ssidConfig = {
  name: 'Corporate-WiFi',
  securityProfileId: 'wpa2-enterprise-standard',
  vlanId: 100,
  enabled: true
};

const ssidId = await ssidManagementService.createSSID(ssidConfig);
```

## Troubleshooting

### Common Issues

#### 1. RADIUS Authentication Failures
- Check RADIUS server connectivity
- Verify shared secret configuration
- Validate certificate installation

#### 2. Vendor Compatibility Issues
- Review vendor-specific limitations
- Apply suggested adaptations
- Test with specific vendor driver

#### 3. Certificate Validation Errors
- Verify certificate chain
- Check certificate expiration
- Validate certificate format (PEM)

#### 4. PMF Configuration Problems
- Ensure client device support
- Verify vendor PMF implementation
- Check for firmware compatibility

## Event System

The service emits events for monitoring and integration:

```javascript
securityProfileService.on('profileCreated', (data) => {
  console.log(`Profile created: ${data.name} (${data.id})`);
});

securityProfileService.on('profileValidated', (data) => {
  console.log(`Profile validated: ${data.profileId} for ${data.vendor}`);
});

securityProfileService.on('certificateInstalled', (data) => {
  console.log(`Certificate installed: ${data.name} (${data.id})`);
});
```

## Performance Considerations

- **Profile Caching**: Security profiles are cached in memory
- **Lazy Loading**: Certificates loaded on demand
- **Batch Operations**: Support for bulk profile operations
- **Async Operations**: Non-blocking RADIUS connectivity testing

## Future Enhancements

- **Machine Learning**: Automatic security recommendations
- **Compliance Frameworks**: NIST, ISO 27001 compliance templates
- **Advanced Analytics**: Security posture analytics
- **Zero Trust Integration**: Zero trust network access profiles 