# AI Prompt: Создание системы управления размещением ссылок и статей с биллингом

## Обзор проекта

Создай полнофункциональную систему управления размещением ссылок и статей на WordPress сайтах с интегрированной системой биллинга, балансом пользователей, прогрессивными скидками и автоматическим продлением размещений.

## Технологический стек

### Backend
- **Node.js** с Express.js
- **PostgreSQL 17** - основная база данных
- **Redis** - кэширование и очереди задач
- **Bull Queue** - фоновые задачи (публикация, продление, списания)
- **JWT** - аутентификация
- **Winston** - логирование
- **Bcrypt** - хеширование паролей

### Frontend
- **Vanilla JavaScript** (ES6+)
- **Bootstrap 5.3.0** - UI компоненты
- **Chart.js** - графики и аналитика для админа
- Модульная архитектура (отдельные JS модули для каждой страницы)

### Безопасность
- Helmet.js - HTTP заголовки безопасности
- CORS конфигурация
- Rate limiting (express-rate-limit)
- SQL injection защита (параметризованные запросы)
- XSS защита
- CSRF токены для форм
- Валидация всех входных данных
- Шифрование чувствительных данных
- Аудит логов всех финансовых операций

---

## 1. АРХИТЕКТУРА БАЗЫ ДАННЫХ

### 1.1 Таблица users (РАСШИРЕННАЯ)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user', -- 'user' или 'admin'

    -- НОВОЕ: Биллинг
    balance DECIMAL(10, 2) DEFAULT 0.00 NOT NULL CHECK (balance >= 0),
    total_spent DECIMAL(10, 2) DEFAULT 0.00 NOT NULL, -- Всего потрачено за все время
    current_discount INTEGER DEFAULT 0 CHECK (current_discount BETWEEN 0 AND 30), -- Персональная скидка 0-30%

    -- Безопасность
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    email_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### 1.2 Таблица transactions (НОВАЯ)

```sql
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'deposit', 'purchase', 'renewal', 'refund', 'auto_renewal'
    amount DECIMAL(10, 2) NOT NULL,
    balance_before DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    description TEXT,

    -- Связь с размещением (если транзакция связана с покупкой/продлением)
    placement_id INTEGER REFERENCES placements(id) ON DELETE SET NULL,

    -- Метаданные
    metadata JSONB, -- Дополнительная информация (скидки, промокоды и т.д.)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_placement ON transactions(placement_id);
CREATE INDEX idx_transactions_created ON transactions(created_at);
```

### 1.3 Таблица discount_tiers (НОВАЯ)

```sql
CREATE TABLE discount_tiers (
    id SERIAL PRIMARY KEY,
    min_spent DECIMAL(10, 2) NOT NULL UNIQUE, -- Минимальная сумма трат
    discount_percentage INTEGER NOT NULL CHECK (discount_percentage BETWEEN 0 AND 100),
    tier_name VARCHAR(100), -- 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Начальные данные для системы скидок
INSERT INTO discount_tiers (min_spent, discount_percentage, tier_name) VALUES
(0, 0, 'Стандарт'),
(800, 10, 'Bronze'),
(1200, 15, 'Silver'),
(1600, 20, 'Gold'),
(2000, 25, 'Platinum'),
(2400, 30, 'Diamond');
```

### 1.4 Таблица placements (РАСШИРЕННАЯ)

```sql
CREATE TABLE placements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'link' (главная) или 'article' (гест пост)

    -- НОВОЕ: Финансы
    original_price DECIMAL(10, 2) NOT NULL, -- $25 для ссылок, $15 для статей
    discount_applied INTEGER DEFAULT 0, -- Процент скидки на момент покупки
    final_price DECIMAL(10, 2) NOT NULL, -- Цена после применения скидки

    -- НОВОЕ: Даты и продление
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_publish_date TIMESTAMP, -- Для отложенного размещения (до 90 дней)
    published_at TIMESTAMP, -- Фактическая дата публикации
    expires_at TIMESTAMP, -- Дата истечения (только для ссылок на главной = +1 год)

    -- НОВОЕ: Автопродление
    auto_renewal BOOLEAN DEFAULT false, -- Включено ли автопродление
    renewal_price DECIMAL(10, 2), -- Цена продления (30% базовая скидка + персональная)
    last_renewed_at TIMESTAMP,
    renewal_count INTEGER DEFAULT 0,

    -- Статус
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'scheduled', 'placed', 'failed', 'expired', 'cancelled'
    wordpress_post_id INTEGER,

    -- Связь с транзакцией
    purchase_transaction_id INTEGER REFERENCES transactions(id),

    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_placements_user ON placements(user_id);
CREATE INDEX idx_placements_status ON placements(status);
CREATE INDEX idx_placements_expires_at ON placements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_placements_auto_renewal ON placements(auto_renewal, expires_at) WHERE auto_renewal = true;
CREATE INDEX idx_placements_scheduled ON placements(scheduled_publish_date) WHERE scheduled_publish_date IS NOT NULL;
CREATE INDEX idx_placements_type ON placements(type);
```

### 1.5 Таблица renewal_history (НОВАЯ)

```sql
CREATE TABLE renewal_history (
    id SERIAL PRIMARY KEY,
    placement_id INTEGER REFERENCES placements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

    renewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    price_paid DECIMAL(10, 2) NOT NULL,
    discount_applied INTEGER,
    new_expiry_date TIMESTAMP NOT NULL,

    transaction_id INTEGER REFERENCES transactions(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_renewal_history_placement ON renewal_history(placement_id);
CREATE INDEX idx_renewal_history_user ON renewal_history(user_id);
```

### 1.6 Таблицы projects, sites, project_links, project_articles (БЕЗ ИЗМЕНЕНИЙ)

Оставить как в текущей системе (см. database/init.sql)

---

## 2. СИСТЕМА ЦЕНООБРАЗОВАНИЯ И СКИДОК

### 2.1 Базовые цены

