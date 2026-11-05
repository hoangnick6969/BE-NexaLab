import { createHash } from "node:crypto";
import { z } from "zod";
import { CIRCUIT_BULB_RUBRIC } from "./evaluators/circuit-bulb-checkpoints.evaluator";
import { ECOLOGY_TOLERANCE_RUBRIC, EM_INDUCTION_RUBRIC, FOOD_WEB_RUBRIC, checkpointActivityForRubric } from "./checkpoint-activities";
import { canonical } from "./lab-run";
import { STATION_HINT_CATALOGS } from "./station-hint-catalogs";
import { EVENT_HINT_CATALOGS } from "./event-hint-catalogs";

/**
 * SAI-01A rules-only hints for checkpoint Foundational Labs
 * (_bmad-output/specs/spec-student-ai-checkpoint-hints). Text and misconception rules are versioned:
 * change a template or a detector → bump the version, never edit a released one silently.
 */
export const CHECKPOINT_HINT_RULES = "checkpoint-hints@4";
export const CHECKPOINT_MISCONCEPTION_RULES = "checkpoint-misconceptions@1";

export type Pair = readonly [a: string, b: string];
export type Observation = { id: string; prediction: unknown; predictionCorrect: boolean; scientificObservation?: any };

export type CriterionHints = {
  /** Student-facing name of the checkpoint the hint is about. */
  label: string;
  /** Level 1 question, 2 concept, 3 action, 4 explanation; two wordings each. */
  levels: readonly [Pair, Pair, Pair, Pair];
  /** Moment B: reflection after the observation contradicted the prediction; two wordings. */
  reflect?: Pair;
  /** Moment B wording when a misconception matches. */
  reflections?: Record<string, string>;
  /** Wording for levels 1 and 2 when a misconception matches (variant a only). */
  misconceptions?: Record<string, readonly [level1: string, level2: string]>;
  /** B8: maps a wrong answer to a misconception id; never shown to the student. */
  detect?: (observation: Observation) => string | null;
  /** Phrases that would reveal the expected answer; no template may contain them. */
  forbidden: readonly RegExp[];
};

export type Catalog = {
  order: readonly string[];
  criteria: Record<string, CriterionHints>;
  /** Maps a raw unmetCriteria entry to a catalog key (station Labs group several entries); default identity. */
  keyOf?: (unmet: string) => string | null;
  /** The learner's answer that a criterion depends on, for "did the answer change" (BR-06); default checkpoint/explanation. */
  answerOf?: (evidence: any, criterion: string) => unknown;
  /** In-run moments A and B: only predict-observe checkpoint activities. */
  inRun?: boolean;
  /** Unmet criteria from a result without `assessment.unmetCriteria` (FL-06/07/10 criteria maps). */
  unmetOf?: (result: any) => string[];
  /** answerOf receives `{ labState, events }`: the run's server events hold the learner's answers. */
  withEvents?: boolean;
};

const ANSWER_LETTER = /(?:[đĐ]áp án|[lL]ựa chọn|[pP]hương án|[cC]họn)\s+[ABC](?![\p{L}\p{N}])/u;

export const explanation = (observed: string): CriterionHints => ({
  label: "Lời giải thích",
  levels: [
    [
      "Lời giải thích em chọn có khớp với tất cả những gì em vừa quan sát ở các bước trước không?",
      "Đọc lại từng lời giải thích và tự hỏi: lời nào nói đúng nguyên nhân, chứ không chỉ kể lại hiện tượng?",
    ],
    [
      "Một lời giải thích tốt nêu được nguyên nhân khoa học và không mâu thuẫn với bất kỳ quan sát nào.",
      "Lời giải thích phải trả lời được câu hỏi “vì sao”, và phải đúng với mọi bước em đã làm, không chỉ một bước.",
    ],
    [
      `Nhìn lại ${observed}, rồi loại những lời giải thích mâu thuẫn với một trong các kết quả đó.`,
      `Ghi ra ngắn gọn ${observed} em đã thấy, rồi so từng lời giải thích với ghi chú đó.`,
    ],
    [
      "Đối chiếu từng lời giải thích với các quan sát: lời nào sai ở bất kỳ quan sát nào thì loại. Lời còn lại phải nêu được vì sao hiện tượng xảy ra, đúng với kiến thức của bài.",
      "Một lời giải thích chỉ đúng khi nó vừa khớp với mọi quan sát vừa nêu đúng cơ chế. Loại dần những lời không thoả một trong hai điều đó.",
    ],
  ],
  forbidden: [ANSWER_LETTER],
});

const predictionOf = (observation: Observation) => observation.prediction;

