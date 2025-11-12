# 🚨 КРИТИЧЕСКИЕ БАГИ В СИСТЕМЕ РАЗМЕЩЕНИЙ

**Дата обнаружения:** 2025-01-12
**Статус:** 🔴 ТРЕБУЕТ НЕМЕДЛЕННОГО ИСПРАВЛЕНИЯ

---

## ❌ ПРОБЛЕМА #1: Деньги списываются ДО публикации контента

### Описание
Если публикация в WordPress **FAILS**, деньги **НЕ ВОЗВРАЩАЮТСЯ** пользователю.

### Локация
`backend/services/billing.service.js:357-369`

### Проблемный код
```javascript
// 15. If not scheduled, publish immediately
if (status === 'pending') {
  try {
    await publishPlacement(client, placement.id);
  } catch (publishError) {
    logger.error('Failed to publish placement immediately', ...);
    // Don't rollback transaction, just mark as failed  ⚠️ ПРОБЛЕМА!
    await client.query(
      'UPDATE placements SET status = $1 WHERE id = $2',
      ['failed', placement.id]
    );
  }
}

// COMMIT ПРОИСХОДИТ ВСЕГДА! (строка 377)
await client.query('COMMIT');
```

### Последствия
1. ✅ Деньги списаны с баланса пользователя (строка 230-233)
2. ✅ Транзакция создана (строка 236-251)
3. ✅ Placement создан со статусом 'failed' (строка 365-368)
4. ❌ Контент НЕ опубликован в WordPress
5. ✅ Транзакция закоммичена (строка 377)

**Результат:** Пользователь **ПОТЕРЯЛ ДЕНЬГИ**, но **НЕ ПОЛУЧИЛ УСЛУГУ**!

### Сценарии возникновения
- WordPress API недоступен
- Неправильный API key
- Ошибка сети
- Таймаут соединения
- Внутренняя ошибка WordPress

### Риск
🔴 **CRITICAL** - Прямая потеря денег пользователя

---

## ❌ ПРОБЛЕМА #2: Не проверяется существование контента

### Описание
Перед списанием денег **НЕ ПРОВЕРЯЕТСЯ**:
1. Существует ли contentId в базе данных
2. Принадлежит ли контент указанному проекту
3. Доступен ли контент для использования (usage_count < usage_limit)

### Локация
`backend/services/billing.service.js:159-324`

### Что проверяется (ПРАВИЛЬНО):
✅ User exists (строка 174-182)
✅ Project exists and belongs to user (строка 184-192)
✅ Site exists (строка 194-204)
✅ Placement doesn't already exist (строка 206-214)
✅ User has sufficient balance (строка 221-224)

### Что НЕ проверяется (ОШИБКА):
❌ contentIds exist in database
❌ contentIds belong to the specified projectId
❌ contentIds are available (not exhausted)
❌ contentIds are of the correct type (link vs article)

### Проблемный флоу
```javascript
// Деньги списываются БЕЗ проверки contentIds (строка 230-233)
await client.query(
  'UPDATE users SET balance = $1, total_spent = $2 WHERE id = $3',
  [newBalance, newTotalSpent, userId]
);

// Только ПОТОМ пытаемся привязать контент (строка 308-323)
for (const contentId of contentIds) {
  const columnName = type === 'link' ? 'link_id' : 'article_id';
  await client.query(`
    INSERT INTO placement_content (placement_id, ${columnName})
    VALUES ($1, $2)
  `, [placement.id, contentId]);
  // ⚠️ Если contentId не существует - CONSTRAINT ERROR!
  // ⚠️ Транзакция откатится, но деньги уже списаны из users!
}
```

### Последствия
Пользователь может:
1. **Передать несуществующий contentId** → Constraint error → Rollback → **ДЕНЬГИ ПОТЕРЯНЫ**
2. **Передать чужой contentId** (от другого юзера) → **Использовать чужой контент**
3. **Передать exhausted контент** → Не отклонится → **Использует недоступный контент**
4. **Передать article_id когда type='link'** → Foreign key = null → **Некорректные данные**

### Риск
🔴 **CRITICAL** - Потеря денег + использование чужого контента

---

## ❌ ПРОБЛЕМА #3: Неправильная обработка constraint errors