```javascript
const PRICING = {
  LINK_HOMEPAGE: 25.00,      // Ссылка на главной странице
  ARTICLE_GUEST_POST: 15.00, // Гест-пост со статьей

  // Скидка на продление ссылок на главной
  BASE_RENEWAL_DISCOUNT: 30, // Базовая скидка 30%

  // Продление только для ссылок на главной
  RENEWAL_PERIOD_DAYS: 365   // 1 год
};
```

### 2.2 Прогрессивная система скидок

Скидка рассчитывается автоматически на основе `total_spent`:

| Потрачено всего | Скидка | Уровень |
|-----------------|---------|---------|
| $0 - $799       | 0%      | Стандарт |
| $800 - $1199    | 10%     | Bronze  |
| $1200 - $1599   | 15%     | Silver  |
| $1600 - $1999   | 20%     | Gold    |
| $2000 - $2399   | 25%     | Platinum |
| $2400+          | 30%     | Diamond |

### 2.3 Расчет цены продления

```javascript
// Для ссылок на главной
renewalPrice = PRICING.LINK_HOMEPAGE * (1 - 0.30) * (1 - user.current_discount / 100)

// Пример:
// Базовая цена: $25
// Базовая скидка на продление: 30% → $17.50
// Персональная скидка пользователя: 20% → $17.50 * 0.80 = $14.00
// Максимальная скидка: 30% + 30% = 60% → $25 * 0.40 = $10.00
```

**Важно**: Продление есть ТОЛЬКО для ссылок на главной. Для статей продления нет.

---

## 3. БИЗНЕС-ЛОГИКА

### 3.1 Процесс покупки размещения

