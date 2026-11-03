import { AppError } from "@/lib/config";
import { enc, item, json } from "../provider-utils";
import type { Connector, ConnectorContext } from "../types";
const base = "https://api.notion.com/v1", headers = { "Notion-Version": "2025-09-03" };
type RichText = { plain_text?: string; text?: { content?: string } };
type Page = { id: string; url: string; archived?: boolean; in_trash?: boolean; last_edited_time: string; properties: Record<string, { title?: RichText[] }> };
type Block = { id: string; type: string; has_children: boolean; [key: string]: unknown };
const plain = (parts?: RichText[]) => (parts ?? []).map((p) => p.plain_text ?? p.text?.content ?? "").join("");
const title = (page: Page) => Object.values(page.properties).map((p) => plain(p.title)).find(Boolean) || "Untitled page";
async function blocks(ctx: ConnectorContext, id: string, seen: Set<string>, budget: { calls: number }): Promise<string> {
  if (seen.has(id)) return ""; seen.add(id);
  const result: string[] = []; let cursor: string | undefined;
  do {
    if (++budget.calls > 35) throw new AppError("This Notion page has too many nested blocks for one import. Select smaller pages.", 422);
    const page = await json<{ results: Block[]; has_more: boolean; next_cursor?: string }>(ctx, `${base}/blocks/${enc(id)}/children?page_size=100${cursor ? `&start_cursor=${enc(cursor)}` : ""}`, undefined, headers);
    for (const block of page.results) {
      const data = block[block.type] as { rich_text?: RichText[]; cells?: RichText[][]; title?: string; url?: string; caption?: RichText[] } | undefined;
      const text = data?.cells ? data.cells.map(plain).join(" | ") : plain(data?.rich_text) || data?.title || plain(data?.caption);
      if (text) result.push((block.type.startsWith("heading_") ? "# ".repeat(Number(block.type.at(-1))) : "") + text);
      if (block.has_children && block.type !== "child_page" && block.type !== "child_database") result.push(await blocks(ctx, block.id, seen, budget));
    }
    if (page.has_more && !page.next_cursor) throw new AppError("Notion returned incomplete block pagination.", 502);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return result.filter(Boolean).join("\n\n");
}
export const notion: Connector = {
  id: "notion", name: "Notion", category: "Productivity", auth: ["token"], fields: [],
  description: "Pages shared with a Notion integration, including nested text, lists and tables. Use an internal integration token.",
  async list(ctx, _parent, cursor) {
    const data = await json<{ results: Page[]; has_more: boolean; next_cursor?: string }>(ctx, `${base}/search`, { page_size: 100, filter: { property: "object", value: "page" }, ...(cursor ? { start_cursor: cursor } : {}) }, headers);
    return { items: data.results.filter((p) => !p.archived && !p.in_trash).map((p) => item(p.id, title(p), "document", p.url, p.last_edited_time)), cursor: data.has_more ? data.next_cursor : undefined };
  },
  async read(ctx, id, previous) {
    const page = await json<Page>(ctx, `${base}/pages/${enc(id)}`, undefined, headers);
    if (page.archived || page.in_trash) throw new AppError("This Notion page was removed.", 404);
    const meta = { name: title(page), url: page.url, version: page.last_edited_time };
    if (previous === page.last_edited_time) return meta;
    return { ...meta, text: `# ${meta.name}\n\n${await blocks(ctx, id, new Set(), { calls: 0 })}` };
  },
};
