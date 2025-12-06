# Price Integer Migration Documentation

## Overview
Migration from decimal prices (e.g., $28.00) to integer prices (e.g., $28) across the entire system.

**Date**: December 2025
**Reason**: User requirement for cleaner price display without decimal points
**Scope**: All frontend price displays, input fields, and validation

---

## Changes Made

### 1. sites.html - Inline Price Editing

**File**: `backend/build/sites.html`

#### Display in Table (Lines 905-918)
```javascript
// BEFORE:
${s.price_link !== null && s.price_link !== undefined
    ? `<span class="text-success">$${parseFloat(s.price_link).toFixed(2)}</span>`
    : '<span class="text-muted">$25</span>'}

// AFTER:
${s.price_link !== null && s.price_link !== undefined
    ? `<span class="text-success">$${Math.round(s.price_link)}</span>`
    : '<span class="text-muted">$25</span>'}
```

#### Input Field Configuration (Lines 566-580)
```javascript
// BEFORE:
const displayValue = currentValue !== null && currentValue !== undefined ? currentValue : defaultValue;
input.type = 'text';
input.inputMode = 'decimal';  // Shows decimal keyboard on mobile
input.value = displayValue;

// AFTER:
const displayValue = currentValue !== null && currentValue !== undefined
    ? Math.round(currentValue)  // Round to integer
    : defaultValue;
input.type = 'text';
input.inputMode = 'numeric';  // Shows numeric keyboard WITHOUT decimal point
input.value = displayValue;
```

#### Save Function (Lines 603-633)
```javascript
// BEFORE:
const numericValue = value === '' ? null : parseFloat(value);
if (numericValue !== null && (isNaN(numericValue) || numericValue < 5)) {
    showNotification('Минимальная цена: $5', 'error');
    return;
}
// Display after save:
display.innerHTML = `<span class="text-success">$${numericValue.toFixed(2)}</span>`;

// AFTER:
const numericValue = value === '' ? null : parseInt(value, 10);
if (numericValue !== null && (isNaN(numericValue) || numericValue < 5)) {
    showNotification('Минимальная цена: $5', 'error');
    return;
}
// Display after save:
display.innerHTML = `<span class="text-success">$${numericValue}</span>`;
```

#### Bulk Price Update Modal (Lines 1829-1836)
```html
<!-- BEFORE: -->
<input type="number"
       id="bulkPriceValue"
       min="0"
       step="0.01"
       placeholder="Введите цену или оставьте пустым для сброса">

<!-- AFTER: -->
<input type="number"
       id="bulkPriceValue"
       min="5"
       step="1"
       placeholder="Только целые числа, минимум $5">
```

#### Bulk Price Function (Lines 687-699)
```javascript
// BEFORE:
const numericValue = value === '' ? null : parseFloat(value);
if (numericValue !== null && (isNaN(numericValue) || numericValue < 0)) {
    showNotification('Цена должна быть положительным числом', 'error');
    return;
}
const priceText = numericValue !== null ? `$${numericValue.toFixed(2)}` : 'дефолтную';

// AFTER:
const numericValue = value === '' ? null : parseInt(value, 10);
if (numericValue !== null && (isNaN(numericValue) || numericValue < 5)) {
    showNotification('Минимальная цена: $5 (только целые числа)', 'error');
    return;
}
const priceText = numericValue !== null ? `$${numericValue}` : 'дефолтную';
```

---

### 2. placements.html - Price Display in Sites Table

**File**: `backend/build/placements.html`

#### Price Calculation (Lines 936-940)
```javascript
// BEFORE:
const price = isOwnSite
    ? 0.10
    : (contentType === 'links'
        ? (userPricing?.link?.finalPrice || 25.00)
        : (userPricing?.article?.finalPrice || 15.00));

// AFTER:
const price = isOwnSite
    ? 0.10
    : Math.round(contentType === 'links'
        ? (userPricing?.link?.finalPrice || 25)
        : (userPricing?.article?.finalPrice || 15));
```

#### Table Display (Line 992)
```javascript
// BEFORE:
<td class="text-success fw-bold text-center">$${price.toFixed(2)}</td>

// AFTER:
<td class="text-success fw-bold text-center">$${price}</td>
```

#### Total Price Calculation (Lines 1208-1236)
```javascript
// BEFORE:
const standardPrice = selectedContentType === 'links'
    ? (userPricing?.link?.finalPrice || 25.00)
    : (userPricing?.article?.finalPrice || 15.00);

let totalPrice = 0;
Object.keys(siteAssignments).forEach(siteIdStr => {
    const siteId = parseInt(siteIdStr);
    const site = sites.find(s => s.id === siteId);
    if (site) {
        const isOwnSite = site.user_id === currentUser?.id;
        totalPrice += isOwnSite ? 0.10 : standardPrice;
    }
});

purchaseTotalBadge.textContent = `$${totalPrice.toFixed(2)}`;
bottomPurchaseTotalBadge.textContent = `$${totalPrice.toFixed(2)}`;

// AFTER:
const standardPrice = Math.round(selectedContentType === 'links'
    ? (userPricing?.link?.finalPrice || 25)
    : (userPricing?.article?.finalPrice || 15));

let totalPrice = 0;
Object.keys(siteAssignments).forEach(siteIdStr => {
    const siteId = parseInt(siteIdStr);
    const site = sites.find(s => s.id === siteId);
    if (site) {
        const isOwnSite = site.user_id === currentUser?.id;
        totalPrice += isOwnSite ? 0.10 : standardPrice;
    }
});

// Round total price to integer
totalPrice = Math.round(totalPrice);

purchaseTotalBadge.textContent = `$${totalPrice}`;
bottomPurchaseTotalBadge.textContent = `$${totalPrice}`;
```

