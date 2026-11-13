// ---------- Map setup (Leaflet) ----------
const map = L.map("map").setView([12.88, 121.77], 6); // centered on the Philippines

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// A layer group holds all markers so we can clear them in one call
const markers = L.layerGroup().addTo(map);

// ---------- DOM references ----------
const form = document.getElementById("search-form");
const input = document.getElementById("query");
const button = document.getElementById("search-btn");
const message = document.getElementById("message");

// ---------- Helpers ----------
function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "error" : "";
}

// Popup with place name and country (textContent avoids HTML injection)
function buildPopup(place) {
  const div = document.createElement("div");

  const name = document.createElement("strong");
  name.textContent = place.name || place.display_name.split(",")[0];

  const country = document.createElement("div");
  country.textContent =
    (place.address && place.address.country) || "Philippines";

  div.append(name, country);
  return div;
}

async function searchCity(term) {
  // Clear old markers before every new search
  markers.clearLayers();

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1" +
    "&countrycodes=ph&limit=5&q=" +
    encodeURIComponent(term);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Server responded with status " + response.status);
  }
  return response.json();
}

// ---------- Main handler ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const term = input.value.trim();

  if (!term) {
    markers.clearLayers();
    showMessage("Please enter a city name first.", true);
    return;
  }

  button.disabled = true;
  showMessage("Searching…");

  try {
    const results = await searchCity(term);

    if (results.length === 0) {
      showMessage(
        'No Philippine locations found for "' +
          term +
          '". Check the spelling or try a nearby city.',
        true,
      );
      return;
    }

    // Up to five markers, each with a popup
    const points = results.slice(0, 5).map((place) => {
      const latlng = [parseFloat(place.lat), parseFloat(place.lon)];
      L.marker(latlng).addTo(markers).bindPopup(buildPopup(place));
      return latlng;
    });

    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    showMessage(
      "Showing " +
        points.length +
        " match" +
        (points.length > 1 ? "es" : "") +
        ' for "' +
        term +
        '". Click a pin for details.',
    );
  } catch (err) {
    showMessage(
      "Something went wrong: " +
        err.message +
        ". Check your internet connection and try again.",
      true,
    );
  } finally {
    button.disabled = false;
  }
});
