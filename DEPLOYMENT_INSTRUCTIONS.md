# 🚀 ИНСТРУКЦИЯ ПО ДЕПЛОЮ НА PRODUCTION

**Дата:** 2025-10-22
**Ветка с кодом:** `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
**Статус:** ✅ Код готов, требуется деплой на DigitalOcean

---

## 📋 ЧЕКЛИСТ ДЕПЛОЯ (5 шагов)

- [ ] **Шаг 1:** Merge feature branch в main (вручную)
- [ ] **Шаг 2:** Push в main для auto-deploy
- [ ] **Шаг 3:** Дождаться завершения деплоя на DigitalOcean
- [ ] **Шаг 4:** Запустить миграцию БД в консоли DigitalOcean
- [ ] **Шаг 5:** Протестировать все endpoints

**Время:** ~10-15 минут

---

## 🔧 ШАГ 1: MERGE FEATURE BRANCH В MAIN

### Вариант A: Через GitHub Web Interface (РЕКОМЕНДУЕТСЯ)

1. **Открыть GitHub:**
   ```
   https://github.com/maxximseo/link-manager
   ```

2. **Создать Pull Request:**
   - Нажать "Pull requests" → "New pull request"
   - Base: `main` (или создать если нет)
   - Compare: `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
   - Нажать "Create Pull Request"
   - Заголовок: "Deploy billing system - 100% complete"
   - Описание можно скопировать из FINAL_100_PERCENT_COMPLETE.md

3. **Merge Pull Request:**
   - Review changes (опционально)
   - Нажать "Merge pull request"
   - Confirm merge

4. **Результат:**
   - Код автоматически попадет в main
   - DigitalOcean автоматически начнет деплой

---

### Вариант B: Через командную строку (локально)

```bash
# 1. Клонировать репозиторий (если ещё не клонирован)
git clone https://github.com/maxximseo/link-manager.git
cd link-manager

# 2. Fetch все ветки
git fetch --all

# 3. Checkout feature branch
git checkout claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ
git pull origin claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ

# 4. Checkout или создать main branch
git checkout main || git checkout -b main origin/main || git checkout -b main

# 5. Merge feature branch
git merge claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ

# 6. Push to main
git push origin main
```

**После push в main:**
- DigitalOcean автоматически определит изменения
- Начнется процесс деплоя (5-10 минут)

---

## 🔄 ШАГ 2: МОНИТОРИНГ ДЕПЛОЯ НА DIGITALOCEAN

### Проверить статус деплоя:

1. **Открыть DigitalOcean App Platform:**
   ```
   https://cloud.digitalocean.com/apps
   ```

2. **Найти приложение:**
   - Название: link-manager (или shark-app-9kv6u)
   - URL: https://shark-app-9kv6u.ondigitalocean.app

3. **Перейти во вкладку "Deployments":**
   - Должен появиться новый deployment с коммитом из main
   - Статус: "Building" → "Deploying" → "Active"

4. **Дождаться завершения:**
   - Обычно занимает 5-10 минут
   - Статус должен стать "Active" с зеленой галочкой

### Логи деплоя:

Если нужно посмотреть логи:
```bash
# Через CLI (если установлен doctl)
doctl apps logs <app-id> --type BUILD --follow
```

Или через Web Interface:
- Apps → link-manager → Runtime Logs

---

## 💾 ШАГ 3: ЗАПУСК МИГРАЦИИ БД (КРИТИЧНО!)

### ⚠️ БЕЗ ЭТОГО ШАГА СИСТЕМА НЕ БУДЕТ РАБОТАТЬ!

После успешного деплоя нужно запустить миграцию БД для создания новых таблиц и колонок.

### Способ 1: Через DigitalOcean Console (РЕКОМЕНДУЕТСЯ)

1. **Открыть App Console:**
   - Apps → link-manager → Console
   - Или прямая ссылка в разделе "Settings"

2. **Запустить миграцию:**
   ```bash
   cd /workspace
   node database/run_billing_migration.js
   ```

3. **Ожидаемый результат:**
   ```
   🔄 Starting billing system migration...
   ✅ Migration completed successfully!

   📊 Verifying users table...
   Users columns added: [
     { column_name: 'balance', data_type: 'numeric', ... },
     { column_name: 'total_spent', data_type: 'numeric', ... },
     { column_name: 'current_discount', data_type: 'integer', ... },
     ...
   ]

   📊 Verifying new tables...
   New tables created: [
     'audit_log',
     'discount_tiers',
     'notifications',
     'renewal_history',
     'transactions'
   ]

   💰 Discount tiers:
   ┌─────────┬───────────────┬────────────┬─────────────────────┐
   │ (index) │   tier_name   │ min_spent  │ discount_percentage │
   ├─────────┼───────────────┼────────────┼─────────────────────┤
   │    0    │  'Стандарт'   │   '0.00'   │          0          │
   │    1    │   'Bronze'    │  '800.00'  │         10          │
   │    2    │   'Silver'    │ '1200.00'  │         15          │
   │    3    │    'Gold'     │ '1600.00'  │         20          │
   │    4    │  'Platinum'   │ '2000.00'  │         25          │
   │    5    │   'Diamond'   │ '2400.00'  │         30          │
   └─────────┴───────────────┴────────────┴─────────────────────┘

   ✨ Billing system migration completed successfully!
   ```

