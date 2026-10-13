import type { MatterState, RepresentationState } from "./enums.js";

const matterTransitions: Readonly<Record<MatterState, readonly MatterState[]>> =
  {
    intake_draft: [
      "awaiting_confirmation",
      "guardian_pending",
      "authority_review",
      "cancelled",
    ],
    awaiting_confirmation: [
      "submitted",
      "guardian_pending",
      "authority_review",
      "intake_draft",
      "cancelled",
    ],
    guardian_pending: [
      "awaiting_confirmation",
      "urgent_operations_review",
      "cancelled",
    ],
    authority_review: ["awaiting_confirmation", "submitted", "cancelled"],
    submitted: [
      "intake_only",
      "urgent_operations_review",
      "matching",
      "matching_assistance",
      "cancelled",
    ],
    intake_only: ["matching", "matching_assistance", "cancelled"],
    urgent_operations_review: ["matching", "matching_assistance", "cancelled"],
    matching: ["lawyer_selected", "matching_assistance", "cancelled"],
    matching_assistance: ["matching", "lawyer_selected", "cancelled"],
    lawyer_selected: [
      "conflict_review",
      "matching",
      "matching_assistance",
      "cancelled",
    ],
    conflict_review: [
      "awaiting_payment",
      "matching",
      "matching_assistance",
      "cancelled",
    ],
    awaiting_payment: ["consultation_scheduled", "matching", "cancelled"],
    consultation_scheduled: [
      "consultation_active",
      "awaiting_client",
      "reassignment_requested",
      "refund_requested",
      "cancelled",
    ],
    consultation_active: [
      "awaiting_client",
      "lawyer_review",
      "reassignment_requested",
      "refund_requested",
      "cancelled",
    ],
    awaiting_client: [
      "consultation_active",
      "lawyer_review",
      "reassignment_requested",
      "refund_requested",
      "cancelled",
    ],
    lawyer_review: [
      "delivered",
      "awaiting_client",
      "reassignment_requested",
      "refund_requested",
    ],
    delivered: [
      "closed",
      "representation_proposed",
      "reassignment_requested",
      "refund_requested",
    ],
    representation_proposed: ["closed", "cancelled"],
    closed: [],
    cancelled: [],
    reassignment_requested: [
      "matching",
      "matching_assistance",
      "refund_requested",
      "cancelled",
    ],
    refund_requested: ["refunded", "consultation_active", "cancelled"],
    refunded: ["closed"],
  };

const representationTransitions: Readonly<
  Record<RepresentationState, readonly RepresentationState[]>
> = {
  proposal_draft: ["offered", "terminated"],
  offered: ["accepted", "terminated"],
  accepted: ["conflict_reconfirmed", "terminated"],
  conflict_reconfirmed: ["awaiting_invoice_payment", "active", "terminated"],
  awaiting_invoice_payment: ["active", "disputed", "terminated"],
  active: [
    "milestone_in_progress",
    "awaiting_client",
    "completed",
    "terminated",
    "disputed",
  ],
  milestone_in_progress: [
    "active",
    "awaiting_client",
    "completed",
    "terminated",
    "disputed",
  ],
  awaiting_client: [
    "active",
    "milestone_in_progress",
    "terminated",
    "disputed",
  ],
  completed: ["disputed", "refunded"],
  terminated: ["disputed", "refunded"],
  disputed: ["active", "terminated", "refunded"],
  refunded: [],
};

export function canTransitionMatter(
  from: MatterState,
  to: MatterState,
): boolean {
  return matterTransitions[from].includes(to);
}
export function assertMatterTransition(
  from: MatterState,
  to: MatterState,
): void {
  if (!canTransitionMatter(from, to))
    throw new Error(`Invalid matter transition: ${from} -> ${to}`);
}
export function allowedMatterTransitions(
  from: MatterState,
): readonly MatterState[] {
  return matterTransitions[from];
}
export function canTransitionRepresentation(
  from: RepresentationState,
  to: RepresentationState,
): boolean {
  return representationTransitions[from].includes(to);
}
export function assertRepresentationTransition(
  from: RepresentationState,
  to: RepresentationState,
): void {
  if (!canTransitionRepresentation(from, to))
    throw new Error(`Invalid representation transition: ${from} -> ${to}`);
}
