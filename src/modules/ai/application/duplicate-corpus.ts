/**
 * Duplicate corpus for VW-01/VW-02: question prompts and card fronts of the class's non-archived resources, read at
 * validation time outside the write transaction. A resource created between validation and review is not re-checked
 * (accepted race, covered by teacher review).
 */
export async function loadDuplicateCorpus(db: any, classId: string): Promise<string[]> {
  const resources = await db.classResource.findMany({
    where: { classId, status: { in: ["DRAFT", "PUBLISHED"] } },
    select: { kind: true, content: true },
  });
  const corpus: string[] = [];
  for (const resource of resources) {
    const content = resource.content as any;
    if (resource.kind === "DECK") for (const card of content?.cards ?? []) if (typeof card?.front === "string") corpus.push(card.front);
    if (resource.kind !== "DECK") for (const question of content?.questions ?? []) if (typeof question?.prompt === "string") corpus.push(question.prompt);
  }
  return corpus;
}