/** FL-21 food web, activity food-web-checkpoints v1 (W1, illustrative web). */
const FOOD_WEB: Catalog = {
  inRun: true,
  order: ["prediction:ROLES", "prediction:CHAIN", "prediction:ENERGY", "prediction:HUNT", "prediction:DEFOREST", "prediction:CAUSES", "explanation"],
  criteria: {
    "prediction:ROLES": {
      label: "Vai trò sinh vật",
      reflect: ["Sa bàn vừa cho thấy vai trò của từng loài. Loài nào khác với điều em nghĩ, và em đã dựa vào dấu hiệu nào để đoán?", "So vai trò trên sa bàn với dự đoán của em: điểm khác nằm ở loài nào? Thử giải thích loài đó lấy chất hữu cơ từ đâu."],
      reflections: {FW_DECOMPOSER_AS_CONSUMER: "Nấm và vi khuẩn không ăn một con vật đang sống cụ thể nào; chúng nhận xác và chất thải của mọi bậc. Điều đó khác gì với cách sinh vật tiêu thụ lấy thức ăn?", FW_ANIMAL_AS_PRODUCER: "Ếch không tự tạo được chất hữu cơ từ ánh sáng; nó phải ăn sinh vật khác. Điều đó cho biết gì về vai trò của ếch?", FW_PLANT_NOT_PRODUCER: "Cỏ tự tổng hợp chất hữu cơ nhờ quang hợp, không cần ăn loài nào. Vị trí đó trong chuỗi thức ăn gọi là gì?"},
      levels: [
        [
          "Với từng loài cần xếp, nó lấy năng lượng từ đâu: tự tạo ra từ ánh sáng, ăn sinh vật khác, hay sống nhờ xác và chất thải?",
          "Hãy nhìn các mũi tên quanh từng loài: loài đó tự làm ra thức ăn, ăn loài khác, hay nhận xác của mọi bậc?",
        ],
        [
          "Sinh vật sản xuất tự tổng hợp chất hữu cơ, thường nhờ quang hợp; sinh vật tiêu thụ ăn sinh vật khác; sinh vật phân giải biến xác và chất thải thành chất vô cơ.",
          "Ba vai trò khác nhau ở nguồn thức ăn: tự làm ra, ăn sinh vật sống khác, hay phân huỷ xác và chất thải.",
        ],
        [
          "Bấm vào từng loài trên sa bàn để xem mũi tên đi vào nó. Không có mũi tên thức ăn nào đi vào nghĩa là loài đó tự tạo thức ăn; nhận mũi tên từ xác của mọi bậc là dấu hiệu của sinh vật phân giải.",
          "Xếp lại từng loài một: đếm mũi tên thức ăn đi vào loài đó và xem mũi tên đến từ sinh vật sống hay từ xác, chất thải.",
        ],
        [
          "Vai trò của một loài được xác định bằng cách nó lấy chất hữu cơ: thực vật quang hợp là sinh vật sản xuất, động vật ăn sinh vật khác là sinh vật tiêu thụ, sinh vật sống nhờ xác và chất thải của mọi bậc là sinh vật phân giải. Áp dụng cho từng loài rồi kiểm tra lại.",
          "Hãy phân loại theo nguồn chất hữu cơ: tự tổng hợp, lấy từ sinh vật sống, hay lấy từ xác và chất thải. Mỗi loài cần xếp chỉ thuộc đúng một nhóm.",
        ],
      ],
      misconceptions: {
        FW_DECOMPOSER_AS_CONSUMER: [
          "Nấm và vi khuẩn có ăn một con vật đang sống cụ thể nào không, hay chúng nhận xác và chất thải của mọi loài?",
          "Sinh vật tiêu thụ ăn sinh vật đang sống; loài phân huỷ xác và chất thải của mọi bậc có một vai trò riêng.",
        ],
        FW_ANIMAL_AS_PRODUCER: [
          "Ếch có tự tạo được thức ăn từ ánh sáng như cây không?",
          "Chỉ sinh vật tự tổng hợp chất hữu cơ mới là sinh vật sản xuất; động vật phải lấy thức ăn từ sinh vật khác.",
        ],
        FW_PLANT_NOT_PRODUCER: [
          "Cỏ lấy chất hữu cơ từ đâu: ăn loài khác hay tự làm ra nhờ ánh sáng?",
          "Thực vật quang hợp tự tổng hợp chất hữu cơ, nên đứng ở bậc đầu tiên của chuỗi thức ăn.",
        ],
      },
      detect: (observation) => {
        const answer = predictionOf(observation) as Record<string, string> | null;
        if (!answer) return null;
        if (answer["nam-vi-khuan"] === "CONSUMER") return "FW_DECOMPOSER_AS_CONSUMER";
        if (answer.ech === "PRODUCER") return "FW_ANIMAL_AS_PRODUCER";
        if (answer.co && answer.co !== "PRODUCER") return "FW_PLANT_NOT_PRODUCER";
        return null;
      },
      forbidden: [/cỏ (là|thuộc) (sinh vật|nhóm)/i, /ếch (là|thuộc) (sinh vật|nhóm)/i, /(nấm|vi khuẩn)[^.]{0,20}(là|thuộc) (sinh vật|nhóm)/i],
    },
    "prediction:CHAIN": {
      label: "Chuỗi thức ăn",
      reflect: ["Sa bàn báo chuỗi của em chưa hợp lệ. Mắt xích nào làm chuỗi bị đứt hoặc chưa đủ?", "Đọc lại thông báo trên sa bàn rồi xem lỗi nằm ở loài đầu, ở một mối nối, hay ở độ dài chuỗi."],
      reflections: {FW_CHAIN_NOT_FROM_PRODUCER: "Chuỗi của em mở đầu bằng một loài phải ăn loài khác, nên phía trước nó còn thiếu một mắt xích.", FW_CHAIN_TOO_SHORT: "Các mối nối của em đều đúng chiều; chuỗi chỉ cần dài thêm cho đủ yêu cầu của đề.", FW_CHAIN_BROKEN_LINK: "Có hai loài liền nhau trong chuỗi của em không có mũi tên nối trực tiếp; hãy tìm cặp đó trên sa bàn."},
      levels: [
        [
          "Đọc lại chuỗi của em từ đầu đến cuối: mỗi loài có thật sự là thức ăn của loài đứng ngay sau nó không?",
          "Chuỗi của em bắt đầu từ loài nào, và có đủ số mắt xích đề bài yêu cầu chưa?",
        ],
        [
          "Một chuỗi thức ăn bắt đầu từ sinh vật sản xuất; mỗi mắt xích phía sau ăn mắt xích đứng trước nó; đề bài cần ít nhất 4 mắt xích.",
          "Chuỗi thức ăn là một dãy liên tục “bị ăn → ăn”, mở đầu bằng sinh vật tự tạo được thức ăn.",
        ],
        [
          "Chọn một loài thực vật làm điểm bắt đầu, rồi đi theo một mũi tên ra khỏi nó; lặp lại cho đến khi đủ 4 loài. Chỉ bấm loài có mũi tên nối trực tiếp từ loài vừa chọn.",
          "Xoá chuỗi cũ, bắt đầu lại từ một loài không ăn loài nào khác, và mỗi lần chỉ thêm một loài nhận mũi tên từ loài cuối cùng của chuỗi.",
        ],
        [
          "Trên sa bàn, mũi tên đi từ thức ăn tới sinh vật ăn nó. Một chuỗi hợp lệ là một đường đi liên tục theo chiều mũi tên, xuất phát từ sinh vật sản xuất và dài ít nhất 4 loài.",
          "Kiểm tra ba điều: loài đầu là sinh vật sản xuất, giữa hai loài liền nhau luôn có mũi tên đúng chiều, và chuỗi có từ 4 loài trở lên.",
        ],
      ],
      misconceptions: {
        FW_CHAIN_NOT_FROM_PRODUCER: [
          "Loài đầu tiên trong chuỗi của em có ăn loài nào khác không? Nếu có, chuỗi chưa bắt đầu đúng chỗ.",
          "Mọi chuỗi thức ăn đều mở đầu bằng sinh vật sản xuất, vì chỉ nó tự tạo được chất hữu cơ.",
        ],
        FW_CHAIN_TOO_SHORT: [
          "Chuỗi của em đã đi đúng chiều; đề bài cần bao nhiêu mắt xích?",
          "Một chuỗi đúng nhưng ngắn vẫn chưa đạt yêu cầu; hãy nối thêm loài ăn mắt xích cuối.",
        ],
        FW_CHAIN_BROKEN_LINK: [
          "Giữa hai loài liền nhau trong chuỗi của em có mũi tên nối trực tiếp không?",
          "Mỗi bước trong chuỗi phải là một quan hệ ăn thật trên sa bàn; không được nhảy qua loài không nối với nhau.",
        ],
      },
      detect: (observation) => {
        const seen = observation.scientificObservation;
        if (!seen) return null;
        if (!seen.valid) return "FW_CHAIN_BROKEN_LINK";
        if (!seen.startsWithProducer) return "FW_CHAIN_NOT_FROM_PRODUCER";
        if (seen.length < 4) return "FW_CHAIN_TOO_SHORT";
        return null;
      },
      forbidden: [/cỏ\s*→\s*châu chấu/i, /châu chấu\s*→\s*ếch/i],
    },
    "prediction:ENERGY": {
      label: "Năng lượng qua các bậc",
      reflect: ["Tháp năng lượng vừa hiện ra. So bậc cuối trên tháp với con số em đoán: em đã bỏ sót hay làm thừa bước nào?", "So từng bậc trên tháp với cách em tính: em bắt đầu tính khác tháp từ bậc nào?"],
      reflections: {FW_ENERGY_STOP_EARLY: "Con số em đoán trùng với một bậc ở giữa tháp: em đã dừng chia sớm hơn số bậc của chuỗi.", FW_ENERGY_NO_LOSS: "Trên tháp, năng lượng giảm dần ở các bậc trên; năng lượng không thể lớn lên khi đi qua các bậc."},
      levels: [
        [
          "Từ cỏ tới rắn, năng lượng phải qua bao nhiêu lần chuyển bậc, và mỗi lần chuyển giữ lại bao nhiêu phần?",
          "Mỗi mũi tên trong chuỗi là một lần năng lượng được chuyển đi. Chuỗi này có mấy mũi tên?",
        ],
        [
          "Theo quy ước của bài, mỗi bậc dinh dưỡng chỉ chuyển cho bậc sau 1/10 năng lượng nó nhận; phần còn lại mất đi, chủ yếu dưới dạng nhiệt.",
          "Năng lượng giảm dần khi đi lên các bậc dinh dưỡng, vì mỗi bậc dùng phần lớn năng lượng cho sống và toả nhiệt.",
        ],
        [
          "Kẻ 4 ô cho 4 bậc: Cỏ, Châu chấu, Ếch, Rắn. Điền ô đầu bằng năng lượng của cỏ trên tháp, rồi lấy ô trước chia cho 10 để được ô sau.",
          "Tính lần lượt từng bậc, đừng tính một lần: năng lượng châu chấu nhận, rồi ếch, rồi rắn.",
        ],
        [
          "Năng lượng ở bậc sau bằng năng lượng bậc trước nhân 1/10. Với 4 bậc, năng lượng tới bậc cuối bằng năng lượng của sinh vật sản xuất chia cho 10 ba lần. Hãy tự tính rồi nhập kết quả theo kJ.",
          "Đếm số lần chuyển bậc từ sinh vật sản xuất tới bậc cuối, mỗi lần chia cho 10. Kết quả phải nhỏ hơn năng lượng của mọi bậc phía trước.",
        ],
      ],
      misconceptions: {
        FW_ENERGY_STOP_EARLY: [
          "Em đã chia đủ số lần chưa? Đếm lại số mũi tên từ cỏ đến rắn.",
          "Mỗi mũi tên là một lần chuyển năng lượng, và mỗi lần chỉ còn lại 1/10.",
        ],
        FW_ENERGY_NO_LOSS: [
          "Năng lượng của rắn có thể bằng hoặc lớn hơn năng lượng của cỏ không?",
          "Năng lượng không tự sinh ra khi đi lên các bậc; nó giảm dần vì mất đi qua hô hấp và nhiệt.",
        ],
      },
      detect: (observation) => {
        const value = Number(String((predictionOf(observation) as any)?.value ?? "").replace(",", "."));
        if (!Number.isFinite(value)) return null;
        if (value === 100 || value === 1000) return "FW_ENERGY_STOP_EARLY";
        if (value >= 10000) return "FW_ENERGY_NO_LOSS";
        return null;
      },
      forbidden: [/\b10\s*kJ\b/i, /(là|bằng|được)\s+10\b(?!\s*(lần|để|ba))/i],
    },
    "prediction:HUNT": {
      label: "Khi mất rắn",
      reflect: ["Sa bàn cho thấy ảnh hưởng trực tiếp lên ếch khác với em nghĩ. Rắn đứng ở vị trí nào so với ếch: là thức ăn hay là kẻ ăn ếch?", "Nhìn mũi tên giữa rắn và ếch trên sa bàn: khi bỏ rắn, ếch mất đi điều gì?"],
      reflections: {FW_ALL_DECREASE: "Em nghĩ mất rắn thì ếch cũng giảm. Nhưng rắn không phải thức ăn của ếch, nên ếch không bị thiếu ăn khi rắn mất.", FW_NO_LINK: "Trên sa bàn có mũi tên nối trực tiếp rắn với ếch, nên mất rắn có ảnh hưởng trực tiếp tới ếch."},
      levels: [
        [
          "Trong lưới thức ăn, rắn và ếch liên hệ với nhau thế nào: loài nào ăn loài nào?",
          "Khi một loài bị săn bắt hết, con mồi của nó còn bị loài nào khống chế?",
        ],
        [
          "Kẻ ăn thịt giữ cho số lượng con mồi không tăng quá mức. Mất kẻ ăn thịt thì con mồi mất một yếu tố khống chế.",
          "Ảnh hưởng trực tiếp đi theo mũi tên: mất thức ăn thì loài ăn nó thiếu ăn, mất kẻ ăn thì loài bị ăn bớt bị săn.",
        ],
        [
          "Bấm loại bỏ rắn trên sa bàn rồi xem các mũi tên còn lại quanh ếch: ếch mất nguồn thức ăn hay mất kẻ ăn nó?",
          "Tìm mũi tên nối ếch với rắn và đọc chiều của nó trước khi dự đoán.",
        ],
        [
          "Ảnh hưởng trực tiếp phụ thuộc vào vị trí của hai loài: nếu loài bị mất là thức ăn của loài kia thì loài kia thiếu thức ăn; nếu loài bị mất là kẻ ăn loài kia thì loài kia bớt bị ăn. Xác định rắn đứng ở vị trí nào so với ếch.",
          "Hãy trả lời hai câu: rắn là thức ăn hay là kẻ thù của ếch? Một loài mất kẻ thù thì điều gì xảy ra với số lượng của nó trong thời gian ngắn?",
        ],
      ],
      misconceptions: {
        FW_ALL_DECREASE: [
          "Mất rắn có làm ếch thiếu thức ăn không, hay chỉ làm ếch bớt bị ăn?",
          "Mất một loài không làm mọi loài cùng giảm: loài ăn nó thiếu thức ăn, còn loài bị nó ăn thì bớt bị khống chế.",
        ],
        FW_NO_LINK: [
          "Trên sa bàn có mũi tên nào nối ếch với rắn không? Mũi tên đó đi theo chiều nào?",
          "Hai loài có mũi tên nối trực tiếp thì mất loài này sẽ ảnh hưởng trực tiếp tới loài kia.",
        ],
      },
      detect: (observation) => observation.prediction === "DECREASE" ? "FW_ALL_DECREASE" : observation.prediction === "NO_DIRECT_EFFECT" ? "FW_NO_LINK" : null,
      forbidden: [/ếch (sẽ )?(tăng|nhiều lên)/i, /số lượng ếch (sẽ )?tăng/i],
    },
    "prediction:DEFOREST": {
      label: "Khi mất cây xanh",
      reflect: ["Ảnh hưởng lên sâu khác với dự đoán của em. Cây xanh là gì đối với sâu: là thức ăn hay là kẻ thù?", "Sau khi bỏ cây xanh, sâu còn mũi tên thức ăn nào đi vào không?"],
      reflections: {FW_ARROW_REVERSED: "Mũi tên đi từ cây xanh tới sâu nghĩa là sâu ăn cây xanh, không phải ngược lại.", FW_NO_LINK: "Cây xanh nối trực tiếp với sâu trên sa bàn, nên mất cây xanh ảnh hưởng trực tiếp tới sâu."},
      levels: [
        [
          "Sâu ăn lá lấy thức ăn từ đâu? Trên sa bàn, loài nào có mũi tên đi tới sâu?",
          "Sâu có bao nhiêu nguồn thức ăn trong lưới này?",
        ],
        [
          "Một loài chỉ có một nguồn thức ăn thì rất phụ thuộc vào nguồn đó.",
          "Mất nguồn thức ăn là ảnh hưởng trực tiếp lên loài ăn nó; loài có nhiều nguồn thức ăn thì ít bị ảnh hưởng hơn.",
        ],
        [
          "Bấm loại bỏ cây xanh rồi đếm xem sâu còn bao nhiêu mũi tên thức ăn đi vào.",
          "Trước khi dự đoán, tìm mọi mũi tên đi vào sâu và xem mũi tên nào biến mất khi bỏ cây xanh.",
        ],
        [
          "Mũi tên đi từ thức ăn tới sinh vật ăn nó. Nếu loài bị mất là nguồn thức ăn duy nhất của một loài, loài đó không còn gì để ăn. Kiểm tra cây xanh có phải nguồn thức ăn duy nhất của sâu không.",
          "Hãy xác định cây xanh là thức ăn hay là kẻ thù của sâu, rồi nghĩ xem một loài mất thức ăn thì số lượng của nó thay đổi thế nào.",
        ],
      ],
      misconceptions: {
        FW_ARROW_REVERSED: [
          "Mũi tên giữa cây xanh và sâu chỉ từ đâu đến đâu? Loài nào ăn loài nào?",
          "Trên sa bàn, mũi tên đi từ thức ăn đến sinh vật ăn nó, không phải ngược lại.",
        ],
        FW_NO_LINK: [
          "Trên sa bàn có mũi tên nào nối cây xanh với sâu không?",
          "Hai loài có mũi tên nối trực tiếp thì mất loài này sẽ ảnh hưởng trực tiếp tới loài kia.",
        ],
      },
      detect: (observation) => observation.prediction === "INCREASE" ? "FW_ARROW_REVERSED" : observation.prediction === "NO_DIRECT_EFFECT" ? "FW_NO_LINK" : null,
      forbidden: [/sâu (sẽ )?(giảm|ít đi)/i, /số lượng sâu (sẽ )?giảm/i],
    },
    "prediction:CAUSES": {
      label: "Nguyên nhân mất cân bằng",
      reflect: ["Sa bàn vừa cho thấy tác động của từng hoạt động. Thẻ nào có tác động khác với điều em nghĩ?", "So kết quả của từng thẻ với lựa chọn của em: em chọn thừa hay bỏ sót thẻ nào?"],
      reflections: {FW_CAUSE_PROTECTIVE_INCLUDED: "Có thẻ em chọn lại giúp giữ cân bằng: hoạt động đó không làm mất mắt xích nào.", FW_CAUSE_MISSING: "Còn thẻ làm mất một mắt xích mà em chưa chọn; xem lại kết quả của từng thẻ."},
      levels: [
        [
          "Với từng hoạt động, hãy tự hỏi: nó làm mất bớt một loài hay nơi sống, hay giúp giữ lại chúng?",
          "Hoạt động nào trong danh sách lấy đi sinh vật khỏi lưới thức ăn?",
        ],
        [
          "Mất cân bằng tự nhiên xảy ra khi một mắt xích trong lưới thức ăn bị mất hoặc giảm mạnh do con người.",
          "Hoạt động làm giảm một loài hay phá nơi sống của nó sẽ làm đứt các chuỗi thức ăn đi qua loài đó.",
        ],
        [
          "Đi qua từng thẻ: nếu hoạt động đó lấy đi cây, động vật hoặc làm hỏng nơi sống thì chọn; nếu nó trả lại hay bảo vệ sinh vật thì không chọn.",
          "Xét lần lượt từng thẻ, đừng chọn theo cảm giác: thẻ này làm mắt xích nào biến mất?",
        ],
        [
          "Một hoạt động gây mất cân bằng khi nó trực tiếp làm giảm số lượng một loài hoặc phá nơi sống của nó; hoạt động phục hồi hay bảo vệ sinh vật thì không. Áp dụng cho từng thẻ.",
          "Hãy chia các thẻ thành hai nhóm: làm mất mắt xích và giữ lại mắt xích. Chỉ nhóm đầu là nguyên nhân gây mất cân bằng.",
        ],
      ],
      misconceptions: {
        FW_CAUSE_PROTECTIVE_INCLUDED: [
          "Trong các thẻ em chọn, có thẻ nào giúp sinh vật sống tốt hơn không?",
          "Hoạt động bảo vệ hoặc phục hồi sinh vật không làm mất mắt xích nào.",
        ],
        FW_CAUSE_MISSING: [
          "Còn hoạt động nào làm mất một loài trong lưới mà em chưa chọn không?",
          "Hãy xét tất cả các thẻ, không chỉ những thẻ em nghĩ tới đầu tiên.",
        ],
      },
      detect: (observation) => {
        const answer = (predictionOf(observation) as string[] | null) ?? [];
        if (answer.includes("bao-ton") || answer.includes("trong-rung")) return "FW_CAUSE_PROTECTIVE_INCLUDED";
        const causes = observation.scientificObservation?.causes ?? {};
        const missed = Object.entries(causes).some(([id, cause]: [string, any]) => cause?.disturbs && !answer.includes(id));
        return missed ? "FW_CAUSE_MISSING" : null;
      },
      forbidden: [/phá rừng|săn bắt|khai thác|ô nhiễm|trồng rừng|bảo tồn/i],
    },
    explanation: explanation("kết quả các bước “Mất rắn” và “Mất cây xanh”"),
  },
};