```javascript
/**
 * Сервис: backend/services/billing.service.js
 */

async function purchasePlacement({
  userId,
  projectId,
  siteId,
  type,           // 'link' или 'article'
  contentIds,     // Массив ID ссылок или статей
  scheduledDate   // Опционально: дата отложенной публикации (до 90 дней)
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Получить пользователя с блокировкой
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = userResult.rows[0];

    // 2. Рассчитать базовую цену
    const basePrice = type === 'link'
      ? PRICING.LINK_HOMEPAGE
      : PRICING.ARTICLE_GUEST_POST;

    // 3. Применить скидку пользователя
    const discount = user.current_discount;
    const finalPrice = basePrice * (1 - discount / 100);

    // 4. Проверить баланс
    if (user.balance < finalPrice) {
      throw new Error('Insufficient balance');
    }

    // 5. Списать с баланса
    const newBalance = user.balance - finalPrice;
    await client.query(
      'UPDATE users SET balance = $1, total_spent = total_spent + $2 WHERE id = $3',
      [newBalance, finalPrice, userId]
    );

    // 6. Создать транзакцию
    const transactionResult = await client.query(`
      INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, metadata)
      VALUES ($1, 'purchase', $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      userId,
      -finalPrice,
      user.balance,
      newBalance,
      `Purchase ${type} placement`,
      JSON.stringify({ type, discount, basePrice, finalPrice })
    ]);

    const transactionId = transactionResult.rows[0].id;

    // 7. Создать размещение
    const expiresAt = type === 'link'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // +1 год
      : null;

    const placementResult = await client.query(`
      INSERT INTO placements (
        user_id, project_id, site_id, type,
        original_price, discount_applied, final_price,
        scheduled_publish_date, expires_at,
        purchase_transaction_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      userId, projectId, siteId, type,
      basePrice, discount, finalPrice,
      scheduledDate || null,
      expiresAt,
      transactionId,
      scheduledDate ? 'scheduled' : 'pending'
    ]);

    const placement = placementResult.rows[0];

    // 8. Связать контент (ссылки/статьи)
    for (const contentId of contentIds) {
      await client.query(`
        INSERT INTO placement_content (
          placement_id,
          ${type === 'link' ? 'link_id' : 'article_id'}
        )
        VALUES ($1, $2)
      `, [placement.id, contentId]);
    }

    // 9. Обновить уровень скидки пользователя
    const newTotalSpent = user.total_spent + finalPrice;
    const newDiscount = await calculateDiscountTier(newTotalSpent);

    if (newDiscount !== user.current_discount) {
      await client.query(
        'UPDATE users SET current_discount = $1 WHERE id = $2',
        [newDiscount, userId]
      );
    }

    // 10. Если не отложенная публикация - опубликовать сразу
    if (!scheduledDate) {
      await publishPlacementToWordPress(client, placement.id);
    }

    await client.query('COMMIT');

    // 11. Очистить кэш
    await cache.delPattern(`placements:user:${userId}:*`);
    await cache.delPattern(`projects:user:${userId}:*`);

    return { success: true, placement, newBalance, newDiscount };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 3.2 Автоматическое продление

```javascript
/**
 * Крон-задача: backend/workers/auto-renewal.worker.js
 * Запускается каждый день в 00:00
 */

async function processAutoRenewals() {
  // Найти все размещения с включенным автопродлением, которые истекают в течение 7 дней
  const placementsToRenew = await query(`
    SELECT p.*, u.balance, u.current_discount
    FROM placements p
    JOIN users u ON p.user_id = u.id
    WHERE p.auto_renewal = true
      AND p.status = 'placed'
      AND p.type = 'link'
      AND p.expires_at <= NOW() + INTERVAL '7 days'
      AND p.expires_at > NOW()
  `);

  for (const placement of placementsToRenew.rows) {
    try {
      await renewPlacement(placement.id, placement.user_id, true); // isAutoRenewal = true
      logger.info('Auto-renewal successful', { placementId: placement.id });
    } catch (error) {
      logger.error('Auto-renewal failed', { placementId: placement.id, error: error.message });

      // Отправить уведомление пользователю о неудачном автопродлении
      await sendNotification(placement.user_id, {
        type: 'auto_renewal_failed',
        placementId: placement.id,
        reason: error.message
      });
    }
  }
}
```

### 3.3 Функция продления размещения

```javascript
async function renewPlacement(placementId, userId, isAutoRenewal = false) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Получить размещение и пользователя
    const placementResult = await client.query(`
      SELECT p.*, u.balance, u.current_discount
      FROM placements p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p, u
    `, [placementId, userId]);

    const placement = placementResult.rows[0];

    if (!placement) {
      throw new Error('Placement not found');
    }

    if (placement.type !== 'link') {
      throw new Error('Only homepage links can be renewed');
    }

    // 2. Рассчитать цену продления
    const basePrice = PRICING.LINK_HOMEPAGE;
    const baseRenewalDiscount = PRICING.BASE_RENEWAL_DISCOUNT; // 30%
    const personalDiscount = placement.current_discount;

    // Применяем обе скидки последовательно
    const priceAfterBaseDiscount = basePrice * (1 - baseRenewalDiscount / 100);
    const finalRenewalPrice = priceAfterBaseDiscount * (1 - personalDiscount / 100);

    // 3. Проверить баланс
    if (placement.balance < finalRenewalPrice) {
      throw new Error('Insufficient balance for renewal');
    }

    // 4. Списать с баланса
    const newBalance = placement.balance - finalRenewalPrice;
    await client.query(
      'UPDATE users SET balance = $1, total_spent = total_spent + $2 WHERE id = $3',
      [newBalance, finalRenewalPrice, userId]
    );

    // 5. Создать транзакцию
    const transactionResult = await client.query(`
      INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, placement_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      userId,
      isAutoRenewal ? 'auto_renewal' : 'renewal',
      -finalRenewalPrice,
      placement.balance,
      newBalance,
      `Renewal of placement #${placementId}`,
      placementId,
      JSON.stringify({
        basePrice,
        baseRenewalDiscount,
        personalDiscount,
        finalPrice: finalRenewalPrice
      })
    ]);

    // 6. Обновить размещение
    const newExpiryDate = new Date(placement.expires_at);
    newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1); // +1 год

    await client.query(`
      UPDATE placements
      SET expires_at = $1,
          last_renewed_at = NOW(),
          renewal_count = renewal_count + 1,
          renewal_price = $2
      WHERE id = $3
    `, [newExpiryDate, finalRenewalPrice, placementId]);

    // 7. Записать в историю продлений
    await client.query(`
      INSERT INTO renewal_history (placement_id, user_id, price_paid, discount_applied, new_expiry_date, transaction_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [placementId, userId, finalRenewalPrice, personalDiscount, newExpiryDate, transactionResult.rows[0].id]);

    await client.query('COMMIT');

    return { success: true, newExpiryDate, pricePaid: finalRenewalPrice };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 3.4 Отложенная публикация (до 90 дней)

```javascript
/**
 * Крон-задача: backend/workers/scheduled-placements.worker.js
 * Запускается каждый час
 */

async function processScheduledPlacements() {
  const now = new Date();

  // Найти все размещения, которые должны быть опубликованы
  const placementsToPublish = await query(`
    SELECT * FROM placements
    WHERE status = 'scheduled'
      AND scheduled_publish_date <= $1
    ORDER BY scheduled_publish_date ASC
  `, [now]);

  for (const placement of placementsToPublish.rows) {
    try {
      await publishPlacementToWordPress(null, placement.id);
      logger.info('Scheduled placement published', { placementId: placement.id });
    } catch (error) {
      logger.error('Failed to publish scheduled placement', { placementId: placement.id, error });

      // Обновить статус на failed
      await query(
        'UPDATE placements SET status = $1 WHERE id = $2',
        ['failed', placement.id]
      );
    }
  }
}
```

---

## 4. API ENDPOINTS

### 4.1 Биллинг и баланс

```javascript
// backend/routes/billing.routes.js

/**
 * GET /api/billing/balance
 * Получить текущий баланс пользователя
 */
router.get('/balance', authenticate, async (req, res) => {
  const user = await getUserBalance(req.user.id);
  res.json({
    balance: user.balance,
    totalSpent: user.total_spent,
    currentDiscount: user.current_discount,
    discountTier: user.tier_name
  });
});

/**
 * POST /api/billing/deposit
 * Пополнить баланс (для админа или интеграции с платежными системами)
 */
router.post('/deposit', authenticate, async (req, res) => {
  const { amount } = req.body;
  const result = await addBalance(req.user.id, amount);
  res.json(result);
});

/**
 * GET /api/billing/transactions
 * История транзакций пользователя
 */
router.get('/transactions', authenticate, async (req, res) => {
  const { page = 1, limit = 50, type } = req.query;
  const transactions = await getUserTransactions(req.user.id, { page, limit, type });
  res.json(transactions);
});

/**
 * GET /api/billing/pricing
 * Получить актуальные цены с учетом скидки пользователя
 */
router.get('/pricing', authenticate, async (req, res) => {
  const user = await query('SELECT current_discount FROM users WHERE id = $1', [req.user.id]);
  const discount = user.rows[0].current_discount;

  res.json({
    link: {
      basePrice: PRICING.LINK_HOMEPAGE,
      discount: discount,
      finalPrice: PRICING.LINK_HOMEPAGE * (1 - discount / 100)
    },
    article: {
      basePrice: PRICING.ARTICLE_GUEST_POST,
      discount: discount,
      finalPrice: PRICING.ARTICLE_GUEST_POST * (1 - discount / 100)
    },
    renewal: {
      basePrice: PRICING.LINK_HOMEPAGE,
      baseDiscount: PRICING.BASE_RENEWAL_DISCOUNT,
      personalDiscount: discount,
      totalDiscount: Math.min(60, PRICING.BASE_RENEWAL_DISCOUNT + discount),
      finalPrice: calculateRenewalPrice(PRICING.LINK_HOMEPAGE, discount)
    },
    discountTiers: await getDiscountTiers()
  });
});
```

### 4.2 Размещения (placements)

```javascript
// backend/routes/placements.routes.js

/**
 * POST /api/placements/purchase
 * Купить новое размещение
 */
router.post('/purchase', authenticate, validate(purchaseSchema), async (req, res) => {
  const {
    projectId,
    siteId,
    type,          // 'link' или 'article'
    contentIds,    // [1, 2, 3] - ID ссылок или статей
    scheduledDate  // ISO string или null для немедленной публикации
  } = req.body;

  // Валидация scheduledDate (максимум 90 дней вперед)
  if (scheduledDate) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);

    if (new Date(scheduledDate) > maxDate) {
      return res.status(400).json({ error: 'Scheduled date cannot be more than 90 days in the future' });
    }
  }

  const result = await purchasePlacement({
    userId: req.user.id,
    projectId,
    siteId,
    type,
    contentIds,
    scheduledDate
  });

  res.json(result);
});

