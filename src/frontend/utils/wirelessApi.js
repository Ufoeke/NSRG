/**
 * Wireless API Service
 * Handles all API communications for wireless coverage areas and bandwidth policies
 */

const API_BASE_URL = 'http://localhost:3001/api/wireless';

class WirelessApiService {
  /**
   * Generic request handler with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Coverage Areas API Methods
  
  /**
   * Get all coverage areas
   * @param {Object} filters - Optional filters (status, coverage, limit, offset)
   * @returns {Promise<Object>} Response with data and meta information
   */
  async getCoverageAreas(filters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/coverage-areas${queryString ? `?${queryString}` : ''}`;
    
    return this.request(endpoint);
  }

  /**
   * Get specific coverage area by ID
   * @param {string} id - Coverage area ID
   * @returns {Promise<Object>} Coverage area data
   */
  async getCoverageArea(id) {
    return this.request(`/coverage-areas/${id}`);
  }

  /**
   * Create new coverage area
   * @param {Object} coverageData - Coverage area configuration
   * @returns {Promise<Object>} Created coverage area
   */
  async createCoverageArea(coverageData) {
    return this.request('/coverage-areas', {
      method: 'POST',
      body: JSON.stringify(coverageData),
    });
  }

  /**
   * Update existing coverage area
   * @param {string} id - Coverage area ID
   * @param {Object} coverageData - Updated coverage area data
   * @returns {Promise<Object>} Updated coverage area
   */
  async updateCoverageArea(id, coverageData) {
    return this.request(`/coverage-areas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(coverageData),
    });
  }

  /**
   * Delete coverage area
   * @param {string} id - Coverage area ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteCoverageArea(id) {
    return this.request(`/coverage-areas/${id}`, {
      method: 'DELETE',
    });
  }

  // Bandwidth Policies API Methods

  /**
   * Get all bandwidth policies
   * @param {Object} filters - Optional filters (priority, qosClass, limit, offset)
   * @returns {Promise<Object>} Response with data and meta information
   */
  async getBandwidthPolicies(filters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/bandwidth-policies${queryString ? `?${queryString}` : ''}`;
    
    return this.request(endpoint);
  }

  /**
   * Get specific bandwidth policy by ID
   * @param {string} id - Bandwidth policy ID
   * @returns {Promise<Object>} Bandwidth policy data
   */
  async getBandwidthPolicy(id) {
    return this.request(`/bandwidth-policies/${id}`);
  }

  /**
   * Create new bandwidth policy
   * @param {Object} policyData - Bandwidth policy configuration
   * @returns {Promise<Object>} Created bandwidth policy
   */
  async createBandwidthPolicy(policyData) {
    return this.request('/bandwidth-policies', {
      method: 'POST',
      body: JSON.stringify(policyData),
    });
  }

  /**
   * Update existing bandwidth policy
   * @param {string} id - Bandwidth policy ID
   * @param {Object} policyData - Updated bandwidth policy data
   * @returns {Promise<Object>} Updated bandwidth policy
   */
  async updateBandwidthPolicy(id, policyData) {
    return this.request(`/bandwidth-policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(policyData),
    });
  }

  /**
   * Delete bandwidth policy
   * @param {string} id - Bandwidth policy ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  async deleteBandwidthPolicy(id) {
    return this.request(`/bandwidth-policies/${id}`, {
      method: 'DELETE',
    });
  }

  // Utility Methods

  /**
   * Validate coverage area configuration
   * @param {Object} coverageData - Coverage area data to validate
   * @returns {Object} Validation result with errors if any
   */
  validateCoverageArea(coverageData) {
    const errors = {};

    if (!coverageData.name || coverageData.name.trim().length === 0) {
      errors.name = 'Coverage area name is required';
    }

    if (!coverageData.location || coverageData.location.trim().length === 0) {
      errors.location = 'Location is required';
    }

    if (!coverageData.areaSize || coverageData.areaSize.trim().length === 0) {
      errors.areaSize = 'Area size is required';
    }

    if (!coverageData.userDensity || coverageData.userDensity.trim().length === 0) {
      errors.userDensity = 'User density is required';
    }

    if (!['indoor', 'outdoor'].includes(coverageData.coverage)) {
      errors.coverage = 'Coverage type must be indoor or outdoor';
    }

    if (!['2.4GHz', '5GHz', '6GHz'].includes(coverageData.frequency)) {
      errors.frequency = 'Frequency must be 2.4GHz, 5GHz, or 6GHz';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Validate bandwidth policy configuration
   * @param {Object} policyData - Bandwidth policy data to validate
   * @returns {Object} Validation result with errors if any
   */
  validateBandwidthPolicy(policyData) {
    const errors = {};

    if (!policyData.name || policyData.name.trim().length === 0) {
      errors.name = 'Policy name is required';
    }

    if (!policyData.description || policyData.description.trim().length === 0) {
      errors.description = 'Policy description is required';
    }

    if (!['low', 'medium', 'high', 'critical'].includes(policyData.priority)) {
      errors.priority = 'Priority must be low, medium, high, or critical';
    }

    if (!['basic', 'standard', 'premium'].includes(policyData.qosClass)) {
      errors.qosClass = 'QoS class must be basic, standard, or premium';
    }

    // Validate bandwidth limits if specified
    if (policyData.downloadLimit && policyData.downloadLimit !== 'unlimited') {
      const downloadMatch = policyData.downloadLimit.match(/^(\d+)\s*(kbps|mbps|gbps)$/i);
      if (!downloadMatch) {
        errors.downloadLimit = 'Download limit must be in format "100 Mbps" or "unlimited"';
      }
    }

    if (policyData.uploadLimit && policyData.uploadLimit !== 'unlimited') {
      const uploadMatch = policyData.uploadLimit.match(/^(\d+)\s*(kbps|mbps|gbps)$/i);
      if (!uploadMatch) {
        errors.uploadLimit = 'Upload limit must be in format "100 Mbps" or "unlimited"';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}

// Export singleton instance
export default new WirelessApiService(); 