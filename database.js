const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 建立或連接資料庫檔案
const dbPath = path.resolve(__dirname, 'shop.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("正在初始化資料庫表格...");

    // 1. 使用者與錢包表
    db.run(`CREATE TABLE IF NOT EXISTS Users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        is_admin BOOLEAN DEFAULT 0,
        wallet_balance REAL DEFAULT 0
    )`);

    // 2. 商品管理表
    db.run(`CREATE TABLE IF NOT EXISTS Products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        price REAL,
        category TEXT, 
        status TEXT,   
        stock INTEGER DEFAULT 1
    )`);

    // 3. 訂單主表
    db.run(`CREATE TABLE IF NOT EXISTS Orders (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        final_amount REAL, 
        wallet_used REAL,  
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES Users(user_id)
    )`);

    // 4. 訂單項目明細
    db.run(`CREATE TABLE IF NOT EXISTS Order_Items (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id INTEGER,
        purchase_price REAL, 
        buyback_status TEXT DEFAULT 'none', 
        FOREIGN KEY(order_id) REFERENCES Orders(order_id),
        FOREIGN KEY(product_id) REFERENCES Products(product_id)
    )`);

    // 5. 購物金變動紀錄
    db.run(`CREATE TABLE IF NOT EXISTS Wallet_Logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        change_amount REAL,
        type TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES Users(user_id)
    )`);

    // 重要：確保預設資料存在
    // 使用 INSERT OR IGNORE 確保不會因為重複執行而報錯
    db.run(`INSERT OR IGNORE INTO Users (user_id, username, is_admin, wallet_balance) VALUES (1, 'admin', 1, 0)`);
    db.run(`INSERT OR IGNORE INTO Users (user_id, username, is_admin, wallet_balance) VALUES (2, 'buyer_test', 0, 100)`);

    console.log("✅ 資料庫結構與預設資料初始化成功");
});

module.exports = db;