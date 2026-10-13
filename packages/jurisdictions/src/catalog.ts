import type { SupportedLanguage, UrgencyLevel } from "@lex/contracts";
import type { WorkflowQuestion } from "./nigeria.js";

export interface PracticeArea {
  code: string;
  group: string;
  name: string;
  description: string;
  urgent: boolean;
  keywords: readonly string[];
}

export interface LegalServiceVersion {
  id: string;
  code: string;
  version: number;
  practiceAreaCode: string;
  title: string;
  disclosure: string;
  status: "published";
  supportedLanguages: readonly SupportedLanguage[];
  questions: readonly WorkflowQuestion[];
  evidence: readonly string[];
  urgentAnswerKeys: readonly string[];
  priceMinor: number;
  slaHours: number;
  lawyerApprovalStatus: "pending" | "approved";
}

const area = (
  group: string,
  code: string,
  name: string,
  urgent = false,
  keywords: string[] = [],
): PracticeArea => ({
  group,
  code,
  name,
  urgent,
  keywords,
  description: `${name} intake, verified-lawyer consultation and written assessment.`,
});

export const PRACTICE_AREAS: readonly PracticeArea[] = [
  area("Crime and safety", "criminal-defence", "Criminal defence", true, [
    "charge",
    "trial",
    "arrest",
  ]),
  area(
    "Crime and safety",
    "police-detention-bail",
    "Police, detention and bail",
    true,
    ["police", "custody", "bail"],
  ),
  area(
    "Crime and safety",
    "cybercrime-digital-fraud",
    "Cybercrime and digital fraud",
    true,
    ["scam", "fraud", "online"],
  ),
  area(
    "Family and protection",
    "domestic-violence-protection",
    "Domestic violence and protection",
    true,
    ["abuse", "violence", "protection"],
  ),
  area("Family and protection", "divorce-separation", "Divorce and separation"),
  area(
    "Family and protection",
    "custody-child-support",
    "Custody and child support",
    true,
  ),
  area(
    "Family and protection",
    "adoption-guardianship",
    "Adoption and guardianship",
  ),
  area(
    "Estates",
    "wills-probate-estates",
    "Wills, probate and estate administration",
  ),
  area("Estates", "succession", "Succession"),
  area("Property", "tenancy", "Tenancy", true, [
    "rent",
    "eviction",
    "landlord",
    "tenant",
  ]),
  area("Property", "land-title", "Land title"),
  area("Property", "conveyancing", "Conveyancing"),
  area("Property", "real-estate-transactions", "Real-estate transactions"),
  area("Property", "property-disputes", "Property disputes"),
  area("Work", "employment", "Employment"),
  area("Work", "labour-trade-unions", "Labour and trade unions"),
  area(
    "Work",
    "workplace-discrimination-harassment",
    "Workplace discrimination and harassment",
    true,
  ),
  area(
    "Business",
    "corporate-governance",
    "Corporate formation and governance",
  ),
  area("Business", "startups-smes", "Startups and SMEs"),
  area(
    "Business",
    "regulatory-compliance-licensing",
    "Regulatory compliance and licensing",
  ),
  area("Business", "commercial-contracts", "Commercial contracts"),
  area("Business", "debt-recovery", "Debt recovery"),
  area("Business", "insolvency-restructuring", "Insolvency and restructuring"),
  area("Finance", "tax", "Tax"),
  area("Finance", "banking-fintech", "Banking and fintech"),
  area("Finance", "insurance", "Insurance"),
  area("People and claims", "consumer-protection", "Consumer protection"),
  area("People and claims", "personal-injury", "Personal injury", true),
  area("People and claims", "medical-negligence", "Medical negligence", true),
  area("People and claims", "civil-claims", "Civil claims"),
  area("People and claims", "defamation-media", "Defamation and media"),
  area("Public rights", "human-rights", "Human rights", true),
  area("Public rights", "constitutional-law", "Constitutional law"),
  area(
    "Public rights",
    "public-administrative-law",
    "Public and administrative law",
  ),
  area("Mobility", "immigration-citizenship", "Immigration and citizenship"),
  area("Ideas and technology", "trademarks", "Trademarks"),
  area("Ideas and technology", "copyright", "Copyright"),
  area(
    "Ideas and technology",
    "patents-ip",
    "Patents and other intellectual property",
  ),
  area(
    "Ideas and technology",
    "technology-privacy-data",
    "Technology, privacy and data protection",
  ),
  area("Sectors", "education", "Education"),
  area("Sectors", "environmental-law", "Environmental law"),
  area("Sectors", "energy-oil-gas-mining", "Energy, oil, gas and mining"),
  area(
    "Sectors",
    "maritime-aviation-transport",
    "Maritime, aviation and transport",
  ),
  area(
    "Public life",
    "election-political-law",
    "Election and political law",
    true,
  ),
  area(
    "Organizations",
    "ngos-charities-associations",
    "NGOs, charities and associations",
  ),
  area(
    "Professional",
    "professional-disciplinary",
    "Professional and disciplinary matters",
  ),
  area(
    "Resolution",
    "arbitration-mediation-adr",
    "Arbitration, mediation and other ADR",
  ),
  area("Resolution", "appeals", "Appeals", true),
  area("Resolution", "judgment-enforcement", "Judgment enforcement"),
  area("Resolution", "cross-border", "Cross-border matters"),
  area("Help me classify", "not-sure", "Not sure", false, ["help", "classify"]),
  area("Help me classify", "other", "Other"),
] as const;

