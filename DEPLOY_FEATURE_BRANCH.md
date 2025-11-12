# 🚀 Деплой Feature Ветки на Продакшен

## Инструкция по развёртыванию ветки `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ` на продакшене

---

## 📋 Предварительные требования

- ✅ Доступ к серверу (SSH)
- ✅ База данных PostgreSQL настроена (DigitalOcean)
- ✅ Файл `.env` существует с DATABASE_URL
- ✅ Node.js установлен
- ✅ Git настроен

---

## 🔧 Пошаговая инструкция

### Шаг 1: Подключитесь к серверу

```bash
# Замените на ваш IP и путь к SSH ключу
ssh your-user@your-server-ip

# Или если используете DigitalOcean Droplet:
ssh root@your-droplet-ip
```

---

### Шаг 2: Перейдите в папку проекта

```bash
cd /path/to/link-manager
# Обычно что-то вроде:
cd /var/www/link-manager
# Или:
cd ~/link-manager
```

---

### Шаг 3: Остановите текущее приложение

```bash
# Если используете PM2:
pm2 stop link-manager
# Или pm2 stop all

# Если используете systemd:
sudo systemctl stop link-manager

# Если запущено вручную:
# Найдите процесс
lsof -ti:3003 | xargs kill -9
```

---

### Шаг 4: Обновите репозиторий и переключитесь на feature ветку

```bash
# Получить все ветки
git fetch --all

# Переключиться на feature ветку
git checkout claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ

# Подтянуть последние изменения
git pull origin claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ
```

**Вывод должен показать:**
```
Already on 'claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ'
Your branch is up to date with 'origin/claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ'.
```

---

### Шаг 5: Установите зависимости (если нужно)

```bash
npm install
```

---

### Шаг 6: Проверьте .env файл

```bash
# Убедитесь что .env существует
ls -la .env

# Проверьте что DATABASE_URL настроен
cat .env | grep DATABASE_URL
```

**Должно быть что-то вроде:**
```
DATABASE_URL=postgresql://user:password@host:25060/linkmanager?sslmode=require
```

**Или отдельные переменные:**
```
DB_HOST=your-db-host.db.ondigitalocean.com
DB_PORT=25060
DB_USER=doadmin
DB_PASSWORD=your-password
DB_NAME=linkmanager
DB_SSL=true
```

---

### Шаг 7: Запустите приложение

#### Вариант A: Production mode (рекомендуется)

```bash
npm start
```

Это запустит:
```bash
cd backend && PORT=3003 NODE_ENV=production node server-new.js
```

#### Вариант B: Development mode с nodemon

```bash
npm run dev
```

#### Вариант C: PM2 (рекомендуется для продакшена)

```bash
# Запустить через PM2
pm2 start npm --name "link-manager" -- start

# Или напрямую:
pm2 start backend/server-new.js --name "link-manager" -- --port 3003

# Посмотреть статус
pm2 status

# Посмотреть логи
pm2 logs link-manager

# Перезапустить
pm2 restart link-manager

# Автозапуск при перезагрузке сервера
pm2 save
pm2 startup
```

---

### Шаг 8: Проверьте что приложение работает

```bash
# Проверьте что процесс запущен
lsof -ti:3003

# Проверьте логи (если используете PM2)
pm2 logs link-manager --lines 50

# Или просто смотрите вывод в терминале
```

**Вы должны увидеть:**
```
🚀 Server running on port 3003
✅ Successfully parsed DATABASE_URL
✅ Database connected
```

---

### Шаг 9: Тестирование API

```bash
# Проверка health check
curl http://localhost:3003/health

# Проверка API (замените на ваш домен)
curl http://your-domain.com/api/health

# Или с вашего компьютера
curl http://your-server-ip:3003/health
```

**Ожидаемый ответ:**
```json
{"status":"ok"}
```

---

## 🗄️ База данных уже подключена!

**База данных настроена через переменную окружения**, поэтому при переключении веток база остаётся той же:

```
.env файл содержит DATABASE_URL
        ↓
backend/config/database.js читает DATABASE_URL
        ↓
Подключение к PostgreSQL на DigitalOcean
        ↓
Все таблицы уже существуют (users, projects, sites, placements и т.д.)
```

**Никаких дополнительных действий не требуется!** База уже подключена.

---

## 📊 Что содержит feature ветка

