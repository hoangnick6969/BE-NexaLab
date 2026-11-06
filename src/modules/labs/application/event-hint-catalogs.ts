import type { Catalog, CriterionHints } from "./checkpoint-hint-rules";

/**
 * SAI-01A step 3: after-submit hints for event-scored Labs (FL-06 lever, FL-07 thermal energy, FL-10 mass
 * conservation). Their results carry a criteria map instead of unmetCriteria, and the learner's answers
 * live in the run's server events, so `answerOf` reads `{ labState, events }`. Part of checkpoint-hints@6.
 */

const ANSWER_LETTER = /(?:[đĐ]áp án|[lL]ựa chọn|[pP]hương án|[cC]họn)\s+[ABC](?![\p{L}\p{N}])/u;
const hints = (label: string, levels: CriterionHints["levels"], forbidden: RegExp[] = []): CriterionHints =>
  ({ label, levels, forbidden: [ANSWER_LETTER, ...forbidden] });
const failed = (criteria: Record<string, unknown> | undefined) =>
  Object.entries(criteria ?? {}).filter(([, ok]) => ok === false).map(([key]) => key);
const eventsOf = (evidence: any, ...types: string[]) => (evidence?.events ?? []).filter((event: any) => types.includes(event?.type));

// FL-06 lever equilibrium (lever-investigation@1.0.0).
const LEVER: Catalog = {
  order: ["rotation", "moment", "prediction", "equilibrium", "application"],
  unmetOf: (result) => failed(result?.criteria),
  withEvents: true,
  answerOf: (evidence, key) => eventsOf(evidence, ...({
    rotation: ["PREDICTED_ROTATION", "OBSERVED_ROTATION"], moment: ["MEASURED_MOMENT"], prediction: ["PREDICTED_EQUILIBRIUM"],
    equilibrium: ["VERIFIED_EQUILIBRIUM"], application: ["APPLIED_LEVER_CASE"],
  } as Record<string, string[]>)[key] ?? []),
  criteria: {
    rotation: hints("Dự đoán chiều quay", [
      ["Quả nặng treo ở bên nào của điểm tựa? Một lực đặt ở bên đó làm thanh quay theo chiều nào?", "Nếu không có gì giữ, phía nào của thanh sẽ đi xuống?"],
      ["Lực tác dụng ở một bên điểm tựa làm thanh quay về phía bên đó; lực đặt đúng tại điểm tựa không làm thanh quay.", "Tác dụng làm quay phụ thuộc vào vị trí đặt lực so với điểm tựa."],
      ["Với từng vị trí treo, xác định nó ở bên trái, bên phải hay trùng điểm tựa trước khi dự đoán.", "Quan sát lại từng lần treo và so chiều thanh nghiêng với vị trí quả nặng."],
      ["Một lực không đi qua điểm tựa gây ra moment làm thanh quay về phía có lực. Lực đi qua điểm tựa có cánh tay đòn bằng không nên không làm quay. Áp dụng cho từng vị trí treo.", "Dự đoán dựa trên vị trí lực so với điểm tựa, rồi ghi đúng điều em quan sát được."],
    ]),
    moment: hints("Đo moment lực", [
      ["Cánh tay đòn được đo từ đâu đến đâu?", "Moment lực được tính từ những đại lượng nào?"],
      ["Moment lực bằng độ lớn lực nhân với cánh tay đòn, là khoảng cách từ điểm tựa tới giá của lực.", "Cánh tay đòn đo từ điểm tựa, không đo từ đầu thanh."],
      ["Đọc lực trên lực kế, đo khoảng cách từ điểm tựa tới vị trí treo bằng thước trên thanh, rồi nhân hai số với nhau.", "Kiểm tra từng ô: lực đọc đúng chưa, cánh tay đòn đo từ điểm tựa chưa, đơn vị có thống nhất không."],
      ["Moment phụ thuộc cả lực lẫn khoảng cách tới điểm tựa. Ghi đúng lực, đúng cánh tay đòn tính từ điểm tựa, rồi tính tích của chúng với đơn vị tương ứng.", "Kiểm tra ba thứ của vị trí đã chọn: lực, cánh tay đòn, và tích của hai số."],
    ], [/\d{3,}/]),
    prediction: hints("Dự đoán lực cân bằng", [
      ["Muốn thanh cân bằng, moment ở hai bên điểm tựa cần quan hệ với nhau thế nào?", "Lực kế đặt xa điểm tựa hơn hay gần hơn quả nặng? Vậy lực cần lớn hơn hay nhỏ hơn?"],
      ["Đòn bẩy cân bằng khi moment làm quay theo hai chiều bằng nhau.", "Cánh tay đòn càng dài thì lực cần để tạo cùng một moment càng nhỏ."],
      ["Tính moment của quả nặng trước, rồi tìm lực ở vị trí lực kế sao cho moment của nó bằng đúng giá trị đó.", "Viết đẳng thức moment hai bên, chỉ để lực của lực kế là ẩn."],
      ["Điều kiện cân bằng của đòn bẩy: lực của bên này nhân cánh tay đòn của nó bằng lực của bên kia nhân cánh tay đòn của nó. Thay số của bài vào để tìm lực cần thiết.", "Từ điều kiện cân bằng moment, tìm lực ở vị trí lực kế; kiểm tra kết quả bằng cách nhân ngược lại."],
    ], [/\d{3,}/]),
    equilibrium: hints("Kiểm chứng cân bằng", [
      ["Khi thanh cân bằng, nó nằm thế nào so với phương ngang?", "Lực kế em đặt đã đúng với lực em dự đoán chưa?"],
      ["Thanh cân bằng khi moment hai bên bằng nhau và thanh đứng yên nằm ngang.", "Lực kế phải kéo đúng giá trị làm moment hai bên bằng nhau."],
      ["Đặt lực kế đúng giá trị dự đoán và quan sát thanh; nếu thanh còn nghiêng, xem lại phép tính dự đoán.", "Điều chỉnh lực kế từng chút và dừng khi thanh nằm ngang ổn định."],
      ["Kiểm chứng nghĩa là đặt đúng lực đã tính và thấy thanh nằm ngang. Nếu thanh nghiêng về một phía, moment phía đó đang lớn hơn.", "So lực em đặt với lực tính từ điều kiện cân bằng; lệch bao nhiêu thì thanh nghiêng về phía nào?"],
    ], [/\d{3,}/]),
    application: hints("Vận dụng đòn bẩy", [
      ["Trong trường hợp này, lực tác dụng xa hay gần điểm tựa hơn vật cần nâng?", "Lực em tác dụng và lực nâng vật có cùng chiều không?"],
      ["Đòn bẩy cho lợi về lực khi cánh tay đòn của lực tác dụng dài hơn cánh tay đòn của vật.", "Đòn bẩy đổi chiều lực khi điểm tựa nằm giữa lực tác dụng và vật."],
      ["Đánh dấu vị trí điểm tựa, vật và lực trên hình, rồi so hai khoảng cách tới điểm tựa.", "Xét riêng hai câu hỏi: có lợi về lực không, và có đổi chiều lực không."],
      ["Lợi về lực được quyết định bởi tỉ số hai cánh tay đòn; việc đổi chiều được quyết định bởi điểm tựa có nằm giữa hai lực hay không. Áp dụng từng tiêu chí cho trường hợp đã cho.", "Trả lời từng câu dựa trên vị trí ba điểm: điểm tựa, vật, lực tác dụng."],
    ]),
  },
};

