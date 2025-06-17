// Global variables
// map is already defined in the HTML
let directionsService;
let directionsRenderer;
let placesService;
let markers = [];
let currentRoute = null;
let scenicRoute = null;
let fastestRoute = null;

// Initialize the application after the map is loaded
function initializeApp() {
    try {
        // Initialize the directions service and renderer
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#3498db',
                strokeWeight: 5
            }
        });

        // Initialize the places service
        placesService = new google.maps.places.PlacesService(map);

        // Add autocomplete to input fields
        setupAutocomplete('start-location');
        setupAutocomplete('end-location');

        // Add event listener to the find route button
        document.getElementById('find-route').addEventListener('click', calculateScenicRoute);
        
        // Add event listener to the send directions button
        document.getElementById('send-directions-btn').addEventListener('click', sendDirectionsToPhone);
        
        console.log('Application initialized successfully');
    } catch (e) {
        console.error('Error initializing application:', e);
        document.getElementById('map-status').innerHTML += '<p style="color: red;">Error initializing application: ' + e.message + '</p>';
    }
}

// Setup Google Places Autocomplete for an input field
function setupAutocomplete(inputId) {
    try {
        const input = document.getElementById(inputId);
        const autocomplete = new google.maps.places.Autocomplete(input);
        autocomplete.setFields(['place_id', 'geometry', 'name']);
    } catch (e) {
        console.error('Error setting up autocomplete:', e);
    }
}

// Calculate a scenic route between two points
function calculateScenicRoute() {
    try {
        // Clear existing markers
        clearMarkers();
        
        // Get input values
        const startLocation = document.getElementById('start-location').value;
        const endLocation = document.getElementById('end-location').value;
        const routePreference = document.getElementById('route-preference').value;
        
        if (!startLocation || !endLocation) {
            alert('Please enter both starting location and destination.');
            return;
        }

        // Request directions for scenic route
        const scenicRequest = {
            origin: startLocation,
            destination: endLocation,
            travelMode: google.maps.TravelMode.DRIVING,
            // For scenic routes, we want to avoid highways when possible
            avoidHighways: true,
            // We can also try to find alternative routes
            provideRouteAlternatives: true
        };
        
        // Request directions for fastest route
        const fastestRequest = {
            origin: startLocation,
            destination: endLocation,
            travelMode: google.maps.TravelMode.DRIVING,
            // Default Google routing algorithm finds the fastest route
        };

        // First get the scenic route
        directionsService.route(scenicRequest, (scenicResult, scenicStatus) => {
            if (scenicStatus === 'OK') {
                // Store the scenic route
                scenicRoute = scenicResult.routes[0];
                
                // Display the scenic route on the map
                directionsRenderer.setDirections(scenicResult);
                
                // Display route information
                displayRouteInfo(scenicRoute);
                
                // Find scenic points along the route based on preference
                findScenicPoints(scenicRoute, routePreference);
                
                // Now get the fastest route for comparison
                directionsService.route(fastestRequest, (fastestResult, fastestStatus) => {
                    if (fastestStatus === 'OK') {
                        // Store the fastest route
                        fastestRoute = fastestResult.routes[0];
                        
                        // Compare the two routes
                        compareRoutes(scenicRoute, fastestRoute);
                    } else {
                        console.error('Failed to calculate fastest route:', fastestStatus);
                        alert('Failed to calculate fastest route: ' + fastestStatus);
                    }
                });
            } else {
                console.error('Directions request failed:', scenicStatus);
                alert('Directions request failed due to ' + scenicStatus);
            }
        });
    } catch (e) {
        console.error('Error calculating route:', e);
        alert('Error calculating route: ' + e.message);
    }
}

// Display information about the route
function displayRouteInfo(route) {
    try {
        // Store the current route for later use
        currentRoute = route;
        
        const routeDetails = document.getElementById('route-details');

        // Calculate total distance and duration
        const totalDistance = calculateTotalDistance(route);
        const totalDuration = calculateTotalDuration(route);

        const legs = route.legs;

        // Convert to miles and hours/minutes
        const distanceMiles = (totalDistance / 1609.34).toFixed(1);
        const hours = Math.floor(totalDuration / 3600);
        const minutes = Math.floor((totalDuration % 3600) / 60);

        // Create HTML content
        let html = `
            <p><strong>Total Distance:</strong> ${distanceMiles} miles</p>
            <p><strong>Estimated Duration:</strong> ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}</p>
            <p><strong>Start Address:</strong> ${legs[0].start_address}</p>
            <p><strong>End Address:</strong> ${legs[legs.length - 1].end_address}</p>
        `;

        routeDetails.innerHTML = html;
        
        // Show the send to phone button
        document.getElementById('send-to-phone').style.display = 'block';
    } catch (e) {
        console.error('Error displaying route info:', e);
    }
}

