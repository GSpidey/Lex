import type {
  JurisdictionResolver,
  JurisdictionResolution,
  UrgencyLevel,
} from "@lex/contracts";
import { serviceForPracticeArea } from "./catalog.js";

export interface WorkflowQuestion {
  key: string;
  label: string;
  type: "text" | "long_text" | "date" | "money" | "boolean" | "multi_select";
  required: boolean;
  options?: readonly string[];
  sensitive?: boolean;
}

export interface TenancyWorkflow {
  code: string;
  version: number;
  tenancyRole: "tenant" | "landlord";
  title: string;
  disclosure: string;
  questions: readonly WorkflowQuestion[];
  evidence: readonly string[];
  urgentAnswerKeys: readonly string[];
  issueTags: readonly string[];
  priceMinor: number;
  slaHours: number;
}

export const NIGERIA_STATES = [
  ["AB", "Abia"],
  ["AD", "Adamawa"],
  ["AK", "Akwa Ibom"],
  ["AN", "Anambra"],
  ["BA", "Bauchi"],
  ["BY", "Bayelsa"],
  ["BE", "Benue"],
  ["BO", "Borno"],
  ["CR", "Cross River"],
  ["DE", "Delta"],
  ["EB", "Ebonyi"],
  ["ED", "Edo"],
  ["EK", "Ekiti"],
  ["EN", "Enugu"],
  ["FC", "Federal Capital Territory"],
  ["GO", "Gombe"],
  ["IM", "Imo"],
  ["JI", "Jigawa"],
  ["KD", "Kaduna"],
  ["KN", "Kano"],
  ["KT", "Katsina"],
  ["KE", "Kebbi"],
  ["KO", "Kogi"],
  ["KW", "Kwara"],
  ["LA", "Lagos"],
  ["NA", "Nasarawa"],
  ["NI", "Niger"],
  ["OG", "Ogun"],
  ["ON", "Ondo"],
  ["OS", "Osun"],
  ["OY", "Oyo"],
  ["PL", "Plateau"],
  ["RI", "Rivers"],
  ["SO", "Sokoto"],
  ["TA", "Taraba"],
  ["YO", "Yobe"],
  ["ZA", "Zamfara"],
] as const;

const commonQuestions: readonly WorkflowQuestion[] = [
  {
    key: "property_address",
    label: "What is the full address of the rented property?",
    type: "text",
    required: true,
    sensitive: true,
  },
  {
    key: "tenancy_written",
    label: "Is there a written tenancy agreement?",
    type: "boolean",
    required: true,
  },
  {
    key: "tenancy_start",
    label: "When did the tenancy begin?",
    type: "date",
    required: true,
  },
  {
    key: "rent_amount",
    label: "What is the rent amount?",
    type: "money",
    required: true,
    sensitive: true,
  },
  {
    key: "rent_frequency",
    label: "How often is rent due?",
    type: "multi_select",
    required: true,
    options: ["monthly", "quarterly", "yearly", "other"],
  },
  {
    key: "last_payment",
    label: "When was rent last paid?",
    type: "date",
    required: false,
    sensitive: true,
  },
  {
    key: "notice_received",
    label: "Has any written notice or court document been received?",
    type: "boolean",
    required: true,
  },
  {
    key: "court_order",
    label: "Is there a court order relating to the property?",
    type: "boolean",
    required: true,
  },
  {
    key: "opposing_party",
    label: "Who is the other party?",
    type: "text",
    required: true,
    sensitive: true,
  },
  {
    key: "timeline",
    label: "Describe the important events in date order.",
    type: "long_text",
    required: true,
    sensitive: true,
  },
  {
    key: "desired_outcome",
    label: "What outcome are you seeking?",
    type: "long_text",
    required: true,
  },
];

