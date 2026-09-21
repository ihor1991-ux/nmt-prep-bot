import Database from 'better-sqlite3';

// Шлях до файлу бази даних
const dbPath = './database.db';
const db = new Database(dbPath);

// Обгортки для синхронних методів better-sqlite3
export const dbRun = (sql, params = []) => {
  const stmt = db.prepare(sql);
  const info = stmt.run(...params);
  return Promise.resolve(info); // Повертаємо Promise для сумісності з поточним кодом
};

export const dbGet = (sql, params = []) => {
  const stmt = db.prepare(sql);
  const row = stmt.get(...params);
  return Promise.resolve(row);
};

export const dbAll = (sql, params = []) => {
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return Promise.resolve(rows);
};

// Ініціалізація таблиць бази даних
export async function initDatabase() {
  // Створення таблиці користувачів
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Створення таблиці товарів (уроків/курсів)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      content TEXT NOT NULL -- Те, що клієнт отримує після оплати (наприклад, посилання або текст)
    )
  `);

  // Створення таблиці замовлень
  await dbRun(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, -- Наш унікальний id замовлення для WayForPay
      telegram_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, paid, failed
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Створення таблиці для зв'язку адміна з користувачами (чат підтримки)
  // Вона пов'язує ID повідомлення, яке було надіслано адміну, з ID користувача, який його написав
  await dbRun(`
    CREATE TABLE IF NOT EXISTS support_messages (
      admin_message_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Додамо нові продукти
  const existingProducts = await dbAll('SELECT * FROM products');
  if (existingProducts.length === 0) {
    const newProducts = [
      ['individual_student', '👤 Індивідуальні (учень)', 'Індивідуальні заняття для школярів.', 600.00, 'Посилання на запис: ...'],
      ['individual_adult', '👤 Індивідуальні (дорослий)', 'Індивідуальні заняття для дорослих.', 700.00, 'Посилання на запис: ...'],
      ['pair_student', '👥 Парне навчання (учень)', 'Парні заняття для школярів.', 250.00, 'Посилання на запис: ...'],
      ['pair_adult', '👥 Парне навчання (дорослий)', 'Парні заняття для дорослих.', 300.00, 'Посилання на запис: ...'],
      ['group_student', '👥 Групове навчання (учень)', 'Групові заняття для школярів (до 4 людей).', 200.00, 'Посилання на запис: ...'],
      ['group_adult', '👥 Групове навчання (дорослий)', 'Групові заняття для дорослих (до 4 людей).', 250.00, 'Посилання на запис: ...']
    ];

    for (const p of newProducts) {
      await dbRun(
        'INSERT INTO products (id, title, description, price, content) VALUES (?, ?, ?, ?, ?)',
        p
      );
    }
    console.log('🔹 База даних ініціалізована з новими продуктами!');
  } else {
    console.log('🔹 База даних підключена успішно!');
  }
}

// Функції для роботи з користувачами
export async function saveUser(telegram_id, username, first_name) {
  return dbRun(
    'INSERT OR REPLACE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
    [telegram_id, username, first_name]
  );
}

export async function getUser(telegram_id) {
  return dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegram_id]);
}

// Функції для роботи з продуктами
export async function getAllProducts() {
  return dbAll('SELECT * FROM products');
}

export async function getProduct(id) {
  return dbGet('SELECT * FROM products WHERE id = ?', [id]);
}

// Функції для роботи з замовленнями
export async function createOrder(orderId, telegram_id, product_id, amount) {
  return dbRun(
    'INSERT INTO orders (id, telegram_id, product_id, amount, status) VALUES (?, ?, ?, ?, "pending")',
    [orderId, telegram_id, product_id, amount]
  );
}

export async function getOrder(orderId) {
  return dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
}

export async function updateOrderStatus(orderId, status) {
  const now = new Date().toISOString();
  return dbRun(
    'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
    [status, now, orderId]
  );
}

// Функції для підтримки (чат)
export async function saveSupportMessage(admin_message_id, user_id) {
  return dbRun(
    'INSERT OR REPLACE INTO support_messages (admin_message_id, user_id) VALUES (?, ?)',
    [admin_message_id, user_id]
  );
}

export async function getSupportUserId(admin_message_id) {
  const row = await dbGet('SELECT user_id FROM support_messages WHERE admin_message_id = ?', [admin_message_id]);
  return row ? row.user_id : null;
}
