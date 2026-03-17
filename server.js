const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==========================================
// 1. 身份驗證與使用者 API
// ==========================================

app.post('/api/login', (req, res) => {
    const { username } = req.body;
    db.get("SELECT * FROM Users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ message: "使用者不存在" });
        res.json({ id: user.user_id, username: user.username, isAdmin: user.is_admin === 1, balance: user.wallet_balance });
    });
});

app.get('/api/user/:id', (req, res) => {
    db.get("SELECT user_id, username, is_admin, wallet_balance FROM Users WHERE user_id = ?", [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ message: "找不到使用者" });
        res.json(user);
    });
});

app.get('/api/user/:id/orders', (req, res) => {
    const sql = `
        SELECT oi.item_id, p.name, p.price, oi.buyback_status, o.created_at
        FROM Order_Items oi
        JOIN Orders o ON oi.order_id = o.order_id
        JOIN Products p ON oi.product_id = p.product_id
        WHERE o.user_id = ?
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// 2. 商品管理 API (新增：接收 description 作為圖片網址)
// ==========================================

app.post('/api/products', (req, res) => {
    const { name, description, price, category, stock } = req.body;
    // 我們將圖片網址存放在 description 欄位
    const sql = `INSERT INTO Products (name, description, price, category, status, stock) VALUES (?, ?, ?, ?, 'active', ?)`;
    db.run(sql, [name, description, price, category, stock], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "商品上架成功", productId: this.lastID });
    });
});

app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM Products WHERE status = 'active' AND stock > 0", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// 3. 交易 API
// ==========================================

app.post('/api/checkout', (req, res) => {
    const { user_id, product_id, quantity } = req.body;
    db.get("SELECT * FROM Products WHERE product_id = ?", [product_id], (err, product) => {
        if (!product || product.stock < quantity) return res.status(400).json({ message: "庫存不足" });
        db.get("SELECT * FROM Users WHERE user_id = ?", [user_id], (err, user) => {
            const total = product.price * quantity;
            let used = Math.min(user.wallet_balance, total);
            let pay = total - used;
            db.serialize(() => {
                db.run("UPDATE Products SET stock = stock - ? WHERE product_id = ?", [quantity, product_id]);
                db.run("UPDATE Users SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [used, user_id]);
                db.run(`INSERT INTO Orders (user_id, final_amount, wallet_used) VALUES (?, ?, ?)`, [user_id, pay, used], function() {
                    db.run(`INSERT INTO Order_Items (order_id, product_id, purchase_price) VALUES (?, ?, ?)`, [this.lastID, product_id, product.price]);
                    res.json({ message: "結帳成功", new_balance: (user.wallet_balance - used) });
                });
            });
        });
    });
});

// ==========================================
// 4. 回購與管理 API
// ==========================================

app.get('/api/admin/buyback/pending', (req, res) => {
    const sql = `SELECT oi.item_id, p.name, oi.purchase_price, u.username FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id JOIN Users u ON o.user_id = u.user_id JOIN Products p ON oi.product_id = p.product_id WHERE oi.buyback_status = 'requested'`;
    db.all(sql, [], (err, rows) => res.json(rows));
});

app.post('/api/buyback/request', (req, res) => {
    db.run("UPDATE Order_Items SET buyback_status = 'requested' WHERE item_id = ?", [req.body.item_id], () => res.json({ message: "申請成功" }));
});

app.post('/api/buyback/confirm', (req, res) => {
    const { item_id } = req.body;
    db.get(`SELECT oi.purchase_price, o.user_id FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id WHERE oi.item_id = ?`, [item_id], (err, row) => {
        const refund = row.purchase_price * 0.5;
        db.serialize(() => {
            db.run("UPDATE Users SET wallet_balance = wallet_balance + ? WHERE user_id = ?", [refund, row.user_id]);
            db.run("UPDATE Order_Items SET buyback_status = 'completed' WHERE item_id = ?", [item_id]);
            res.json({ message: "審核成功", refunded: refund });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`));