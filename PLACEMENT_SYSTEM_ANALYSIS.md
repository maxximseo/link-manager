# 🔍 ГЛУБОКИЙ АНАЛИЗ СИСТЕМЫ РАЗМЕЩЕНИЙ - КРИТИЧНЫЕ ПРОБЛЕМЫ НАЙДЕНЫ

**Дата:** 2025-11-12
**Статус:** ⚠️ КРИТИЧНАЯ УЯЗВИМОСТЬ ОБНАРУЖЕНА

---

## 🚨 КРИТИЧНАЯ ПРОБЛЕМА #1: ОБХОД БИЛЛИНГА

### Проблема

**Пользователи могут создавать размещения БЕСПЛАТНО, минуя систему биллинга!**

### Детали

Обнаружено **ДВА параллельных способа** создания размещений:

#### ✅ ПРАВИЛЬНЫЙ (С биллингом):
```
Frontend (my-placements.js)
  → POST /api/billing/purchase
    → billing.service.purchasePlacement()
      → Проверяет баланс ✅
      → Списывает деньги ✅
      → Создает транзакцию ✅
      → Создает placement ✅
```

#### ❌ НЕПРАВИЛЬНЫЙ (БЕЗ биллинга) - **УЯЗВИМОСТЬ**:
```
Frontend (placements.html)
  → POST /api/placements/batch/async
    → placement.controller.createBatchPlacement()
      → placement.service.createPlacement()
        → Проверяет баланс ❌
        → Списывает деньги ❌
        → Создает транзакцию ❌
        → Создает placement ✅
```

### Код с проблемой

**File:** `backend/controllers/placement.controller.js:162`

```javascript
// ПРОБЛЕМА: вызывает createPlacement напрямую без проверки баланса!
const placement = await placementService.createPlacement({
  site_id,
  project_id,
  link_ids: assignedLinks,
  article_ids: assignedArticles,
  userId: req.user.id
});
```

**File:** `backend/build/placements.html`

```javascript
// Frontend использует БЕСПЛАТНЫЙ endpoint!
const response = await fetch('/api/placements/batch/async', {
  method: 'POST',
  ...
});
```

### Последствия

1. ⚠️ Пользователи могут размещать ссылки/статьи **БЕСПЛАТНО**
2. ⚠️ Система биллинга полностью обходится
3. ⚠️ Транзакции не создаются - нет финансового учета
4. ⚠️ Баланс не списывается
5. ⚠️ Скидки не применяются
6. ⚠️ total_spent не обновляется - дисконты не растут

### Проверка уязвимости

```bash
# Пользователь с балансом $0 может создать размещение:
curl -X POST http://localhost:3003/api/placements/batch/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "site_ids": [1],
    "link_ids": [1]
  }'

# ✅ Размещение создается БЕЗ проверки баланса!
```

---

## ⚠️ ПРОБЛЕМА #2: Два разных метода создания placement

### Описание

Существует **ДВА способа** создать placement в коде:

1. **placement.service.createPlacement()** (старый) - НЕ списывает деньги
2. **billing.service.purchasePlacement()** (новый) - списывает деньги

Это создает путаницу и риск использования неправильного метода.

### Где используются

| Файл | Функция | Биллинг? |
|------|---------|----------|
| `placement.controller.js` | `createPlacement()` | ❌ НЕТ |
| `billing.routes.js` | `purchasePlacement()` | ✅ ДА |

### Проблема

Разработчики могут случайно использовать `createPlacement()` вместо `purchasePlacement()`, создавая бесплатные размещения.

---

## ✅ ЧТО РАБОТАЕТ ПРАВИЛЬНО

### placement.service.createPlacement()

**Положительные стороны:**

