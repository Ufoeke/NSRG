const ipaddr = require('ipaddr.js');

class IPSubnetCalculator {
    constructor() {
        this.reservedRanges = {
            ipv4: [
                { network: '10.0.0.0/8', description: 'Private Class A' },
                { network: '172.16.0.0/12', description: 'Private Class B' },
                { network: '192.168.0.0/16', description: 'Private Class C' },
                { network: '127.0.0.0/8', description: 'Loopback' },
                { network: '169.254.0.0/16', description: 'Link-Local' },
                { network: '224.0.0.0/4', description: 'Multicast' }
            ],
            ipv6: [
                { network: 'fe80::/10', description: 'Link-Local' },
                { network: 'ff00::/8', description: 'Multicast' },
                { network: 'fc00::/7', description: 'Unique Local' }
            ]
        };
    }

    /**
     * Calculate subnet information from CIDR notation
     * @param {string} cidr - Network in CIDR notation (e.g., '192.168.1.0/24')
     * @returns {Object} Subnet information
     */
    calculateSubnet(cidr) {
        try {
            const [networkStr, prefixLength] = cidr.split('/');
            const prefix = parseInt(prefixLength, 10);
            const network = ipaddr.process(networkStr);
            
            if (network.kind() === 'ipv4') {
                return this._calculateIPv4Subnet(network, prefix);
            } else {
                return this._calculateIPv6Subnet(network, prefix);
            }
        } catch (error) {
            throw new Error(`Invalid CIDR notation: ${cidr} - ${error.message}`);
        }
    }

    /**
     * Calculate IPv4 subnet details
     * @private
     */
    _calculateIPv4Subnet(network, prefix) {
        const hostBits = 32 - prefix;
        const totalHosts = Math.pow(2, hostBits);
        const usableHosts = Math.max(0, totalHosts - 2); // Subtract network and broadcast
        
        const networkAddr = network.toString();
        const broadcastAddr = this._calculateBroadcast(network, prefix);
        const firstUsable = this._incrementIP(networkAddr);
        const lastUsable = this._decrementIP(broadcastAddr);
        const subnetMask = this._prefixToSubnetMask(prefix);
        const wildcardMask = this._subnetToWildcardMask(subnetMask);

        return {
            network: networkAddr,
            prefix: prefix,
            subnetMask: subnetMask,
            wildcardMask: wildcardMask,
            broadcast: broadcastAddr,
            firstUsable: firstUsable,
            lastUsable: lastUsable,
            totalHosts: totalHosts,
            usableHosts: usableHosts,
            ipVersion: 'IPv4',
            isPrivate: this._isPrivateNetwork(networkAddr, prefix),
            suggestedGateway: firstUsable, // Typically first usable IP
            dhcpRange: {
                start: this._incrementIP(firstUsable, 10), // Leave some IPs for static assignment
                end: this._decrementIP(lastUsable, 10)
            }
        };
    }

    /**
     * Calculate IPv6 subnet details
     * @private
     */
    _calculateIPv6Subnet(network, prefix) {
        const hostBits = 128 - prefix;
        const totalHosts = hostBits <= 64 ? Math.pow(2, hostBits) : 'Virtually unlimited';
        
        return {
            network: network.toString(),
            prefix: prefix,
            totalHosts: totalHosts,
            ipVersion: 'IPv6',
            isPrivate: this._isPrivateNetwork(network.toString(), prefix),
            suggestedGateway: this._incrementIPv6(network.toString()),
            dhcpRange: {
                start: this._incrementIPv6(network.toString(), 1000),
                end: prefix <= 64 ? this._decrementIPv6(network.toString(), prefix, 1000) : 'Auto-configured'
            }
        };
    }

