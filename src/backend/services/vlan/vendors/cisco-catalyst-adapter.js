/**
 * Cisco Catalyst Switch Adapter
 * Implements VLAN operations for Cisco Catalyst switches via SSH/CLI
 */

const BaseSwitchAdapter = require('./base-switch');
const { Client } = require('ssh2');
const fs = require('fs');

class CiscoCatalystAdapter extends BaseSwitchAdapter {
    constructor(switchConfig) {
        super(switchConfig);
        
        // Cisco-specific configuration
        this.sshClient = null;
        this.shell = null;
        this.commandQueue = [];
        this.isExecutingCommand = false;
        
        // Cisco Catalyst capabilities
        this.capabilities = {
            ...this.capabilities,
            vlans: true,
            trunking: true,
            portSecurity: true,
            stackable: true,
            poe: true,
            qos: true,
            stp: true,
            lacp: true,
            vtp: true,
            etherchannel: true,
            storm_control: true
        };

        // Command patterns and responses
        this.patterns = {
            enable_prompt: /[\w\-]+#\s*$/,
            config_prompt: /[\w\-]+\(config\)#\s*$/,
            interface_prompt: /[\w\-]+\(config-if\)#\s*$/,
            vlan_prompt: /[\w\-]+\(config-vlan\)#\s*$/,
            more_prompt: /--More--/,
            error_patterns: [
                /Invalid input detected/,
                /Incomplete command/,
                /% Ambiguous command/,
                /% Unknown command/,
                /Access denied/
            ]
        };
    }

    /**
     * Get default capabilities for Cisco Catalyst switches
     */
    getDefaultCapabilities() {
        return {
            vlans: true,
            trunking: true,
            portSecurity: true,
            stackable: true,
            poe: true,
            qos: true,
            stp: true,
            lacp: true,
            vtp: true
        };
    }

    /**
     * Establish SSH connection to Cisco switch
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.sshClient = new Client();
            this.connectionAttempts++;

            const connectionConfig = {
                host: this.config.ipAddress,
                port: this.config.sshPort || 22,
                username: this.config.credentials.username,
                password: this.config.credentials.password,
                readyTimeout: this.config.timeout,
                algorithms: {
                    kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
                    hmac: ['hmac-sha2-256', 'hmac-sha1']
                }
            };

            // Support for SSH key authentication
            if (this.config.credentials.privateKeyPath) {
                connectionConfig.privateKey = fs.readFileSync(this.config.credentials.privateKeyPath);
            }

            this.sshClient.on('ready', async () => {
                try {
                    this.shell = await this.createShell();
                    await this.enterPrivilegedMode();
                    this.connected = true;
                    this.lastError = null;
                    this.handleConnectionEvent('connected');
                    this.log('info', 'Connected to Cisco Catalyst switch', {
                        hostname: this.config.hostname,
                        attempt: this.connectionAttempts
                    });
                    resolve(true);
                } catch (error) {
                    this.lastError = error;
                    this.handleConnectionEvent('connection_failed', { error: error.message });
                    reject(error);
                }
            });

            this.sshClient.on('error', (error) => {
                this.lastError = error;
                this.connected = false;
                this.handleConnectionEvent('error', { error: error.message });
                reject(error);
            });

            this.sshClient.on('close', () => {
                this.connected = false;
                this.handleConnectionEvent('disconnected');
                this.log('info', 'Disconnected from Cisco switch');
            });

            this.sshClient.connect(connectionConfig);
        });
    }

    /**
     * Create shell session
     */
    createShell() {
        return new Promise((resolve, reject) => {
            this.sshClient.shell((err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                stream.setEncoding('utf8');
                resolve(stream);
            });
        });
    }

    /**
     * Enter privileged EXEC mode
     */
    async enterPrivilegedMode() {
        // Check if already in privileged mode
        const response = await this.executeCommand('');
        if (this.patterns.enable_prompt.test(response)) {
            return true;
        }

        // Enter enable mode
        const enableCommand = this.config.credentials.enablePassword 
            ? `enable\n${this.config.credentials.enablePassword}\n`
            : 'enable\n';
            
        const enableResponse = await this.executeCommand(enableCommand);
        
        if (!this.patterns.enable_prompt.test(enableResponse)) {
            throw new Error('Failed to enter privileged mode');
        }

        return true;
    }