// Find scenic points along the route based on user preference
function findScenicPoints(route, preference) {
    try {
        const pointsList = document.getElementById('points-list');
        pointsList.innerHTML = '<li>Searching for scenic points...</li>';
        
        // Define search types based on preference
        let searchTypes = [];
        switch (preference) {
            case 'scenic':
                searchTypes = ['park', 'natural_feature', 'point_of_interest'];
                break;
            case 'coastal':
                searchTypes = ['natural_feature', 'park', 'beach'];
                break;
            case 'mountain':
                searchTypes = ['natural_feature', 'park', 'campground'];
                break;
            case 'forest':
                searchTypes = ['park', 'natural_feature', 'campground'];
                break;
            case 'historic':
                searchTypes = ['museum', 'tourist_attraction', 'church', 'historic'];
                break;
            default:
                searchTypes = ['point_of_interest', 'park'];
        }
        
        // Sample points along the route path
        const path = route.overview_path;
        const pointsToSample = Math.min(5, path.length);
        const step = Math.floor(path.length / pointsToSample);
        
        // Clear the points list
        pointsList.innerHTML = '';
        
        // Counter for tracking async requests
        let completedRequests = 0;
        let foundPlaces = [];
        
        // For each sampled point, search for nearby places
        for (let i = 0; i < path.length; i += step) {
            if (i >= path.length) break;
            
            const point = path[i];
            
            // Try each type of place
            searchTypes.forEach(type => {
                const request = {
                    location: point,
                    radius: 5000, // 5km radius
                    type: type
                };
                
                placesService.nearbySearch(request, (results, status) => {
                    completedRequests++;
                    
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        // Filter to avoid duplicates and limit to top results
                        for (let j = 0; j < Math.min(2, results.length); j++) {
                            const place = results[j];
                            
                            // Check if we already have this place
                            if (!foundPlaces.some(p => p.place_id === place.place_id)) {
                                foundPlaces.push(place);
                                
                                // Add to the list
                                const li = document.createElement('li');
                                li.textContent = place.name;
                                li.addEventListener('click', () => {
                                    // Get detailed information about the place
                                    getPlaceDetails(place);
                                });
                                
                                pointsList.appendChild(li);
                            }
                        }
                    }
                    
                    // If all requests are complete and we found no places
                    const totalRequests = Math.min(5, path.length) * searchTypes.length;
                    if (completedRequests >= totalRequests && foundPlaces.length === 0) {
                        pointsList.innerHTML = '<li>No scenic points found along this route. Try a different route preference.</li>';
                    }
                });
            });
        }
        
        // Set up the back button event listener
        document.getElementById('back-to-list').addEventListener('click', () => {
            document.getElementById('points-list-container').style.display = 'block';
            document.getElementById('point-details').style.display = 'none';
        });
        
    } catch (e) {
        console.error('Error finding scenic points:', e);
        document.getElementById('points-list').innerHTML = '<li>Error finding scenic points: ' + e.message + '</li>';
    }
}