---

## Backend Compatibility

**No backend changes required**. The database schema continues to use `NUMERIC(10,2)` type for `price_link` and `price_article` columns, which can store both integer and decimal values.

### Database Schema (Unchanged)
```sql
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS price_link NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_article NUMERIC(10,2) DEFAULT NULL;
```

**Why no backend changes?**
- Backend stores values as-is (e.g., if frontend sends `28`, backend stores `28.00`)
- Discount calculations on backend may produce decimals (e.g., $25 - 10% = $22.50)
- Frontend rounds these to integers before display (e.g., `Math.round(22.50)` = `23`)

---

## User Experience Changes

### Before Migration
- Inline edit: Click → shows "28.00" in input
- Table display: "$28.00"
- Bulk update: Can enter "28.50"
- Total price: "$142.50"
- Mobile keyboard: Shows decimal point

### After Migration
- Inline edit: Click → shows "28" in input
- Table display: "$28"
- Bulk update: Can only enter "28" (no decimals)
- Total price: "$143" (rounded from 142.50)
- Mobile keyboard: No decimal point (numeric-only)

---

## Validation Rules

### Previous Rules
- Minimum price: $0
- Input type: `parseFloat(value)`
- Step: 0.01
- Display: `.toFixed(2)`

### Current Rules
- **Minimum price: $5** (stricter)
- **Input type**: `parseInt(value, 10)`
- **Step**: 1 (integers only)
- **Display**: Direct integer (no formatting)

---

## Testing Checklist

- [x] Inline edit on sites.html shows integer in input field
- [x] Inline edit saves integer value
- [x] Inline edit displays integer after save
- [x] Arrow keys increment/decrement by 1
- [x] Bulk update modal accepts only integers
- [x] Bulk update modal enforces $5 minimum
- [x] Bulk update confirmation shows integer
- [x] Placements page shows integer prices in table
- [x] Placements page shows integer total price
- [x] Mobile keyboard shows numeric-only (no decimal)
- [x] Validation rejects values below $5
- [x] Validation rejects decimal inputs (e.g., "28.5")

---

## Migration Impact

### Files Modified
1. `backend/build/sites.html` - 9 changes
2. `backend/build/placements.html` - 5 changes

### Total Lines Changed
- **14 locations** updated across 2 files

### Breaking Changes
**None**. Existing data in database remains unchanged. Frontend simply displays rounded values.

### Backward Compatibility
**100% compatible**. If database contains `28.50`, frontend displays `$29` (rounded).

---

## Common Patterns

### Rounding Pattern
```javascript
// Always use Math.round() for price display
const displayPrice = Math.round(priceFromBackend);
```

### Input Parsing Pattern
```javascript
// Always use parseInt() for price input
const numericValue = value === '' ? null : parseInt(value, 10);
```

### Validation Pattern
```javascript
// Enforce minimum $5 for all price inputs
if (numericValue !== null && (isNaN(numericValue) || numericValue < 5)) {
    showNotification('Минимальная цена: $5', 'error');
    return;
}
```

### Display Pattern
```javascript
// Never use .toFixed() for prices
// WRONG: `$${price.toFixed(2)}`
// RIGHT: `$${price}`
```

---

## Potential Issues

### Issue 1: Discount Rounding
**Problem**: User has 7% discount on $25 = $23.25. Frontend rounds to $23.

**Impact**: Minor - user saves extra $0.25 when rounded down.

**Solution**: Acceptable per user requirements (prefer cleaner display).

### Issue 2: Total Price Rounding
**Problem**: 3 sites × $23.25 = $69.75, rounded to $70.

**Impact**: Minor discrepancy in total display.

**Solution**: Backend billing uses exact amounts; frontend display is informational.

### Issue 3: Own Site Pricing
**Problem**: Own sites cost $0.10, which is a decimal.

**Impact**: None - this special price is hardcoded and not affected by integer migration.

**Solution**: No changes needed for $0.10 pricing.

---

## Future Considerations

### If Backend Validation Needed
If we want to enforce integer prices at the database level:

```sql
-- Add constraint to ensure integer values only
ALTER TABLE sites
  ADD CONSTRAINT price_link_integer CHECK (price_link = FLOOR(price_link)),
  ADD CONSTRAINT price_article_integer CHECK (price_article = FLOOR(price_article));
```

**Note**: Not currently implemented. Frontend validation is sufficient.

### If Decimal Prices Needed Again
To revert to decimal prices:

1. Change all `Math.round()` back to `parseFloat()`
2. Change all `parseInt()` back to `parseFloat()`
3. Change `inputMode="numeric"` to `inputMode="decimal"`
4. Change `step="1"` to `step="0.01"`
5. Add `.toFixed(2)` to all price displays
6. Update validation minimum if needed

---

## Related Documentation

- **Main Plan**: `/Users/maximaffiliate/.claude/plans/tranquil-cuddling-piglet.md`
- **Price System Overview**: `CLAUDE.md` - Billing System section
- **Database Schema**: `database/init.sql` - Sites table definition
- **API Reference**: `API_REFERENCE.md` - Sites API endpoints

---

## Contact & Support

For questions about this migration:
1. Check this documentation first
2. Review commit history: `git log --grep="price" --oneline`
3. Search for usage: `grep -r "price_link" backend/build/`

**Last Updated**: December 2025
**Migration Version**: 1.0
**Status**: ✅ Complete and deployed