/**
 * POST /api/placements/:id/renew
 * Продлить размещение (только для ссылок на главной)
 */
router.post('/:id/renew', authenticate, async (req, res) => {
  const result = await renewPlacement(req.params.id, req.user.id, false);
  res.json(result);
});

/**
 * PATCH /api/placements/:id/auto-renewal
 * Включить/выключить автопродление
 */
router.patch('/:id/auto-renewal', authenticate, async (req, res) => {
  const { enabled } = req.body;
  await toggleAutoRenewal(req.params.id, req.user.id, enabled);
  res.json({ success: true });
});

/**
 * GET /api/placements/export
 * Экспорт всех размещений пользователя (CSV/JSON)
 */
router.get('/export', authenticate, async (req, res) => {
  const { format = 'csv' } = req.query;
  const placements = await getUserPlacements(req.user.id, 0, 0); // Все размещения

  if (format === 'csv') {
    const csv = convertToCSV(placements);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=placements.csv');
    res.send(csv);
  } else {
    res.json(placements);
  }
});
```

### 4.3 Админ API

```javascript
// backend/routes/admin.routes.js

/**
 * GET /api/admin/dashboard/stats
 * Статистика для админ-дашборда
 */
router.get('/dashboard/stats', authenticate, requireAdmin, async (req, res) => {
  const { period = 'day' } = req.query; // 'day', 'week', 'month', 'year'

  const stats = await getAdminStats(period);
  res.json(stats);
});

/**
 * GET /api/admin/revenue
 * Детализация доходов
 */
router.get('/revenue', authenticate, requireAdmin, async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  const revenue = await getRevenueBreakdown(startDate, endDate, groupBy);
  res.json(revenue);
});

/**
 * GET /api/admin/users
 * Список пользователей с балансами
 */
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  const users = await getUsers({ page, limit, search });
  res.json(users);
});

/**
 * POST /api/admin/users/:id/adjust-balance
 * Скорректировать баланс пользователя (админ)
 */
router.post('/users/:id/adjust-balance', authenticate, requireAdmin, async (req, res) => {
  const { amount, reason } = req.body;
  const result = await adjustUserBalance(req.params.id, amount, reason, req.user.id);
  res.json(result);
});

/**
 * GET /api/admin/placements
 * Все размещения (админ видит размещения только своих сайтов)
 */
router.get('/placements', authenticate, requireAdmin, async (req, res) => {
  const { page = 1, limit = 50, status, type } = req.query;
  const placements = await getAdminPlacements({ page, limit, status, type });
  res.json(placements);
});
```

---

## 5. FRONTEND ИНТЕРФЕЙСЫ

### 5.1 Структура страниц для ПОЛЬЗОВАТЕЛЯ

#### Страница "Проекты" (`/projects.html`)

```html
<!-- Список проектов пользователя -->
<div class="projects-container">
  <div class="header">
    <h1>Мои проекты</h1>
    <button class="btn btn-primary" id="createProjectBtn">Создать проект</button>
  </div>

  <div class="projects-grid">
    <!-- Карточка проекта -->
    <div class="project-card">
      <h3>Название проекта</h3>
      <p class="description">Описание проекта</p>
      <div class="stats">
        <span>Ссылок: 12</span>
        <span>Статей: 5</span>
        <span>Размещений: 8</span>
      </div>
      <a href="/project-detail.html?id=123" class="btn btn-sm btn-outline-primary">Управление</a>
    </div>
  </div>
</div>
```

#### Страница "Ссылки" (`/placements.html`)

**Три вкладки:**

1. **Активные размещения**
   - Таблица всех активных размещений (статус: placed)
   - Колонки: Проект, Сайт, Тип, Дата публикации, Истекает, Цена, Автопродление, Действия
   - Действия: Продлить (только для ссылок), Вкл/Выкл автопродление, Просмотр

2. **Запланированные**
   - Размещения со статусом "scheduled"
   - Показать дату запланированной публикации
   - Возможность отменить запланированное размещение

3. **История**
   - Все размещения (включая истекшие, отмененные)
   - Фильтры по дате, типу, статусу
   - Кнопка "Экспорт CSV"

```javascript
// Пример таблицы активных размещений
class PlacementsManager {
  async loadActivePlacements() {
    const response = await API.get('/api/placements?status=placed');
    const placements = response.data;

    this.renderTable(placements);
  }