// FL-07 thermal energy (thermal-energy-investigation@1.0.0). R1 is always met.
const THERMAL: Catalog = {
  order: ["R2", "R3", "R4", "R5", "R6"],
  unmetOf: (result) => failed(result?.criteria),
  withEvents: true,
  answerOf: (evidence, key) => {
    const first = eventsOf(evidence, "RECORDED_FIRST_MEASUREMENT"), second = eventsOf(evidence, "RECORDED_SECOND_MEASUREMENT");
    const conclusion = eventsOf(evidence, "EXPLAINED_ENERGY_BOUNDARY")[0];
    return ({ R2: first, R3: first, R4: second, R5: conclusion?.ratioChoice, R6: conclusion?.boundaryChoice } as Record<string, unknown>)[key];
  },
  criteria: {
    R2: hints("Lần đo thứ nhất", [
      ["Em đã đọc công tơ năng lượng và nhiệt kế đúng thời điểm của lần đo thứ nhất chưa?", "Số em ghi có khớp với số hiện trên đồng hồ ở thời điểm đó không?"],
      ["Mỗi lần đo gồm hai số đọc cùng lúc: năng lượng đã cung cấp và nhiệt độ của nước.", "Số đọc phải ghi đủ chữ số và đúng đơn vị của dụng cụ."],
      ["Dừng đúng mốc thời gian của lần đo thứ nhất, đọc công tơ rồi đọc nhiệt kế với mắt ngang vạch.", "Đọc lại hai dụng cụ ở mốc thời gian đó và so với số em đã ghi."],
      ["Lần đo chỉ có giá trị khi cả năng lượng lẫn nhiệt độ được đọc đúng thời điểm, đúng đơn vị. Kiểm tra lại từng số với dụng cụ.", "Hai số của một lần đo phải cùng một thời điểm; kiểm tra thời điểm, cách đọc và đơn vị."],
    ], [/\d{2,}/]),
    R3: hints("Độ tăng nhiệt độ", [
      ["Độ tăng nhiệt độ được tính từ những số đọc nào?", "Em đã lấy nhiệt độ lúc đo trừ nhiệt độ ban đầu chưa?"],
      ["Độ tăng nhiệt độ bằng nhiệt độ lúc đo trừ nhiệt độ ban đầu của nước.", "Độ tăng nhiệt độ không phải là nhiệt độ đọc được, mà là phần chênh lệch."],
      ["Ghi nhiệt độ ban đầu và nhiệt độ ở lần đo thứ nhất, rồi lấy hiệu.", "Kiểm tra phép trừ và đơn vị của độ tăng nhiệt độ."],
      ["Độ tăng nhiệt độ là hiệu giữa nhiệt độ sau và nhiệt độ trước khi đun. Tính lại hiệu này từ hai số đọc của em.", "Chọn đúng hai nhiệt độ (ban đầu và lúc đo), rồi tính hiệu của chúng."],
    ], [/\d{2,}/]),
    R4: hints("Lần đo thứ hai", [
      ["Ở lần đo thứ hai, em đã đọc lại cả năng lượng, nhiệt độ và tính độ tăng mới chưa?", "Mốc thời gian của lần đo thứ hai là bao lâu sau khi bắt đầu đun?"],
      ["Lần đo thứ hai làm giống lần thứ nhất nhưng ở mốc thời gian sau; độ tăng vẫn tính so với nhiệt độ ban đầu.", "Ba số của lần đo thứ hai: năng lượng, nhiệt độ và độ tăng nhiệt độ."],
      ["Dừng đúng mốc thứ hai, đọc công tơ và nhiệt kế, rồi trừ cho nhiệt độ ban đầu.", "So từng số của lần đo thứ hai với dụng cụ ở đúng mốc thời gian đó."],
      ["Mỗi lần đo độc lập: đọc đúng thời điểm, đúng đơn vị, và độ tăng luôn so với lúc bắt đầu. Kiểm tra lại cả ba số.", "Kiểm tra mốc thời gian, hai số đọc và phép trừ của lần đo thứ hai."],
    ], [/\d{2,}/]),
    R5: hints("So sánh hai lần đo", [
      ["Năng lượng cung cấp ở lần hai gấp bao nhiêu lần lần một? Độ tăng nhiệt độ thì sao?", "Em đã chia độ tăng lần hai cho độ tăng lần một chưa?"],
      ["Với cùng một lượng nước và không hao phí, độ tăng nhiệt độ tỉ lệ với năng lượng nhận được.", "So sánh tỉ số bằng phép chia, không chỉ nhìn bằng mắt."],
      ["Tính tỉ số giữa hai độ tăng nhiệt độ em đã ghi, rồi chọn lựa chọn mô tả đúng tỉ số đó.", "Đặt hai độ tăng cạnh nhau và tính xem cái này bằng bao nhiêu lần cái kia."],
      ["Kết luận phải dựa trên số liệu của chính em: tính tỉ số hai độ tăng nhiệt độ rồi so với tỉ số năng lượng.", "Chọn kết luận khớp với tỉ số em tính được từ hai lần đo."],
    ], [/gấp đôi|gấp hai/i]),
    R6: hints("Năng lượng và nhiệt lượng", [
      ["Toàn bộ năng lượng cung cấp có đi hết vào nước không, hay một phần đi đâu khác?", "Trong thực tế, bình và không khí xung quanh có nhận nhiệt không?"],
      ["Nhiệt lượng nước nhận được bằng năng lượng cung cấp trừ phần hao phí ra bình và môi trường.", "Mô hình trong bài là mô hình lý tưởng; thực tế luôn có trao đổi nhiệt với xung quanh."],
      ["Đọc lại giả thiết của mô hình rồi tự hỏi: khi nào hai đại lượng mới bằng nhau?", "So điều kiện của mô hình với một ấm đun nước thật trong bếp."],
      ["Năng lượng cung cấp và nhiệt lượng nước nhận chỉ bằng nhau khi không có hao phí. Chọn kết luận nêu đúng điều kiện đó.", "Một kết luận đúng phải nêu điều kiện để hai đại lượng bằng nhau, không khẳng định chung cho mọi trường hợp."],
    ], [/chỉ\s+(bằng|như)\s+nhau\s+(khi|trong)\s+(điều kiện\s+)?lý tưởng/i]),
  },
};