### Описание
При ошибке вставки `placement_content` (например, несуществующий contentId), происходит **ROLLBACK всей транзакции**.

НО! UPDATE users balance (строка 230-233) уже выполнен ВНУТРИ той же транзакции.

### Ожидаемое поведение
При ROLLBACK транзакции, баланс пользователя должен вернуться к исходному значению.

### Реальное поведение
❓ Нужно протестировать - откатывается ли UPDATE users при ROLLBACK?

PostgreSQL ДОЛЖЕН откатить, НО нужно убедиться, что:
1. Нет автокоммитов
2. Транзакция действительно откатывается
3. Нет race conditions

### Риск
🟡 **HIGH** - Потенциальная потеря денег, требует тестирования

---

## ✅ ЧТО РАБОТАЕТ ПРАВИЛЬНО

1. ✅ Проверка существования user
2. ✅ Проверка ownership проекта
3. ✅ Проверка существования сайта
4. ✅ Проверка дубликатов placement
5. ✅ Проверка баланса
6. ✅ Использование транзакций
7. ✅ Row-level locking (FOR UPDATE)
8. ✅ Обновление discount tiers
9. ✅ Создание audit logs
10. ✅ Очистка кэша
11. ✅ Обновление квот сайта
12. ✅ Обновление usage_count контента

---

## 🔧 РЕКОМЕНДУЕМЫЕ ИСПРАВЛЕНИЯ

### Fix #1: Откатывать транзакцию при ошибке публикации

**Вариант A: ROLLBACK при ошибке (строгий)**
```javascript
// 15. If not scheduled, publish immediately
if (status === 'pending') {
  try {
    await publishPlacement(client, placement.id);
  } catch (publishError) {
    logger.error('Failed to publish placement immediately', {
      placementId: placement.id,
      error: publishError.message
    });

    // ROLLBACK транзакции - деньги вернутся
    await client.query('ROLLBACK');
    throw new Error(`Failed to publish placement: ${publishError.message}`);
  }
}

await client.query('COMMIT');
```

**Вариант B: Автоматический refund (мягкий)**
```javascript
// 15. If not scheduled, publish immediately
if (status === 'pending') {
  try {
    await publishPlacement(client, placement.id);
  } catch (publishError) {
    logger.error('Failed to publish placement immediately', ...);

    // Пометить как failed
    await client.query(
      'UPDATE placements SET status = $1 WHERE id = $2',
      ['failed', placement.id]
    );

    // АВТОМАТИЧЕСКИ создать refund
    await client.query(
      'UPDATE users SET balance = $1 WHERE id = $2',
      [user.balance, userId] // Вернуть исходный баланс
    );

    await client.query(`
      INSERT INTO transactions (
        user_id, type, amount, balance_before, balance_after,
        description, related_placement_id
      ) VALUES ($1, 'refund', $2, $3, $4, $5, $6)
    `, [
      userId, finalPrice, newBalance, user.balance,
      'Automatic refund - publication failed', placement.id
    ]);

    logger.info('Auto-refund issued', { placementId: placement.id, amount: finalPrice });
  }
}

await client.query('COMMIT');
```

**Рекомендация:** Использовать **Вариант A (ROLLBACK)** - более надежный и простой.

---

### Fix #2: Проверять contentIds ДО списания денег

```javascript
const purchasePlacement = async ({
  userId, projectId, siteId, type, contentIds, scheduledDate, autoRenewal = false
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1-4. Existing checks...

    // ✅ NEW: Validate contentIds BEFORE charging
    for (const contentId of contentIds) {
      const tableName = type === 'link' ? 'project_links' : 'project_articles';

      const contentResult = await client.query(`
        SELECT id, project_id, usage_count, usage_limit, status
        FROM ${tableName}
        WHERE id = $1
      `, [contentId]);

      if (contentResult.rows.length === 0) {
        throw new Error(`${type} with ID ${contentId} not found`);
      }

      const content = contentResult.rows[0];

      // Check ownership
      if (content.project_id !== projectId) {
        throw new Error(`${type} ${contentId} does not belong to project ${projectId}`);
      }

      // Check availability
      if (content.usage_count >= content.usage_limit) {
        throw new Error(`${type} ${contentId} is exhausted (${content.usage_count}/${content.usage_limit})`);
      }

      // Check status
      if (content.status === 'deleted' || content.status === 'exhausted') {
        throw new Error(`${type} ${contentId} is not available (status: ${content.status})`);
      }
    }

    // 5. Calculate price (NOW SAFE TO CHARGE)
    const basePrice = type === 'link' ? PRICING.LINK_HOMEPAGE : PRICING.ARTICLE_GUEST_POST;
    // ... rest of the code
```

