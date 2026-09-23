import { Telegraf, Markup } from 'telegraf';
import {
  saveUser,
  getUser,
  getAllProducts,
  getProduct,
  createOrder,
  getOrder,
  updateOrderStatus,
  saveSupportMessage,
  getSupportUserId
} from './db.js';
import { createPaymentInvoice } from './payment.js';

// Завантаження токена бота та ID адміністратора
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : null;

if (!BOT_TOKEN) {
  console.error('❌ Помилка: Вкажіть TELEGRAM_TOKEN у файлі .env');
  process.exit(1);
}

export const bot = new Telegraf(BOT_TOKEN);

// Встановлення команд меню
bot.telegram.setMyCommands([
  { command: 'start', description: 'Запустити бота' },
  { command: 'catalog', description: '📚 Каталог послуг' },
  { command: 'help', description: 'ℹ️ Про школу' },
  { command: 'contact', description: '💬 Зв\'язатися з нами' }
]);

// Функція для перевірки, чи є користувач адміном
function isAdmin(ctx) {
  return ADMIN_CHAT_ID && ctx.from.id === ADMIN_CHAT_ID;
}

// 1. Команда /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || '';

  // Зберігаємо користувача в базу даних
  await saveUser(userId, username, firstName);

  let welcomeMessage = `Привіт, ${firstName}! 👋\n\n` +
    `Вітаємо в офіційному боті школи «Нова Укрмова»! 🇺🇦\n\n` +
    `Ми допомагаємо опанувати українську мову — від базового рівня до професійного. Обирайте свій формат навчання та досягайте успіхів разом з нами! 🚀`;

  // Якщо це адмін і ADMIN_CHAT_ID не налаштований правильно, покажемо йому підказку
  if (userId.toString() === process.env.ADMIN_CHAT_ID) {
    welcomeMessage += `\n\n⚙️ *Кабінет адміністратора активовано!*`;
  }

  await ctx.replyWithMarkdownV2(
    welcomeMessage.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1') // Екранування символів для MarkdownV2
  );
});

// 2. Команда /help або розділ "Про проект"
bot.command('help', async (ctx) => {
  const aboutText = `🏫 **Про школу «Нова Укрмова»**\n\n` +
    `Ми створюємо простір для ефективного вивчення української мови. Наші заняття — це поєднання методики, практики та індивідуального підходу.\n\n` +
    `✅ **Наші напрямки:**\n` +
    `• Індивідуальні та групові заняття.\n` +
    `• Парне навчання — 400 грн/60 хв.\n` +
    `• Підготовка до НМТ/ЗНО (інтенсиви).\n` +
    `• 🔸Екстерн-навчання — 4/5 занять на тиждень по 400 грн/60хв.\n` +
    `• 🔸Тьюторський супровід — 500 грн/45 хв.\n\n` +
    `💬 Якщо виникнуть питання, натисни кнопку «Зв'язатися з нами» і напиши повідомлення викладачу!`;

  await ctx.replyWithMarkdown(aboutText);
});

// 5. Кнопка "Зв'язатися з викладачем" (перенесено на команду /contact)
bot.command('contact', async (ctx) => {
  await ctx.reply(
    '💬 Напиши своє запитання або повідомлення нижче, і викладач відповість тобі найближчим часом!\n\n' +
    '⚠️ *Просто надішли повідомлення (текст, фото або голосове) прямо сюди, у діалог з ботом.*',
    { parse_mode: 'Markdown' }
  );
});

// 3. Розділ "Каталог послуг"
async function showCatalog(ctx) {
  try {
    const products = await getAllProducts();
    
    if (products.length === 0) {
      return ctx.reply('На жаль, каталог зараз порожній. Спробуйте пізніше.');
    }

    let messageText = '📚 **Оберіть зручний формат навчання:**\n\n';
    const buttons = [];

    for (const product of products) {
      messageText += `• *${product.title}* — ${product.price} грн\n`;
      buttons.push([Markup.button.callback(product.title, `details_${product.id}`)]);
    }

    const keyboard = Markup.inlineKeyboard(buttons);

    await ctx.replyWithMarkdown(messageText, keyboard);
  } catch (error) {
    console.error('Помилка показу каталогу:', error);
    await ctx.reply('Сталася помилка при завантаженні каталогу. Спробуйте ще раз.');
  }
}