/** FL-20 ecology tolerance, activity ecology-tolerance-checkpoints v1 (cá rô phi, illustrative data). */
const ECOLOGY: Catalog = {
  inRun: true,
  order: ["prediction:T_INSIDE", "prediction:T_ABOVE", "prediction:LIMITS", "prediction:IMPORT", "prediction:DENSITY", "prediction:AGE", "explanation"],
  criteria: {
    "prediction:T_INSIDE": {
      label: "Nhiệt độ trong khoảng chịu đựng",
      reflect: ["Ở nhiệt độ vừa thử, đàn cá phản ứng khác với em nghĩ. Nhiệt độ đó nằm ở đâu trên đồ thị giới hạn sinh thái?", "Đối chiếu nhiệt độ vừa thử với hai giới hạn trên đồ thị: vì sao kết quả khác dự đoán của em?"],
      reflections: {ECO_OPTIMUM_ONLY: "Điểm cực thuận chỉ là nơi cá phát triển tốt nhất; cả khoảng giữa hai giới hạn cá đều tồn tại được."},
      levels: [
        [
          "30 °C nằm ở đâu so với giới hạn dưới và giới hạn trên của cá rô phi?",
          "Cá chỉ sống được đúng ở một nhiệt độ, hay trong cả một khoảng nhiệt độ?",
        ],
        [
          "Trong khoảng giữa giới hạn dưới và giới hạn trên, sinh vật vẫn tồn tại được; ra ngoài khoảng đó thì không.",
          "Giới hạn sinh thái là một khoảng giá trị, không phải một điểm.",
        ],
        [
          "Đặt nhiệt độ 30 °C rồi quan sát đồ thị giới hạn sinh thái: điểm đó rơi vào vùng nào?",
          "Đánh dấu giới hạn dưới và giới hạn trên trên thanh nhiệt độ, rồi đặt 30 °C vào giữa hai dấu đó để so.",
        ],
        [
          "Giới hạn sinh thái là khoảng giá trị của một nhân tố mà sinh vật tồn tại được. Một giá trị không cần trùng điểm cực thuận; chỉ cần nằm giữa hai giới hạn là sinh vật tồn tại được.",
          "So nhiệt độ cần xét với cả hai giới hạn: lớn hơn giới hạn dưới và nhỏ hơn giới hạn trên thì nằm trong khoảng chịu đựng.",
        ],
      ],
      misconceptions: {
        ECO_OPTIMUM_ONLY: [
          "Cá chỉ sống được ở đúng điểm cực thuận, hay ở cả một khoảng nhiệt độ?",
          "Điểm cực thuận là nơi sinh vật phát triển tốt nhất, không phải nơi duy nhất nó sống được.",
        ],
      },
      detect: (observation) => observation.prediction === "NOT_PERSIST" ? "ECO_OPTIMUM_ONLY" : null,
      forbidden: [/cá (vẫn )?(sống|tồn tại) được ở 30/i, /30 ?°C[^.]{0,15}(sống|tồn tại) được/i],
    },
    "prediction:T_ABOVE": {
      label: "Nhiệt độ trên giới hạn",
      reflect: ["Ở 44 °C, đàn cá phản ứng khác với dự đoán của em. Giới hạn trên của cá rô phi nằm ở đâu trên đồ thị?", "So 44 °C với đầu bên phải của đồ thị: điều đó giải thích kết quả em vừa thấy thế nào?"],
      reflections: {ECO_NO_UPPER_LIMIT: "Nóng hơn giới hạn trên cũng nguy hiểm như lạnh hơn giới hạn dưới."},
      levels: [
        [
          "44 °C có còn nằm trong khoảng nhiệt độ cá rô phi chịu được không?",
          "Nước càng nóng cá càng khoẻ, hay có một mức nóng mà cá không chịu được?",
        ],
        [
          "Vượt quá giới hạn trên, sinh vật không tồn tại được, dù chỉ vượt một chút.",
          "Mỗi loài có cả giới hạn dưới và giới hạn trên; nóng quá cũng nguy hiểm như lạnh quá.",
        ],
        [
          "Đặt 44 °C rồi so điểm này với giới hạn trên ghi trên đồ thị.",
          "Đọc giới hạn trên của cá rô phi trên đồ thị trước, rồi mới so với 44 °C.",
        ],
        [
          "Sinh vật chỉ tồn tại trong khoảng giữa giới hạn dưới và giới hạn trên. Muốn biết ở một nhiệt độ cá còn tồn tại không, hãy so nhiệt độ đó với cả hai giới hạn.",
          "Một giá trị nằm ngoài khoảng chịu đựng, dù ở phía lạnh hay phía nóng, đều vượt khả năng chịu đựng của sinh vật.",
        ],
      ],
      misconceptions: {
        ECO_NO_UPPER_LIMIT: [
          "Có mức nóng nào mà cá rô phi không chịu được không? Đọc đầu bên phải của đồ thị.",
          "Giới hạn trên cũng là giới hạn: vượt qua nó thì sinh vật không tồn tại được.",
        ],
      },
      detect: (observation) => observation.prediction === "PERSISTS" ? "ECO_NO_UPPER_LIMIT" : null,
      forbidden: [/44[^.]{0,20}(không (sống|tồn tại)|chết)/i],
    },
    "prediction:LIMITS": {
      label: "Đọc giới hạn sinh thái",
      levels: [
        [
          "Trên đồ thị, nhiệt độ thấp nhất và cao nhất mà cá còn tồn tại được là bao nhiêu?",
          "Lựa chọn của em có đúng cả hai đầu của khoảng chịu đựng không, hay chỉ đúng một đầu?",
        ],
        [
          "Giới hạn sinh thái gồm hai đầu: giới hạn dưới và giới hạn trên. Điểm cực thuận nằm bên trong, không phải là một giới hạn.",
          "Khoảng chịu đựng bắt đầu ở giới hạn dưới và kết thúc ở giới hạn trên; mọi giá trị ở giữa sinh vật đều tồn tại được.",
        ],
        [
          "Quét nhiệt độ từ thấp lên cao, ghi lại giá trị đầu tiên cá bắt đầu tồn tại được và giá trị cuối cùng cá còn tồn tại được, rồi so với các lựa chọn.",
          "Đọc riêng từng đầu của đồ thị: đầu trái cho giới hạn dưới, đầu phải cho giới hạn trên.",
        ],
        [
          "Giới hạn dưới là giá trị thấp nhất, giới hạn trên là giá trị cao nhất của nhân tố mà sinh vật còn tồn tại. Hãy chọn lựa chọn có đúng cả hai đầu em đọc được trên đồ thị.",
          "Loại các lựa chọn dùng điểm cực thuận làm một đầu, hoặc có một đầu không khớp với đồ thị.",
        ],
      ],
      misconceptions: {
        ECO_OPTIMUM_AS_LIMIT: [
          "Em có đang nhầm điểm cực thuận với một giới hạn không?",
          "Điểm cực thuận là nơi cá sống tốt nhất, nằm giữa hai giới hạn.",
        ],
        ECO_ZERO_LOWER: [
          "Cá có thật sự tồn tại được khi nước lạnh tới 0 °C không? Đọc lại đầu bên trái đồ thị.",
          "Giới hạn dưới là nơi đồ thị bắt đầu, không mặc định là 0.",
        ],
      },
      detect: (observation) => observation.prediction === "L3" || observation.prediction === "L4" ? "ECO_OPTIMUM_AS_LIMIT" : observation.prediction === "L2" ? "ECO_ZERO_LOWER" : null,
      forbidden: [/5[,.]6/, /\b42 ?°C/, /\bL1\b/],
    },
    "prediction:IMPORT": {
      label: "Chọn loài để nuôi",
      reflect: ["Bảng so sánh vừa cho thấy loài nào phù hợp. Loài em chọn không chịu được đầu lạnh hay đầu nóng của nơi nuôi?", "So khoảng chịu đựng của loài em chọn với khoảng nhiệt độ của nơi nuôi, từng đầu một."],
      reflections: {ECO_AVERAGE_ONLY: "Loài em chọn hợp với nhiệt độ trung bình nhưng không chịu được một đầu của khoảng nhiệt độ ở nơi nuôi."},
      levels: [
        [
          "Nhiệt độ nước ở nơi định nuôi dao động trong khoảng nào? Loài cá nào chịu được cả khoảng đó?",
          "Loài em chọn có chịu được lúc nước lạnh nhất và lúc nóng nhất của nơi nuôi không?",
        ],
        [
          "Chỉ nên nuôi loài có giới hạn sinh thái bao trùm toàn bộ khoảng nhiệt độ của nơi nuôi, kể cả lúc lạnh nhất và nóng nhất.",
          "Một loài phù hợp khi khoảng chịu đựng của nó rộng hơn và chứa trọn khoảng nhiệt độ của nơi nuôi.",
        ],
        [
          "So từng loài: giới hạn dưới của loài phải thấp hơn nhiệt độ thấp nhất của nơi nuôi, giới hạn trên phải cao hơn nhiệt độ cao nhất.",
          "Kẻ hai cột cho mỗi loài: đầu lạnh có đạt không, đầu nóng có đạt không. Chỉ loài đạt cả hai cột mới phù hợp.",
        ],
        [
          "Một loài phù hợp khi khoảng chịu đựng của nó chứa trọn khoảng nhiệt độ của nơi nuôi. Chỉ cần vượt khỏi giới hạn một lần là cá có thể chết, nên phải xét cả hai đầu. Nếu không loài nào thoả cả hai đầu thì không nên nhập loài nào.",
          "Xét cả hai đầu cho từng loài, không xét nhiệt độ trung bình. Nếu có loài thoả cả hai thì chọn loài đó; nếu không có thì kết luận là không nên nhập.",
        ],
      ],
      misconceptions: {
        ECO_AVERAGE_ONLY: [
          "Loài em chọn có chịu được lúc nơi nuôi lạnh nhất và lúc nóng nhất không, hay chỉ hợp với nhiệt độ trung bình?",
          "Một ngày quá lạnh hay quá nóng cũng đủ làm cá chết; không thể chỉ nhìn nhiệt độ trung bình.",
        ],
      },
      detect: (observation) => observation.prediction !== "NONE" ? "ECO_AVERAGE_ONLY" : null,
      forbidden: [/\bcá [ABC]\b/, /FISH_/],
    },
    "prediction:DENSITY": {
      label: "Mật độ quần thể",
      reflect: ["Kết quả tính vừa hiện khác với em. Em đã chia đúng thứ tự và dùng đúng đơn vị diện tích chưa?", "Làm lại phép chia số cá thể cho diện tích, ghi rõ đơn vị, rồi so với kết quả vừa hiện."],
      reflections: {ECO_DENSITY_UNIT: "Con số có thể đúng nhưng đơn vị chưa khớp với đơn vị diện tích trong bảng."},
      levels: [
        [
          "Mật độ quần thể cho biết điều gì: tổng số cá thể, hay số cá thể trên một đơn vị diện tích hoặc thể tích?",
          "Kết quả của em đã có đơn vị chưa, và đơn vị đó có phải “cá thể trên một đơn vị diện tích” không?",
        ],
        [
          "Mật độ bằng số cá thể chia cho diện tích hoặc thể tích nơi chúng sống, kèm đúng đơn vị như cá thể/m².",
          "Hai quần thể cùng số cá thể nhưng sống trên diện tích khác nhau thì có mật độ khác nhau.",
        ],
        [
          "Đọc số cá thể và diện tích trong bảng của quần thể, đổi diện tích về đơn vị cần dùng nếu cần, rồi chia.",
          "Viết phép chia ra giấy: số cá thể ở trên, diện tích ở dưới, rồi ghi đơn vị của kết quả.",
        ],
        [
          "Mật độ là số cá thể trên một đơn vị diện tích hay thể tích. Lấy tổng số cá thể chia cho diện tích nơi sống; đơn vị của kết quả là cá thể trên đơn vị diện tích đó. Kiểm tra lại cả con số lẫn đơn vị.",
          "Kiểm tra hai điều riêng: phép chia đúng thứ tự (số cá thể chia cho diện tích) và đơn vị khớp với đơn vị diện tích trong bảng.",
        ],
      ],
      misconceptions: {
        ECO_DENSITY_UNIT: [
          "Đơn vị em chọn có khớp với đơn vị diện tích trong bảng không?",
          "Sinh vật sống trên mặt đất tính mật độ theo diện tích; sinh vật sống trong nước có thể tính theo thể tích.",
        ],
      },
      detect: (observation) => {
        const unit = (predictionOf(observation) as any)?.unit;
        const expected = ({ ha: "PER_HA", m2: "PER_M2", m3: "PER_M3" } as Record<string, string>)[observation.scientificObservation?.unit];
        return unit && expected && unit !== expected ? "ECO_DENSITY_UNIT" : null;
      },
      forbidden: [/mật độ (là|bằng) \d/i],
    },
    "prediction:AGE": {
      label: "Tháp tuổi",
      reflect: ["Dạng tháp vừa hiện khác với điều em chọn. Em đã so thanh dưới cùng với thanh nào?", "So độ rộng nhóm trước sinh sản với nhóm sinh sản một lần nữa: tỉ lệ đó nói gì về tương lai quần thể?"],
      levels: [
        [
          "Trong tháp tuổi, nhóm tuổi trước sinh sản đông hơn, xấp xỉ hay ít hơn nhóm đang sinh sản?",
          "Nhìn thanh dưới cùng của tháp: nó rộng hơn hay hẹp hơn các thanh phía trên?",
        ],
        [
          "Tháp có đáy rộng, nhiều cá thể non, cho thấy quần thể đang phát triển; đáy hẹp cho thấy quần thể có thể suy giảm; các nhóm xấp xỉ nhau là quần thể ổn định.",
          "Số cá thể non quyết định nhóm sinh sản sau này có được thay thế đủ hay không.",
        ],
        [
          "So độ rộng thanh dưới cùng với thanh ở giữa của tháp đang xét, rồi đối chiếu với ba dạng tháp.",
          "Ước lượng tỉ lệ giữa nhóm trước sinh sản và nhóm sinh sản: lớn hơn hẳn, xấp xỉ, hay nhỏ hơn hẳn?",
        ],
        [
          "Dạng tháp tuổi phản ánh tương lai của quần thể: nhiều cá thể non sẽ bổ sung cho nhóm sinh sản; ít cá thể non thì nhóm sinh sản sẽ không được thay thế đủ. So tỉ lệ giữa hai nhóm để chọn dạng tháp.",
          "Hãy tự hỏi: vài năm nữa, khi nhóm non lớn lên, nhóm sinh sản sẽ đông hơn, như cũ hay ít đi? Câu trả lời cho biết dạng tháp.",
        ],
      ],
      forbidden: [/P3[^.]{0,25}(phát triển|ổn định|suy giảm)/i],
    },
    explanation: explanation("kết quả các bước giới hạn nhiệt độ và chọn loài để nuôi"),
  },
};

