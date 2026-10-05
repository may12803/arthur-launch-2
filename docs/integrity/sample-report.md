# Data Integrity and Pricing Leakage Review: sample

> Sample output on a fully synthetic, fictional industrial-supplies distributor (seed 20261005, node scripts/gen-synthetic-pricing.mjs). No real customer, vendor or employer data.

As of 2026-09-30. Integrity score 74 out of 100: $223,029.95 of margin leakage traced to specific rows ($24,763.96 from prices below current cost; $198,265.99 from prices not updated after a cost increase), and 1,383 flagged items across 6 of 6 checks.

## What was scanned

400 customers, 1,500 products, 25,000 customer price records, 48,690 sales rows, 2,637 cost-change rows, 1,500 inventory rows.

## Scorecard

| Check | Flagged | Scanned | Severity | Dollar figure | Action |
| --- | --- | --- | --- | --- | --- |
| Prices below current cost | 60 price records | 25,000 | critical | $24,763.96 | reprice |
| Prices not updated after a cost increase | 301 price records | 25,000 | high | $198,265.99 | reprice |
| Duplicate customers (name and address variants) | 12 duplicate groups | 400 | medium | not quantified | merge |
| Inactive customers still holding price records | 800 price records | 25,000 | low | not quantified | review |
| Price records untouched and unsold for 36+ months | 150 price records | 24,200 | low | not quantified | archive |
| SKUs with no sales in 36 months and nothing on hand | 60 SKUs | 1,500 | low | not quantified | mark obsolete |

## Findings

### Prices not updated after a cost increase

Severity high. 301 price records flagged of 25,000 scanned. Recommended action: reprice. Margin loss: $198,265.99.

Formula: sum over flagged price records, over each sale on or after the date cost first rose 5% or more above the cost at the price date, of (cost on the sale date - cost at the price date) x qty.
Basis: margin that passing the cost increase through dollar for dollar would have kept; sales after the increase at the unchanged price.
Input rows: 301 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| id | customer_id | sku | price | cost_at_price_date | current_cost | cost_increase_pct | units_since_increase | exposure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P001008 | C0004 | JN-10300 | 200.27 | 148.35 | 166.15 | 12 | 128 | 2278.4 |
| P000816 | C0175 | PK-10410 | 192.4 | 142.52 | 159.62 | 12 | 123 | 2103.3 |
| P000854 | C0159 | JN-11420 | 199.07 | 147.46 | 165.16 | 12 | 114 | 2017.8 |
| P000856 | C0162 | JN-11420 | 199.07 | 147.46 | 165.16 | 12 | 106 | 1876.2 |
| P000871 | C0211 | JN-11420 | 199.07 | 147.46 | 165.16 | 12 | 105 | 1858.5 |
| P001023 | C0008 | JN-10300 | 200.27 | 148.35 | 166.15 | 12 | 104 | 1851.2 |
| P000801 | C0366 | PK-10410 | 192.4 | 142.52 | 159.62 | 12 | 95 | 1624.5 |
| P000809 | C0224 | PK-10410 | 192.4 | 142.52 | 159.62 | 12 | 94 | 1607.4 |
| P001001 | C0328 | JN-10300 | 200.27 | 148.35 | 166.15 | 12 | 89 | 1584.2 |
| P000810 | C0078 | PK-10410 | 192.4 | 142.52 | 159.62 | 12 | 92 | 1573.2 |

### Prices below current cost

Severity critical. 60 price records flagged of 25,000 scanned. Recommended action: reprice. Margin loss: $24,763.96.

Formula: sum over flagged price records of (current_cost - price) x units sold to that customer on that SKU in the trailing 12 months (2025-09-30, 2026-09-30].
Basis: 60 of 60 flagged records had sales in the window; records with no volume contribute 0.
Input rows: 60 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| id | customer_id | sku | price | current_cost | units_t12m | exposure |
| --- | --- | --- | --- | --- | --- | --- |
| P002695 | C0050 | PK-10386 | 90.56 | 105.02 | 102 | 1474.92 |
| P002735 | C0226 | AD-10030 | 128.3 | 147.03 | 66 | 1236.18 |
| P002680 | C0047 | PK-10730 | 128.82 | 143.83 | 76 | 1140.76 |
| P002703 | C0003 | LT-10071 | 82.12 | 92.19 | 97 | 976.79 |
| P002696 | C0300 | LT-11407 | 58.38 | 65.1 | 133 | 893.76 |
| P002710 | C0272 | JN-11108 | 84.98 | 98.43 | 63 | 847.35 |
| P002702 | C0158 | HT-10421 | 58.63 | 64.83 | 134 | 830.8 |
| P002728 | C0378 | AD-10294 | 74.17 | 82.99 | 89 | 784.98 |
| P002738 | C0106 | HT-10245 | 44.28 | 51.8 | 95 | 714.4 |
| P002690 | C0029 | LT-10623 | 65.78 | 72.36 | 105 | 690.9 |

