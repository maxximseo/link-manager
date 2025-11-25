# Code Optimization Principles & Extended Thinking Framework

## Overview

This document establishes optimization principles based on successful patterns from our codebase. These principles leverage extended thinking methodologies to ensure thorough analysis before implementation.

## Core Philosophy

> "The best code is no code. The second best code is code that already exists and works."

### The LEVER Framework

**L**everage existing patterns
**E**xtend before creating
**V**erify through reactivity
**E**liminate duplication
**R**educe complexity

## 🧠 Extended Thinking Process

Always follow this decision tree:

```
New Feature Request
    ↓
Can existing code handle it?
    ├─ Yes → Extend existing code
    └─ No → Can we modify existing patterns?
              ├─ Yes → Adapt and extend
              └─ No → Is the new code reusable?
                        ├─ Yes → Create abstraction
                        └─ No → Reconsider approach
```

## 📋 Pre-Implementation Checklist

Before writing any code, complete this extended thinking exercise:

### 1. Pattern Recognition Phase (10-15 minutes)

```markdown
## Existing Pattern Analysis

- [ ] What similar functionality already exists?
- [ ] Which queries/mutations handle related data?
- [ ] What UI components display similar information?
- [ ] Which hooks manage related state?

## Code Reuse Opportunities

- [ ] Can I extend an existing table instead of creating a new one?
- [ ] Can I add fields to an existing query return?
- [ ] Can I enhance an existing hook with new computed properties?
- [ ] Can I modify an existing component with conditional rendering?
```

### 2. Complexity Assessment (5-10 minutes)

```markdown
## Proposed Solution Complexity

- Lines of new code: ___
- New files created: ___
- New database tables: ___
- New API endpoints: ___

## Optimized Alternative

- Lines extending existing code: ___
- Files modified: ___
- Fields added to existing tables: ___
- Existing endpoints enhanced: ___

If optimized < 50% of proposed, proceed with optimization.
```

## 📊 Decision Framework

### When to Extend vs Create New

Use this scoring system:

| Criteria | Extend Existing | Create New |
|----------|----------------|------------|
| Similar data structure exists | +3 points | -3 points |
| Can reuse existing indexes | +2 points | -2 points |
| Existing queries return related data | +3 points | -3 points |
| UI components show similar info | +2 points | -2 points |
| Would require <50 lines to extend | +3 points | -3 points |
| Would introduce circular dependencies | -5 points | +5 points |
| Significantly different domain | -3 points | +3 points |

**Score > 5**: Extend existing code
**Score < -5**: Create new implementation
**Score -5 to 5**: Deeper analysis required

## 🛠️ Implementation Strategies

### 1. The Three-Pass Approach

**Pass 1: Discovery (No Code)**
- Find all related existing code
- Document current patterns
- Identify extension points

**Pass 2: Design (Minimal Code)**
- Write interface changes only
- Update type definitions
- Plan data flow

**Pass 3: Implementation (Optimized Code)**
- Implement with maximum reuse
- Add only essential new logic
- Document why choices were made

### 2. Code Reuse Patterns

#### Pattern: Feature Flags in Existing Components

```javascript
// Instead of new component
function SiteStatus({ site }) {
  return (
    <>
      {/* Existing UI */}
      <SiteName>{site.name}</SiteName>

      {/* Conditionally show new features */}
      {site.ref_domains > 0 && (
        <RefDomainsBadge count={site.ref_domains} />
      )}
    </>
  );
}
```

#### Pattern: Extending Database Tables

```sql
-- ❌ Creating new table for related data
CREATE TABLE site_metrics (
  site_id INTEGER REFERENCES sites(id),
  ref_domains INTEGER,
  rd_main INTEGER,
  norm INTEGER
);

-- ✅ Adding columns to existing table
ALTER TABLE sites
  ADD COLUMN ref_domains INTEGER DEFAULT 0,
  ADD COLUMN rd_main INTEGER DEFAULT 0,
  ADD COLUMN norm INTEGER DEFAULT 0;
```

## ⚡ Performance Optimization Rules

### 1. Query Efficiency

```javascript
// ❌ Multiple queries
const site = await getSite(id);
const metrics = await getSiteMetrics(id);
const placements = await getSitePlacements(id);

// ✅ Single query returning all data
const siteWithDetails = await getSiteWithDetails(id);
// Returns site + metrics + placements in one call
```

### 2. Batch Operations

```javascript
// ❌ Sequential operations
for (const update of updates) {
  await updateSite(update.domain, update.value);
}

// ✅ Batch when possible
await bulkUpdateSiteParams(parameter, updates);
```

### 3. Whitelist Pattern for Dynamic Columns

```javascript
// ✅ Safe dynamic column selection
const allowedParams = ['dr', 'da', 'ref_domains', 'rd_main', 'norm'];

if (!allowedParams.includes(parameter)) {
  throw new Error(`Parameter '${parameter}' is not allowed`);
}

// Now safe to use in query
await query(`UPDATE sites SET ${parameter} = $1 WHERE id = $2`, [value, id]);
```

## 🚫 Anti-Patterns to Avoid

### 1. The "Similar But Different" Excuse

Before creating `getSiteMetrics` when `getSite` exists:
- Can getSite return metric fields?
- Can we add columns to sites table?
- Can computed properties derive what we need?

### 2. The "UI Drives Database" Mistake

Never create database structure to match UI components. Instead:
- Store data in its most logical form
- Use queries to transform for UI
- Let components compute display values

### 3. Over-Validation

```javascript
// ❌ Over-restrictive validation
body('value').isInt({ min: 0, max: 100 })  // DR/DA only!

// ✅ Context-aware validation
if (parameter === 'dr' || parameter === 'da') {
  // Validate 0-100 for ratings
} else {
  // No max limit for counts (ref_domains, etc.)
}
```

## 🎯 Success Metrics

Track optimization success:

| Metric | Target |
|--------|--------|
| Code reduction vs initial approach | >50% |
| Reused existing patterns | >70% |
| New files created | <3 per feature |
| New database tables | 0 (extend existing) |
| Query complexity | No new indexes |
| Implementation time | <50% of estimate |

## 🔍 Review Checklist

Before submitting optimized code:

- [ ] Extended existing tables instead of creating new ones
- [ ] Reused existing queries with additions
- [ ] Leveraged existing hooks and components
- [ ] No duplicate state management logic
- [ ] Documented why extensions were chosen
- [ ] Maintained backward compatibility
- [ ] Added fields are optional (with defaults)
- [ ] No circular dependencies introduced
- [ ] Performance same or better
- [ ] Code reduction >50%

## 📚 Project-Specific Patterns

### Adding New Site Parameters

1. **Database**: Add column to `sites` table with DEFAULT value
2. **Service**: Add to SELECT queries and whitelist
3. **Controller**: Update validation (if needed)
4. **Frontend**: Add to table headers and rendering
5. **Export**: Add to all export formats

### Bulk Update Pattern

1. Parse input (domain + value pairs)
2. Validate parameter against whitelist
3. Apply context-aware validation (0-100 for ratings, unlimited for counts)
4. Update via parameterized query
5. Return detailed results (updated/not_found/errors)

---

## Related Documentation

- [ADR.md](ADR.md) - Architectural Decision Records
- [CLAUDE.md](CLAUDE.md) - Development guide
- [DECISIONS.md](DECISIONS.md) - Quick technical decisions

---

_Remember: Every line of code is a liability. The best feature is one that requires no new code, just better use of what exists._
