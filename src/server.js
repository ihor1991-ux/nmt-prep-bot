import express from 'express';
import { verifyCallbackSignature, buildCallbackResponse } from './payment.js';
import { deliverProduct } from './bot.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Обов'язково парсимо і JSON, і urlencoded запити (WayForPay може надсилати обома способами)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Базовий ендпоінт для перевірки працездатності сервера (Healthcheck)
app.get('/', (req, res) => {
  res.send('🚀 Сервер бота підготовки до НМТ працює!');
});

// Ендпоінт для вебхуку WayForPay
app.post('/payment/callback', async (req, res) => {
  console.log('📬 Отримано запит від WayForPay:', req.body);

  try {
    const callbackData = req.body;

    // 1. Перевіряємо, чи є обов'язкові поля
    if (!callbackData || !callbackData.orderReference || !callbackData.merchantSignature) {
      console.warn('⚠️ Отримано некоректний вебхук (відсутні обов\'язкові поля)');
      return res.status(400).send('Bad Request: Missing parameters');
    }

    // 2. Перевіряємо підпис безпеки від WayForPay
    const isValidSignature = verifyCallbackSignature(callbackData);

    if (!isValidSignature) {
      console.error('❌ Помилка верифікації підпису вебхуку WayForPay!');
      return res.status(400).send('Bad Request: Invalid signature');
    }

    console.log(`✅ Підпис верифіковано для замовлення: ${callbackData.orderReference}`);

    const orderId = callbackData.orderReference;
    const status = callbackData.transactionStatus;

    // 3. Обробляємо статус транзакції
    if (status === 'Approved') {
      console.log(`🎉 Оплата успішна для замовлення ${orderId}. Видаємо товар...`);
      await deliverProduct(orderId);
    } else {
      console.log(`ℹ️ Транзакція ${orderId} має статус: ${status} (не Approved)`);
    }

    // 4. Формуємо обов'язкову відповідь для WayForPay
    // Якщо WayForPay не отримає цю відповідь з правильним підписом, він вважатиме вебхук не доставленим і слатиме повторно.
    const responseJson = buildCallbackResponse(orderId);
    
    console.log('📤 Надсилаємо відповідь підтвердження для WayForPay:', responseJson);
    return res.status(200).json(responseJson);

  } catch (error) {
    console.error('❌ Критична помилка обробки вебхуку WayForPay:', error);
    return res.status(500).send('Internal Server Error');
  }
});

// Функція запуску сервера Express
export function startServer(bot) {
  // Додаємо обробку вебхука для Telegram
  app.use(bot.webhookCallback(`/bot${process.env.TELEGRAM_TOKEN}`));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Веб-сервер запущено на порту ${PORT}`);
    console.log(`🔗 Webhook Telegram: ${process.env.SERVER_URL || 'http://localhost:' + PORT}/bot${process.env.TELEGRAM_TOKEN}`);
    console.log(`🔗 Адреса для вебхуку WayForPay: ${process.env.SERVER_URL || 'http://localhost:' + PORT}/payment/callback`);
  });
}
export default app;
