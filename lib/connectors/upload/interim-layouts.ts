import type { TargetField } from './map.ts';

/**
 * Interim path for partner-gated systems: the customer exports from their own system (or schedules the export to
 * SFTP) into these files. These layouts are OURS. Header names equal the target field names, so suggestMapping()
 * maps an exact-match file with no manual step; any other export is mapped column by column in the upload UI.
 * They say nothing about how the vendor's own export names its columns.
 */
export interface InterimLayout {
  /** target object in ingested_records */
  object: string;
  /** suggested file name in the SFTP inbox folder */
  file: string;
  description: string;
  fields: TargetField[];
}

const s = (name: string, required = false): TargetField => ({ name, type: 'string', required });
const d = (name: string, required = false): TargetField => ({ name, type: 'date', required });
const m = (name: string, required = false): TargetField => ({ name, type: 'money', required });
const n = (name: string, required = false): TargetField => ({ name, type: 'number', required });
const b = (name: string): TargetField => ({ name, type: 'boolean' });

export const INTERIM_LAYOUTS: Record<string, InterimLayout[]> = {
  'yardi-voyager': [
    { object: 'properties', file: 'properties.csv', description: 'One row per property', fields: [s('property_code', true), s('property_name', true), s('address'), n('unit_count')] },
    { object: 'leases', file: 'leases.csv', description: 'One row per active or recent lease', fields: [s('property_code', true), s('unit', true), s('tenant_name', true), d('lease_start'), d('lease_end'), m('monthly_rent'), s('status')] },
    { object: 'charges', file: 'charges.csv', description: 'Posted resident charges and receivables', fields: [s('property_code', true), s('tenant_code', true), d('charge_date', true), s('charge_type', true), m('amount', true), m('balance')] },
  ],
  'mri-software': [
    { object: 'properties', file: 'properties.csv', description: 'One row per property', fields: [s('property_id', true), s('property_name', true), s('city'), s('state')] },
    { object: 'leases', file: 'leases.csv', description: 'One row per lease', fields: [s('property_id', true), s('suite', true), s('tenant_name', true), d('start_date'), d('end_date'), m('monthly_rent')] },
    { object: 'ap_invoices', file: 'ap_invoices.csv', description: 'Accounts payable invoices', fields: [s('vendor_id', true), s('vendor_name'), s('invoice_no', true), d('invoice_date', true), d('due_date'), m('amount', true), s('gl_account')] },
  ],
  'tyler-munis': [
    { object: 'gl_journal', file: 'gl_journal.csv', description: 'General ledger journal lines', fields: [s('fund', true), s('account', true), d('journal_date', true), s('description'), m('debit'), m('credit')] },
    { object: 'ap_invoices', file: 'ap_invoices.csv', description: 'Accounts payable invoices', fields: [s('vendor_id', true), s('vendor_name'), s('invoice_no', true), d('invoice_date', true), m('amount', true), s('po_number')] },
    { object: 'vendors', file: 'vendors.csv', description: 'Vendor master', fields: [s('vendor_id', true), s('vendor_name', true), s('status')] },
  ],
  appfolio: [
    { object: 'rent_roll', file: 'rent_roll.csv', description: 'Rent roll snapshot', fields: [s('property', true), s('unit', true), s('tenant', true), d('lease_from'), d('lease_to'), m('rent')] },
    { object: 'work_orders', file: 'work_orders.csv', description: 'Maintenance work orders', fields: [s('work_order_no', true), s('property', true), s('unit'), s('status'), d('opened_date', true), s('vendor'), m('cost')] },
    { object: 'receivables', file: 'receivables.csv', description: 'Charges and receivables', fields: [s('property', true), s('tenant', true), d('charge_date', true), s('charge_type'), m('amount', true), m('balance')] },
  ],
  workday: [
    { object: 'workers', file: 'workers.csv', description: 'Worker roster (no compensation fields requested)', fields: [s('worker_id', true), s('legal_name', true), s('job_title'), s('department'), d('hire_date'), s('status'), s('manager_id')] },
    { object: 'time_off', file: 'time_off.csv', description: 'Approved time off', fields: [s('worker_id', true), s('plan'), d('start_date', true), d('end_date'), n('hours')] },
    { object: 'gl_journals', file: 'gl_journals.csv', description: 'Financials journal lines', fields: [s('journal_id', true), d('accounting_date', true), s('ledger_account', true), m('debit'), m('credit'), s('memo')] },
  ],
  'adp-workforce-now': [
    { object: 'workers', file: 'workers.csv', description: 'Worker roster', fields: [s('worker_id', true), s('legal_name', true), s('job_title'), s('department'), d('hire_date'), s('status')] },
    { object: 'pay_statements', file: 'pay_statements.csv', description: 'Pay statement totals per worker per pay date', fields: [s('worker_id', true), d('pay_date', true), m('gross_pay', true), m('net_pay'), n('hours')] },
    { object: 'time_cards', file: 'time_cards.csv', description: 'Daily time cards', fields: [s('worker_id', true), d('work_date', true), n('hours', true), s('pay_code')] },
  ],
  toast: [
    { object: 'orders', file: 'orders.csv', description: 'One row per order (from a customer-enabled Toast Data Export, mapped to this layout)', fields: [s('order_id', true), s('restaurant_guid', true), d('business_date', true), m('net_sales', true), m('tax'), m('tip'), m('total'), n('guest_count')] },
    { object: 'payments', file: 'payments.csv', description: 'One row per payment', fields: [s('payment_id', true), s('order_id', true), d('business_date', true), s('payment_type'), m('amount', true), m('tip')] },
    { object: 'time_entries', file: 'time_entries.csv', description: 'Labor time entries', fields: [s('employee_id', true), d('business_date', true), n('regular_hours'), n('overtime_hours'), s('job_title')] },
  ],
  clover: [
    { object: 'orders', file: 'orders.csv', description: 'One row per order', fields: [s('order_id', true), d('created_date', true), m('total', true), m('tax_amount'), m('tip_amount'), s('state'), s('employee')] },
    { object: 'payments', file: 'payments.csv', description: 'One row per payment', fields: [s('payment_id', true), s('order_id'), d('created_date', true), m('amount', true), s('result')] },
    { object: 'items', file: 'items.csv', description: 'Inventory items', fields: [s('item_id', true), s('name', true), m('price'), s('category')] },
  ],
  'sage-intacct': [
    { object: 'gl_journal_entries', file: 'gl_journal_entries.csv', description: 'GL journal lines', fields: [s('batch_no', true), d('posting_date', true), s('account_no', true), m('debit'), m('credit'), s('location'), s('department'), s('memo')] },
    { object: 'ap_bills', file: 'ap_bills.csv', description: 'AP bills', fields: [s('vendor_id', true), s('bill_no', true), d('bill_date', true), d('due_date'), m('amount', true), s('state')] },
    { object: 'ar_invoices', file: 'ar_invoices.csv', description: 'AR invoices', fields: [s('customer_id', true), s('invoice_no', true), d('invoice_date', true), d('due_date'), m('amount', true), s('state')] },
  ],
  xero: [
    { object: 'invoices', file: 'invoices.csv', description: 'Sales and purchase invoices', fields: [s('contact_name', true), s('invoice_number', true), d('invoice_date', true), d('due_date'), m('total', true), s('status'), s('currency')] },
    { object: 'bank_transactions', file: 'bank_transactions.csv', description: 'Bank transactions', fields: [s('bank_account', true), d('transaction_date', true), m('amount', true), s('payee'), s('reference')] },
    { object: 'contacts', file: 'contacts.csv', description: 'Contacts', fields: [s('contact_name', true), s('email'), b('is_supplier'), b('is_customer')] },
  ],
  procore: [
    { object: 'commitments', file: 'commitments.csv', description: 'Subcontracts and purchase orders', fields: [s('project', true), s('commitment_no', true), s('vendor', true), s('title'), s('status'), m('amount', true), d('executed_date')] },
    { object: 'change_orders', file: 'change_orders.csv', description: 'Change orders', fields: [s('project', true), s('change_order_no', true), s('title'), s('status'), m('amount', true), d('created_date')] },
    { object: 'budget_lines', file: 'budget_lines.csv', description: 'Budget line items', fields: [s('project', true), s('cost_code', true), s('description'), m('original_budget'), m('revised_budget'), m('committed_cost'), m('direct_cost')] },
  ],
  gusto: [
    { object: 'employees', file: 'employees.csv', description: 'Employee roster (no pay rate fields requested)', fields: [s('employee_id', true), s('first_name', true), s('last_name', true), d('hire_date'), s('department'), s('job_title'), s('status')] },
    { object: 'payrolls', file: 'payrolls.csv', description: 'Payroll totals per pay date', fields: [s('payroll_id', true), d('pay_date', true), d('check_date'), m('gross', true), m('net'), m('employer_taxes')] },
  ],
  sage: [
    { object: 'gl_transactions', file: 'gl_transactions.csv', description: 'General ledger transactions', fields: [d('transaction_date', true), s('account', true), s('description'), m('debit'), m('credit'), s('reference')] },
    { object: 'ar_invoices', file: 'ar_invoices.csv', description: 'Customer invoices', fields: [s('customer', true), s('invoice_no', true), d('invoice_date', true), d('due_date'), m('amount', true), s('status')] },
    { object: 'ap_invoices', file: 'ap_invoices.csv', description: 'Supplier invoices', fields: [s('supplier', true), s('invoice_no', true), d('invoice_date', true), d('due_date'), m('amount', true), s('status')] },
  ],
};
