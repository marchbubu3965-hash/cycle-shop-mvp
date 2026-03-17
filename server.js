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

// [POST] 登入與權限檢查
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

// [GET] 查詢使用者資訊 (包含最新餘額)
app.get('/api/user/:id', (req, res) => {
    db.get("SELECT user_id, username, is_admin, wallet_balance FROM Users WHERE user_id = ?", [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ message: "找不到使用者" });
        res.json(user);
    });
});

// ==========================================
// 2. 商品管理 API
// ==========================================

// [POST] 賣家上架商品
app.post('/api/products', (req, res) => {
    const { name, description, price, category, stock } = req.body;
    const sql = `INSERT INTO Products (name, description, price, category, status, stock) VALUES (?, ?, ?, ?, 'active', ?)`;
    db.run(sql, [name, description, price, category, stock], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "商品上架成功", productId: this.lastID });
    });
});

// [GET] 買家瀏覽商品
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
// 3. 結帳與購物金折抵 API
// ==========================================

app.post('/api/checkout', (req, res) => {
    const { user_id, product_id, quantity } = req.body;

    db.get("SELECT * FROM Products WHERE product_id = ?", [product_id], (err, product) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!product || product.stock < quantity) return res.status(400).json({ message: "商品不存在或庫存不足" });

        db.get("SELECT * FROM Users WHERE user_id = ?", [user_id], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(400).json({ message: "找不到使用者" });

            const total_price = product.price * quantity;
            let wallet_used = Math.min(user.wallet_balance, total_price);
            let final_payable = total_price - wallet_used;

            db.serialize(() => {
                db.run("UPDATE Products SET stock = stock - ? WHERE product_id = ?", [quantity, product_id]);
                db.run("UPDATE Users SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [wallet_used, user_id]);
                db.run(`INSERT INTO Orders (user_id, final_amount, wallet_used) VALUES (?, ?, ?)`, 
                    [user_id, final_payable, wallet_used], function(err) {
                        const order_id = this.lastID;
                        db.run(`INSERT INTO Order_Items (order_id, product_id, purchase_price) VALUES (?, ?, ?)`, 
                            [order_id, product_id, product.price], () => {
                                res.json({
                                    message: "結帳成功",
                                    total_original: total_price,
                                    wallet_deducted: wallet_used,
                                    cash_payable: final_payable,
                                    new_wallet_balance: (user.wallet_balance - wallet_used)
                                });
                            });
                    });
            });
        });
    });
});

// ==========================================
// 4. 回購機制 API
// ==========================================

// [POST] 買家申請回購
app.post('/api/buyback/request', (req, res) => {
    const { item_id } = req.body;
    db.run("UPDATE Order_Items SET buyback_status = 'requested' WHERE item_id = ?", [item_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "回購申請已提交" });
    });
});

// [POST] 賣家確認回購 (撥款 50% 購物金)
app.post('/api/buyback/confirm', (req, res) => {
    const { item_id } = req.body;
    const sql = `SELECT oi.purchase_price, o.user_id FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id WHERE oi.item_id = ?`;

    db.get(sql, [item_id], (err, row) => {
        if (err || !row) return res.status(404).json({ message: "找不到紀錄" });
        const refund = row.purchase_price * 0.5;

        db.serialize(() => {
            db.run("UPDATE Users SET wallet_balance = wallet_balance + ? WHERE user_id = ?", [refund, row.user_id]);
            db.run("UPDATE Order_Items SET buyback_status = 'completed' WHERE item_id = ?", [item_id]);
            db.run("INSERT INTO Wallet_Logs (user_id, change_amount, type) VALUES (?, ?, 'buyback_refund')", [row.user_id, refund]);
            res.json({ message: "審核成功", refunded: refund });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🎉 循環商城 MVP 修正版啟動！`);
    console.log(`🚀 測試查詢餘額：curl http://localhost:${PORT}/api/user/2`);
});