### Inactive customers still holding price records

Severity low. 800 price records flagged of 25,000 scanned. Recommended action: review. No dollar figure (see basis below).

Formula: not quantified.
Basis: an inactive customer buys nothing, so a stale record has no revenue at stake; the risk is a wrong price being quoted if the customer returns.
Input rows: 800 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| id | customer_id | customer_name | sku | price | price_date |
| --- | --- | --- | --- | --- | --- |
| P000001 | C0119 | Quarry Mill Facilities LLC | SF-11163 | 115.46 | 2021-10-09 |
| P000002 | C0119 | Quarry Mill Facilities LLC | FA-10144 | 32.47 | 2022-03-11 |
| P000003 | C0119 | Quarry Mill Facilities LLC | HT-10997 | 161.09 | 2023-02-15 |
| P000004 | C0119 | Quarry Mill Facilities LLC | SF-10635 | 37.4 | 2021-07-10 |
| P000005 | C0119 | Quarry Mill Facilities LLC | SF-10067 | 247.71 | 2023-04-29 |
| P000006 | C0119 | Quarry Mill Facilities LLC | AB-10361 | 79.75 | 2022-05-12 |
| P000007 | C0119 | Quarry Mill Facilities LLC | SF-10155 | 85.23 | 2021-09-24 |
| P000008 | C0119 | Quarry Mill Facilities LLC | SF-11035 | 222.25 | 2022-06-13 |
| P000009 | C0119 | Quarry Mill Facilities LLC | FA-10992 | 11.14 | 2021-09-20 |
| P000010 | C0119 | Quarry Mill Facilities LLC | HT-10309 | 42.64 | 2023-06-14 |

### Price records untouched and unsold for 36+ months

Severity low. 150 price records flagged of 24,200 scanned. Recommended action: archive. No dollar figure (see basis below).

Formula: not quantified.
Basis: no sales in the window means no revenue at stake; the cost is clutter and the chance of quoting an outdated price.
Input rows: 150 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| id | customer_id | sku | price | price_date | last_sale_date |
| --- | --- | --- | --- | --- | --- |
| P002530 | C0145 | SF-10467 | 92.41 | 2021-12-31 | - |
| P002531 | C0106 | PK-11018 | 152.51 | 2022-05-21 | - |
| P002532 | C0021 | LT-10775 | 126.1 | 2021-03-10 | - |
| P002533 | C0344 | PK-10266 | 19.22 | 2022-02-05 | - |
| P002534 | C0141 | AD-11246 | 107.77 | 2022-08-28 | - |
| P002535 | C0120 | SF-10131 | 24.55 | 2021-07-11 | - |
| P002536 | C0080 | AD-10934 | 187.87 | 2022-02-11 | - |
| P002537 | C0183 | JN-10268 | 80.56 | 2022-02-16 | - |
| P002538 | C0236 | AD-10686 | 94.69 | 2022-07-15 | - |
| P002539 | C0215 | JN-11068 | 158.73 | 2023-05-23 | - |

### SKUs with no sales in 36 months and nothing on hand

Severity low. 60 SKUs flagged of 1,500 scanned. Recommended action: mark obsolete. No dollar figure (see basis below).

Formula: not quantified.
Basis: no sales and no stock means no revenue and no inventory value at stake; the cost is catalog clutter.
Input rows: 60 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| id | description | category | last_sale_date | on_hand |
| --- | --- | --- | --- | --- |
| HT-10013 | Utility Knife Compact | Hand Tools | - | 0 |
| SF-10019 | Ear Plug Pair Medium | Safety | - | 0 |
| PK-10026 | Corrugated Box Industrial | Packaging | - | 0 |
| AD-10046 | Threadlocker Large | Adhesives | - | 0 |
| HT-10061 | Claw Hammer Compact | Hand Tools | - | 0 |
| FA-10064 | Machine Screw Small | Fasteners | - | 0 |
| AB-10073 | Scouring Pad Heavy Duty | Abrasives | - | 0 |
| HT-10125 | Adjustable Wrench Compact | Hand Tools | - | 0 |
| FA-10152 | Lock Washer Small | Fasteners | - | 0 |
| PK-10170 | Poly Mailer Industrial | Packaging | - | 0 |

