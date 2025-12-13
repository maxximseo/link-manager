# Инструкция по импорту данных из DigitalOcean в Supabase

## Текущий статус

✅ **Supabase база готова**
- Project ID: `nuykefcuninjboyrcxcn.supabase.co`
- 15 таблиц созданы с полной схемой
- RLS включен на всех таблицах
- Все индексы на месте

## Шаг 1: Экспорт данных из DigitalOcean

Выполните на **вашей локальной машине** или **сервере с доступом к DigitalOcean**:

```bash
# Перейдите в папку проекта
cd /путь/к/проекту

# Установите переменные окружения DigitalOcean
export OLD_DB_HOST=ваш-хост.db.ondigitalocean.com
export OLD_DB_PORT=25060
export OLD_DB_NAME=linkmanager
export OLD_DB_USER=doadmin
export OLD_DB_PASSWORD=ваш-пароль-от-digitalocean

# Запустите экспорт
node scripts/export-from-digitalocean.js
```

**Что произойдет:**
- Скрипт подключится к DigitalOcean
- Экспортирует все 15 таблиц в JSON
- Сохранит в `migration-data/export-TIMESTAMP.json`
- Покажет статистику экспорта

**Пример вывода:**
```
===========================================
EXPORT DATA FROM DIGITALOCEAN
===========================================

Connecting to DigitalOcean database...
✅ Connected successfully!

📦 Exporting table: users...
   ✅ Exported 42 records from users
📦 Exporting table: projects...
   ✅ Exported 15 records from projects
...

===========================================
✅ EXPORT COMPLETED
===========================================
Total records exported: 523
Export file: migration-data/export-1734567890123.json
```

## Шаг 2: Импорт в Supabase (в Bolt)

После экспорта, **скопируйте JSON файл** в проект Bolt и выполните:

```bash
# В Bolt или локально
node scripts/import-to-supabase.js migration-data/export-XXXXXXXXXX.json
```

**Что произойдет:**
- Подключение к Supabase (nuykefcuninjboyrcxcn)
- Импорт всех таблиц в правильном порядке (соблюдая foreign keys)
- Обработка дубликатов (ON CONFLICT DO NOTHING)
- Обновление sequences для AUTO_INCREMENT
- Транзакция (при ошибке - откат)

**Пример вывода:**
```
===========================================
IMPORT DATA TO SUPABASE
===========================================

Reading export file...
✅ Export file loaded

Connecting to Supabase database...
✅ Connected successfully!

📥 Importing 42 records into users...
   ✅ Imported 42 records into users
📥 Importing 15 records into projects...
   ✅ Imported 15 records into projects
...

🔄 Updating sequences...
   ✅ Updated sequence for users
   ✅ Updated sequence for projects
...

===========================================
✅ IMPORT COMPLETED
===========================================
Total records imported: 523
Total records skipped: 0

✅ Data successfully imported to Supabase!
```

## Шаг 3: Проверка

```bash
# Проверьте подключение и данные
node test-supabase-connection.js
```

Или в SQL (Supabase Dashboard):
```sql
-- Проверьте количество записей
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'sites', COUNT(*) FROM sites
UNION ALL
SELECT 'placements', COUNT(*) FROM placements;
```

## Альтернативный способ: pg_dump

Если предпочитаете pg_dump:

```bash
# 1. Экспорт из DigitalOcean (только данные)
pg_dump -h ваш-хост.db.ondigitalocean.com \
        -p 25060 \
        -U doadmin \
        -d linkmanager \
        --data-only \
        --no-owner \
        --no-privileges \
        --column-inserts \
        > data-export.sql

# 2. Импорт в Supabase
# ВАЖНО: Получите пароль из Supabase Dashboard
psql -h db.nuykefcuninjboyrcxcn.supabase.co \
     -p 5432 \
     -U postgres \
     -d postgres \
     < data-export.sql
```

## Troubleshooting

### Ошибка: "Connection refused" при экспорте

**Причина:** Нет доступа к DigitalOcean

**Решение:**
1. Проверьте что ваш IP добавлен в whitelist DigitalOcean
2. Проверьте правильность OLD_DB_* переменных
3. Убедитесь что база доступна

### Ошибка: "Password authentication failed"

**Причина:** Неверный пароль

**Решение:**
1. Проверьте OLD_DB_PASSWORD для DigitalOcean
2. Для Supabase - пароль управляется автоматически в Bolt

### Ошибка: "Duplicate key" при импорте

**Причина:** Данные уже существуют

**Решение:**
- Скрипт использует `ON CONFLICT DO NOTHING`
- Дубликаты пропускаются автоматически
- Для полной очистки (ОСТОРОЖНО!):

```sql
TRUNCATE users, projects, sites, placements CASCADE;
```

## После импорта

1. **Запустите приложение:**
```bash
npm install
npm start
```

2. **Обновите WordPress плагины:**
   - Замените старый API endpoint на новый
   - Старый: `https://your-digitalocean-app.com/api`
   - Новый: `https://your-bolt-app.com/api`

3. **Проверьте функциональность:**
   - Логин пользователей
   - Создание проектов
   - Размещение ссылок
   - Billing операции

## Важно

- В Bolt пароль БД управляется автоматически (не нужно указывать)
- Для локальной разработки - получите пароль из Supabase Dashboard
- Все данные импортируются в транзакции (безопасно)
- Discount tiers уже заполнены (не дублируются)

---

**Готово?** Теперь ваш проект работает на Supabase в Bolt!
