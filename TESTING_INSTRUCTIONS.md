# 🧪 Инструкции по тестированию системы размещений

**Дата:** 2025-01-12
**Статус:** Готово к тестированию на продакшене

---

## ⚠️ ВАЖНО: Тесты можно запустить ТОЛЬКО на продакшене

Из локального окружения Claude Code **нет доступа** к production базе данных. Тесты нужно запускать:
- На production сервере (DigitalOcean)
- На вашем локальном Mac (с доступом к production БД)
- Через DigitalOcean App Console

---

## 🔧 Подготовка к тестам

### 1. Получить токен авторизации

```bash
TOKEN=$(curl -s -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```

### 2. Проверить баланс перед тестами

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq

# Ожидаемый ответ:
# {
#   "success": true,
#   "data": {
#     "balance": 100.00,
#     "totalSpent": 50.00,
#     "currentDiscount": 10,
#     "discountTier": "Bronze"
#   }
# }
```

### 3. Получить ID проекта, сайта и контента

```bash
# Проекты
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/projects | jq '.data[0].id'

# Сайты
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/sites | jq '.data[0].id'

# Ссылки в проекте
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/projects/1 | jq '.links[0].id'
```

---

## ✅ ТЕСТ #1: Несуществующий contentId

### Цель
Проверить, что система **НЕ СПИСЫВАЕТ ДЕНЬГИ** при попытке создать placement с несуществующим contentId.

### Выполнение

```bash
# Запомнить текущий баланс
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance before: $BALANCE_BEFORE"

# Попытка создать placement с несуществующим contentId
curl -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "link",
    "contentIds": [99999]
  }' | jq

# Проверить баланс после
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance after: $BALANCE_AFTER"
```

### Ожидаемый результат

**HTTP Response:**
```json
{
  "error": "link with ID 99999 not found"
}
```

**Status Code:** `400 Bad Request`

**Баланс:** Должен остаться **БЕЗ ИЗМЕНЕНИЙ**
```
Balance before: 100.00
Balance after: 100.00
```

### ❌ Если тест НЕ прошел

Если деньги списались - это **КРИТИЧЕСКИЙ БАГ**! Значит:
- Валидация contentId не работает
- Транзакция закоммитилась до проверки
- Нужно откатить изменения и пересмотреть логику

---

## ✅ ТЕСТ #2: Чужой contentId

### Цель
Проверить, что пользователь **НЕ МОЖЕТ использовать** контент из чужого проекта.

### Подготовка

1. Создайте 2 пользователя: User A и User B
2. User A создает project_id=1 с link_id=10
3. User B создает project_id=2

### Выполнение

```bash
# Логин как User B
TOKEN_B=$(curl -s -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"userB","password":"password"}' \
  | jq -r '.token')

# Проверить баланс
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN_B" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "User B balance before: $BALANCE_BEFORE"

# User B пытается использовать link_id=10 (принадлежит User A)
curl -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 2,
    "siteId": 3,
    "type": "link",
    "contentIds": [10]
  }' | jq

# Проверить баланс после
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN_B" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "User B balance after: $BALANCE_AFTER"
```

### Ожидаемый результат

**HTTP Response:**
```json
{
  "error": "link 10 does not belong to project 2"
}
```

**Status Code:** `400 Bad Request`

**Баланс User B:** Должен остаться **БЕЗ ИЗМЕНЕНИЙ**

### ❌ Если тест НЕ прошел

Если User B смог использовать чужой контент - это **КРИТИЧЕСКАЯ УЯЗВИМОСТЬ**!
- Пользователи могут красть контент друг у друга
- Проверка ownership не работает
- Нужно срочно исправлять

---

## ✅ ТЕСТ #3: WordPress API недоступен

### Цель
Проверить, что при **ошибке публикации** в WordPress деньги **НЕ СПИСЫВАЮТСЯ** (транзакция откатывается).

### Вариант A: Имитация недоступности WordPress

**Способ 1: Неправильный API key**
```bash
# Обновить сайт с неправильным API key
curl -X PUT https://your-domain.com/api/sites/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "invalid_key_12345"
  }'
```

**Способ 2: Блокировать WordPress URL в /etc/hosts (на сервере)**
```bash
sudo echo "127.0.0.1 wordpress-site.com" >> /etc/hosts
```

**Способ 3: Временно отключить WordPress плагин**

### Выполнение

```bash
# Запомнить баланс
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance before: $BALANCE_BEFORE"

# Попытка создать article placement (требует публикации в WordPress)
curl -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "article",
    "contentIds": [5]
  }' | jq

# Проверить баланс после
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance after: $BALANCE_AFTER"

