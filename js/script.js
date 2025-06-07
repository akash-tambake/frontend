document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    let capturing = false;
    let intervalId;
    let map; // Declare map in the global scope
    let markerLayer; // Declare markerLayer
    let regionLayer; // Declare regionLayer

    // Check if required elements exist
    if (!video || !startBtn || !stopBtn) {
        console.error("Required elements not found in the DOM.");
        return;
    }

    console.log("All required elements found in the DOM.");

    // Access camera
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            console.log("Camera stream started successfully.");

            // Delay map initialization to avoid conflicts
            setTimeout(() => {
                map = L.map("map").setView([15.3173, 75.7139], 6); // Initialize map in the global scope
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "© OpenStreetMap contributors",
                }).addTo(map);

                // Initialize markerLayer and regionLayer
                markerLayer = L.layerGroup().addTo(map);
                regionLayer = L.layerGroup().addTo(map);

                console.log("Map and layers initialized successfully.");
            }, 1000); // Delay of 1 second
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
            alert("Unable to access the camera. Please check permissions.");
        });

    // Start button functionality
    startBtn.addEventListener('click', () => {
        console.log("Start button pressed.");
        startBtn.disabled = true;
        stopBtn.disabled = false;
        capturing = true;

        fetch('/start_capture', { method: 'POST' })
            .then(response => response.json())
            .then(data => console.log('Start capture response:', data))
            .catch(err => console.error('Error starting capture:', err));

        intervalId = setInterval(() => {
            captureImage(video, canvas, context);
        }, 3000);
    });

    // Stop button functionality
    stopBtn.addEventListener('click', () => {
        console.log("Stop button pressed.");
        startBtn.disabled = false;
        stopBtn.disabled = true;
        capturing = false;
        clearInterval(intervalId);

        fetch('/stop_capture', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                console.log('Stop capture response:', data);
                displayResults(data.results, data.insights);
            })
            .catch(err => console.error('Error stopping capture:', err));
    });

    // Capture image function
    function captureImage(video, canvas, context) {
        if (!capturing) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        navigator.geolocation.getCurrentPosition(
            position => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                fetch('/capture', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: imageData, latitude, longitude })
                })
                    .then(response => response.json())
                    .then(data => console.log('Capture response:', data))
                    .catch(err => console.error('Capture error:', err));
            },
            err => console.error("Geolocation error:", err)
        );
    }

 function displayResults(results, insights) {
    console.log('Displaying results:', results, 'Insights:', insights);

    // Clear previous results and layers
    let resultsDiv = document.getElementById('results');
    let insightsDiv = document.getElementById('insights');
    resultsDiv.innerHTML = '';
    markerLayer.clearLayers();

    // Store data for regions
    heatmapData = results.map(result => ({
        latitude: result.latitude,
        longitude: result.longitude,
        prediction: result.prediction,
        confidence: result.confidence
    }));

    // Display insights
    insightsDiv.innerHTML = insights || '<strong>No insights available</strong>';
    console.log('Insights displayed:', insights);

    // Add markers for each result
    results.forEach(result => {
        console.log('Processing result:', result);
        let div = document.createElement('div');
       div.className = 'result-card'; // Apply result-card class
        div.innerHTML = `
            <div class="card-content">
                <img src="${result.image_url}" class="card-image" alt="Plant Image">
                <div class="card-text">
                    <h3>${result.prediction}</h3>
                    <p>Confidence: ${(result.confidence * 100).toFixed(2)}%</p>
                    <p>Location: (${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)})</p>
                </div>
            </div>
        `;
        resultsDiv.appendChild(div);

        // Add marker to the map
        // const fertilizer = diseaseFertilizerMap[result.prediction.toLowerCase()] || diseaseFertilizerMap['default'];
        // L.marker([result.latitude, result.longitude])
        //     .addTo(markerLayer)
        //     .bindPopup(`
        //         <b>Prediction:</b> ${result.prediction}<br>
        //         <b>Confidence:</b> ${(result.confidence * 100).toFixed(2)}%<br>
        //         <b>Location:</b> (${result.latitude}, ${result.longitude})<br>
        //         // <b>Treatment:</b> ${fertilizer}<br>
        //         <img src="${result.image_url}" width="150">
        //     `);


        L.marker([result.latitude, result.longitude])
            .addTo(markerLayer)
            .bindPopup(`
                <b>Prediction:</b> ${result.prediction}<br>
                <b>Confidence:</b> ${(result.confidence * 100).toFixed(2)}%<br>
                <b>Location:</b> (${result.latitude}, ${result.longitude})<br>
                <img src="${result.image_url}" width="150">
            `);
    });

    // Center the map on the average location
    if (results.length > 0) {
        const avgLat = results.reduce((sum, r) => sum + r.latitude, 0) / results.length;
        const avgLon = results.reduce((sum, r) => sum + r.longitude, 0) / results.length;
        map.setView([avgLat, avgLon], 15);
        map.invalidateSize();
        console.log('Map centered at:', [avgLat, avgLon]);
    }

    // Render regions if enabled
    // if (showingRegions) {
    //     renderRegions();
    //     map.addLayer(regionLayer);
    //     console.log('Region layer re-added after results');
    // }
}