---

### Fix #3: Добавить проверку владельца сайта

**Текущий код:**
```javascript
// 3. Validate site exists
const siteResult = await client.query(
  'SELECT * FROM sites WHERE id = $1',
  [siteId]
);
```

**Исправленный код:**
```javascript
// 3. Validate site exists and check ownership (optional)
const siteResult = await client.query(
  'SELECT * FROM sites WHERE id = $1',
  [siteId]
);

if (siteResult.rows.length === 0) {
  throw new Error('Site not found');
}

const site = siteResult.rows[0];

// ✅ NEW: Optionally check if user owns the site
// (remove this check if placements on any site are allowed)
if (site.user_id !== userId) {
  throw new Error('Cannot create placement on site you do not own');
}
```

**Примечание:** Эта проверка зависит от бизнес-логики. Если пользователи должны размещать контент **ТОЛЬКО на своих сайтах** - добавить проверку. Если можно размещать на любых сайтах - оставить как есть.

---

## 📊 ПРИОРИТЕТЫ ИСПРАВЛЕНИЙ

### 🔴 CRITICAL - Исправить немедленно:
1. **Fix #1** - Откатывать транзакцию при ошибке публикации
2. **Fix #2** - Проверять contentIds до списания денег

### 🟡 HIGH - Исправить в ближайшее время:
3. Протестировать поведение ROLLBACK при constraint errors
4. Добавить тесты на edge cases

### 🟢 MEDIUM - Желательно исправить:
5. Fix #3 - Проверка владельца сайта (опционально)
6. Добавить rate limiting на создание placements
7. Добавить логирование всех ошибок в audit_log

---

## 🧪 ТЕСТОВЫЕ СЦЕНАРИИ

### Тест 1: WordPress API недоступен
```bash
# Отключить WordPress API
# Попытаться создать placement
# Ожидаемый результат: Деньги НЕ списаны

curl -X POST http://localhost:3003/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "article",
    "contentIds": [1]
  }'

# Проверить баланс - должен остаться прежним
curl -H "Authorization: Bearer $TOKEN" http://localhost:3003/api/billing/balance
```

### Тест 2: Несуществующий contentId
```bash
# Передать несуществующий contentId
curl -X POST http://localhost:3003/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "link",
    "contentIds": [99999]
  }'

# Ожидаемый результат: "link with ID 99999 not found"
# Проверить баланс - должен остаться прежним
```

### Тест 3: Чужой contentId
```bash
# User A создает link с ID=10
# User B пытается использовать link ID=10

# Ожидаемый результат: "link 10 does not belong to project X"
```

### Тест 4: Exhausted контент
```bash
# Создать link с usage_limit=1
# Создать 1 placement (usage_count = 1)
# Попытаться создать 2-й placement

# Ожидаемый результат: "link X is exhausted (1/1)"
```

---

## 📝 SUMMARY

| Проблема | Критичность | Потеря денег | Статус |
|----------|-------------|--------------|--------|
| #1: Не откатываются деньги при ошибке публикации | 🔴 CRITICAL | ✅ ДА | ❌ НЕ ИСПРАВЛЕНО |
| #2: Не проверяется contentId до списания | 🔴 CRITICAL | ✅ ДА | ❌ НЕ ИСПРАВЛЕНО |
| #3: Неясно поведение ROLLBACK | 🟡 HIGH | ❓ ВОЗМОЖНО | ⏳ ТРЕБУЕТ ТЕСТА |

**ВЫВОД:** Система размещений содержит критические баги, которые могут привести к потере денег пользователями. Требуется немедленное исправление.

---

**Дата отчета:** 2025-01-12
**Автор:** Claude Code Deep Analysis
