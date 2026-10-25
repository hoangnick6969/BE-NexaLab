/** Canonicalize authored lesson HTML before it is persisted or materialized. */
export function normalizeLessonHtml(input: string): string {
  let html = input.replace(/<p>\s*\\-\s*/g, "<p>– ");
  html = html.replace(/<h2>\s*\?\s*<\/h2>/gi, "<h3>Câu hỏi thảo luận</h3>");
  html = html.replace(/<p>\s*(Mô tả hình:[\s\S]*?)<\/p>/gi, '<figure class="figure-note"><figcaption>$1</figcaption></figure>');
  const rows = (block: string) => [...block.matchAll(/<p>\s*\|([\s\S]*?)\|\s*<\/p>/gi)].map((m) => m[1].split("|").map((c) => c.trim()));
  html = html.replace(/<p>\s*\|[\s\S]*?\|\s*<\/p>(?:\s*<p>\s*\|[\s\S]*?\|\s*<\/p>)+/gi, (block) => {
    const parsed = rows(block); if (parsed.length < 2) return block;
    const hasSeparator = parsed[1].every((cell) => /^:?-{3,}:?$/.test(cell));
    const head = parsed[0]; const body = parsed.slice(hasSeparator ? 2 : 1);
    return `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  });
  return html;
}

export function khtn9Curriculum(key: string) {
  const number = Number(key.match(/(?:^|-)l(\d+)(?:-|$)/)?.[1] ?? 0); if (!number) return {};
  const chapter = number <= 4 ? 1 : number <= 10 ? 2 : number <= 13 ? 3 : number <= 15 ? 4 : number <= 17 ? 5 : number <= 21 ? 6 : number <= 25 ? 7 : number <= 27 ? 8 : number <= 32 ? 9 : number <= 35 ? 10 : number <= 41 ? 11 : number <= 46 ? 12 : 13;
  const code = `KHTN9-CH${String(chapter).padStart(2, "0")}`;
  return { curriculumChapterCode: code, curriculumTopicCode: `${code}-T01`, curriculumOrder: number };
}