    /**
     * Split a subnet into smaller subnets
     * @param {string} cidr - Parent subnet in CIDR notation
     * @param {number} newPrefix - New prefix length for child subnets
     * @returns {Array} Array of child subnet objects
     */
    splitSubnet(cidr, newPrefix) {
        const parentInfo = this.calculateSubnet(cidr);
        const [networkStr, currentPrefix] = cidr.split('/');
        const currentPrefixNum = parseInt(currentPrefix, 10);
        
        if (newPrefix <= currentPrefixNum) {
            throw new Error('New prefix must be larger than current prefix');
        }

        const subnets = [];
        const network = ipaddr.process(networkStr);
        
        if (network.kind() === 'ipv4') {
            const subnetCount = Math.pow(2, newPrefix - currentPrefixNum);
            const hostBitsPerSubnet = 32 - newPrefix;
            const hostsPerSubnet = Math.pow(2, hostBitsPerSubnet);
            
            for (let i = 0; i < subnetCount; i++) {
                const subnetAddr = this._addToIP(networkStr, i * hostsPerSubnet);
                const subnetCidr = `${subnetAddr}/${newPrefix}`;
                subnets.push({
                    cidr: subnetCidr,
                    ...this.calculateSubnet(subnetCidr)
                });
            }
        } else {
            // IPv6 subnet splitting
            const subnetCount = Math.pow(2, newPrefix - currentPrefixNum);
            for (let i = 0; i < Math.min(subnetCount, 256); i++) { // Limit for practical purposes
                const subnetAddr = this._addToIPv6(networkStr, i, newPrefix - currentPrefixNum);
                const subnetCidr = `${subnetAddr}/${newPrefix}`;
                subnets.push({
                    cidr: subnetCidr,
                    ...this.calculateSubnet(subnetCidr)
                });
            }
        }

        return subnets;
    }

    /**
     * Check if two subnets overlap
     * @param {string} cidr1 - First subnet
     * @param {string} cidr2 - Second subnet
     * @returns {Object} Overlap information
     */
    detectOverlap(cidr1, cidr2) {
        try {
            const subnet1 = this.calculateSubnet(cidr1);
            const subnet2 = this.calculateSubnet(cidr2);
            
            if (subnet1.ipVersion !== subnet2.ipVersion) {
                return { overlaps: false, reason: 'Different IP versions' };
            }

            if (subnet1.ipVersion === 'IPv4') {
                return this._detectIPv4Overlap(subnet1, subnet2);
            } else {
                return this._detectIPv6Overlap(subnet1, subnet2);
            }
        } catch (error) {
            return { overlaps: false, error: error.message };
        }
    }

    /**
     * Detect IPv4 subnet overlap
     * @private
     */
    _detectIPv4Overlap(subnet1, subnet2) {
        const net1Start = this._ipToNumber(subnet1.network);
        const net1End = this._ipToNumber(subnet1.broadcast);
        const net2Start = this._ipToNumber(subnet2.network);
        const net2End = this._ipToNumber(subnet2.broadcast);

        const overlaps = !(net1End < net2Start || net2End < net1Start);
        
        let relationship = 'separate';
        if (overlaps) {
            if (net1Start === net2Start && net1End === net2End) {
                relationship = 'identical';
            } else if (net1Start <= net2Start && net1End >= net2End) {
                relationship = 'subnet1_contains_subnet2';
            } else if (net2Start <= net1Start && net2End >= net1End) {
                relationship = 'subnet2_contains_subnet1';
            } else {
                relationship = 'partial_overlap';
            }
        }

        return {
            overlaps,
            relationship,
            subnet1: subnet1.network + '/' + subnet1.prefix,
            subnet2: subnet2.network + '/' + subnet2.prefix
        };
    }

    /**
     * Detect IPv6 subnet overlap
     * @private
     */
    _detectIPv6Overlap(subnet1, subnet2) {
        // Simplified IPv6 overlap detection
        const addr1 = ipaddr.process(subnet1.network);
        const addr2 = ipaddr.process(subnet2.network);
        
        // Check if one subnet contains the other
        const overlaps = addr1.match(addr2, subnet2.prefix) || addr2.match(addr1, subnet1.prefix);
        
        return {
            overlaps,
            relationship: overlaps ? 'overlapping' : 'separate',
            subnet1: subnet1.network + '/' + subnet1.prefix,
            subnet2: subnet2.network + '/' + subnet2.prefix
        };
    }