/** FL-01 circuit bulb, activity circuit-bulb-checkpoints v1. */
const CIRCUIT_BULB: Catalog = {
  inRun: true,
  order: ["prediction:CLOSED", "prediction:OPEN", "explanation"],
  criteria: {
    "prediction:CLOSED": {
      label: "Mạch kín",
      reflect: ["Đèn trong mạch kín không như em đoán. Khi công tắc đóng, dòng điện đi qua những thiết bị nào?", "Lần theo dây trong mạch kín vừa chạy: có đường liên tục đi qua đèn không?"],
      reflections: {CB_CLOSED_NO_CURRENT: "Khi công tắc đóng, mạch liền thành một vòng nên có dòng điện chạy qua mọi thiết bị trên vòng đó."},
      levels: [
        [
          "Khi mạch kín, dòng điện có một đường đi liên tục từ cực này của pin qua đèn về cực kia không?",
          "Công tắc đóng có làm đường dẫn liền lại không?",
        ],
        [
          "Một bóng đèn chỉ phát sáng khi có dòng điện chạy qua nó, và dòng điện chỉ chạy khi mạch kín.",
          "Mạch kín là mạch có đường dẫn liên tục đi qua nguồn điện và các thiết bị.",
        ],
        [
          "Lần theo dây từ cực dương qua công tắc, qua đèn rồi về cực âm: có chỗ nào bị đứt không?",
          "Đặt ngón tay lên dây và đi một vòng quanh mạch; nếu đi được về chỗ bắt đầu thì mạch kín.",
        ],
        [
          "Khi mạch kín, có dòng điện chạy qua mọi thiết bị trên đường dẫn của mạch nối tiếp. Áp dụng điều này cho bóng đèn trong mạch.",
          "Hãy trả lời: trong mạch này có dòng điện không, và dòng điện có đi qua bóng đèn không? Từ đó suy ra trạng thái của đèn.",
        ],
      ],
      misconceptions: {
        CB_CLOSED_NO_CURRENT: [
          "Khi công tắc đóng, còn chỗ nào ngăn dòng điện đi qua đèn không?",
          "Đóng công tắc làm mạch liền lại, nên dòng điện có đường để chạy.",
        ],
      },
      detect: (observation) => observation.prediction === "OFF" ? "CB_CLOSED_NO_CURRENT" : null,
      forbidden: [/(đèn|bóng) (sẽ )?(sáng|tắt)\b/i],
    },
    "prediction:OPEN": {
      label: "Mạch hở",
      reflect: ["Trạng thái của đèn khi công tắc mở khác với em đoán. Dòng điện còn đường đi qua đèn không?", "Tìm chỗ ngắt trong mạch vừa chạy: chỗ ngắt đó ảnh hưởng tới cả mạch nối tiếp thế nào?"],
      reflections: {CB_OPEN_STILL_LIT: "Bóng đèn không tích điện; khi mạch bị ngắt, không còn dòng điện chạy qua nó."},
      levels: [
        [
          "Khi công tắc mở, dòng điện còn đường nào để đi qua đèn không?",
          "Mạch bị ngắt ở một chỗ thì phần còn lại của mạch nối tiếp có dòng điện không?",
        ],
        [
          "Chỉ một chỗ hở trên đường dẫn là dòng điện không chạy được trong cả mạch nối tiếp.",
          "Mạch hở là mạch có ít nhất một chỗ ngắt trên đường dẫn.",
        ],
        [
          "Mở công tắc rồi lần theo dây từ pin: đường đi bị ngắt ở đâu?",
          "Đi một vòng quanh mạch bằng ngón tay khi công tắc mở và xem em có về được chỗ bắt đầu không.",
        ],
        [
          "Trong mạch nối tiếp, chỉ cần một chỗ ngắt là không có dòng điện qua bất kỳ thiết bị nào. Xét xem bóng đèn có còn dòng điện chạy qua không.",
          "Bóng đèn không tích điện; nó chỉ phát sáng khi đang có dòng điện chạy qua. Hãy xét mạch này có dòng điện hay không.",
        ],
      ],
      misconceptions: {
        CB_OPEN_STILL_LIT: [
          "Đèn có tự chứa sẵn điện để phát sáng khi mạch bị ngắt không?",
          "Bóng đèn không tích điện; nó chỉ phát sáng khi đang có dòng điện chạy qua.",
        ],
      },
      detect: (observation) => observation.prediction === "ON" ? "CB_OPEN_STILL_LIT" : null,
      forbidden: [/(đèn|bóng) (sẽ )?(sáng|tắt)\b/i],
    },
    explanation: explanation("kết quả hai mạch kín và mạch hở"),
  },
};

