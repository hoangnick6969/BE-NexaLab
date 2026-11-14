import { createHash } from "node:crypto";
import { stableStringify } from "../../../common/idempotency";

/**
 * SAI-01 `tutor-rules@1`: versioned 4-level hints for the legacy Labs (circuit, chemistry, eye).
 * Level 1 observation question, 2 concept, 3 action, 4 explanation grounded in engine numbers.
 * Each (key, level) has variants a/b; `a` is the pre-SAI-01 text. A pinned-digest test fails when any
 * text changes without bumping TUTOR_RULES. Wording never labels the student (no "em hiểu sai").
 */
export const TUTOR_RULES = "tutor-rules@1";

export type TutorKey = "OPEN_CIRCUIT" | "SWITCH_OPEN" | "LED_OVERLOAD" | "NO_LED" | "LOW_CURRENT" | "CHEMISTRY" | "CHEMISTRY_PH" | "EYE";
export type TutorLevel = 1 | 2 | 3 | 4;
/** `{minimumResistance}`, `{extent}` and `{limiting}` are filled from the stored engine result only. */
type Variants = readonly [string, string];

export const TUTOR_TEMPLATES: Readonly<Record<TutorKey, readonly [Variants, Variants, Variants, Variants]>> = {
  OPEN_CIRCUIT: [
    ["Em có lần theo được một vòng dây kín từ nguồn rồi quay về nguồn không?",
      "Bắt đầu từ một cực của nguồn, đi theo dây nối: em có quay lại được cực kia của nguồn không?"],
    ["Dòng điện cần một đường dẫn khép kín.",
      "Chỉ khi các linh kiện nối thành một vòng liền từ nguồn về nguồn thì mới có dòng điện."],
    ["Thử nối các đầu còn rời thành một vòng chứa nguồn, LED và điện trở.",
      "Tìm đầu dây hoặc linh kiện còn chưa được nối, rồi nối chúng để khép vòng qua nguồn, LED và điện trở."],
    ["Mạch hở không có dòng điện. Hãy kiểm tra dây nối, sau đó chạy lại để engine xác nhận.",
      "Engine không tìm thấy vòng kín nào đi qua nguồn, nên dòng điện bằng không. Khép kín mạch rồi chạy lại để kiểm tra."],
  ],
  SWITCH_OPEN: [
    ["Công tắc hiện đang ở trạng thái nào?",
      "Nhìn vào công tắc trên mạch: nó đang đóng hay mở?"],
    ["Công tắc mở làm ngắt đường đi của dòng điện.",
      "Một công tắc mở trên nhánh giống như một chỗ đứt dây."],
    ["Thử đóng công tắc rồi chạy lại.",
      "Đóng công tắc nằm trên nhánh có LED, sau đó chạy lại mạch."],
    ["Mạch chỉ dẫn điện khi có đường khép kín và mọi công tắc trên nhánh đều đóng.",
      "Engine thấy vòng dây đã kín nhưng có công tắc mở trên mọi nhánh, nên không có dòng điện."],
  ],
  LED_OVERLOAD: [
    ["Dòng điện engine trả về có vượt giới hạn 20 mA không?",
      "So sánh dòng điện qua LED với giới hạn an toàn của LED trong mô hình: dòng đang lớn hơn hay nhỏ hơn?"],
    ["Khi giữ nguyên điện áp, tăng điện trở sẽ làm dòng điện giảm.",
      "Điện trở mắc nối tiếp với LED giúp hạn chế dòng điện đi qua LED."],
    ["Thử thêm hoặc tăng điện trở trên nhánh LED rồi chạy lại.",
      "Trên nhánh có LED, hãy thêm một điện trở hoặc chọn điện trở lớn hơn, sau đó chạy lại."],
    ["Engine dùng I = (U − 2 V × số LED) / R. Với một LED, điện trở tối thiểu do engine tính là {minimumResistance} Ω. Nhánh không có điện trở được đánh dấu quá dòng, không gán dòng hữu hạn giả.",
      "Theo engine, với một LED cần điện trở ít nhất {minimumResistance} Ω để dòng không vượt 20 mA, vì I = (U − 2 V × số LED) / R. Nhánh không có điện trở luôn bị coi là quá dòng."],
  ],
  NO_LED: [
    ["Trong vòng kín hiện có LED chưa?",
      "Vòng dây kín của em đang đi qua những linh kiện nào?"],
    ["Chỉ linh kiện nằm trên đường dẫn kín mới tham gia thí nghiệm.",
      "Một LED đặt ngoài vòng kín sẽ không có dòng điện chạy qua."],
    ["Thử đưa LED vào cùng vòng dây với nguồn và điện trở.",
      "Nối LED vào vòng kín, mắc nối tiếp với điện trở, rồi chạy lại."],
    ["Mục tiêu yêu cầu LED sáng. Vòng kín chỉ có điện trở chưa đáp ứng mục tiêu.",
      "Engine thấy có vòng kín nhưng không có LED nào trong đó, nên mục tiêu làm LED sáng chưa được đáp ứng."],
  ],
  LOW_CURRENT: [
    ["Điện áp nguồn và số LED có phù hợp với nhau không?",
      "Mỗi LED cần một phần điện áp để sáng: nguồn của em có đủ cho số LED đang mắc không?"],
    ["LED cần đủ điện áp thuận và dòng tối thiểu trong mô hình.",
      "Nếu dòng điện quá nhỏ, LED không sáng dù mạch đã kín."],
    ["Thử điều chỉnh điện áp hoặc giảm điện trở trong giới hạn an toàn.",
      "Thử bớt LED trên một nhánh, tăng điện áp nguồn hoặc giảm điện trở, nhưng vẫn giữ dòng dưới giới hạn an toàn."],
    ["Mô hình dùng sụt áp 2 V mỗi LED và ngưỡng sáng 1 mA. Engine đánh giá các ngưỡng này trên từng nhánh.",
      "Trong mô hình, mỗi LED lấy 2 V và cần ít nhất 1 mA để sáng; engine kiểm tra hai ngưỡng này cho từng nhánh."],
  ],
  CHEMISTRY: [
    ["Em quan sát thấy chất nào còn dư?",
      "Sau phản ứng, chất nào vẫn còn lại trong cốc?"],
    ["Hệ số phương trình cho biết tỉ lệ số mol phản ứng.",
      "Các chất phản ứng với nhau theo đúng tỉ lệ hệ số trong phương trình hoá học."],
    ["Thử thay đổi lượng chất để tỉ lệ mol khớp hệ số phương trình.",
      "Điều chỉnh số mol của một chất sao cho tỉ lệ hai chất bằng tỉ lệ hệ số, rồi chạy lại."],
    ["Engine xác định mức tiến triển bằng min(nA/hệ số A, nB/hệ số B). Kết quả hiện tại: {extent} mol; chất giới hạn: {limiting}.",
      "Chất hết trước quyết định lượng phản ứng: engine lấy giá trị nhỏ hơn của nA/hệ số A và nB/hệ số B, được {extent} mol; chất giới hạn là {limiting}."],
  ],
  CHEMISTRY_PH: [
    ["Mỗi lọ làm quỳ tím đổi sang màu gì?",
      "Em đã ghi lại màu của quỳ tím khi nhúng vào từng lọ chưa?"],
    ["Quỳ tím hoá đỏ trong dung dịch axit, hoá xanh trong dung dịch bazơ và không đổi màu trong dung dịch trung tính.",
      "Màu của quỳ tím cho biết dung dịch có tính axit, bazơ hay trung tính."],
    ["Thử lại từng lọ, so màu quỳ tím với bảng màu rồi chọn tính chất cho lọ đó.",
      "Kiểm tra lại lọ mà em chưa chắc, đối chiếu màu quỳ tím rồi sửa lựa chọn của lọ đó."],
    ["Mỗi lọ chỉ có một tính chất; màu quỳ tím là bằng chứng để quyết định lọ đó là axit, bazơ hay trung tính.",
      "Hãy dựa vào màu quỳ tím quan sát được, không đoán theo thứ tự lọ: mỗi màu ứng với đúng một loại dung dịch."],
  ],
  EYE: [
    ["Bộ phận nào tiếp nhận ánh sáng trước tiên?",
      "Khi ánh sáng đi vào mắt, nó gặp bộ phận nào đầu tiên?"],
    ["Hãy liên hệ vị trí với chức năng của từng bộ phận.",
      "Vị trí của mỗi bộ phận trên đường đi của ánh sáng gợi ý chức năng của nó."],
    ["Mở chế độ khám phá và theo đường đi của ánh sáng, sau đó thử lại.",
      "Trong chế độ khám phá, bấm lần lượt từng bộ phận theo đường đi của ánh sáng rồi điền lại."],
    ["Ánh sáng đi qua giác mạc, thủy dịch, đồng tử, thể thủy tinh và dịch kính để đến võng mạc.",
      "Đường đi của ánh sáng trong mắt: giác mạc, thủy dịch, đồng tử, thể thủy tinh, dịch kính rồi tới võng mạc."],
  ],
};

