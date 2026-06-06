# Noru

Суперпростий MVP на `HTML + CSS + JavaScript + Supabase` для списку закладів у Празі.

## Що вже є

- Основний view зі списком апрувнутих закладів
- View для додавання нового закладу
- Reviewer view для логіну та апруву pending-записів
- Пошук по назві, коментарю та полі `owners`
- Клікабельні URL усередині коментарів

## Структура

- [index.html](/Users/ihor.kurnytskyi/Documents/ru-no/index.html)
- [styles.css](/Users/ihor.kurnytskyi/Documents/ru-no/styles.css)
- [app.js](/Users/ihor.kurnytskyi/Documents/ru-no/app.js)
- [config.js](/Users/ihor.kurnytskyi/Documents/ru-no/config.js)
- [supabase/schema.sql](/Users/ihor.kurnytskyi/Documents/ru-no/supabase/schema.sql)

## Як підняти

1. Створи новий проєкт у Supabase.
2. В SQL Editor виконай [supabase/schema.sql](/Users/ihor.kurnytskyi/Documents/ru-no/supabase/schema.sql).
3. Встав `Project URL` і `publishable key` у [config.js](/Users/ihor.kurnytskyi/Documents/ru-no/config.js).
4. Запусти локальний сервер: `node serve.mjs`
5. Публічний сайт відкрий на `http://localhost:4173`
6. Адмін-панель відкрий на `http://localhost:4173/admin.html`
7. В адмін-панелі створи акаунт і натисни `Стати першим рев’юером`.

## Важливо

Не відкривай [index.html](/Users/ihor.kurnytskyi/Documents/ru-no/index.html) як `file://...`, бо браузер блокує частину запитів для локальних файлів. `Noru` треба відкривати тільки через локальний HTTP URL, наприклад `http://localhost:4173`.

## Як працює доступ

- Будь-хто може створити запис у статусі `pending`
- У публічному списку видно тільки `approved`
- Перший залогінений користувач може самостійно забрати reviewer-роль
- Після цього тільки користувач із таблиці `reviewers` може бачити pending-записи та змінювати статус

## Нотатка

Це саме MVP. Для продакшну я б ще додав rate limiting, captcha для форми, audit log для рев’ю та нормалізацію посилань / owner-даних.
