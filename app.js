// Backend URL: blank = same server that serves this page.
// If frontend is hosted separately (e.g. GitHub Pages), put backend URL here:
// const API = 'https://your-backend.onrender.com';
const API = '';

let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let map, markers = {}, routeLine = null, selected = null, timer = null, watchId = null;

const $ = id => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(true); }
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ---------- Login / logout ----------
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    const data = await api('/api/login', { method: 'POST',
      body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
    token = data.token; user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    showApp();
  } catch (err) { $('login-error').textContent = err.message; }
});

function logout(silent) {
  if (!silent && token) api('/api/logout', { method: 'POST' }).catch(() => {});
  stopGps();
  clearInterval(timer);
  token = null; user = null;
  localStorage.clear();
  $('app-view').hidden = true;
  $('login-view').hidden = false;
}
$('logout').addEventListener('click', () => logout());

// ---------- App ----------
async function showApp() {
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('who').textContent = `${user.name} (${user.role})`;
  $('driver-bar').hidden = user.role !== 'driver';

  if (!map) {
    const college = await api('/api/college');
    map = L.map('map').setView([college.lat, college.lng], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    L.marker([college.lat, college.lng]).addTo(map).bindPopup(college.name);
  }
  setTimeout(() => map.invalidateSize(), 100);
  refresh();
  timer = setInterval(refresh, 3000);
}

async function refresh() {
  try {
    const buses = await api('/api/buses');
    renderList(buses);
    renderMap(buses);
  } catch (e) { /* ignore transient errors */ }
}

function renderList(buses) {
  $('bus-list').innerHTML = buses.map(b => `
    <div class="bus ${selected === b.id ? 'sel' : ''}" data-id="${b.id}" tabindex="0">
      <div class="top"><span>${b.number}</span>
        <span class="tag ${b.live ? 'live' : ''}">${b.live ? 'Live GPS' : 'Simulated'}</span></div>
      <div class="route">${b.route}</div>
      <div class="meta"><span>Arrives in ${b.etaMinutes} min</span><span>${b.speed} km/h</span>
        <span>${b.riders}/${b.capacity} seats</span></div>
    </div>`).join('');
  document.querySelectorAll('.bus').forEach(el => {
    const pick = () => selectBus(+el.dataset.id, buses);
    el.addEventListener('click', pick);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); });
  });
}

function renderMap(buses) {
  buses.forEach(b => {
    if (!markers[b.id]) {
      markers[b.id] = L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: '', html: `<div class="pin">${b.number.replace('Bus ', '#')}</div>`, iconSize: [38, 26] })
      }).addTo(map).bindPopup(b.number);
    } else markers[b.id].setLatLng([b.lat, b.lng]);
    markers[b.id].setPopupContent(`<b>${b.number}</b><br>${b.route}<br>${b.speed} km/h · ${b.etaMinutes} min away`);
  });
}

function selectBus(id, buses) {
  selected = id;
  const b = buses.find(x => x.id === id);
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(b.path, { color: '#1d2330', weight: 4, dashArray: '8 8' }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  markers[id].openPopup();
  renderList(buses);
}

// ---------- Driver GPS sharing ----------
$('gps-toggle').addEventListener('click', () => watchId === null ? startGps() : stopGps());

function startGps() {
  if (!navigator.geolocation) { $('driver-status').textContent = 'This device has no GPS.'; return; }
  watchId = navigator.geolocation.watchPosition(async pos => {
    try {
      await api(`/api/buses/${user.busId}/location`, { method: 'POST', body: JSON.stringify({
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        speed: Math.round((pos.coords.speed || 0) * 3.6) }) });
      $('driver-status').textContent = 'Sharing live location';
    } catch (e) { $('driver-status').textContent = e.message; }
  }, err => { $('driver-status').textContent = 'Allow location access to share.'; stopGps(); },
  { enableHighAccuracy: true });
  $('gps-toggle').textContent = 'Stop sharing';
}

function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  $('gps-toggle').textContent = 'Start sharing location';
  $('driver-status').textContent = 'GPS sharing is off';
}

if (token && user) showApp();