### Duplicate customers (name and address variants)

Severity medium. 12 duplicate groups flagged of 400 scanned. Recommended action: merge. No dollar figure (see basis below).

Formula: not quantified.
Basis: duplicates split price and sales history across records; the data holds no dollar basis for what that costs.
Input rows: 26 ids, all listed in findings.json under this rule.

Largest 10 (as of 2026-09-30):

| member_ids | member_names | member_addresses | price_records |
| --- | --- | --- | --- |
| C0002 / C0393 | Cinder Ridge Hardware LLC / CINDER RIDGE HARDWARE, INC | 137 Maple Avenue / 137 Maple Ave., Suite 2 | 126 |
| C0050 / C0397 / C0398 | Granite Hollow Provisions LLC / GRANITE HOLLOW PROVISIONS, INC / Granite Hollow Provisions Company | 113 Aspen Avenue / 113 Aspen Ave., Suite 2 / 113 ASPEN AVENUE | 188 |
| C0112 / C0395 | Redwood Mill Hardware Co. / REDWOOD MILL HARDWARE, INC | 607 Linden Street / 607 Linden St., Suite 2 | 165 |
| C0258 / C0390 | Pinecrest Works Maintenance Inc. / PINECREST WORKS MAINTENANCE, INC | 609 Foundry Road / 609 Foundry Rd., Suite 2 | 126 |
| C0322 / C0388 | Cinder Fields Hardware Co. / CINDER FIELDS HARDWARE, INC | 277 Vale Street / 277 Vale St., Suite 2 | 124 |
| C0387 / C0026 | SUMMIT LANE OUTFITTERS, INC / Summit Lane Outfitters LLC | 125 Cedar Ave., Suite 2 / 125 Cedar Avenue | 129 |
| C0389 / C0006 | SUMMIT RIDGE OUTFITTERS, INC / Summit Ridge Outfitters Inc. | 285 Prospect Rd., Suite 2 / 285 Prospect Road | 125 |
| C0391 / C0250 | GRANITE WORKS PROVISIONS, INC / Granite Works Provisions Co. | 313 Aspen St., Suite 2 / 313 Aspen Street | 139 |
| C0392 / C0284 | ALDER FORGE SERVICES, INC / Alder Forge Services LLC | 671 Canal Ave., Suite 2 / 671 Canal Avenue | 124 |
| C0394 / C0200 | STONEBRIDGE BLUFF PROVISIONS, INC / Stonebridge Bluff Provisions LLC | 263 Aspen Ave., Suite 2 / 263 Aspen Avenue | 143 |

## How the score is computed

Score = 100 minus the sum of one penalty per check. Penalty = weight x min(1, share / saturation), where share is flagged items divided by items scanned. A check that could not run adds no penalty.

| Check | Weight | Saturates at | Share found | Penalty | Why this weight |
| --- | --- | --- | --- | --- | --- |
| below_cost | 30 | 2% | 0.24% | 3.60 | sells at a loss today; 2% of price records below cost is already severe |
| cost_lag | 20 | 5% | 1.20% | 4.82 | margin eroded by cost increases never passed on; saturates at 5% of price records |
| duplicate_customer | 12 | 5% | 3.50% | 8.40 | surplus duplicate customer records over all customers; saturates at 5% |
| inactive_customer_prices | 13 | 10% | 3.20% | 4.16 | price records held by inactive customers; saturates at 10% |
| stale_price | 15 | 10% | 0.62% | 0.93 | price records untouched and unsold for 36+ months; saturates at 10% |
| dead_sku | 10 | 10% | 4.00% | 4.00 | SKUs with no sales in 36 months and nothing on hand; saturates at 10% |

Final score: 74.

## What this does not say

Dollar figures appear only where the files contain a basis for them: sales rows for volume and the cost history for cost. Stale prices, dead SKUs, duplicate customers and inactive-customer prices are shown as counts with no dollar figure because the data holds no dollar basis for them.