  renderTable(placements) {
    const tableBody = document.querySelector('#placementsTable tbody');
    tableBody.innerHTML = '';

    placements.forEach(placement => {
      const row = document.createElement('tr');

      // Подсветка скоро истекающих размещений
      const daysLeft = this.getDaysUntilExpiry(placement.expires_at);
      if (daysLeft <= 30 && daysLeft > 0) {
        row.classList.add('table-warning');
      }

      row.innerHTML = `
        <td>${placement.project_name}</td>
        <td><a href="${placement.site_url}" target="_blank">${placement.site_name}</a></td>
        <td>
          <span class="badge bg-${placement.type === 'link' ? 'primary' : 'success'}">
            ${placement.type === 'link' ? 'Ссылка (главная)' : 'Статья'}
          </span>
        </td>
        <td>${this.formatDate(placement.published_at)}</td>
        <td>
          ${placement.expires_at
            ? `${this.formatDate(placement.expires_at)} (${daysLeft} дн.)`
            : '—'}
        </td>
        <td>$${placement.final_price.toFixed(2)}</td>
        <td>
          ${placement.type === 'link'
            ? `<div class="form-check form-switch">
                 <input class="form-check-input" type="checkbox"
                   ${placement.auto_renewal ? 'checked' : ''}
                   onchange="toggleAutoRenewal(${placement.id}, this.checked)">
               </div>`
            : '—'}
        </td>
        <td>
          ${placement.type === 'link'
            ? `<button class="btn btn-sm btn-success" onclick="renewPlacement(${placement.id})">
                 Продлить ($${placement.renewal_price.toFixed(2)})
               </button>`
            : ''}
          <a href="${placement.site_url}/wp-admin/post.php?post=${placement.wordpress_post_id}&action=edit"
             target="_blank" class="btn btn-sm btn-outline-primary">
            Просмотр
          </a>
        </td>
      `;

      tableBody.appendChild(row);
    });
  }
}
```

#### Страница "Баланс" (`/balance.html`)

```html
<div class="balance-container">
  <!-- Виджет баланса -->
  <div class="balance-widget">
    <div class="row">
      <div class="col-md-4">
        <div class="stat-card">
          <h4>Текущий баланс</h4>
          <h2 class="text-success">$<span id="currentBalance">0.00</span></h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <h4>Потрачено всего</h4>
          <h2 class="text-primary">$<span id="totalSpent">0.00</span></h2>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <h4>Ваша скидка</h4>
          <h2 class="text-warning">
            <span id="currentDiscount">0</span>%
            <small class="text-muted" id="discountTier">Стандарт</small>
          </h2>
        </div>
      </div>
    </div>

    <button class="btn btn-lg btn-primary mt-3" id="depositBtn">
      Пополнить баланс
    </button>
  </div>

  <!-- Прогресс-бар до следующего уровня скидки -->
  <div class="discount-progress mt-4">
    <h5>До следующей скидки</h5>
    <div class="progress">
      <div class="progress-bar" role="progressbar" id="discountProgress"></div>
    </div>
    <p class="text-muted mt-2">
      Потратьте еще $<span id="amountToNextTier">200</span> для получения скидки <span id="nextTierDiscount">15</span>%
    </p>
  </div>

  <!-- Таблица уровней скидок -->
  <div class="discount-tiers mt-4">
    <h5>Уровни скидок</h5>
    <table class="table">
      <thead>
        <tr>
          <th>Уровень</th>
          <th>Минимальная сумма</th>
          <th>Скидка</th>
        </tr>
      </thead>
      <tbody id="discountTiersTable"></tbody>
    </table>
  </div>

  <!-- История транзакций -->
  <div class="transactions-history mt-5">
    <h3>История транзакций</h3>
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Тип</th>
          <th>Сумма</th>
          <th>Баланс после</th>
          <th>Описание</th>
        </tr>
      </thead>
      <tbody id="transactionsTable"></tbody>
    </table>
  </div>
</div>
```

#### Модальное окно покупки размещения

```html
<!-- Modal: Покупка размещения -->
<div class="modal fade" id="purchasePlacementModal">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Купить размещение</h5>
      </div>
      <div class="modal-body">
        <!-- Шаг 1: Выбор проекта -->
        <div class="step step-1">
          <h6>1. Выберите проект</h6>
          <select class="form-select" id="projectSelect">
            <!-- Опции проектов -->
          </select>
        </div>

        <!-- Шаг 2: Тип размещения -->
        <div class="step step-2 mt-3">
          <h6>2. Тип размещения</h6>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="placementType" value="link" checked>
            <label class="form-check-label">
              <strong>Ссылка на главной</strong> — $25.00
              <br><small class="text-muted">Продление через год: $17.50 (30% скидка + персональная)</small>
            </label>
          </div>
          <div class="form-check mt-2">
            <input class="form-check-input" type="radio" name="placementType" value="article">
            <label class="form-check-label">
              <strong>Гест-пост (статья)</strong> — $15.00
              <br><small class="text-muted">Продление недоступно</small>
            </label>
          </div>
        </div>

        <!-- Шаг 3: Выбор сайта -->
        <div class="step step-3 mt-3">
          <h6>3. Выберите сайт</h6>
          <select class="form-select" id="siteSelect">
            <!-- Опции сайтов -->
          </select>
        </div>

        <!-- Шаг 4: Выбор контента -->
        <div class="step step-4 mt-3">
          <h6>4. Выберите контент</h6>
          <select class="form-select" id="contentSelect" multiple size="5">
            <!-- Опции ссылок или статей -->
          </select>
        </div>

        <!-- Шаг 5: Дата публикации -->
        <div class="step step-5 mt-3">
          <h6>5. Дата публикации (опционально)</h6>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="publishTime" value="immediate" checked>
            <label class="form-check-label">Опубликовать сразу</label>
          </div>
          <div class="form-check mt-2">
            <input class="form-check-input" type="radio" name="publishTime" value="scheduled">
            <label class="form-check-label">Отложенная публикация</label>
          </div>
          <div class="scheduled-date-picker mt-2" style="display:none;">
            <label class="form-label">Выберите дату (до 90 дней)</label>
            <input type="date" class="form-control" id="scheduledDate"
              min="" max="">
            <small class="text-muted">Размещение будет опубликовано автоматически в выбранную дату</small>
          </div>
        </div>

        <!-- Итоговая цена -->
        <div class="price-summary mt-4 p-3 bg-light rounded">
          <div class="row">
            <div class="col-6">
              <p class="mb-1">Базовая цена:</p>
              <p class="mb-1">Ваша скидка (<span id="userDiscount">0</span>%):</p>
              <p class="mb-0"><strong>Итого к оплате:</strong></p>
            </div>
            <div class="col-6 text-end">
              <p class="mb-1">$<span id="basePrice">0.00</span></p>
              <p class="mb-1 text-success">-$<span id="discountAmount">0.00</span></p>
              <p class="mb-0"><strong class="text-primary fs-4">$<span id="finalPrice">0.00</span></strong></p>
            </div>
          </div>
        </div>

        <!-- Предупреждение о балансе -->
        <div class="alert alert-warning mt-3" id="insufficientBalanceAlert" style="display:none;">
          Недостаточно средств на балансе. Необходимо пополнить на $<span id="amountNeeded">0.00</span>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
        <button type="button" class="btn btn-primary" id="confirmPurchaseBtn">
          Купить размещение
        </button>
      </div>
    </div>
  </div>