bot.command('catalog', showCatalog);

// 4. Опрацювання кнопок "Детальніше" та "Купити"
bot.action(/^details_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const productId = ctx.match[1];
  const product = await getProduct(productId);

  if (!product) {
    return ctx.reply('Товар не знайдено.');
  }

  const messageText = `📚 *${product.title}*\n\n` +
    `${product.description}\n\n` +
    `💵 *Вартість:* ${product.price} грн\n\n` +
    `🔐 Після оплати ти отримаєш повний миттєвий доступ до всіх матеріалів прямо в цьому боті!`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Оплатити зараз', `buy_${product.id}`)]
  ]);

  await ctx.replyWithMarkdown(messageText, keyboard);
});

bot.action(/^buy_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const productId = ctx.match[1];
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'Клієнт';

  try {
    const product = await getProduct(productId);
    if (!product) {
      return ctx.reply('Товар не знайдено.');
    }

    await ctx.reply('⏳ Створюємо рахунок для оплати, зачекайте секунду...');

    // Створюємо унікальний ID замовлення
    const orderId = `nmt_${Date.now()}_${userId}`;
    await createOrder(orderId, userId, productId, product.price);

    // Генеруємо посилання на оплату через WayForPay
    const paymentUrl = await createPaymentInvoice(orderId, product.price, product.title, firstName);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('💳 Перейти до оплати', paymentUrl)],
      [Markup.button.callback('❌ Скасувати замовлення', `cancel_${orderId}`)]
    ]);

    const invoiceText = `🛒 **Замовлення створено!**\n\n` +
      `📦 *Товар:* ${product.title}\n` +
      `💵 *Сума:* ${product.price} грн\n\n` +
      `Натисни кнопку нижче для безпечної оплати карткою, Apple Pay або Google Pay.`;

    await ctx.replyWithMarkdown(invoiceText, keyboard);
  } catch (error) {
    console.error('Помилка при створенні замовлення:', error);
    await ctx.reply('❌ Не вдалося створити рахунок для оплати. Будь ласка, зверніться в підтримку або спробуйте пізніше.');
  }
});

// Скасування замовлення
bot.action(/^cancel_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const orderId = ctx.match[1];
  const order = await getOrder(orderId);

  if (order && order.status === 'pending') {
    await updateOrderStatus(orderId, 'failed');
    await ctx.reply('❌ Замовлення скасовано. Якщо ви захочете придбати його знову, просто відкрийте каталог.');
  } else {
    await ctx.reply('Не вдалося скасувати замовлення або воно вже оплачене.');
  }
});

// 6. Адмін-команди: Ручна активація замовлення (для тестів або якщо вебхук не працює локально)
bot.command('activate', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('⚠️ Формат команди: /activate <id_замовлення>');
  }

  const orderId = args[1];
  const order = await getOrder(orderId);

  if (!order) {
    return ctx.reply('❌ Замовлення з таким ID не знайдено в базі даних.');
  }

  if (order.status === 'paid') {
    return ctx.reply('ℹ️ Це замовлення вже активоване (оплачене).');
  }

  // Активуємо замовлення
  await deliverProduct(orderId);
  await ctx.reply(`✅ Замовлення ${orderId} успішно активоване вручну! Товар надіслано покупцю.`);
});

