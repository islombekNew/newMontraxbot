require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const db = require('./src/db');
const state = require('./src/state');
const { t } = require('./src/i18n');
const services = require('./src/services');
const shop = require('./src/shop');
const profile = require('./src/profile');
const ai = require('./src/ai');
const admin = require('./src/admin');

if (!process.env.BOT_TOKEN || !process.env.ADMIN_ID) {
  console.error('\u274c .env faylida BOT_TOKEN va ADMIN_ID bo\u2018lishi shart!');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

/* ===== Til olish (user tili yoki default uz) ===== */
async function getLang(ctx) {
  const user = await db.getUser(ctx.from.id);
  return (user && user.lang) || 'uz';
}

/* ===== Asosiy menyu (rasmdagidek 15 ta tugma) ===== */
function mainMenuKeyboard(lang) {
  const k = (key) => t(lang, key);
  return Markup.keyboard([
    [k('menu_frontend'), k('menu_design')],
    [k('menu_backend'), k('menu_mobile')],
    [k('menu_uiux'), k('menu_smm')],
    [k('menu_stars'), k('menu_premium')],
    [k('menu_gift'), k('menu_referral')],
    [k('menu_orders'), k('menu_profile')],
    [k('menu_lang'), k('menu_contact')],
    [k('menu_ai')],
  ]).resize();
}

async function sendMainMenu(ctx, lang) {
  await ctx.reply(t(lang, 'main_menu'), mainMenuKeyboard(lang));
}

/* ===== Middleware: userni ro'yxatga olish ===== */
bot.use(async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) {
    await db.upsertUser(ctx.from).catch((e) => console.error('upsertUser:', e.message));
  }
  return next();
});

/* ===== Modullarni ulash ===== */
admin.registerAdmin(bot);
services.registerServices(bot, getLang);
shop.registerShop(bot, getLang);
profile.registerProfile(bot, getLang, sendMainMenu);
ai.registerAI(bot, getLang, sendMainMenu);

/* ===== /start (referal payload bilan) ===== */
bot.start(async (ctx) => {
  state.clear(ctx.from.id);
  const { user, isNew } = await db.upsertUser(ctx.from);

  // Referal: /start ref_123456
  const payload = ctx.payload || '';
  if (isNew && payload.startsWith('ref_')) {
    const referrerId = Number(payload.slice(4));
    if (referrerId) {
      const referrer = await db.applyReferral(ctx.from.id, referrerId);
      if (referrer) {
        const rLang = referrer.lang || 'uz';
        await ctx.telegram.sendMessage(
          referrerId,
          t(rLang, 'referral_joined', { count: referrer.referrals })
        ).catch(() => {});
      }
    }
  }

  // Til tanlanmagan bo'lsa avval til so'raladi
  if (!user.lang) {
    return ctx.reply(t('uz', 'choose_lang'), profile.langKeyboard());
  }

  const lang = user.lang;
  await ctx.reply(
    t(lang, 'start_welcome', { name: ctx.from.first_name || '' }),
    { parse_mode: 'HTML', ...mainMenuKeyboard(lang) }
  );
});

/* ===== Markaziy matn router ===== */
bot.on('text', async (ctx) => {
  const s = state.get(ctx.from.id);
  if (!s) return;
  const lang = await getLang(ctx);

  if (s.action.startsWith('admin:') && admin.isAdmin(ctx)) return admin.handleText(ctx, s);
  if (s.action.startsWith('order:')) return services.handleText(ctx, s, lang);
  if (s.action.startsWith('gift:')) return shop.handleText(ctx, s, lang);
  if (s.action === 'ai:chat') return ai.handleText(ctx, s, lang);
});

/* ===== Markaziy rasm router ===== */
bot.on('photo', async (ctx) => {
  const s = state.get(ctx.from.id);
  if (!s) return;
  const lang = await getLang(ctx);
  if (s.action === 'shop:photo') return shop.handlePhoto(ctx, s, lang);
  if (s.action.startsWith('admin:') && admin.isAdmin(ctx)) return admin.handleMedia(ctx, s);
});

bot.on('video', async (ctx) => {
  const s = state.get(ctx.from.id);
  if (s && s.action.startsWith('admin:') && admin.isAdmin(ctx)) return admin.handleMedia(ctx, s);
});

/* ===== Global xatolik ===== */
bot.catch((err, ctx) => {
  console.error('\u274c Bot xatosi:', err.message, '| update:', ctx.updateType);
});

/* ===== Ishga tushirish ===== */
bot.launch().then(() => console.log('\u2705 MONTRAX bot ishga tushdi!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
