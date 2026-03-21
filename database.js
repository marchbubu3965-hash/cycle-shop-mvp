// const sqlite3 = require('sqlite3').verbose();
// const path = require('path');

// // 建議統一使用 .sqlite 或 .db，這裡沿用你的 shop.db
// const dbPath = path.resolve(__dirname, 'shop.db');
// const db = new sqlite3.Database(dbPath, (err) => {
//     if (err) {
//         console.error('❌ 資料庫連接失敗:', err.message);
//     } else {
//         console.log('✅ 已成功連接資料庫檔案:', dbPath);
//     }
// });

// db.serialize(() => {
//     console.log("正在初始化資料庫表格...");

//     // 1. 使用者與錢包表 (增加 password_hash 欄位備用)
//     db.run(`CREATE TABLE IF NOT EXISTS Users (
//         user_id INTEGER PRIMARY KEY AUTOINCREMENT,
//         username TEXT UNIQUE,
//         password_hash TEXT,
//         is_admin BOOLEAN DEFAULT 0,
//         wallet_balance REAL DEFAULT 0
//     )`);

//     // 2. 商品管理表 (重要：status 預設值設為 'active')
//     db.run(`CREATE TABLE IF NOT EXISTS Products (
//         product_id INTEGER PRIMARY KEY AUTOINCREMENT,
//         name TEXT NOT NULL,
//         description TEXT,
//         price REAL DEFAULT 0,
//         category TEXT DEFAULT 'clothes', 
//         status TEXT DEFAULT 'active',   
//         stock INTEGER DEFAULT 0
//     )`);

//     // 3. 訂單主表
//     db.run(`CREATE TABLE IF NOT EXISTS Orders (
//         order_id INTEGER PRIMARY KEY AUTOINCREMENT,
//         user_id INTEGER,
//         final_amount REAL DEFAULT 0, 
//         wallet_used REAL DEFAULT 0,  
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY(user_id) REFERENCES Users(user_id)
//     )`);

//     // 4. 訂單項目明細
//     db.run(`CREATE TABLE IF NOT EXISTS Order_Items (
//         item_id INTEGER PRIMARY KEY AUTOINCREMENT,
//         order_id INTEGER,
//         product_id INTEGER,
//         purchase_price REAL DEFAULT 0, 
//         buyback_status TEXT DEFAULT 'none', 
//         FOREIGN KEY(order_id) REFERENCES Orders(order_id),
//         FOREIGN KEY(product_id) REFERENCES Products(product_id)
//     )`);

//     // 5. 購物金變動紀錄
//     db.run(`CREATE TABLE IF NOT EXISTS Wallet_Logs (
//         log_id INTEGER PRIMARY KEY AUTOINCREMENT,
//         user_id INTEGER,
//         change_amount REAL,
//         type TEXT, 
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY(user_id) REFERENCES Users(user_id)
//     )`);

//     // 插入預設帳號 (使用 INSERT OR IGNORE 避免重複)
//     // 注意：這裡不指定 user_id，讓系統自動遞增，避免 ID 衝突
//     db.run(`INSERT OR IGNORE INTO Users (username, is_admin, wallet_balance) VALUES ('admin', 1, 0)`);
//     db.run(`INSERT OR IGNORE INTO Users (username, is_admin, wallet_balance) VALUES ('buyer_test', 0, 1000)`);

//     console.log("✅ 資料庫結構與預設資料初始化成功");
// });

// module.exports = db;

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

    db.run(`INSERT OR IGNORE INTO Users (username, is_admin, wallet_balance) VALUES ('admin', 1, 0)`);
    db.run(`INSERT OR IGNORE INTO Users (username, is_admin, wallet_balance) VALUES ('buyer_test', 0, 1000)`);

    console.log("✅ 資料庫結構與預設資料初始化成功");
});

module.exports = db;