export const TUTOR_KEYS = Object.keys(TUTOR_TEMPLATES) as TutorKey[];
/** Circuit statuses that are hint keys; `SAFE` is the passed state (409 HINT_NOT_NEEDED). */
export const CIRCUIT_HINT_STATUSES = ["OPEN_CIRCUIT", "SWITCH_OPEN", "LED_OVERLOAD", "NO_LED", "LOW_CURRENT"] as const;

/** sha256 of the template table; pinned in the test so a text change needs a version bump. */
export function tutorRulesDigest() {
  return createHash("sha256").update(stableStringify(TUTOR_TEMPLATES)).digest("hex");
}

export function tutorKey(simulation: any): TutorKey {
  if (simulation?.status) return (CIRCUIT_HINT_STATUSES as readonly string[]).includes(simulation.status) ? simulation.status : "OPEN_CIRCUIT";
  if (simulation?.equation) return "CHEMISTRY";
  if (simulation?.experiment === "ph") return "CHEMISTRY_PH";
  return "EYE";
}

export const variantCount = (key: TutorKey, level: TutorLevel) => TUTOR_TEMPLATES[key][level - 1].length;

const formatNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value)
  ? String(Math.round(value * 1000) / 1000) : String(value ?? "?");

/** The template text; numbers come only from the stored engine result. */
export function renderTutorTemplate(key: TutorKey, level: TutorLevel, variant: number, simulation: any) {
  const options = TUTOR_TEMPLATES[key][level - 1];
  return options[variant % options.length]
    .replace("{minimumResistance}", formatNumber(simulation?.minimumResistance))
    .replace("{extent}", formatNumber(simulation?.extent))
    .replace("{limiting}", String(simulation?.limiting ?? "?"));
}