1. ✅ **Проверяет ограничения:**
   - Максимум 1 ссылка на сайт в рамках проекта
   - Максимум 1 статья на сайт в рамках проекта
   ```javascript
   // placement.service.js:144-150
   if (link_ids.length > 0 && hasExistingLinks) {
     throw new Error('This site already has a link from this project.');
   }
   if (article_ids.length > 0 && hasExistingArticles) {
     throw new Error('This site already has an article from this project.');
   }
   ```

2. ✅ **Проверяет квоты сайтов:**
   ```javascript
   // placement.service.js:172-178
   if (link_ids.length > 0 && site.used_links >= site.max_links) {
     throw new Error(`Site has reached its link limit (${site.max_links})`);
   }
   if (article_ids.length > 0 && site.used_articles >= site.max_articles) {
     throw new Error(`Site has reached its article limit (${site.max_articles})`);
   }
   ```

3. ✅ **Использует транзакции БД:**
   ```javascript
   // placement.service.js:122
   await client.query('BEGIN');
   // ... operations ...
   await client.query('COMMIT');
   ```

4. ✅ **Использует advisory locks:**
   ```javascript
   // placement.service.js:126
   const lockKey = (project_id << 32) | site_id;
   await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
   ```

5. ✅ **Публикует статьи на WordPress:**
   ```javascript
   // placement.service.js:324
   const wpResult = await wordpressService.publishArticle(...);
   ```

6. ✅ **Обновляет usage_count:**
   ```javascript
   // placement.service.js:217
   await client.query(
     'UPDATE project_links SET usage_count = usage_count + 1 WHERE id = $1',
     [linkId]
   );
   ```

7. ✅ **Обновляет квоты сайтов:**
   ```javascript
   // placement.service.js:276-287
   if (link_ids.length > 0) {
     await client.query(
       'UPDATE sites SET used_links = used_links + $1 WHERE id = $2',
       [link_ids.length, site_id]
     );
   }
   ```

8. ✅ **Инвалидирует кеш:**
   ```javascript
   // placement.service.js:386-388
   await cache.delPattern(`placements:user:${userId}:*`);
   await cache.delPattern(`projects:user:${userId}:*`);
   await cache.delPattern(`wp:content:*`);
   ```

### billing.service.purchasePlacement()

**Положительные стороны:**

1. ✅ **Проверяет баланс:**
   ```javascript
   // billing.service.js:222-224
   if (parseFloat(user.balance) < finalPrice) {
     throw new Error(`Insufficient balance. Required: $${finalPrice.toFixed(2)}`);
   }
   ```

2. ✅ **Рассчитывает цену со скидкой:**
   ```javascript
   // billing.service.js:217-219
   const basePrice = type === 'link' ? 25.00 : 15.00;
   const discount = user.current_discount || 0;
   const finalPrice = basePrice * (1 - discount / 100);
   ```

3. ✅ **Списывает деньги:**
   ```javascript
   // billing.service.js:227-232
   const newBalance = parseFloat(user.balance) - finalPrice;
   const newTotalSpent = parseFloat(user.total_spent) + finalPrice;
   await client.query(
     'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
     [newBalance, newTotalSpent, userId]
   );
   ```

4. ✅ **Создает транзакцию:**
   ```javascript
   // billing.service.js:236-249
   await client.query(`
     INSERT INTO transactions (user_id, type, amount, ...)
     VALUES ($1, 'purchase', $2, ...)
   `, [...]);
   ```

5. ✅ **Обновляет tier скидок:**
   ```javascript
   // billing.service.js:339-349
   const newTier = await calculateDiscountTier(newTotalSpent);
   if (newTier.discount !== user.current_discount) {
     await client.query('UPDATE users SET current_discount = $1 WHERE id = $2', ...);
     // Создает уведомление о повышении уровня
   }
   ```

6. ✅ **Поддерживает отложенную публикацию:**
   ```javascript
   // billing.service.js:270-284
   if (scheduledDate) {
     scheduledPublishDate = new Date(scheduledDate);
     // Валидация: максимум 90 дней
     if (scheduledPublishDate > maxDate) {
       throw new Error('Scheduled date cannot be more than 90 days in the future');
     }
   }
   ```