/** FL-25 electromagnetic induction, activity em-induction-checkpoints v1. */
const EM_INDUCTION: Catalog = {
  inRun: true,
  order: ["prediction:STILL", "prediction:PUSH", "prediction:PULL", "prediction:ROTATE", "explanation"],
  criteria: {
    "prediction:STILL": {
      label: "Nam châm đứng yên",
      reflect: ["Kim điện kế không như em đoán khi nam châm đứng yên. Lúc đó từ trường qua cuộn dây có thay đổi không?", "So lúc nam châm đứng yên với lúc nó chuyển động: điều gì khác nhau trong cuộn dây?"],
      reflections: {EM_MAGNET_PRESENCE: "Có nam châm ở gần chưa đủ: từ trường qua cuộn dây phải đang thay đổi thì mới sinh dòng điện cảm ứng."},
      levels: [
        [
          "Khi nam châm đứng yên, số đường sức từ xuyên qua cuộn dây có thay đổi không?",
          "Chỉ cần có nam châm ở gần là đủ, hay phải có điều gì đó thay đổi?",
        ],
        [
          "Dòng điện cảm ứng chỉ xuất hiện khi số đường sức từ xuyên qua cuộn dây biến thiên.",
          "Từ trường không đổi không sinh ra dòng điện cảm ứng.",
        ],
        [
          "Giữ nam châm đứng yên và nhìn kim điện kế một lúc, rồi so với lúc em di chuyển nam châm.",
          "Thử đặt nam châm ở nhiều vị trí khác nhau nhưng giữ yên ở mỗi vị trí, và quan sát kim điện kế.",
        ],
        [
          "Điều kiện để có dòng điện cảm ứng là từ trường qua cuộn dây phải thay đổi, không phải chỉ cần có nam châm ở gần. Xét xem khi nam châm đứng yên thì có gì thay đổi không.",
          "Hãy phân biệt “có từ trường” với “từ trường đang thay đổi”: chỉ điều thứ hai sinh ra dòng điện cảm ứng.",
        ],
      ],
      misconceptions: {
        EM_MAGNET_PRESENCE: [
          "Nam châm đứng yên tạo ra từ trường có thay đổi theo thời gian không?",
          "Có nam châm ở gần chưa đủ; số đường sức qua cuộn dây phải biến thiên.",
        ],
      },
      detect: (observation) => observation.prediction === "CURRENT" ? "EM_MAGNET_PRESENCE" : null,
      forbidden: [/không có dòng (điện )?(cảm ứng )?khi (nam châm )?đứng yên/i],
    },
    "prediction:PUSH": {
      label: "Đưa nam châm vào",
      reflect: ["Kim điện kế không như em đoán lúc đưa nam châm vào. Lúc nam châm đang chuyển động, số đường sức qua cuộn dây thay đổi thế nào?", "Đưa nam châm vào thêm một lần và chú ý đúng lúc nó đang chuyển động."],
      levels: [
        [
          "Khi đưa nam châm vào cuộn dây, số đường sức từ xuyên qua cuộn dây tăng, giảm hay không đổi?",
          "Lúc nam châm đang chuyển động lại gần cuộn dây, từ trường qua cuộn dây có thay đổi không?",
        ],
        [
          "Dòng điện cảm ứng xuất hiện khi số đường sức từ xuyên qua cuộn dây kín biến thiên.",
          "Chuyển động tương đối giữa nam châm và cuộn dây làm từ trường qua cuộn dây thay đổi.",
        ],
        [
          "Đưa nam châm vào cuộn dây và quan sát kim điện kế ngay lúc nam châm đang chuyển động.",
          "Đưa nam châm vào thật chậm rồi thật nhanh, mỗi lần nhìn kim điện kế.",
        ],
        [
          "Khi số đường sức từ qua cuộn dây biến thiên, trong cuộn dây kín xuất hiện dòng điện cảm ứng. Xét xem lúc đưa nam châm vào thì số đường sức có biến thiên không.",
          "Hãy trả lời: lúc đưa vào, từ trường qua cuộn dây có thay đổi không? Câu trả lời cho biết có dòng cảm ứng hay không.",
        ],
      ],
      forbidden: [/có dòng (điện )?(cảm ứng )?khi đưa/i],
    },
    "prediction:PULL": {
      label: "Rút nam châm ra",
      reflect: ["Hướng lệch của kim khi rút ra khác với em đoán. Lúc rút ra, số đường sức đang tăng hay đang giảm?", "So kiểu biến thiên của số đường sức lúc đưa vào và lúc rút ra."],
      reflections: {EM_DIRECTION_FIXED: "Đưa vào và rút ra làm số đường sức thay đổi theo hai kiểu trái nhau, nên kim không lệch như nhau."},
      levels: [
        [
          "Khi rút nam châm ra, số đường sức từ qua cuộn dây đang tăng hay đang giảm? So với lúc đưa vào thì sao?",
          "Đưa vào và rút ra làm từ trường qua cuộn dây thay đổi theo cùng một kiểu hay hai kiểu khác nhau?",
        ],
        [
          "Chiều của dòng điện cảm ứng phụ thuộc vào việc số đường sức đang tăng hay đang giảm.",
          "Số đường sức tăng và số đường sức giảm là hai kiểu biến thiên khác nhau.",
        ],
        [
          "So hướng lệch của kim điện kế lúc đưa vào và lúc rút ra.",
          "Làm lại cả hai thao tác liên tiếp và chỉ chú ý kim điện kế lệch sang phía nào mỗi lần.",
        ],
        [
          "Chiều dòng điện cảm ứng phụ thuộc vào việc số đường sức đang tăng hay đang giảm. Xác định lúc đưa vào và lúc rút ra mỗi lúc là tăng hay giảm, rồi suy ra chiều dòng điện.",
          "Hãy so hai kiểu biến thiên của số đường sức ở hai thao tác; kiểu biến thiên khác thì chiều dòng điện cảm ứng có còn như cũ không?",
        ],
      ],
      misconceptions: {
        EM_DIRECTION_FIXED: [
          "Chiều dòng điện có luôn giống nhau dù nam châm đi vào hay đi ra không?",
          "Tăng và giảm số đường sức là hai thay đổi trái nhau.",
        ],
      },
      detect: (observation) => observation.prediction === "SAME" ? "EM_DIRECTION_FIXED" : null,
      forbidden: [/ngược chiều|chiều ngược lại|chiều khác nhau|cùng chiều/i],
    },
    "prediction:ROTATE": {
      label: "Quay máy phát",
      reflect: ["Dòng điện khi quay không như em đoán. Trong một vòng quay, số đường sức có lúc tăng lúc giảm không?", "Theo dõi kim điện kế trong cả vòng quay: nó có giữ một phía suốt vòng không?"],
      reflections: {EM_ROTATE_ONE_WAY: "Trong một vòng quay, số đường sức lần lượt tăng rồi giảm, nên dòng điện không giữ một chiều suốt vòng."},
      levels: [
        [
          "Trong một vòng quay, số đường sức qua cuộn dây chỉ tăng, chỉ giảm, hay lúc tăng lúc giảm?",
          "Khi quay đều liên tục, từ trường qua cuộn dây có lúc nào đổi kiểu biến thiên không?",
        ],
        [
          "Mỗi kiểu biến thiên của số đường sức, tăng hoặc giảm, cho dòng điện cảm ứng một chiều riêng.",
          "Quay liên tục làm số đường sức qua cuộn dây thay đổi theo chu kỳ.",
        ],
        [
          "Quay chậm một vòng và quan sát kim điện kế trong suốt vòng quay.",
          "Dừng ở bốn vị trí trong một vòng quay và ghi lại kim điện kế lệch về phía nào lúc vừa đi qua mỗi vị trí.",
        ],
        [
          "Trong một vòng quay, số đường sức qua cuộn dây lần lượt tăng rồi giảm. Mỗi kiểu biến thiên cho dòng điện một chiều khác. Từ đó suy ra dòng điện trong cả vòng quay có dạng nào.",
          "Liệt kê các nửa vòng quay: nửa nào số đường sức tăng, nửa nào giảm. Rồi suy ra chiều dòng điện có giữ nguyên suốt vòng quay hay không.",
        ],
      ],
      misconceptions: {
        EM_ROTATE_ONE_WAY: [
          "Trong một vòng quay, từ trường qua cuộn dây có lúc nào chuyển từ tăng sang giảm không?",
          "Quay liên tục làm số đường sức lúc tăng lúc giảm, không chỉ thay đổi theo một kiểu.",
        ],
      },
      detect: (observation) => observation.prediction === "ONE_DIRECTION" ? "EM_ROTATE_ONE_WAY" : null,
      forbidden: [/xoay chiều|đổi chiều liên tục/i],
    },
    explanation: explanation("kết quả bốn thao tác với nam châm và cuộn dây"),
  },
};

