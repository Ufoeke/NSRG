import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  MapPin, 
  Settings, 
  Zap, 
  BarChart3, 
  Target, 
  Signal, 
  Download, 
  Upload,
  Plus,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowLeft,
  Loader
} from 'lucide-react';
import wirelessApi from '../utils/wirelessApi';

/**
 * Wireless Coverage Area and Bandwidth Policy Management Component
 * 
 * This component provides an interactive interface for:
 * - Coverage area planning and visualization
 * - Bandwidth policy configuration and management
 * - QoS template creation and application
 * - Access point placement optimization
 * - Real-time signal strength monitoring
 */
const WirelessCoverageManager = ({ onBack }) => {
  // State management
  const [coverageAreas, setCoverageAreas] = useState([]);
  const [bandwidthPolicies, setBandwidthPolicies] = useState([]);
  const [selectedCoverage, setSelectedCoverage] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('coverage');
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState('');

  // Coverage area form state
  const [coverageForm, setCoverageForm] = useState({
    name: '',
    location: '',
    areaSize: '',
    userDensity: '',
    accessPoints: [],
    signalStrength: '',
    coverage: 'indoor',
    frequency: '5GHz',
    notes: ''
  });

  // Bandwidth policy form state
  const [policyForm, setPolicyForm] = useState({
    name: '',
    description: '',
    downloadLimit: '',
    uploadLimit: '',
    priority: 'medium',
    qosClass: 'standard',
    trafficShaping: false,
    contentFiltering: false,
    applicationControl: false,
    timeRestrictions: false,
    userGroups: [],
    deviceTypes: []
  });

  // Canvas reference for coverage visualization
  const canvasRef = useRef(null);

  // Sample data for development
  const sampleCoverageAreas = [
    {
      id: 'cov-001',
      name: 'Main Office Floor 1',
      location: 'Building A, Floor 1',
      areaSize: '5000 sq ft',
      userDensity: '50 users',
      accessPoints: ['AP-001', 'AP-002', 'AP-003'],
      signalStrength: '95%',
      coverage: 'indoor',
      frequency: '5GHz',
      status: 'active',
      lastUpdated: '2024-01-15T10:30:00Z'
    },
    {
      id: 'cov-002',
      name: 'Warehouse Zone',
      location: 'Building B, Warehouse',
      areaSize: '15000 sq ft',
      userDensity: '20 users',
      accessPoints: ['AP-004', 'AP-005'],
      signalStrength: '88%',
      coverage: 'outdoor',
      frequency: '2.4GHz',
      status: 'planning',
      lastUpdated: '2024-01-15T09:15:00Z'
    }
  ];

  const sampleBandwidthPolicies = [
    {
      id: 'pol-001',
      name: 'Executive Policy',
      description: 'High-priority access for executives',
      downloadLimit: 'unlimited',
      uploadLimit: 'unlimited',
      priority: 'high',
      qosClass: 'premium',
      trafficShaping: true,
      contentFiltering: false,
      applicationControl: true,
      timeRestrictions: false,
      userGroups: ['executives', 'administrators'],
      deviceTypes: ['laptop', 'smartphone'],
      status: 'active'
    },
    {
      id: 'pol-002',
      name: 'Guest Policy',
      description: 'Limited access for guest users',
      downloadLimit: '50 Mbps',
      uploadLimit: '10 Mbps',
      priority: 'low',
      qosClass: 'basic',
      trafficShaping: true,
      contentFiltering: true,
      applicationControl: true,
      timeRestrictions: true,
      userGroups: ['guests'],
      deviceTypes: ['any'],
      status: 'active'
    }
  ];

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [coverageResponse, policiesResponse] = await Promise.all([
        wirelessApi.getCoverageAreas(),
        wirelessApi.getBandwidthPolicies()
      ]);
      
      setCoverageAreas(coverageResponse.data || coverageResponse || []);
      setBandwidthPolicies(policiesResponse.data || policiesResponse || []);
    } catch (error) {
      console.error('Failed to load wireless data:', error);
      setErrors({ general: 'Failed to load wireless configuration data. Please refresh the page.' });
      // Fallback to sample data for development
      setCoverageAreas(sampleCoverageAreas);
      setBandwidthPolicies(sampleBandwidthPolicies);
    } finally {
      setIsLoading(false);
    }
  };

  // Draw coverage visualization on canvas
  useEffect(() => {
    if (canvasRef.current && selectedCoverage) {
      drawCoverageVisualization();
    }
  }, [selectedCoverage]);

  const drawCoverageVisualization = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw coverage area visualization
    ctx.fillStyle = '#3b82f6';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(50, 50, 300, 200);
    
    // Draw access points
    if (selectedCoverage && selectedCoverage.accessPoints) {
      selectedCoverage.accessPoints.forEach((ap, index) => {
        const x = 100 + (index * 80);
        const y = 120;
        
        // Access point circle
        ctx.fillStyle = '#10b981';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Signal coverage circle
        ctx.strokeStyle = '#10b981';
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 40, 0, 2 * Math.PI);
        ctx.stroke();
        
        // AP label
        ctx.fillStyle = '#000';
        ctx.globalAlpha = 1;
        ctx.font = '12px Arial';
        ctx.fillText(ap, x - 15, y + 25);
      });
    }
    
    // Add legend
    ctx.fillStyle = '#000';
    ctx.font = '14px Arial';
    ctx.fillText('Coverage Visualization', 50, 30);
    ctx.font = '12px Arial';
    ctx.fillText('● Access Points', 50, 280);
    ctx.fillText('○ Signal Range', 150, 280);
    ctx.fillText('■ Coverage Area', 250, 280);
  };

  // Handle coverage form submission
  const handleCoverageSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    
    try {
      // Validate form using the API validation
      const validation = await wirelessApi.validateCoverageArea(coverageForm);
      if (!validation.isValid) {
        setErrors(validation.errors);
        setIsLoading(false);
        return;
      }
      
      // Create coverage area via API
      const response = await wirelessApi.createCoverageArea({
        ...coverageForm,
        accessPoints: coverageForm.accessPoints || [],
        status: 'planning'
      });
      
      // Add to local state
      const newCoverage = response.data || response;
      setCoverageAreas(prev => [...prev, newCoverage]);
      
      // Reset form
      setCoverageForm({
        name: '',
        location: '',
        areaSize: '',
        userDensity: '',
        accessPoints: [],
        signalStrength: '',
        coverage: 'indoor',
        frequency: '5GHz',
        notes: ''
      });
      setSuccess('Coverage area created successfully!');
      
    } catch (error) {
      console.error('Coverage area creation failed:', error);
      setErrors({ general: error.message || 'Failed to create coverage area. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle bandwidth policy submission
  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    
    try {
      // Validate form using the API validation
      const validation = await wirelessApi.validateBandwidthPolicy(policyForm);
      if (!validation.isValid) {
        setErrors(validation.errors);
        setIsLoading(false);
        return;
      }
      
      // Create bandwidth policy via API
      const response = await wirelessApi.createBandwidthPolicy({
        ...policyForm,
        userGroups: policyForm.userGroups || [],
        deviceTypes: policyForm.deviceTypes || [],
        status: 'active'
      });
      
      // Add to local state
      const newPolicy = response.data || response;
      setBandwidthPolicies(prev => [...prev, newPolicy]);
      
      // Reset form
      setPolicyForm({
        name: '',
        description: '',
        downloadLimit: '',
        uploadLimit: '',
        priority: 'medium',
        qosClass: 'standard',
        trafficShaping: false,
        contentFiltering: false,
        applicationControl: false,
        timeRestrictions: false,
        userGroups: [],
        deviceTypes: []
      });
      setSuccess('Bandwidth policy created successfully!');
      
    } catch (error) {
      console.error('Bandwidth policy creation failed:', error);
      setErrors({ general: error.message || 'Failed to create bandwidth policy. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear messages after a delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <div className="wireless-coverage-manager bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}
          <Wifi className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Wireless Coverage Manager</h2>
            <p className="text-gray-600">Plan coverage areas and manage bandwidth policies</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={loadInitialData}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800">{success}</span>
        </div>
      )}
      
      {errors.general && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{errors.general}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('coverage')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'coverage'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4" />
              <span>Coverage Areas</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('bandwidth')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'bandwidth'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>Bandwidth Policies</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Coverage Areas Tab */}
      {activeTab === 'coverage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coverage Areas List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Coverage Areas</h3>
              <span className="text-sm text-gray-500">{coverageAreas.length} areas</span>
            </div>
            
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-500">Loading coverage areas...</p>
                </div>
              ) : coverageAreas.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No coverage areas configured</p>
                  <p className="text-sm text-gray-400">Create your first coverage area using the form</p>
                </div>
              ) : (
                coverageAreas.map((area) => (
                  <div
                    key={area.id}
                    onClick={() => setSelectedCoverage(area)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedCoverage?.id === area.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{area.name}</h4>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        area.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {area.status}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{area.location}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>Area: {area.areaSize}</div>
                      <div>Users: {area.userDensity}</div>
                      <div>APs: {area.accessPoints.length}</div>
                      <div>Signal: {area.signalStrength}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Coverage Form and Visualization */}
          <div className="space-y-6">
            {/* Visualization Canvas */}
            {selectedCoverage && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Coverage Visualization</h4>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={300}
                  className="border border-gray-300 rounded bg-white"
                />
              </div>
            )}

            {/* Coverage Form */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Add Coverage Area</h4>
              <form onSubmit={handleCoverageSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Area Name *
                    </label>
                    <input
                      type="text"
                      value={coverageForm.name}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, name: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="e.g., Main Office Floor 1"
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location *
                    </label>
                    <input
                      type="text"
                      value={coverageForm.location}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, location: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.location ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="e.g., Building A, Floor 1"
                    />
                    {errors.location && <p className="mt-1 text-xs text-red-600">{errors.location}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Area Size *
                    </label>
                    <input
                      type="text"
                      value={coverageForm.areaSize}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, areaSize: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.areaSize ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="e.g., 5000 sq ft"
                    />
                    {errors.areaSize && <p className="mt-1 text-xs text-red-600">{errors.areaSize}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User Density *
                    </label>
                    <input
                      type="text"
                      value={coverageForm.userDensity}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, userDensity: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.userDensity ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="e.g., 50 users"
                    />
                    {errors.userDensity && <p className="mt-1 text-xs text-red-600">{errors.userDensity}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coverage Type
                    </label>
                    <select
                      value={coverageForm.coverage}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, coverage: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="indoor">Indoor</option>
                      <option value="outdoor">Outdoor</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Frequency Band
                    </label>
                    <select
                      value={coverageForm.frequency}
                      onChange={(e) => setCoverageForm(prev => ({ ...prev, frequency: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="2.4GHz">2.4GHz</option>
                      <option value="5GHz">5GHz</option>
                      <option value="6GHz">6GHz (WiFi 6E)</option>
                      <option value="dual">Dual Band</option>
                      <option value="tri">Tri Band</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={coverageForm.notes}
                    onChange={(e) => setCoverageForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Additional notes about this coverage area..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>{isLoading ? 'Creating...' : 'Create Coverage Area'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bandwidth Policies Tab */}
      {activeTab === 'bandwidth' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Policies List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Bandwidth Policies</h3>
              <span className="text-sm text-gray-500">{bandwidthPolicies.length} policies</span>
            </div>
            
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-500">Loading bandwidth policies...</p>
                </div>
              ) : bandwidthPolicies.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No bandwidth policies configured</p>
                  <p className="text-sm text-gray-400">Create your first policy using the form</p>
                </div>
              ) : (
                bandwidthPolicies.map((policy) => (
                  <div
                    key={policy.id}
                    onClick={() => setSelectedPolicy(policy)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedPolicy?.id === policy.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{policy.name}</h4>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        policy.priority === 'high' 
                          ? 'bg-red-100 text-red-800'
                          : policy.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {policy.priority} priority
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{policy.description}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Download className="w-3 h-3" />
                        <span>{policy.downloadLimit}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Upload className="w-3 h-3" />
                        <span>{policy.uploadLimit}</span>
                      </div>
                      <div>QoS: {policy.qosClass}</div>
                      <div>Groups: {policy.userGroups.length}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Policy Form */}
          <div className="space-y-6">
            {/* Policy Details */}
            {selectedPolicy && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Policy Details</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Features Enabled
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {selectedPolicy.trafficShaping && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          Traffic Shaping
                        </span>
                      )}
                      {selectedPolicy.contentFiltering && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Content Filtering
                        </span>
                      )}
                      {selectedPolicy.applicationControl && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                          Application Control
                        </span>
                      )}
                      {selectedPolicy.timeRestrictions && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                          Time Restrictions
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      User Groups
                    </label>
                    <div className="mt-1">
                      {selectedPolicy.userGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedPolicy.userGroups.map((group, index) => (
                            <span key={index} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                              {group}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No specific user groups</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Policy Form */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Add Bandwidth Policy</h4>
              <form onSubmit={handlePolicySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Name *
                  </label>
                  <input
                    type="text"
                    value={policyForm.name}
                    onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="e.g., Executive Policy"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={policyForm.description}
                    onChange={(e) => setPolicyForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.description ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Describe this bandwidth policy..."
                  />
                  {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Download Limit
                    </label>
                    <input
                      type="text"
                      value={policyForm.downloadLimit}
                      onChange={(e) => setPolicyForm(prev => ({ ...prev, downloadLimit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., 100 Mbps or unlimited"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Upload Limit
                    </label>
                    <input
                      type="text"
                      value={policyForm.uploadLimit}
                      onChange={(e) => setPolicyForm(prev => ({ ...prev, uploadLimit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., 50 Mbps or unlimited"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority Level
                    </label>
                    <select
                      value={policyForm.priority}
                      onChange={(e) => setPolicyForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      QoS Class
                    </label>
                    <select
                      value={policyForm.qosClass}
                      onChange={(e) => setPolicyForm(prev => ({ ...prev, qosClass: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="basic">Basic</option>
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>

                {/* Policy Features */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Policy Features
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={policyForm.trafficShaping}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, trafficShaping: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Traffic Shaping</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={policyForm.contentFiltering}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, contentFiltering: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Content Filtering</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={policyForm.applicationControl}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, applicationControl: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Application Control</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={policyForm.timeRestrictions}
                        onChange={(e) => setPolicyForm(prev => ({ ...prev, timeRestrictions: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Time Restrictions</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>{isLoading ? 'Creating...' : 'Create Policy'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WirelessCoverageManager;