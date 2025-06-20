const fetch = require('node-fetch');
const qs = require('querystring');

// Helper function to get the access token
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
        let filterParts = []; // Use an array to build the filter safely

        // --- Step 1: Establish the BASE filter (Office, City, or General Active) ---
        if (params.featuredOfficeKey) {
            filterParts.push(`ListOfficeKey eq '${params.featuredOfficeKey.replace(/'/g, "''")}'`);
        } else if (params.city) {
            filterParts.push(`City eq '${params.city.replace(/'/g, "''")}'`);
        }

        // --- Step 2: Append secondary filters that apply to ALL searches ---
        if (params.minLat && params.minLng && params.maxLat && params.maxLng) {
            filterParts.push(`(Latitude ge ${params.minLat} and Latitude le ${params.maxLat} and Longitude ge ${params.minLng} and Longitude le ${params.maxLng})`);
        }

        if (params.transactionType) {
            // If a type is EXPLICITLY selected (e.g., from radio button), filter by it.
            if (params.transactionType === 'For Sale') { filterParts.push(`ListPrice ne null`); }
            else if (params.transactionType === 'For Rent') { filterParts.push(`TotalActualRent ne null`); }
        } 
        // else {
        //     // If NO type is selected, the default behavior depends on the context.
        //     if (params.featuredOfficeKey) {
        //         // For the initial featured office view, show BOTH for-sale AND for-rent properties.
        //         filterParts.push(`(ListPrice ne null or TotalActualRent ne null)`);
        //     } else {
        //         // For a general search, default to showing only properties FOR SALE.
        //         filterParts.push(`ListPrice ne null`);
        //     }
        // }

        if (params.bedrooms && params.bedrooms !== 'Any') {
            if (params.bedrooms.includes('+')) { filterParts.push(`BedroomsTotal ge ${parseInt(params.bedrooms)}`); }
            else { filterParts.push(`BedroomsTotal eq ${parseInt(params.bedrooms)}`); }
        }
        if (params.bathrooms && params.bathrooms !== 'Any') {
            if (params.bathrooms.includes('+')) { filterParts.push(`BathroomsTotalInteger ge ${parseInt(params.bathrooms)}`); }
            else { filterParts.push(`BathroomsTotalInteger eq ${parseInt(params.bathrooms)}`); }
        }
        if (params.minPrice && params.minPrice !== '0.00' && params.minPrice !== '0') { filterParts.push(`ListPrice ge ${params.minPrice}`); }
        if (params.maxPrice && params.maxPrice !== '0.00' && params.maxPrice !== '0') { filterParts.push(`ListPrice le ${params.maxPrice}`); }
        if (params.propertyType && params.propertyType !== 'Any') { filterParts.push(`PropertySubType eq '${params.propertyType}'`); }
        if (params.buildingType && params.buildingType !== 'Any') { filterParts.push(`CommonInterest eq '${params.buildingType}'`); }
        if (params.garage && params.garage !== 'Any') { filterParts.push(`ParkingTotal ge ${params.garage}`); }
        if (params.neighborhood && params.neighborhood !== "" && params.neighborhood.toLowerCase() !== "any" && params.neighborhood.toLowerCase() !== "or select a neighbourhood") {
            const neighborhoodName = params.neighborhood.replace(/'/g, "''");
            filterParts.push(`SubdivisionName eq '${neighborhoodName}'`);
        }

        // Add universal status filter to ensure we only get listings currently on the market.
        // filterParts.push(`StandardStatus eq 'Active'`);

        // Finalize filter string
        const filterString = filterParts.join(' and ');
        
        // --- PAGINATION & SINGLE FETCH LOGIC ---
        const ddfPageSize = 100;
        const ddfPageToFetch = params.ddfPage ? parseInt(params.ddfPage, 10) : 1;
        const skip = (ddfPageToFetch - 1) * ddfPageSize;

        const selectFields = "ListingKey,PropertySubType,CommonInterest,City,Media,ListPrice,BedroomsTotal,BathroomsTotalInteger,UnparsedAddress,StateOrProvince,ListingURL,TotalActualRent,LeaseAmountFrequency,LivingArea,ListAgentKey,ListOfficeKey,OriginalEntryTimestamp,ModificationTimestamp,StatusChangeTimestamp,SubdivisionName";
        let ddfApiUrl = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${encodeURIComponent(filterString)}&$select=${selectFields}&$orderby=OriginalEntryTimestamp desc&$top=${ddfPageSize}&$skip=${skip}`;
        
        if (ddfPageToFetch === 1) {
            ddfApiUrl += `&$count=true`;
        }

        const propertyResponse = await fetch(ddfApiUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } });

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
        let totalCount = null;
        if (ddfPageToFetch === 1 && ddfPageData['@odata.count']) {
            totalCount = parseInt(ddfPageData['@odata.count'], 10);
        }
        
        if (limit && limit > 0 && fetchedProperties.length > limit) {
            fetchedProperties = fetchedProperties.slice(0, limit);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                value: fetchedProperties,
                totalCount: totalCount,
                ddfPageFetched: ddfPageToFetch,
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