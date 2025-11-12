# КРИТИЧЕСКИЕ ОШИБКИ В MAIN ВЕТКЕ
## Аудит системы размещения ссылок - 2025-11-12

**Статус**: 🚨 КРИТИЧНО - Найдено 5 критических финансовых уязвимостей

---

## 🔴 ПРОБЛЕМА #1: Отсутствует проверка квот сайта перед покупкой

### Описание
В `billing.service.js` функция `purchasePlacement` **НЕ проверяет** квоты сайта (`used_links >= max_links` и `used_articles >= max_articles`) перед снятием денег.

### Локация
- **Файл**: `backend/services/billing.service.js`
- **Функция**: `purchasePlacement` (строки 159-443)
- **Проблемный участок**: После строки 204 (проверка site exists), но ДО строки 250 (calculate price)

### Текущий код
```javascript
// 3. Validate site exists
const siteResult = await client.query(
  'SELECT * FROM sites WHERE id = $1',
  [siteId]
);

if (siteResult.rows.length === 0) {
  throw new Error('Site not found');
}

const site = siteResult.rows[0];

// 4. Check if placement already exists...
// НЕТ ПРОВЕРКИ КВОТ ЗДЕСЬ!

// 5. Calculate price
const basePrice = type === 'link' ? PRICING.LINK_HOMEPAGE : PRICING.ARTICLE_GUEST_POST;
```

### Отсутствующая проверка
```javascript
// ДОЛЖНО БЫТЬ:
// 4.2. CRITICAL: Check site quotas BEFORE charging money
if (type === 'link' && site.used_links >= site.max_links) {
  throw new Error(
    `Site "${site.site_name}" has reached its link limit (${site.used_links}/${site.max_links} used). ` +
    `Cannot create new link placement.`
  );
}

if (type === 'article' && site.used_articles >= site.max_articles) {
  throw new Error(
    `Site "${site.site_name}" has reached its article limit (${site.used_articles}/${site.max_articles} used). ` +
    `Cannot create new article placement.`
  );
}
```

### Последствия
- ✅ Деньги списываются с пользователя
- ❌ Размещение создаётся на переполненном сайте
- ❌ Квоты превышаются (`used_links` становится больше `max_links`)
- ❌ Финансовые потери: продано больше размещений, чем физически возможно

### Приоритет
🔴 **КРИТИЧЕСКИЙ** - Прямая потеря денег

---

## 🔴 ПРОБЛЕМА #2: Множественные contentIds по цене одного

### Описание
Система позволяет купить **до 10 ссылок/статей** по цене **одной**. Validation в routes разрешает `max: 10`, но цена рассчитывается как одна единица.

### Локация
- **Файл 1**: `backend/routes/billing.routes.js:170`
- **Файл 2**: `backend/services/billing.service.js:250-253`

### Проблемный код
```javascript
// billing.routes.js:170
body('contentIds').isArray({ min: 1, max: 10 }).withMessage('Content IDs must be an array (1-10 items)'),

// billing.service.js:250-253
// 5. Calculate price
const basePrice = type === 'link' ? PRICING.LINK_HOMEPAGE : PRICING.ARTICLE_GUEST_POST;
const discount = user.current_discount || 0;
const finalPrice = basePrice * (1 - discount / 100);
// ❌ Нет умножения на contentIds.length!
```

### Эксплуатация
```bash
# Запрос на покупку 10 ссылок
POST /api/billing/purchase
{
  "projectId": 1,
  "siteId": 5,
  "type": "link",
  "contentIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]  # 10 ссылок!
}

# Расчет цены:
# finalPrice = $25 * (1 - 0%) = $25  ← ТОЛЬКО ЗА ОДНУ!
# Должно быть: $25 * 10 = $250
```

### Последствия
- Пользователь платит $25, получает 10 ссылок
- Финансовая потеря: 90% от стоимости ($225 потеряно)
- Все 10 ссылок размещаются (loop в строках 342-357)

### Отсутствующая проверка
```javascript
// ДОЛЖНО БЫТЬ в billing.service.js после строки 215:

// CRITICAL FIX: Enforce single contentId per placement (business logic: 1 link/article per site)
if (!contentIds || contentIds.length === 0) {
  throw new Error('At least one content ID is required');
}

if (contentIds.length > 1) {
  throw new Error(
    `You can only place 1 ${type} per site per project. ` +
    `You provided ${contentIds.length} ${type}s. ` +
    `Please create separate placements for each ${type}.`
  );
}
```

