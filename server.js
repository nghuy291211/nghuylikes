// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { LikeAPI } = require('shan-ffapi');

const app = express();
app.use(express.json());

// Lấy API Key từ biến môi trường (sẽ set trên Render)
const API_KEY = process.env.API_KEY || 'default-secret-key-change-me';

// Đọc danh sách guest từ file credentials.json
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

// Middleware xác thực API Key
function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ ok: false, error: 'Unauthorized: API key không hợp lệ' });
    }
    next();
}

// Endpoint kiểm tra server còn sống
app.get('/ping', (req, res) => {
    res.json({ ok: true, msg: 'pong', guests: guestCredentials.length });
});

// Endpoint buff like chính
// GET /buff?uid=<UID>&region=VN&count=10
app.get('/buff', authenticate, async (req, res) => {
    const targetUid = String(req.query.uid || '').trim();
    const region = String(req.query.region || 'VN').toUpperCase();
    const count = parseInt(req.query.count || '10', 10);

    if (!targetUid || !/^\d{6,12}$/.test(targetUid)) {
        return res.status(400).json({ ok: false, error: 'UID không hợp lệ' });
    }
    if (isNaN(count) || count < 1 || count > 100) {
        return res.status(400).json({ ok: false, error: 'count phải từ 1-100' });
    }

    console.log(`[BUFF] Target: ${targetUid} | Region: ${region} | Count: ${count}`);

    try {
        // Khởi tạo LikeAPI với credentials tự chọn (nếu có)
        let likes;
        if (guestCredentials.length > 0) {
            likes = new LikeAPI(guestCredentials);
        } else {
            likes = new LikeAPI(); // Dùng pool mặc định của thư viện
        }

        const result = await likes.sendLikes(targetUid, region, count);

        res.json({
            ok: true,
            uid: targetUid,
            region: region,
            sent: result.sent,
            failed: result.failed,
            total: count
        });
    } catch (e) {
        console.error(`[BUFF] Lỗi: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server đang chạy trên port ${PORT}`);
});
