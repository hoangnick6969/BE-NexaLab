import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guardChatReply, prefilterMessage, TUTOR_CHAT_PROMPT_VERSION, TUTOR_CHAT_RULES } from "./tutor-chat";

const evalSet = JSON.parse(readFileSync("content/student-ai/sai04-safety-eval-set.json", "utf8"));

describe("SAI-04 tutor chat rules (tutor-chat-rules@1)", () => {
  it("versions and a draft safety set of at least 200 prompts (SG-4)", () => {
    expect([TUTOR_CHAT_RULES, TUTOR_CHAT_PROMPT_VERSION]).toEqual(["tutor-chat-rules@1", "tutor-chat@1"]);
    expect(evalSet.items.length).toBeGreaterThanOrEqual(200);
    expect(new Set(evalSet.items.map((item: any) => item.id)).size).toBe(evalSet.items.length);
  });

  it("the prefilter refuses every injection, unsafe, personal-data and answer-seeking prompt and lets every lesson question through", () => {
    const misses = evalSet.items
      .map((item: any) => ({ ...item, got: prefilterMessage(item.prompt) }))
      .filter((item: any) => item.got !== item.expectPrefilter);
    expect(misses.map((item: any) => `${item.id} expected ${item.expectPrefilter} got ${item.got}: ${item.prompt}`)).toEqual([]);
  });

  it.each([
    ["not json", "PARSE"],
    [JSON.stringify({ reply: "x" }), "SHAPE"],
    [JSON.stringify({ onTopic: true, reply: " " }), "EMPTY"],
    [JSON.stringify({ onTopic: true, reply: "a".repeat(601) }), "TOO_LONG"],
    [JSON.stringify({ onTopic: true, reply: "Em thử nếm dung dịch nhé." }), "TOPIC"],
    [JSON.stringify({ onTopic: true, reply: "Đáp án là ếch tăng." }), "VERDICT"],
    [JSON.stringify({ onTopic: true, reply: "Khi mất rắn thì ếch sẽ tăng." }), "LEAK"],
    [JSON.stringify({ onTopic: true, reply: "Nguồn có 42 cục pin đấy." }), "NUMBER_NOT_GROUNDED"],
  ])("guards the reply %s", (raw, rule) => {
    expect(guardChatReply(raw, "Mạch điện 9 V")).toEqual({ rule });
  });

  it("accepts an on-topic Socratic reply with grounded numbers", () => {
    expect(guardChatReply(JSON.stringify({ onTopic: true, reply: "Với nguồn 9 V, điện trở làm dòng điện thay đổi thế nào?" }), "Mạch điện 9 V"))
      .toEqual({ onTopic: true, reply: "Với nguồn 9 V, điện trở làm dòng điện thay đổi thế nào?" });
  });
});