7. ✅ **Рассчитывает цену продления:**
   ```javascript
   // billing.service.js:257-264
   if (type === 'link') {
     expiresAt = ... // +365 дней
     // Renewal: base * (1 - 0.30) * (1 - personalDiscount/100)
     renewalPrice = basePrice * 0.70 * (1 - discount / 100);
   }
   ```

---

## 📋 ПОЛНЫЙ СПИСОК API ENDPOINTS

### Placement Endpoints (СТАРЫЕ - БЕЗ биллинга)

| Method | Endpoint | Биллинг? | Статус |
|--------|----------|----------|--------|
| GET | `/api/placements` | ❌ | ✅ OK (только чтение) |
| GET | `/api/placements/statistics` | ❌ | ✅ OK (только чтение) |
| GET | `/api/placements/available-sites/:projectId` | ❌ | ✅ OK (только чтение) |
| GET | `/api/placements/:id` | ❌ | ✅ OK (только чтение) |
| POST | `/api/placements/batch/create` | ❌ | ⚠️ **УЯЗВИМОСТЬ** |
| POST | `/api/placements/batch/async` | ❌ | ⚠️ **УЯЗВИМОСТЬ** |
| DELETE | `/api/placements/:id` | ❌ | ⚠️ Проблема (не возвращает деньги) |

### Billing Endpoints (НОВЫЕ - С биллингом)

| Method | Endpoint | Биллинг? | Статус |
|--------|----------|----------|--------|
| GET | `/api/billing/balance` | N/A | ✅ OK |
| POST | `/api/billing/deposit` | N/A | ✅ OK |
| GET | `/api/billing/transactions` | N/A | ✅ OK |
| POST | `/api/billing/purchase` | ✅ | ✅ OK (правильный!) |
| PATCH | `/api/billing/placements/:id/renew` | ✅ | ✅ OK |
| GET | `/api/billing/discount-tiers` | N/A | ✅ OK |

---

## 🔧 РЕКОМЕНДУЕМЫЕ ИСПРАВЛЕНИЯ

### Исправление #1: СРОЧНО - Отключить бесплатные endpoints

**Приоритет:** 🔴 КРИТИЧНЫЙ

**Действие:** Удалить или отключить endpoints создания placement без биллинга

**Файл:** `backend/routes/placement.routes.js`

```javascript
// УДАЛИТЬ ЭТИ СТРОКИ:
router.post('/batch/create', createLimiter, placementController.createBatchPlacement);
router.post('/batch/async', createLimiter, placementController.createBatchPlacementAsync);
```

### Исправление #2: Обновить frontend

**Приоритет:** 🔴 КРИТИЧНЫЙ

**Действие:** Изменить `placements.html` чтобы использовал `/api/billing/purchase`

**Файл:** `backend/build/placements.html`

```javascript
// БЫЛО (неправильно):
const response = await fetch('/api/placements/batch/async', { ... });

// ДОЛЖНО БЫТЬ (правильно):
const response = await fetch('/api/billing/purchase', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
  },
  body: JSON.stringify({
    projectId,
    siteId,
    type: contentType === 'links' ? 'link' : 'article',
    contentIds: [contentId],
    autoRenewal: false
  })
});
```

### Исправление #3: Исправить DELETE endpoint

**Приоритет:** 🟡 СРЕДНИЙ

**Действие:** При удалении placement возвращать деньги на баланс

**Создать:** `billing.service.refundPlacement()`

```javascript
const refundPlacement = async (placementId, userId) => {
  // 1. Получить placement с ценой
  // 2. Вернуть деньги на баланс
  // 3. Создать refund транзакцию
  // 4. Удалить placement через placement.service.deletePlacement()
};
```

### Исправление #4: Добавить проверку биллинга в старую функцию