И в `billing.routes.js:170`:
```javascript
body('contentIds').isArray({ min: 1, max: 1 }).withMessage('Content IDs must be an array with exactly 1 item'),
```

### Приоритет
🔴 **КРИТИЧЕСКИЙ** - Прямая финансовая эксплуатация (90% потеря доходов)

---

## 🔴 ПРОБЛЕМА #3: Нет возврата средств при ошибке запланированного размещения

### Описание
В `scheduled-placements.cron.js` при ошибке публикации на WordPress:
- Размещение помечается как `'failed'`
- Пользователю отправляется уведомление
- **НО деньги НЕ возвращаются!**

### Локация
- **Файл**: `backend/cron/scheduled-placements.cron.js`
- **Функция**: `processScheduledPlacements`
- **Проблемный участок**: Строки 125-163 (catch block)

### Проблемный код
```javascript
} catch (error) {
  await client.query('ROLLBACK');

  logger.error('Failed to publish scheduled placement', {
    placementId: placement.id,
    userId: placement.user_id,
    error: error.message,
    stack: error.stack
  });

  // Update placement status to failed
  try {
    await query(`
      UPDATE placements
      SET status = 'failed',
          updated_at = NOW()
      WHERE id = $1
    `, [placement.id]);

    // Send notification about failure
    await query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'placement_failed', $2, $3)
    `, [
      placement.user_id,
      'Ошибка публикации',
      `Не удалось опубликовать запланированное размещение #${placement.id}. ` +
      `Причина: ${error.message}. Пожалуйста, свяжитесь с поддержкой.`
    ]);

  } catch (notifyError) {
    logger.error('Failed to send notification about failed placement', {
      placementId: placement.id,
      error: notifyError.message
    });
  }

  failCount++;
}
```

### Отсутствующая логика
```javascript
// ДОЛЖНО БЫТЬ:
} catch (error) {
  await client.query('ROLLBACK');

  logger.error('Failed to publish scheduled placement', {
    placementId: placement.id,
    userId: placement.user_id,
    error: error.message
  });

  // CRITICAL FIX (BUG #6): Refund money on scheduled placement failure
  try {
    // Get placement details for refund
    const placementResult = await query(`
      SELECT final_price, user_id
      FROM placements
      WHERE id = $1
    `, [placement.id]);

    const placementData = placementResult.rows[0];
    const refundAmount = parseFloat(placementData.final_price || 0);

    if (refundAmount > 0) {
      // Use atomic delete and refund operation from billing service
      const billingService = require('../services/billing.service');
      await billingService.deleteAndRefundPlacement(placement.id, placementData.user_id);

      logger.info('Scheduled placement failed - automatic refund issued', {
        placementId: placement.id,
        userId: placementData.user_id,
        refundAmount
      });

      // Send notification about failure WITH refund
      await query(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES ($1, 'placement_failed_refund', $2, $3)
      `, [
        placement.user_id,
        'Возврат средств за неудавшееся размещение',
        `Запланированное размещение #${placement.id} не удалось опубликовать. ` +
        `Причина: ${error.message}. ` +
        `Сумма ${refundAmount.toFixed(2)} автоматически возвращена на ваш баланс.`
      ]);
    }
  } catch (refundError) {
    logger.error('Failed to refund scheduled placement', {
      placementId: placement.id,
      error: refundError.message
    });
  }

  failCount++;
}
```

### Последствия
- Пользователь заплатил за размещение
- WordPress вернул ошибку (API недоступен, неверный token, etc.)
- Размещение = `'failed'`, деньги потеряны навсегда
- Нет автоматического возврата средств

### Сценарий эксплуатации
1. Пользователь покупает scheduled placement за $15
2. Через час cron пытается опубликовать
3. WordPress API возвращает 500 error
4. Placement → `'failed'`, деньги списаны
5. Пользователь потерял $15 без результата

### Приоритет
🔴 **КРИТИЧЕСКИЙ** - Финансовые потери клиентов

---

## 🔴 ПРОБЛЕМА #4: Frontend использует старые endpoints, обходящие billing

### Описание
**САМАЯ КРИТИЧНАЯ ПРОБЛЕМА!** Frontend использует старые API endpoints (`/placements/batch/create`), которые:
- Обходят всю billing систему
- Не взимают деньги
- Создают размещения **БЕСПЛАТНО**

### Локация
- **Frontend**: `backend/build/js/api.js:83`
- **Routes**: `backend/routes/placement.routes.js:45-46`
- **Controller**: `backend/controllers/placement.controller.js:162`
- **Usage**: `backend/build/placements.html:829`

### Цепочка вызовов

#### 1. Frontend (placements.html:829)
```javascript
await PlacementsAPI.createBatch(data);
```

#### 2. API Helper (api.js:83)
```javascript
const PlacementsAPI = {
    // ...
    createBatch: (data) => apiCall('/placements/batch/create', { method: 'POST', body: JSON.stringify(data) }),
    // ...
};
```

#### 3. Routes (placement.routes.js:45)
```javascript
router.post('/batch/create', createLimiter, placementController.createBatchPlacement);
```

#### 4. Controller (placement.controller.js:162)
```javascript
const placement = await placementService.createPlacement({
  site_id,
  project_id,
  link_ids: assignedLinks,
  article_ids: assignedArticles,
  userId: req.user.id
});
// ❌ Вызывается placementService.createPlacement
// ❌ НЕ billingService.purchasePlacement
// ❌ Деньги НЕ взимаются!
```

### Ожидаемое поведение (согласно CLAUDE.md)
```javascript
// placement.routes.js должен быть:
// REMOVED: router.post('/batch/create') - SECURITY: Bypassed billing system
// REMOVED: router.post('/batch/async') - SECURITY: Bypassed billing system
// USE INSTEAD: POST /api/billing/purchase for paid placements
```

Но в реальности:
```javascript
// ✅ Эти endpoints ВСЁ ЕЩЁ АКТИВНЫ!
router.post('/batch/create', createLimiter, placementController.createBatchPlacement);
router.post('/batch/async', createLimiter, placementController.createBatchPlacementAsync);
```

### Эксплуатация
```bash
# БЕСПЛАТНОЕ создание размещений:
POST /api/placements/batch/create
{
  "project_id": 1,
  "site_ids": [5, 6, 7, 8, 9],  # 5 сайтов
  "link_ids": [10, 11, 12],      # 3 ссылки
  "article_ids": [20, 21]        # 2 статьи
}

