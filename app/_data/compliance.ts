// Canonical compliance-document checklist per company.
// entity slugs match legal_documents.entity (aspen_may, dabney_co, loveleeday).
// JURISDICTIONS (confirmed):
//   Aspen & May Group LLC  — DE LLC, file 10582622, EIN 42-2823682, formed Apr 2026
//   LOVELEEDAY Studios LLC — DE LLC, file 10582605, EIN NOT YET ASSIGNED, formed Apr 2026
//   Public Skool LLC       — MI LLC, DBA Dabney & Co., EIN 84-2552118
//
// KNOWN OUTSTANDING (as of 2026-05-31):
//   Dabney  — MLCC liquor license EXPIRED 04/30/2026 (#L-000447113) — critical
//   Dabney  — Food license ACTIVE to 04/30/2027 (#SFE-2539-266795)
//   Aspen   — EIN confirmed (CP-575 on file)
//   LVD     — No EIN, no bank account, no OA on file

export type ChecklistItem = {
  key: string;
  label: string;
  category: string;
  required: boolean;
  note?: string;
  matchKeywords?: string[];
  /** Force item to OUTSTANDING even when a doc matches (e.g. expired license still stored). */
  forceOutstanding?: boolean;
  expiredStatus?: boolean;
  outstandingLabel?: string;
};
export type ChecklistSection = { title: string; items: ChecklistItem[] };
export type CompanyCompliance = {
  entity: string;
  name: string;
  legalName?: string;
  kind: string;
  jurisdiction: string;
  ein?: string;
  goodStanding?: { status: string; asOf: string; verified: boolean; note?: string };
  sections: ChecklistSection[];
};

type Juris = "DE" | "MI";

const FORMATION = (j: Juris, extra: ChecklistItem[] = []): ChecklistSection => ({
  title: "Formation & Governance",
  items: [
    j === "DE"
      ? { key: "formation_doc", label: "Certificate of Formation", category: "formation", required: true, note: "DE Division of Corporations filing.", matchKeywords: ["certificate of formation", "formation", "delaware"] }
      : { key: "formation_doc", label: "Articles of Organization", category: "formation", required: true, note: "MI LARA filing that creates the LLC.", matchKeywords: ["articles", "organization", "formation"] },
    { key: "operating_agreement", label: "Operating Agreement", category: "operating_agreement", required: true, note: "Ownership %, management, distributions." },
    j === "DE"
      ? { key: "registered_agent", label: "DE Registered Agent (Northwest)", category: "formation", required: true, note: "Northwest Registered Agent on file.", matchKeywords: ["registered agent", "northwest"] }
      : { key: "registered_agent", label: "MI Resident Agent Designation", category: "formation", required: true, note: "MI resident agent on file with LARA.", matchKeywords: ["registered agent", "resident agent"] },
    { key: "boi", label: "FinCEN Beneficial Ownership (BOI)", category: "compliance_policy", required: true, note: "Federal BOI report — required for entities formed after 2024.", matchKeywords: ["boi", "beneficial owner", "fincen"] },
    ...(j === "DE"
      ? [{ key: "mi_foreign", label: "MI Foreign Qualification (if operating in MI)", category: "formation", required: false, note: "Certificate of Authority if transacting business in Michigan.", matchKeywords: ["foreign", "authority", "qualification"] } as ChecklistItem]
      : []),
    ...extra,
  ],
});

const TAX = (j: Juris, extra: ChecklistItem[] = []): ChecklistSection => ({
  title: "Tax & Filings",
  items: [
    { key: "ein", label: "EIN Confirmation (IRS CP-575)", category: "ein_tax", required: true, note: "IRS employer ID assignment letter.", matchKeywords: ["ein", "cp-575", "cp575", "employer id"] },
    j === "DE"
      ? { key: "annual_filing", label: "DE Franchise Tax / Annual Report", category: "annual_report", required: true, note: "DE LLC flat franchise tax — $300, due June 1 annually.", matchKeywords: ["franchise tax", "delaware", "annual"] }
      : { key: "annual_filing", label: "MI Annual Statement (LARA)", category: "annual_report", required: true, note: "LARA annual filing — due Feb 15.", matchKeywords: ["annual", "lara", "statement"] },
    { key: "tax_return", label: "Most Recent Tax Return", category: "ein_tax", required: true, note: "Prior-year federal + state return (1065 / 1120-S / Schedule C).", matchKeywords: ["return", "1065", "1120", "tax return"] },
    ...extra,
  ],
});

