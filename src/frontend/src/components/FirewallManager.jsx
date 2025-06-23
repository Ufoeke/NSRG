import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
    Shield, 
    Plus, 
    Search, 
    Filter, 
    Download, 
    Settings,
    Zap,
    AlertTriangle,
    CheckCircle,
    Clock
} from 'lucide-react';

import FirewallRuleManager from './FirewallRuleManager';
import RuleSuggestionsPanel from './RuleSuggestionsPanel';
import ConflictDetectionPanel from './ConflictDetectionPanel';
import VendorManagement from './VendorManagement';

/**
 * Main Firewall Management Interface
 * Provides centralized control for multi-vendor firewall management
 */
const FirewallManager = () => {
    const [activeTab, setActiveTab] = useState('rules');
    const [vendors, setVendors] = useState([]);
    const [firewallRules, setFirewallRules] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [conflicts, setConflicts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedVendor, setSelectedVendor] = useState(null);

    // Load initial data
    useEffect(() => {
        loadFirewallData();
    }, []);

    const loadFirewallData = async () => {
        setLoading(true);
        try {
            // Load vendors
            const vendorsResponse = await fetch('/api/firewall/vendors');
            const vendorsData = await vendorsResponse.json();
            setVendors(vendorsData);

            // Load rules for active vendors
            const rulesResponse = await fetch('/api/firewall/rules');
            const rulesData = await rulesResponse.json();
            setFirewallRules(rulesData);

            // Load suggestions
            const suggestionsResponse = await fetch('/api/firewall/suggestions');
            const suggestionsData = await suggestionsResponse.json();
            setSuggestions(suggestionsData);

            // Load conflicts
            const conflictsResponse = await fetch('/api/firewall/conflicts');
            const conflictsData = await conflictsResponse.json();
            setConflicts(conflictsData);

        } catch (error) {
            console.error('Error loading firewall data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getVendorStatus = (vendor) => {
        switch (vendor.status) {
            case 'active':
                return <Badge className="bg-green-100 text-green-800">Online</Badge>;
            case 'inactive':
                return <Badge className="bg-gray-100 text-gray-800">Offline</Badge>;
            case 'error':
                return <Badge className="bg-red-100 text-red-800">Error</Badge>;
            default:
                return <Badge className="bg-yellow-100 text-yellow-800">Unknown</Badge>;
        }
    };

    const getOverallStatus = () => {
        const activeVendors = vendors.filter(v => v.status === 'active').length;
        const totalVendors = vendors.length;
        const conflictCount = conflicts.filter(c => !c.auto_resolved).length;
        const suggestionCount = suggestions.length;

        return {
            activeVendors,
            totalVendors,
            conflictCount,
            suggestionCount,
            totalRules: firewallRules.length,
            activeRules: firewallRules.filter(r => r.enabled).length
        };
    };

    const status = getOverallStatus();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading firewall data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Shield className="h-8 w-8 text-blue-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Firewall Manager</h1>
                        <p className="text-gray-600">Multi-vendor firewall rule management and optimization</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export Rules
                    </Button>
                    <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </Button>
                </div>
            </div>

            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active Vendors</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {status.activeVendors}/{status.totalVendors}
                                </p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active Rules</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {status.activeRules}/{status.totalRules}
                                </p>
                            </div>
                            <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Suggestions</p>
                                <p className="text-2xl font-bold text-gray-900">{status.suggestionCount}</p>
                            </div>
                            <Zap className="h-8 w-8 text-yellow-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Conflicts</p>
                                <p className="text-2xl font-bold text-gray-900">{status.conflictCount}</p>
                            </div>
                            <AlertTriangle className={`h-8 w-8 ${status.conflictCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts */}
            {status.conflictCount > 0 && (
                <Alert className="border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                        {status.conflictCount} rule conflicts detected. Review and resolve conflicts to ensure proper firewall operation.
                    </AlertDescription>
                </Alert>
            )}

            {status.suggestionCount > 0 && (
                <Alert className="border-blue-200 bg-blue-50">
                    <Zap className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                        {status.suggestionCount} optimization suggestions available. Review suggestions to improve your firewall configuration.
                    </AlertDescription>
                </Alert>
            )}

            {/* Vendor Status Bar */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Connected Vendors</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {vendors.map((vendor) => (
                            <div
                                key={vendor.vendor_id}
                                className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    selectedVendor?.vendor_id === vendor.vendor_id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => setSelectedVendor(vendor)}
                            >
                                <div className="flex items-center space-x-2">
                                    <span className="font-medium">{vendor.name}</span>
                                    {getVendorStatus(vendor)}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {vendor.device_count || 0} devices
                                </div>
                            </div>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-dashed"
                            onClick={() => setActiveTab('vendors')}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Vendor
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="rules">Rules</TabsTrigger>
                    <TabsTrigger value="suggestions">
                        Suggestions
                        {status.suggestionCount > 0 && (
                            <Badge className="ml-2 bg-yellow-100 text-yellow-800">
                                {status.suggestionCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="conflicts">
                        Conflicts
                        {status.conflictCount > 0 && (
                            <Badge className="ml-2 bg-red-100 text-red-800">
                                {status.conflictCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="vendors">Vendors</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="rules" className="space-y-4">
                    <FirewallRuleManager
                        rules={firewallRules}
                        vendors={vendors}
                        selectedVendor={selectedVendor}
                        onRulesUpdate={loadFirewallData}
                    />
                </TabsContent>

                <TabsContent value="suggestions" className="space-y-4">
                    <RuleSuggestionsPanel
                        suggestions={suggestions}
                        vendors={vendors}
                        onSuggestionApplied={loadFirewallData}
                    />
                </TabsContent>

                <TabsContent value="conflicts" className="space-y-4">
                    <ConflictDetectionPanel
                        conflicts={conflicts}
                        vendors={vendors}
                        onConflictResolved={loadFirewallData}
                    />
                </TabsContent>

                <TabsContent value="vendors" className="space-y-4">
                    <VendorManagement
                        vendors={vendors}
                        onVendorsUpdate={loadFirewallData}
                    />
                </TabsContent>

                <TabsContent value="analytics" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Firewall Analytics</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-gray-500">
                                <Clock className="h-12 w-12 mx-auto mb-4" />
                                <p>Analytics dashboard coming soon</p>
                                <p className="text-sm">Track rule performance, deployment history, and security metrics</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default FirewallManager; 