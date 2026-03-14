const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./shop.db');

db.serialize(() => {
    // 1. 使用者表 (含購物金與權限)
    db.run(`CREATE TABLE IF NOT EXISTS Users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        password_hash TEXT,
        is_admin BOOLEAN DEFAULT 0,
        wallet_balance REAL DEFAULT 0
    )`);

    // 2. 商品表 (區分新品/二手區與狀態)
    db.run(`CREATE TABLE IF NOT EXISTS Products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        price REAL,
        category TEXT, -- 'new' or 'used'
        status TEXT,   -- 'active', 'pending', 'archived'
        stock INTEGER
    )`);

    // 3. 訂單表與明細
    db.run(`CREATE TABLE IF NOT EXISTS Orders (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        final_amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Order_Items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id INTEGER,
        purchase_price REAL,
        buyback_status TEXT DEFAULT 'none' -- 'none', 'requested', 'completed'
    )`);

    // 4. 購物金紀錄
    db.run(`CREATE TABLE IF NOT EXISTS Wallet_Logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        change_amount REAL,
        type TEXT -- 'purchase', 'buyback_refund'
    )`);
});

module.exports = db;