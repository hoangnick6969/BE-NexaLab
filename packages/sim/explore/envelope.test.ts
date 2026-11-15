import { describe, expect, it } from "vitest";
import { exploreLabEnvelopeSchema, observationPromptSchema } from "./envelope";

describe("Explore envelope", () => {
  it("accepts a bench with its own apparatus and measurement kinds", () => {
    const config = {
      schema: "lever-lab-config/1", labId: "lever-explore", catalogId: "FL-06", configVersion: 1,
      kit: "mechanics@1", engine: "lever-bench@1.0.0", title: "Đòn bẩy",
      outcomeSummary: ["Quan sát mômen lực."],
      safetyBriefing: { simulation: ["Thử đặt tải trên bàn."], realLab: ["Cố định đòn bẩy."], acknowledgeRequired: true },
      limitations: [], modes: { explore: true }, enabledApparatus: [{ id: "ruler", kind: "ruler", slot: "bench" }],
      measurements: ["distance"], pedagogy: { observationPrompts: [{ id: "p1", kind: "note", textVi: "Đo khoảng cách." }] },
      review: { status: "draft" },
    };
    expect(exploreLabEnvelopeSchema.parse(config)).toEqual(config);
  });

  it("leaves prompt triggers to the individual bench schema", () => {
    expect(observationPromptSchema.safeParse({ id: "p1", kind: "note", textVi: "Đo pH.", highlightWhen: { measurement: "ph_meter" } }).success).toBe(false);
  });
});