export const CHECKPOINT_HINT_CATALOGS: Readonly<Record<string, Catalog>> = {
  ...STATION_HINT_CATALOGS,
  ...EVENT_HINT_CATALOGS,
  [FOOD_WEB_RUBRIC]: FOOD_WEB,
  [ECOLOGY_TOLERANCE_RUBRIC]: ECOLOGY,
  [CIRCUIT_BULB_RUBRIC]: CIRCUIT_BULB,
  [EM_INDUCTION_RUBRIC]: EM_INDUCTION,
};

export const hasCheckpointHints = (rubricRef: string | null | undefined) => Boolean(rubricRef && CHECKPOINT_HINT_CATALOGS[rubricRef]);
/** In-run hints (moments A and B) exist only for predict-observe checkpoint activities. */
export const hasRunHints = (rubricRef: string | null | undefined) => Boolean(rubricRef && CHECKPOINT_HINT_CATALOGS[rubricRef]?.inRun);

export type PreviousCheckpointHint = { criterion: string; level: number; variant: "a" | "b"; answerDigest: string };

export type CheckpointHintPlan = {
  criterion: string;
  checkpointId: string | null;
  label: string;
  level: 1 | 2 | 3 | 4;
  variant: "a" | "b";
  /** True when the level rose because the answer changed since the previous hint on this criterion. */
  escalated: boolean;
  /** Why the level did not rise: unchanged answer, or level 4 already reached. Null for a first or escalated hint. */
  repeatReason: "SAME_ANSWER" | "TOP_LEVEL" | null;
  misconception: string | null;
  answerDigest: string;
  content: string;
  ruleVersion: string;
  misconceptionRules: string;
};

