import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

const client = new MongoClient(uri);

let db;

export async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db('nmt_bot'); // Ім'я вашої бази даних
    console.log('✅ Успішно підключено до MongoDB');
  }
  return db;
}

export async function initDatabase() {
  const db = await connectDB();
  
  // В MongoDB таблиці називаються колекціями.
  // Вони створюються автоматично при додаванні першого документа.
  // Але продукти ми ініціалізуємо тут.
  
  const productsCollection = db.collection('products');
  
  const products = [
    { _id: 'individual', title: '👤 Індивідуальні заняття', description: 'Індивідуальні заняття (60 хв).', price: 600.00, content: 'Посилання на запис: ...' },
    { _id: 'pair', title: '👥 Парне навчання', description: 'Парне навчання — 400 грн/60 хв.', price: 400.00, content: 'Посилання на запис: ...' },
    { _id: 'extern', title: '🎓 Екстерн-навчання', description: '4/5 занять на тиждень по 400 грн/60хв.', price: 400.00, content: 'Посилання на запис: ...' },
    { _id: 'tutor', title: '🤝 Тьюторський супровід', description: 'Тьюторський супровід — 500 грн/45 хв.', price: 500.00, content: 'Посилання на запис: ...' }
  ];

  await productsCollection.deleteMany({});
  await productsCollection.insertMany(products);
  
  console.log('🔹 База даних ініціалізована з актуальними продуктами!');
}

// Функції для роботи з користувачами
export async function saveUser(telegram_id, username, first_name) {
  const db = await connectDB();
  return db.collection('users').updateOne(
    { _id: telegram_id },
    { $set: { username, first_name, updated_at: new Date() } },
    { upsert: true }
  );
}

export async function getUser(telegram_id) {
  const db = await connectDB();
  return db.collection('users').findOne({ _id: telegram_id });
}

// Функції для роботи з продуктами
export async function getAllProducts() {
  const db = await connectDB();
  return db.collection('products').find({}).toArray();
}

export async function getProduct(id) {
  const db = await connectDB();
  return db.collection('products').findOne({ _id: id });
}

// Функції для роботи з замовленнями
export async function createOrder(orderId, telegram_id, product_id, amount) {
  const db = await connectDB();
  return db.collection('orders').insertOne({
    _id: orderId,
    telegram_id,
    product_id,
    amount,
    status: 'pending',
    created_at: new Date()
  });
}

export async function getOrder(orderId) {
  const db = await connectDB();
  return db.collection('orders').findOne({ _id: orderId });
}

export async function updateOrderStatus(orderId, status) {
  const db = await connectDB();
  return db.collection('orders').updateOne(
    { _id: orderId },
    { $set: { status, updated_at: new Date() } }
  );
}

// Функції для підтримки (чат)
export async function saveSupportMessage(admin_message_id, user_id) {
  const db = await connectDB();
  return db.collection('support_messages').updateOne(
    { _id: admin_message_id },
    { $set: { user_id, created_at: new Date() } },
    { upsert: true }
  );
}

export async function getSupportUserId(admin_message_id) {
  const db = await connectDB();
  const row = await db.collection('support_messages').findOne({ _id: admin_message_id });
  return row ? row.user_id : null;
}