    /**
     * Generate DHCP scope suggestions
     * @param {string} cidr - Network in CIDR notation
     * @param {Object} options - DHCP configuration options
     * @returns {Object} DHCP scope configuration
     */
    generateDHCPScope(cidr, options = {}) {
        const subnet = this.calculateSubnet(cidr);
        const {
            reserveStaticIPs = 20,
            dhcpPoolPercentage = 70,
            gatewayIP = null,
            dnsServers = ['8.8.8.8', '8.8.4.4'],
            domainName = 'local',
            leaseTime = '24h'
        } = options;

        if (subnet.ipVersion === 'IPv6') {
            return this._generateIPv6DHCPScope(subnet, options);
        }

        const staticStart = subnet.firstUsable;
        const staticEnd = this._incrementIP(staticStart, reserveStaticIPs - 1);
        
        const totalDHCPIPs = Math.floor((subnet.usableHosts - reserveStaticIPs) * (dhcpPoolPercentage / 100));
        const dhcpStart = this._incrementIP(staticEnd);
        const dhcpEnd = this._incrementIP(dhcpStart, totalDHCPIPs - 1);

        return {
            network: subnet.network,
            subnetMask: subnet.subnetMask,
            gateway: gatewayIP || subnet.suggestedGateway,
            dnsServers: dnsServers,
            domainName: domainName,
            leaseTime: leaseTime,
            ranges: {
                static: {
                    start: staticStart,
                    end: staticEnd,
                    count: reserveStaticIPs
                },
                dhcp: {
                    start: dhcpStart,
                    end: dhcpEnd,
                    count: totalDHCPIPs
                },
                unused: {
                    start: this._incrementIP(dhcpEnd),
                    end: subnet.lastUsable,
                    count: subnet.usableHosts - reserveStaticIPs - totalDHCPIPs
                }
            },
            utilization: {
                static: reserveStaticIPs,
                dhcp: totalDHCPIPs,
                unused: subnet.usableHosts - reserveStaticIPs - totalDHCPIPs,
                total: subnet.usableHosts
            }
        };
    }