const digest = (value: unknown) => createHash("sha256").update(canonical(value ?? null)).digest("hex");

/** The learner's own answer for one criterion: the checkpoint (state + prediction) or the explanation choice. */
export function answerFor(evidence: any, criterion: string) {
  if (criterion === "explanation") return { explanation: evidence?.explanation ?? null };
  const id = criterion.slice("prediction:".length);
  const checkpoint = (evidence?.checkpoints ?? []).find((item: any) => item?.id === id);
  return { id, state: checkpoint?.state ?? null, prediction: checkpoint?.prediction ?? null };
}

/**
 * Pure SAI-01A planner. `previous` lists earlier checkpoint hints on the same challenge, oldest first.
 * Returns null when every criterion is met (nothing to hint).
 */
export function planCheckpointHint(input: { rubricRef: string; evidence: unknown; result: any; previous: readonly PreviousCheckpointHint[] }): CheckpointHintPlan | null {
  const catalog = CHECKPOINT_HINT_CATALOGS[input.rubricRef];
  if (!catalog) throw new Error(`No checkpoint hint catalog for ${input.rubricRef}`);
  const unmet: string[] = catalog.unmetOf ? catalog.unmetOf(input.result)
    : Array.isArray(input.result?.assessment?.unmetCriteria) ? input.result.assessment.unmetCriteria : [];
  const keys = new Set(unmet.map((item) => (catalog.keyOf ? catalog.keyOf(item) : item)).filter((key): key is string => Boolean(key)));
  const criterion = catalog.order.find((item) => keys.has(item));
  if (!criterion) return null;
  const hints = catalog.criteria[criterion];
  const answerDigest = digest(catalog.answerOf ? catalog.answerOf(input.evidence, criterion) : answerFor(input.evidence, criterion));
  const last = [...input.previous].reverse().find((item) => item.criterion === criterion);
  let level: number;
  let variant: "a" | "b";
  let escalated: boolean;
  let repeatReason: CheckpointHintPlan["repeatReason"] = null;
  const otherVariant = last?.variant === "a" ? "b" : "a";
  if (!last) [level, variant, escalated] = [1, "a", false];
  // Same answer as the hinted one, or already at the top level: stay, show the other wording.
  else if (last.answerDigest === answerDigest || last.level >= 4) {
    [level, variant, escalated] = [last.level, otherVariant, false];
    repeatReason = last.answerDigest === answerDigest ? "SAME_ANSWER" : "TOP_LEVEL";
  } else [level, variant, escalated] = [last.level + 1, "a", true];
  const checkpointId = criterion.startsWith("prediction:") ? criterion.slice("prediction:".length) : null;
  const observations = Array.isArray(input.result?.observations) ? input.result.observations : [];
  const observation = checkpointId ? observations.find((item: any) => item?.id === checkpointId) : null;
  const misconception = observation && hints.detect ? hints.detect(observation) : null;
  const tailored = misconception && level <= 2 && variant === "a" ? hints.misconceptions?.[misconception]?.[level - 1] : undefined;
  return {
    criterion,
    checkpointId,
    label: hints.label,
    level: level as CheckpointHintPlan["level"],
    variant,
    escalated,
    repeatReason,
    misconception,
    answerDigest,
    content: tailored ?? hints.levels[level - 1][variant === "a" ? 0 : 1],
    ruleVersion: CHECKPOINT_HINT_RULES,
    misconceptionRules: CHECKPOINT_MISCONCEPTION_RULES,
  };
}

