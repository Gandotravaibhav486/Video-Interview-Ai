/**
 * The role x company matrix that actually shows up in Indian campus placement
 * drives, used to drive question-bank generation.
 *
 * Two things worth knowing about this list:
 *
 * 1. Pairings are deliberate, not a cross-product. A cross-product of every
 *    role against every company would be mostly nonsense (Bosch does not hire
 *    product managers from campus; McKinsey does not hire VLSI engineers), and
 *    generating against a pairing that doesn't exist produces exactly the
 *    role-drift failure the verification pass exists to catch. Each entry below
 *    is a role that company plausibly hires at fresher level.
 *
 * 2. This is a prioritized starting point, not verified ground truth. The
 *    research pass in question-bank-generation.ts re-checks each pairing
 *    against public sources at generation time and will report thin evidence
 *    where it finds it - a pairing listed here can still come back mostly
 *    "plausible" rather than "grounded". Treat `tier` as generation order,
 *    not as a confidence claim.
 */

export type PlacementCategory =
  | "it_services"
  | "global_product"
  | "indian_product"
  | "consulting_analytics"
  | "finance"
  | "core_engineering";

export interface PlacementPairing {
  role: string;
  company: string;
  category: PlacementCategory;
  /**
   * 1 = highest campus hiring volume, generate these first. Roughly tracks how
   * many students actually sit for that pairing, not company prestige - the
   * mass IT-services recruiters are tier 1 precisely because they take the
   * most freshers.
   */
  tier: 1 | 2 | 3;
}

