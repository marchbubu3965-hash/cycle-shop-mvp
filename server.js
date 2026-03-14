const express = require('express');
const db = require('./database');
const app = express();
app.use(express.json());

// 模擬登入 (MVP 階段僅回傳權限)
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    db.get("SELECT * FROM Users WHERE username = ?", [username], (err, user) => {
        if (user) {
            res.json({ success: true, user: { id: user.user_id, isAdmin: user.is_admin, balance: user.wallet_balance } });
        } else {
            res.status(401).json({ success: false, message: "找不到使用者" });
        }
    });
});

app.listen(3000, () => console.log('MVP Server running on port 3000'));