// 7. Функція видачі товару після оплати (використовується в bot.js та server.js)
export async function deliverProduct(orderId) {
  try {
    const order = await getOrder(orderId);
    if (!order) return console.error(`Замовлення ${orderId} не знайдено`);

    if (order.status === 'paid') {
      console.log(`Замовлення ${orderId} вже було оплачене раніше`);
      return;
    }

    // Оновлюємо статус в БД
    await updateOrderStatus(orderId, 'paid');

    const product = await getProduct(order.product_id);
    const userId = order.telegram_id;

    // Надсилаємо контент користувачу
    await bot.telegram.sendMessage(
      userId,
      `🎉 **Оплата пройшла успішно!**\n\n` +
      `Дякуємо за покупку курсу: *${product.title}*\n\n` +
      `${product.content}`,
      { parse_mode: 'Markdown' }
    );

    // Сповіщаємо адміна про покупку
    if (ADMIN_CHAT_ID) {
      const user = await getUser(userId);
      const usernameString = user.username ? `@${user.username}` : 'немає юзернейму';
      const adminAlert = `💸 **Нова оплата!**\n\n` +
        `👤 **Покупець:** ${user.first_name} (${usernameString}, ID: \`${userId}\`)\n` +
        `📦 **Товар:** ${product.title}\n` +
        `💵 **Сума:** ${order.amount} грн\n` +
        `🆔 **ID замовлення:** \`${orderId}\``;

      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminAlert, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error(`Помилка доставки товару за замовленням ${orderId}:`, error);
  }
}

// 8. Обробка повідомлень від клієнтів (Зворотний зв'язок)
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;

  // Якщо повідомлення від адміна — це відповідь на інше повідомлення
  if (isAdmin(ctx) && ctx.message.reply_to_message) {
    const adminMsgId = ctx.message.reply_to_message.message_id;
    
    // Шукаємо, якому користувачу призначена ця відповідь
    const targetUserId = await getSupportUserId(adminMsgId);

    if (targetUserId) {
      try {
        // Копіюємо повідомлення адміна користувачу (передає фото, голос, текст тощо)
        await ctx.telegram.copyMessage(targetUserId, ctx.chat.id, ctx.message.message_id);
        await ctx.reply('✅ Відповідь надіслана користувачу.');
      } catch (err) {
        console.error('Помилка відправки відповіді користувачу:', err);
        await ctx.reply('❌ Не вдалося надіслати відповідь. Можливо, користувач заблокував бота.');
      }
    } else {
      await ctx.reply('❌ Не вдалося знайти користувача для цієї відповіді. Можливо, повідомлення застаріло.');
    }
    return;
  }

  // Якщо це звичайний користувач пише запитання в бот
  if (!isAdmin(ctx)) {
    // Ігноруємо команди
    if (ctx.message.text && ctx.message.text.startsWith('/')) return;

    if (!ADMIN_CHAT_ID) {
      return ctx.reply('На жаль, чат підтримки тимчасово недоступний. Спробуйте пізніше.');
    }

    const usernameString = ctx.from.username ? `@${ctx.from.username}` : 'немає';
    const headerText = `📩 **Нове повідомлення від клієнта!**\n` +
      `👤 Ім'я: ${ctx.from.first_name}\n` +
      `🔗 Юзернейм: ${usernameString}\n` +
      `🆔 ID користувача: \`${userId}\`\n\n` +
      `*Відповідь надішліть просто відповівши (Reply) на це повідомлення:*`;

    try {
      // Спочатку надсилаємо шапку-інформацію про користувача
      const infoMsg = await ctx.telegram.sendMessage(ADMIN_CHAT_ID, headerText, { parse_mode: 'Markdown' });
      
      // Потім копіюємо саме повідомлення користувача (підтримує текст, картинки, файли)
      const copiedMsg = await ctx.telegram.copyMessage(ADMIN_CHAT_ID, ctx.chat.id, ctx.message.message_id);

      // Зв'язуємо ID копійованого повідомлення з ID користувача в базі даних
      await saveSupportMessage(copiedMsg.message_id, userId);

      await ctx.reply('📨 Твоє повідомлення надіслано викладачу! Тобі дадуть відповідь прямо сюди.');
    } catch (err) {
      console.error('Помилка пересилання повідомлення адміну:', err);
      await ctx.reply('❌ Сталася помилка при надсиланні повідомлення. Спробуйте пізніше.');
    }
  }
});