# Проверить транзакции
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/transactions | jq '.data | last'
```

### Ожидаемый результат

**HTTP Response:**
```json
{
  "error": "Failed to publish placement: [WordPress error details]. Your balance has not been charged."
}
```

**Status Code:** `400 Bad Request` или `500 Internal Server Error`

**Баланс:** Должен остаться **БЕЗ ИЗМЕНЕНИЙ**
```
Balance before: 100.00
Balance after: 100.00
```

**Последняя транзакция:** НЕ должно быть новой транзакции типа 'purchase'

### ❌ Если тест НЕ прошел

Если деньги списались, но placement не создан - это **САМЫЙ КРИТИЧЕСКИЙ БАГ**!
- Пользователь **ПОТЕРЯЛ ДЕНЬГИ** и **НЕ ПОЛУЧИЛ УСЛУГУ**
- Транзакция НЕ откатилась
- Нужно НЕМЕДЛЕННО откатить изменения

**Действия:**
1. Остановить production сервер
2. Откатить код к предыдущей версии
3. Вручную вернуть деньги пострадавшим пользователям
4. Исправить баг перед повторным деплоем

---

## ✅ ТЕСТ #4: Exhausted контент

### Цель
Проверить, что нельзя создать placement с контентом, у которого `usage_count >= usage_limit`.

### Подготовка

```bash
# Создать ссылку с usage_limit=1
curl -X POST https://your-domain.com/api/projects/1/links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/test",
    "anchor_text": "Test Link",
    "usage_limit": 1
  }' | jq

# Запомнить ID созданной ссылки (например, 15)
LINK_ID=15
```

### Выполнение

```bash
# Создать первый placement (должно успешно списать usage_count = 1)
curl -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": 1,
    \"siteId\": 1,
    \"type\": \"link\",
    \"contentIds\": [$LINK_ID]
  }" | jq

# Проверить usage_count
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/projects/1 | jq ".links[] | select(.id == $LINK_ID)"

# Должно показать: "usage_count": 1, "usage_limit": 1, "status": "exhausted"

# Запомнить баланс
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

# Попытка создать ВТОРОЙ placement (должно отклониться)
curl -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": 1,
    \"siteId\": 2,
    \"type\": \"link\",
    \"contentIds\": [$LINK_ID]
  }" | jq

# Проверить баланс после
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance before: $BALANCE_BEFORE"
echo "Balance after: $BALANCE_AFTER"
```

### Ожидаемый результат

**Первый placement:**
- ✅ Успешно создан
- ✅ Деньги списаны
- ✅ usage_count обновлен: 0 → 1
- ✅ status изменен: "active" → "exhausted"

**Второй placement (exhausted):**

**HTTP Response:**
```json
{
  "error": "link 15 is exhausted (used 1/1 times)"
}
```

**Status Code:** `400 Bad Request`

**Баланс:** Должен остаться **БЕЗ ИЗМЕНЕНИЙ**

---

## ✅ ТЕСТ #5: Удаление placement с refund

### Цель
Проверить, что при удалении **ОПЛАЧЕННОГО** placement деньги **ВОЗВРАЩАЮТСЯ** пользователю.

### Выполнение

```bash
# Проверить текущий баланс
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance before purchase: $BALANCE_BEFORE"

# Создать placement (будет списано $25 за link или $15 за article)
RESPONSE=$(curl -s -X POST https://your-domain.com/api/billing/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "siteId": 1,
    "type": "link",
    "contentIds": [1]
  }')

echo "Purchase response:"
echo $RESPONSE | jq

# Получить ID созданного placement
PLACEMENT_ID=$(echo $RESPONSE | jq -r '.data.placement.id')
PRICE_PAID=$(echo $RESPONSE | jq -r '.data.placement.final_price')

echo "Placement ID: $PLACEMENT_ID"
echo "Price paid: $PRICE_PAID"

# Проверить баланс после покупки
BALANCE_AFTER_PURCHASE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance after purchase: $BALANCE_AFTER_PURCHASE"

# УДАЛИТЬ placement (должен вернуть деньги)
DELETE_RESPONSE=$(curl -s -X DELETE \
  https://your-domain.com/api/placements/$PLACEMENT_ID \
  -H "Authorization: Bearer $TOKEN")

echo "Delete response:"
echo $DELETE_RESPONSE | jq

# Проверить баланс после удаления
BALANCE_AFTER_DELETE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/balance | jq -r '.data.balance')

echo "Balance after delete: $BALANCE_AFTER_DELETE"

# Проверить транзакции
echo "Recent transactions:"
curl -s -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/billing/transactions | jq '.data[-2:]'
```

### Ожидаемый результат

**После покупки:**
```
Balance before purchase: 100.00
Price paid: 25.00
Balance after purchase: 75.00
```

**После удаления:**

**HTTP Response:**
```json
{
  "message": "Placement deleted successfully",
  "refund": {
    "amount": 25.00,
    "newBalance": 100.00
  }
}
```

**Баланс вернулся:**
```
Balance after delete: 100.00
```

**Транзакции:**
```json
[
  {
    "type": "purchase",
    "amount": -25.00,
    "description": "Purchase link placement on Site Name"
  },
  {
    "type": "refund",
    "amount": 25.00,
    "description": "Refund for link placement on Site Name (Project Name)"
  }
]
```

### ❌ Если тест НЕ прошел

Если деньги **НЕ ВЕРНУЛИСЬ** после удаления:
- Refund функция не работает
- Пользователь потерял деньги безвозвратно
- Нужно вручную вернуть деньги через admin панель

---

## ✅ ТЕСТ #6: Legacy эндпоинт ЗАКРЫТ

### Цель
Убедиться, что старый бесплатный эндпоинт `/placements/batch/create` **БОЛЬШЕ НЕ РАБОТАЕТ**.

### Выполнение

```bash
curl -X POST https://your-domain.com/api/placements/batch/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "site_ids": [1, 2, 3],
    "link_ids": [1]
  }' | jq
