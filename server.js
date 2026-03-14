const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==========================================
// 1. 使用者與權限 API
// ==========================================

// [POST] 簡易登入
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    db.get("SELECT * FROM Users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ message: "使用者不存在" });

        res.json({
            id: user.user_id,
            username: user.username,
            isAdmin: user.is_admin === 1,
            balance: user.wallet_balance
        });
    });
});

// [GET] 查詢使用者資訊
app.get('/api/user/:id', (req, res) => {
    db.get("SELECT user_id, username, is_admin, wallet_balance FROM Users WHERE user_id = ?", [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ message: "找不到使用者" });
        res.json(user);
    });
});

// ==========================================
// 2. 商品管理 API (第二步新增)
// ==========================================

// [POST] 賣家上架新商品 (新品或二手)
app.post('/api/products', (req, res) => {
    const { name, description, price, category, stock } = req.body;
    
    // 預設上架狀態為 'active'
    const sql = `INSERT INTO Products (name, description, price, category, status, stock) 
                 VALUES (?, ?, ?, ?, 'active', ?)`;
    
    db.run(sql, [name, description, price, category, stock], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ 
            message: "商品上架成功", 
            productId: this.lastID 
        });
    });
});

// [GET] 買家查看商品清單 (支援分類篩選)
// 使用方式: /api/products?category=new 或 /api/products?category=used
app.get('/api/products', (req, res) => {
    const category = req.query.category; 
    let sql = "SELECT * FROM Products WHERE status = 'active'";
    const params = [];

    if (category) {
        sql += " AND category = ?";
        params.push(category);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// 啟動伺服器
// ==========================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ server.js 第二步更新完成`);
    console.log(`🚀 循環商城伺服器運行中：http://localhost:${PORT}`);
});