// Get detailed information about a place
function getPlaceDetails(place) {
    try {
        // Show loading state
        document.getElementById('points-list-container').style.display = 'none';
        document.getElementById('point-details').style.display = 'block';
        document.getElementById('point-name').textContent = place.name;
        document.getElementById('point-description').textContent = 'Loading details...';
        document.getElementById('point-details-list').innerHTML = '';
        document.getElementById('point-image').style.display = 'none';
        document.getElementById('image-loading').style.display = 'flex';
        document.getElementById('image-error').style.display = 'none';
        
        // Set up the view on map button
        document.getElementById('view-on-map').addEventListener('click', () => {
            // Center the map on this place
            map.setCenter(place.geometry.location);
            map.setZoom(15);
            
            // Create a marker if it doesn't exist
            let marker = markers.find(m => m.getTitle() === place.name);
            if (!marker) {
                marker = new google.maps.Marker({
                    map: map,
                    position: place.geometry.location,
                    title: place.name,
                    animation: google.maps.Animation.DROP
                });
                
                // Add to markers array for later cleanup
                markers.push(marker);
                
                // Create an info window
                const infoWindow = new google.maps.InfoWindow({
                    content: `<div><strong>${place.name}</strong><br>${place.vicinity || ''}</div>`
                });
                
                // Open the info window when marker is clicked
                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
                
                // Open info window immediately
                infoWindow.open(map, marker);
            }
        });
        
        // Set up directions link
        const directionsLink = document.getElementById('directions-to-point');
        const startLocation = currentRoute.legs[0].start_address;
        directionsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startLocation)}&destination=${encodeURIComponent(place.name + ' ' + (place.vicinity || ''))}&travelmode=driving`;
        
        // Request additional details about the place
        const request = {
            placeId: place.place_id,
            fields: ['name', 'rating', 'formatted_phone_number', 'website', 'photos', 'opening_hours', 'reviews', 'price_level', 'formatted_address', 'editorial_summary']
        };
        
        placesService.getDetails(request, (placeDetails, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                // Display place details
                displayPlaceDetails(placeDetails, place);
            } else {
                // Display basic information if detailed request fails
                displayBasicPlaceInfo(place);
                console.error('Error getting place details:', status);
            }
        });
    } catch (e) {
        console.error('Error getting place details:', e);
        document.getElementById('point-description').textContent = 'Error loading details: ' + e.message;
    }
}

// Display detailed information about a place
function displayPlaceDetails(placeDetails, basicPlace) {
    try {
        // Set description
        let description = '';
        if (placeDetails.editorial_summary && placeDetails.editorial_summary.overview) {
            description = placeDetails.editorial_summary.overview;
        } else if (placeDetails.reviews && placeDetails.reviews.length > 0) {
            // Use the first review as a description if no editorial summary
            description = placeDetails.reviews[0].text.substring(0, 200) + '...';
        } else {
            description = `${placeDetails.name} is located at ${placeDetails.formatted_address || basicPlace.vicinity || 'this location'}. It's a great place to visit during your scenic drive.`;
        }
        document.getElementById('point-description').textContent = description;
        
        // Build details list
        const detailsList = document.getElementById('point-details-list');
        detailsList.innerHTML = '';
        
        // Add rating if available
        if (placeDetails.rating) {
            const ratingItem = document.createElement('div');
            ratingItem.className = 'detail-item';
            ratingItem.innerHTML = `
                <span class="detail-label">Rating</span>
                <span class="detail-value">${placeDetails.rating} ★</span>
            `;
            detailsList.appendChild(ratingItem);
        }
        
        // Add phone number if available
        if (placeDetails.formatted_phone_number) {
            const phoneItem = document.createElement('div');
            phoneItem.className = 'detail-item';
            phoneItem.innerHTML = `
                <span class="detail-label">Phone</span>
                <span class="detail-value">${placeDetails.formatted_phone_number}</span>
            `;
            detailsList.appendChild(phoneItem);
        }
        
        // Add website if available
        if (placeDetails.website) {
            const websiteItem = document.createElement('div');
            websiteItem.className = 'detail-item';
            websiteItem.innerHTML = `
                <span class="detail-label">Website</span>
                <span class="detail-value"><a href="${placeDetails.website}" target="_blank">Visit website</a></span>
            `;
            detailsList.appendChild(websiteItem);
        }
        
        // Add address if available
        if (placeDetails.formatted_address) {
            const addressItem = document.createElement('div');
            addressItem.className = 'detail-item';
            addressItem.innerHTML = `
                <span class="detail-label">Address</span>
                <span class="detail-value">${placeDetails.formatted_address}</span>
            `;
            detailsList.appendChild(addressItem);
        }
        
        // Add opening hours if available
        if (placeDetails.opening_hours && placeDetails.opening_hours.weekday_text) {
            const hoursItem = document.createElement('div');
            hoursItem.className = 'detail-item';
            hoursItem.innerHTML = `
                <span class="detail-label">Hours</span>
                <span class="detail-value">${placeDetails.opening_hours.isOpen() ? 'Open now' : 'Closed now'}</span>
            `;
            detailsList.appendChild(hoursItem);
        }
        
        // Display photo if available
        if (placeDetails.photos && placeDetails.photos.length > 0) {
            const photo = placeDetails.photos[0];
            const img = document.getElementById('point-image');
            img.src = photo.getUrl({ maxWidth: 500, maxHeight: 300 });
            img.alt = placeDetails.name;
            img.onload = function() {
                document.getElementById('image-loading').style.display = 'none';
                img.style.display = 'block';
            };
            img.onerror = function() {
                document.getElementById('image-loading').style.display = 'none';
                document.getElementById('image-error').style.display = 'flex';
            };
        } else {
            document.getElementById('image-loading').style.display = 'none';
            document.getElementById('image-error').style.display = 'flex';
        }
    } catch (e) {
        console.error('Error displaying place details:', e);
        document.getElementById('point-description').textContent = 'Error displaying details: ' + e.message;
        document.getElementById('image-loading').style.display = 'none';
        document.getElementById('image-error').style.display = 'flex';
    }
}