// FL-10 mass conservation (mass-conservation-poea@1.0.0).
const MASS: Catalog = {
  order: ["C1", "C2", "C3", "C4", "C5", "C6"],
  unmetOf: (result) => failed(result?.assessment?.criteria),
  withEvents: true,
  answerOf: (evidence, key) => {
    const state = evidence?.labState ?? {};
    return ({
      C1: eventsOf(evidence, "PREDICTED"), C2: eventsOf(evidence, "READ_BEFORE", "READ_AFTER"),
      C3: state.comparison, C4: state.explanationAttempts?.at?.(-1), C5: state.calculation, C6: [state.applicationV1, state.applicationV2],
    } as Record<string, unknown>)[key];
  },
  criteria: {
    C1: hints("Dự đoán", [
      ["Trước khi trộn, em nghĩ khối lượng trên cân sẽ thay đổi thế nào?", "Em đã ghi dự đoán trước khi xem số cân chưa?"],
      ["Dự đoán phải được ghi trước khi quan sát, để so với kết quả sau đó.", "Một dự đoán là câu trả lời có lý do, ghi trước khi làm thí nghiệm."],
      ["Ở lượt làm mới, ghi dự đoán ngay ở bước đầu rồi mới đọc cân.", "Làm đúng thứ tự: dự đoán, đọc cân trước, phản ứng, đọc cân sau."],
      ["Hoạt động yêu cầu ghi dự đoán trước khi số cân được mở. Hãy làm lại theo đúng thứ tự các bước.", "Ghi dự đoán là bước bắt buộc đầu tiên của hoạt động."],
    ]),
    C2: hints("Đọc cân trước và sau", [
      ["Em đã đọc cân cả trước và sau phản ứng chưa?", "Muốn so khối lượng, em cần những số đọc nào?"],
      ["So sánh khối lượng cần hai số đọc: trước và sau phản ứng, trên cùng một cân.", "Mỗi số đọc phải được ghi lại trên hệ thống khi em đọc cân."],
      ["Ở lượt làm mới, đọc cân trước khi trộn và đọc lại sau khi phản ứng kết thúc.", "Đừng bỏ qua bước đọc cân nào; cả hai đều cần cho phần so sánh."],
      ["Kết luận về khối lượng chỉ có giá trị khi có đủ hai số đọc trước và sau. Làm lại để ghi đủ hai bước đọc cân.", "Kiểm tra em đã có đủ số đọc trước và sau trong cùng một lượt làm."],
    ]),
    C3: hints("So sánh khối lượng", [
      ["Hai số đọc trên cân trước và sau phản ứng so với nhau thế nào?", "Bình phản ứng có đậy kín không? Có chất nào thoát ra ngoài được không?"],
      ["Khi so sánh, dùng đúng hai số đọc của cân, không dựa vào cảm nhận về hiện tượng.", "Trong bình kín, các chất không thể thoát ra ngoài hay đi vào trong."],
      ["Đặt hai số đọc cạnh nhau và xét xem số sau lớn hơn, nhỏ hơn hay bằng số trước.", "Đọc lại cả hai số và so sánh từng chữ số."],
      ["Kết luận so sánh phải lấy từ số liệu cân. Hãy xem kỹ hai số đọc và điều kiện bình kín hay hở để chọn đúng.", "So sánh hai số đọc rồi kiểm tra kết luận có phù hợp với điều kiện thí nghiệm không."],
    ], [/không đổi|bằng nhau|giữ nguyên/i]),
    C4: hints("Giải thích", [
      ["Trong phản ứng hoá học, các nguyên tử bị mất đi, sinh thêm, hay chỉ liên kết lại theo cách khác?", "Số nguyên tử của mỗi nguyên tố trước và sau phản ứng có thay đổi không?"],
      ["Phản ứng hoá học làm thay đổi liên kết giữa các nguyên tử, tạo ra chất mới.", "Khối lượng của một chất phụ thuộc vào các nguyên tử tạo nên nó."],
      ["Đếm số nguyên tử từng nguyên tố trong phương trình ở hai vế.", "Nhìn mô hình phân tử trước và sau phản ứng: những nguyên tử nào xuất hiện ở cả hai bên?"],
      ["Lời giải thích đúng phải nói về điều xảy ra với các nguyên tử trong phản ứng và vì sao điều đó liên quan tới khối lượng.", "Chọn lời giải thích dựa trên số nguyên tử ở hai vế, không dựa trên hiện tượng bên ngoài."],
    ]),
    C5: hints("Tính toán", [
      ["Tổng khối lượng các chất tham gia và tổng khối lượng các chất sản phẩm em tính được là bao nhiêu?", "Em đã cộng đủ khối lượng của tất cả chất ở mỗi vế chưa?"],
      ["Tính tổng khối lượng mỗi vế bằng cách cộng khối lượng từng chất ở vế đó.", "So hai tổng để kiểm tra định luật bảo toàn khối lượng."],
      ["Liệt kê khối lượng từng chất tham gia, cộng lại; làm tương tự với sản phẩm.", "Kiểm tra lại từng phép cộng và đơn vị."],
      ["Định luật bảo toàn khối lượng được kiểm chứng bằng cách so tổng khối lượng hai vế. Tính lại hai tổng từ số liệu của bài.", "Chọn kết quả là hai tổng đúng của hai vế, mỗi tổng tính từ đủ các chất."],
    ], [/\b35\b/]),
    C6: hints("Vận dụng", [
      ["Trong tình huống vận dụng, bình kín hay hở? Có chất khí nào sinh ra không?", "Nếu một chất khí thoát ra ngoài, số chỉ của cân sẽ phản ánh điều gì?"],
      ["Cân chỉ đo khối lượng các chất còn lại trên cân; chất đã thoát ra ngoài không được tính.", "Khối lượng vẫn bảo toàn, nhưng số đọc trên cân phụ thuộc chất có rời khỏi cân hay không."],
      ["Với mỗi tình huống, xác định có chất nào rời khỏi hệ trên cân không, rồi suy ra số chỉ cân.", "Xét riêng từng tình huống: bình có nắp hay không, và có khí sinh ra hay không."],
      ["Tổng khối lượng các chất luôn bảo toàn, nhưng cân chỉ đo phần còn lại trên cân. Áp dụng điều này cho từng tình huống.", "Trả lời từng tình huống bằng hai câu hỏi: có chất thoát ra không, và cân còn đo được gì."],
    ], [/(hở|thoát ra)[^.]{0,30}giảm/i]),
  },
};

