const fetch = require('node-fetch');
const qs = require('querystring');

exports.handler = async function (event) {
    // Setting CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    // Extract query parameters
    const params = event.queryStringParameters || {};

    // Check if this is a request for a single property
    if (params.listingKey) {
        return await getPropertyDetails(params.listingKey, headers);
    }

    // Get city parameter (default to 'Oakville' if not provided)
    const city = params.city || 'Oakville';

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

        // Build the filter string with additional parameters
        let filterString = `City eq '${city}'`;

        // Add transaction type filter
        if (params.transactionType) {
            if (params.transactionType === 'For Sale') {
                filterString += ` and StandardStatus eq 'Active' and ListPrice ne null`;
            } else if (params.transactionType === 'For Rent') {
                filterString += ` and StandardStatus eq 'Active' and TotalActualRent ne null`;
            }
        } else {
            // Default to just active listings if no transaction type specified
            filterString += ` and StandardStatus eq 'Active' and ListPrice ne null`;
        }

        // Add bedroom filter - handle exact vs "plus" values
        if (params.bedrooms && params.bedrooms !== 'Any') {
            // Check if it's a "plus" format (like "2+")
            if (params.bedrooms.includes('+')) {
                const minBeds = parseInt(params.bedrooms);
                filterString += ` and BedroomsTotal ge ${minBeds}`;
            } else {
                // Exact match
                filterString += ` and BedroomsTotal eq ${parseInt(params.bedrooms)}`;
            }
        }

        // Add bathroom filter - handle exact vs "plus" values
        if (params.bathrooms && params.bathrooms !== 'Any') {
            // Check if it's a "plus" format (like "2+")
            if (params.bathrooms.includes('+')) {
                const minBaths = parseInt(params.bathrooms);
                filterString += ` and BathroomsTotalInteger ge ${minBaths}`;
            } else {
                // Exact match
                filterString += ` and BathroomsTotalInteger eq ${parseInt(params.bathrooms)}`;
            }
        }

        // Add min price filter if provided
        if (params.minPrice && params.minPrice !== '0.00') {
            filterString += ` and ListPrice ge ${params.minPrice}`;
        }

        // Add max price filter if provided
        if (params.maxPrice && params.maxPrice !== '0.00' && params.maxPrice !== '0') {
            filterString += ` and ListPrice le ${params.maxPrice}`;
        }

        // Add property type filter if provided
        if (params.propertyType && params.propertyType !== 'Any') {
            filterString += ` and PropertySubType eq '${params.propertyType}'`;
        }

        // Add building type filter if provided (if applicable in your data)
        if (params.buildingType && params.buildingType !== 'Any') {
            filterString += ` and CommonInterest eq '${params.buildingType}'`;
        }

        // Add garage filter if provided
        if (params.garage && params.garage !== 'Any') {
            filterString += ` and ParkingTotal ge ${params.garage}`;
        }

        // Default time constraint
        filterString += ` and OriginalEntryTimestamp gt 2025-04-10T09:50:00Z`;

        // Build the property query URL with all filters
        const endpoint = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${encodeURIComponent(filterString)}&$select=ListingKey,PropertySubType,CommonInterest,City,Media,ListPrice,BedroomsTotal,BathroomsTotalInteger,UnparsedAddress,StateOrProvince,ListingURL,TotalActualRent,LeaseAmountFrequency,LivingArea,ListAgentKey,ListOfficeKey,OriginalEntryTimestamp,ModificationTimestamp,StatusChangeTimestamp&$count=true&$orderby=OriginalEntryTimestamp desc`;

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