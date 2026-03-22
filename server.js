const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 認證 API ---

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "帳號密碼不可為空" });

    db.get("SELECT * FROM Users WHERE username = ?", [username], (err, row) => {
        if (row) return res.status(400).json({ message: "帳號已存在" });

        const sql = `INSERT INTO Users (username, password_hash, is_admin, wallet_balance) VALUES (?, ?, 0, 0)`;
        db.run(sql, [username, password], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "註冊成功", userId: this.lastID });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM Users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ message: "使用者不存在" });
        
        // 驗證密碼
        if (user.password_hash !== password) {
            return res.status(401).json({ message: "密碼錯誤" });
        }

        res.json({ 
            id: user.user_id, 
            username: user.username, 
            isAdmin: user.is_admin === 1, 
            balance: user.wallet_balance 
        });
    });
});

// --- 商品與訂單 API ---

app.get('/api/products', (req, res) => {
    const sql = "SELECT * FROM Products WHERE status = 'active' AND stock > 0 ORDER BY product_id DESC";
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/inventory', (req, res) => {
    db.all("SELECT * FROM Products ORDER BY product_id DESC", [], (err, rows) => res.json(rows));
});

app.put('/api/admin/inventory/:id', (req, res) => {
    const { stock } = req.body;
    db.run("UPDATE Products SET stock = ? WHERE product_id = ?", [stock, req.params.id], () => res.json({ message: "OK" }));
});

app.post('/api/products', upload.single('image'), (req, res) => {
    const { name, price, stock } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const sql = `INSERT INTO Products (name, description, price, category, status, stock) VALUES (?, ?, ?, 'clothes', 'active', ?)`;
    db.run(sql, [name, imageUrl, price, stock], () => res.json({ message: "OK" }));
});

app.get('/api/user/:id/orders', (req, res) => {
    const sql = `
        SELECT 
            o.order_id, o.created_at, o.final_amount, o.wallet_used, 
            oi.item_id, p.name, 
            oi.purchase_price AS price, 
            oi.buyback_status, 
            oi.refund_amount
        FROM Orders o 
        JOIN Order_Items oi ON o.order_id = oi.order_id 
        JOIN Products p ON oi.product_id = p.product_id 
        WHERE o.user_id = ? 
        ORDER BY o.order_id DESC`;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const orders = rows.reduce((acc, row) => {
            if (!acc[row.order_id]) {
                acc[row.order_id] = { 
                    id: row.order_id, 
                    date: row.created_at, 
                    total: (Number(row.final_amount)||0) + (Number(row.wallet_used)||0), 
                    wallet_used: row.wallet_used,
                    items: [] 
                };
            }
            acc[row.order_id].items.push({
                item_id: row.item_id, name: row.name, price: row.price,
                buyback_status: row.buyback_status, refund_amount: row.refund_amount
            });
            return acc;
        }, {});
        res.json(Object.values(orders));
    });
});

app.post('/api/checkout', (req, res) => {
    const { user_id, items } = req.body;
    db.get("SELECT wallet_balance FROM Users WHERE user_id = ?", [user_id], (err, user) => {
        let total_cost = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        let wallet_used = Math.min(user.wallet_balance, total_cost);
        let cash_payable = total_cost - wallet_used;
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run("UPDATE Users SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [wallet_used, user_id]);
            db.run(`INSERT INTO Orders (user_id, final_amount, wallet_used) VALUES (?, ?, ?)`, [user_id, cash_payable, wallet_used], function() {
                const order_id = this.lastID;
                items.forEach(item => {
                    for(let k=0; k < item.qty; k++) {
                        db.run("UPDATE Products SET stock = stock - 1 WHERE product_id = ?", [item.id]);
                        db.run("INSERT INTO Order_Items (order_id, product_id, purchase_price) VALUES (?, ?, ?)", [order_id, item.id, item.price]);
                    }
                });
                db.run("COMMIT", () => res.json({ message: "OK" }));
            });
        });
    });
});

app.get('/api/admin/buyback/pending', (req, res) => {
    const sql = `SELECT oi.item_id, p.name, oi.purchase_price, u.username FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id JOIN Users u ON o.user_id = u.user_id JOIN Products p ON oi.product_id = p.product_id WHERE oi.buyback_status = 'requested' ORDER BY oi.item_id DESC`;
    db.all(sql, [], (err, rows) => res.json(rows));
});

app.post('/api/buyback/confirm', (req, res) => {
    const { item_id, refund_amount } = req.body;
    db.get(`SELECT o.user_id FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id WHERE oi.item_id = ?`, [item_id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: "找不到訂單項目" });
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run("UPDATE Users SET wallet_balance = wallet_balance + ? WHERE user_id = ?", [refund_amount, row.user_id]);
            db.run("UPDATE Order_Items SET buyback_status = 'completed', refund_amount = ? WHERE item_id = ?", [refund_amount, item_id], (err) => {
                if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
                db.run("COMMIT", () => res.json({ message: "OK" }));
            });
        });
    });
});

app.post('/api/buyback/request', (req, res) => {
    db.run("UPDATE Order_Items SET buyback_status = 'requested' WHERE item_id = ?", [req.body.item_id], () => res.json({ message: "OK" }));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));