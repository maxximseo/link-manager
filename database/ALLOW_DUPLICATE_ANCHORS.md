# Разрешение Дубликатов Анкоров

## Изменения

Система теперь **разрешает** добавлять несколько ссылок с одинаковым анкором (например, "купить айфон").

### Что Изменилось:

✅ **Можно добавлять дубликаты анкоров** - несколько ссылок с одинаковым текстом
✅ **Каждая ссылка уникальна** - имеет свой ID в базе
✅ **Однократное использование** - каждую ссылку можно разместить только 1 раз (usage_limit = 1)

### До Изменений:
```
Проект "Айфоны":
  ❌ купить айфон -> https://site1.com
  ❌ купить айфон -> https://site2.com  (ОШИБКА: дубликат)
```

### После Изменений:
```
Проект "Айфоны":
  ✅ купить айфон -> https://site1.com (ID: 1, можно использовать 1 раз)
  ✅ купить айфон -> https://site2.com (ID: 2, можно использовать 1 раз)
  ✅ купить айфон -> https://site3.com (ID: 3, можно использовать 1 раз)
```

## Миграция База Данных

Для применения изменений выполните миграцию:

```bash
node database/run_remove_anchor_unique.js
```

### Что Делает Миграция:

1. **Удаляет UNIQUE constraint** на `(project_id, anchor_text)`
2. **Создает обычный индекс** для производительности (без UNIQUE)
3. Позволяет добавлять ссылки с одинаковыми анкорами

### Результат:

```
✅ Migration completed successfully!

Changes:
  - Removed UNIQUE constraint on (project_id, anchor_text)
  - Created performance index (non-unique)
  - You can now add multiple links with the same anchor text
  - Each link has unique ID and usage_limit = 1
```

## Файлы Миграции

- **SQL**: `database/migrate_remove_anchor_unique.sql`
- **Runner**: `database/run_remove_anchor_unique.js`

## Измененные Файлы

### Backend:
1. **database/migrate_remove_anchor_unique.sql** - SQL миграция
2. **database/run_remove_anchor_unique.js** - Runner для миграции
3. **backend/services/project.service.js**:
   - Удалена проверка дубликатов в `addProjectLink()` (строки 209-218)
   - Удалена проверка дубликатов в `addProjectLinksBulk()` (строки 290-361)
4. **backend/controllers/project.controller.js**:
   - Убрана информация о дубликатах из ответа API (строки 277-298)

### Frontend:
5. **backend/build/project-detail.html**:
   - Удалена валидация дубликатов при импорте (строки 618-633)
   - Убрано отображение дубликатов в результатах (строки 783-809)

## Использование

### Импорт Ссылок с Дубликатами:

Теперь можно импортировать:
```html
<a href="https://site1.com">купить айфон</a>
<a href="https://site2.com">купить айфон</a>
<a href="https://site3.com">купить айфон</a>
```

Все 3 ссылки будут добавлены успешно! Каждая получит уникальный ID и её можно будет использовать 1 раз для размещения.

### API Ответ:

```json
{
  "message": "Successfully imported 3 of 3 links",
  "links": [...],
  "summary": {
    "total": 3,
    "imported": 3,
    "invalidUrls": 0,
    "skipped": 0
  }
}
```

## Откат Изменений

Если нужно вернуть проверку дубликатов:

```sql
-- Создать обратно UNIQUE constraint
CREATE UNIQUE INDEX idx_project_links_project_anchor_unique
ON project_links (project_id, LOWER(anchor_text));
```

**Внимание**: Перед откатом убедитесь, что в базе нет реальных дубликатов анкоров!

## Дата Изменений

2025-01-15