// ---------------------------------------------------------------------------------------------
// B8 for event Labs (checkpoint-misconceptions@3): hypotheses from the learner's own events or answers and the
// stored model output. Levels 1–2 wording only; levels 3–4 stay shared.

LEVER.criteria.rotation = {
  ...LEVER.criteria.rotation,
  detectFrom: (evidence, result) => {
    const predicted = eventsOf(evidence, "PREDICTED_ROTATION")[0]?.predictions ?? [];
    const actual = (result?.observations ?? []).map((item: any) => item?.displayState);
    if (predicted.some((item: any, i: number) => item?.prediction === "LEVEL" && actual[i] && actual[i] !== "LEVEL")) return "LEVER_ARM_IGNORED";
    if (predicted.some((item: any, i: number) => actual[i] && actual[i] !== "LEVEL" && item?.prediction !== "LEVEL" && item?.prediction !== actual[i])) return "LEVER_TILT_REVERSED";
    return null;
  },
  misconceptions: {
    LEVER_ARM_IGNORED: [
      "Hai bên treo quả nặng như nhau nhưng ở khoảng cách khác nhau tới điểm tựa thì thanh có còn nằm ngang không?",
      "Tác dụng làm quay của một lực phụ thuộc cả độ lớn của lực và khoảng cách từ điểm treo tới điểm tựa.",
    ],
    LEVER_TILT_REVERSED: [
      "Phía có tác dụng làm quay mạnh hơn thì đầu thanh bên đó đi lên hay đi xuống?",
      "Thanh quay theo phía có moment lực lớn hơn: đầu thanh ở phía đó bị kéo xuống.",
    ],
  },
};

