import crypto from 'crypto';

// Отримання налаштувань з .env або використання тестових даних WayForPay
const MERCHANT_ACCOUNT = process.env.WFP_MERCHANT_ACCOUNT || 'test_merch_n1';
const MERCHANT_SECRET = process.env.WFP_MERCHANT_SECRET || 'flockt1sst3st';
const MERCHANT_DOMAIN = process.env.WFP_MERCHANT_DOMAIN || 'https://example.com';
const SERVER_URL = process.env.SERVER_URL || 'https://example.com'; // Наш сервер для прийому вебхуків

/**
 * Генерує HMAC-MD5 підпис для WayForPay
 */
function calculateHmacMd5(dataString, key) {
  return crypto.createHmac('md5', key).update(dataString).digest('hex');
}

/**
 * Генерує посилання на оплату (створює інвойс в системі WayForPay)
 * @param {string} orderId - Унікальний ID замовлення
 * @param {number} amount - Сума до оплати
 * @param {string} productName - Назва товару
 * @param {string} userFirstName - Ім'я користувача
 * @returns {Promise<string>} - Посилання на оплату
 */
export async function createPaymentInvoice(orderId, amount, productName, userFirstName = 'Клієнт') {
  const orderDate = Math.floor(Date.now() / 1000);
  const currency = 'UAH';
  const productCount = 1;

  // Формуємо рядок для підпису згідно з документацією WayForPay
  // Порядок полів важливий:
  // merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice
  const signatureString = [
    MERCHANT_ACCOUNT,
    MERCHANT_DOMAIN,
    orderId,
    orderDate,
    amount,
    currency,
    productName,
    productCount,
    amount
  ].join(';');

  const signature = calculateHmacMd5(signatureString, MERCHANT_SECRET);

  const requestBody = {
    transactionType: 'CREATE_INVOICE',
    merchantAccount: MERCHANT_ACCOUNT,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: MERCHANT_DOMAIN,
    merchantSignature: signature,
    apiVersion: 1,
    orderReference: orderId,
    orderDate: orderDate,
    amount: amount,
    currency: currency,
    productName: [productName],
    productPrice: [amount],
    productCount: [productCount],
    clientFirstName: userFirstName,
    serviceUrl: `${SERVER_URL}/payment/callback` // Адреса нашого сервера для вебхуків
  };

  try {
    const response = await fetch('https://api.wayforpay.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (result.invoiceUrl) {
      return result.invoiceUrl;
    } else {
      throw new Error(result.reason || 'Невідома помилка при створенні рахунку');
    }
  } catch (error) {
    console.error('❌ Помилка при генерації інвойсу WayForPay:', error);
    // Якщо сервіс недоступний або сталася помилка, генеруємо пряме посилання на сторінку оплати (fallback),
    // але краще кинути помилку, щоб користувач бачив проблему
    throw error;
  }
}

/**
 * Перевіряє підпис вебхуку від WayForPay
 * @param {object} callbackData - Дані від WayForPay
 * @returns {boolean} - true, якщо підпис валідний
 */
export function verifyCallbackSignature(callbackData) {
  const {
    merchantAccount,
    orderReference,
    amount,
    currency,
    authCode,
    cardPan,
    transactionStatus,
    reasonCode,
    reason,
    merchantSignature
  } = callbackData;

  // Рядок для підпису верифікації зворотного запиту:
  // merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode;reason
  const signatureString = [
    merchantAccount,
    orderReference,
    amount,
    currency,
    authCode,
    cardPan,
    transactionStatus,
    reasonCode,
    reason
  ].join(';');

  const calculatedSignature = calculateHmacMd5(signatureString, MERCHANT_SECRET);

  return calculatedSignature === merchantSignature;
}

/**
 * Формує відповідь для WayForPay після успішної обробки вебхуку
 * @param {string} orderId - ID замовлення
 * @returns {object} - JSON відповіді
 */
export function buildCallbackResponse(orderId) {
  const status = 'accept';
  const time = Math.floor(Date.now() / 1000);

  // Рядок для підпису відповіді:
  // orderReference;status;time
  const signatureString = [orderId, status, time].join(';');
  const signature = calculateHmacMd5(signatureString, MERCHANT_SECRET);

  return {
    orderReference: orderId,
    status: status,
    time: time,
    signature: signature
  };
}
