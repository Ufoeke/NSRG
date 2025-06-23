import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
    Search, 
    ChevronDown, 
    ChevronUp, 
    Clock, 
    Zap, 
    Shield,
    Network,
    Globe,
    Server
} from 'lucide-react';

/**
 * Intelligent Autocomplete Component
 * Provides smart suggestions for firewall rule creation with context-aware autocomplete
 */
const IntelligentAutocomplete = ({ value, onChange, placeholder, vendors, existingRules }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [recentSearches, setRecentSearches] = useState([]);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    // Load recent searches from localStorage
    useEffect(() => {
        const stored = localStorage.getItem('firewall_recent_searches');
        if (stored) {
            try {
                setRecentSearches(JSON.parse(stored));
            } catch (error) {
                console.error('Error loading recent searches:', error);
            }
        }
    }, []);

    // Generate suggestions based on input
    useEffect(() => {
        if (value && value.length >= 2) {
            generateSuggestions(value);
        } else if (value === '') {
            // Show recent searches and common patterns when empty
            setSuggestions(getInitialSuggestions());
        } else {
            setSuggestions([]);
        }
    }, [value, vendors, existingRules]);

    const generateSuggestions = useCallback((input) => {
        const inputLower = input.toLowerCase();
        const suggestions = [];
        
        // Context-aware parsing
        const context = parseSearchContext(input);
        
        // Smart suggestions based on context
        if (context.type === 'port') {
            suggestions.push(...getPortSuggestions(context.value));
        } else if (context.type === 'ip') {
            suggestions.push(...getIPSuggestions(context.value));
        } else if (context.type === 'protocol') {
            suggestions.push(...getProtocolSuggestions(context.value));
        } else if (context.type === 'action') {
            suggestions.push(...getActionSuggestions(context.value));
        } else {
            // General search suggestions
            suggestions.push(...getGeneralSuggestions(inputLower));
        }
        
        // Add suggestions from existing rules
        suggestions.push(...getExistingRuleSuggestions(inputLower));
        
        // Add recent searches that match
        suggestions.push(...getRecentSearchSuggestions(inputLower));
        
        // Remove duplicates and limit results
        const uniqueSuggestions = Array.from(
            new Map(suggestions.map(s => [s.text, s])).values()
        ).slice(0, 10);
        
        setSuggestions(uniqueSuggestions);
        setShowSuggestions(true);
        setSelectedIndex(-1);
    }, [vendors, existingRules, recentSearches]);

    const parseSearchContext = (input) => {
        const patterns = {
            port: /(?:port|:)[\s]*(\d+)/i,
            ip: /(?:ip|address|src|dst|source|destination)[\s]*([0-9.\/]+)/i,
            protocol: /(?:proto|protocol)[\s]*(\w+)/i,
            action: /(?:action|rule)[\s]*(\w+)/i
        };
        
        for (const [type, pattern] of Object.entries(patterns)) {
            const match = input.match(pattern);
            if (match) {
                return { type, value: match[1] };
            }
        }
        
        return { type: 'general', value: input };
    };

    const getPortSuggestions = (portInput) => {
        const commonPorts = [
            { port: 80, name: 'HTTP', description: 'Web traffic' },
            { port: 443, name: 'HTTPS', description: 'Secure web traffic' },
            { port: 22, name: 'SSH', description: 'Secure shell' },
            { port: 23, name: 'Telnet', description: 'Unencrypted remote access' },
            { port: 25, name: 'SMTP', description: 'Email transmission' },
            { port: 53, name: 'DNS', description: 'Domain name resolution' },
            { port: 21, name: 'FTP', description: 'File transfer' },
            { port: 3389, name: 'RDP', description: 'Remote desktop' },
            { port: 3306, name: 'MySQL', description: 'MySQL database' },
            { port: 5432, name: 'PostgreSQL', description: 'PostgreSQL database' },
            { port: 1433, name: 'MSSQL', description: 'Microsoft SQL Server' },
            { port: 993, name: 'IMAPS', description: 'Secure IMAP email' },
            { port: 995, name: 'POP3S', description: 'Secure POP3 email' }
        ];
        
        return commonPorts
            .filter(p => p.port.toString().includes(portInput) || p.name.toLowerCase().includes(portInput.toLowerCase()))
            .map(p => ({
                text: `port ${p.port}`,
                description: `${p.name} - ${p.description}`,
                type: 'port',
                icon: <Network className="h-4 w-4" />,
                category: 'Ports'
            }));
    };

    const getIPSuggestions = (ipInput) => {
        const commonNetworks = [
            { network: '10.0.0.0/8', description: 'Private Class A network' },
            { network: '172.16.0.0/12', description: 'Private Class B network' },
            { network: '192.168.0.0/16', description: 'Private Class C network' },
            { network: '0.0.0.0/0', description: 'Any address (all traffic)' },
            { network: '127.0.0.1/32', description: 'Localhost' }
        ];
        
        // Add networks from existing rules
        const existingNetworks = new Set();
        existingRules.forEach(rule => {
            if (rule.source_address && rule.source_address !== 'any') {
                existingNetworks.add(rule.source_address);
            }
            if (rule.destination_address && rule.destination_address !== 'any') {
                existingNetworks.add(rule.destination_address);
            }
        });
        
        const suggestions = commonNetworks
            .filter(n => n.network.includes(ipInput))
            .map(n => ({
                text: n.network,
                description: n.description,
                type: 'ip',
                icon: <Globe className="h-4 w-4" />,
                category: 'Networks'
            }));
        
        // Add existing networks
        Array.from(existingNetworks)
            .filter(network => network.includes(ipInput))
            .forEach(network => {
                suggestions.push({
                    text: network,
                    description: 'Used in existing rules',
                    type: 'ip',
                    icon: <Clock className="h-4 w-4" />,
                    category: 'Recent'
                });
            });
        
        return suggestions;
    };

    const getProtocolSuggestions = (protocolInput) => {
        const protocols = [
            { name: 'TCP', description: 'Transmission Control Protocol' },
            { name: 'UDP', description: 'User Datagram Protocol' },
            { name: 'ICMP', description: 'Internet Control Message Protocol' },
            { name: 'ANY', description: 'Any protocol' }
        ];
        
        return protocols
            .filter(p => p.name.toLowerCase().includes(protocolInput.toLowerCase()))
            .map(p => ({
                text: `protocol ${p.name}`,
                description: p.description,
                type: 'protocol',
                icon: <Network className="h-4 w-4" />,
                category: 'Protocols'
            }));
    };

    const getActionSuggestions = (actionInput) => {
        const actions = [
            { name: 'allow', description: 'Permit traffic' },
            { name: 'deny', description: 'Block traffic silently' },
            { name: 'drop', description: 'Drop traffic without response' },
            { name: 'reject', description: 'Block traffic with rejection message' }
        ];
        
        return actions
            .filter(a => a.name.includes(actionInput.toLowerCase()))
            .map(a => ({
                text: `action ${a.name}`,
                description: a.description,
                type: 'action',
                icon: <Shield className="h-4 w-4" />,
                category: 'Actions'
            }));
    };

    const getGeneralSuggestions = (input) => {
        const suggestions = [];
        
        // Common search patterns
        const commonPatterns = [
            { text: 'allow web traffic', description: 'Rules allowing HTTP/HTTPS' },
            { text: 'block external access', description: 'Rules blocking external traffic' },
            { text: 'database rules', description: 'Rules for database access' },
            { text: 'ssh access', description: 'Rules for SSH connections' },
            { text: 'vpn traffic', description: 'VPN-related rules' },
            { text: 'internal networks', description: 'Rules for internal network traffic' },
            { text: 'high priority rules', description: 'Rules with high priority' },
            { text: 'disabled rules', description: 'Currently disabled rules' }
        ];
        
        commonPatterns
            .filter(p => p.text.includes(input) || p.description.toLowerCase().includes(input))
            .forEach(p => {
                suggestions.push({
                    text: p.text,
                    description: p.description,
                    type: 'pattern',
                    icon: <Zap className="h-4 w-4" />,
                    category: 'Patterns'
                });
            });
        
        return suggestions;
    };

    const getExistingRuleSuggestions = (input) => {
        const suggestions = [];
        const matchingRules = existingRules
            .filter(rule => 
                rule.name.toLowerCase().includes(input) ||
                (rule.description && rule.description.toLowerCase().includes(input)) ||
                (rule.source_address && rule.source_address.includes(input)) ||
                (rule.destination_address && rule.destination_address.includes(input))
            )
            .slice(0, 3);
        
        matchingRules.forEach(rule => {
            suggestions.push({
                text: rule.name,
                description: `${rule.action} rule: ${rule.source_address || 'any'} → ${rule.destination_address || 'any'}`,
                type: 'existing_rule',
                icon: <Clock className="h-4 w-4" />,
                category: 'Existing Rules',
                ruleId: rule.id
            });
        });
        
        return suggestions;
    };

    const getRecentSearchSuggestions = (input) => {
        return recentSearches
            .filter(search => search.toLowerCase().includes(input))
            .slice(0, 2)
            .map(search => ({
                text: search,
                description: 'Recent search',
                type: 'recent',
                icon: <Clock className="h-4 w-4" />,
                category: 'Recent'
            }));
    };

    const getInitialSuggestions = () => {
        const suggestions = [];
        
        // Recent searches
        recentSearches.slice(0, 3).forEach(search => {
            suggestions.push({
                text: search,
                description: 'Recent search',
                type: 'recent',
                icon: <Clock className="h-4 w-4" />,
                category: 'Recent'
            });
        });
        
        // Quick actions
        const quickActions = [
            { text: 'allow web traffic', description: 'Create rules for HTTP/HTTPS' },
            { text: 'block port 23', description: 'Block Telnet access' },
            { text: 'ssh from admin network', description: 'Allow SSH from management network' }
        ];
        
        quickActions.forEach(action => {
            suggestions.push({
                text: action.text,
                description: action.description,
                type: 'quick_action',
                icon: <Zap className="h-4 w-4" />,
                category: 'Quick Actions'
            });
        });
        
        return suggestions;
    };

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        onChange(newValue);
    };

    const handleSuggestionClick = (suggestion) => {
        onChange(suggestion.text);
        setShowSuggestions(false);
        addToRecentSearches(suggestion.text);
        
        // If it's an existing rule, trigger additional action
        if (suggestion.type === 'existing_rule') {
            // Could emit an event to highlight or navigate to the rule
            console.log('Selected existing rule:', suggestion.ruleId);
        }
    };

    const addToRecentSearches = (search) => {
        const updated = [search, ...recentSearches.filter(s => s !== search)].slice(0, 10);
        setRecentSearches(updated);
        localStorage.setItem('firewall_recent_searches', JSON.stringify(updated));
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev < suggestions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    handleSuggestionClick(suggestions[selectedIndex]);
                } else {
                    setShowSuggestions(false);
                    addToRecentSearches(value);
                }
                break;
            case 'Escape':
                setShowSuggestions(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const handleFocus = () => {
        if (value === '') {
            setSuggestions(getInitialSuggestions());
        }
        setShowSuggestions(true);
    };

    const handleBlur = (e) => {
        // Delay hiding suggestions to allow for clicks
        setTimeout(() => {
            if (!suggestionsRef.current?.contains(document.activeElement)) {
                setShowSuggestions(false);
            }
        }, 200);
    };

    // Group suggestions by category
    const groupedSuggestions = suggestions.reduce((groups, suggestion) => {
        const category = suggestion.category || 'Other';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(suggestion);
        return groups;
    }, {});

    return (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    ref={inputRef}
                    value={value}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    className="pl-10 pr-4"
                />
                {showSuggestions && (
                    <ChevronUp className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                )}
            </div>
            
            {showSuggestions && suggestions.length > 0 && (
                <Card 
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-y-auto border shadow-lg bg-white"
                >
                    <div className="p-2">
                        {Object.entries(groupedSuggestions).map(([category, categoryeSuggestions]) => (
                            <div key={category} className="mb-2 last:mb-0">
                                <div className="text-xs font-medium text-gray-500 px-2 py-1 uppercase tracking-wide">
                                    {category}
                                </div>
                                {categoryeSuggestions.map((suggestion, index) => {
                                    const globalIndex = suggestions.indexOf(suggestion);
                                    return (
                                        <div
                                            key={`${category}-${index}`}
                                            className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                                                globalIndex === selectedIndex 
                                                    ? 'bg-blue-50 text-blue-900' 
                                                    : 'hover:bg-gray-50'
                                            }`}
                                            onClick={() => handleSuggestionClick(suggestion)}
                                        >
                                            <span className="text-gray-400">
                                                {suggestion.icon}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {suggestion.text}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    {suggestion.description}
                                                </div>
                                            </div>
                                            {suggestion.type === 'port' && (
                                                <Badge variant="outline" className="text-xs">
                                                    Port
                                                </Badge>
                                            )}
                                            {suggestion.type === 'existing_rule' && (
                                                <Badge variant="outline" className="text-xs">
                                                    Existing
                                                </Badge>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default IntelligentAutocomplete; 