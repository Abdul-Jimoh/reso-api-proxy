const fetch = require('node-fetch');

exports.handler = async function (event) {
    // Setting CORS headers to allow cross-origin requests from any domain
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    // Extract query parameters from the request URL
    const params = event.queryStringParameters || {};

    // Default to 'Property' resource if none specified
    const resource = params.resource || 'Property';

    // Build the base endpoint URL
    let endpoint = `https://query.ampre.ca/odata/${resource}`;

    // Add pagination parameter (default to 10 results)
    if (params.top) {
        endpoint += `?$top=${params.top}`;
    } else {
        endpoint += '?$top=10';
    }

    // Add filtering parameters if provided
    if (params.filter) {
        endpoint += `&$filter=${encodeURIComponent(params.filter)}`;
    }

    // Add sorting parameters if provided
    if (params.orderby) {
        endpoint += `&$orderby=${encodeURIComponent(params.orderby)}`;
    }

    // Add relationship expansion if provided
    if (params.expand) {
        endpoint += `&$expand=${encodeURIComponent(params.expand)}`;
    }

    try {
        // Make the authenticated request to the RESO API
        // Using environment variable for security
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${process.env.RESO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        // Parse the JSON response
        const data = await response.json();

        // Return successful response to the client
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        // Log the error server-side
        console.log('Error:', error);

        // Return error response to the client
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch data from RESO API' })
        };
    }
};