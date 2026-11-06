import { describe, expect, it } from "vitest";
import { MASK, keyPhrases, lessonSources, maskOptions, planQuestionHint, rankPassages, stripHtml } from "./lesson-question-hints";

const question = {
  id: "q1",
  prompt: "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?",
  options: [{ id: "o1", text: "Giảm" }, { id: "o2", text: "Tăng" }, { id: "o3", text: "Không đổi" }],
};
const steps = [
  { id: "read", type: "READING", config: { html: "<p>Dòng điện chạy qua dây dẫn khi có điện áp.</p><p>Theo định luật Ôm, khi điện áp giữ nguyên mà điện trở lớn lên thì cường độ dòng điện giảm.</p>" } },
  { id: "cards", type: "STUDY_CARDS", config: { cards: [{ id: "c1", front: "Điện trở", back: "Đại lượng cản trở dòng điện, đơn vị ôm" }] } },
  { id: "quiz", type: "QUIZ", config: { questions: [{ prompt: "Đáp án là Giảm" }] } },
];
const sources = lessonSources(steps);
const all = (["a", "b"] as const).flatMap((variant) => ([1, 2, 3] as const).map((level) => planQuestionHint({ question, sources, level, variant })));

describe("SAI-03A lesson question hints", () => {
  it("reads study steps only, never the quiz itself", () => {
    expect(sources.map((source) => source.kind)).toEqual(["READING", "STUDY_CARDS"]);
    expect(JSON.stringify(sources)).not.toContain("Đáp án là");
    expect(stripHtml("<p>A&nbsp;b</p><script>x()</script>")).toBe("A b.");
  });

  it("finds the topic phrases of the prompt and the lesson sentence about them", () => {
    expect(keyPhrases(question.prompt)).toEqual(["điện áp", "tăng điện trở", "dòng điện"]);
    expect(rankPassages(question.prompt, sources)[0]).toMatchObject({ source: { stepId: "read" }, index: 1 });
  });

  it("levels: focus, where to look, then the sentence with every option masked", () => {
    const [l1, l2, l3] = all;
    expect(l1).toMatchObject({ level: 1, passage: { stepId: "read", sentence: 1 } });
    expect(l1.content).toContain("“điện áp”");
    expect(l2.content).toContain("phần Đọc của bài");
    expect(l3.content).toContain(`cường độ dòng điện ${MASK}`);
    expect(l3.content).toContain(MASK);
  });

  it("no option text appears in any text taken from the lesson", () => {
    for (const hint of all) {
      const quoted = [...hint.content.matchAll(/“([^”]*)”/g)].map((match) => match[1]).filter((text) => !keyPhrases(question.prompt).includes(text));
      for (const text of quoted)
        for (const option of question.options)
          expect(new RegExp(`(?<![\\p{L}\\p{N}])${option.text}(?![\\p{L}\\p{N}])`, "iu").test(text), `${option.text} in “${text}”`).toBe(false);
    }
  });

  it("is answer-blind: the same hint whichever option is the key (the planner has no key input)", () => {
    const withKey = (key: string) => planQuestionHint({ question: { ...question, answerOptionId: key } as any, sources, level: 3, variant: "a" });
    expect(withKey("o1")).toEqual(withKey("o2"));
  });

  it("masks every option, longest first, case-insensitive and whole words only", () => {
    expect(maskOptions("Nhiệt độ không đổi rồi tăng dần; tăngcường không bị che.", [{ id: "a", text: "Không đổi" }, { id: "b", text: "tăng" }]))
      .toBe(`Nhiệt độ ${MASK} rồi ${MASK} dần; tăngcường không bị che.`);
  });

  it("keeps an option word that is part of a phrase the prompt already shows, masks the rest", () => {
    const options = [{ id: "a", text: "Đỏ" }, { id: "b", text: "Tím" }, { id: "c", text: "Xanh" }];
    expect(maskOptions("Lọ axit làm quỳ tím hóa đỏ, lọ bazơ làm quỳ tím hóa xanh, màu tím giữ nguyên.", options, "Dung dịch axit làm quỳ tím đổi sang màu nào?"))
      .toBe(`Lọ axit làm quỳ tím hóa ${MASK}, lọ bazơ làm quỳ tím hóa ${MASK}, màu ${MASK} giữ nguyên.`);
  });

  it("falls back to generic wording when the lesson says nothing related", () => {
    const off = { id: "q2", prompt: "Quang hợp diễn ra ở bào quan nào?", options: [{ id: "x", text: "Lục lạp" }, { id: "y", text: "Ti thể" }] };
    expect(planQuestionHint({ question: off, sources, level: 2, variant: "a" })).toMatchObject({ passage: null });
    expect(planQuestionHint({ question: off, sources, level: 3, variant: "a" }).content).toContain("Bài học chưa có câu");
  });
});
