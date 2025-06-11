document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_BASE_URL = "https://xb1kvn4ao8.execute-api.eu-north-1.amazonaws.com/default/Proxy"; // Replace with your actual backend URL

    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    let capturing = false;
    let intervalId;
    let map;
    let markerLayer;
    let regionLayer;
    let heatmapData = [];

    if (!video || !startBtn || !stopBtn) {
        console.error("Required elements not found in the DOM.");
        return;
    }

    // navigator.mediaDevices.getUserMedia({ video: true })
    //     .then(stream => {
    //         video.srcObject = stream;

    //         setTimeout(() => {
    //             map = L.map("map").setView([15.3173, 75.7139], 6);
    //             L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    //                 attribution: "© OpenStreetMap contributors",
    //             }).addTo(map);
    //             markerLayer = L.layerGroup().addTo(map);
    //             regionLayer = L.layerGroup().addTo(map);
    //         }, 1000);
    //     })
    //     .catch(err => {
    //         console.error("Error accessing camera:", err);
    //         alert("Unable to access the camera. Please check permissions.");
    //     });

    navigator.mediaDevices.getUserMedia({
    video: { facingMode: { exact: "environment" } }
    })
    .then(stream => {
        video.srcObject = stream;
    
        setTimeout(() => {
            map = L.map("map").setView([15.3173, 75.7139], 6);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap contributors",
            }).addTo(map);
            markerLayer = L.layerGroup().addTo(map);
            regionLayer = L.layerGroup().addTo(map);
        }, 1000);
    })
    .catch(err => {
        console.error("Error accessing camera:", err);
        alert("Unable to access the camera. Please check permissions.");
    });


    startBtn.addEventListener('click', () => {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        capturing = true;

        fetch(`${BACKEND_BASE_URL}/start_capture`, { method: 'POST' })
            .then(response => response.json())
            .then(data => console.log('Start capture response:', data))
            .catch(err => console.error('Error starting capture:', err));

        intervalId = setInterval(() => {
            captureImage(video, canvas, context);
        }, 3000);
    });

    stopBtn.addEventListener('click', () => {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        capturing = false;
        clearInterval(intervalId);

        fetch(`${BACKEND_BASE_URL}/stop_capture`, { method: 'POST' })
            .then(response => response.json())
            .then(data => displayResults(data.results, data.insights))
            .catch(err => console.error('Error stopping capture:', err));
    });

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

                fetch(`${BACKEND_BASE_URL}/capture`, {
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
        const resultsDiv = document.getElementById('results');
        const insightsDiv = document.getElementById('insights');
        resultsDiv.innerHTML = '';
        markerLayer.clearLayers();

        heatmapData = results.map(result => ({
            latitude: result.latitude,
            longitude: result.longitude,
            prediction: result.prediction,
            confidence: result.confidence
        }));

        insightsDiv.innerHTML = insights || '<strong>No insights available</strong>';

        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'result-card';
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

            L.marker([result.latitude, result.longitude])
                .addTo(markerLayer)
                .bindPopup(`
                    <b>Prediction:</b> ${result.prediction}<br>
                    <b>Confidence:</b> ${(result.confidence * 100).toFixed(2)}%<br>
                    <b>Location:</b> (${result.latitude}, ${result.longitude})<br>
                    <img src="${result.image_url}" width="150">
                `);
        });

        if (results.length > 0) {
            const avgLat = results.reduce((sum, r) => sum + r.latitude, 0) / results.length;
            const avgLon = results.reduce((sum, r) => sum + r.longitude, 0) / results.length;
            map.setView([avgLat, avgLon], 15);
            map.invalidateSize();
        }
    }

    function computeConvexHull(points) {
        if (points.length < 3) return points;

        points.sort((a, b) => a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]);
        const hull = [];

        for (let i = 0; i < points.length; i++) {
            while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], points[i]) <= 0) {
                hull.pop();
            }
            hull.push(points[i]);
        }

        const t = hull.length + 1;
        for (let i = points.length - 1; i >= 0; i--) {
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
        regionLayer.clearLayers();

        if (heatmapData.length === 0) return;

        const healthyPoints = heatmapData
            .filter(data => data.prediction.toLowerCase() === 'healthy')
            .map(data => [data.latitude, data.longitude]);

        const diseasePoints = heatmapData
            .filter(data => data.prediction.toLowerCase() !== 'healthy')
            .map(data => ({ lat: data.latitude, lon: data.longitude, prediction: data.prediction, confidence: data.confidence }));

        if (healthyPoints.length > 0) {
            let hullPoints = healthyPoints.length >= 3
                ? computeConvexHull(healthyPoints)
                : expandToPolygon(healthyPoints);

            L.polygon(hullPoints, {
                color: 'green',
                fillColor: 'green',
                fillOpacity: 0.5,
                weight: 2
            }).addTo(regionLayer).bindPopup('Healthy Region');
        }

        diseasePoints.forEach(point => {
            const isHighConfidence = point.confidence >= 0.95;
            const circle = L.circle([point.lat, point.lon], {
                radius: isHighConfidence ? 50 : 30,
                color: isHighConfidence ? 'red' : 'yellow',
                fillColor: isHighConfidence ? 'red' : 'yellow',
                fillOpacity: isHighConfidence ? 0.8 : 0.6,
                weight: 2
            }).addTo(regionLayer).bindPopup(
                `<b>${point.prediction}</b><br>Confidence: ${(point.confidence * 100).toFixed(2)}%`
            );
        });

        if (heatmapData.length > 0) {
            const avgLat = heatmapData.reduce((sum, d) => sum + d.latitude, 0) / heatmapData.length;
            const avgLon = heatmapData.reduce((sum, d) => sum + d.longitude, 0) / heatmapData.length;
            map.setView([avgLat, avgLon], 15);
        }

        map.invalidateSize();

        function expandToPolygon(points) {
            if (points.length === 2) {
                const [p1, p2] = points;
                return [
                    [p1[0] - 0.0001, p1[1] - 0.0001],
                    [p1[0] + 0.0001, p1[1] + 0.0001],
                    [p2[0] + 0.0001, p2[1] + 0.0001],
                    [p2[0] - 0.0001, p2[1] - 0.0001]
                ];
            } else {
                const [p] = points;
                return [
                    [p[0] - 0.0001, p[1] - 0.0001],
                    [p[0] + 0.0001, p[1] - 0.0001],
                    [p[0] + 0.0001, p[1] + 0.0001],
                    [p[0] - 0.0001, p[1] + 0.0001]
                ];
            }
        }
    }
});
