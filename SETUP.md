# 🚀 MONTRAX Bot — O'rnatish qo'llanmasi

## 1. Talablar
- Node.js 18+ (https://nodejs.org)

## 2. O'rnatish

```bash
cd montrax-bot
npm install
npm start
```

Konsolda `✅ MONTRAX bot ishga tushdi!` chiqsa — tayyor. Noutbuk yoniq turganda bot ishlaydi.

## 3. ⚠️ XAVFSIZLIK — TOKENNI YANGILANG!

Token chatda yuborilgani uchun uni almashtirish SHART:
1. @BotFather → `/mybots` → botni tanlang
2. **API Token** → **Revoke current token**
3. Yangi tokenni `.env` faylga yozing

## 4. 🤖 AI Assistant yoqish (ixtiyoriy)

1. https://aistudio.google.com/apikey — bepul Gemini API key oling
2. `.env` ga yozing: `GEMINI_API_KEY=AIza...`
3. Botni qayta ishga tushiring

Key bo'lmasa AI tugmasi "sozlanmagan" deb chiqadi, qolgan hammasi ishlayveradi.

## 5. ⚙️ Sozlamalar

**Bot ichidan (/admin → Sozlamalar):** karta raqami, Telegram kontakt, telefon, kanal.

**`data/settings.json` faylidan:** xizmat narxlari, Stars paketlari, Premium tariflar, sovg'alar ro'yxati. Faylni tahrirlab botni qayta ishga tushiring.

## 6. 📋 Bot funksiyalari

### User tomonda (3 til: 🇺🇿 🇷🇺 🇬🇧):
| Bo'lim | Nima qiladi |
|---|---|
| 💻🎨🖥📱✏️📈 6 ta xizmat | Tavsif + narx → 🛒 Buyurtma (tavsif → byudjet → muddat → tel → tasdiqlash) |
| ⭐ Yulduzlar | Paket tanlash → karta → "To'lov qildim" → skrinshot → admin tasdiqlaydi |
| 👑 Premium | 3/6/12 oy tariflar, xuddi shu to'lov flow |
| 🎁 Sovg'a | Oluvchi @username → sovg'a tanlash → to'lov |
| 👥 Referal | Shaxsiy havola, takliflar soni, har 5 do'st = 5% chegirma |
| 📦 Buyurtmalarim | Barcha buyurtma va to'lovlar statusi bilan |
| 👤 Profilim | ID, ism, sana, statistika |
| 🌐 Til | uz / ru / en — butun bot tarjima qilinadi |
| 📞 Bog'lanish | Kontaktlar (sozlamalardan) |
| 🤖 AI Assistant | Gemini bilan suhbat (MONTRAX haqida biladi) |

### Admin tomonda (`/admin`):
- 📦 Buyurtmalar — ro'yxat, tafsilot, status o'zgartirish (Qabul/Jarayonda/Bajarildi/Rad) — user avtomatik xabar oladi
- 💸 To'lovlar — ro'yxat + jami daromad; skrinshotli to'lovlarni ✅/❌
- 👥 Userlar, 📊 Statistika (userlar, buyurtmalar, daromad)
- ⚙️ Sozlamalar, 📣 Hammaga xabar (broadcast)

## 7. 🚂 Railway'ga deploy (keyinchalik)

1. Loyihani GitHub'ga yuklang (`.env` YUKLANMAYDI — `.gitignore` da)
2. Railway → New Project → Deploy from GitHub
3. Variables: `BOT_TOKEN`, `ADMIN_ID`, `GEMINI_API_KEY`
4. Start command: `npm start` — tayyor

⚠️ Eslatma: Railway'da fayl tizimi deploy'da qayta yaratiladi — `data/` papkadagi ma'lumotlar yo'qolishi mumkin. Jiddiy foydalanishda PostgreSQL + Prisma'ga o'tish tavsiya etiladi (xohlasangiz keyin yordamlashaman). Hozircha lokal/test uchun JSON yetarli.

## 8. 🌐 Saytga ulash (keyinchalik)

Bot alohida servis bo'lib ishlaydi. Saytga ulashning 2 yo'li:
- Saytda `https://t.me/botingiz` havolasi / Telegram Login Widget
- Yoki botga Express API qo'shib, sayt buyurtmalarni shu API orqali yuborishi (kerak bo'lsa qilamiz)

## 9. Project structure

```
montrax-bot/
├── bot.js              # Entry point, menyu, routerlar
├── package.json
├── .env                # Token, admin ID, Gemini key
├── locales/
│   ├── uz.json         # 🇺🇿 barcha matnlar
│   ├── ru.json         # 🇷🇺
│   └── en.json         # 🇬🇧
├── src/
│   ├── db.js           # JSON database (atomik yozish)
│   ├── state.js        # Multi-step flow holati
│   ├── i18n.js         # Tarjima tizimi
│   ├── services.js     # 6 ta xizmat + buyurtma flow
│   ├── shop.js         # Stars / Premium / Sovg'a + to'lov
│   ├── profile.js      # Profil, buyurtmalar, referal, til, kontakt
│   ├── ai.js           # Gemini AI Assistant
│   └── admin.js        # Admin panel
└── data/
    ├── users.json
    ├── orders.json
    ├── payments.json
    └── settings.json   # Narxlar, karta, kontaktlar
```
