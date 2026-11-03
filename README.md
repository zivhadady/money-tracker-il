# Money Tracker IL (מעקב הוצאות והכנסות למשפחה)

מערכת Local-First מאובטחת לניהול פיננסי אישי, איסוף וסנכרון נתונים מכל חשבונות הבנק, כרטיסי האשראי, קופות הגמל, הפנסיה ותוכניות החיסכון בישראל.

📖 **למדריך המשתמש המקיף צעד-אחר-צעד**: [GUIDE.md](file:///home/user/Downloads/mony%20traker/GUIDE.md)

---

## 🔒 אבטחה ופרטיות (Security & Zero-Knowledge Vault)
- **הצפנת מסד הנתונים**: תמיכה בהצפנת מסד הנתונים כולו ב-**AES-256-GCM** וגזירת מפתחות ב-**Scrypt** עם סיסמת מאסטר אישית.
- **הצפנת פרטי התחברות**: כל פרטי ההתחברות לבנקים ולחברות האשראי מוצפנים בצד השרת ואינם נשמרים כטקסט קריא.
- **נקי ממידע אישי**: הריפו נקי מכל מידע אישי, עוגיות או סיסמאות; נתוני המשתמש נשמרים אך ורק בתיקיית `data/` המוגנת על ידי `.gitignore` ו-`.dockerignore`.

---

## 🏗️ ארכיטקטורה מודולרית (Services Architecture)

המערכת מבוססת ארכיטקטורת Services מופרדת ומודולרית:
- `src/routes/apiRouter.js` & `src/routes/httpHelpers.js` - ניתוב בקשות HTTP.
- `src/services/vaultService.js` - ניהול כספת מוצפנת, נעילה ופתיחה.
- `src/services/dashboardService.js` - חישוב מדדי KPI, פילוח לפי קטגוריות, חשבונות, חברי משפחה ומגמות חודשיות.
- `src/services/transactionService.js` - ניהול תנועות, זיהוי כפילויות, סיווג אוטומטי ויצירת חוקים.
- `src/services/accountService.js` - ניהול חשבונות וכרטיסים, מטא-דאטה וסנכרון.
- `src/services/budgetService.js` - ניהול יעדי חיסכון ותקציבים חודשיים.
- `src/services/memberService.js` - ניהול פרופילי בני המשפחה.
- `src/services/scraperService.js` - סקרייפינג מול בנקים וכרטיסי אשראי ישראליים (`israeli-bank-scrapers`).
- `src/services/otpCoordinator.js` - תיאום קודי אימות דו-שלבי (SMS OTP) בחלון קופץ ייעודי ב-UI.
- `src/services/gemelNetApiService.js` - אינטגרציה ישירה מול ה-API הממשלתי (גמל-נט / פנסיה-נט ב-`data.gov.il`).
- `src/services/govScraperService.js` - חיבור למערכת ההזדהות הלאומית (הר הביטוח והר הכסף).

---

## 🐳 הפעלה באמצעות Docker (מומלץ)

הפעלת המערכת בקונטיינר הכולל את כל תלויות הדפדפן (Chromium) עבור משיכת נתונים אוטומטית:

```bash
# הרצה והרמת הקונטיינר ברקע
docker compose up -d

# צפייה בלוגים
docker compose logs -f

# כיבוי המערכת
docker compose down
```

המערכת תהיה זמינה בדפדפן בכתובת: **http://localhost:3000**

הנתונים יישמרו באופן קבוע בתיקיית `data/` במחשב המארח.

---

## 💻 הפעלה מקומית (ללא Docker)

דרישות קדם: **Node.js 22 ומעלה** (תמיכה מובנית ב-`node:sqlite`).

```bash
# התקנת תלויות
npm install

# הרצת בדיקות מודולריות
npm test

# הפעלת השרת
./start.sh
# או: npm start
```