```

### Ожидаемый результат

**HTTP Response:**
```json
{
  "error": "This endpoint has been removed for security reasons",
  "reason": "Bypassed billing system - all placements must be paid",
  "alternative": "Use POST /api/billing/purchase to create paid placements",
  "documentation": "See /api/billing/pricing for current pricing"
}
```

**Status Code:** `410 Gone`

### ❌ Если тест НЕ прошел

Если эндпоинт все еще создает placements - это **КРИТИЧЕСКАЯ УЯЗВИМОСТЬ**!
- Пользователи могут создавать бесплатные placements
- Система биллинга обходится
- Нужно НЕМЕДЛЕННО закрыть эндпоинт

---

## 📊 Сводная таблица тестов

| # | Тест | Цель | Ожидаемый результат | Критичность |
|---|------|------|---------------------|-------------|
| 1 | Несуществующий contentId | Проверка валидации | Ошибка + баланс НЕ изменен | 🔴 CRITICAL |
| 2 | Чужой contentId | Проверка ownership | Ошибка + баланс НЕ изменен | 🔴 CRITICAL |
| 3 | WordPress недоступен | Проверка ROLLBACK | Ошибка + баланс НЕ изменен | 🔴 CRITICAL |
| 4 | Exhausted контент | Проверка usage_limit | Ошибка + баланс НЕ изменен | 🟡 HIGH |
| 5 | Удаление с refund | Проверка возврата денег | Деньги вернулись | 🟡 HIGH |
| 6 | Legacy эндпоинт | Проверка закрытия дыры | 410 Gone | 🔴 CRITICAL |

---

## 🚀 Автоматический тестовый скрипт

Создайте файл `test_billing.sh`:

```bash
#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
API_BASE="https://your-domain.com/api"
USERNAME="admin"
PASSWORD="admin123"

echo "🧪 Starting billing system tests..."

# Получить токен
echo "📝 Logging in..."
TOKEN=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Logged in successfully${NC}"

# ТЕСТ #1: Несуществующий contentId
echo ""
echo "🧪 TEST #1: Non-existent contentId"
BALANCE_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/billing/balance" | jq -r '.data.balance')
curl -s -X POST "$API_BASE/billing/purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":1,"siteId":1,"type":"link","contentIds":[99999]}' > /tmp/test1.json
ERROR=$(cat /tmp/test1.json | jq -r '.error')
BALANCE_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/billing/balance" | jq -r '.data.balance')

if [ "$BALANCE_BEFORE" == "$BALANCE_AFTER" ] && [[ "$ERROR" == *"not found"* ]]; then
  echo -e "${GREEN}✅ PASS: Balance unchanged ($BALANCE_BEFORE), error returned${NC}"
else
  echo -e "${RED}❌ FAIL: Balance changed or no error${NC}"
  echo "Before: $BALANCE_BEFORE, After: $BALANCE_AFTER"
  echo "Error: $ERROR"
fi

# ТЕСТ #6: Legacy endpoint
echo ""
echo "🧪 TEST #6: Legacy endpoint closed"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/placements/batch/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id":1,"site_ids":[1],"link_ids":[1]}')

if [ "$HTTP_CODE" == "410" ]; then
  echo -e "${GREEN}✅ PASS: Legacy endpoint returns 410 Gone${NC}"
else
  echo -e "${RED}❌ FAIL: Legacy endpoint returns $HTTP_CODE (expected 410)${NC}"
fi

echo ""
echo "🏁 Tests completed!"
```

Запустите:
```bash
chmod +x test_billing.sh
./test_billing.sh
```

---

## 📝 Отчет о тестировании

После прохождения всех тестов заполните:

```
=== ОТЧЕТ О ТЕСТИРОВАНИИ ===

Дата: _____________
Тестировщик: _____________
Окружение: Production / Staging / Local

РЕЗУЛЬТАТЫ:
[ ] ТЕСТ #1: Несуществующий contentId - PASS / FAIL
[ ] ТЕСТ #2: Чужой contentId - PASS / FAIL
[ ] ТЕСТ #3: WordPress недоступен - PASS / FAIL
[ ] ТЕСТ #4: Exhausted контент - PASS / FAIL
[ ] ТЕСТ #5: Удаление с refund - PASS / FAIL
[ ] ТЕСТ #6: Legacy эндпоинт - PASS / FAIL

КРИТИЧЕСКИЕ ПРОБЛЕМЫ:
1. ____________________
2. ____________________
3. ____________________

РЕКОМЕНДАЦИИ:
____________________
____________________
____________________

ГОТОВНОСТЬ К ПРОДАКШНУ: ДА / НЕТ
```

---

**ВАЖНО:** Если хотя бы один тест **FAILED** - НЕ РАЗВОРАЧИВАЙТЕ НА ПРОДАКШН!
