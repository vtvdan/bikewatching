import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.34.2/+esm';

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZHZ2dW9uZyIsImEiOiJjbXdhY3BlZ3owY3F5MnpvbnM4amQ3bDRoIn0.98VjBROHRVQhrXX7owvOAQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/dvvuong/cmwae32lh002a01st15hmgx3h', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 10, // Minimum allowed zoom
    maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.75       // Slightly less transparent
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    })

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.75       // Slightly less transparent
        }
    });

    const svg = d3.select('#map').select('svg');
    
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);

    let stations = jsonData.data.stations;

    // Fetch Bluebikes trip data CSV
    const trips = await d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);

            let startedMinutes = minutesSinceMidnight(trip.started_at);
            let endedMinutes = minutesSinceMidnight(trip.ended_at);

            departuresByMinute[startedMinutes].push(trip);
            arrivalsByMinute[endedMinutes].push(trip);

            return trip;
        }
    );

    stations = computeStationTraffic(stations);

    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    const stationFlow = d3.scaleQuantize()
        .domain([0, 1])
        .range([0, 0.5, 1]);

    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
        const { x, y } = map.project(point); // Project to pixel coordinates
        return { cx: x, cy: y }; // Return as object for use in SVG attributes
    }

    // Append circles to the SVG for each station
    const circles = svg
        .selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .style('--departure-ratio', (d) =>
            stationFlow(
                d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic
            )
        )
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .each(function (d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

    circles.on('wheel', function (event) {
        event.preventDefault();

        const mapCanvas = map.getCanvas();

        mapCanvas.dispatchEvent(new WheelEvent('wheel', {
            deltaY: event.deltaY,
            deltaX: event.deltaX,
            deltaMode: event.deltaMode,
            clientX: event.clientX,
            clientY: event.clientY,
            bubbles: true,
            cancelable: true
        }));
    });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
            .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends

    console.log('Loaded JSON Data:', jsonData); // Log to verify structure

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // Update circle sizes based on filtered time
    function updateScatterPlot(timeFilter) {
        const filteredStations = computeStationTraffic(stations, timeFilter);

        radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);

        circles
            .data(filteredStations, (d) => d.short_name)
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .style('--departure-ratio', (d) =>
                stationFlow(
                    d.totalTraffic === 0 ? 0.5 : d.departures / d.totalTraffic
                )
            )

        circles
            .select('title')
            .text((d) =>
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
    }
    
    function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value);
        if (timeFilter === -1) {
            selectedTime.textContent = '';
            anyTimeLabel.style.visibility = 'visible';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.visibility = 'hidden';
        }
    
        // Update map circles
        updateScatterPlot(timeFilter);
    }
    
    // Bind slider event
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
});

// Convert minutes since midnight into "HH:MM AM/PM" format
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Extract total minutes passed since 00:00 (midnight)
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function computeStationTraffic(stations, timeFilter = -1) {
    const departures = d3.rollup(
        filterByMinute(departuresByMinute, timeFilter),
        (v) => v.length,
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        filterByMinute(arrivalsByMinute, timeFilter),
        (v) => v.length,
        (d) => d.end_station_id
    );

    return stations.map((station) => {
        let id = station.short_name;

        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;

        return station;
    });
}

// function filterTripsByTime(trips, timeFilter) {
//     return timeFilter === -1 ? trips : trips.filter((trip) => {
//         const startedMinutes = minutesSinceMidnight(trip.started_at);
//         const endedMinutes = minutesSinceMidnight(trip.ended_at);
//         // Include trips starting or ending within 60 minutes of selected time
//         return (
//             Math.abs(startedMinutes - timeFilter) <= 60 || Math.abs(endedMinutes - timeFilter) <= 60
//         );
//     });
// }

function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) {
        return tripsByMinute.flat();
    }

    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;

    if (minMinute > maxMinute) {
        let beforeMidnight = tripsByMinute.slice(minMinute);
        let afterMidnight = tripsByMinute.slice(0, maxMinute + 1);

        return beforeMidnight.concat(afterMidnight).flat();
    } else {
        return tripsByMinute.slice(minMinute, maxMinute + 1).flat();
    }
}