</div>
```

### 5.2 Структура страниц для АДМИНА

#### Админ-дашборд (`/admin/dashboard.html`)

```html
<div class="admin-dashboard">
  <h1>Панель администратора</h1>

  <!-- Период выборки -->
  <div class="period-selector mb-4">
    <button class="btn btn-sm btn-outline-primary" data-period="day">День</button>
    <button class="btn btn-sm btn-outline-primary active" data-period="week">Неделя</button>
    <button class="btn btn-sm btn-outline-primary" data-period="month">Месяц</button>
    <button class="btn btn-sm btn-outline-primary" data-period="year">Год</button>
  </div>

  <!-- Статистика доходов -->
  <div class="revenue-stats row">
    <div class="col-md-3">
      <div class="stat-card">
        <h5>Доход за день</h5>
        <h2 class="text-success">$<span id="revenueDay">0.00</span></h2>
        <small class="text-muted">Транзакций: <span id="transactionsDay">0</span></small>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card">
        <h5>Доход за неделю</h5>
        <h2 class="text-success">$<span id="revenueWeek">0.00</span></h2>
        <small class="text-muted">Транзакций: <span id="transactionsWeek">0</span></small>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card">
        <h5>Доход за месяц</h5>
        <h2 class="text-success">$<span id="revenueMonth">0.00</span></h2>
        <small class="text-muted">Транзакций: <span id="transactionsMonth">0</span></small>
      </div>
    </div>
    <div class="col-md-3">
      <div class="stat-card">
        <h5>Доход за год</h5>
        <h2 class="text-success">$<span id="revenueYear">0.00</span></h2>
        <small class="text-muted">Транзакций: <span id="transactionsYear">0</span></small>
      </div>
    </div>
  </div>

  <!-- Разбивка по типам -->
  <div class="revenue-breakdown mt-4">
    <h3>Разбивка доходов</h3>
    <div class="row">
      <div class="col-md-6">
        <canvas id="revenueByTypeChart"></canvas>
      </div>
      <div class="col-md-6">
        <canvas id="revenueTimelineChart"></canvas>
      </div>
    </div>
  </div>

  <!-- Статистика по размещениям -->
  <div class="placements-stats mt-5">
    <h3>Размещения</h3>
    <div class="row">
      <div class="col-md-3">
        <div class="stat-card">
          <h5>Всего размещений</h5>
          <h2><span id="totalPlacements">0</span></h2>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <h5>Ссылок на главной</h5>
          <h2 class="text-primary"><span id="linkPlacements">0</span></h2>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <h5>Гест-постов</h5>
          <h2 class="text-success"><span id="articlePlacements">0</span></h2>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <h5>Запланированных</h5>
          <h2 class="text-warning"><span id="scheduledPlacements">0</span></h2>
        </div>
      </div>
    </div>
  </div>

  <!-- Последние покупки -->
  <div class="recent-purchases mt-5">
    <h3>Последние покупки</h3>
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Пользователь</th>
          <th>Проект</th>
          <th>Тип</th>
          <th>Сайт</th>
          <th>Цена</th>
          <th>Скидка</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody id="recentPurchasesTable"></tbody>
    </table>
  </div>
</div>
```

#### Админ - Управление пользователями (`/admin/users.html`)

```html
<div class="admin-users">
  <div class="header">
    <h1>Управление пользователями</h1>
    <input type="text" class="form-control w-25" placeholder="Поиск..." id="userSearch">
  </div>

  <table class="table table-hover">
    <thead>
      <tr>
        <th>ID</th>
        <th>Имя пользователя</th>
        <th>Email</th>
        <th>Баланс</th>
        <th>Потрачено</th>
        <th>Скидка</th>
        <th>Размещений</th>
        <th>Регистрация</th>
        <th>Действия</th>
      </tr>
    </thead>
    <tbody id="usersTable"></tbody>
  </table>

  <!-- Модальное окно корректировки баланса -->
  <div class="modal" id="adjustBalanceModal">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Корректировка баланса</h5>
        </div>
        <div class="modal-body">
          <p>Пользователь: <strong id="adjustUserName"></strong></p>
          <p>Текущий баланс: $<strong id="adjustCurrentBalance"></strong></p>

          <div class="mb-3">
            <label class="form-label">Сумма</label>
            <input type="number" class="form-control" id="adjustAmount" step="0.01">
            <small class="text-muted">Используйте отрицательное значение для списания</small>
          </div>

          <div class="mb-3">
            <label class="form-label">Причина</label>
            <textarea class="form-control" id="adjustReason" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
          <button type="button" class="btn btn-primary" id="confirmAdjustBtn">Применить</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### Админ - Сайты (`/admin/sites.html`)

Аналогично текущей странице `sites.html`, но админ видит только свои сайты (не всех пользователей).

#### Админ - Размещения (`/admin/placements.html`)

Аналогично пользовательской странице, но админ видит размещения ТОЛЬКО на своих сайтах.

---

## 6. БЕЗОПАСНОСТЬ

### 6.1 Критические меры безопасности

#### 6.1.1 Аутентификация и авторизация

```javascript
// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Rate limiting для логина
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // Максимум 5 попыток
  message: 'Too many login attempts, please try again later'
});

// Middleware аутентификации
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Проверить, что аккаунт не заблокирован
    const userResult = await query(
      'SELECT id, username, role, account_locked_until FROM users WHERE id = $1',
      [decoded.userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({ error: 'Account is locked' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware для проверки роли админа
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

#### 6.1.2 Защита от атак

```javascript
// backend/app.js

