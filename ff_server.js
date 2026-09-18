// ff_server.js — Custom Free Fire Like API Server
// Chạy: node ff_server.js
// Port: 3000 (hoặc process.env.PORT trên Render)

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { LikeAPI } = require('shan-ffapi');

const app = express();
app.use(express.json());

// ================== CẤU HÌNH ==================
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'change-me-please';
const GUESTS_FILE = path.join(__dirname, 'credentials.json');

// Garena OAuth (dùng chung cho mọi region FF)
const OAUTH_URL = 'https://100067.connect.garena.com/oauth/guest/token/grant';
const CLIENT_ID = '100067';
const CLIENT_SECRET = '2ee44819e9b4598845141067b281621874d0d5d7af9d8f7e00c1e54715b7d1e3';
const OAUTH_HEADERS = {
    'User-Agent': 'GarenaMSDK/4.0.19P4(G011A ;Android 13;en;VN;)',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
};

// ================== LOAD/SAVE GUESTS ==================
function loadGuests() {
    try {
        if (!fs.existsSync(GUESTS_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(GUESTS_FILE, 'utf-8'));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('❌ Load guests lỗi:', e.message);
        return [];
    }
}

function saveGuests(guests) {
    try {
        fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('❌ Save guests lỗi:', e.message);
        return false;
    }
}

// ================== MIDDLEWARE AUTH ==================
function auth(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (!key || key !== API_KEY) {
        return res.status(401).json({ ok: false, error: 'Unauthorized: API key không hợp lệ' });
    }
    next();
}

// ================== HELPER: LOGIN 1 GUEST ==================
async function loginGuest(uid, password, timeout = 15000) {
    try {
        const payload = new URLSearchParams({
            uid: String(uid),
            password: String(password),
            response_type: 'token',
            client_type: '2',
            client_secret: CLIENT_SECRET,
            client_id: CLIENT_ID,
        });
        const r = await axios.post(OAUTH_URL, payload, { headers: OAUTH_HEADERS, timeout });
        if (r.data && r.data.access_token) {
            return { ok: true, token: r.data.access_token, expires_in: r.data.expires_in, open_id: r.data.open_id };
        }
        return { ok: false, error: r.data.error || r.data.error_description || 'Login failed' };
    } catch (e) {
        if (e.response) {
            const d = e.response.data || {};
            return { ok: false, error: d.error || d.error_description || `HTTP ${e.response.status}` };
        }
        return { ok: false, error: e.message };
    }
}

// ================== ENDPOINT: /ping ==================
app.get('/ping', (req, res) => {
    const guests = loadGuests();
    res.json({ ok: true, msg: 'pong', guests: guests.length, time: new Date().toISOString() });
});

// ================== ENDPOINT: /guests (list) ==================
app.get('/guests', auth, (req, res) => {
    const guests = loadGuests();
    res.json({
        ok: true,
        count: guests.length,
        guests: guests.map(g => ({
            uid: g.uid,
            region: g.region,
            hasPassword: !!g.password,
            passLen: g.password ? g.password.length : 0
        }))
    });
});

// ================== ENDPOINT: /guests (add/update) ==================
app.post('/guests', auth, (req, res) => {
    const { uid, password, passwordHash, region } = req.body;
    if (!uid || !region) {
        return res.status(400).json({ ok: false, error: 'Thiếu uid hoặc region' });
    }
    const pass = password || passwordHash;
    if (!pass) {
        return res.status(400).json({ ok: false, error: 'Thiếu password hoặc passwordHash' });
    }

    const guests = loadGuests();
    const idx = guests.findIndex(g => String(g.uid) === String(uid));
    const newGuest = { uid: String(uid), password: String(pass), region: String(region).toUpperCase() };

    if (idx >= 0) {
        guests[idx] = newGuest;
        saveGuests(guests);
        return res.json({ ok: true, msg: 'Đã cập nhật guest', action: 'updated', total: guests.length });
    }
    guests.push(newGuest);
    saveGuests(guests);
    res.json({ ok: true, msg: 'Đã thêm guest mới', action: 'added', total: guests.length });
});

// ================== ENDPOINT: /guests/:uid (delete) ==================
app.delete('/guests/:uid', auth, (req, res) => {
    const uid = String(req.params.uid);
    let guests = loadGuests();
    const before = guests.length;
    guests = guests.filter(g => String(g.uid) !== uid);
    saveGuests(guests);
    res.json({ ok: true, removed: before - guests.length, remaining: guests.length });
});

// ================== ENDPOINT: /test-guest/:uid ==================
app.get('/test-guest/:uid', auth, async (req, res) => {
    const uid = String(req.params.uid);
    const guests = loadGuests();
    const guest = guests.find(g => String(g.uid) === uid);
    if (!guest) return res.status(404).json({ ok: false, error: 'Không tìm thấy guest' });

    const r = await loginGuest(guest.uid, guest.password);
    res.json({
        ok: r.ok,
        uid: guest.uid,
        region: guest.region,
        error: r.error,
        token: r.ok ? r.token.slice(0, 50) + '...' : null,
        expires_in: r.expires_in || null
    });
});

// ================== ENDPOINT: /test-all (test toàn bộ guest) ==================
app.get('/test-all', auth, async (req, res) => {
    const guests = loadGuests();
    if (guests.length === 0) return res.json({ ok: true, alive: 0, dead: 0, list: [] });

    const results = [];
    let alive = 0, dead = 0;

    for (const g of guests) {
        const r = await loginGuest(g.uid, g.password);
        if (r.ok) {
            alive++;
            results.push({ uid: g.uid, region: g.region, alive: true });
        } else {
            dead++;
            results.push({ uid: g.uid, region: g.region, alive: false, error: r.error });
        }
    }

    // Lọc chỉ giữ guest sống
    const aliveList = results.filter(r => r.alive);
    const deadList = results.filter(r => !r.alive);

    res.json({ ok: true, alive, dead, total: guests.length, aliveList, deadList });
});

// ================== ENDPOINT: /clean (xóa guest chết) ==================
app.post('/clean', auth, async (req, res) => {
    const guests = loadGuests();
    const alive = [];

    for (const g of guests) {
        const r = await loginGuest(g.uid, g.password);
        if (r.ok) alive.push(g);
    }

    saveGuests(alive);
    res.json({ ok: true, removed: guests.length - alive.length, remaining: alive.length });
});

// ================== ENDPOINT: /buff (chính) ==================
app.get('/buff', auth, async (req, res) => {
    const targetUid = String(req.query.uid || '').trim();
    const region = String(req.query.region || 'VN').toUpperCase();
    const count = Math.min(parseInt(req.query.count || '10', 10), 300);

    if (!targetUid || !/^\d{6,12}$/.test(targetUid)) {
        return res.status(400).json({ ok: false, error: 'UID không hợp lệ' });
    }
    if (isNaN(count) || count < 1) {
        return res.status(400).json({ ok: false, error: 'count không hợp lệ' });
    }

    const guests = loadGuests();
    if (guests.length === 0) {
        return res.status(400).json({ ok: false, error: 'Không có guest nào trong credentials.json' });
    }

    console.log(`[BUFF] target=${targetUid} region=${region} count=${count} guests=${guests.length}`);

    try {
        const likes = new LikeAPI(guests);
        const result = await likes.sendLikes(targetUid, region, count);

        console.log(`[BUFF] Kết quả: sent=${result.sent} failed=${result.failed}`);

        res.json({
            ok: true,
            uid: targetUid,
            region: region,
            sent: result.sent,
            failed: result.failed,
            total: count,
            results: result.results
        });
    } catch (e) {
        console.error(`[BUFF] Lỗi: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ================== 404 FALLBACK ==================
app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint không tồn tại' });
});

// ================== START ==================
app.listen(PORT, '0.0.0.0', () => {
    const guests = loadGuests();
    console.log('='.repeat(55));
    console.log(`✅ FF API Server đang chạy port ${PORT}`);
    console.log(`   Guests  : ${guests.length}`);
    console.log(`   API Key : ${API_KEY}`);
    console.log('='.repeat(55));
    console.log('Endpoints:');
    console.log('  GET  /ping                     — Kiểm tra server');
    console.log('  GET  /guests?key=...           — Xem DS guest');
    console.log('  POST /guests?key=...           — Thêm guest');
    console.log('  DEL  /guests/:uid?key=...      — Xóa guest');
    console.log('  GET  /test-guest/:uid?key=...  — Test 1 guest');
    console.log('  GET  /test-all?key=...         — Test toàn bộ');
    console.log('  POST /clean?key=...            — Xóa guest chết');
    console.log('  GET  /buff?uid=..&count=..     — Buff like');
    console.log('='.repeat(55));
});

// Graceful shutdown
process.on('SIGINT', () => { console.log('\n[SERVER] Tắt.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[SERVER] Tắt.'); process.exit(0); });
