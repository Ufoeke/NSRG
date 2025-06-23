const axios = require('axios');

const API_BASE = 'http://10.0.10.4:5000/api';

async function testAPI() {
  console.log('🚀 Testing NSRG API endpoints...\n');

  try {
    // Test 1: API Status
    console.log('1. Testing API Status...');
    const statusResponse = await axios.get(`${API_BASE}/status`);
    console.log('✅ Status:', statusResponse.data);
    console.log('');

    // Test 2: Login with sample user
    console.log('2. Testing Login...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    console.log('✅ Login successful:', {
      user: loginResponse.data.user,
      hasTokens: !!loginResponse.data.tokens
    });
    
    const accessToken = loginResponse.data.tokens.accessToken;
    console.log('');

    // Test 3: Get Customers (protected endpoint)
    console.log('3. Testing Protected Endpoint (Customers)...');
    const customersResponse = await axios.get(`${API_BASE}/customers`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    console.log('✅ Customers:', customersResponse.data);
    console.log('');

    // Test 4: Get Service Requests (protected endpoint)
    console.log('4. Testing Service Requests...');
    const serviceRequestsResponse = await axios.get(`${API_BASE}/service-requests`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    console.log('✅ Service Requests:', serviceRequestsResponse.data);
    console.log('');

    console.log('🎉 All API tests passed!');

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    } else {
      console.error('❌ Network Error:', error.message);
    }
  }
}

testAPI(); 