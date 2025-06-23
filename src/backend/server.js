const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import API routes
const authRoutes = require('./api/auth');
const serviceRequestRoutes = require('./api/service-requests');
const customerRoutes = require('./api/customers');
const templateRoutes = require('./api/templates');
const vlanDeploymentRoutes = require('./routes/vlan-deployment');
const switchRoutes = require('./routes/switches');
const vlanRoutes = require('./routes/vlans');
const wirelessRoutes = require('./routes/wireless');
const ssidManagementRoutes = require('./routes/ssid-management');
const securityProfileRoutes = require('./routes/security-profiles');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    message: 'Network Service Request Generator API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      serviceRequests: '/api/service-requests',
      customers: '/api/customers',
      templates: '/api/templates',
      vlanDeployment: '/api/vlan-deployment',
      switches: '/api/switches',
      vlans: '/api/vlans',
      wireless: '/api/wireless',
      ssidManagement: '/api/ssid-management',
      securityProfiles: '/api/security-profiles'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/vlan-deployment', vlanDeploymentRoutes);
app.use('/api/switches', switchRoutes);
app.use('/api/vlans', vlanRoutes);
app.use('/api/wireless', wirelessRoutes);
app.use('/api/ssid-management', ssidManagementRoutes);
app.use('/api/security-profiles', securityProfileRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    availableRoutes: [
      'GET /health',
      'GET /api/status',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/service-requests',
      'POST /api/service-requests',
      'GET /api/customers',
      'POST /api/customers'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NSRG Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;