    /**
     * Validate IP address or CIDR notation
     * @param {string} input - IP address or CIDR to validate
     * @returns {Object} Validation result
     */
    validateInput(input) {
        try {
            if (input.includes('/')) {
                // CIDR notation
                const [ip, prefix] = input.split('/');
                const prefixNum = parseInt(prefix, 10);
                const addr = ipaddr.process(ip);
                
                const maxPrefix = addr.kind() === 'ipv4' ? 32 : 128;
                if (prefixNum < 0 || prefixNum > maxPrefix) {
                    throw new Error(`Invalid prefix length for ${addr.kind()}`);
                }
                
                return {
                    valid: true,
                    type: 'cidr',
                    ipVersion: addr.kind() === 'ipv4' ? 'IPv4' : 'IPv6',
                    network: ip,
                    prefix: prefixNum
                };
            } else {
                // IP address
                const addr = ipaddr.process(input);
                return {
                    valid: true,
                    type: 'ip',
                    ipVersion: addr.kind() === 'ipv4' ? 'IPv4' : 'IPv6',
                    address: addr.toString()
                };
            }
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Find optimal subnet allocation for given requirements
     * @param {Array} requirements - Array of subnet requirements
     * @param {string} parentCidr - Parent network to allocate from
     * @returns {Object} Allocation plan
     */
    optimizeSubnetAllocation(requirements, parentCidr) {
        const parentSubnet = this.calculateSubnet(parentCidr);
        
        // Sort requirements by size (largest first)
        const sortedReqs = requirements.sort((a, b) => b.hostsNeeded - a.hostsNeeded);
        
        const allocations = [];
        let currentNetwork = parentSubnet.network;
        let remainingSpace = parentSubnet.usableHosts;

        for (const req of sortedReqs) {
            const neededPrefix = this._calculateRequiredPrefix(req.hostsNeeded, parentSubnet.ipVersion);
            const subnetSize = parentSubnet.ipVersion === 'IPv4' ? 
                Math.pow(2, 32 - neededPrefix) : Math.pow(2, 128 - neededPrefix);

            if (subnetSize > remainingSpace) {
                allocations.push({
                    name: req.name,
                    hostsNeeded: req.hostsNeeded,
                    status: 'insufficient_space',
                    error: `Not enough space remaining (${remainingSpace} hosts available)`
                });
                continue;
            }

            const allocation = {
                name: req.name,
                hostsNeeded: req.hostsNeeded,
                cidr: `${currentNetwork}/${neededPrefix}`,
                ...this.calculateSubnet(`${currentNetwork}/${neededPrefix}`),
                status: 'allocated'
            };

            allocations.push(allocation);
            currentNetwork = this._getNextNetwork(currentNetwork, neededPrefix, parentSubnet.ipVersion);
            remainingSpace -= subnetSize;
        }

        return {
            parentNetwork: parentCidr,
            totalAllocated: allocations.filter(a => a.status === 'allocated').length,
            totalFailed: allocations.filter(a => a.status === 'insufficient_space').length,
            allocations: allocations,
            remainingSpace: remainingSpace
        };
    }

    // Helper methods

    _calculateBroadcast(network, prefix) {
        const hostBits = 32 - prefix;
        const networkNum = this._ipToNumber(network.toString());
        const broadcastNum = networkNum + Math.pow(2, hostBits) - 1;
        return this._numberToIP(broadcastNum);
    }

    _incrementIP(ip, count = 1) {
        const num = this._ipToNumber(ip);
        return this._numberToIP(num + count);
    }

    _decrementIP(ip, count = 1) {
        const num = this._ipToNumber(ip);
        return this._numberToIP(num - count);
    }

    _addToIP(ip, amount) {
        return this._incrementIP(ip, amount);
    }

    _ipToNumber(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    }

    _numberToIP(num) {
        return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
    }

    _prefixToSubnetMask(prefix) {
        const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
        return this._numberToIP(mask);
    }

    _subnetToWildcardMask(subnetMask) {
        const maskNum = this._ipToNumber(subnetMask);
        const wildcardNum = (~maskNum) >>> 0;
        return this._numberToIP(wildcardNum);
    }

    _isPrivateNetwork(network, prefix) {
        const addr = ipaddr.process(network);
        return this.reservedRanges[addr.kind() === 'ipv4' ? 'ipv4' : 'ipv6']
            .some(range => {
                try {
                    const rangeAddr = ipaddr.process(range.network.split('/')[0]);
                    const rangePrefix = parseInt(range.network.split('/')[1], 10);
                    return addr.match(rangeAddr, rangePrefix);
                } catch {
                    return false;
                }
            });
    }

    _incrementIPv6(ipv6, count = 1) {
        // Simplified IPv6 increment - in practice, would use proper library
        return ipv6; // Placeholder
    }

    _decrementIPv6(ipv6, prefix, count = 1) {
        // Simplified IPv6 decrement
        return ipv6; // Placeholder
    }

    _addToIPv6(ipv6, amount, bits) {
        // Simplified IPv6 addition
        return ipv6; // Placeholder
    }

    _generateIPv6DHCPScope(subnet, options) {
        return {
            network: subnet.network,
            prefix: subnet.prefix,
            gateway: subnet.suggestedGateway,
            dnsServers: options.dnsServers || ['2001:4860:4860::8888', '2001:4860:4860::8844'],
            domainName: options.domainName || 'local',
            leaseTime: options.leaseTime || '24h',
            ranges: {
                dhcp: subnet.dhcpRange,
                static: 'Manual assignment recommended'
            }
        };
    }

    _calculateRequiredPrefix(hostsNeeded, ipVersion) {
        if (ipVersion === 'IPv6') {
            return 64; // Standard IPv6 subnet
        }
        
        // Add 2 for network and broadcast addresses
        const totalIPs = hostsNeeded + 2;
        const hostBits = Math.ceil(Math.log2(totalIPs));
        return 32 - hostBits;
    }

    _getNextNetwork(currentNetwork, prefix, ipVersion) {
        if (ipVersion === 'IPv6') {
            return this._incrementIPv6(currentNetwork, Math.pow(2, 128 - prefix));
        }
        
        const subnetSize = Math.pow(2, 32 - prefix);
        return this._addToIP(currentNetwork, subnetSize);
    }
}

module.exports = IPSubnetCalculator;