import { AppError } from "@/lib/config";
import { checkResponse, responseJson, sameOriginUrl } from "../http";
import { documentText, enc, item, readableFile } from "../provider-utils";
import type { Connector, ConnectorContext } from "../types";
const base = (ctx: ConnectorContext) => (ctx.config.baseUrl || "https://gitlab.com").replace(/\/+$/, "") + "/api/v4";
const headers = (ctx: ConnectorContext): Record<string, string> => ctx.credential.accessToken ? { Authorization: `Bearer ${ctx.credential.accessToken}` } : ctx.credential.token ? { "PRIVATE-TOKEN": ctx.credential.token } : {};
function parts(id: string) {
  const [project, ...path] = id.split("|");
  if (!/^\d+$/.test(project)) throw new AppError("Invalid GitLab project identifier.", 400);
  return { project, path: path.join("|") };
}
const next = (link?: string) => link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
export const gitlab: Connector = {
  id: "gitlab", name: "GitLab", category: "Code repositories", auth: ["token", "oauth2"],
  description: "Select projects, repository folders, documentation and source files from GitLab.com or a public HTTPS GitLab server.",
  fields: [{ key: "baseUrl", label: "GitLab origin (default https://gitlab.com)" }, { key: "ref", label: "Branch or tag (optional; default HEAD)" }],
  async list(ctx, parent, cursor) {
    const api = base(ctx);
    if (!parent) {
      const response = await ctx.request(sameOriginUrl(api, cursor || `${api}/projects?membership=true&per_page=100&order_by=id&sort=asc`), { headers: headers(ctx) });
      return { items: responseJson<{ id: number; path_with_namespace: string; web_url: string }[]>(response).map((p) => item(`${p.id}|`, p.path_with_namespace, "container", p.web_url)), cursor: next(response.headers.link) };
    }
    const { project, path } = parts(parent), query = new URLSearchParams({ path, ref: ctx.config.ref || "HEAD", per_page: "100", pagination: "keyset" });
    const response = await ctx.request(sameOriginUrl(api, cursor || `${api}/projects/${project}/repository/tree?${query}`), { headers: headers(ctx) });
    const entries = responseJson<{ id: string; name: string; path: string; type: string; mode: string }[]>(response);
    return { items: entries.filter((f) => f.type === "tree" || f.type === "blob" && !["120000", "160000"].includes(f.mode) && readableFile(f.name)).map((f) => item(`${project}|${f.path}`, f.name, f.type === "tree" ? "container" : "document", undefined, f.id)), cursor: next(response.headers.link) };
  },
  async read(ctx, id, previous) {
    const { project, path } = parts(id), api = base(ctx), ref = ctx.config.ref || "HEAD";
    const url = `${api}/projects/${project}/repository/files/${enc(path)}`;
    const metadata = checkResponse(await ctx.request(`${url}?ref=${enc(ref)}`, { method: "HEAD", headers: headers(ctx) }));
    const projectInfo = responseJson<{ web_url: string; default_branch: string }>(await ctx.request(`${api}/projects/${project}`, { headers: headers(ctx) }));
    const meta = { name: path.split("/").at(-1) || path, version: metadata.headers["x-gitlab-content-sha256"], url: `${projectInfo.web_url}/-/blob/${enc(ref === "HEAD" ? projectInfo.default_branch : ref)}/${path.split("/").map(enc).join("/")}` };
    if (previous && previous === meta.version) return meta;
    return { ...meta, text: await documentText(meta.name, await ctx.request(`${url}/raw?ref=${enc(ref)}`, { headers: headers(ctx) })) };
  },
};
