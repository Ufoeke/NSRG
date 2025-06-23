import React, { useState, useEffect } from 'react';
import { 
  User, Building, Mail, Phone, MapPin, Calendar, Tag, 
  Monitor, Server, Wifi, Activity, Clock, FileText, 
  AlertCircle, CheckCircle, XCircle, Edit, Plus,
  ChevronDown, ChevronRight, ExternalLink
} from 'lucide-react';

const CustomerDetailView = ({ customerId, onClose }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSections, setExpandedSections] = useState({
    devices: true,
    contacts: true,
    activity: true
  });

  // Fetch customer details with full context
  useEffect(() => {
    if (!customerId) return;

    const fetchCustomerDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/customers/${customerId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setCustomer(data.data);
        } else {
          throw new Error('Failed to load customer details');
        }
      } catch (err) {
        console.error('Error fetching customer:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerDetails();
  }, [customerId]);

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'standard': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'suspended': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get device type icon
  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case 'firewall': return <Server className="w-4 h-4" />;
      case 'switch': return <Monitor className="w-4 h-4" />;
      case 'wireless_ap': return <Wifi className="w-4 h-4" />;
      case 'router': return <Monitor className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Error</h3>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{customer.name}</h2>
                <div className="flex items-center space-x-4 mt-2">
                  {customer.company && (
                    <div className="flex items-center text-blue-100">
                      <Building className="w-4 h-4 mr-1" />
                      {customer.company}
                    </div>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(customer.status)}`}>
                    {customer.status || 'active'}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(customer.priority)}`}>
                    {customer.priority || 'standard'} priority
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex space-x-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'devices', label: 'Devices' },
              { id: 'requests', label: 'Service Requests' },
              { id: 'activity', label: 'Activity' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Contact Information
                </h3>
                <div className="space-y-3">
                  {customer.email && (
                    <div className="flex items-center text-gray-600">
                      <Mail className="w-4 h-4 mr-3 text-gray-400" />
                      <span>{customer.email}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center text-gray-600">
                      <Phone className="w-4 h-4 mr-3 text-gray-400" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                  {(customer.address || customer.city || customer.state) && (
                    <div className="flex items-start text-gray-600">
                      <MapPin className="w-4 h-4 mr-3 mt-0.5 text-gray-400" />
                      <div>
                        {customer.address && <div>{customer.address}</div>}
                        {(customer.city || customer.state) && (
                          <div>
                            {customer.city}{customer.city && customer.state && ', '}{customer.state} {customer.zip_code}
                          </div>
                        )}
                        {customer.country && customer.country !== 'US' && <div>{customer.country}</div>}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center text-gray-600">
                    <Calendar className="w-4 h-4 mr-3 text-gray-400" />
                    <span>Customer since {formatDate(customer.created_at)}</span>
                  </div>
                  {customer.last_activity && (
                    <div className="flex items-center text-gray-600">
                      <Clock className="w-4 h-4 mr-3 text-gray-400" />
                      <span>Last activity: {formatDate(customer.last_activity)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Building className="w-5 h-5 mr-2" />
                  Organization Details
                </h3>
                <div className="space-y-3">
                  {customer.contact_person && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Primary Contact</label>
                      <p className="text-gray-900">{customer.contact_person}</p>
                    </div>
                  )}
                  {customer.department && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Department</label>
                      <p className="text-gray-900">{customer.department}</p>
                    </div>
                  )}
                  {customer.tags && customer.tags.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {customer.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center"
                          >
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {customer.notes && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Notes</label>
                      <p className="text-gray-900 text-sm">{customer.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{customer.device_count || 0}</div>
                    <div className="text-sm text-blue-600">Devices</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{customer.service_request_count || 0}</div>
                    <div className="text-sm text-green-600">Total Requests</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{customer.pending_requests || 0}</div>
                    <div className="text-sm text-yellow-600">Pending</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{customer.contacts?.length || 0}</div>
                    <div className="text-sm text-purple-600">Contacts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Network Devices</h3>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Device
                </button>
              </div>
              
              {customer.devices && customer.devices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customer.devices.map((device) => (
                    <div key={device.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            {getDeviceIcon(device.device_type)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{device.device_name}</h4>
                            <p className="text-sm text-gray-500 capitalize">{device.device_type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          device.status === 'active' ? 'bg-green-100 text-green-800' :
                          device.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {device.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        {device.vendor && (
                          <div><span className="font-medium">Vendor:</span> {device.vendor}</div>
                        )}
                        {device.model && (
                          <div><span className="font-medium">Model:</span> {device.model}</div>
                        )}
                        {device.ip_address && (
                          <div><span className="font-medium">IP:</span> {device.ip_address}</div>
                        )}
                        {device.location && (
                          <div><span className="font-medium">Location:</span> {device.location}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Monitor className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No devices registered for this customer</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Service Requests</h3>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
                  <Plus className="w-4 h-4 mr-2" />
                  New Request
                </button>
              </div>
              
              {customer.recent_services && customer.recent_services.length > 0 ? (
                <div className="space-y-4">
                  {customer.recent_services.map((request) => (
                    <div key={request.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{request.service_type}</h4>
                            <p className="text-sm text-gray-600 mt-1">#{request.id}</p>
                            <p className="text-sm text-gray-500 mt-2">{formatDate(request.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            request.status === 'completed' ? 'bg-green-100 text-green-800' :
                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            request.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {request.status}
                          </span>
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No service requests found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h3>
              
              {customer.recent_activity && customer.recent_activity.length > 0 ? (
                <div className="space-y-4">
                  {customer.recent_activity.map((activity, index) => (
                    <div key={index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Activity className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{activity.description}</h4>
                        <p className="text-sm text-gray-600 mt-1">{activity.activity_type}</p>
                        <p className="text-sm text-gray-500 mt-2">{formatDate(activity.created_at)}</p>
                        {activity.details && (
                          <p className="text-sm text-gray-600 mt-2">{activity.details}</p>
                        )}
                      </div>
                      {activity.performed_by && (
                        <div className="text-sm text-gray-500">
                          by {activity.performed_by}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No recent activity</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Customer ID: {customer.id}
            </div>
            <div className="flex space-x-3">
              <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center">
                <Edit className="w-4 h-4 mr-2" />
                Edit Customer
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailView; 