**Приоритет:** 🟢 НИЗКИЙ (если endpoint'ы удалены)

**Действие:** Добавить проверку что `placement.service.createPlacement()` не вызывается напрямую из API

**Файл:** `backend/services/placement.service.js:114`

```javascript
const createPlacement = async (data, { skipBillingCheck = false } = {}) => {
  if (!skipBillingCheck) {
    throw new Error('Direct placement creation is disabled. Use billing.purchasePlacement() instead.');
  }
  // ... existing code ...
};
```

---

## 🧪 ТЕСТЫ ДЛЯ ПРОВЕРКИ УЯЗВИМОСТИ

### Тест 1: Попытка создать placement без баланса

```bash
# 1. Создать пользователя с $0 баланса
# 2. Попытаться создать placement через старый endpoint

curl -X POST http://localhost:3003/api/placements/batch/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "site_ids": [1],
    "link_ids": [1]
  }'

# ОЖИДАЕМЫЙ РЕЗУЛЬТАТ (сейчас):
# ✅ 200 OK - placement создан БЕЗ оплаты (УЯЗВИМОСТЬ!)

# ОЖИДАЕМЫЙ РЕЗУЛЬТАТ (после исправления):
# ❌ 404 Not Found - endpoint удален
```

### Тест 2: Проверка нового endpoint с биллингом

```bash
curl -X POST http://localhost:3003/api/billing/purchase \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "link",
    "contentIds": [1]
  }'

# ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:
# ❌ 400 Bad Request - "Insufficient balance"
```

---

## 📊 СТАТИСТИКА КОДА

### Размеры файлов

| Файл | Строк | Функционал |
|------|-------|-----------|
| `placement.service.js` | 633 | Создание/удаление placement |
| `billing.service.js` | ~700 | Биллинг и покупки |
| `wordpress.service.js` | ~200 | Публикация на WordPress |
| `placements.html` | ~800 | Frontend размещений |
| `my-placements.js` | ~1000 | Frontend "мои размещения" |

### Ключевые функции

| Функция | Строк | Биллинг? | Использование |
|---------|-------|----------|---------------|
| `createPlacement()` | 287 | ❌ | placement.controller (ПЛОХО) |
| `purchasePlacement()` | 200 | ✅ | billing.routes (ХОРОШО) |
| `deletePlacement()` | 121 | ❌ | placement.controller |
| `renewPlacement()` | ~150 | ✅ | billing.service |

---

## 🎯 ВЫВОД

### Критичные проблемы

1. ⚠️ **УЯЗВИМОСТЬ:** Можно создавать размещения бесплатно через `/api/placements/batch/*`
2. ⚠️ **НЕСООТВЕТСТВИЕ:** Frontend использует бесплатный endpoint
3. ⚠️ **НЕПОЛНОТА:** Удаление placement не возвращает деньги

### Положительные стороны

1. ✅ Биллинг система полностью реализована
2. ✅ Проверки ограничений (1 link + 1 article) работают корректно
3. ✅ Квоты сайтов обновляются правильно
4. ✅ WordPress интеграция работает
5. ✅ Транзакции БД используются везде
6. ✅ Система скидок реализована
7. ✅ Кеширование работает

### Приоритет исправлений

1. 🔴 **СРОЧНО:** Удалить `/api/placements/batch/*` endpoints
2. 🔴 **СРОЧНО:** Обновить `placements.html` → использовать `/api/billing/purchase`
3. 🟡 **СРЕДНИЙ:** Добавить refund при удалении placement
4. 🟢 **НИЗКИЙ:** Добавить защиту от прямого вызова `createPlacement()`

---

**Дата анализа:** 2025-11-12
**Аналитик:** Claude Code
**Статус:** ⚠️ КРИТИЧНЫЕ ПРОБЛЕМЫ НАЙДЕНЫ - ТРЕБУЕТСЯ СРОЧНОЕ ИСПРАВЛЕНИЕ
