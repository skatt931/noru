# Noru

`Noru` — це простий статичний сайт на `HTML + CSS + JavaScript`, який працює з `Supabase` як із бекендом.

Проєкт складається з:
- публічної сторінки зі списком апрувнутих закладів у Празі
- форми для додавання нового закладу
- окремої адмін-панелі для модерації заявок і видалення опублікованих записів

## Як це працює

### Публічна частина

- Користувач відкриває [index.html](/Users/ihor.kurnytskyi/Documents/ru-no/index.html)
- Бачить лише `approved` записи
- Може шукати по назві, коментарю та полі `owners`
- Може додати новий заклад через форму

Новий запис:
- потрапляє в Supabase зі статусом `pending`
- не показується публічно, доки його не апрувне адміністратор

### Адмін-панель

- Адмін відкриває [admin.html](/Users/ihor.kurnytskyi/Documents/ru-no/admin.html)
- Логіниться через `Supabase Auth`
- Якщо це перший адмін у системі, натискає `Стати першим рев’юером`

В адмінці можна:
- апрувнути `pending` запис
- відхилити `pending` запис
- видалити вже опублікований запис у блоці `Опубліковані заклади`

## Поточна модель доступу

Зараз у проєкті є одна прикладна роль:
- `reviewer`

У поточній схемі:
- тільки один користувач може бути `reviewer`
- саме цей користувач фактично є єдиним адміном апки

Це реалізовано через таблицю `public.reviewers` та singleton-обмеження в [supabase/schema.sql](/Users/ihor.kurnytskyi/Documents/ru-no/supabase/schema.sql).

## Структура проєкту

- [index.html](/Users/ihor.kurnytskyi/Documents/ru-no/index.html) — публічний сайт
- [admin.html](/Users/ihor.kurnytskyi/Documents/ru-no/admin.html) — окрема адмін-панель
- [styles.css](/Users/ihor.kurnytskyi/Documents/ru-no/styles.css) — усі стилі
- [app.js](/Users/ihor.kurnytskyi/Documents/ru-no/app.js) — логіка клієнта, Supabase, auth, moderation
- [config.js](/Users/ihor.kurnytskyi/Documents/ru-no/config.js) — локальний конфіг з Supabase credentials
- [config.example.js](/Users/ihor.kurnytskyi/Documents/ru-no/config.example.js) — шаблон конфига
- [serve.mjs](/Users/ihor.kurnytskyi/Documents/ru-no/serve.mjs) — простий локальний HTTP-сервер
- [supabase/schema.sql](/Users/ihor.kurnytskyi/Documents/ru-no/supabase/schema.sql) — схема бази та RLS policy

## Локальний запуск

### 1. Підготуй Supabase

Потрібно:
- створити Supabase project
- виконати SQL зі [supabase/schema.sql](/Users/ihor.kurnytskyi/Documents/ru-no/supabase/schema.sql)
- взяти `Project URL` і `Publishable key`

### 2. Налаштуй конфіг

Скопіюй [config.example.js](/Users/ihor.kurnytskyi/Documents/ru-no/config.example.js) у `config.js` і встав свої значення:

```js
window.NORU_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
};
```

Примітка:
- `config.js` підключається напряму в браузері
- тому тут має бути тільки публічний браузерний ключ
- `service_role` ключ у фронтенд класти не можна

### 3. Запусти локальний сервер

```bash
node serve.mjs
```

Після запуску:
- публічний сайт: `http://localhost:4173`
- адмінка: `http://localhost:4173/admin.html`

## Важливо про `file://`

Не відкривай [index.html](/Users/ihor.kurnytskyi/Documents/ru-no/index.html) або [admin.html](/Users/ihor.kurnytskyi/Documents/ru-no/admin.html) як `file://...`.

Через політики безпеки браузера:
- auth може не працювати
- fetch до Supabase може ламатися
- сторінка може зависати або поводитися непередбачувано

Правильний спосіб:
- завжди відкривати проєкт через `http://localhost:4173`

## Як стати адміном

Якщо це новий проєкт:
1. Відкрий `http://localhost:4173/admin.html`
2. Створи акаунт
3. Увійди
4. Натисни `Стати першим рев’юером`

Після цього:
- твій користувач буде доданий у `public.reviewers`
- ти отримаєш роль `reviewer`
- саме ти зможеш модерувати записи

## База даних

### Основні таблиці

`public.venues`
- `id`
- `name`
- `google_maps_url`
- `comment`
- `owners`
- `status`
- `created_at`
- `approved_at`
- `approved_by`

`public.reviewers`
- `user_id`
- `created_at`

### Статуси записів

- `pending` — щойно надісланий запис
- `approved` — опублікований запис
- `rejected` — відхилений запис

### RLS / доступ

Поточні правила такі:
- `anon` і `authenticated` можуть додавати тільки `pending` записи
- усі бачать лише `approved` записи
- `reviewer` бачить `pending`
- `reviewer` може апдейтити статус запису
- `reviewer` може видаляти записи

## Типовий робочий процес

### Додавання нового закладу

1. Користувач відкриває публічний сайт
2. Заповнює форму
3. Запис зберігається в `venues` як `pending`

### Модерація

1. Адмін заходить у `admin.html`
2. Відкриває блок `Очікують на апрув`
3. Натискає `Апрувнути` або `Відхилити`

### Видалення

1. Адмін заходить у блок `Опубліковані заклади`
2. Натискає `Видалити запис`
3. Запис видаляється з бази і з публічного списку

## Як працювати з правами далі

Зараз система спеціально обмежена одним reviewer.

Це означає:
- другого адміна через UI зараз додати не можна
- поточний reviewer є єдиним адміном апки

Якщо в майбутньому захочеш кількох адмінів, треба буде:
- прибрати singleton-обмеження для `public.reviewers`
- додати UI для видачі ролей
- або керувати таблицею `reviewers` вручну через Supabase

## Деплой

Проєкт статичний, тому його можна викладати на:
- GitHub Pages
- Netlify
- Vercel
- будь-який інший static hosting

Важливо перед деплоєм оновити в Supabase:
- `Authentication -> URL Configuration`

Потрібно виставити:
- `Site URL` на продакшн-домен
- `Redirect URLs` для продакшн-домену і локального `localhost`

Приклад:
- `https://YOUR-USERNAME.github.io/ru-no/`
- `https://YOUR-USERNAME.github.io/ru-no/admin.html`
- `http://localhost:4173/`
- `http://localhost:4173/admin.html`

## Перевірка після змін

Базова перевірка JS:

```bash
node --check app.js
```

Що бажано перевіряти вручну:
- завантаження списку на публічній сторінці
- submit нового закладу
- вхід в адмінку
- апрув pending-запису
- видалення опублікованого запису

## Зауваження по безпеці

Це MVP, тому в майбутньому варто додати:
- captcha або інший захист від спаму
- rate limiting
- audit log для адмінських дій
- нормальні ролі `owner/admin/reviewer`
- soft delete замість повного видалення
- ротацію ключів, якщо `config.js` колись потрапляв у публічний репозиторій