LEVER.criteria.moment = {
  ...LEVER.criteria.moment,
  detectFrom: (evidence) => {
    const measured = eventsOf(evidence, "MEASURED_MOMENT")[0];
    if (!measured) return null;
    if (measured.recordedMomentMilliNewtonMillimetres === measured.recordedForceMilliNewtons + Math.abs(measured.recordedArmMillimetres)) return "LEVER_MOMENT_ADDED";
    if (measured.recordedArmMillimetres < 0) return "LEVER_SIGNED_ARM";
    return null;
  },
  misconceptions: {
    LEVER_MOMENT_ADDED: [
      "Moment lực được tính bằng tổng hay bằng tích của lực và cánh tay đòn?",
      "Moment lực bằng lực nhân với cánh tay đòn, vì thế đơn vị của nó là niutơn nhân mét.",
    ],
    LEVER_SIGNED_ARM: [
      "Cánh tay đòn là một khoảng cách. Một khoảng cách có thể là số âm không?",
      "Cánh tay đòn là khoảng cách từ điểm tựa tới điểm đặt lực, luôn dương; dấu trên thước chỉ cho biết vật treo ở bên nào.",
    ],
  },
};

LEVER.criteria.application = {
  ...LEVER.criteria.application,
  detectFrom: (evidence, result) => {
    const applied = eventsOf(evidence, "APPLIED_LEVER_CASE")[0];
    const actual = result?.application;
    if (!applied || !actual) return null;
    if (applied.forceAdvantage === "GAIN" && actual.forceAdvantage !== "GAIN") return "LEVER_ALWAYS_GAIN";
    if (applied.changesForceDirection !== actual.changesForceDirection) return "LEVER_DIRECTION_RULE";
    return null;
  },
  misconceptions: {
    LEVER_ALWAYS_GAIN: [
      "Có phải đòn bẩy nào cũng giúp lợi về lực? Cánh tay đòn của lực em tác dụng dài hơn hay ngắn hơn cánh tay đòn của vật?",
      "Đòn bẩy chỉ lợi về lực khi cánh tay đòn của lực tác dụng dài hơn cánh tay đòn của vật cần nâng.",
    ],
    LEVER_DIRECTION_RULE: [
      "Điểm tựa nằm ở đâu so với vật và chỗ em đặt lực?",
      "Hướng của lực tác dụng so với hướng vật chuyển động phụ thuộc vào vị trí điểm tựa so với vật và điểm đặt lực.",
    ],
  },
};