// Display basic information about a place when detailed info is not available
function displayBasicPlaceInfo(place) {
    document.getElementById('point-description').textContent = 
        `${place.name} is located near your route. Click "View on Map" to see its exact location.`;
    
    const detailsList = document.getElementById('point-details-list');
    detailsList.innerHTML = '';
    
    // Add vicinity if available
    if (place.vicinity) {
        const addressItem = document.createElement('div');
        addressItem.className = 'detail-item';
        addressItem.innerHTML = `
            <span class="detail-label">Address</span>
            <span class="detail-value">${place.vicinity}</span>
        `;
        detailsList.appendChild(addressItem);
    }
    
    // Add rating if available
    if (place.rating) {
        const ratingItem = document.createElement('div');
        ratingItem.className = 'detail-item';
        ratingItem.innerHTML = `
            <span class="detail-label">Rating</span>
            <span class="detail-value">${place.rating} ★</span>
        `;
        detailsList.appendChild(ratingItem);
    }
    
    document.getElementById('image-loading').style.display = 'none';
    document.getElementById('image-error').style.display = 'flex';
}

// Clear all markers from the map
function clearMarkers() {
    for (let i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
    markers = [];
}

// Compare scenic and fastest routes
function compareRoutes(scenicRoute, fastestRoute) {
    try {
        // Show the comparison section
        document.getElementById('route-comparison').style.display = 'block';
        
        // Calculate scenic route stats
        const scenicDistance = calculateTotalDistance(scenicRoute);
        const scenicDuration = calculateTotalDuration(scenicRoute);
        const scenicDistanceMiles = (scenicDistance / 1609.34).toFixed(1);
        const scenicHours = Math.floor(scenicDuration / 3600);
        const scenicMinutes = Math.floor((scenicDuration % 3600) / 60);
        
        // Calculate fastest route stats
        const fastestDistance = calculateTotalDistance(fastestRoute);
        const fastestDuration = calculateTotalDuration(fastestRoute);
        const fastestDistanceMiles = (fastestDistance / 1609.34).toFixed(1);
        const fastestHours = Math.floor(fastestDuration / 3600);
        const fastestMinutes = Math.floor((fastestDuration % 3600) / 60);
        
        // Calculate differences
        const distanceDifference = scenicDistance - fastestDistance;
        const distanceDifferenceMiles = (distanceDifference / 1609.34).toFixed(1);
        const durationDifference = scenicDuration - fastestDuration;
        const durationDifferenceHours = Math.floor(durationDifference / 3600);
        const durationDifferenceMinutes = Math.floor((durationDifference % 3600) / 60);
        
        // Display scenic route details
        document.getElementById('scenic-route-details').innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Distance:</span>
                <span>${scenicDistanceMiles} miles</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Duration:</span>
                <span>${scenicHours}h ${scenicMinutes}m</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Highways:</span>
                <span>Minimized</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Scenic Value:</span>
                <span class="highlight">High</span>
            </div>
        `;
        
        // Display fastest route details
        document.getElementById('fastest-route-details').innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Distance:</span>
                <span>${fastestDistanceMiles} miles</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Duration:</span>
                <span>${fastestHours}h ${fastestMinutes}m</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Highways:</span>
                <span>Preferred</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Scenic Value:</span>
                <span>Standard</span>
            </div>
        `;
        
        // Display comparison summary
        let summaryHTML = '';
        
        if (distanceDifference > 0) {
            summaryHTML += `<p>The scenic route is <span class="savings">${distanceDifferenceMiles} miles longer</span> than the fastest route.</p>`;
        } else if (distanceDifference < 0) {
            summaryHTML += `<p>The scenic route is actually <span class="highlight">${Math.abs(distanceDifferenceMiles)} miles shorter</span> than the fastest route!</p>`;
        } else {
            summaryHTML += `<p>Both routes have the same distance.</p>`;
        }
        
        if (durationDifference > 0) {
            let timeText = '';
            if (durationDifferenceHours > 0) {
                timeText += `${durationDifferenceHours} hour${durationDifferenceHours > 1 ? 's' : ''}`;
            }
            if (durationDifferenceMinutes > 0) {
                if (timeText) timeText += ' and ';
                timeText += `${durationDifferenceMinutes} minute${durationDifferenceMinutes > 1 ? 's' : ''}`;
            }
            summaryHTML += `<p>Taking the scenic route will add <span class="savings">${timeText}</span> to your journey.</p>`;
        } else if (durationDifference < 0) {
            let timeText = '';
            if (Math.abs(durationDifferenceHours) > 0) {
                timeText += `${Math.abs(durationDifferenceHours)} hour${Math.abs(durationDifferenceHours) > 1 ? 's' : ''}`;
            }
            if (Math.abs(durationDifferenceMinutes) > 0) {
                if (timeText) timeText += ' and ';
                timeText += `${Math.abs(durationDifferenceMinutes)} minute${Math.abs(durationDifferenceMinutes) > 1 ? 's' : ''}`;
            }
            summaryHTML += `<p>The scenic route is actually <span class="highlight">${timeText} faster</span> than the fastest route!</p>`;
        } else {
            summaryHTML += `<p>Both routes take the same amount of time.</p>`;
        }
        
        // Add a recommendation
        if (durationDifference < 600) { // Less than 10 minutes difference
            summaryHTML += `<p><strong>Recommendation:</strong> <span class="highlight">Take the scenic route!</span> The time difference is minimal, and you'll enjoy much better views.</p>`;
        } else if (durationDifference < 1800) { // Less than 30 minutes difference
            summaryHTML += `<p><strong>Recommendation:</strong> <span class="highlight">Consider the scenic route</span> if you have a bit of extra time. The views will be worth it!</p>`;
        } else {
            summaryHTML += `<p><strong>Recommendation:</strong> The scenic route is significantly longer. <span class="highlight">Consider the scenic route</span> if you're not in a hurry and want to enjoy the journey.</p>`;
        }
        
        document.getElementById('route-comparison-summary').innerHTML = summaryHTML;
    } catch (e) {
        console.error('Error comparing routes:', e);
    }
}

// Helper function to calculate total distance of a route
function calculateTotalDistance(route) {
    let totalDistance = 0;
    const legs = route.legs;
    for (let i = 0; i < legs.length; i++) {
        totalDistance += legs[i].distance.value;
    }
    return totalDistance;
}

// Helper function to calculate total duration of a route
function calculateTotalDuration(route) {
    let totalDuration = 0;
    const legs = route.legs;
    for (let i = 0; i < legs.length; i++) {
        totalDuration += legs[i].duration.value;
    }
    return totalDuration;
}

// Function to send directions to phone
function sendDirectionsToPhone() {
    try {
        if (!currentRoute) {
            alert('Please calculate a route first.');
            return;
        }
        
        const qrcodeContainer = document.getElementById('qrcode-container');
        const qrcodeDiv = document.getElementById('qrcode');
        const directionsLink = document.getElementById('directions-link');
        
        // Clear previous QR code
        qrcodeDiv.innerHTML = '';
        
        // Get the start and end locations from the current route
        const start = currentRoute.legs[0].start_address;
        const end = currentRoute.legs[currentRoute.legs.length - 1].end_address;
        
        // Create a Google Maps directions URL
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&travelmode=driving`;
        
        // Generate QR code
        const qrcode = new QRCode(qrcodeDiv, {
            text: directionsUrl,
            width: 200,
            height: 200
        });
        
        // Set the link
        directionsLink.href = directionsUrl;
        directionsLink.textContent = directionsUrl;
        
        // Show the QR code container
        qrcodeContainer.style.display = 'block';
    } catch (e) {
        console.error('Error sending directions to phone:', e);
        alert('Error sending directions to phone: ' + e.message);
    }
}

// Initialize the application after the map is loaded
// This will be called from the HTML after the map loads successfully
initializeApp();