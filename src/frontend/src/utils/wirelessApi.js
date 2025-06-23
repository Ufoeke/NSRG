/**
 * Wireless API Service
 * Service layer for wireless coverage areas and bandwidth policies
 */

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api/wireless' 
  : 'http://localhost:5000/api/wireless';

class WirelessApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Helper method for making HTTP requests
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
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
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Coverage Areas API methods
  async getCoverageAreas(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.status) queryParams.append('status', params.status);
    if (params.coverage) queryParams.append('coverage', params.coverage);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);

    const endpoint = `/coverage-areas${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  async getCoverageArea(id) {
    return this.makeRequest(`/coverage-areas/${id}`);
  }

  async createCoverageArea(coverageData) {
    return this.makeRequest('/coverage-areas', {
      method: 'POST',
      body: JSON.stringify(coverageData),
    });
  }

  async updateCoverageArea(id, coverageData) {
    return this.makeRequest(`/coverage-areas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(coverageData),
    });
  }

  async deleteCoverageArea(id) {
    return this.makeRequest(`/coverage-areas/${id}`, {
      method: 'DELETE',
    });
  }

  // Bandwidth Policies API methods
  async getBandwidthPolicies(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.priority) queryParams.append('priority', params.priority);
    if (params.qosClass) queryParams.append('qosClass', params.qosClass);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);

    const endpoint = `/bandwidth-policies${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  async getBandwidthPolicy(id) {
    return this.makeRequest(`/bandwidth-policies/${id}`);
  }

  async createBandwidthPolicy(policyData) {
    return this.makeRequest('/bandwidth-policies', {
      method: 'POST',
      body: JSON.stringify(policyData),
    });
  }

  async updateBandwidthPolicy(id, policyData) {
    return this.makeRequest(`/bandwidth-policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(policyData),
    });
  }

  async deleteBandwidthPolicy(id) {
    return this.makeRequest(`/bandwidth-policies/${id}`, {
      method: 'DELETE',
    });
  }

  // Additional utility methods
  async getSystemStatus() {
    return this.makeRequest('/status');
  }

  async getSSIDs(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.vendor) queryParams.append('vendor', params.vendor);
    if (params.enabled !== undefined) queryParams.append('enabled', params.enabled);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);

    const endpoint = `/ssids${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  async getAccessPoints(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.vendor) queryParams.append('vendor', params.vendor);
    if (params.status) queryParams.append('status', params.status);
    if (params.location) queryParams.append('location', params.location);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);

    const endpoint = `/access-points${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.makeRequest(endpoint);
  }

  // Validation methods for form data
  async validateCoverageArea(coverageData) {
    try {
      // Client-side validation first
      const errors = {};
      
      if (!coverageData.name || coverageData.name.trim().length < 3) {
        errors.name = 'Coverage area name must be at least 3 characters long';
      }
      
      if (!coverageData.location || coverageData.location.trim().length < 3) {
        errors.location = 'Location must be at least 3 characters long';
      }
      
      if (!coverageData.areaSize || isNaN(parseFloat(coverageData.areaSize)) || parseFloat(coverageData.areaSize) <= 0) {
        errors.areaSize = 'Area size must be a positive number';
      }
      
      if (!coverageData.userDensity || isNaN(parseInt(coverageData.userDensity)) || parseInt(coverageData.userDensity) <= 0) {
        errors.userDensity = 'User density must be a positive integer';
      }
      
      if (Object.keys(errors).length > 0) {
        return {
          isValid: false,
          errors
        };
      }
      
      // Server-side validation if client-side passes
      return this.makeRequest('/coverage-areas/validate', {
        method: 'POST',
        body: JSON.stringify(coverageData)
      });
    } catch (error) {
      // If server validation fails, fall back to client validation
      console.warn('Server validation failed, using client-side validation only:', error);
      return {
        isValid: true,
        errors: {}
      };
    }
  }

  async validateBandwidthPolicy(policyData) {
    try {
      // Client-side validation first
      const errors = {};
      
      if (!policyData.name || policyData.name.trim().length < 3) {
        errors.name = 'Policy name must be at least 3 characters long';
      }
      
      if (!policyData.downloadLimit || isNaN(parseFloat(policyData.downloadLimit)) || parseFloat(policyData.downloadLimit) <= 0) {
        errors.downloadLimit = 'Download limit must be a positive number';
      }
      
      if (!policyData.uploadLimit || isNaN(parseFloat(policyData.uploadLimit)) || parseFloat(policyData.uploadLimit) <= 0) {
        errors.uploadLimit = 'Upload limit must be a positive number';
      }
      
      if (!policyData.priority || !['low', 'medium', 'high', 'critical'].includes(policyData.priority)) {
        errors.priority = 'Priority must be one of: low, medium, high, critical';
      }
      
      if (Object.keys(errors).length > 0) {
        return {
          isValid: false,
          errors
        };
      }
      
      // Server-side validation if client-side passes
      return this.makeRequest('/bandwidth-policies/validate', {
        method: 'POST',
        body: JSON.stringify(policyData)
      });
    } catch (error) {
      // If server validation fails, fall back to client validation
      console.warn('Server validation failed, using client-side validation only:', error);
      return {
        isValid: true,
        errors: {}
      };
    }
  }
}

// Create and export a singleton instance
const wirelessApiService = new WirelessApiService();
export default wirelessApiService;

// Export the class for testing purposes
export { WirelessApiService }; 