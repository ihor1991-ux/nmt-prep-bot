import 'dotenv/config'; // Автоматично завантажує змінні з .env
import { initDatabase } from './db.js';
import { bot } from './bot.js';
import { startServer } from './server.js';

async function main() {
  console.log('🚀 Запуск бота підготовки до НМТ...');

  try {
    // 1. Ініціалізуємо базу даних
    await initDatabase();

    // 2. Запускаємо Telegram-бота
    // Використовуємо long polling для отримання повідомлень
    bot.launch();
    console.log('🤖 Telegram-бот успішно запущений!');

    // 3. Запускаємо веб-сервер Express для вебхуків WayForPay
    startServer();

    // Налаштовуємо граційне завершення роботи при зупинці процесу (наприклад, Ctrl+C)
    process.once('SIGINT', () => {
      console.log('🛑 Зупинка сервера...');
      bot.stop('SIGINT');
      process.exit(0);
    });

    process.once('SIGTERM', () => {
      console.log('🛑 Зупинка сервера за запитом системи...');
      bot.stop('SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Помилка при старті проекту:', error);
    process.exit(1);
  }
}

main();
