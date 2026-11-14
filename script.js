// ---------- Map setup (Leaflet) ----------
const DEFAULT_CENTER = [12.88, 121.77]; // the Philippines
const DEFAULT_ZOOM = 6;
const HINT = "Try “Cagayan de Oro” or “Cebu”.";

const map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);

const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// A layer group holds all markers so we can clear them in one call
const markers = L.layerGroup().addTo(map);

// Remembers the view that shows all results, so we can zoom back out to it
let resultsBounds = null;
let popupIsOpen = false;

// ---------- DOM references ----------
const form = document.getElementById("search-form");
const input = document.getElementById("query");
const button = document.getElementById("search-btn");
const clearBtn = document.getElementById("clear-btn");
const message = document.getElementById("message");
const recentSection = document.getElementById("recent");
const recentList = document.getElementById("recent-list");
const clearRecentBtn = document.getElementById("clear-recent-btn");

// ---------- Helpers ----------
function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "error" : "";
}

// Tell the user if map tiles can't load (blocked network, offline, etc.)
let tileErrorShown = false;
tiles.on("tileerror", () => {
  if (tileErrorShown) return;
  tileErrorShown = true;
  showMessage(
    "Map tiles failed to load. Check your internet connection or firewall.",
    true,
  );
});

// Popup with place name and country (textContent avoids HTML injection)
function buildPopup(place) {
  const div = document.createElement("div");

  const name = document.createElement("div");
  name.className = "popup-name";
  name.textContent = place.name || place.display_name.split(",")[0];

  const country = document.createElement("div");
  country.className = "popup-country";
  country.textContent =
    (place.address && place.address.country) || "Philippines";

  div.append(name, country);
  return div;
}

async function searchCity(term) {
  // Clear old markers before every new search
  resultsBounds = null; // so closing the old popup doesn't trigger a zoom out
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

// ---------- Recent searches (saved in localStorage) ----------
const STORAGE_KEY = "ph-city-explorer-recent";
const MAX_RECENT = 6;

function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (err) {
    return []; // storage unavailable or corrupted
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // ignore: the list just won't persist
  }
}

function renderRecent() {
  const list = loadRecent();
  recentList.innerHTML = "";
  recentSection.hidden = list.length === 0;

  list.forEach((term) => {
    const li = document.createElement("li");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = term;
    chip.addEventListener("click", () => {
      input.value = term;
      toggleClearButton();
      runSearch(term);
    });
    li.appendChild(chip);
    recentList.appendChild(li);
  });
}

function addRecent(term) {
  // Newest first, no duplicates (case-insensitive), capped at MAX_RECENT
  const list = loadRecent().filter(
    (t) => t.toLowerCase() !== term.toLowerCase(),
  );
  list.unshift(term);
  saveRecent(list.slice(0, MAX_RECENT));
  renderRecent();
}

clearRecentBtn.addEventListener("click", () => {
  saveRecent([]);
  renderRecent();
});

// ---------- Clear button (✕) ----------
function toggleClearButton() {
  clearBtn.hidden = input.value.length === 0;
}

input.addEventListener("input", toggleClearButton);

clearBtn.addEventListener("click", () => {
  resultsBounds = null; // stops the popup-close handler from zooming to old results
  markers.clearLayers(); // remove all pins (also closes any open popup)
  map.closePopup();

  input.value = "";
  toggleClearButton();
  showMessage(HINT);

  // Zoom back out to the whole country
  map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
  input.focus();
});

// ---------- Zoom in on pin click, zoom out on popup close ----------
map.on("popupopen", () => {
  popupIsOpen = true;
});

map.on("popupclose", () => {
  popupIsOpen = false;
  // Wait a tick: if another pin was clicked, a new popup opens right away
  // and we should stay zoomed in instead of zooming out.
  setTimeout(() => {
    if (!popupIsOpen && resultsBounds) {
      map.flyToBounds(resultsBounds, {
        padding: [40, 40],
        maxZoom: 12,
        duration: 0.8,
      });
    }
  }, 0);
});

// ---------- Main search ----------
async function runSearch(rawTerm) {
  const term = rawTerm.trim();

  if (!term) {
    resultsBounds = null;
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
      const marker = L.circleMarker(latlng, {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#111",
        fillOpacity: 1,
      })
        .addTo(markers)
        .bindPopup(buildPopup(place));

      // Zoom in when a pin is clicked
      marker.on("click", () => {
        map.flyTo(latlng, 14, { duration: 0.8 });
      });

      return latlng;
    });

    resultsBounds = L.latLngBounds(points);
    map.fitBounds(resultsBounds, { padding: [40, 40], maxZoom: 12 });
    showMessage(
      "Showing " +
        points.length +
        " match" +
        (points.length > 1 ? "es" : "") +
        ' for "' +
        term +
        '". Click a pin to zoom in.',
    );

    addRecent(term); // only successful searches are saved
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
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

// Show saved searches when the page loads
renderRecent();