    /**
     * Execute CLI command on switch
     */
    async executeCommand(command, expectPattern = null) {
        return new Promise((resolve, reject) => {
            if (!this.shell) {
                reject(new Error('No active shell connection'));
                return;
            }

            let output = '';
            let timeoutId;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                this.shell.removeAllListeners('data');
            };

            const handleData = (data) => {
                output += data;

                // Handle "More" prompts
                if (this.patterns.more_prompt.test(data)) {
                    this.shell.write(' '); // Send space to continue
                    return;
                }

                // Check for errors
                const hasError = this.patterns.error_patterns.some(pattern => pattern.test(output));
                if (hasError) {
                    cleanup();
                    reject(new Error(`Command error: ${output.trim()}`));
                    return;
                }

                // Check if command completed
                const expectedPattern = expectPattern || this.patterns.enable_prompt;
                if (expectedPattern.test(data)) {
                    cleanup();
                    resolve(output.trim());
                }
            };

            // Set up timeout
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Command timeout: ${command.substring(0, 50)}`));
            }, this.config.timeout);

            // Listen for output
            this.shell.on('data', handleData);

            // Send command
            if (command) {
                this.shell.write(command + '\n');
            }
        });
    }

    /**
     * Disconnect from switch
     */
    async disconnect() {
        if (this.shell) {
            this.shell.end();
            this.shell = null;
        }
        
        if (this.sshClient) {
            this.sshClient.end();
            this.sshClient = null;
        }
        
        this.connected = false;
    }

    /**
     * Test connection to switch
     */
    async testConnection() {
        try {
            const systemInfo = await this.getSystemInfo();
            return {
                success: true,
                responseTime: Date.now(), // Simplified - would measure actual response time
                systemInfo
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                responseTime: null
            };
        }
    }

    /**
     * Get system information
     */
    async getSystemInfo() {
        const versionOutput = await this.executeCommand('show version');
        const inventoryOutput = await this.executeCommand('show inventory');
        
        return this.parseSystemInfo(versionOutput, inventoryOutput);
    }

    /**
     * Parse system information from show commands
     */
    parseSystemInfo(versionOutput, inventoryOutput) {
        const info = {
            vendor: 'cisco',
            model: null,
            serialNumber: null,
            softwareVersion: null,
            hostname: null,
            uptime: null,
            memory: null,
            flash: null
        };

        // Parse model
        const modelMatch = versionOutput.match(/cisco (\w+)/i);
        if (modelMatch) {
            info.model = modelMatch[1];
        }

        // Parse software version
        const versionMatch = versionOutput.match(/Version ([^\s,]+)/);
        if (versionMatch) {
            info.softwareVersion = versionMatch[1];
        }

        // Parse hostname
        const hostnameMatch = versionOutput.match(/(\w+) uptime is/);
        if (hostnameMatch) {
            info.hostname = hostnameMatch[1];
        }

        // Parse uptime
        const uptimeMatch = versionOutput.match(/uptime is (.+)/);
        if (uptimeMatch) {
            info.uptime = uptimeMatch[1];
        }

        // Parse serial number from inventory
        const serialMatch = inventoryOutput.match(/SN: (\w+)/);
        if (serialMatch) {
            info.serialNumber = serialMatch[1];
        }

        return info;
    }

    /**
     * Get all VLANs from switch
     */
    async getVlans() {
        const output = await this.executeCommand('show vlan brief');
        return this.parseVlanBrief(output);
    }

    /**
     * Parse VLAN brief output
     */
    parseVlanBrief(output) {
        const vlans = [];
        const lines = output.split('\n');
        
        let inVlanSection = false;
        
        for (const line of lines) {
            if (line.includes('VLAN Name')) {
                inVlanSection = true;
                continue;
            }
            
            if (!inVlanSection) continue;
            if (line.trim() === '') break;
            
            const match = line.match(/^(\d+)\s+(\S+)\s+(\w+)\s+(.*)$/);
            if (match) {
                const [, vlanId, name, status, ports] = match;
                vlans.push({
                    vlanId: parseInt(vlanId),
                    name: name,
                    status: status.toLowerCase(),
                    ports: ports.split(',').map(p => p.trim()).filter(p => p),
                    type: 'ethernet'
                });
            }
        }
        
        return vlans;
    }

    /**
     * Create new VLAN
     */
    async createVlan(vlanConfig) {
        const normalizedConfig = this.normalizeVlanConfig(vlanConfig);
        
        if (!this.validateVlanId(normalizedConfig.vlanId)) {
            throw new Error(`Invalid VLAN ID: ${normalizedConfig.vlanId}`);
        }

        await this.executeCommand('configure terminal', this.patterns.config_prompt);
        
        try {
            await this.executeCommand(`vlan ${normalizedConfig.vlanId}`, this.patterns.vlan_prompt);
            
            if (normalizedConfig.name) {
                await this.executeCommand(`name ${normalizedConfig.name}`, this.patterns.vlan_prompt);
            }
            
            await this.executeCommand('exit', this.patterns.config_prompt);
            await this.executeCommand('exit', this.patterns.enable_prompt);
            
            return normalizedConfig;
        } catch (error) {
            // Try to exit config mode on error
            try {
                await this.executeCommand('exit');
                await this.executeCommand('exit');
            } catch (exitError) {
                // Ignore exit errors
            }
            throw error;
        }
    }

    /**
     * Update VLAN configuration
     */
    async updateVlan(vlanId, vlanConfig) {
        if (!this.validateVlanId(vlanId)) {
            throw new Error(`Invalid VLAN ID: ${vlanId}`);
        }

        await this.executeCommand('configure terminal', this.patterns.config_prompt);
        
        try {
            await this.executeCommand(`vlan ${vlanId}`, this.patterns.vlan_prompt);
            
            if (vlanConfig.name) {
                await this.executeCommand(`name ${vlanConfig.name}`, this.patterns.vlan_prompt);
            }
            
            await this.executeCommand('exit', this.patterns.config_prompt);
            await this.executeCommand('exit', this.patterns.enable_prompt);
            
            return { vlanId, ...vlanConfig };
        } catch (error) {
            try {
                await this.executeCommand('exit');
                await this.executeCommand('exit');
            } catch (exitError) {
                // Ignore exit errors
            }
            throw error;
        }
    }

    /**
     * Delete VLAN
     */
    async deleteVlan(vlanId) {
        if (!this.validateVlanId(vlanId)) {
            throw new Error(`Invalid VLAN ID: ${vlanId}`);
        }

        if (vlanId === 1) {
            throw new Error('Cannot delete default VLAN 1');
        }

        await this.executeCommand('configure terminal', this.patterns.config_prompt);
        
        try {
            await this.executeCommand(`no vlan ${vlanId}`, this.patterns.config_prompt);
            await this.executeCommand('exit', this.patterns.enable_prompt);
            return true;
        } catch (error) {
            try {
                await this.executeCommand('exit');
            } catch (exitError) {
                // Ignore exit errors
            }
            throw error;
        }
    }

    /**
     * Get all switch ports
     */
    async getPorts() {
        const output = await this.executeCommand('show interfaces status');
        return this.parseInterfaceStatus(output);
    }

    /**
     * Parse interface status output
     */
    parseInterfaceStatus(output) {
        const ports = [];
        const lines = output.split('\n');
        
        let inPortSection = false;
        
        for (const line of lines) {
            if (line.includes('Port') && line.includes('Status')) {
                inPortSection = true;
                continue;
            }
            
            if (!inPortSection) continue;
            if (line.trim() === '') continue;
            
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6) {
                const [port, description, status, vlan, duplex, speed, type] = parts;
                ports.push({
                    portId: port,
                    description: description === '' ? null : description,
                    status: status.toLowerCase(),
                    vlan: vlan === 'trunk' ? null : parseInt(vlan),
                    mode: vlan === 'trunk' ? 'trunk' : 'access',
                    duplex,
                    speed,
                    type
                });
            }
        }
        
        return ports;
    }

    /**
     * Configure port VLAN settings
     */
    async configurePort(portId, portConfig) {
        if (!this.validatePortId(portId)) {
            throw new Error(`Invalid port ID: ${portId}`);
        }

        const normalizedConfig = this.normalizePortConfig(portConfig);
        
        await this.executeCommand('configure terminal', this.patterns.config_prompt);
        
        try {
            await this.executeCommand(`interface ${portId}`, this.patterns.interface_prompt);
            
            if (normalizedConfig.mode === 'access') {
                await this.executeCommand('switchport mode access', this.patterns.interface_prompt);
                if (normalizedConfig.accessVlan !== 1) {
                    await this.executeCommand(`switchport access vlan ${normalizedConfig.accessVlan}`, this.patterns.interface_prompt);
                }
            } else if (normalizedConfig.mode === 'trunk') {
                await this.executeCommand('switchport mode trunk', this.patterns.interface_prompt);
                if (normalizedConfig.nativeVlan !== 1) {
                    await this.executeCommand(`switchport trunk native vlan ${normalizedConfig.nativeVlan}`, this.patterns.interface_prompt);
                }
                if (normalizedConfig.allowedVlans.length > 0) {
                    await this.executeCommand(`switchport trunk allowed vlan ${normalizedConfig.allowedVlans.join(',')}`, this.patterns.interface_prompt);
                }
            }
            
            if (normalizedConfig.description) {
                await this.executeCommand(`description ${normalizedConfig.description}`, this.patterns.interface_prompt);
            }
            
            await this.executeCommand('exit', this.patterns.config_prompt);
            await this.executeCommand('exit', this.patterns.enable_prompt);
            
            return { portId, ...normalizedConfig };
        } catch (error) {
            try {
                await this.executeCommand('exit');
                await this.executeCommand('exit');
            } catch (exitError) {
                // Ignore exit errors
            }
            throw error;
        }
    }

    /**
     * Configure trunk port
     */
    async configureTrunk(portId, trunkConfig) {
        return this.configurePort(portId, { mode: 'trunk', ...trunkConfig });
    }

    /**
     * Save configuration
     */
    async saveConfiguration() {
        try {
            await this.executeCommand('write memory');
            return true;
        } catch (error) {
            this.log('error', 'Failed to save configuration', { error: error.message });
            return false;
        }
    }
}

module.exports = CiscoCatalystAdapter;