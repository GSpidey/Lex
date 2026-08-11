import { describe, expect, it } from "vitest";
import {
  assertMatterTransition,
  canTransitionMatter,
} from "./state-machine.js";

describe("matter state machine", () => {
  it("allows the approved paid workflow", () => {
    expect(canTransitionMatter("conflict_review", "awaiting_payment")).toBe(
      true,
    );
    expect(
      canTransitionMatter("awaiting_payment", "consultation_scheduled"),
    ).toBe(true);
  });

  it("prevents payment before lawyer conflict acceptance", () => {
    expect(canTransitionMatter("matching", "awaiting_payment")).toBe(false);
    expect(() =>
      assertMatterTransition("matching", "awaiting_payment"),
    ).toThrow("Invalid matter transition");
  });
});