export const TENANT_WORKFLOW: TenancyWorkflow = {
  code: "ng-la-tenancy-tenant-assessment",
  version: 1,
  tenancyRole: "tenant",
  title: "Lagos tenant tenancy assessment",
  disclosure:
    "Lex gathers information and connects you with a verified lawyer. Automated intake is not legal advice. Urgent flags are reviewed by people but Lex is not an emergency service.",
  questions: [
    ...commonQuestions,
    {
      key: "tenant_issue",
      label: "What problem are you facing?",
      type: "multi_select",
      required: true,
      options: [
        "eviction_notice",
        "lockout",
        "rent_dispute",
        "deposit",
        "repairs",
        "harassment",
        "utilities",
        "other",
      ],
    },
    {
      key: "locked_out",
      label: "Are you currently locked out of the property?",
      type: "boolean",
      required: true,
    },
    {
      key: "belongings_inside",
      label: "Are your belongings still inside?",
      type: "boolean",
      required: false,
    },
    {
      key: "utilities_cut",
      label: "Have essential utilities been deliberately disconnected?",
      type: "boolean",
      required: true,
    },
    {
      key: "threats_or_violence",
      label: "Are there threats of violence or immediate safety concerns?",
      type: "boolean",
      required: true,
      sensitive: true,
    },
    {
      key: "deposit_amount",
      label: "What deposit was paid?",
      type: "money",
      required: false,
      sensitive: true,
    },
  ],
  evidence: [
    "tenancy agreement",
    "payment receipts",
    "notices or court papers",
    "messages",
    "photos or videos",
    "deposit evidence",
  ],
  urgentAnswerKeys: ["locked_out", "utilities_cut", "threats_or_violence"],
  issueTags: [
    "eviction",
    "lockout",
    "rent",
    "deposit",
    "repairs",
    "harassment",
    "utilities",
  ],
  priceMinor: 1_000_000,
  slaHours: 48,
};

export const LANDLORD_WORKFLOW: TenancyWorkflow = {
  code: "ng-la-tenancy-landlord-assessment",
  version: 1,
  tenancyRole: "landlord",
  title: "Lagos landlord tenancy assessment",
  disclosure:
    "Lex gathers information and connects you with a verified lawyer. Automated intake is not legal advice. Do not take self-help eviction action based on automated content.",
  questions: [
    ...commonQuestions,
    {
      key: "landlord_issue",
      label: "What problem are you facing?",
      type: "multi_select",
      required: true,
      options: [
        "rent_arrears",
        "lease_breach",
        "property_damage",
        "notice",
        "possession",
        "deposit",
        "other",
      ],
    },
    {
      key: "arrears_amount",
      label: "What amount is currently unpaid?",
      type: "money",
      required: false,
      sensitive: true,
    },
    {
      key: "breach_details",
      label: "Describe any alleged tenancy breach.",
      type: "long_text",
      required: false,
      sensitive: true,
    },
    {
      key: "possession_urgent",
      label: "Is there an immediate safety or serious property-damage concern?",
      type: "boolean",
      required: true,
    },
    {
      key: "self_help_action",
      label: "Have locks, utilities, or access already been changed?",
      type: "boolean",
      required: true,
    },
  ],
  evidence: [
    "tenancy agreement",
    "rent ledger",
    "payment records",
    "notices",
    "messages",
    "inspection photos",
    "repair estimates",
  ],
  urgentAnswerKeys: ["possession_urgent", "self_help_action"],
  issueTags: ["arrears", "breach", "damage", "notice", "possession", "deposit"],
  priceMinor: 1_000_000,
  slaHours: 48,
};

export function workflowFor(role: "tenant" | "landlord"): TenancyWorkflow {
  return role === "tenant" ? TENANT_WORKFLOW : LANDLORD_WORKFLOW;
}

export function calculateUrgency(
  role: "tenant" | "landlord",
  answers: Record<string, unknown>,
): UrgencyLevel {
  const workflow = workflowFor(role);
  const urgent = workflow.urgentAnswerKeys.some((key) => answers[key] === true);
  const critical = answers["threats_or_violence"] === true;
  return critical ? "critical_human_review" : urgent ? "urgent" : "standard";
}

export class NigeriaJurisdictionResolver implements JurisdictionResolver {
  resolve(input: {
    countryCode: string;
    stateCode: string;
    practiceAreaCode: string;
    serviceCode?: string;
    issueRole?: string;
    issueTags?: string[];
  }): JurisdictionResolution {
    if (input.countryCode.toUpperCase() !== "NG")
      throw new Error("Only Nigeria is configured");
    const stateCode = input.stateCode.toUpperCase();
    if (!NIGERIA_STATES.some(([code]) => code === stateCode))
      throw new Error("Unknown Nigerian state code");
    const service = serviceForPracticeArea(input.practiceAreaCode);
    return {
      countryCode: "NG",
      stateCode,
      status: "active",
      serviceCode: input.serviceCode ?? service.code,
      version: service.version,
      priceMinor: service.priceMinor,
      slaHours: service.slaHours,
      urgency: "standard",
    };
  }
}
