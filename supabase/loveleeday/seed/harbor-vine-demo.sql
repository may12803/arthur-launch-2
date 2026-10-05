-- Harbor & Vine demo tenant seed (second route audit, major 1: 0 workstreams, 0 tasks, 0 deliverables, empty coverage map).
-- Harbor & Vine is a DEMO multi-location specialty food and wine retailer with a wholesale distribution arm. Every figure below is
-- invented for the demo; the Square and Shopify rows say so in their note, and nothing here claims a real customer system.
--
-- Scope and safety
--   * Touches ONLY the tenant whose slug is 'harbor-vine-demo'. If that tenant does not exist the script is a no-op (a notice is raised).
--     No row of any other tenant, including Dabney, is read for writing or written.
--   * Idempotent: fixed UUIDs, ON CONFLICT (id) DO UPDATE / DO NOTHING. Applying it twice leaves identical row counts.
--   * Base-schema part (workstreams, tasks, grades, deliverables, coverage, contracts, one requested connection) applies on any database
--     that has 20261005_00. The connector-platform part (entities, approvals, Square and Shopify connections, sync runs, ingested
--     records) runs only where 20261005_10 is applied (to_regclass checks), so it is safe to run on the live project before and after.
--   * Honest connection health: no connection is written as 'live'. A connection is inserted as 'connected', its sync_runs and
--     ingested_records are inserted in this same script, and private.refresh_connection_health() derives the status from them, which
--     is the only path that can reach 'live' (and the one that downgrades a failing run to 'error').
--   * Nothing approved is left claimable: approvals are pending, rejected or expired, so the engine can never execute one from the demo.
--
-- Run (as the postgres role, e.g. the Supabase SQL editor): this file, then nothing else. Rollback: supabase/loveleeday/seed/harbor-vine-qa-cleanup.sql
-- does NOT remove this seed; delete by id range is documented at the bottom.

do $seed$
declare
  v_t uuid; v_owner uuid;
  ws_fin  constant uuid := '7a2b0001-0000-4000-8000-000000000001';
  ws_inv  constant uuid := '7a2b0001-0000-4000-8000-000000000002';
  ws_rec  constant uuid := '7a2b0001-0000-4000-8000-000000000003';
  ws_ret  constant uuid := '7a2b0001-0000-4000-8000-000000000004';