const UI_KEYS = new Set(["position", "positionAbsolute", "selected", "dragging", "x", "y", "z", "width", "height", "ui", "view", "camera", "zoom"]);
function stripUi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUi);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !UI_KEYS.has(key)).map(([key, inner]) => [key, stripUi(inner)]));
}

/**
 * Keeps what the engine evaluates (components, values, connections, switch states, amounts, answers) and drops
 * canvas coordinates, selection and other UI-only fields, so moving a component without rewiring keeps the digest.
 */
export function normalizeLabState(labState: unknown): unknown {
  const state = labState as any;
  if (state && Array.isArray(state.nodes) && Array.isArray(state.edges)) {
    return {
      nodes: [...state.nodes]
        .map((node: any) => ({ id: node?.id, type: node?.type, value: node?.value ?? null, closed: node?.closed ?? null }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      edges: state.edges
        .map((edge: any) => [String(edge?.source), String(edge?.target)].sort().join("|"))
        .sort(),
    };
  }
  if (state && (state.reactionId !== undefined || state.samples !== undefined))
    return { reactionId: state.reactionId ?? null, molesA: state.molesA ?? null, molesB: state.molesB ?? null, samples: state.samples ?? null };
  if (state && state.answers && typeof state.answers === "object")
    return { answers: Object.fromEntries(Object.entries(state.answers).map(([key, value]) => [key, String(value ?? "").trim().toLocaleLowerCase("vi").normalize("NFC")])) };
  return stripUi(state ?? null);
}

export function labDigest(labState: unknown) {
  return createHash("sha256").update(stableStringify(normalizeLabState(labState))).digest("hex");
}

export type TutorDecision = { level: TutorLevel; variant: number; escalated: boolean };

/**
 * UC-AI-03 / BR-06. `previous` is the student's most recent hint on this challenge (with the digest of the attempt it
 * was given for); `sameLevelRepeats` counts earlier hints at that level on this challenge.
 * - none → level 1, variant a;
 * - a changed lab state → next level (max 4), variant a, escalated;
 * - the same lab state → same level, next variant, not escalated.
 */
export function decideTutorLevel(input: {
  key: TutorKey;
  currentDigest: string;
  previous: { level: number; labDigest: string } | null;
  sameLevelRepeats: (level: number) => number;
}): TutorDecision {
  if (!input.previous) return { level: 1, variant: 0, escalated: false };
  const previousLevel = Math.min(4, Math.max(1, input.previous.level)) as TutorLevel;
  if (input.currentDigest !== input.previous.labDigest) {
    const level = Math.min(4, previousLevel + 1) as TutorLevel;
    // At the level-4 cap a changed state still counts as a real retry but cannot climb further.
    if (level === previousLevel) return { level, variant: input.sameLevelRepeats(level) % variantCount(input.key, level), escalated: false };
    return { level, variant: 0, escalated: true };
  }
  return { level: previousLevel, variant: input.sameLevelRepeats(previousLevel) % variantCount(input.key, previousLevel), escalated: false };
}

export const variantName = (variant: number) => String.fromCharCode(97 + variant);
