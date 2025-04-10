const fetch = require('node-fetch');

exports.handler = async function(event) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  // Get query parameters
  const params = event.queryStringParameters || {};
  let endpoint = 'https://query.ampre.ca/odata/Property?$top=10';
  
  // Add any query parameters from the request
  if (params.filter) {
    endpoint += `&$filter=${encodeURIComponent(params.filter)}`;
  }
  
  if (params.orderby) {
    endpoint += `&$orderby=${encodeURIComponent(params.orderby)}`;
  }
  
  try {
    // Make request to RESO API
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${process.env.RESO_API_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    
    // Get response data
    const data = await response.json();
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.log('Error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch properties' })
    };
  }
};