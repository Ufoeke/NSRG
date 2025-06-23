import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Settings, Download, Upload, Play, Pause } from 'lucide-react';

const VLANPortMapping = () => {
    const [switches, setSwitches] = useState([]);
    const [selectedSwitch, setSelectedSwitch] = useState('');
    const [ports, setPorts] = useState([]);
    const [vlans, setVlans] = useState([]);
    const [selectedPorts, setSelectedPorts] = useState([]);
    const [bulkOperation, setBulkOperation] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchSwitches();
        fetchVlans();
    }, []);

    useEffect(() => {
        if (selectedSwitch) {
            fetchPorts(selectedSwitch);
        }
    }, [selectedSwitch]);

    const fetchSwitches = async () => {
        try {
            const response = await fetch('/api/switches');
            const data = await response.json();
            setSwitches(data);
        } catch (error) {
            console.error('Failed to fetch switches:', error);
            // Fallback to mock data for demo
            setSwitches([
                { id: 'sw1', name: 'Core-Switch-01', model: 'Cisco Catalyst 9300', ports: 48, ip: '192.168.1.10' },
                { id: 'sw2', name: 'Access-Switch-02', model: 'Cisco Catalyst 2960', ports: 24, ip: '192.168.1.11' },
                { id: 'sw3', name: 'Distribution-Switch-03', model: 'FortiSwitch 448D', ports: 48, ip: '192.168.1.12' }
            ]);
        }
    };

    const fetchVlans = async () => {
        try {
            const response = await fetch('/api/vlans');
            const data = await response.json();
            setVlans(data);
        } catch (error) {
            console.error('Failed to fetch VLANs:', error);
            // Fallback to mock data
            setVlans([
                { id: 100, name: 'Users-Main', subnet: '192.168.100.0/24', description: 'Main user network' },
                { id: 200, name: 'Servers-Prod', subnet: '192.168.200.0/24', description: 'Production servers' },
                { id: 300, name: 'Guest-Network', subnet: '192.168.300.0/24', description: 'Guest access network' },
                { id: 400, name: 'Management', subnet: '192.168.400.0/24', description: 'Management network' },
                { id: 500, name: 'Voice', subnet: '192.168.500.0/24', description: 'VoIP network' }
            ]);
        }
    };

    const fetchPorts = async (switchId) => {
        try {
            const response = await fetch(`/api/switches/${switchId}/ports`);
            const data = await response.json();
            setPorts(data);
        } catch (error) {
            console.error('Failed to fetch ports:', error);
            // Generate mock port data based on switch
            const selectedSw = switches.find(sw => sw.id === switchId);
            const portCount = selectedSw?.ports || 48;
            
            setPorts(Array.from({ length: portCount }, (_, i) => ({
                number: i + 1,
                status: Math.random() > 0.2 ? 'up' : 'down',
                type: Math.random() > 0.85 ? 'trunk' : 'access',
                vlan: Math.random() > 0.4 ? [100, 200, 300, 400, 500][Math.floor(Math.random() * 5)] : null,
                description: Math.random() > 0.3 ? `Workstation-${String(i + 1).padStart(2, '0')}` : '',
                speed: Math.random() > 0.1 ? '1000' : '100',
                duplex: Math.random() > 0.05 ? 'full' : 'half',
                adminStatus: 'enabled',
                lastChanged: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString()
            })));
        }
    };

    const handleSwitchChange = (switchId) => {
        setSelectedSwitch(switchId);
        // Would fetch ports for selected switch
    };

    const handlePortSelect = (portNumber, checked) => {
        if (checked) {
            setSelectedPorts([...selectedPorts, portNumber]);
        } else {
            setSelectedPorts(selectedPorts.filter(p => p !== portNumber));
        }
    };

    const handleBulkVLANAssignment = async (vlanId) => {
        setBulkOperation({
            type: 'vlan_assignment',
            vlanId: vlanId,
            ports: selectedPorts,
            status: 'pending'
        });
    };

    const executeBulkOperation = async () => {
        if (!bulkOperation) return;

        setBulkOperation(prev => ({ ...prev, status: 'executing' }));

        try {
            const response = await fetch('/api/vlan-deployment/bulk-assign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    switchId: selectedSwitch,
                    operation: bulkOperation.type,
                    vlanId: bulkOperation.vlanId,
                    ports: bulkOperation.ports,
                    dryRun: false
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                setBulkOperation(prev => ({ ...prev, status: 'completed', result }));
                // Refresh port data to show updates
                fetchPorts(selectedSwitch);
                setSelectedPorts([]);
            } else {
                setBulkOperation(prev => ({ ...prev, status: 'failed', error: result.error }));
            }
        } catch (error) {
            setBulkOperation(prev => ({ ...prev, status: 'failed', error: error.message }));
        }
    };

    const executeDryRun = async () => {
        if (!bulkOperation) return;

        try {
            const response = await fetch('/api/vlan-deployment/bulk-assign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    switchId: selectedSwitch,
                    operation: bulkOperation.type,
                    vlanId: bulkOperation.vlanId,
                    ports: bulkOperation.ports,
                    dryRun: true
                })
            });

            const result = await response.json();
            setBulkOperation(prev => ({ ...prev, dryRunResult: result }));
        } catch (error) {
            console.error('Dry run failed:', error);
        }
    };

    const cancelBulkOperation = () => {
        setBulkOperation(null);
        setSelectedPorts([]);
    };

    const handleIndividualPortConfig = async (portNumber, config) => {
        try {
            const response = await fetch(`/api/switches/${selectedSwitch}/ports/${portNumber}/configure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                // Refresh port data
                fetchPorts(selectedSwitch);
            }
        } catch (error) {
            console.error('Port configuration failed:', error);
        }
    };

    const filteredPorts = ports.filter(port => {
        const matchesSearch = port.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             port.number.toString().includes(searchTerm);
        const matchesStatus = filterStatus === 'all' || port.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const getPortStatusColor = (status) => {
        switch (status) {
            case 'up': return 'bg-green-100 text-green-800';
            case 'down': return 'bg-gray-100 text-gray-800';
            case 'err-disabled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getPortTypeColor = (type) => {
        switch (type) {
            case 'access': return 'bg-blue-100 text-blue-800';
            case 'trunk': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>VLAN Port Mapping & Automation</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Switch Selection */}
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Select Switch</label>
                            <Select value={selectedSwitch} onValueChange={handleSwitchChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a switch" />
                                </SelectTrigger>
                                <SelectContent>
                                    {switches.map(sw => (
                                        <SelectItem key={sw.id} value={sw.id}>
                                            {sw.name} ({sw.model})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Search Ports</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search ports..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Filter Status</label>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="up">Up</SelectItem>
                                    <SelectItem value="down">Down</SelectItem>
                                    <SelectItem value="err-disabled">Error Disabled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Bulk Operations */}
                    {selectedPorts.length > 0 && (
                        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                            <h3 className="font-medium mb-3">
                                Bulk Operations ({selectedPorts.length} ports selected)
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {vlans.map(vlan => (
                                    <Button
                                        key={vlan.id}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleBulkVLANAssignment(vlan.id)}
                                    >
                                        Assign to VLAN {vlan.id}
                                    </Button>
                                ))}
                                <Button variant="outline" size="sm">
                                    <Settings className="h-4 w-4 mr-2" />
                                    Apply Profile
                                </Button>
                                <Button variant="outline" size="sm">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export Config
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Port Table */}
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12">
                                        <Checkbox />
                                    </TableHead>
                                    <TableHead>Port</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>VLAN</TableHead>
                                    <TableHead>Speed</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPorts.map(port => (
                                    <TableRow key={port.number}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedPorts.includes(port.number)}
                                                onCheckedChange={(checked) => 
                                                    handlePortSelect(port.number, checked)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {port.number}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={getPortStatusColor(port.status)}>
                                                {port.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={getPortTypeColor(port.type)}>
                                                {port.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {port.vlan ? (
                                                <Badge variant="outline">
                                                    VLAN {port.vlan}
                                                </Badge>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{port.speed} Mbps</TableCell>
                                        <TableCell>{port.description}</TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Select
                                                    value={port.vlan?.toString() || ''}
                                                    onValueChange={(vlanId) => 
                                                        handleIndividualPortConfig(port.number, {
                                                            type: 'access',
                                                            vlan: parseInt(vlanId)
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="w-24">
                                                        <SelectValue placeholder="VLAN" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {vlans.map(vlan => (
                                                            <SelectItem key={vlan.id} value={vlan.id.toString()}>
                                                                {vlan.id}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => handleIndividualPortConfig(port.number, {
                                                        adminStatus: port.adminStatus === 'enabled' ? 'disabled' : 'enabled'
                                                    })}
                                                >
                                                    {port.adminStatus === 'enabled' ? 'Disable' : 'Enable'}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex justify-between">
                        <div className="flex gap-2">
                            <Button variant="outline">
                                <Upload className="h-4 w-4 mr-2" />
                                Import Config
                            </Button>
                            <Button variant="outline">
                                <Download className="h-4 w-4 mr-2" />
                                Export Config
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline">
                                <Pause className="h-4 w-4 mr-2" />
                                Dry Run
                            </Button>
                            <Button>
                                <Play className="h-4 w-4 mr-2" />
                                Deploy Changes
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Operation Status */}
            {bulkOperation && (
                <Card>
                    <CardHeader>
                        <CardTitle>Bulk Operation Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <p><strong>Operation:</strong> {bulkOperation.type}</p>
                            <p><strong>VLAN:</strong> {bulkOperation.vlanId}</p>
                            <p><strong>Ports:</strong> {bulkOperation.ports.join(', ')}</p>
                            <p><strong>Status:</strong> 
                                <Badge className="ml-2">
                                    {bulkOperation.status}
                                </Badge>
                            </p>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Button 
                                size="sm" 
                                onClick={executeBulkOperation}
                                disabled={bulkOperation.status === 'executing'}
                            >
                                {bulkOperation.status === 'executing' ? 'Executing...' : 'Execute'}
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={executeDryRun}
                                disabled={bulkOperation.status === 'executing'}
                            >
                                Dry Run
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={cancelBulkOperation}
                            >
                                Cancel
                            </Button>
                        </div>
                        {bulkOperation.dryRunResult && (
                            <div className="mt-4 p-3 bg-gray-50 rounded">
                                <h4 className="font-medium mb-2">Dry Run Results:</h4>
                                <pre className="text-sm text-gray-600">
                                    {JSON.stringify(bulkOperation.dryRunResult, null, 2)}
                                </pre>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default VLANPortMapping;