const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // 新增：檔案上傳套件
const db = require('./database');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==========================================
// [重要更新] 1. 配置靜態檔案與檔案上傳
// ==========================================

// 確保 uploads 資料夾存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
    console.log("📁 已自動建立 uploads 資料夾");
}

// 讓瀏覽器可以透過 /uploads 路徑存取實體圖片
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 配置 Multer 儲存邏輯
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // 儲存目錄
    },
    filename: function (req, file, cb) {
        // 產生唯一的檔名：時間戳記 + 原始副檔名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }); // 初始化上傳中間件

// ==========================================
// 2. 使用者與訂單批次查詢
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
    db.get("SELECT * FROM Users WHERE user_id = ?", [req.params.id], (err, user) => res.json(user));
});

app.get('/api/user/:id/orders', (req, res) => {
    const sql = `
        SELECT o.order_id, o.created_at, o.final_amount, o.wallet_used,
               oi.item_id, p.name, p.price, oi.buyback_status, p.description
        FROM Orders o
        JOIN Order_Items oi ON o.order_id = oi.order_id
        JOIN Products p ON oi.product_id = p.product_id
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const orders = rows.reduce((acc, row) => {
            if (!acc[row.order_id]) {
                acc[row.order_id] = { id: row.order_id, date: row.created_at, total: row.final_amount + row.wallet_used, items: [] };
            }
            acc[row.order_id].items.push(row);
            return acc;
        }, {});
        res.json(Object.values(orders));
    });
});

// ==========================================
// 3. 商品與庫存管理 API
// ==========================================

app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM Products WHERE status = 'active' AND stock > 0", [], (err, rows) => res.json(rows));
});

app.get('/api/admin/inventory', (req, res) => {
    db.all("SELECT * FROM Products ORDER BY stock ASC", [], (err, rows) => res.json(rows));
});

// [核心更新]：商品上架 API (支援檔案上傳)
// upload.single('image') 代表接收名為 'image' 的單一檔案
app.post('/api/products', upload.single('image'), (req, res) => {
    // 檔案資訊在 req.file，文字欄位在 req.body
    const { name, price, stock } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ message: "請上傳商品圖片檔案" });
    }

    // 產生圖片的存取路徑：/uploads/filename.jpg (瀏覽器可讀)
    const imageUrl = `/uploads/${req.file.filename}`;

    const sql = `INSERT INTO Products (name, description, price, category, status, stock) VALUES (?, ?, ?, 'clothes', 'active', ?)`;
    
    // 將 imageUrl 存入資料庫的 description 欄位
    db.run(sql, [name, imageUrl, price, stock], function(err) {
        if (err) {
            // 如果資料庫失敗，應刪除剛上傳的檔案 (防錯邏輯)
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "商品上架成功", productId: this.lastID, imageUrl: imageUrl });
    });
});

// ==========================================
// 4. 交易 API
// ==========================================

app.post('/api/checkout', (req, res) => {
    const { user_id, items } = req.body;
    db.get("SELECT wallet_balance FROM Users WHERE user_id = ?", [user_id], (err, user) => {
        let total_cost = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        let wallet_used = Math.min(user.wallet_balance, total_cost);
        let cash_payable = total_cost - wallet_used;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run("UPDATE Users SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [wallet_used, user_id]);
            db.run(`INSERT INTO Orders (user_id, final_amount, wallet_used) VALUES (?, ?, ?)`, 
                [user_id, cash_payable, wallet_used], function() {
                const order_id = this.lastID;
                items.forEach(item => {
                    for(let k=0; k < item.qty; k++) {
                        db.run("UPDATE Products SET stock = stock - 1 WHERE product_id = ?", [item.id]);
                        db.run("INSERT INTO Order_Items (order_id, product_id, purchase_price) VALUES (?, ?, ?)", 
                            [order_id, item.id, item.price]);
                    }
                });
                db.run("COMMIT", () => res.json({ message: "結帳成功", cash_payable }));
            });
        });
    });
});

// ==========================================
// 5. 管理員回購
// ==========================================

app.get('/api/admin/buyback/pending', (req, res) => {
    const sql = `SELECT oi.item_id, p.name, oi.purchase_price, u.username FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id JOIN Users u ON o.user_id = u.user_id JOIN Products p ON oi.product_id = p.product_id WHERE oi.buyback_status = 'requested'`;
    db.all(sql, [], (err, rows) => res.json(rows));
});

app.post('/api/buyback/confirm', (req, res) => {
    const { item_id, refund_amount } = req.body;
    db.get(`SELECT o.user_id FROM Order_Items oi JOIN Orders o ON oi.order_id = o.order_id WHERE oi.item_id = ?`, [item_id], (err, row) => {
        db.serialize(() => {
            db.run("UPDATE Users SET wallet_balance = wallet_balance + ? WHERE user_id = ?", [refund_amount, row.user_id]);
            db.run("UPDATE Order_Items SET buyback_status = 'completed' WHERE item_id = ?", [item_id]);
            res.json({ message: "回饋金已發放", amount: refund_amount });
        });
    });
});

app.post('/api/buyback/request', (req, res) => {
    db.run("UPDATE Order_Items SET buyback_status = 'requested' WHERE item_id = ?", [req.body.item_id], () => res.json({ message: "OK" }));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🎉 循環商城 (本機檔案上傳版) 啟動於 http://localhost:${PORT}`);
    console.log(`📁 圖片儲存目錄: ${uploadDir}`);
});