/** Every student-facing string of a catalog, for the leak and version tests. */
export function catalogTexts(rubricRef: string) {
  const catalog = CHECKPOINT_HINT_CATALOGS[rubricRef];
  return Object.entries(catalog.criteria).flatMap(([criterion, hints]) => [
    ...hints.levels.flatMap((pair) => pair.map((text) => ({ criterion, text, forbidden: hints.forbidden }))),
    ...Object.values(hints.misconceptions ?? {}).flatMap((pair) => pair.map((text) => ({ criterion, text, forbidden: hints.forbidden }))),
    ...(hints.reflect ?? []).map((text) => ({ criterion, text, forbidden: hints.forbidden })),
    ...Object.values(hints.reflections ?? {}).map((text) => ({ criterion, text, forbidden: hints.forbidden })),
  ]);
}

// ---------------------------------------------------------------------------------------------
// In-run hints (SAI-01A moments A and B): asked during a LabRun, before it is submitted.

export type RunHintMoment = "BEFORE_PREDICTION" | "AFTER_OBSERVATION";
export type PreviousRunHint = { criterion: string; moment: RunHintMoment; level: number; variant: "a" | "b" };
export type RunHintPlan = {
  criterion: string;
  checkpointId: string | null;
  label: string;
  moment: RunHintMoment;
  /** 1–2 before predicting; 0 for an after-observation reflection (outside the 1–4 ladder). */
  level: 0 | 1 | 2;
  variant: "a" | "b";
  escalated: boolean;
  repeatReason: "TOP_LEVEL" | null;
  misconception: string | null;
  content: string;
  ruleVersion: string;
  misconceptionRules: string;
};

export class CheckpointHintInputError extends Error {
  constructor(readonly code: "UNKNOWN_CHECKPOINT" | "NO_REFLECTION") { super(code); }
}

/** Highest level reachable before predicting: question and concept only, never action or explanation. */
export const RUN_HINT_MAX_LEVEL = 2;

/**
 * Moment A never reads the learner's draft, so its wording cannot reveal whether a draft is right.
 * Moment B is only asked after the observation is on screen; `observation` is the server evaluation of
 * that one checkpoint.
 */
export function planRunHint(input: {
  rubricRef: string; criterion: string; moment: RunHintMoment; observation?: Observation | null; previous: readonly PreviousRunHint[];
}): RunHintPlan {
  const catalog = CHECKPOINT_HINT_CATALOGS[input.rubricRef];
  if (!catalog) throw new Error(`No checkpoint hint catalog for ${input.rubricRef}`);
  const hints = catalog.criteria[input.criterion];
  if (!hints) throw new CheckpointHintInputError("UNKNOWN_CHECKPOINT");
  const checkpointId = input.criterion === "explanation" ? null : input.criterion.slice("prediction:".length);
  const last = [...input.previous].reverse().find((item) => item.criterion === input.criterion && item.moment === input.moment);
  const base = { criterion: input.criterion, checkpointId, label: hints.label, moment: input.moment, ruleVersion: CHECKPOINT_HINT_RULES, misconceptionRules: CHECKPOINT_MISCONCEPTION_RULES };
  if (input.moment === "BEFORE_PREDICTION") {
    if (!last) return { ...base, level: 1, variant: "a", escalated: false, repeatReason: null, misconception: null, content: hints.levels[0][0] };
    if (last.level < RUN_HINT_MAX_LEVEL) return { ...base, level: 2, variant: "a", escalated: true, repeatReason: null, misconception: null, content: hints.levels[1][0] };
    const variant = last.variant === "a" ? "b" : "a";
    return { ...base, level: 2, variant, escalated: false, repeatReason: "TOP_LEVEL", misconception: null, content: hints.levels[1][variant === "a" ? 0 : 1] };
  }
  if (!checkpointId || !hints.reflect) throw new CheckpointHintInputError("NO_REFLECTION");
  const variant = last ? (last.variant === "a" ? "b" : "a") : "a";
  const misconception = input.observation && hints.detect ? hints.detect(input.observation) : null;
  const tailored = misconception && variant === "a" ? hints.reflections?.[misconception] : undefined;
  return { ...base, level: 0, variant, escalated: false, repeatReason: null, misconception, content: tailored ?? hints.reflect[variant === "a" ? 0 : 1] };
}

/**
 * Any valid complete evidence per activity. Only the shape matters: each checkpoint is scored on its
 * own state and prediction, so the other entries never change the checkpoint being evaluated.
 */
const coil = (magnetPosition: string, motion: string) => ({ setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition, motion });
const bulb = (closed: boolean) => ({
  nodes: [{ id: "battery", type: "battery" }, { id: "bulb", type: "bulb" }, { id: "switch", type: "switch", closed }],
  edges: [{ source: "battery", target: "bulb" }, { source: "bulb", target: "switch" }, { source: "switch", target: "battery" }],
});
const water = (valueDeciC: number) => ({ setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC });
const FILLER_EVIDENCE: Record<string, Array<{ id: string; state: unknown; prediction: unknown }>> = {
  [FOOD_WEB_RUBRIC]: [
    { id: "ROLES", state: { setup: "roles", webId: "W1" }, prediction: { co: "CONSUMER", ech: "CONSUMER", "nam-vi-khuan": "CONSUMER" } },
    { id: "CHAIN", state: { setup: "chain", webId: "W1", nodes: ["co", "tho"] }, prediction: "CHAIN" },
    { id: "ENERGY", state: { setup: "energy", webId: "W1", chain: ["co", "chau-chau", "ech", "ran"] }, prediction: { value: "1" } },
    { id: "HUNT", state: { setup: "remove", webId: "W1", speciesId: "ran" }, prediction: "NO_DIRECT_EFFECT" },
    { id: "DEFOREST", state: { setup: "remove", webId: "W1", speciesId: "cay-xanh" }, prediction: "NO_DIRECT_EFFECT" },
    { id: "CAUSES", state: { setup: "causes", webId: "W1" }, prediction: [] },
  ],
  [ECOLOGY_TOLERANCE_RUBRIC]: [
    { id: "T_INSIDE", state: water(300), prediction: "NOT_PERSIST" },
    { id: "T_ABOVE", state: water(440), prediction: "PERSISTS" },
    { id: "LIMITS", state: { setup: "tolerance-sweep", speciesId: "ca-ro-phi", factor: "TEMPERATURE" }, prediction: "L4" },
    { id: "IMPORT", state: { setup: "import-comparison", siteId: "site-demo", factor: "TEMPERATURE" }, prediction: "NONE" },
    { id: "DENSITY", state: { setup: "density", populationId: "bap-cai" }, prediction: { value: "1", unit: "PER_HA" } },
    { id: "AGE", state: { setup: "age-structure", sampleId: "P3" }, prediction: "STABLE" },
  ],
  [CIRCUIT_BULB_RUBRIC]: [
    { id: "CLOSED", state: bulb(true), prediction: "OFF" },
    { id: "OPEN", state: bulb(false), prediction: "ON" },
  ],
  [EM_INDUCTION_RUBRIC]: [
    { id: "STILL", state: coil("OUTSIDE", "STILL"), prediction: "CURRENT" },
    { id: "PUSH", state: coil("INSIDE", "TOWARD"), prediction: "NO_CURRENT" },
    { id: "PULL", state: coil("OUTSIDE", "AWAY"), prediction: "NONE" },
    { id: "ROTATE", state: { setup: "generator", circuit: "CLOSED", rotation: "CW", turns: 1 }, prediction: "NONE" },
  ],
};

/**
 * Scores one checkpoint with the pinned activity's own evaluator (no second copy of the science).
 * Throws when the state or prediction is not valid for that checkpoint.
 */
export function evaluateOneCheckpoint(rubricRef: string, checkpoint: { id: string; state: unknown; prediction: unknown }): Observation {
  const activity = checkpointActivityForRubric(rubricRef);
  const filler = FILLER_EVIDENCE[rubricRef];
  if (!activity || !filler) throw new Error(`No checkpoint evaluator for ${rubricRef}`);
  if (!filler.some((item) => item.id === checkpoint.id)) throw new CheckpointHintInputError("UNKNOWN_CHECKPOINT");
  const checkpoints = filler.map((item) => (item.id === checkpoint.id ? { id: item.id, state: checkpoint.state, prediction: checkpoint.prediction } : item));
  // Same schema and refinements as a real submission, so an invalid prediction is rejected, not scored.
  const parsed = z.object(activity.submission).strict().superRefine(activity.refine).safeParse({ checkpoints, explanation: "A" });
  if (!parsed.success) throw new CheckpointHintInputError("UNKNOWN_CHECKPOINT");
  const { result } = activity.evaluate(parsed.data.checkpoints as unknown[], "A");
  return result.observations.find((item: Observation) => item.id === checkpoint.id);
}
