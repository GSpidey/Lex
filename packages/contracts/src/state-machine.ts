import type { MatterState } from "./enums.js";

const transitions: Readonly<Record<MatterState, readonly MatterState[]>> = {
  intake_draft: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: ["submitted", "intake_draft", "cancelled"],
  submitted: ["intake_only", "matching", "cancelled"],
  intake_only: ["matching", "cancelled"],
  matching: ["lawyer_selected", "cancelled"],
  lawyer_selected: ["conflict_review", "matching", "cancelled"],
  conflict_review: ["awaiting_payment", "matching", "cancelled"],
  awaiting_payment: ["active", "matching", "cancelled"],
  active: ["awaiting_client", "lawyer_review", "reassignment_requested", "refund_requested", "cancelled"],
  awaiting_client: ["active", "lawyer_review", "reassignment_requested", "refund_requested", "cancelled"],
  lawyer_review: ["delivered", "awaiting_client", "reassignment_requested", "refund_requested"],
  delivered: ["closed", "reassignment_requested", "refund_requested"],
  closed: [],
  cancelled: [],
  reassignment_requested: ["matching", "refund_requested", "cancelled"],
  refund_requested: ["refunded", "active", "cancelled"],
  refunded: ["closed"],
};

export function canTransitionMatter(from: MatterState, to: MatterState): boolean {
  return transitions[from].includes(to);
}

export function assertMatterTransition(from: MatterState, to: MatterState): void {
  if (!canTransitionMatter(from, to)) throw new Error(`Invalid matter transition: ${from} -> ${to}`);
}

export function allowedMatterTransitions(from: MatterState): readonly MatterState[] {
  return transitions[from];
}
