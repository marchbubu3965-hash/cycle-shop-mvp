const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'shop.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 資料庫連接失敗:', err.message);
    } else {
        console.log('✅ 已成功連接資料庫檔案:', dbPath);
    }
});

db.serialize(() => {
    console.log("正在初始化資料庫表格...");

    db.run(`CREATE TABLE IF NOT EXISTS Users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        is_admin BOOLEAN DEFAULT 0,
        wallet_balance REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL DEFAULT 0,
        category TEXT DEFAULT 'clothes', 
        status TEXT DEFAULT 'active',   
        stock INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Orders (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        final_amount REAL DEFAULT 0, 
        wallet_used REAL DEFAULT 0,  
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES Users(user_id)
    )`);

    // ✅ 修正：新增 refund_amount 欄位
    db.run(`CREATE TABLE IF NOT EXISTS Order_Items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id INTEGER,
        purchase_price REAL DEFAULT 0, 
        buyback_status TEXT DEFAULT 'none',
        refund_amount REAL DEFAULT 0,
        FOREIGN KEY(order_id) REFERENCES Orders(order_id),
        FOREIGN KEY(product_id) REFERENCES Products(product_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Wallet_Logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        change_amount REAL,
        type TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES Users(user_id)
    )`);

    // 插入管理員帳號 (帳號: admin, 密碼: admin)
    db.run(`INSERT OR IGNORE INTO Users (username, password_hash, is_admin, wallet_balance) 
            VALUES ('admin', 'admin', 1, 0)`);

    // 插入測試買家帳號 (帳號: buyer, 密碼: buyer, 預給 500 元購物金)
    db.run(`INSERT OR IGNORE INTO Users (username, password_hash, is_admin, wallet_balance) 
            VALUES ('buyer', 'buyer', 0, 500)`);

    console.log("✅ 資料庫結構與預設資料初始化成功");
});

module.exports = db;