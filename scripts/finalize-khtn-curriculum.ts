import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { sign } from "jsonwebtoken";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const apiBase = `http://127.0.0.1:${process.env.PORT || "4100"}/api`;
const toolRoot = resolve(process.cwd(), "../NexaLAB_Content tool");
const khtn9Root = resolve(toolRoot, "workspaces/khtn9-m1-real");
const citation = "Chương trình Giáo dục phổ thông môn Khoa học tự nhiên — Ban hành kèm theo Thông tư số 32/2018/TT-BGDĐT ngày 26/12/2018 của Bộ Giáo dục và Đào tạo";
const frameworkId = "MOET-TT32-2018-KHTN-KNTT";
const reason = "Chủ dự án phê duyệt ngày 2026-10-25; đối chiếu hộp MỤC TIÊU và source blocks của SGK Kết nối tri thức với cuộc sống";

type Block = { id?: string; type?: string; reviewedText?: string; normalizedText?: string; originalText?: string; physicalPageIndex?: number; printedPageLabel?: string | null };
type Objective = { text: string; block: Block };

const fold = (value: unknown) => String(value ?? "").normalize("NFKD").toLocaleLowerCase("vi").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const blockText = (block: Block) => String(block.reviewedText || block.normalizedText || block.originalText || "").trim();
const objectiveVerbs = ["nêu", "kể", "mô tả", "giải thích", "trình bày", "phân tích", "vận dụng", "thực hiện", "lấy", "phát biểu", "tiến hành", "đọc", "viết", "xác định", "liệt kê", "thảo luận", "quan sát", "chứng minh", "xây dựng", "điều tra", "nhận biết", "so sánh", "phân loại", "tính", "đánh giá", "đề xuất", "mắc", "vẽ", "dự đoán", "tìm hiểu", "nhận xét", "kết luận", "sử dụng", "khẳng định", "rút ra", "chỉ ra", "đo", "trả lời", "thu thập", "báo cáo", "trình diễn", "phân biệt", "lựa chọn", "giải quyết", "sắp xếp", "dựa vào", "tách"].map(fold);
const isObjective = (text: string) => {
  const normalized = fold(text.replace(/^\s*(?:[■•+\\-]|\d+(?:\.\d+)*[.)]?)\s*/u, ""));
  return objectiveVerbs.some((verb) => normalized === verb || normalized.startsWith(`${verb} `));
};
function objectives(blocks: Block[]): Objective[] {
  const rows: Objective[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (fold(blockText(blocks[i])).replace(/\s+/g, " ") !== "muc tieu") continue;
    for (const candidate of blocks.slice(i + 1)) {
      if (["paragraph_title", "header", "doc_title"].includes(String(candidate.type))) break;
      if (candidate.type !== "text") continue;
      const text = blockText(candidate);
      if (isObjective(text)) rows.push({ text: text.replace(/^\s*[■•+\\-]\s*/u, "").trim(), block: candidate });
      else if (rows.length && text.length > 20) break;
    }
    if (rows.length) break;
  }
  return rows;
}
const sha = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const overlap = (left: string, right: string) => {
  const a = new Set(fold(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(fold(right).split(" ").filter((word) => word.length > 2));
  return [...a].filter((word) => b.has(word)).length / Math.max(1, Math.min(a.size, b.size));
};

function evidence(args: { code: string; statement: string; objective: Objective; manifest: any; reviewer: any; proposalVersion: string; reviewId: string }) {
  const { code, statement, objective, manifest, reviewer, proposalVersion, reviewId } = args;
  const block = objective.block;
  const sourceDigest = String(manifest.book.sha256);
  const sourceIdentity = `${manifest.book.title} [${manifest.book.key}:${manifest.chapter.id}:${manifest.sourceLesson.id}]`;
  return {
    evidenceId: sha({ code, sourceDigest, sourceIdentity, sourceBlockId: block.id, statement }),
    originType: "textbook_derived_internal",
    sourceDigest,
    sourceIdentity,
    sourceLocators: [{ sourceBlockId: block.id, physicalPageIndex: block.physicalPageIndex, printedPageLabel: block.printedPageLabel || undefined, locator: `Hộp MỤC TIÊU — PDF trang ${block.physicalPageIndex}: ${objective.text}` }],
    reviewReference: { proposalVersion, reviewId, reviewerName: reviewer.fullName, reviewerEmail: reviewer.email, reason, reviewedAt: new Date().toISOString(), decision: "approved_internal" },
  };
}

async function request(path: string, token: string | null, method = "GET", body?: unknown) {
  const response = await fetch(apiBase + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const value: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(value).slice(0, 800)}`);
  return value;
}

async function main() {
  const reviewer = await db.user.findFirst({ where: { role: "ADMIN", status: "active", email: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, fullName: true, email: true } });
  if (!reviewer?.email) throw new Error("No active ADMIN reviewer with email");
  const structured9 = new Map<string, any>();
  for (const name of readdirSync(resolve(khtn9Root, "exports/structured")).filter((name) => name.endsWith(".json"))) {
    const manifest = json(resolve(khtn9Root, "exports/structured", name));
    structured9.set(manifest.sourceLesson.id, manifest);
  }
  const registry9 = json(resolve(khtn9Root, "release-prep/outcome-registry.json"));
  const proposalVersion = sha({ frameworkId, citation, khtn9Registry: registry9, khtn8Book: "sgk-khtn8" });
  const reviewId = `owner-review-${proposalVersion.slice(0, 24)}`;
  const evidence9 = new Map<string, any[]>();
  const mismatches: string[] = [];
  for (const outcome of registry9.outcomes.filter((item: any) => !item.defect)) {
    const entries: any[] = [];
    for (const sourceLessonId of outcome.lessons) {
      const manifest = structured9.get(sourceLessonId);
      const lessonRegistry = registry9.lessons[sourceLessonId];
      if (!manifest || !lessonRegistry) continue;
      const lessonObjectives = objectives(manifest.sourceBlocks || []);
      const position = lessonRegistry.outcomeCodes.indexOf(outcome.code);
      const exact = lessonObjectives.find((item) => fold(item.text) === fold(outcome.statement));
      const ranked = lessonObjectives.map((item) => ({ item, score: overlap(item.text, outcome.statement) })).sort((a, b) => b.score - a.score);
      const selected = exact || (ranked[0]?.score >= 0.35 ? ranked[0].item : null) || (position >= 0 && position < lessonObjectives.length ? lessonObjectives[position] : null);
      if (!selected) continue;
      if (!exact && fold(selected.text) !== fold(outcome.statement)) mismatches.push(`${outcome.code} [overlap=${overlap(selected.text, outcome.statement).toFixed(2)}]: ${outcome.statement} <> ${selected.text}`);
      entries.push(evidence({ code: outcome.code, statement: outcome.statement, objective: selected, manifest, reviewer, proposalVersion, reviewId }));
    }
    if (entries.length) evidence9.set(outcome.code, entries);
  }

  const versions8 = await db.contentPackVersion.findMany({ where: { manifest: { path: ["book", "key"], equals: "sgk-khtn8" }, status: "released", synthetic: false }, include: { pack: true }, orderBy: { createdAt: "asc" } });
  const lessons8 = versions8.map((version: any) => ({ version, manifest: version.manifest, start: Number(version.manifest?.pdfPageRange?.start || 0) })).sort((a, b) => a.start - b.start);
  const chapterInfo: Record<string, { code: string; order: number; domain: string; title: string }> = {
    "chapter-unassigned": { code: "KHTN8-INTRO", order: 0, domain: "MATTER", title: "Mở đầu" },
    "chapter-i": { code: "KHTN8-CH01", order: 1, domain: "MATTER", title: "Chương I. Phản ứng hoá học" },
    "chapter-ii": { code: "KHTN8-CH02", order: 2, domain: "MATTER", title: "Chương II. Một số hợp chất thông dụng" },
    "chapter-iii": { code: "KHTN8-CH03", order: 3, domain: "ENERGY", title: "Chương III. Khối lượng riêng và áp suất" },
    "chapter-iv": { code: "KHTN8-CH04", order: 4, domain: "ENERGY", title: "Chương IV. Tác dụng làm quay của lực" },
    "chapter-v": { code: "KHTN8-CH05", order: 5, domain: "ENERGY", title: "Chương V. Điện" },
    "chapter-vi": { code: "KHTN8-CH06", order: 6, domain: "ENERGY", title: "Chương VI. Nhiệt" },
    "chapter-vii": { code: "KHTN8-CH07", order: 7, domain: "LIVING", title: "Chương VII. Sinh học cơ thể người" },
    "chapter-viii": { code: "KHTN8-CH08", order: 8, domain: "LIVING", title: "Chương VIII. Sinh vật và môi trường" },
  };
  const plans8: any[] = [];
  for (let index = 0; index < lessons8.length; index++) {
    const { version, manifest } = lessons8[index];
    const chapter = chapterInfo[manifest.chapter.id];
    const lessonObjectives = objectives(manifest.sourceBlocks || []);
    if (!chapter || !lessonObjectives.length) {
      mismatches.push(`${manifest.sourceLesson.id}: missing chapter or MỤC TIÊU objectives`);
      continue;
    }
    const order = index + 1;
    const topicCode = `KHTN8-L${String(order).padStart(2, "0")}`;
    const outcomeRows = lessonObjectives.map((objective, outcomeIndex) => {
      const code = `KHTN8-B${String(order).padStart(2, "0")}-O${String(outcomeIndex + 1).padStart(2, "0")}`;
      return { code, grade: 8, domain: chapter.domain, chapter: chapter.title, statement: objective.text, sourceEvidence: [evidence({ code, statement: objective.text, objective, manifest, reviewer, proposalVersion, reviewId })] };
    });
    plans8.push({ versionId: version.id, packKey: version.packKey, lessonId: version.lessonId, title: manifest.sourceLesson.title, chapter, topicCode, order, outcomes: outcomeRows });
  }

  const missing9 = registry9.outcomes.filter((item: any) => !item.defect && !evidence9.has(item.code)).map((item: any) => item.code);
  const summary = { apply, frameworkId, reviewer: { id: reviewer.id, fullName: reviewer.fullName, email: reviewer.email }, khtn9: { structuredLessons: structured9.size, outcomes: registry9.outcomes.filter((item: any) => !item.defect).length, evidenceReady: evidence9.size, missing: missing9.length, missingCodes: missing9 }, khtn8: { lessons: lessons8.length, classificationsReady: plans8.length, outcomes: plans8.reduce((sum, row) => sum + row.outcomes.length, 0), chapters: [...new Set(plans8.map((row) => row.chapter.code))].length }, mismatches };
  console.log(JSON.stringify(summary, null, 2));
  if (missing9.length || plans8.length !== 47) throw new Error("Evidence plan is incomplete; no writes performed");
  if (!apply) return;

  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  const temporarySession = await db.session.create({ data: { userId: reviewer.id, tokenHash: sha(randomBytes(32)), remember: false, expiresAt: new Date(Date.now() + 15 * 60_000) } });
  const token = sign({ sub: reviewer.id, role: "ADMIN", sid: temporarySession.id }, process.env.JWT_SECRET, { expiresIn: "15m", issuer: "nexalab" });
  try {
  const taxonomy = await request("/admin/taxonomy", token);
  if (!taxonomy.frameworks.some((item: any) => item.id === frameworkId)) {
    await request("/admin/frameworks", token, "POST", {
      id: frameworkId,
      frameworkKey: "MOET-TT32-2018-KHTN",
      title: "Chương trình Giáo dục phổ thông môn Khoa học tự nhiên — Kết nối tri thức với cuộc sống",
      version: "2018-KNTT",
      sourceMetadata: {
        authority: "Bộ Giáo dục và Đào tạo",
        url: "https://vanban.chinhphu.vn/?pageid=27160&docid=195562",
        publishedAt: "2018-12-26",
        accessedAt: "2026-10-25",
        sha256: sha(citation),
        checksumScope: "canonical_citation",
        citation,
        regulation: "Thông tư số 32/2018/TT-BGDĐT",
        textbook: { title: "Khoa học tự nhiên — Kết nối tri thức với cuộc sống", publisher: "Nhà xuất bản Giáo dục Việt Nam", gradeRange: "6-9" },
      },
      subjects: [6, 7, 8, 9].map((grade) => ({ subjectId: "khtn", grade })),
      reason,
    });
  }

  for (const outcome of registry9.outcomes.filter((item: any) => !item.defect)) {
    try {
      await request(`/admin/outcomes/${encodeURIComponent(outcome.code)}`, token, "PUT", { statement: outcome.statement, status: "active", sourceEvidence: evidence9.get(outcome.code), reason });
    } catch (error) {
      if (!String(error).includes("OUTCOME_EVIDENCE_CONFLICT")) throw error;
    }
  }

  const knownChapters = new Set(taxonomy.chapters.map((item: any) => item.code));
  const knownOutcomes = new Set(taxonomy.outcomes.map((item: any) => item.code));
  const knownTopics = new Set(taxonomy.topics.map((item: any) => item.code));
  for (const chapter of Object.values(chapterInfo)) if (!knownChapters.has(chapter.code)) await request("/admin/chapters", token, "POST", { code: chapter.code, subjectId: "khtn", grade: 8, domain: chapter.domain === "MATTER" || chapter.domain === "ENERGY" || chapter.domain === "LIVING" ? chapter.domain : "KHTN", title: chapter.title, officialOrder: chapter.order, reason });
  for (const plan of plans8) {
    for (const outcome of plan.outcomes) if (!knownOutcomes.has(outcome.code)) {
      try { await request("/admin/outcomes", token, "POST", { ...outcome, reason }); }
      catch (error) { if (!String(error).includes("OUTCOME_EXISTS")) throw error; }
    }
    if (!knownTopics.has(plan.topicCode)) {
      try { await request("/admin/topics", token, "POST", { code: plan.topicCode, chapterCode: plan.chapter.code, title: plan.title, officialOrder: plan.order, outcomeCodes: plan.outcomes.map((row: any) => row.code), reason }); }
      catch (error) { if (!String(error).includes("TOPIC_EXISTS")) throw error; }
    }
  }
  for (let i = 0; i < plans8.length; i += 5) {
    await Promise.all(plans8.slice(i, i + 5).map(async (plan) => {
      try {
        await request(`/admin/structured-lessons/drafts/${encodeURIComponent(plan.versionId)}/classification`, token, "PUT", { subjectId: "khtn", grade: 8, domain: plan.chapter.domain, chapterCode: plan.chapter.code, topicCode: plan.topicCode, order: plan.order, outcomeCodes: plan.outcomes.map((row: any) => row.code), reviewerName: reviewer.fullName, reviewerEmail: reviewer.email, reason });
      } catch (error) {
        if (!String(error).includes("CLASSIFICATION_LEGACY_LESSON_NOT_UNCLASSIFIED")) throw error;
      }
    }));
  }
  console.log(JSON.stringify({ applied: true, frameworkId, khtn9OutcomesUpdated: evidence9.size, khtn8LessonsClassified: plans8.length }, null, 2));
  } finally {
    await db.session.deleteMany({ where: { id: temporarySession.id } });
  }
}

main().finally(() => db.$disconnect());
