// The market series Signals tracks. One canonical official ID per series, preferring the primary agency (BLS for prices and labor,
// EIA for energy) and FRED for the rest. public_ok=false marks third-party copyright: stored and shown to signed-in clients only,
// never returned by the public endpoint (enforced in the database by RLS, not just in the route).
export type MarketSource = "fred" | "bls" | "eia";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly";

export type SeriesDef = {
  id: string;
  source: MarketSource;
  source_series_id: string;
  title: string;
  units: string;
  frequency: Frequency;
  category: string;
  region: string;
  license_note: string;
  public_ok: boolean;
  // EIA only: route + facet + data frequency parameter for the v2 API.
  eia?: { route: string; frequency: "weekly" | "daily"; series: string };
};

const BLS = "U.S. Bureau of Labor Statistics. Federal government data, public domain; cite BLS.";
const EIA = "U.S. Energy Information Administration. Federal government data, public domain; cite EIA.";
const FRB = "Board of Governors of the Federal Reserve System via FRED. Federal government data, public domain; cite the Federal Reserve Board. This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";
const CENSUS = "U.S. Census Bureau via FRED. Federal government data, public domain; cite the Census Bureau. This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";
const UMICH = "Copyright University of Michigan, Surveys of Consumers; reprinted by FRED with permission. Third-party copyright: signed-in clients only, not redistributed publicly.";
const IMF = "Copyright International Monetary Fund; reprinted by FRED with permission. Third-party copyright: signed-in clients only, not redistributed publicly.";

export const SERIES: SeriesDef[] = [
  { id: "cpi", source: "bls", source_series_id: "CUSR0000SA0", title: "Consumer prices (CPI-U, all items)", units: "Index 1982-84=100, seasonally adjusted", frequency: "monthly", category: "Inflation", region: "US", license_note: BLS, public_ok: true },
  { id: "core_cpi", source: "bls", source_series_id: "CUSR0000SA0L1E", title: "Core consumer prices (CPI-U less food and energy)", units: "Index 1982-84=100, seasonally adjusted", frequency: "monthly", category: "Inflation", region: "US", license_note: BLS, public_ok: true },
  { id: "midwest_cpi", source: "bls", source_series_id: "CUUR0200SA0", title: "Consumer prices, Midwest region (CPI-U, all items)", units: "Index 1982-84=100, not seasonally adjusted", frequency: "monthly", category: "Inflation", region: "Midwest", license_note: BLS, public_ok: true },
  { id: "ppi", source: "bls", source_series_id: "WPSFD4", title: "Producer prices (PPI, final demand)", units: "Index Nov 2009=100, seasonally adjusted", frequency: "monthly", category: "Inflation", region: "US", license_note: BLS, public_ok: true },
  { id: "unemployment", source: "bls", source_series_id: "LNS14000000", title: "Unemployment rate", units: "Percent, seasonally adjusted", frequency: "monthly", category: "Labor", region: "US", license_note: BLS, public_ok: true },
  { id: "avg_hourly_earnings", source: "bls", source_series_id: "CES0500000003", title: "Average hourly earnings, private employees", units: "Dollars per hour, seasonally adjusted", frequency: "monthly", category: "Labor", region: "US", license_note: BLS, public_ok: true },
  { id: "eci", source: "bls", source_series_id: "CIS1010000000000I", title: "Employment cost index, total compensation, civilian workers", units: "Index Dec 2005=100, seasonally adjusted", frequency: "quarterly", category: "Labor", region: "US", license_note: BLS, public_ok: true },
  { id: "fed_funds", source: "fred", source_series_id: "FEDFUNDS", title: "Effective federal funds rate", units: "Percent, monthly average", frequency: "monthly", category: "Rates and dollar", region: "US", license_note: FRB, public_ok: true },
  { id: "treasury_10y", source: "fred", source_series_id: "DGS10", title: "10-year Treasury yield", units: "Percent, daily", frequency: "daily", category: "Rates and dollar", region: "US", license_note: FRB, public_ok: true },
  { id: "usd_index", source: "fred", source_series_id: "DTWEXBGS", title: "Trade-weighted U.S. dollar index (broad)", units: "Index Jan 2006=100, daily", frequency: "daily", category: "Rates and dollar", region: "US", license_note: FRB, public_ok: true },
  { id: "retail_sales", source: "fred", source_series_id: "RSAFS", title: "Retail and food services sales", units: "Millions of dollars, seasonally adjusted", frequency: "monthly", category: "Activity", region: "US", license_note: CENSUS, public_ok: true },
  { id: "industrial_production", source: "fred", source_series_id: "INDPRO", title: "Industrial production index", units: "Index 2017=100, seasonally adjusted", frequency: "monthly", category: "Activity", region: "US", license_note: FRB, public_ok: true },
  { id: "consumer_sentiment", source: "fred", source_series_id: "UMCSENT", title: "Consumer sentiment (University of Michigan)", units: "Index 1966:Q1=100", frequency: "monthly", category: "Activity", region: "US", license_note: UMICH, public_ok: false },
  { id: "diesel", source: "eia", source_series_id: "EMD_EPD2D_PTE_NUS_DPG", title: "On-highway diesel, retail price", units: "Dollars per gallon, weekly", frequency: "weekly", category: "Energy", region: "US", license_note: EIA, public_ok: true, eia: { route: "petroleum/pri/gnd", frequency: "weekly", series: "EMD_EPD2D_PTE_NUS_DPG" } },
  { id: "gasoline", source: "eia", source_series_id: "EMM_EPMR_PTE_NUS_DPG", title: "Regular gasoline, retail price", units: "Dollars per gallon, weekly", frequency: "weekly", category: "Energy", region: "US", license_note: EIA, public_ok: true, eia: { route: "petroleum/pri/gnd", frequency: "weekly", series: "EMM_EPMR_PTE_NUS_DPG" } },
  { id: "wti", source: "eia", source_series_id: "RWTC", title: "WTI crude oil spot price (Cushing)", units: "Dollars per barrel, daily", frequency: "daily", category: "Energy", region: "US", license_note: EIA, public_ok: true, eia: { route: "petroleum/pri/spt", frequency: "daily", series: "RWTC" } },
  { id: "henry_hub", source: "eia", source_series_id: "RNGWHHD", title: "Henry Hub natural gas spot price", units: "Dollars per MMBtu, daily", frequency: "daily", category: "Energy", region: "US", license_note: EIA, public_ok: true, eia: { route: "natural-gas/pri/fut", frequency: "daily", series: "RNGWHHD" } },
  { id: "copper", source: "fred", source_series_id: "PCOPPUSDM", title: "Copper, global price", units: "U.S. dollars per metric ton, monthly average", frequency: "monthly", category: "Metals", region: "Global", license_note: IMF, public_ok: false },
  { id: "aluminum", source: "fred", source_series_id: "PALUMUSDM", title: "Aluminum, global price", units: "U.S. dollars per metric ton, monthly average", frequency: "monthly", category: "Metals", region: "Global", license_note: IMF, public_ok: false },
];

export type Obs = { series_id: string; obs_date: string; value: number };

export function seriesMeta(s: SeriesDef) {
  const { eia: _eia, ...meta } = s;
  return meta;
}