# Результат:
# - 5 размещений созданы
# - Деньги НЕ списаны ($0 оплата!)
# - Все ссылки/статьи опубликованы
# - Total value: ~$125 потеряно
```

### Последствия
- **100% обход биллинг системы**
- Любой пользователь может создавать размещения БЕСПЛАТНО
- Финансовые потери = стоимость всех размещений через этот endpoint
- Полное нарушение бизнес-модели

### Требуемое исправление

#### 1. Удалить endpoints из routes
```javascript
// backend/routes/placement.routes.js
// УДАЛИТЬ строки 45-46:
// router.post('/batch/create', createLimiter, placementController.createBatchPlacement);
// router.post('/batch/async', createLimiter, placementController.createBatchPlacementAsync);
```

#### 2. Обновить frontend для использования billing API
```javascript
// backend/build/js/api.js
// УДАЛИТЬ:
// createBatch: (data) => apiCall('/placements/batch/create', ...),

// ДОБАВИТЬ BillingAPI:
const BillingAPI = {
    purchase: (data) => apiCall('/billing/purchase', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    getBalance: () => apiCall('/billing/balance'),
    // ...
};
```

#### 3. Переписать placements.html
```javascript
// backend/build/placements.html
// ЗАМЕНИТЬ PlacementsAPI.createBatch на BillingAPI.purchase
// С правильной обработкой одного contentId за раз
```

### Приоритет
🔴 **КРИТИЧЕСКИЙ МАКСИМУМ** - Полный обход платежной системы

---

## 🔴 ПРОБЛЕМА #5: Эндпоинт POST /placements всё ещё работает

### Описание
Согласно TEST 6 в документации, endpoint `POST /api/placements` должен возвращать `410 Gone`. Это реализовано в routes:

```javascript
// backend/routes/placement.routes.js:30-38
router.post('/', (req, res) => {
  res.status(410).json({
    error: 'This endpoint is deprecated and no longer available',
    message: 'Placement creation has been moved to the billing system',
    newEndpoint: 'POST /api/billing/purchase',
    migration: 'Please use the new billing API to purchase placements',
    documentation: 'See API docs for migration guide'
  });
});
```

### Проблема
**НО!** Frontend всё ещё использует `PlacementsAPI.create` (api.js:82):
```javascript
create: (data) => apiCall('/placements', { method: 'POST', body: JSON.stringify(data) }),
```

Если этот метод вызывается где-то, пользователь получит 410 error вместо корректной миграции.

### Приоритет
🟡 **СРЕДНИЙ** - Endpoint правильно deprecated, но frontend не обновлён

---

## 📊 СВОДКА КРИТИЧЕСКИХ ОШИБОК

| # | Проблема | Файл | Строки | Потеря $ | Приоритет |
|---|----------|------|--------|----------|-----------|
| **1** | Нет проверки квот сайта | billing.service.js | 204-250 | Высокая | 🔴 КРИТИЧЕСКИЙ |
| **2** | 10 contentIds по цене 1 | billing.routes.js<br>billing.service.js | 170<br>250-253 | 90% | 🔴 КРИТИЧЕСКИЙ |
| **3** | Нет refund при scheduled fail | scheduled-placements.cron.js | 125-163 | Средняя | 🔴 КРИТИЧЕСКИЙ |
| **4** | Frontend обходит billing | api.js<br>placement.routes.js<br>placement.controller.js | 83<br>45-46<br>162 | **100%** | 🔴 **МАКСИМУМ** |
| **5** | Deprecated endpoint в frontend | api.js | 82 | - | 🟡 СРЕДНИЙ |

---

## ✅ ЧТО РАБОТАЕТ ПРАВИЛЬНО

### 1. Refund при удалении размещения (TEST 5)
- ✅ `placement.service.js:534-574` - возврат средств реализован
- ✅ Используются транзакции с `FOR UPDATE` lock
- ✅ Создаётся transaction record типа `'refund'`

### 2. Ownership validation (TEST 2)
- ✅ `billing.service.js:239-247` - проверка что контент принадлежит проекту
- ✅ Предотвращает использование чужого контента

### 3. Content existence check (TEST 1)
- ✅ `billing.service.js:227-230` - проверка существования контента
- ✅ Проверка exhausted статуса (TEST 4)

### 4. WordPress ROLLBACK (TEST 3)
- ✅ `billing.service.js:393-404` - ROLLBACK при ошибке WordPress
- ✅ Деньги НЁ списываются если публикация не удалась

### 5. Legacy endpoint deprecated (TEST 6)
- ✅ `placement.routes.js:30-38` - возвращает 410 Gone
- ⚠️ Но frontend не обновлён

---

## 🛠️ РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ

### Немедленно (в течение часа)

1. **ОТКЛЮЧИТЬ старые endpoints**
   ```javascript
   // placement.routes.js
   router.post('/batch/create', (req, res) => {
     res.status(410).json({
       error: 'This endpoint has been permanently disabled for security reasons',
       newEndpoint: 'POST /api/billing/purchase'
     });
   });
   ```

2. **Добавить проверку квот сайта**
   - Файл: `billing.service.js`
   - После строки 204
   - Перед расчётом цены

3. **Ограничить contentIds до 1**
   - `billing.routes.js:170` - `max: 1`
   - `billing.service.js` - добавить проверку `contentIds.length > 1`

### В течение дня

4. **Добавить refund для scheduled placements**
   - Файл: `scheduled-placements.cron.js:125-163`
   - Создать функцию `deleteAndRefundPlacement` в billing.service

5. **Обновить frontend**
   - Создать `BillingAPI` в `api.js`
   - Удалить `PlacementsAPI.create` и `createBatch`
   - Обновить `placements.html`

### Тестирование

6. **Запустить тесты**
   ```bash
   npm run test:billing
   ```

7. **Проверить все 6 TEST cases**
   - TEST 1: Non-existent contentId ✅
   - TEST 2: Ownership validation ✅
   - TEST 3: WordPress ROLLBACK ✅
   - TEST 4: Exhausted content ✅
   - TEST 5: Refund on delete ✅
   - TEST 6: Legacy 410 Gone ⚠️ (frontend не обновлён)

---

## 📝 ЗАМЕТКИ

### Ветка merge-best-of-both
Все эти проблемы **уже исправлены** в ветке `merge-best-of-both`:
- ✅ BUG #5: Site quota check
- ✅ BUG #6: Scheduled refund
- ✅ BUG #7: Single contentId enforcement
- ✅ deleteAndRefundPlacement функция

### Необходимо
**Срочно смержить** `merge-best-of-both` в `main` для применения всех фиксов!

---

**Отчёт создан**: 2025-11-12
**Аудитор**: Claude Code
**Критичность**: 🔴 МАКСИМАЛЬНАЯ - требуется немедленное исправление