const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// Rate limiting для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // Максимум 100 запросов
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// Более строгий rate limiting для финансовых операций
const financialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 20, // Максимум 20 операций
});

app.use('/api/billing', financialLimiter);
app.use('/api/placements/purchase', financialLimiter);

// Защита от NoSQL injection (на всякий случай)
app.use(mongoSanitize());

// Защита от XSS
app.use(xss());

// Content Security Policy
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
    styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", "cdn.jsdelivr.net"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
}));
```

#### 6.1.3 Защита финансовых транзакций

```javascript
// backend/services/billing.service.js

// Использование транзакций БД с блокировкой строк
const purchasePlacement = async (data) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // КРИТИЧНО: Блокировка строки пользователя FOR UPDATE
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [data.userId]
    );

    // ... остальная логика

    // Аудит лог ВСЕХ финансовых операций
    await client.query(`
      INSERT INTO audit_log (user_id, action, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      data.userId,
      'purchase_placement',
      JSON.stringify({ placementId, amount, balanceBefore, balanceAfter }),
      req.ip,
      req.headers['user-agent']
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    // Логирование ошибок с контекстом
    logger.error('Purchase failed', {
      userId: data.userId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  } finally {
    client.release();
  }
};
```

#### 6.1.4 Таблица audit_log

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
```

#### 6.1.5 Валидация входных данных

```javascript
// backend/middleware/validation.js

const { body, validationResult } = require('express-validator');

const purchaseValidation = [
  body('projectId').isInt({ min: 1 }),
  body('siteId').isInt({ min: 1 }),
  body('type').isIn(['link', 'article']),
  body('contentIds').isArray({ min: 1, max: 10 }),
  body('contentIds.*').isInt({ min: 1 }),
  body('scheduledDate').optional().isISO8601().custom((value) => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);

    if (new Date(value) > maxDate) {
      throw new Error('Scheduled date cannot be more than 90 days in the future');
    }

    return true;
  }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

#### 6.1.6 Защита от CSRF

```javascript
// backend/app.js

const csrf = require('csurf');

// CSRF защита для форм (не для API с JWT)
const csrfProtection = csrf({ cookie: true });

// Применять только к формам, не к API
app.use('/admin', csrfProtection);

// Эндпоинт для получения CSRF токена
app.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

---

## 7. ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ

### 7.1 Система уведомлений

```javascript
// backend/services/notification.service.js

const sendNotification = async (userId, notification) => {
  // Сохранить в БД
  await query(`
    INSERT INTO notifications (user_id, type, title, message, metadata, read)
    VALUES ($1, $2, $3, $4, $5, false)
  `, [
    userId,
    notification.type,
    notification.title,
    notification.message,
    JSON.stringify(notification.metadata || {})
  ]);

  // Опционально: отправить email
  if (notification.sendEmail) {
    await sendEmail(userId, notification);
  }
};

// Примеры уведомлений:
// - Баланс пополнен
// - Размещение успешно опубликовано
// - Автопродление не удалось (недостаточно средств)
// - Размещение скоро истекает (за 7 дней)
// - Достигнут новый уровень скидки
```

### 7.2 Крон-задачи

```javascript
// backend/cron/index.js

const cron = require('node-cron');

// Каждый день в 00:00 - обработка автопродлений
cron.schedule('0 0 * * *', async () => {
  await processAutoRenewals();
});

// Каждый час - публикация запланированных размещений
cron.schedule('0 * * * *', async () => {
  await processScheduledPlacements();
});

// Каждый день в 09:00 - отправка уведомлений о скоро истекающих размещениях
cron.schedule('0 9 * * *', async () => {
  await sendExpiryReminders();
});

// Каждый день в 01:00 - очистка старых логов (старше 6 месяцев)
cron.schedule('0 1 * * *', async () => {
  await cleanupOldLogs();
});
```

### 7.3 Экспорт данных

```javascript
// backend/services/export.service.js

const exportPlacements = async (userId, format = 'csv') => {
  const placements = await getUserPlacements(userId, 0, 0);

  if (format === 'csv') {
    const fields = [
      'ID',
      'Проект',
      'Сайт',
      'Тип',
      'Статус',
      'Дата публикации',
      'Дата истечения',
      'Цена',
      'Автопродление',
      'Продлений'
    ];

    const data = placements.map(p => [
      p.id,
      p.project_name,
      p.site_name,
      p.type === 'link' ? 'Ссылка (главная)' : 'Статья',
      p.status,
      formatDate(p.published_at),
      p.expires_at ? formatDate(p.expires_at) : '—',
      `$${p.final_price.toFixed(2)}`,
      p.auto_renewal ? 'Да' : 'Нет',
      p.renewal_count || 0
    ]);

    return generateCSV(fields, data);
  }

  return placements;
};
```

---

## 8. РАЗВЕРТЫВАНИЕ И НАСТРОЙКА

### 8.1 Переменные окружения (.env)

```bash
# База данных
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT
JWT_SECRET=your-very-long-secret-key-min-32-characters

# Сервер
NODE_ENV=production
PORT=3003

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Цены (опционально, можно хардкодить)
PRICE_LINK=25.00
PRICE_ARTICLE=15.00
BASE_RENEWAL_DISCOUNT=30

# Email (опционально, для уведомлений)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

### 8.2 Миграция базы данных

```sql
-- database/migrations/001_add_billing_system.sql

-- Добавить колонки к users
ALTER TABLE users
ADD COLUMN balance DECIMAL(10, 2) DEFAULT 0.00 NOT NULL CHECK (balance >= 0),
ADD COLUMN total_spent DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN current_discount INTEGER DEFAULT 0 CHECK (current_discount BETWEEN 0 AND 30),
ADD COLUMN last_login TIMESTAMP,
ADD COLUMN failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN account_locked_until TIMESTAMP,
ADD COLUMN email_verified BOOLEAN DEFAULT false,
ADD COLUMN verification_token VARCHAR(255);

-- Создать новые таблицы
CREATE TABLE transactions (...);
CREATE TABLE discount_tiers (...);
CREATE TABLE renewal_history (...);
CREATE TABLE notifications (...);
CREATE TABLE audit_log (...);

-- Обновить placements
ALTER TABLE placements
ADD COLUMN original_price DECIMAL(10, 2),
ADD COLUMN discount_applied INTEGER DEFAULT 0,
ADD COLUMN final_price DECIMAL(10, 2),
ADD COLUMN purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN scheduled_publish_date TIMESTAMP,
ADD COLUMN published_at TIMESTAMP,
ADD COLUMN expires_at TIMESTAMP,
ADD COLUMN auto_renewal BOOLEAN DEFAULT false,
ADD COLUMN renewal_price DECIMAL(10, 2),
ADD COLUMN last_renewed_at TIMESTAMP,
ADD COLUMN renewal_count INTEGER DEFAULT 0,
ADD COLUMN purchase_transaction_id INTEGER REFERENCES transactions(id);
```

---

## 9. ТЕСТИРОВАНИЕ

### 9.1 Юнит-тесты (Jest)

```javascript
// backend/tests/billing.service.test.js

describe('Billing Service', () => {
  test('should calculate discount correctly', async () => {
    const discount = await calculateDiscountTier(1500);
    expect(discount).toBe(15); // Silver tier
  });

  test('should prevent purchase with insufficient balance', async () => {
    await expect(purchasePlacement({
      userId: 1,
      projectId: 1,
      siteId: 1,
      type: 'link',
      contentIds: [1]
    })).rejects.toThrow('Insufficient balance');
  });

  test('should apply both renewal discounts correctly', () => {
    const basePrice = 25;
    const personalDiscount = 20;
    const renewalPrice = calculateRenewalPrice(basePrice, personalDiscount);

    // 25 * 0.7 (30% base) * 0.8 (20% personal) = 14.00
    expect(renewalPrice).toBe(14.00);
  });
});
```

### 9.2 Интеграционные тесты

```javascript
// backend/tests/integration/purchase.test.js

describe('Purchase Flow', () => {
  test('should complete full purchase flow', async () => {
    // 1. Пополнить баланс
    await addBalance(userId, 100);

    // 2. Купить размещение
    const result = await purchasePlacement({
      userId,
      projectId: 1,
      siteId: 1,
      type: 'link',
      contentIds: [1]
    });

    // 3. Проверить транзакцию
    const transaction = await getTransaction(result.placement.purchase_transaction_id);
    expect(transaction.type).toBe('purchase');

    // 4. Проверить размещение
    expect(result.placement.status).toBe('pending');
    expect(result.placement.final_price).toBeLessThan(25); // Со скидкой

    // 5. Проверить баланс
    const user = await getUser(userId);
    expect(user.balance).toBe(100 - result.placement.final_price);
  });
});
```

---

## 10. ИТОГОВЫЙ ЧЕКЛИСТ

### Функциональность

- [ ] Регистрация и авторизация пользователей
- [ ] Система баланса с пополнением
- [ ] Прогрессивные скидки (0-30%)
- [ ] Покупка размещений (ссылки $25, статьи $15)
- [ ] Отложенная публикация (до 90 дней)
- [ ] Продление ссылок на главной (только для ссылок)
- [ ] Автопродление с автосписанием
- [ ] Расчет цены продления (30% + персональная скидка)
- [ ] История транзакций
- [ ] Экспорт размещений (CSV/JSON)
- [ ] Админ-дашборд с аналитикой
- [ ] Статистика доходов (день/неделя/месяц/год)
- [ ] Управление пользователями (админ)
- [ ] Корректировка баланса (админ)
- [ ] Audit log всех финансовых операций

### Безопасность

- [ ] JWT аутентификация
- [ ] Rate limiting (общий и финансовый)
- [ ] SQL injection защита (параметризованные запросы)
- [ ] XSS защита
- [ ] CSRF защита для форм
- [ ] Валидация всех входных данных
- [ ] Блокировка аккаунта после неудачных попыток входа
- [ ] Блокировка строк FOR UPDATE в транзакциях
- [ ] Helmet.js для HTTP заголовков
- [ ] Логирование всех критичных операций

### UI/UX

- [ ] Страница "Проекты"
- [ ] Страница "Ссылки" (3 вкладки: Активные, Запланированные, История)
- [ ] Страница "Баланс" с прогресс-баром скидок
- [ ] Модальное окно покупки с калькулятором цены
- [ ] Админ-дашборд с графиками (Chart.js)
- [ ] Админ - Управление пользователями
- [ ] Админ - Сайты
- [ ] Админ - Размещения
- [ ] Responsive дизайн (Bootstrap 5)

### Фоновые задачи

- [ ] Крон автопродления (ежедневно)
- [ ] Крон публикации запланированных (ежечасно)
- [ ] Крон уведомлений о истечении (ежедневно)
- [ ] Очистка старых логов

---

## ЗАКЛЮЧЕНИЕ

Данный промпт содержит ПОЛНУЮ спецификацию для создания системы управления размещением ссылок и статей с интегрированным биллингом. Следуй архитектуре, паттернам и требованиям безопасности точно как описано выше.

**Важные напоминания:**

1. **Транзакции БД** - ВСЕГДА используй для финансовых операций
2. **FOR UPDATE** - ВСЕГДА блокируй строки при изменении баланса
3. **Audit log** - ВСЕГДА записывай финансовые операции
4. **Валидация** - ВСЕГДА валидируй входные данные
5. **Rate limiting** - ОБЯЗАТЕЛЬНО для финансовых эндпоинтов
6. **Параметризованные запросы** - НИКОГДА не используй конкатенацию строк в SQL

**Тестирование перед деплоем:**

- Юнит-тесты всех сервисов
- Интеграционные тесты критичных флоу
- Нагрузочное тестирование финансовых эндпоинтов
- Тестирование безопасности (SQL injection, XSS, CSRF)

Удачи в разработке! 🚀