const finalAsRise = (event: any, observation: any) =>
  event && observation && event.riseMilliCelsius !== observation.riseMilliCelsius && event.riseMilliCelsius === observation.thermometerReadingMilliCelsius;
const riseHints = {
  TH_FINAL_AS_RISE: [
    "Độ tăng nhiệt độ là nhiệt độ em đọc trên nhiệt kế, hay là phần chênh so với lúc bắt đầu đun?",
    "Độ tăng nhiệt độ bằng nhiệt độ lúc đo trừ đi nhiệt độ ban đầu của nước.",
  ] as const,
};
THERMAL.criteria.R3 = {
  ...THERMAL.criteria.R3,
  detectFrom: (evidence, result) => finalAsRise(eventsOf(evidence, "RECORDED_FIRST_MEASUREMENT")[0], result?.observations?.[0]) ? "TH_FINAL_AS_RISE" : null,
  misconceptions: riseHints,
};
THERMAL.criteria.R4 = {
  ...THERMAL.criteria.R4,
  detectFrom: (evidence, result) => finalAsRise(eventsOf(evidence, "RECORDED_SECOND_MEASUREMENT")[0], result?.observations?.[1]) ? "TH_FINAL_AS_RISE" : null,
  misconceptions: riseHints,
};
THERMAL.criteria.R5 = {
  ...THERMAL.criteria.R5,
  detectFrom: (evidence, result) => {
    const [a, b] = result?.observations ?? [];
    const choice = eventsOf(evidence, "EXPLAINED_ENERGY_BOUNDARY")[0]?.ratioChoice;
    return a && b && b.riseMilliCelsius === 2 * a.riseMilliCelsius && choice && choice !== "double" ? "TH_NOT_PROPORTIONAL" : null;
  },
  misconceptions: {
    TH_NOT_PROPORTIONAL: [
      "Lần đo thứ hai đun lâu hơn lần đầu bao nhiêu lần, và năng lượng joulemeter ghi được thay đổi theo thế nào?",
      "So hai lần đo: tỉ số năng lượng giữa hai lần và tỉ số độ tăng nhiệt độ giữa hai lần có liên hệ gì với nhau?",
    ],
  },
};
THERMAL.criteria.R6 = {
  ...THERMAL.criteria.R6,
  detectFrom: (evidence) => {
    const choice = eventsOf(evidence, "EXPLAINED_ENERGY_BOUNDARY")[0]?.boundaryChoice;
    return choice === "always_equal" ? "TH_NO_HEAT_LOSS" : choice === "unrelated" ? "TH_ENERGY_HEAT_UNRELATED" : null;
  },
  misconceptions: {
    TH_NO_HEAT_LOSS: [
      "Trong một thí nghiệm thật, có phần nhiệt nào truyền ra cốc, nắp và không khí xung quanh không?",
      "Hãy nghĩ về hao phí nhiệt: nếu một phần nhiệt đi ra ngoài thì phép so sánh hai đại lượng thay đổi thế nào?",
    ],
    TH_ENERGY_HEAT_UNRELATED: [
      "Khi số chỉ joulemeter tăng lên, nhiệt độ của nước thay đổi ra sao?",
      "Điện năng qua dây đun chuyển thành nhiệt làm nước nóng lên, nên hai đại lượng này gắn với nhau.",
    ],
  },
};