export const CORE_INTAKE_QUESTIONS: readonly WorkflowQuestion[] = [
  {
    key: "issue_summary",
    label: "Briefly describe the legal issue.",
    type: "long_text",
    required: true,
    sensitive: true,
  },
  {
    key: "parties",
    label: "Who are the people or organisations involved?",
    type: "long_text",
    required: true,
    sensitive: true,
  },
  {
    key: "timeline",
    label: "What happened, and when?",
    type: "long_text",
    required: true,
    sensitive: true,
  },
  {
    key: "desired_outcome",
    label: "What would you like the lawyer to help you achieve?",
    type: "long_text",
    required: true,
  },
  {
    key: "court_or_agency_deadline",
    label:
      "Is there a court, police, regulator, employer or other stated deadline?",
    type: "boolean",
    required: true,
  },
  {
    key: "immediate_safety_risk",
    label:
      "Is anyone in immediate danger, detained, displaced, or at risk of serious harm?",
    type: "boolean",
    required: true,
    sensitive: true,
  },
  {
    key: "minor_involved",
    label: "Is a child involved in this matter?",
    type: "boolean",
    required: true,
    sensitive: true,
  },
  {
    key: "documents_available",
    label:
      "Do you have documents, notices, messages, recordings or photographs?",
    type: "boolean",
    required: true,
  },
];

const CATEGORY_ADDENDA: Readonly<Record<string, readonly WorkflowQuestion[]>> =
  {
    "criminal-defence": [
      {
        key: "custody_status",
        label: "Is anyone currently arrested or detained?",
        type: "boolean",
        required: true,
        sensitive: true,
      },
      {
        key: "charge_or_station",
        label: "What charge, allegation, station or agency is involved?",
        type: "text",
        required: false,
        sensitive: true,
      },
    ],
    "domestic-violence-protection": [
      {
        key: "safe_to_contact",
        label: "Is it safe for Lex to contact you on this device?",
        type: "boolean",
        required: true,
        sensitive: true,
      },
      {
        key: "safe_channel",
        label: "Which communication method is safest?",
        type: "multi_select",
        required: true,
        options: ["app", "whatsapp", "email"],
      },
    ],
    employment: [
      {
        key: "employment_status",
        label: "Are you employed, suspended, dismissed, or applying for work?",
        type: "multi_select",
        required: true,
        options: ["employed", "suspended", "dismissed", "applicant", "other"],
      },
    ],
  };

export function practiceAreaByCode(code: string): PracticeArea | undefined {
  return PRACTICE_AREAS.find((item) => item.code === code);
}

export function serviceForPracticeArea(code: string): LegalServiceVersion {
  const practiceArea = practiceAreaByCode(code);
  if (!practiceArea) throw new Error(`Unknown practice area: ${code}`);
  return {
    id: `service-ng-${code}-v1`,
    code: `ng-${code}-consult-assess`,
    version: 1,
    practiceAreaCode: code,
    title: `${practiceArea.name}: consultation and assessment`,
    status: "published",
    disclosure:
      "Lex organizes confirmed facts and connects eligible clients with verified lawyers. Automated intake is not legal advice, and urgent matters are reviewed by people before matching or payment.",
    supportedLanguages: ["en", "pcm", "ha", "yo", "ig"],
    questions: [...CORE_INTAKE_QUESTIONS, ...(CATEGORY_ADDENDA[code] ?? [])],
    evidence: [
      "agreements or official documents",
      "notices or correspondence",
      "receipts or transaction records",
      "images, audio or other supporting evidence",
    ],
    urgentAnswerKeys: [
      "immediate_safety_risk",
      "court_or_agency_deadline",
      ...(practiceArea.urgent ? ["category_urgent"] : []),
    ],
    priceMinor: 1_000_000,
    slaHours: 48,
    lawyerApprovalStatus: "pending",
  };
}

export function classifyUrgency(
  code: string,
  answers: Record<string, unknown>,
): UrgencyLevel {
  const critical =
    answers.immediate_safety_risk === true || answers.custody_status === true;
  const urgent =
    critical ||
    answers.court_or_agency_deadline === true ||
    practiceAreaByCode(code)?.urgent === true;
  return critical ? "critical_human_review" : urgent ? "urgent" : "standard";
}
