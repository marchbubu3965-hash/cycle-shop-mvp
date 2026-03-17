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

app.post('/api/products', (req, res) => {
    const { name, description, price, category, stock } = req.body;
    const sql = `INSERT INTO Products (name, description, price, category, status, stock) 
                 VALUES (?, ?, ?, ?, 'active', ?)`;
    db.run(sql, [name, description, price, category, stock], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "商品上架成功", productId: this.lastID });
    });
});

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
// 3. 結帳邏輯 API (強化穩定版)
// ==========================================

app.post('/api/checkout', (req, res) => {
    const { user_id, product_id, quantity } = req.body;

    // 步驟 A: 檢查商品庫存
    db.get("SELECT * FROM Products WHERE product_id = ?", [product_id], (err, product) => {
        if (err) return res.status(500).json({ error: "查詢商品失敗: " + err.message });
        if (!product) return res.status(400).json({ message: "找不到商品" });
        if (product.stock < quantity) return res.status(400).json({ message: "庫存不足" });

        // 步驟 B: 檢查使用者錢包
        db.get("SELECT * FROM Users WHERE user_id = ?", [user_id], (err, user) => {
            if (err) return res.status(500).json({ error: "查詢使用者失敗: " + err.message });
            if (!user) return res.status(400).json({ message: "找不到使用者" });

            const total_price = product.price * quantity;
            let wallet_used = 0;
            let final_payable = total_price;

            // 購物金折抵邏輯
            if (user.wallet_balance > 0) {
                if (user.wallet_balance >= total_price) {
                    wallet_used = total_price;
                    final_payable = 0;
                } else {
                    wallet_used = user.wallet_balance;
                    final_payable = total_price - wallet_used;
                }
            }

            // 步驟 C: 執行資料庫寫入 (確保同步執行)
            db.serialize(() => {
                // 1. 更新商品庫存
                db.run("UPDATE Products SET stock = stock - ? WHERE product_id = ?", [quantity, product_id]);

                // 2. 更新使用者錢包餘額
                db.run("UPDATE Users SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [wallet_used, user_id]);

                // 3. 建立訂單主表紀錄
                db.run(`INSERT INTO Orders (user_id, final_amount, wallet_used) VALUES (?, ?, ?)`, 
                    [user_id, final_payable, wallet_used], function(err) {
                        if (err) return res.status(500).json({ error: "訂單建立失敗: " + err.message });
                        
                        const order_id = this.lastID;

                        // 4. 建立訂單項目明細 (未來回購用)
                        db.run(`INSERT INTO Order_Items (order_id, product_id, purchase_price) VALUES (?, ?, ?)`, 
                            [order_id, product_id, product.price], (err) => {
                                if (err) return res.status(500).json({ error: "項目明細紀錄失敗" });

                                // 全部成功，回傳結果
                                res.json({
                                    message: "結帳成功",
                                    total_original: total_price,
                                    wallet_deducted: wallet_used,
                                    cash_payable: final_payable,
                                    new_wallet_balance: (user.wallet_balance - wallet_used)
                                });
                            }
                        );
                    }
                );
            });
        });
    });
});

// ==========================================
// 啟動伺服器
// ==========================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ server.js 第三步：結帳與購物金邏輯 已啟動`);
    console.log(`🚀 伺服器運行中：http://localhost:${PORT}`);
});