4. **Если произошла ошибка:**
   - Проверьте DATABASE_URL в environment variables
   - Проверьте что IP DigitalOcean в whitelist PostgreSQL
   - Посмотрите полный лог ошибки

---

### Способ 2: Через SSH (если настроен)

```bash
# Подключиться к серверу
ssh your-digitalocean-server

# Перейти в директорию приложения
cd /path/to/link-manager

# Запустить миграцию
NODE_ENV=production node database/run_billing_migration.js
```

---

### Способ 3: Через прямое подключение к PostgreSQL

Если консоль недоступна, можно запустить SQL напрямую:

```bash
# Подключиться к PostgreSQL
psql "postgresql://doadmin:[PASSWORD]@db-postgresql-nyc3-90526-do-user-24010108-0.j.db.ondigitalocean.com:25060/defaultdb?sslmode=require"

# Вставить и выполнить содержимое файла
# database/migrate_add_billing_system.sql
```

**Примечание:** Замените [PASSWORD] на реальный пароль из DATABASE_URL.

---

## 🎯 ШАГ 4: НАЧАЛЬНАЯ НАСТРОЙКА

### 4.1 Добавить баланс админу для тестирования

```sql
-- Подключиться к PostgreSQL (как в Шаге 3, Способ 3)
-- Или через DigitalOcean Database UI

UPDATE users
SET balance = 1000.00,
    total_spent = 0.00,
    current_discount = 0
WHERE username = 'admin';

-- Проверить
SELECT username, balance, total_spent, current_discount
FROM users
WHERE username = 'admin';
```

**Результат:**
```
 username | balance  | total_spent | current_discount
----------+----------+-------------+------------------
 admin    | 1000.00  |       0.00  |                0
```

---

### 4.2 Проверить что cron jobs запустились

**Посмотреть логи приложения:**

В DigitalOcean:
- Apps → link-manager → Runtime Logs

**Искать строки:**
```
[INFO] Initializing cron jobs...
[INFO] Auto-renewal cron job scheduled for 00:00
[INFO] Expiry reminder cron job scheduled for 09:00
[INFO] Scheduled placements cron job scheduled (hourly)
[INFO] Log cleanup cron job scheduled (daily at 03:00 UTC)
[INFO] All cron jobs initialized successfully
```

Если этих строк нет - значит cron jobs не запустились, нужно проверить логи ошибок.

---

## ✅ ШАГ 5: ТЕСТИРОВАНИЕ PRODUCTION

### 5.1 Проверить health endpoint

```bash
curl https://shark-app-9kv6u.ondigitalocean.app/health
```

**Ожидаемый ответ:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-22T...",
  "architecture": "modular",
  "queue": true
}
```

---

### 5.2 Тестировать НОВЫЕ endpoints

#### Регистрация пользователя (NEW!)

```bash
curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePass123",
    "confirmPassword": "SecurePass123"
  }'
```

**Ожидаемый ответ:**
```json
{
  "message": "User registered successfully. Please verify your email.",
  "user": {
    "id": 2,
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  },
  "verificationToken": "abc123..."
}
```

---

#### Верификация email (NEW!)

```bash
# Используйте token из предыдущего ответа
curl https://shark-app-9kv6u.ondigitalocean.app/api/auth/verify-email/abc123...
```

**Ожидаемый ответ:**
```json
{
  "message": "Email verified successfully. You can now login."
}
```

---

#### Login с блокировкой аккаунта (UPDATED!)

```bash
# Попытка 1 с неверным паролем
curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"wrongpass"}'
```

**Ожидаемый ответ:**
```json
{
  "error": "Invalid credentials. 4 attempt(s) remaining before account lock."
}
```

```bash
# После 5 попыток:
{
  "error": "Too many failed login attempts. Account locked for 30 minutes."
}

# После 30 минут:
# Аккаунт автоматически разблокируется
```

---

#### CSRF Token (NEW!)

```bash
curl https://shark-app-9kv6u.ondigitalocean.app/csrf-token \
  -c cookies.txt  # Save cookies