function computeConvexHull(points) {
    if (points.length < 3) return points;

    points.sort((a, b) => a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]);

    const hull = [];
    let i = 0;
    const n = points.length;

    for (i = 0; i < n; i++) {
        while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], points[i]) <= 0) {
            hull.pop();
        }
        hull.push(points[i]);
    }

    const t = hull.length + 1;
    for (i = n - 1; i >= 0; i--) {
        while (hull.length >= t && cross(hull[hull.length - 2], hull[hull.length - 1], points[i]) <= 0) {
            hull.pop();
        }
        hull.push(points[i]);
    }

    hull.pop();
    return hull;

    function cross(o, a, b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
}

function renderRegions() {
    console.log('Rendering regions with data:', heatmapData);

    regionLayer.clearLayers();

    if (heatmapData.length === 0) {
        console.warn('No data available for regions');
        return;
    }

    const healthyPoints = heatmapData
        .filter(data => data.prediction.toLowerCase() === 'healthy')
        .map(data => [data.latitude, data.longitude]);
    const diseasePoints = heatmapData
        .filter(data => data.prediction.toLowerCase() !== 'healthy')
        .map(data => ({ lat: data.latitude, lon: data.longitude, prediction: data.prediction, confidence: data.confidence }));

    console.log('Healthy points:', healthyPoints);
    console.log('Disease points:', diseasePoints);

    if (healthyPoints.length > 0) {
        let hullPoints = healthyPoints;
        if (healthyPoints.length >= 3) {
            hullPoints = computeConvexHull(healthyPoints);
        } else if (healthyPoints.length === 2) {
            const [p1, p2] = healthyPoints;
            hullPoints = [
                [p1[0] - 0.0001, p1[1] - 0.0001],
                [p1[0] + 0.0001, p1[1] + 0.0001],
                [p2[0] + 0.0001, p2[1] + 0.0001],
                [p2[0] - 0.0001, p2[1] - 0.0001]
            ];
        } else {
            const [p] = healthyPoints;
            hullPoints = [
                [p[0] - 0.0001, p[1] - 0.0001],
                [p[0] + 0.0001, p[1] - 0.0001],
                [p[0] + 0.0001, p[1] + 0.0001],
                [p[0] - 0.0001, p[1] + 0.0001]
            ];
        }

        const healthyPolygon = L.polygon(hullPoints, {
            color: 'green',
            fillColor: 'green',
            fillOpacity: 0.5,
            weight: 2
        }).addTo(regionLayer).bindPopup('Healthy Region');

        console.log('Healthy polygon added with points:', hullPoints);
    }

    diseasePoints.forEach(point => {
        const isHighConfidence = point.confidence >= 0.95;
        const fertilizer = diseaseFertilizerMap[point.prediction.toLowerCase()] || diseaseFertilizerMap['default'];
        const circle = L.circle([point.lat, point.lon], {
            radius: isHighConfidence ? 50 : 30,
            color: isHighConfidence ? 'red' : 'yellow',
            fillColor: isHighConfidence ? 'red' : 'yellow',
            fillOpacity: isHighConfidence ? 0.8 : 0.6,
            weight: 2
        }).addTo(regionLayer).bindPopup(
            `<b>${point.prediction}</b><br>Confidence: ${(point.confidence * 100).toFixed(2)}%<br><b>Treatment:</b> ${fertilizer}`
        );

        console.log(`Disease circle added: ${point.prediction} at [${point.lat}, ${point.lon}]`);
    });

    if (heatmapData.length > 0) {
        const avgLat = heatmapData.reduce((sum, d) => sum + d.latitude, 0) / heatmapData.length;
        const avgLon = heatmapData.reduce((sum, d) => sum + d.longitude, 0) / heatmapData.length;
        map.setView([avgLat, avgLon], 15);
        console.log('Map centered at:', [avgLat, avgLon]);
    }

    map.invalidateSize();
}
});



