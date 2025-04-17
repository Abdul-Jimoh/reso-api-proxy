const fetch = require('node-fetch');
const qs = require('querystring');

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
    
    // Check if this is a request for a single property
    if (params.listingKey) {
        return await getPropertyDetails(params.listingKey, headers);
    }
    
    // Otherwise, this is a request for multiple properties by city
    const city = params.city || 'Oakville';

    try {
        // First, get an access token
        const tokenData = qs.stringify({
            grant_type: 'client_credentials',
            client_id: process.env.REALTOR_CLIENT_ID || 'hoYRuPpznnXKuroH4jCogKaa',
            client_secret: process.env.REALTOR_CLIENT_SECRET || 'jwm634mpqMVDaDRsaDW6vysm',
            scope: 'DDFApi_Read',
        });

        const tokenResponse = await fetch('https://identity.crea.ca/connect/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenData,
        });

        if (!tokenResponse.ok) {
            throw new Error(`Authentication failed: ${tokenResponse.status}`);
        }

        const tokenResult = await tokenResponse.json();
        const accessToken = tokenResult.access_token;

        // Build the property query URL with the city parameter
        const endpoint = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=City eq '${city}' and StandardStatus eq 'Active' and ListPrice ne null and OriginalEntryTimestamp gt 2025-04-10T09:50:00Z&$select=ListingKey,PropertySubType,CommonInterest,City,Media,ListPrice,BedroomsTotal,BathroomsTotalInteger,UnparsedAddress,StateOrProvince,ListingURL,TotalActualRent,LeaseAmountFrequency,LivingArea,ListAgentKey,ListOfficeKey,OriginalEntryTimestamp,ModificationTimestamp,StatusChangeTimestamp&$count=true&$orderby=OriginalEntryTimestamp desc`;

        // Make the authenticated request to the Realtor API
        const propertyResponse = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Parse the JSON response
        const data = await propertyResponse.json();

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
            body: JSON.stringify({ error: 'Failed to fetch data from Realtor API: ' + error.message })
        };
    }
};

// Function to get detailed property information by ListingKey
async function getPropertyDetails(listingKey, headers) {
    try {
        // Get access token
        const tokenData = qs.stringify({
            grant_type: 'client_credentials',
            client_id: process.env.REALTOR_CLIENT_ID || 'hoYRuPpznnXKuroH4jCogKaa',
            client_secret: process.env.REALTOR_CLIENT_SECRET || 'jwm634mpqMVDaDRsaDW6vysm',
            scope: 'DDFApi_Read',
        });

        const tokenResponse = await fetch('https://identity.crea.ca/connect/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenData,
        });

        if (!tokenResponse.ok) {
            throw new Error(`Authentication failed: ${tokenResponse.status}`);
        }

        const tokenResult = await tokenResponse.json();
        const accessToken = tokenResult.access_token;

        // Build the property query URL with the ListingKey parameter
        // Expand the $select to include more detailed information
        const endpoint = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=ListingKey eq '${listingKey}'`;

        // Make the authenticated request to the Realtor API
        const propertyResponse = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Parse the JSON response
        const data = await propertyResponse.json();

        // Return successful response to the client
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        // Log the error server-side
        console.log('Error fetching property details:', error);

        // Return error response to the client
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch property details: ' + error.message })
        };
    }
}