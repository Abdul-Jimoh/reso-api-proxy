const fetch = require('node-fetch');
const qs = require('querystring');

// Helper function to get the access token, makes the main handler cleaner
async function getAccessToken() {
    const tokenData = qs.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.REALTOR_CLIENT_ID || 'hoYRuPpznnXKuroH4jCogKaa',
        client_secret: process.env.REALTOR_CLIENT_SECRET || 'jwm634mpqMVDaDRsaDW6vysm',
        scope: 'DDFApi_Read',
    });
    const tokenResponse = await fetch('https://identity.crea.ca/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenData,
    });
    if (!tokenResponse.ok) {
        throw new Error(`Authentication failed: ${tokenResponse.status}`);
    }
    const tokenResult = await tokenResponse.json();
    return tokenResult.access_token;
}

exports.handler = async function (event) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    const params = event.queryStringParameters || {};
    const limit = params.limit ? parseInt(params.limit) : null;

    if (params.listingKey) {
        return await getPropertyDetails(params.listingKey, headers);
    }

    try {
        const accessToken = await getAccessToken();
        let filterString = '';

        // --- FILTER LOGIC (Determines WHAT to search for) ---
        if (params.featuredOfficeKey) {
            // Priority 1: Handle request for client's featured listings
            filterString = `ListOfficeKey eq '${params.featuredOfficeKey.replace(/'/g, "''")}' and StandardStatus eq 'Active'`;
        } else {
            // Priority 2: Handle regular filtered searches
            if (params.city) {
                filterString = `City eq '${params.city.replace(/'/g, "''")}'`;
            } else {
                filterString = `StandardStatus eq 'Active'`; // Default if no city
            }
        }
        // Append all other applicable filters
        if (params.minLat && params.minLng && params.maxLat && params.maxLng) {
            if (filterString) filterString += ` and `;
            filterString += `Latitude ge ${params.minLat} and Latitude le ${params.maxLat} and Longitude ge ${params.minLng} and Longitude le ${params.maxLng}`;
        }
        if (params.transactionType) {
            if (params.transactionType === 'For Sale') { filterString += ` and ListPrice ne null`; }
            else if (params.transactionType === 'For Rent') { filterString += ` and TotalActualRent ne null`; }
        } else {
            filterString += ` and ListPrice ne null`;
        }
        if (params.bedrooms && params.bedrooms !== 'Any') {
            if (params.bedrooms.includes('+')) { filterString += ` and BedroomsTotal ge ${parseInt(params.bedrooms)}`; }
            else { filterString += ` and BedroomsTotal eq ${parseInt(params.bedrooms)}`; }
        }
        if (params.bathrooms && params.bathrooms !== 'Any') {
            if (params.bathrooms.includes('+')) { filterString += ` and BathroomsTotalInteger ge ${parseInt(params.bathrooms)}`; }
            else { filterString += ` and BathroomsTotalInteger eq ${parseInt(params.bathrooms)}`; }
        }
        if (params.minPrice && params.minPrice !== '0.00' && params.minPrice !== '0') { filterString += ` and ListPrice ge ${params.minPrice}`; }
        if (params.maxPrice && params.maxPrice !== '0.00' && params.maxPrice !== '0') { filterString += ` and ListPrice le ${params.maxPrice}`; }
        if (params.propertyType && params.propertyType !== 'Any') { filterString += ` and PropertySubType eq '${params.propertyType}'`; }
        if (params.buildingType && params.buildingType !== 'Any') { filterString += ` and CommonInterest eq '${params.buildingType}'`; }
        if (params.garage && params.garage !== 'Any') { filterString += ` and ParkingTotal ge ${params.garage}`; }
        if (params.neighborhood && params.neighborhood !== "" && params.neighborhood.toLowerCase() !== "any" && params.neighborhood.toLowerCase() !== "or select a neighbourhood") {
            const neighborhoodName = params.neighborhood.replace(/'/g, "''");
            filterString += ` and SubdivisionName eq '${neighborhoodName}'`;
        }
        // Date filter applies to all regular searches
        filterString += ` and OriginalEntryTimestamp ge 2024-01-01T00:00:00Z`;


        // --- PAGINATION & SINGLE FETCH LOGIC ---

        const ddfPageSize = 100;
        const ddfPageToFetch = params.ddfPage ? parseInt(params.ddfPage, 10) : 1;
        const skip = (ddfPageToFetch - 1) * ddfPageSize;

        const selectFields = "ListingKey,PropertySubType,CommonInterest,City,Media,ListPrice,BedroomsTotal,BathroomsTotalInteger,UnparsedAddress,StateOrProvince,ListingURL,TotalActualRent,LeaseAmountFrequency,LivingArea,ListAgentKey,ListOfficeKey,OriginalEntryTimestamp,ModificationTimestamp,StatusChangeTimestamp,SubdivisionName";
        let ddfApiUrl = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${encodeURIComponent(filterString)}&$select=${selectFields}&$orderby=OriginalEntryTimestamp desc&$top=${ddfPageSize}&$skip=${skip}`;

        // Only get the total count for the entire query on the FIRST page request to be efficient
        if (ddfPageToFetch === 1) {
            ddfApiUrl += `&$count=true`;
        }

        console.log(`Requesting DDF API (Page ${ddfPageToFetch}): ${ddfApiUrl}`);
        const propertyResponse = await fetch(ddfApiUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });

        if (!propertyResponse.ok) {
            const errorText = await propertyResponse.text();
            throw new Error(`DDF API request failed: ${propertyResponse.status} - ${errorText}`);
        }

        const ddfPageData = await propertyResponse.json();
        let fetchedProperties = ddfPageData.value || [];

        // --- SORTING LOGIC FOR FEATURED ---
        const featuredAgentKey = params.featuredAgentKey;
        if (params.featuredOfficeKey && featuredAgentKey && fetchedProperties.length > 0) {
            fetchedProperties.sort((a, b) => {
                const aIsAgent = a.ListAgentKey === featuredAgentKey;
                const bIsAgent = b.ListAgentKey === featuredAgentKey;
                if (aIsAgent && !bIsAgent) return -1;
                if (!aIsAgent && bIsAgent) return 1;
                return 0;
            });
        }

        // --- RESPONSE TO CLIENT ---
        let totalCount = null; // Default to null
        if (ddfPageToFetch === 1 && ddfPageData['@odata.count']) {
            totalCount = parseInt(ddfPageData['@odata.count'], 10);
        }

        // Apply client-side 'limit' (for homepage featured widget)
        if (limit && limit > 0 && fetchedProperties.length > limit) {
            fetchedProperties = fetchedProperties.slice(0, limit);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                value: fetchedProperties,       // Properties for this DDF page
                totalCount: totalCount,         // Overall total count, only sent with DDF page 1 response
                ddfPageFetched: ddfPageToFetch, // The DDF page number that was fetched
            })
        };

    } catch (error) {
        console.error('Error in exports.handler:', error);
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