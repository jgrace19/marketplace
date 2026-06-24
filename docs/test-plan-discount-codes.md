# Test Plan — Discount code on guest checkout

- **ADO work item:** #1 — Discount code on guest checkout
- **ADO test plan:** "Discount Codes - QA" (`Marketplace` project)
- **Feature under test:** `backend/discounts.py`, `POST /api/discount/validate`,
  `discount_code` in `POST /api/checkout/session`, cart discount UI.
- **Scope:** single code per order; discount applies to subtotal before tax/shipping.

## Test-data matrix

| # | Case | Code | Subtotal | Expected result |
|---|---|---|---|---|
| 1 | Valid percentage | `SAVE10` | $100.00 | Accepted; −$10.00 → $90.00 |
| 2 | Valid fixed, above min | `5OFF` | $50.00 | Accepted; −$5.00 → $45.00 |
| 3 | Fixed at exact min-spend boundary | `5OFF` | $20.00 | Accepted; −$5.00 → $15.00 |
| 4 | Below min spend | `5OFF` | $10.00 | Rejected; "minimum spend $20.00" |
| 5 | High min spend met | `BIGSPEND` | $100.00 | Accepted; −$15.00 → $85.00 |
| 6 | High min spend not met | `BIGSPEND` | $50.00 | Rejected; "minimum spend $100.00" |
| 7 | 100% off → zero total | `WELCOME100` | $49.99 | Accepted; −$49.99 → $0.00 |
| 8 | Fixed larger than cart (floor at $0) | fixed > subtotal | $5.00 | Accepted; total floors at $0.00 |
| 9 | Currency rounding | `SAVE10` | $33.33 | Accepted; −$3.33 → $30.00 |
| 10 | Expired code | `EXPIRED20` | $100.00 | Rejected; "expired" |
| 11 | Expiry boundary (last valid day) | `EXPIRED20` | $100.00 | Accepted on expiry date; rejected the next day |
| 12 | Already-used single-use | `USEDONCE` | $100.00 | Rejected; "already been used" |
| 13 | Inactive/disabled code | `DISABLED` | $100.00 | Rejected; "not a valid code" |
| 14 | Unknown code | `NOPE` | $100.00 | Rejected; "not a valid code" |
| 15 | Empty code | (blank) | $100.00 | Rejected; "Enter a discount code" |
| 16 | Zero-total cart | `SAVE10` | $0.00 | Rejected; "Add items to your cart" |
| 17 | Case / whitespace tolerant | `  save10  ` | $100.00 | Accepted; −$10.00 → $90.00 |

## Coverage mapping

| Matrix rows | Layer | Location |
|---|---|---|
| 1–17 | Unit (Pytest) | `backend/tests/test_discounts.py` |
| 1, 7, 10, 14 | Integration (Gherkin/Rest Assured) | `tests/integration/features/discount.feature` |
| 1, 7, 10, 14 | E2E (Playwright) | `tests/e2e/discount-codes.spec.ts` |
| Hot-path load | Performance (k6) | `tests/perf/checkout-discount-load.js` |

## Known gaps / out of scope

- Stacking multiple codes (separate work item; currently single code per order).
- Tax/shipping interaction with discounts (tracked under ADO #2).