export const PLACEMENT_MATRIX: PlacementPairing[] = [
  // ---------------------------------------------------------------------
  // IT services mass recruiters - the highest-volume campus employers, and
  // where the existing 23-row bank is already weakest for non-SDE roles.
  // ---------------------------------------------------------------------
  { role: "systems_engineer", company: "tcs", category: "it_services", tier: 1 },
  { role: "sde", company: "tcs", category: "it_services", tier: 1 },
  { role: "business_analyst", company: "tcs", category: "it_services", tier: 1 },
  { role: "qa_engineer", company: "tcs", category: "it_services", tier: 2 },
  { role: "systems_engineer", company: "infosys", category: "it_services", tier: 1 },
  { role: "sde", company: "infosys", category: "it_services", tier: 1 },
  { role: "data_analyst", company: "infosys", category: "it_services", tier: 2 },
  { role: "qa_engineer", company: "infosys", category: "it_services", tier: 2 },
  { role: "project_engineer", company: "wipro", category: "it_services", tier: 1 },
  { role: "sde", company: "wipro", category: "it_services", tier: 1 },
  { role: "cloud_engineer", company: "wipro", category: "it_services", tier: 3 },
  { role: "associate_software_engineer", company: "accenture", category: "it_services", tier: 1 },
  { role: "business_analyst", company: "accenture", category: "it_services", tier: 1 },
  { role: "data_analyst", company: "accenture", category: "it_services", tier: 2 },
  { role: "devops_engineer", company: "accenture", category: "it_services", tier: 3 },
  { role: "programmer_analyst", company: "cognizant", category: "it_services", tier: 1 },
  { role: "sde", company: "cognizant", category: "it_services", tier: 1 },
  { role: "qa_engineer", company: "cognizant", category: "it_services", tier: 3 },
  { role: "analyst", company: "capgemini", category: "it_services", tier: 1 },
  { role: "sde", company: "capgemini", category: "it_services", tier: 2 },
  { role: "software_engineer", company: "hcltech", category: "it_services", tier: 1 },
  { role: "technical_support", company: "hcltech", category: "it_services", tier: 2 },
  { role: "associate_software_engineer", company: "tech_mahindra", category: "it_services", tier: 2 },
  { role: "sde", company: "ltimindtree", category: "it_services", tier: 2 },
  { role: "software_engineer", company: "mphasis", category: "it_services", tier: 3 },
  { role: "sde", company: "persistent", category: "it_services", tier: 2 },
  { role: "sde", company: "coforge", category: "it_services", tier: 3 },
  { role: "sde", company: "zensar", category: "it_services", tier: 3 },
  { role: "sde", company: "hexaware", category: "it_services", tier: 3 },
  { role: "sde", company: "birlasoft", category: "it_services", tier: 3 },

  // ---------------------------------------------------------------------
  // Global product companies - lower volume, much higher bar, and the
  // pairings students most want practice for.
  // ---------------------------------------------------------------------
  { role: "sde", company: "amazon", category: "global_product", tier: 1 },
  { role: "business_analyst", company: "amazon", category: "global_product", tier: 1 },
  { role: "data_engineer", company: "amazon", category: "global_product", tier: 2 },
  { role: "support_engineer", company: "amazon", category: "global_product", tier: 3 },
  { role: "sde", company: "microsoft", category: "global_product", tier: 1 },
  { role: "data_scientist", company: "microsoft", category: "global_product", tier: 2 },
  { role: "sde", company: "google", category: "global_product", tier: 1 },
  { role: "data_analyst", company: "google", category: "global_product", tier: 2 },
  { role: "sde", company: "adobe", category: "global_product", tier: 1 },
  { role: "product_manager", company: "adobe", category: "global_product", tier: 3 },
  { role: "sde", company: "oracle", category: "global_product", tier: 1 },
  { role: "cloud_engineer", company: "oracle", category: "global_product", tier: 3 },
  { role: "sde", company: "sap", category: "global_product", tier: 2 },
  { role: "functional_consultant", company: "sap", category: "global_product", tier: 3 },
  { role: "sde", company: "salesforce", category: "global_product", tier: 2 },
  { role: "sde", company: "cisco", category: "global_product", tier: 2 },
  { role: "network_engineer", company: "cisco", category: "global_product", tier: 2 },
  { role: "sde", company: "ibm", category: "global_product", tier: 2 },
  { role: "data_scientist", company: "ibm", category: "global_product", tier: 3 },
  { role: "sde", company: "dell", category: "global_product", tier: 3 },
  { role: "sde", company: "vmware", category: "global_product", tier: 3 },
  { role: "sde", company: "samsung", category: "global_product", tier: 2 },
  { role: "embedded_engineer", company: "samsung", category: "global_product", tier: 2 },

  // Semiconductor / hardware - the ECE-branch equivalent of the SDE track,
  // and completely absent from the bank today.
  { role: "sde", company: "intel", category: "global_product", tier: 2 },
  { role: "vlsi_engineer", company: "intel", category: "global_product", tier: 2 },
  { role: "embedded_engineer", company: "qualcomm", category: "global_product", tier: 1 },
  { role: "vlsi_engineer", company: "qualcomm", category: "global_product", tier: 1 },
  { role: "sde", company: "qualcomm", category: "global_product", tier: 2 },
  { role: "sde", company: "nvidia", category: "global_product", tier: 2 },
  { role: "vlsi_engineer", company: "nvidia", category: "global_product", tier: 2 },
  { role: "vlsi_engineer", company: "texas_instruments", category: "global_product", tier: 2 },
  { role: "vlsi_engineer", company: "amd", category: "global_product", tier: 3 },
  { role: "vlsi_engineer", company: "micron", category: "global_product", tier: 3 },
  { role: "vlsi_engineer", company: "synopsys", category: "global_product", tier: 3 },
  { role: "vlsi_engineer", company: "cadence", category: "global_product", tier: 3 },

  // ---------------------------------------------------------------------
  // Indian product companies and startups.
  // ---------------------------------------------------------------------
  { role: "sde", company: "flipkart", category: "indian_product", tier: 1 },
  { role: "business_analyst", company: "flipkart", category: "indian_product", tier: 2 },
  { role: "data_analyst", company: "flipkart", category: "indian_product", tier: 2 },
  { role: "sde", company: "zomato", category: "indian_product", tier: 2 },
  { role: "business_analyst", company: "zomato", category: "indian_product", tier: 2 },
  { role: "sde", company: "swiggy", category: "indian_product", tier: 2 },
  { role: "data_analyst", company: "swiggy", category: "indian_product", tier: 2 },
  { role: "sde", company: "paytm", category: "indian_product", tier: 2 },
  { role: "sde", company: "phonepe", category: "indian_product", tier: 2 },
  { role: "sde", company: "razorpay", category: "indian_product", tier: 2 },
  { role: "sde", company: "zoho", category: "indian_product", tier: 1 },
  { role: "sde", company: "freshworks", category: "indian_product", tier: 2 },
  { role: "sde", company: "meesho", category: "indian_product", tier: 2 },
  { role: "data_analyst", company: "meesho", category: "indian_product", tier: 3 },
  { role: "sde", company: "cred", category: "indian_product", tier: 3 },
  { role: "sde", company: "groww", category: "indian_product", tier: 3 },
  { role: "sde", company: "zerodha", category: "indian_product", tier: 3 },
  { role: "sde", company: "dream11", category: "indian_product", tier: 3 },
  { role: "sde", company: "ola", category: "indian_product", tier: 2 },
  { role: "sde", company: "uber", category: "indian_product", tier: 2 },
  { role: "sde", company: "postman", category: "indian_product", tier: 3 },
  { role: "sde", company: "myntra", category: "indian_product", tier: 3 },
  { role: "sde", company: "inmobi", category: "indian_product", tier: 3 },

  // ---------------------------------------------------------------------
  // Consulting and analytics - the main non-engineering campus track, and
  // where business_analyst practice actually matters most.
  // ---------------------------------------------------------------------
  { role: "analyst", company: "deloitte", category: "consulting_analytics", tier: 1 },
  { role: "business_analyst", company: "deloitte", category: "consulting_analytics", tier: 1 },
  { role: "consultant", company: "deloitte", category: "consulting_analytics", tier: 2 },
  { role: "analyst", company: "pwc", category: "consulting_analytics", tier: 1 },
  { role: "data_analyst", company: "pwc", category: "consulting_analytics", tier: 2 },
  { role: "analyst", company: "ey", category: "consulting_analytics", tier: 1 },
  { role: "consultant", company: "ey", category: "consulting_analytics", tier: 2 },
  { role: "analyst", company: "kpmg", category: "consulting_analytics", tier: 2 },
  { role: "business_analyst", company: "zs_associates", category: "consulting_analytics", tier: 1 },
  { role: "data_analyst", company: "zs_associates", category: "consulting_analytics", tier: 2 },
  { role: "data_analyst", company: "mu_sigma", category: "consulting_analytics", tier: 2 },
  { role: "data_scientist", company: "fractal_analytics", category: "consulting_analytics", tier: 2 },
  { role: "data_analyst", company: "tiger_analytics", category: "consulting_analytics", tier: 3 },
  { role: "associate_consultant", company: "bain", category: "consulting_analytics", tier: 2 },
  { role: "business_analyst", company: "mckinsey", category: "consulting_analytics", tier: 2 },
  { role: "associate", company: "bcg", category: "consulting_analytics", tier: 2 },

  // ---------------------------------------------------------------------
  // Finance and fintech - heavy campus recruiters at the top engineering
  // colleges, for both engineering and quant tracks.
  // ---------------------------------------------------------------------
  { role: "sde", company: "goldman_sachs", category: "finance", tier: 1 },
  { role: "quant_analyst", company: "goldman_sachs", category: "finance", tier: 2 },
  { role: "sde", company: "jp_morgan", category: "finance", tier: 1 },
  { role: "data_analyst", company: "jp_morgan", category: "finance", tier: 2 },
  { role: "sde", company: "morgan_stanley", category: "finance", tier: 2 },
  { role: "sde", company: "barclays", category: "finance", tier: 2 },
  { role: "sde", company: "deutsche_bank", category: "finance", tier: 2 },
  { role: "quant_analyst", company: "ubs", category: "finance", tier: 2 },
  { role: "sde", company: "wells_fargo", category: "finance", tier: 3 },
  { role: "data_analyst", company: "american_express", category: "finance", tier: 2 },
  { role: "sde", company: "visa", category: "finance", tier: 3 },
  { role: "sde", company: "mastercard", category: "finance", tier: 3 },
  { role: "business_analyst", company: "hsbc", category: "finance", tier: 3 },
  { role: "data_analyst", company: "standard_chartered", category: "finance", tier: 3 },
  { role: "quant_analyst", company: "nomura", category: "finance", tier: 3 },

  // ---------------------------------------------------------------------
  // Core engineering - the mechanical/electrical/civil branches, entirely
  // unserved by the current bank.
  // ---------------------------------------------------------------------
  { role: "mechanical_engineer", company: "larsen_toubro", category: "core_engineering", tier: 1 },
  { role: "civil_engineer", company: "larsen_toubro", category: "core_engineering", tier: 2 },
  { role: "electrical_engineer", company: "siemens", category: "core_engineering", tier: 2 },
  { role: "embedded_engineer", company: "bosch", category: "core_engineering", tier: 1 },
  { role: "mechanical_engineer", company: "bosch", category: "core_engineering", tier: 2 },
  { role: "embedded_engineer", company: "honeywell", category: "core_engineering", tier: 2 },
  { role: "electrical_engineer", company: "abb", category: "core_engineering", tier: 3 },
  { role: "mechanical_engineer", company: "maruti_suzuki", category: "core_engineering", tier: 2 },
  { role: "mechanical_engineer", company: "tata_motors", category: "core_engineering", tier: 2 },
  { role: "mechanical_engineer", company: "mahindra", category: "core_engineering", tier: 3 },
  { role: "chemical_engineer", company: "reliance", category: "core_engineering", tier: 3 },
];

/** Distinct roles across the matrix. */
export function matrixRoles(): string[] {
  return Array.from(new Set(PLACEMENT_MATRIX.map((p) => p.role))).sort();
}

/** Distinct companies across the matrix. */
export function matrixCompanies(): string[] {
  return Array.from(new Set(PLACEMENT_MATRIX.map((p) => p.company))).sort();
}

/**
 * Pairings in generation order: tier 1 first, since those are the highest
 * campus-volume pairings and each generation run is slow and billable.
 */
export function pairingsByPriority(
  maxTier: 1 | 2 | 3 = 3,
  category?: PlacementCategory
): PlacementPairing[] {
  return PLACEMENT_MATRIX.filter(
    (p) => p.tier <= maxTier && (!category || p.category === category)
  ).sort((a, b) => a.tier - b.tier);
}
