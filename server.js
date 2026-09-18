// server.js
// Free Fire Like API Server — chạy trên Render
// Chấp nhận API Key qua cả header (x-api-key) và query param (?key=)

const express = require('express');
const fs = require('fs');
const path = require('path');
const { LikeAPI } = require('shan-ffapi');

const app = express();
app.use(express.json());

// Lấy API Key từ biến môi trường (set trên Render)
// Nếu không set, dùng giá trị mặc định bên dưới
const API_KEY = process.env.API_KEY || 'default-secret-key-change-me';

// ================== ĐỌC CREDENTIALS ==================
let guestCredentials = [];
try {
    const credPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credPath)) {
        guestCredentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        console.log(`✅ Đã tải ${guestCredentials.length} guest từ credentials.json`);
    } else {
        console.warn('⚠️ Không tìm thấy credentials.json, sẽ dùng pool mặc định của shan-ffapi');
    }
} catch (e) {
    console.error('❌ Lỗi đọc credentials.json:', e.message);
}

// ================== MIDDLEWARE XÁC THỰC ==================
// Chấp nhận API Key từ: header "x-api-key" HOẶC query param "key"
function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.key;

    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized: API key không hợp lệ'
        });
    }
    next();
}

// ================== ENDPOINT /ping ==================
app.get('/ping', (req, res) => {
    res.json({
        ok: true,
        msg: 'pong',
        guests: guestCredentials.length,
        hasKey: !!API_KEY
    });
});

// ================== ENDPOINT /buff ==================
// GET /buff?uid=<UID>&region=VN&count=10
// Header: x-api-key: <API_KEY>  HOẶC  Query: &key=<API_KEY>
app.get('/buff', authenticate, async (req, res) => {
    const targetUid = String(req.query.uid || '').trim();
    const region = String(req.query.region || 'VN').toUpperCase();
    const count = parseInt(req.query.count || '10', 10);

    // --- Validate input ---
    if (!targetUid || !/^\d{6,12}$/.test(targetUid)) {
        return res.status(400).json({ ok: false, error: 'UID không hợp lệ (chỉ chứa số, 6-12 ký tự)' });
    }
    if (isNaN(count) || count < 1 || count > 100) {
        return res.status(400).json({ ok: false, error: 'count phải từ 1-100' });
    }

    console.log(`[BUFF] Target: ${targetUid} | Region: ${region} | Count: ${count}`);

    try {
        // Khởi tạo LikeAPI: dùng credentials tự chọn nếu có, ngược lại dùng pool mặc định
        let likes;
        if (guestCredentials.length > 0) {
            likes = new LikeAPI(guestCredentials);
        } else {
            likes = new LikeAPI();
        }

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
    res.status(404).json({ ok: false, error: 'Not found' });
});

// ================== KHỞI ĐỘNG SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server đang chạy trên port ${PORT}`);
    console.log(`   Test: curl "http://localhost:${PORT}/ping"`);
});

// ================== GRACEFUL SHUTDOWN ==================
process.on('SIGINT', () => {
    console.log('\n[SERVER] Đang tắt...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\n[SERVER] Đang tắt...');
    process.exit(0);
});
