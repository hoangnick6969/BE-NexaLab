import { describe, it, expect } from "vitest";
import { circuit } from "./index";

const makeCircuit = (resistance = 350, closed = true, hasCompleteLoop = true) => ({
  nodes: [
    { id: "b", type: "battery" as const, value: 9 },
    { id: "l", type: "led" as const },
    { id: "r", type: "resistor" as const, value: resistance },
    { id: "s", type: "switch" as const, closed },
  ],
  edges: hasCompleteLoop
    ? [
        { source: "b", target: "l" },
        { source: "l", target: "r" },
        { source: "r", target: "s" },
        { source: "s", target: "b" },
      ]
    : [
        { source: "b", target: "l" },
        { source: "l", target: "r" },
      ],
});

describe("Epic A4 Acceptance Checklist Verification", () => {
  it("Ca 1: Mạch hở hoặc ngắt mạch -> 0 mA, OPEN_CIRCUIT, verdict = needs_practice/not_passed", () => {
    // 1a. Thiếu dây dẫn (Open circuit)
    const openWire = makeCircuit(350, true, false);
    const resultWire = circuit(openWire);
    expect(resultWire.current).toBe(0);
    expect(resultWire.status).toBe("OPEN_CIRCUIT");
    expect(resultWire.ledState).toBe("OFF");

    // 1b. Công tắc mở (Switch open)
    const openSwitch = makeCircuit(350, false, true);
    const resultSwitch = circuit(openSwitch);
    expect(resultSwitch.current).toBe(0);
    expect(resultSwitch.status).toBe("SWITCH_OPEN");
    expect(resultSwitch.ledState).toBe("OFF");
  });

  it("Ca 2: Mạch quá dòng (R = 330Ω) -> Dòng > 20 mA, LED_OVERLOAD, verdict = partial", () => {
    const overload = makeCircuit(330, true, true);
    const result = circuit(overload);
    // I = (9V - 2V) / 330Ω ≈ 21.212 mA > 20 mA
    expect(result.current).toBeGreaterThan(0.02);
    expect(result.status).toBe("LED_OVERLOAD");
    expect(result.verdict).toBe("partial");
  });

  it("Ca 3: Mạch chuẩn an toàn (R = 350Ω - 470Ω) -> Dòng 14mA - 20mA, LED ON, verdict = passed", () => {
    // 3a. Ngưỡng chuẩn 350Ω -> đúng 20mA
    const borderSafe = makeCircuit(350, true, true);
    const resBorder = circuit(borderSafe);
    expect(resBorder.current).toBe(0.02);
    expect(resBorder.ledState).toBe("ON");
    expect(resBorder.verdict).toBe("passed");

    // 3b. Mức an toàn khuyến nghị 470Ω -> 14.89mA
    const safeCircuit = makeCircuit(470, true, true);
    const resSafe = circuit(safeCircuit);
    expect(resSafe.current).toBeCloseTo(0.01489, 4);
    expect(resSafe.ledState).toBe("ON");
    expect(resSafe.verdict).toBe("passed");
  });

  it("Ca 4: Tính tất định & Bảo toàn cấu hình mạch khi Thử lại (Zero State Loss)", () => {
    const studentCircuit = makeCircuit(330, true, true);
    const run1 = circuit(studentCircuit);
    const run2 = circuit(studentCircuit);

    // Tính tất định: cùng input phải cho cùng output
    expect(run1).toEqual(run2);

    // Cấu hình ban đầu của học sinh không bị biến dạng
    expect(studentCircuit.nodes.length).toBe(4);
    expect(studentCircuit.edges.length).toBe(4);
  });
});