begin
  select id into v_t from public.tenants where slug = 'harbor-vine-demo';
  if v_t is null then raise notice 'harbor-vine-demo seed: tenant not found, nothing to do'; return; end if;
  select user_id into v_owner from public.memberships where tenant_id = v_t and role = 'owner' and accepted_at is not null order by created_at limit 1;

  -- ── workstreams ──────────────────────────────────────────────────────────
  insert into public.workstreams (id, tenant_id, key, name, summary, grade_start, grade_now, grade_target, review_slug, sort) values
    (ws_fin, v_t, 'finance-close', 'Month-end close', 'Three stores and a warehouse closing on three different calendars. One close, five business days, tills reconciled to deposits.', 'C-', 'C+', 'A-', 'hv-close-playbook', 1),
    (ws_inv, v_t, 'inventory-margin', 'Inventory and margin', 'Where gross margin leaks between the shelf price, the case cost and what the warehouse actually holds.', 'D+', 'C', 'B+', 'hv-margin-review', 2),
    (ws_rec, v_t, 'wholesale-receivables', 'Wholesale receivables', 'Restaurant and retailer accounts paying late, with terms that are not on the invoice and no statement cycle.', 'C', 'B-', 'A-', 'hv-wholesale-aging', 3),
    (ws_ret, v_t, 'customer-retention', 'Customer retention', 'Wine-club and repeat shoppers are not identifiable across the three tills, so no one is winning back the lapsed.', 'D', 'C-', 'B', null, 4)
  on conflict (id) do update set name = excluded.name, summary = excluded.summary, grade_start = excluded.grade_start, grade_now = excluded.grade_now,
    grade_target = excluded.grade_target, review_slug = excluded.review_slug, sort = excluded.sort, updated_at = now();

  insert into public.workstream_grades (id, tenant_id, workstream_id, dimension, grade_start, grade_now, grade_target, sort) values
    ('7a2b0003-0000-4000-8000-000000000001', v_t, ws_fin, 'Speed of close', 'D', 'C', 'A-', 1),
    ('7a2b0003-0000-4000-8000-000000000002', v_t, ws_fin, 'Accuracy of cash', 'C', 'B', 'A', 2),
    ('7a2b0003-0000-4000-8000-000000000003', v_t, ws_inv, 'Margin visibility', 'D', 'C', 'B+', 1),
    ('7a2b0003-0000-4000-8000-000000000004', v_t, ws_inv, 'Stock accuracy', 'D+', 'C-', 'B', 2),
    ('7a2b0003-0000-4000-8000-000000000005', v_t, ws_inv, 'Pricing discipline', 'C-', 'C', 'B+', 3),
    ('7a2b0003-0000-4000-8000-000000000006', v_t, ws_rec, 'Collection speed', 'C', 'B-', 'A-', 1),
    ('7a2b0003-0000-4000-8000-000000000007', v_t, ws_rec, 'Terms clarity', 'D+', 'C+', 'A', 2),
    ('7a2b0003-0000-4000-8000-000000000008', v_t, ws_ret, 'Customer identity across stores', 'D-', 'D+', 'B', 1),
    ('7a2b0003-0000-4000-8000-000000000009', v_t, ws_ret, 'Win-back', 'D', 'C-', 'B', 2)
  on conflict (id) do update set dimension = excluded.dimension, grade_start = excluded.grade_start, grade_now = excluded.grade_now, grade_target = excluded.grade_target, sort = excluded.sort;

  -- ── tasks. evidence = {columns, rows, note} (what the task page renders) plus lineage: source_system, source_ref, observed_at, proof ──
  insert into public.workstream_tasks (id, tenant_id, workstream_id, title, detail, recommendation, status, kind, evidence, outcome, was, proof, rank, done_at, internal) values
    ('7a2b0002-0000-4000-8000-000000000001', v_t, ws_fin, 'Reconcile the three store tills to Square deposits',
      'Each store closed its till against its own spreadsheet. We matched every daily deposit to the Square payout it came from.',
      null, 'done', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Store', 'Till total', 'Square deposit', 'Gap'),
        'rows', jsonb_build_array(jsonb_build_array('Lakeside Market', '$4,212', '$4,212', '$0'), jsonb_build_array('Old Town Cellar', '$3,870', '$3,846', '$24'), jsonb_build_array('Riverside Shop', '$2,955', '$2,955', '$0')),
        'note', 'Source: Square daily sales, refs sq-daily-lakeside-d2, sq-daily-oldtown-d2, sq-daily-riverside-d2. Demo figures.',
        'source_system', 'square', 'source_ref', 'sq-daily-oldtown-d2', 'observed_at', to_char(now() - interval '30 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Old Town gap of $24 traced to one voided refund posted the next morning; the other two stores matched to the cent.'),
      'All three tills now reconcile to Square deposits each morning; the one gap found was a late-posted refund.', 'Tills closed against three separate spreadsheets, no match to deposits.',
      'Deposit-to-till match, 3 of 3 stores, last 7 days (Square payout report).', 1, now() - interval '3 days', false),
    ('7a2b0002-0000-4000-8000-000000000002', v_t, ws_fin, 'Move sales-tax accrual to a monthly entry',
      'Sales tax was recorded when the state return was filed, so every month looked more profitable than it was until filing day.',
      'Accrue it on the last day of each month from Square tax totals.', 'in_progress', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Month', 'Tax collected', 'Booked when filed', 'Understated by'),
        'rows', jsonb_build_array(jsonb_build_array('Month 1', '$6,140', '$0', '$6,140'), jsonb_build_array('Month 2', '$6,502', '$6,140', '$362')),
        'note', 'Source: Square tax totals. Demo figures.', 'source_system', 'square', 'source_ref', 'sq-daily-lakeside-d1', 'observed_at', to_char(now() - interval '6 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Accrual entry drafted for the open month; not yet posted.'),
      null, null, null, 2, null, false),
    ('7a2b0002-0000-4000-8000-000000000003', v_t, ws_fin, 'Approve a five-business-day close calendar',
      'Today the stores close on days 4, 9 and 12. A single calendar lets the owners see one set of numbers by the fifth business day.',
      'Approve the calendar below; the warehouse closes on day 3 and each store on day 4.', 'needs_you', 'decide',
      jsonb_build_object('columns', jsonb_build_array('Unit', 'Closes today', 'Proposed'), 'rows', jsonb_build_array(jsonb_build_array('Warehouse', 'Day 12', 'Day 3'), jsonb_build_array('Lakeside Market', 'Day 4', 'Day 4'), jsonb_build_array('Old Town Cellar', 'Day 9', 'Day 4'), jsonb_build_array('Riverside Shop', 'Day 12', 'Day 4')),
        'note', 'Source: close dates read from the last three months of entries.', 'source_system', 'ledger', 'source_ref', 'close-dates-3mo', 'observed_at', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Close dates counted from posted entries, not from what each store reported.'),
      null, null, null, 3, null, false),

    ('7a2b0002-0000-4000-8000-000000000004', v_t, ws_inv, 'Flag cases priced under 28 percent gross margin',
      'We joined each case cost to the shelf price in Square and listed every item below the 28 percent floor the owners set.',
      null, 'done', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Item', 'Case cost', 'Shelf price per bottle', 'Margin'), 'rows', jsonb_build_array(jsonb_build_array('Estate olive oil 500 ml', '$148.00', '$15.99', '22%'), jsonb_build_array('Coastal rosé', '$156.00', '$17.50', '26%'), jsonb_build_array('Aged balsamic 250 ml', '$132.00', '$19.00', '27%')),
        'note', 'Source: Square item prices joined to supplier case costs. Demo figures.', 'source_system', 'square', 'source_ref', 'sq-daily-lakeside-d2', 'observed_at', to_char(now() - interval '30 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', '14 of 212 active wine and pantry items sit under the floor; the three biggest by sales are shown.'),
      '14 items identified below the margin floor, ranked by annual sales.', 'No one could say which items fell below the floor.', 'Item list with case cost, price and margin (Square price export).', 1, now() - interval '5 days', false),
    ('7a2b0002-0000-4000-8000-000000000005', v_t, ws_inv, 'Reprice the 14 items below the margin floor',
      'Moving each item to the 28 percent floor adds roughly $9,800 a year at current volumes (demo estimate).',
      'Approve the price changes; most are a 50 cent to $2 move per bottle.', 'needs_you', 'decide',
      jsonb_build_object('columns', jsonb_build_array('Item', 'Now', 'Proposed', 'Annual effect'), 'rows', jsonb_build_array(jsonb_build_array('Estate olive oil 500 ml', '$15.99', '$18.49', '+$2,310'), jsonb_build_array('Coastal rosé', '$17.50', '$18.75', '+$1,640'), jsonb_build_array('Aged balsamic 250 ml', '$19.00', '$19.99', '+$610')),
        'note', 'Source: Square sales for the last 90 days, annualized. Demo figures.', 'source_system', 'square', 'source_ref', 'sq-daily-riverside-d1', 'observed_at', to_char(now() - interval '6 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Annual effect = 90-day units sold x 4 x price change; the price change itself waits for your approval.'),
      null, null, null, 2, null, false),
    ('7a2b0002-0000-4000-8000-000000000006', v_t, ws_inv, 'Count the warehouse against the system on-hand',
      'The warehouse system shows 3,410 cases on hand. A physical count of the fast movers is the only way to know how far off that is.',
      null, 'in_progress', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Zone', 'System cases', 'Counted so far', 'Difference'), 'rows', jsonb_build_array(jsonb_build_array('Wine, ambient', '1,820', '1,790', '-30'), jsonb_build_array('Pantry', '1,120', '1,120', '0'), jsonb_build_array('Cold room', '470', 'not counted', '-')),
        'note', 'Counts entered by warehouse staff; system figures from the warehouse export. Demo figures.', 'source_system', 'warehouse_export', 'source_ref', 'wh-onhand-snapshot-1', 'observed_at', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Two of three zones counted; the cold room is scheduled.'),
      null, null, null, 3, null, false),
    ('7a2b0002-0000-4000-8000-000000000007', v_t, ws_inv, 'Set reorder points for the 40 fastest-moving items',
      'Stock-outs on the top sellers cost sales the week they happen. A reorder point per item stops it.',
      'Start with the 40 items that make up half of unit sales.', 'planned', 'plan', null, null, null, null, 4, null, false),

    ('7a2b0002-0000-4000-8000-000000000008', v_t, ws_rec, 'Hold new orders for accounts more than 60 days past due',
      'Six wholesale accounts owe $41,300 that is more than 60 days old and are still placing orders.',
      'Pause new orders on those six until the oldest invoice is paid or a plan is agreed.', 'needs_you', 'decide',
      jsonb_build_object('columns', jsonb_build_array('Account', 'Past 60 days', 'Oldest invoice', 'Orders open'), 'rows', jsonb_build_array(jsonb_build_array('Harborview Bistro', '$12,400', '94 days', '2'), jsonb_build_array('The Larder Co.', '$9,850', '81 days', '1'), jsonb_build_array('Mill Street Tavern', '$7,300', '73 days', '3')),
        'note', 'Source: wholesale invoice ledger, aged at the observed date. Demo figures.', 'source_system', 'ledger', 'source_ref', 'ar-aging-1', 'observed_at', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Aging computed from invoice dates and payments posted; no payment arrangement is on file for these six.'),
      null, null, null, 1, null, false),
    ('7a2b0002-0000-4000-8000-000000000009', v_t, ws_rec, 'Send statements to the nine overdue accounts',
      'None of the nine has received a statement. The email is drafted and waits for the send approval on the Approvals page.',
      null, 'in_progress', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Bucket', 'Accounts', 'Balance'), 'rows', jsonb_build_array(jsonb_build_array('1 to 30 days', '14', '$38,900'), jsonb_build_array('31 to 60 days', '7', '$22,150'), jsonb_build_array('Over 60 days', '6', '$41,300')),
        'note', 'Source: wholesale invoice ledger. Demo figures.', 'source_system', 'ledger', 'source_ref', 'ar-aging-1', 'observed_at', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Statement run is staged; nothing has been sent.'),
      null, null, null, 2, null, false),
    ('7a2b0002-0000-4000-8000-00000000000a', v_t, ws_rec, 'Put payment terms on the wholesale invoice',
      'Terms lived in a few emails. They now print on every invoice: net 30, with a 1.5 percent monthly charge after 45 days.',
      null, 'done', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Invoice template', 'Terms shown'), 'rows', jsonb_build_array(jsonb_build_array('Before', 'None'), jsonb_build_array('After', 'Net 30; 1.5% monthly after 45 days')),
        'note', 'Source: invoice template as saved. Demo.', 'source_system', 'ledger', 'source_ref', 'invoice-template-v2', 'observed_at', to_char(now() - interval '6 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', 'Template version 2 saved; the next invoice run uses it.'),
      'Every wholesale invoice now states its terms.', 'Terms were not on the invoice.', 'Template v2 as saved; next run to use it.', 3, now() - interval '6 days', false),

    ('7a2b0002-0000-4000-8000-00000000000b', v_t, ws_ret, 'Tag wine-club members at the point of sale',
      'The same member shows up as three different customers across the stores. One tag in Square ties them together.',
      null, 'in_progress', 'fix',
      jsonb_build_object('columns', jsonb_build_array('Store', 'Club members', 'Tagged'), 'rows', jsonb_build_array(jsonb_build_array('Lakeside Market', '212', '212'), jsonb_build_array('Old Town Cellar', '168', '91'), jsonb_build_array('Riverside Shop', '74', '0')),
        'note', 'Source: Square customer directory. Demo figures.', 'source_system', 'square', 'source_ref', 'sq-daily-oldtown-d1', 'observed_at', to_char(now() - interval '6 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'proof', '303 of 454 members tagged so far.'),
      null, null, null, 1, null, false),
    ('7a2b0002-0000-4000-8000-00000000000c', v_t, ws_ret, 'Win back lapsed wine-club members',
      'Members who have not bought in 90 days are the cheapest customers to win back. A short offer to them waits on the tagging above.',
      'Send one email with a free tasting, to members lapsed 90 to 180 days.', 'planned', 'plan', null, null, null, null, 2, null, false)
  on conflict (id) do update set title = excluded.title, detail = excluded.detail, recommendation = excluded.recommendation, status = excluded.status, kind = excluded.kind,
    evidence = excluded.evidence, outcome = excluded.outcome, was = excluded.was, proof = excluded.proof, rank = excluded.rank, done_at = excluded.done_at, updated_at = now();

  -- ── deliverables ─────────────────────────────────────────────────────────
  insert into public.deliverables (id, tenant_id, kind, title, slug, content, status) values
    ('7a2b0004-0000-4000-8000-000000000001', v_t, 'study', 'Margin review: where the gross margin goes', 'hv-margin-review',
      jsonb_build_object('summary', 'Fourteen of 212 active items sit below the 28 percent margin floor, and they are some of the fastest sellers. Moving them to the floor adds about $9,800 a year at current volumes.',
        'sections', jsonb_build_array(jsonb_build_object('heading', 'What we looked at', 'body', 'Ninety days of Square sales for three stores, joined to supplier case costs.'),
          jsonb_build_object('heading', 'What we found', 'body', 'Olive oil, one rosé and aged balsamic carry most of the shortfall. Case costs rose 6 percent in the spring; shelf prices did not move.'),
          jsonb_build_object('heading', 'What we recommend', 'body', 'Reprice the fourteen items (decision on the Margin workstream), then review case costs each quarter.'))), 'published'),
    ('7a2b0004-0000-4000-8000-000000000002', v_t, 'compliance', 'Close playbook: one calendar, five business days', 'hv-close-playbook',
      jsonb_build_object('summary', 'The steps, owners and dates for one month-end close across the warehouse and three stores.',
        'sections', jsonb_build_array(jsonb_build_object('heading', 'Calendar', 'body', 'Warehouse day 3, each store day 4, owners review day 5.'),
          jsonb_build_object('heading', 'Daily controls', 'body', 'Each till reconciled to the Square payout the next morning; any gap over $10 is explained in writing.'))), 'published'),
    ('7a2b0004-0000-4000-8000-000000000003', v_t, 'portfolio', 'Wholesale receivables aging and collection plan', 'hv-wholesale-aging',
      jsonb_build_object('summary', 'Draft. $102,350 is owed by 27 accounts; $41,300 of it is more than 60 days old.',
        'sections', jsonb_build_array(jsonb_build_object('heading', 'Aging', 'body', 'Fourteen accounts 1 to 30 days, seven accounts 31 to 60 days, six accounts over 60 days.'))), 'draft')
  on conflict (id) do update set kind = excluded.kind, title = excluded.title, slug = excluded.slug, content = excluded.content, status = excluded.status, updated_at = now();

  -- ── coverage map ─────────────────────────────────────────────────────────
  insert into public.coverage_areas (id, tenant_id, grp, area, status, note, rank, sort) values
    ('7a2b0005-0000-4000-8000-000000000001', v_t, 'Finance', 'Month-end close', 'partial', 'Calendar proposed; tills reconciled', null, 1),
    ('7a2b0005-0000-4000-8000-000000000002', v_t, 'Finance', 'Sales tax', 'partial', 'Monthly accrual drafted', null, 2),
    ('7a2b0005-0000-4000-8000-000000000003', v_t, 'Finance', 'Wholesale receivables', 'partial', 'Aging done, collection plan next', null, 3),
    ('7a2b0005-0000-4000-8000-000000000004', v_t, 'Finance', 'Cash forecast', 'none', 'Thirteen-week view for the warehouse', 2, 4),
    ('7a2b0005-0000-4000-8000-000000000005', v_t, 'Operations', 'Inventory accuracy', 'partial', 'Cold room count outstanding', null, 5),
    ('7a2b0005-0000-4000-8000-000000000006', v_t, 'Operations', 'Reorder points', 'none', 'Top 40 items first', 3, 6),
    ('7a2b0005-0000-4000-8000-000000000007', v_t, 'Operations', 'Supplier case costs', 'reviewed', 'Spring cost rise found', null, 7),
    ('7a2b0005-0000-4000-8000-000000000008', v_t, 'Operations', 'Delivery routes', 'none', 'Wholesale drops, fuel and time per stop', 4, 8),
    ('7a2b0005-0000-4000-8000-000000000009', v_t, 'Sales and customers', 'Pricing and margin', 'reviewed', 'Fourteen items below the floor', null, 9),
    ('7a2b0005-0000-4000-8000-00000000000a', v_t, 'Sales and customers', 'Wine club', 'partial', 'Member tagging in progress', null, 10),
    ('7a2b0005-0000-4000-8000-00000000000b', v_t, 'Sales and customers', 'Email and win-back', 'none', 'Waits on member tagging', 1, 11),
    ('7a2b0005-0000-4000-8000-00000000000c', v_t, 'Sales and customers', 'Online store', 'none', 'Order sync and fees', 5, 12),
    ('7a2b0005-0000-4000-8000-00000000000d', v_t, 'People and compliance', 'Alcohol license renewals', 'none', 'Three store licenses and the distributor permit', null, 13),
    ('7a2b0005-0000-4000-8000-00000000000e', v_t, 'People and compliance', 'Staff scheduling and labor cost', 'none', null, null, 14)
  on conflict (id) do update set grp = excluded.grp, area = excluded.area, status = excluded.status, note = excluded.note, rank = excluded.rank, sort = excluded.sort;

  -- ── contracts (no signed_url, no document id: nothing here pretends to be a real signed file) ──
  insert into public.contracts (id, tenant_id, title, status) values
    ('7a2b0006-0000-4000-8000-000000000001', v_t, 'Master services agreement (demo)', 'signed'),
    ('7a2b0006-0000-4000-8000-000000000002', v_t, 'Scope addition: wholesale receivables (demo)', 'sent')
  on conflict (id) do update set title = excluded.title, status = excluded.status;

  -- one honest base-schema connection: requested, nothing flowing
  insert into public.tenant_connections (id, tenant_id, connector_key, status, access, managed_by, note) values
    ('7a2b0008-0000-4000-8000-000000000001', v_t, 'mailchimp', 'requested', 'read', 'client', 'Demo: requested for win-back email; nothing is connected.')
  on conflict (tenant_id, connector_key) do nothing;

  -- ── connector-platform part, only where migration 20261005_10 is applied ──
  if to_regclass('public.entities') is not null and to_regclass('public.sync_runs') is not null and to_regclass('public.approvals') is not null then
    execute $cp$
      insert into public.entities (id, tenant_id, parent_id, kind, name, code, meta) values
        ('7a2b0007-0000-4000-8000-000000000001', $1, null, 'org', 'Harbor & Vine', 'HV', '{}'::jsonb)
      on conflict (id) do update set name = excluded.name, code = excluded.code, kind = excluded.kind
    $cp$ using v_t;
    execute $cp$
      insert into public.entities (id, tenant_id, parent_id, kind, name, code, meta) values
        ('7a2b0007-0000-4000-8000-000000000002', $1, '7a2b0007-0000-4000-8000-000000000001', 'location', 'Lakeside Market', 'HV-LAKE', '{"type":"store"}'::jsonb),
        ('7a2b0007-0000-4000-8000-000000000003', $1, '7a2b0007-0000-4000-8000-000000000001', 'location', 'Old Town Cellar', 'HV-OLDT', '{"type":"store"}'::jsonb),
        ('7a2b0007-0000-4000-8000-000000000004', $1, '7a2b0007-0000-4000-8000-000000000001', 'location', 'Riverside Shop', 'HV-RIVR', '{"type":"store"}'::jsonb),
        ('7a2b0007-0000-4000-8000-000000000005', $1, '7a2b0007-0000-4000-8000-000000000001', 'location', 'Distribution Warehouse', 'HV-WH', '{"type":"warehouse"}'::jsonb)
      on conflict (id) do update set name = excluded.name, code = excluded.code, kind = excluded.kind, parent_id = excluded.parent_id, meta = excluded.meta
    $cp$ using v_t;

    -- approvals: pending / rejected / expired only, so the engine can never claim and execute one from the demo
    execute $cp$
      insert into public.approvals (id, tenant_id, entity_id, gate, title, detail, proposed, source_ref, status, decided_by, decided_at, reason, created_at) values
        ('7a2b000a-0000-4000-8000-000000000001', $1, '7a2b0007-0000-4000-8000-000000000001', 'money', 'Reprice 14 items below the margin floor', 'Moves 14 shelf prices to the 28 percent floor across all three stores.', '{"items":14,"annual_effect_usd":9800}'::jsonb, 'workstream-task:inventory-margin:reprice', 'pending', null, null, null, now() - interval '5 hours'),
        ('7a2b000a-0000-4000-8000-000000000002', $1, '7a2b0007-0000-4000-8000-000000000005', 'send', 'Statements to nine overdue wholesale accounts', 'One statement email per account showing invoices, terms and balance. Not sent.', '{"recipients":9}'::jsonb, 'workstream-task:wholesale-receivables:statements', 'pending', null, null, null, now() - interval '1 day'),
        ('7a2b000a-0000-4000-8000-000000000003', $1, '7a2b0007-0000-4000-8000-000000000001', 'legal', 'Review the distributor agreement renewal', 'Renewal terms from the distributor, with a new minimum purchase clause. Needs counsel before signing.', '{"document":"distributor-agreement-renewal"}'::jsonb, 'contract:distributor-renewal', 'pending', null, null, null, now() - interval '2 days'),
        ('7a2b000a-0000-4000-8000-000000000004', $1, '7a2b0007-0000-4000-8000-000000000001', 'money', 'Two percent early-pay discount for all wholesale accounts', 'Offered to speed collections.', '{"discount_pct":2}'::jsonb, 'idea:early-pay-discount', 'rejected', $2, now() - interval '4 days', 'Costs about $8,000 a year and the late accounts are not the ones that would use it.', now() - interval '6 days'),
        ('7a2b000a-0000-4000-8000-000000000005', $1, '7a2b0007-0000-4000-8000-000000000003', 'send', 'Holiday tasting invitation to club members', 'Time-boxed invitation; the window passed before a decision.', '{"recipients":454}'::jsonb, 'campaign:holiday-tasting', 'expired', null, null, null, now() - interval '12 days')
      on conflict (id) do update set title = excluded.title, detail = excluded.detail, proposed = excluded.proposed, status = excluded.status, gate = excluded.gate, reason = excluded.reason
    $cp$ using v_t, v_owner;

    -- connections: inserted 'connected', health derived below from the sync_runs and ingested_records inserted here
    execute $cp$
      insert into public.tenant_connections (id, tenant_id, connector_key, definition_key, auth_method, status, access, managed_by, note, stale_after) values
        ('7a2b0008-0000-4000-8000-000000000002', $1, 'square', 'square', (select auth_method from public.connector_definitions where key = 'square'), 'connected', 'read', 'client', 'Demo data seeded for Harbor & Vine; not a customer Square account.', '26 hours'),
        ('7a2b0008-0000-4000-8000-000000000003', $1, 'shopify', 'shopify', (select auth_method from public.connector_definitions where key = 'shopify'), 'connected', 'read', 'client', 'Demo: seeded with one failed run to show a failing connection; not a customer store.', '26 hours')
      on conflict (tenant_id, connector_key) do update set status = 'connected', note = excluded.note
    $cp$ using v_t;
    execute $cp$
      insert into public.sync_runs (id, tenant_id, connection_id, object, started_at, finished_at, status, rows_read, rows_written, error) values
        ('7a2b0009-0000-4000-8000-000000000001', $1, '7a2b0008-0000-4000-8000-000000000002', 'daily_sales', now() - interval '30 hours 2 minutes', now() - interval '30 hours', 'succeeded', 3, 3, null),
        ('7a2b0009-0000-4000-8000-000000000002', $1, '7a2b0008-0000-4000-8000-000000000002', 'daily_sales', now() - interval '6 hours 2 minutes', now() - interval '6 hours', 'succeeded', 3, 3, null),
        ('7a2b0009-0000-4000-8000-000000000003', $1, '7a2b0008-0000-4000-8000-000000000003', 'orders', now() - interval '3 hours 1 minute', now() - interval '3 hours', 'failed', 0, 0, 'Demo failure: the store access token was rejected (401).')
      on conflict (id) do update set started_at = excluded.started_at, finished_at = excluded.finished_at, status = excluded.status, rows_read = excluded.rows_read, rows_written = excluded.rows_written, error = excluded.error
    $cp$ using v_t;
    execute $cp$
      insert into public.ingested_records (tenant_id, connection_id, source_system, object, source_ref, payload, payload_sha256, observed_at, valid_from, ingested_run)
      select $1, '7a2b0008-0000-4000-8000-000000000002', 'square', 'daily_sales', r.ref, r.payload, encode(sha256(convert_to(r.payload::text, 'UTF8')), 'hex'), r.at, r.at, r.run
      from (values
        ('sq-daily-lakeside-d2', '{"store":"Lakeside Market","gross_usd":4212,"transactions":318,"demo":true}'::jsonb, now() - interval '30 hours', '7a2b0009-0000-4000-8000-000000000001'::uuid),
        ('sq-daily-oldtown-d2',  '{"store":"Old Town Cellar","gross_usd":3846,"transactions":271,"demo":true}'::jsonb, now() - interval '30 hours', '7a2b0009-0000-4000-8000-000000000001'::uuid),
        ('sq-daily-riverside-d2','{"store":"Riverside Shop","gross_usd":2955,"transactions":204,"demo":true}'::jsonb, now() - interval '30 hours', '7a2b0009-0000-4000-8000-000000000001'::uuid),
        ('sq-daily-lakeside-d1', '{"store":"Lakeside Market","gross_usd":4390,"transactions":331,"demo":true}'::jsonb, now() - interval '6 hours', '7a2b0009-0000-4000-8000-000000000002'::uuid),
        ('sq-daily-oldtown-d1',  '{"store":"Old Town Cellar","gross_usd":3711,"transactions":262,"demo":true}'::jsonb, now() - interval '6 hours', '7a2b0009-0000-4000-8000-000000000002'::uuid),
        ('sq-daily-riverside-d1','{"store":"Riverside Shop","gross_usd":3068,"transactions":219,"demo":true}'::jsonb, now() - interval '6 hours', '7a2b0009-0000-4000-8000-000000000002'::uuid)
      ) as r(ref, payload, at, run)
      on conflict (connection_id, object, source_ref, payload_sha256) do update set observed_at = excluded.observed_at, valid_from = excluded.valid_from, ingested_run = excluded.ingested_run
    $cp$ using v_t;
    update public.tenant_connections set last_rows = 3 where id = '7a2b0008-0000-4000-8000-000000000002';
    perform private.refresh_connection_health('7a2b0008-0000-4000-8000-000000000002');
    perform private.refresh_connection_health('7a2b0008-0000-4000-8000-000000000003');
  end if;
end
$seed$;

-- To remove this seed from a tenant (not run automatically): delete from every table above where id::text like '7a2b000%'
-- and tenant_id = (select id from public.tenants where slug = 'harbor-vine-demo'); children first (ingested_records, sync_runs, approvals,
-- tenant_connections, entities, workstream_grades, workstream_tasks, workstreams, deliverables, coverage_areas, contracts).
