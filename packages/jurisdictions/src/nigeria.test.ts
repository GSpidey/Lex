import { describe, expect, it } from "vitest";
import { calculateUrgency, NigeriaJurisdictionResolver, workflowFor } from "./nigeria.js";

describe("Nigeria jurisdiction package", () => {
  const resolver = new NigeriaJurisdictionResolver();

  it("activates Lagos and keeps other states intake-only", () => {
    expect(resolver.resolve({ countryCode: "NG", stateCode: "LA", tenancyRole: "tenant" }).status).toBe("active");
    expect(resolver.resolve({ countryCode: "NG", stateCode: "FC", tenancyRole: "tenant" }).status).toBe("intake_only");
  });

  it("keeps tenant and landlord workflows separate", () => {
    expect(workflowFor("tenant").code).not.toBe(workflowFor("landlord").code);
  });

  it("escalates lockouts and threats", () => {
    expect(calculateUrgency("tenant", { locked_out: true })).toBe("urgent");
    expect(calculateUrgency("tenant", { threats_or_violence: true })).toBe("critical_human_review");
  });
});
