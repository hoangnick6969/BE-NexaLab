import { Body, Controller, Get, Inject, Optional, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Roles } from "../../../common/decorators";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { Db } from "../../../db/db";
import { llmStore, phraseHint, STUDENT_AI_PROVIDER, studentAiConfig, writeHintCache, type StudentAiProvider } from "../application/student-llm";
import { getConversation, openConversation, sendMessage, TUTOR_CHAT_MAX_MESSAGE, TUTOR_CHAT_PROMPT_VERSION } from "../application/tutor-chat";

/** SAI-04 Socratic tutor chat (students only; dev/test only until SG-2 / SG-4). */
@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class TutorChatController {
  constructor(
    @Inject(Db) private db: Db,
    @Optional() @Inject(RequestRateLimiter) private limiter?: RequestRateLimiter,
    @Optional() @Inject(STUDENT_AI_PROVIDER) private provider: StudentAiProvider | null = null,
  ) {}

  @Roles("STUDENT")
  @Get("tutor/chat/status")
  @ApiOperation({ summary: "Whether the AI tutor chat is available" })
  status() {
    return { enabled: studentAiConfig().llmEnabled && Boolean(this.provider), promptVersion: TUTOR_CHAT_PROMPT_VERSION, maxMessage: TUTOR_CHAT_MAX_MESSAGE };
  }

  @Roles("STUDENT")
  @Post("tutor/conversations")
  @ApiOperation({ summary: "Open (or resume) the student's tutor conversation for a Lab or lesson they can open" })
  async open(@Body() body: unknown, @Req() req: any) {
    this.limiter?.rate("tutor-open:" + req.user.sub, 30);
    const input = z.object({ contextKind: z.enum(["LAB", "LESSON"]), contextId: z.string().min(1).max(120) }).strict().parse(body);
    return openConversation(this.db, req.user.sub, input.contextKind, input.contextId);
  }

  @Roles("STUDENT")
  @Get("tutor/conversations/:id")
  @ApiOperation({ summary: "The student's own tutor conversation" })
  get(@Param("id") id: string, @Req() req: any) {
    return getConversation(this.db, req.user.sub, id);
  }

  @Roles("STUDENT")
  @Post("tutor/conversations/:id/messages")
  @ApiOperation({ summary: "Ask the tutor; returns the student turn and the tutor reply" })
  async send(@Param("id") id: string, @Body() body: unknown, @Req() req: any) {
    this.limiter?.rate("tutor-message:" + req.user.sub, 10);
    const { message } = z.object({ message: z.string().min(1).max(TUTOR_CHAT_MAX_MESSAGE) }).strict().parse(body);
    return sendMessage(this.db, req.user.sub, id, message, { provider: this.provider });
  }

  /**
   * B3 "Nếu… thì sao?": the FE computes the answer from the Lab's own model (what-if@2); the LLM may only reword it.
   * Read-only (no HintLog); numbers must come from the model's text; cache keyed by the text, no student data.
   */
  @Roles("STUDENT")
  @Post("tutor/what-if/phrase")
  @ApiOperation({ summary: "Reword a model-computed what-if answer (rules text returned when the LLM is off)" })
  async phraseWhatIf(@Body() body: unknown, @Req() req: any) {
    this.limiter?.rate("what-if-phrase:" + req.user.sub, 30);
    const input = z.object({ kind: z.string().min(1).max(40), question: z.string().min(1).max(200), answer: z.string().min(1).max(800) }).strict().parse(body);
    const config = studentAiConfig();
    const outcome = await phraseHint({
      provider: this.provider, config, store: llmStore(this.db, req.user.sub),
      payload: { surface: "what-if", context: { title: input.kind, step: input.question }, level: 4, levelType: "Giải thích \"Nếu… thì sao?\" từ mô hình", mustAsk: false, ruleHint: input.answer },
    });
    await writeHintCache(this.db, outcome, config);
    return { text: outcome.content, provider: outcome.provider };
  }
}
