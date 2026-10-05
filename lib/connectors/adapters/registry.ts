import type { Adapter } from '../types.ts';
import { amazonS3 } from './amazon-s3.ts';
import { csvExcelUpload } from './csv-excel-upload.ts';
import { databricks } from './databricks.ts';
import { googleBigquery } from './google-bigquery.ts';
import { hubspot } from './hubspot.ts';
import { microsoft365 } from './microsoft-365.ts';
import { quickbooksOnline } from './quickbooks-online.ts';
import {
  blackbaudRaisersEdgeNxt,
  box,
  brevoAdapter,
  buildiumAdapter,
  clioManage,
  cloverAdapter,
  dropboxBusiness,
  dynamics365BusinessCentral,
  esriArcgis,
  googleWorkspace,
  laserfiche,
  mailchimp,
  salesforce,
  stripeAdapter,
  xeroAdapter,
} from './rest-systems.ts';
import { sftpDrop } from './sftp-drop.ts';
import { shopify } from './shopify.ts';
import { snowflake } from './snowflake.ts';
import { square } from './square.ts';

/**
 * Every adapter that exists in this branch, keyed by definition key. build_status 'implemented' is derived from
 * this map (scripts/gen-connector-definitions.mjs), never typed by hand. csv-excel-upload and sftp-drop here are
 * unwired defaults; production builds them with createUploadAdapter(source) / createSftpAdapter(lister).
 * Azure Synapse is TDS-only (no HTTP list endpoint), so it is deliberately absent.
 */
export const ADAPTERS: Record<string, Adapter> = {
  'amazon-s3': amazonS3,
  'blackbaud-raisers-edge-nxt': blackbaudRaisersEdgeNxt,
  box,
  brevo: brevoAdapter,
  buildium: buildiumAdapter,
  'clio-manage': clioManage,
  clover: cloverAdapter,
  'csv-excel-upload': csvExcelUpload,
  databricks,
  'dropbox-business': dropboxBusiness,
  'dynamics-365-business-central': dynamics365BusinessCentral,
  'esri-arcgis': esriArcgis,
  'google-bigquery': googleBigquery,
  'google-workspace': googleWorkspace,
  hubspot,
  laserfiche,
  mailchimp,
  'microsoft-365': microsoft365,
  'quickbooks-online': quickbooksOnline,
  salesforce,
  'sftp-drop': sftpDrop,
  shopify,
  snowflake,
  square,
  stripe: stripeAdapter,
  xero: xeroAdapter,
};

export function getAdapter(key: string): Adapter {
  const a = ADAPTERS[key];
  if (!a) throw new Error(`no adapter for ${key}`);
  return a;
}
