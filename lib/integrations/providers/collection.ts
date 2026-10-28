import { AppError } from "@/lib/config";
import { authHeaders, item } from "../provider-utils";
import { responseJson, sameOriginUrl } from "../http";
import type { Connector, ConnectorContext, RemoteDocument } from "../types";
export interface CollectionSpec {
  definition: Omit<Connector, "list" | "read">;
  base(ctx: ConnectorContext): string;
  listPath(ctx: ConnectorContext, cursor?: string): string;
  readPath(ctx: ConnectorContext, id: string): string;
  page(value: unknown, ctx: ConnectorContext): { records: unknown[]; cursor?: string };
  document(value: unknown, ctx: ConnectorContext): RemoteDocument & { id: string };
  headers?(ctx: ConnectorContext): Record<string, string>;
}
export function collectionConnector(spec: CollectionSpec): Connector {
  async function get(ctx: ConnectorContext, path: string) {
    return responseJson<unknown>(await ctx.request(sameOriginUrl(spec.base(ctx), path), { headers: spec.headers ? spec.headers(ctx) : authHeaders(ctx) }));
  }
  return { ...spec.definition,
    async list(ctx, parent, cursor) {
      if (parent && parent !== "@collection") throw new AppError("Invalid collection identifier.", 400);
      const page = spec.page(await get(ctx, spec.listPath(ctx, cursor)), ctx);
      if (!Array.isArray(page.records)) throw new AppError("The provider returned an invalid record collection.", 502);
      const items = page.records.map((r) => { const d = spec.document(r, ctx); return item(d.id, d.name, "document", d.url, d.version); });
      if (!parent && !cursor) items.unshift(item("@collection", "All records (including future additions)", "container"));
      return { items, cursor: page.cursor };
    },
    async read(ctx, id, previous) {
      const d = spec.document(await get(ctx, spec.readPath(ctx, id)), ctx);
      return { ...d, text: previous && previous === d.version ? undefined : d.text };
    },
  };
}
