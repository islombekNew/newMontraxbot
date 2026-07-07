const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');
const { sendTpl } = require('./templates');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Rate limit: API kvotasini bitta user yeb qo'ymasligi uchun
const RATE_PER_MIN = 4;
const RATE_PER_DAY = 40;
const usage = new Map(); // userId -> { stamps: [ts], day: 'YYYY-MM-DD', count }

function checkRate(userId) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  let u = usage.get(userId);
  if (!u || u.day !== today) u = { stamps: [], day: today, count: 0 };
  u.stamps = u.stamps.filter((ts) => now - ts < 60000);
  if (u.count >= RATE_PER_DAY) { usage.set(userId, u); return 'day'; }
  if (u.stamps.length >= RATE_PER_MIN) { usage.set(userId, u); return 'min'; }
  u.stamps.push(now);
  u.count++;
  usage.set(userId, u);
  return null;
}

// Sodda, faqat MONTRAX yo'nalishiga mos yordamchi
const SYSTEM_PROMPT = [
  'Sen MONTRAX kompaniyasining sodda va samimiy yordamchisisan.',
  'MONTRAX xizmatlari: Front-end (saytlar, React), Back-end (Node.js, API, Telegram botlar),',
  'Grafik dizayn (logo, banner, post), UI/UX dizayn (Figma), Mobil ilovalar (React Native),',
  'SMM va Reklama. Bundan tashqari botda Telegram Stars, Premium va sovg‘alar sotiladi.',
  '',
  'QOIDALAR:',
  '1. FAQAT shu mavzulardagi savollarga javob ber. Boshqa mavzu so‘ralsa, muloyimlik bilan',
  '   "Men faqat MONTRAX xizmatlari bo‘yicha yordam bera olaman" deb ayt.',
  '2. Javoblar QISQA bo‘lsin — 2-4 jumla, sodda til.',
  '3. Har javobda 1-3 ta mos emoji ishlat (😊 🚀 💻 🎨 ✅ kabi).',
  '4. Aniq narx so‘ralsa: botdagi tegishli bo‘limga qarashni yoki admin bilan bog‘lanishni ayt.',
  '5. Buyurtma bermoqchi bo‘lsa: menyudan kerakli xizmatni tanlab "Buyurtma berish" tugmasini bosishni ayt.',
  '6. Foydalanuvchi qaysi tilda yozsa (o‘zbek/rus/ingliz), o‘sha tilda javob ber.',
].join('\n');

async function askGemini(history) {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(GEMINI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: history.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })),
      generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.map((p) => p.text).join('');
  if (!text) throw new Error('Gemini bo‘sh javob');
  return text.trim();
}

function registerAI(bot, getLang, sendMainMenu) {
  bot.hears(allLangs('menu_ai'), async (ctx) => {
    const lang = await getLang(ctx);
    if (!process.env.GEMINI_API_KEY) {
      const s = await db.getSettings();
      return ctx.reply(t(lang, 'ai_no_key', { contact: s.contact.telegram }));
    }
    state.set(ctx.from.id, { action: 'ai:chat', data: { history: [] } });
    await sendTpl(ctx, 'ai_intro', t(lang, 'ai_intro'), {
      parse_mode: 'HTML',
      ...Markup.keyboard([[t(lang, 'ai_exit_btn')]]).resize(),
    });
  });

  bot.hears(allLangs('ai_exit_btn'), async (ctx) => {
    const lang = await getLang(ctx);
    state.clear(ctx.from.id);
    await ctx.reply(t(lang, 'ai_exited'));
    await sendMainMenu(ctx, lang);
  });
}

async function handleText(ctx, s, lang) {
  if (s.action !== 'ai:chat') return;

  const limited = checkRate(ctx.from.id);
  if (limited === 'min') return ctx.reply(t(lang, 'ai_limit'));
  if (limited === 'day') return ctx.reply(t(lang, 'ai_day_limit'));

  s.data.history.push({ role: 'user', text: ctx.message.text });
  s.data.history = s.data.history.slice(-8); // qisqa kontekst

  const waitMsg = await ctx.reply(t(lang, 'ai_thinking'));
  try {
    const answer = await askGemini(s.data.history);
    s.data.history.push({ role: 'model', text: answer });
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, answer)
      .catch(async () => ctx.reply(answer));
  } catch (err) {
    console.error('AI xato:', err.message);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, t(lang, 'ai_error'))
      .catch(() => {});
  }
}

module.exports = { registerAI, handleText };