```
claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ
├─ ✅ Iteration 4 (4 критических багфикса)
│  ├─ Problem #9: Article status fix
│  ├─ Problem #10: total_spent refund fix
│  ├─ Problem #11: Discount tier recalculation on refund
│  └─ Problem #12: Discount tier recalculation on renewal
│
└─ ✅ Admin-only placement deletion
   ├─ backend/middleware/admin.js (NEW)
   ├─ Route protection
   ├─ Service authorization
   ├─ Frontend UI (кнопка только для админов)
   └─ Audit trail
```

**Всего: 16 коммитов, 12 исправленных критических багов**

---

## 🧪 Тестирование на продакшене

### 1. Проверьте логин (обычный пользователь)

```bash
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}'
```

### 2. Проверьте логин (админ)

```bash
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. Попробуйте удалить placement (обычный пользователь)

```bash
TOKEN="user-token-here"
curl -X DELETE http://your-domain.com/api/placements/1 \
  -H "Authorization: Bearer $TOKEN"

# Ожидается: 403 Forbidden
```

### 4. Попробуйте удалить placement (админ)

```bash
ADMIN_TOKEN="admin-token-here"
curl -X DELETE http://your-domain.com/api/placements/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Ожидается: 200 OK с возвратом денег
```

---

## 🔄 Откат на main (если нужно)

Если что-то пойдёт не так, можно вернуться на main:

```bash
# Остановить приложение
pm2 stop link-manager

# Переключиться на main
git checkout main
git pull origin main

# Запустить снова
pm2 restart link-manager
```

---

## 📝 Миграции базы данных

**ВСЕ миграции УЖЕ должны быть применены!** Но на всякий случай проверьте:

### Проверка таблиц

```bash
# Подключитесь к базе
psql "$DATABASE_URL"

# Или используя переменные:
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

# Проверьте что таблицы существуют
\dt

# Проверьте колонку total_spent в users
\d users

# Проверьте middleware/admin.js работает
SELECT id, username, role FROM users WHERE role = 'admin';
```

**Ожидаемые таблицы:**
- users (с колонками: total_spent, current_discount)
- projects
- sites
- placements (с колонками: status, wordpress_post_id)
- project_links (с колонками: usage_count, usage_limit, status)
- project_articles (с колонками: usage_count, usage_limit, status)
- placement_content
- transactions
- discount_tiers
- audit_log
- notifications

---

## ⚠️ Важные моменты

### 1. Порт 3003
Убедитесь что порт 3003 открыт в файрволе:
```bash
sudo ufw allow 3003
sudo ufw status
```

### 2. Nginx (если используете)
Обновите конфиг если нужно:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Перезапустите Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL/HTTPS
Если используете Let's Encrypt:
```bash
sudo certbot --nginx -d your-domain.com
```

---

## 🎯 Быстрый чеклист

- [ ] SSH подключение к серверу
- [ ] Остановка текущего приложения
- [ ] `git checkout claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
- [ ] `git pull origin claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
- [ ] Проверка .env файла
- [ ] `npm install` (если нужно)
- [ ] `pm2 start npm --name "link-manager" -- start`
- [ ] Проверка логов: `pm2 logs link-manager`
- [ ] Проверка API: `curl http://localhost:3003/health`
- [ ] Тестирование frontend в браузере
- [ ] Проверка admin-only deletion

---

## 📞 Если что-то не работает

### Проблема: База данных не подключается
```bash
# Проверьте DATABASE_URL
echo $DATABASE_URL

# Проверьте .env
cat .env | grep DATABASE

# Проверьте логи
pm2 logs link-manager
```

### Проблема: Порт занят
```bash
# Найти процесс на порту 3003
lsof -ti:3003

# Убить процесс
lsof -ti:3003 | xargs kill -9
```

### Проблема: npm install падает
```bash
# Очистить кэш
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Проблема: 403 при удалении (даже для админа)
```bash
# Проверьте роль пользователя в базе
psql "$DATABASE_URL" -c "SELECT id, username, role FROM users WHERE username = 'admin';"

# Если роль не 'admin', обновите:
psql "$DATABASE_URL" -c "UPDATE users SET role = 'admin' WHERE username = 'admin';"
```

---

## ✅ Готово!

После выполнения этих шагов feature ветка будет запущена на продакшене с подключением к базе данных.

**База данных та же самая**, просто код обновлён с багфиксами и новыми фичами.

Никаких миграций не требуется - все изменения совместимы с текущей схемой БД!

---

**Документация создана**: 2025-11-12
**Ветка**: `claude/create-ai-prompt-011CUMcXNR44qVdLu3NNwmyQ`
**Статус**: ✅ Готово к деплою
