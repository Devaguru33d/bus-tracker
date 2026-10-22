const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Demo data (edit freely; coordinates are approximate) ----
const COLLEGE = { name: 'Chennai Institute of Technology', lat: 12.9717, lng: 80.0436 };

const USERS = [
  { id: 1, username: 'student1', password: 'student123', role: 'student', name: 'Student One' },
  { id: 2, username: 'driver1',  password: 'driver123',  role: 'driver',  name: 'Murugan', busId: 1 },
  { id: 3, username: 'driver2',  password: 'driver123',  role: 'driver',  name: 'Selvam',  busId: 2 },
];

const BUSES = [
  { id: 1, number: 'Bus 1', route: 'Tambaram → CIT', driver: 'Murugan', capacity: 50, riders: 32,
    path: [[12.9249, 80.1000], [12.9400, 80.0800], [12.9550, 80.0650], [12.9650, 80.0530], [12.9717, 80.0436]] },
  { id: 2, number: 'Bus 2', route: 'Guindy → CIT', driver: 'Selvam', capacity: 50, riders: 41,
    path: [[13.0067, 80.2206], [12.9950, 80.1700], [12.9850, 80.1200], [12.9780, 80.0800], [12.9717, 80.0436]] },
  { id: 3, number: 'Bus 3', route: 'Porur → CIT', driver: 'Rajesh', capacity: 45, riders: 18,
    path: [[13.0382, 80.1565], [13.0200, 80.1300], [13.0000, 80.1000], [12.9850, 80.0700], [12.9717, 80.0436]] },
];

// live state per bus
const state = {};
BUSES.forEach(b => {
  state[b.id] = { lat: b.path[0][0], lng: b.path[0][1], speed: 0, seg: 0, t: 0, live: false, updated: Date.now() };
});

// Simulation: moves buses along their route unless a driver is sending live GPS
setInterval(() => {
  BUSES.forEach(b => {
    const s = state[b.id];
    if (s.live && Date.now() - s.updated < 15000) return;
    s.live = false;
    const a = b.path[s.seg], c = b.path[s.seg + 1];
    s.t += 0.04;
    if (s.t >= 1) { s.t = 0; s.seg++; if (s.seg >= b.path.length - 1) { s.seg = 0; } }
    const A = b.path[s.seg], C = b.path[s.seg + 1];
    s.lat = A[0] + (C[0] - A[0]) * s.t;
    s.lng = A[1] + (C[1] - A[1]) * s.t;
    s.speed = 28 + Math.round(Math.random() * 12);
    s.updated = Date.now();
  });
}, 2000);

// ---- Auth (simple in-memory tokens) ----
const sessions = {};
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = sessions[token];
  if (!user) return res.status(401).json({ error: 'Please log in again.' });
  req.user = user;
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password.' });
  const token = crypto.randomBytes(24).toString('hex');
  const safe = { id: user.id, name: user.name, role: user.role, busId: user.busId || null };
  sessions[token] = safe;
  res.json({ token, user: safe });
});

app.post('/api/logout', auth, (req, res) => {
  delete sessions[(req.headers.authorization || '').replace('Bearer ', '')];
  res.json({ ok: true });
});

// ---- Bus APIs ----
function busView(b) {
  const s = state[b.id];
  const last = b.path[b.path.length - 1];
  const km = Math.hypot((s.lat - last[0]) * 111, (s.lng - last[1]) * 108);
  const eta = Math.max(1, Math.round((km / Math.max(s.speed, 20)) * 60));
  return { id: b.id, number: b.number, route: b.route, driver: b.driver, capacity: b.capacity,
    riders: b.riders, path: b.path, lat: s.lat, lng: s.lng, speed: s.speed, live: s.live,
    etaMinutes: eta, updated: s.updated };
}

app.get('/api/college', (req, res) => res.json(COLLEGE));
app.get('/api/buses', auth, (req, res) => res.json(BUSES.map(busView)));
app.get('/api/buses/:id', auth, (req, res) => {
  const b = BUSES.find(x => x.id === +req.params.id);
  if (!b) return res.status(404).json({ error: 'Bus not found.' });
  res.json(busView(b));
});

// Driver sends live GPS
app.post('/api/buses/:id/location', auth, (req, res) => {
  if (req.user.role !== 'driver' || req.user.busId !== +req.params.id)
    return res.status(403).json({ error: 'Only the assigned driver can update this bus.' });
  const { lat, lng, speed } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return res.status(400).json({ error: 'lat and lng must be numbers.' });
  Object.assign(state[+req.params.id], { lat, lng, speed: Math.round(speed || 0), live: true, updated: Date.now() });
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Bus tracker running at http://localhost:${PORT}`));
