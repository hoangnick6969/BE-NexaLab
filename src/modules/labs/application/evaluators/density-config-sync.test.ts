import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DENSITY_INSTRUMENTS, DENSITY_SPECIMENS, DENSITY_TOLERANCES } from "../../../../../packages/sim";

/**
 * Single source of truth check (plan §5.7): the BE model table is authoritative,
 * and the FE sample config must agree with it. The FE file is read from the sibling
 * repository in this workspace; without it the check is skipped, not faked.
 */
const feConfigPath = resolve(__dirname, "../../../../../../FE-NexaLab/src/features/labs/physics/fluid/density/fl03-density.config.ts");
const feAvailable = existsSync(feConfigPath);

describe.skipIf(!feAvailable)("FL-03 BE model and FE sample config stay in sync", () => {
  it("imports the FE config and checks its schema", async () => {
    const { fl03DensityConfig } = await import(feConfigPath);
    expect(fl03DensityConfig.reviewStatus).toBe("PROPOSED_UNAPPROVED");
    expect(fl03DensityConfig.specimens.map((item: { id: string }) => item.id).sort()).toEqual(Object.keys(DENSITY_SPECIMENS).sort());
  });

  it("agrees on instruments, tolerances and every specimen's mass, size and reference density", async () => {
    const { fl03DensityConfig } = await import(feConfigPath);
    const { balance, cylinder, beaker } = fl03DensityConfig.instruments;
    expect(balance).toEqual({ capacityG: DENSITY_INSTRUMENTS.balance.capacityG, resolutionG: DENSITY_INSTRUMENTS.balance.resolutionG });
    expect(cylinder).toMatchObject({ capacityMl: DENSITY_INSTRUMENTS.cylinder.capacityMl, resolutionMl: DENSITY_INSTRUMENTS.cylinder.resolutionMl });
    expect(beaker.emptyMassG).toBe(DENSITY_INSTRUMENTS.cupEmptyMassG);
    expect(fl03DensityConfig.tolerances).toEqual({
      readingDivisions: DENSITY_TOLERANCES.readingDivisions,
      relativeCalculation: DENSITY_TOLERANCES.relativeCalculation,
      referenceBand: DENSITY_TOLERANCES.referenceBand,
    });
    const materials = new Map(fl03DensityConfig.materials.map((item: { id: string; referenceDensityGcm3: number }) => [item.id, item]));
    for (const specimen of fl03DensityConfig.specimens as Array<{ id: string; materialId: string; massG: number; shape: string; sizeMm?: number[]; volumeMl?: number }>) {
      const model = (DENSITY_SPECIMENS as Record<string, { massG: number; referenceGcm3: number; sizeMm?: readonly number[]; volumeMl?: number }>)[specimen.id];
      expect(model, specimen.id).toBeDefined();
      expect(specimen.massG, specimen.id).toBe(model.massG);
      if (specimen.shape === "box") expect(specimen.sizeMm, specimen.id).toEqual([...model.sizeMm!]);
      else expect(specimen.volumeMl, specimen.id).toBe(model.volumeMl);
      expect((materials.get(specimen.materialId) as { referenceDensityGcm3: number }).referenceDensityGcm3, specimen.id).toBe(model.referenceGcm3);
    }
  });
});