```

**Ожидаемый ответ:**
```json
{
  "csrfToken": "a1b2c3d4e5f6..."
}
```

---

### 5.3 Тестировать СУЩЕСТВУЮЩИЕ billing endpoints

```bash
# Сначала получить токен
TOKEN=$(curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# Проверить баланс
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/balance

# Получить цены с персональной скидкой
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/pricing

# Получить discount tiers
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/billing/discount-tiers

# Админ статистика
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/admin/dashboard/stats?period=week

# Multi-period revenue
curl -H "Authorization: Bearer $TOKEN" \
  https://shark-app-9kv6u.ondigitalocean.app/api/admin/revenue/multi-period
```

---

### 5.4 Тестировать UI в браузере

Открыть в браузере и проверить что загружаются без ошибок:

1. **User Pages:**
   - https://shark-app-9kv6u.ondigitalocean.app/balance.html
   - https://shark-app-9kv6u.ondigitalocean.app/my-placements.html
   - https://shark-app-9kv6u.ondigitalocean.app/projects.html

2. **Admin Pages:**
   - https://shark-app-9kv6u.ondigitalocean.app/admin-dashboard.html
   - https://shark-app-9kv6u.ondigitalocean.app/admin-users.html
   - https://shark-app-9kv6u.ondigitalocean.app/admin-placements.html

3. **Проверить в Browser Console:**
   - Открыть DevTools (F12)
   - Перейти в Console
   - Не должно быть красных ошибок
   - Проверить что все JS модули загружены

---

### 5.5 Тестировать полный цикл покупки

1. **Login как admin**
2. **Перейти на "Баланс"**
   - Проверить что баланс $1000.00
   - Проверить прогресс-бар скидок
   - Проверить discount tiers таблицу

3. **Перейти на "Размещения"**
   - Кликнуть "Купить размещение"
   - Выбрать проект
   - Выбрать тип (ссылка или статья)
   - Выбрать сайт
   - Выбрать контент
   - Установить дату публикации (опционально)
   - Включить автопродление (только для ссылок)
   - Проверить калькулятор цены
   - Кликнуть "Купить"

4. **Проверить результат:**
   - Баланс уменьшился
   - Размещение появилось в "Активные"
   - Транзакция в истории на странице "Баланс"

---

## 🐛 TROUBLESHOOTING

### Проблема: Деплой не начинается после push

**Решение:**
1. Проверить что код действительно в main ветке
2. Проверить DigitalOcean App Platform настройки:
   - Settings → Components → Source
   - Branch должен быть `main`
3. Попробовать Manual Deployment:
   - Actions → Create Deployment

---

### Проблема: Ошибка при миграции БД

**Ошибка:** `getaddrinfo EAI_AGAIN`

**Решение:**
- IP адрес DigitalOcean app не в whitelist PostgreSQL
- Добавить IP в Databases → Settings → Trusted Sources

**Ошибка:** `column already exists`

**Решение:**
- Миграция уже была выполнена ранее
- Проверить таблицы: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('transactions', 'discount_tiers')`

**Ошибка:** `Invalid DATABASE_URL`

**Решение:**
- Проверить environment variable DATABASE_URL в App Settings
- Должен быть формат: `postgresql://user:pass@host:port/db`

---

### Проблема: 500 ошибка при вызове billing endpoints

**Проверить:**
1. **Миграция выполнена?**
   ```sql
   SELECT COUNT(*) FROM transactions;
   SELECT COUNT(*) FROM discount_tiers;
   ```

2. **Cron jobs запустились?**
   - Проверить Runtime Logs на наличие "All cron jobs initialized"

3. **Посмотреть логи ошибок:**
   ```bash
   doctl apps logs <app-id> --type RUN --follow
   ```

---

### Проблема: Frontend страницы показывают ошибки

**Проверить в Browser Console:**
- 401 Unauthorized → проблема с JWT токеном
- 404 Not Found → файлы не задеплоились
- 500 Internal Server Error → backend проблема

**Решение:**
1. Очистить localStorage: `localStorage.clear()`
2. Заново залогиниться
3. Проверить что все static файлы задеплоились в `/backend/build/`

---

## 📊 ПРОВЕРКА УСПЕШНОГО ДЕПЛОЯ

### Все должно работать:

- ✅ Health endpoint возвращает 200 OK
- ✅ Login работает (с блокировкой после 5 попыток)
- ✅ Register работает (новая функция)
- ✅ CSRF token endpoint работает (новая функция)
- ✅ Billing endpoints возвращают данные (не 500)
- ✅ Admin endpoints возвращают данные
- ✅ Frontend страницы загружаются без ошибок
- ✅ Покупка размещения работает
- ✅ В логах видно "All cron jobs initialized"
- ✅ 4 cron jobs в логах (auto-renewal, scheduled, reminders, cleanup)

---

## 🎉 ФИНАЛЬНАЯ ПРОВЕРКА

Если все пункты выше работают:

```
✅ ДЕПЛОЙ УСПЕШЕН!
✅ СИСТЕМА РАБОТАЕТ НА 100%!
✅ БИЛЛИНГ АКТИВЕН!
✅ ГОТОВО К ИСПОЛЬЗОВАНИЮ!
```

---

## 📞 ПОДДЕРЖКА

Если возникли проблемы:

1. **Проверить документацию:**
   - FINAL_100_PERCENT_COMPLETE.md
   - PRODUCTION_DEPLOYMENT_GUIDE.md
   - GAP_ANALYSIS.md

2. **Проверить логи:**
   - DigitalOcean Runtime Logs
   - PostgreSQL logs
   - Browser Console

3. **Проверить environment variables:**
   - DATABASE_URL
   - JWT_SECRET
   - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
   - NODE_ENV=production

---

**Дата создания:** 2025-10-22
**Версия:** 1.0.0
**Статус системы:** ✅ 100% CODE COMPLETE, READY FOR PRODUCTION
