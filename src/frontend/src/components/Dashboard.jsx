import React, { useState, useEffect } from 'react';
import { Plus, Search, Bell, User, Activity, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import QuickAddModal from './QuickAddModal';
import UniversalSearch from './UniversalSearch';
import CustomerDetailView from './CustomerDetailView';
import WirelessCoverageManager from './WirelessCoverageManager';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalRequests: 0,
    activeServices: 4,
    completedToday: 0,
    pendingApproval: 0
  });

  const [recentRequests, setRecentRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    // Simulate loading stats
    setStats({
      totalRequests: 147,
      activeServices: 4,
      completedToday: 12,
      pendingApproval: 3
    });

    // Simulate recent requests
    setRecentRequests([
      {
        id: 'REQ-001',
        title: 'Firewall Rule Update',
        service: 'firewall-service',
        status: 'completed',
        time: '2 hours ago',
        customer: 'CUST-001'
      },
      {
        id: 'REQ-002',
        title: 'VLAN Configuration',
        service: 'vlan-service',
        status: 'pending',
        time: '4 hours ago',
        customer: 'CUST-002'
      },
      {
        id: 'REQ-003',
        title: 'Wireless Setup',
        service: 'wireless-service',
        status: 'in-progress',
        time: '6 hours ago',
        customer: 'CUST-003'
      }
    ]);
  }, []);

  const handleQuickAdd = (requestData) => {
    // Add the new request to the recent requests list
    setRecentRequests(prev => [requestData, ...prev]);
    
    // Update stats
    setStats(prev => ({
      ...prev,
      totalRequests: prev.totalRequests + 1,
      pendingApproval: prev.pendingApproval + 1
    }));

    console.log('New request created:', requestData);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'in-progress':
        return <Activity className="w-4 h-4 text-blue-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'in-progress':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  // Add filtered requests based on search query
  const filteredRequests = recentRequests.filter(request => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      request.title.toLowerCase().includes(query) ||
      request.id.toLowerCase().includes(query) ||
      request.customer.toLowerCase().includes(query) ||
      request.service.toLowerCase().includes(query) ||
      request.status.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Navigation */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">NS</span>
                </div>
                <span className="ml-3 text-xl font-bold text-white">NSRG</span>
                <span className="ml-2 text-sm text-purple-200">Dashboard / General Service Analytics</span>
              </div>
            </div>

            {/* Search and User */}
            <div className="flex items-center space-x-4">
              <UniversalSearch
                placeholder="Search customers, requests..."
                onSelect={(item) => {
                  // Handle navigation based on item type
                  if (item.type === 'customer') {
                    setSelectedCustomerId(item.data.customer_id);
                  } else if (item.type === 'request') {
                    // Navigate to request detail page
                    console.log('Navigate to request:', item.data.id);
                  }
                }}
                className="w-80"
              />
              
              <button className="p-2 text-purple-200 hover:text-white relative transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
              </button>
              
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-white">Admin User</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Welcome back, Admin</h1>
          <p className="text-purple-200 text-lg">Here's what's happening with your network services today.</p>
        </div>

        {/* Stats Cards */}
        <div className="flex justify-center space-x-8 mb-12">
          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white">{stats.totalRequests}</div>
            <div className="text-purple-200 text-sm">Total Requests</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white">{stats.activeServices}</div>
            <div className="text-purple-200 text-sm">Active Services</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white">{stats.completedToday}</div>
            <div className="text-purple-200 text-sm">Completed Today</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white">{stats.pendingApproval}</div>
            <div className="text-purple-200 text-sm">Pending Approval</div>
          </div>
        </div>

        {/* Quick Add Section */}
        <div className="text-center mb-12">
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-lg flex items-center space-x-3 transition-all duration-200 shadow-xl hover:shadow-2xl mx-auto transform hover:scale-105"
          >
            <Plus className="w-6 h-6" />
            <span>Quick Add Request</span>
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Requests */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-xl shadow-xl border border-white/20">
            <div className="p-6 border-b border-white/20">
              <h2 className="text-xl font-semibold text-white">Recent Requests</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-lg transition-colors backdrop-blur-sm border border-white/10">
                      <div className="flex items-center space-x-4">
                        {getStatusIcon(request.status)}
                        <div>
                          <h3 className="font-medium text-white">{request.title}</h3>
                          <p className="text-sm text-purple-200">{request.id} • {request.customer}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                        <p className="text-sm text-purple-200 mt-1">{request.time}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 text-purple-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No requests found</h3>
                    <p className="text-purple-200">
                      {searchQuery.trim() 
                        ? `No requests match "${searchQuery}". Try a different search term.`
                        : 'No recent requests to display.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Service Shortcuts */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-xl border border-white/20">
            <div className="p-6 border-b border-white/20">
              <h2 className="text-xl font-semibold text-white">Service Shortcuts</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <button className="w-full text-left p-4 bg-gradient-to-r from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 rounded-lg transition-all duration-200 border border-blue-500/30 backdrop-blur-sm transform hover:scale-105">
                  <div className="font-semibold text-white text-lg">Firewall Service</div>
                  <div className="text-blue-200 text-sm">Configure firewall rules</div>
                </button>
                
                <button className="w-full text-left p-4 bg-gradient-to-r from-green-500/20 to-green-600/20 hover:from-green-500/30 hover:to-green-600/30 rounded-lg transition-all duration-200 border border-green-500/30 backdrop-blur-sm transform hover:scale-105">
                  <div className="font-semibold text-white text-lg">VLAN Service</div>
                  <div className="text-green-200 text-sm">Manage VLAN configurations</div>
                </button>
                
                <button 
                  onClick={() => setCurrentView('wireless')}
                  className="w-full text-left p-4 bg-gradient-to-r from-purple-500/20 to-purple-600/20 hover:from-purple-500/30 hover:to-purple-600/30 rounded-lg transition-all duration-200 border border-purple-500/30 backdrop-blur-sm transform hover:scale-105"
                >
                  <div className="font-semibold text-white text-lg">Wireless Service</div>
                  <div className="text-purple-200 text-sm">Configure wireless settings</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
      />

      {/* Customer Detail View */}
      {selectedCustomerId && (
        <CustomerDetailView
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}

      {/* Wireless Coverage Manager */}
      {currentView === 'wireless' && (
        <WirelessCoverageManager
          onBack={() => setCurrentView('dashboard')}
        />
      )}
    </div>
  );
};

export default Dashboard; 