const BANKING_INS = (extra: ChecklistItem[] = []): ChecklistSection => ({
  title: "Banking & Insurance",
  items: [
    { key: "bank", label: "Business Bank Account / Resolution", category: "banking", required: true, note: "Account opening docs + banking resolution on file.", matchKeywords: ["bank", "resolution", "dda"] },
    { key: "gl_insurance", label: "General Liability Insurance (COI)", category: "insurance", required: true, note: "Active COI from carrier.", matchKeywords: ["general liability", "coi", "certificate of insurance", "gl"] },
    ...extra,
  ],
});

export const companies: CompanyCompliance[] = [
  {
    entity: "aspen_may",
    name: "Aspen & May",
    legalName: "Aspen & May Group LLC",
    kind: "Holding Co.",
    jurisdiction: "Delaware",
    ein: "42-2823682",
    goodStanding: { status: "Active", asOf: "2026-04-20", verified: false, note: "Formed Apr 20, 2026 via Northwest Registered Agent" },
    sections: [
      FORMATION("DE", [
        { key: "initial_resolutions", label: "Initial Member Resolutions", category: "formation", required: true, note: "Authorizes bank accounts, officers, and initial operations.", matchKeywords: ["initial resolutions", "resolutions", "single member"] },
        { key: "cap_table", label: "Cap Table / Ownership Ledger", category: "formation", required: true, note: "Members + % ownership of holdco and subsidiaries.", matchKeywords: ["cap table", "ownership", "ledger", "membership interest"] },
      ]),
      TAX("DE"),
      BANKING_INS([
        { key: "credit_facility", label: "Credit Facility / Loan Agreements", category: "banking", required: false, note: "Any active lines of credit or notes payable.", matchKeywords: ["credit", "loan", "note"] },
      ]),
      {
        title: "Holding Structure",
        items: [
          { key: "subsidiary_docs", label: "Subsidiary Ownership Docs", category: "formation", required: true, note: "Proof of ownership in LOVELEEDAY Studios + Public Skool LLC.", matchKeywords: ["subsidiary", "membership interest", "loveleeday"] },
          { key: "intercompany", label: "Intercompany Agreements", category: "contract", required: false, note: "Management/services agreements between entities.", matchKeywords: ["intercompany", "management agreement"] },
          { key: "deeds_leases", label: "Property Deeds / Leases", category: "contract", required: false, note: "Real-estate holdings.", matchKeywords: ["deed", "lease", "property"] },
        ],
      },
    ],
  },
  {
    entity: "dabney_co",
    name: "Dabney & Co.",
    legalName: "Public Skool LLC (DBA Dabney & Co.)",
    kind: "Cocktail Bar & Lounge",
    jurisdiction: "Kalamazoo, Michigan",
    ein: "84-2552118",
    goodStanding: { status: "Good Standing", asOf: "2026-05-26", verified: true, note: "MI LARA — Active, restored 05/26/2026" },
    sections: [
      FORMATION("MI", [
        { key: "dba", label: 'Assumed Name (DBA) — "Dabney & Co."', category: "formation", required: true, note: "Dabney & Co. registered as assumed name of Public Skool LLC.", matchKeywords: ["dba", "assumed name", "dabney"] },
        { key: "restoration", label: "Certificate of Restoration of Good Standing", category: "formation", required: false, note: "Filed 2026 — reinstated after administrative dissolution.", matchKeywords: ["restoration", "good standing", "reinstate"] },
      ]),
      TAX("MI", [
        { key: "sales_tax", label: "MI Sales & Use Tax License", category: "license", required: true, note: "MI Treasury registration to collect sales tax.", matchKeywords: ["sales tax", "use tax"] },
        { key: "w9", label: "W-9 (Signed)", category: "ein_tax", required: true, note: "Required for vendor/partner payments.", matchKeywords: ["w-9", "w9"] },
      ]),
      {
        title: "Licenses & Permits",
        items: [
          {
            key: "liquor",
            label: "MLCC Liquor License — Class C (#L-000447113)",
            category: "license",
            required: true,
            note: "EXPIRED 04/30/2026 — renewal past due. Contact MLCC immediately.",
            matchKeywords: ["liquor", "mlcc", "class c", "l-000447113"],
            forceOutstanding: true,
            expiredStatus: true,
            outstandingLabel: "EXPIRED 04/30/2026",
          },
          {
            key: "food_license",
            label: "Food Service License — MDARD (#SFE-2539-266795)",
            category: "license",
            required: true,
            note: "Active — expires 04/30/2027. Issued by MI Dept of Agriculture.",
            matchKeywords: ["food", "mdard", "sfe-2539", "food service", "establishment"],
          },
          {
            key: "health_permit",
            label: "Health Dept Permit (Kalamazoo County)",
            category: "permit",
            required: true,
            note: "County environmental health inspection permit.",
            matchKeywords: ["health", "inspection", "environmental", "kalamazoo county"],
          },
          {
            key: "city_license",
            label: "City of Kalamazoo Business License",
            category: "license",
            required: true,
            note: "Local business registration.",
            matchKeywords: ["kalamazoo", "city", "business license"],
          },
          {
            key: "music_license",
            label: "Music License (Soundtrack Your Brand / PRO)",
            category: "license",
            required: false,
            note: "Soundtrack Your Brand covers BMI/ASCAP/GMR — official cert on file.",
            matchKeywords: ["music", "ascap", "bmi", "soundtrack", "performance"],
          },
        ],
      },
      BANKING_INS([
        {
          key: "liquor_liability",
          label: "Liquor Liability Insurance",
          category: "insurance",
          required: true,
          note: "Dram-shop coverage — annual policy via Ron Jackson Insurance.",
          matchKeywords: ["liquor liability", "dram", "founders"],
        },
        {
          key: "workers_comp",
          label: "Workers' Compensation COI",
          category: "insurance",
          required: true,
          note: "Frankenmuth — expires 10/01/2026.",
          matchKeywords: ["workers", "comp", "frankenmuth", "workers compensation"],
        },
      ]),
    ],
  },
  {
    entity: "loveleeday",
    name: "LOVELEEDAY Studios",
    legalName: "LOVELEEDAY Studios LLC",
    kind: "SaaS Studio — DE Subsidiary",
    jurisdiction: "Delaware",
    ein: undefined,
    goodStanding: { status: "Active", asOf: "2026-04-20", verified: false, note: "Formed Apr 2026 — EIN application pending" },
    sections: [
      FORMATION("DE", [
        { key: "initial_resolutions", label: "Initial Member Resolutions", category: "formation", required: true, note: "Authorizes bank accounts, officers, and initial operations.", matchKeywords: ["initial resolutions", "resolutions", "single member"] },
      ]),
      {
        title: "Tax & Filings",
        items: [
          {
            key: "ein",
            label: "EIN Confirmation (IRS CP-575)",
            category: "ein_tax",
            required: true,
            note: "EIN not yet assigned as of 2026-05-31 — apply via IRS Form SS-4.",
            matchKeywords: ["ein", "cp-575", "employer id"],
            forceOutstanding: true,
            outstandingLabel: "NOT YET OBTAINED",
          },
          {
            key: "annual_filing",
            label: "DE Franchise Tax / Annual Report",
            category: "annual_report",
            required: true,
            note: "DE LLC flat franchise tax — $300, due June 1 annually.",
            matchKeywords: ["franchise tax", "delaware", "annual"],
          },
          {
            key: "tax_return",
            label: "Most Recent Tax Return",
            category: "ein_tax",
            required: false,
            note: "Entity formed Apr 2026 — first filing due 2027.",
            matchKeywords: ["return", "1065", "1120"],
          },
        ],
      },
      {
        title: "Product & IP",
        items: [
          { key: "tos_privacy", label: "Terms of Service & Privacy Policy", category: "compliance_policy", required: true, note: "Published, current ToS + privacy for all LOVELEEDAY products.", matchKeywords: ["terms", "privacy", "tos"] },
          { key: "dpa", label: "Data Processing Addendum (DPA)", category: "compliance_policy", required: false, note: "For enterprise customers handling personal data.", matchKeywords: ["dpa", "data processing"] },
          { key: "msa", label: "Customer MSA / Subscription Agreement", category: "contract", required: true, note: "Master template for paying customers.", matchKeywords: ["msa", "subscription agreement", "master service"] },
          { key: "ip_assignment", label: "IP Assignment Agreements", category: "ip", required: true, note: "Founders + contractors assign IP to LOVELEEDAY Studios LLC.", matchKeywords: ["ip assignment", "intellectual property", "assignment"] },
        ],
      },
      BANKING_INS(),
    ],
  },
];