const MASS_DIRECTION = {
  MC_THINKS_MASS_DECREASES: [
    "Em đang dựa vào hai số trên màn hình cân, hay dựa vào việc có chất mới xuất hiện?",
    "Hãy đặt hai số cân trước và sau phản ứng cạnh nhau rồi so trực tiếp, không suy ra từ hiện tượng.",
  ],
  MC_THINKS_MASS_INCREASES: [
    "Em đang dựa vào hai số trên màn hình cân, hay dựa vào việc có chất mới xuất hiện?",
    "Hãy đặt hai số cân trước và sau phản ứng cạnh nhau rồi so trực tiếp, không suy ra từ hiện tượng.",
  ],
} as const;
const stateOf = (evidence: any) => evidence?.labState ?? {};
MASS.criteria.C3 = {
  ...MASS.criteria.C3,
  detectFrom: (evidence) => ({ "compare.decrease": "MC_THINKS_MASS_DECREASES", "compare.increase": "MC_THINKS_MASS_INCREASES" } as Record<string, string>)[stateOf(evidence).comparison] ?? null,
  misconceptions: MASS_DIRECTION,
};
MASS.criteria.C4 = {
  ...MASS.criteria.C4,
  detectFrom: (evidence) => ({ "explain.new_substance_heavier": "MC_NEW_SUBSTANCE_HEAVIER", "explain.solid_not_weighed": "MC_PRECIPITATE_NOT_WEIGHED" } as Record<string, string>)[stateOf(evidence).explanationAttempts?.at?.(-1)] ?? null,
  misconceptions: {
    MC_NEW_SUBSTANCE_HEAVIER: [
      "Khi chất mới tạo thành, có nguyên tử nào được thêm vào từ bên ngoài cốc không?",
      "Hãy đếm nguyên tử từng loại trước và sau phản ứng: có loại nào xuất hiện thêm hay biến mất không?",
    ],
    MC_PRECIPITATE_NOT_WEIGHED: [
      "Chất rắn lắng xuống đáy cốc có rời khỏi đĩa cân không?",
      "Cân tính mọi thứ đang nằm trên đĩa, kể cả chất ở đáy cốc; chỉ chất rời khỏi cân mới không được tính.",
    ],
  },
};
MASS.criteria.C5 = {
  ...MASS.criteria.C5,
  detectFrom: (evidence) => ({ "35-and-34": "MC_THINKS_MASS_DECREASES", "34-and-35": "MC_THINKS_MASS_INCREASES" } as Record<string, string>)[stateOf(evidence).calculation] ?? null,
  misconceptions: {
    MC_THINKS_MASS_DECREASES: [
      "Em đã cộng đủ cả hai chất ở mỗi phía của phương trình chưa?",
      "Cộng riêng khối lượng hai chất tham gia và hai chất tạo thành, rồi so hai tổng với nhau.",
    ],
    MC_THINKS_MASS_INCREASES: [
      "Em đã cộng đủ cả hai chất ở mỗi phía của phương trình chưa?",
      "Cộng riêng khối lượng hai chất tham gia và hai chất tạo thành, rồi so hai tổng với nhau.",
    ],
  },
};
MASS.criteria.C6 = {
  ...MASS.criteria.C6,
  detectFrom: (evidence) => {
    const state = stateOf(evidence);
    if (state.applicationV1 && state.applicationV1 !== "decrease") return "MC_OPEN_SYSTEM_GAS";
    if (state.applicationV2 && state.applicationV2 !== "same") return "MC_CLOSED_SYSTEM_CHANGES";
    return null;
  },
  misconceptions: {
    MC_OPEN_SYSTEM_GAS: [
      "Khí bay ra khỏi cốc hở có còn nằm trên đĩa cân không?",
      "Số chỉ của cân gồm những chất đang nằm trên đĩa cân. Khí đã bay đi thì sao?",
    ],
    MC_CLOSED_SYSTEM_CHANGES: [
      "Trong bình kín, có chất nào rời khỏi đĩa cân không?",
      "Hãy xét xem chất nào còn nằm trên đĩa cân khi cả bình kín đặt trên cân, rồi suy ra số chỉ.",
    ],
  },
};

export const EVENT_HINT_CATALOGS: Readonly<Record<string, Catalog>> = {
  "lever-investigation@1.0.0": LEVER,
  "thermal-energy-investigation@1.0.0": THERMAL,
  "mass-conservation-poea@1.0.0": MASS,
};
