import { AppError } from "@/lib/config";
import { authHeaders, documentText, enc, item, json, pageUrl, readableFile } from "../provider-utils";
import { responseJson } from "../http";
import type { Connector } from "../types";
const base = "https://api.github.com";
const headers = { "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" };
type Entry = { type: string; name: string; path: string; sha: string; html_url?: string; submodule_git_url?: string };
function parts(id: string) {
  const [repo, ...path] = id.split("|");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new AppError("Invalid repository identifier.", 400);
  return { repo, path: path.join("|") };
}
const filePath = (repo: string, path: string) => `${base}/repos/${repo}/contents/${path.split("/").map(enc).join("/")}`;
export const github: Connector = {
  id: "github", name: "GitHub", category: "Code repositories", auth: ["oauth2", "token"], fields: [],
  description: "Repository folders, source files and documentation. Requires read access to repository contents.",
  async list(ctx, parent, cursor) {
    if (!parent) {
      const response = await ctx.request(pageUrl(base, "/user/repos?per_page=100&sort=full_name", cursor), { headers: { ...authHeaders(ctx), ...headers } });
      const repos = responseJson<{ full_name: string; html_url: string }[]>(response);
      return { items: repos.map((r) => item(`${r.full_name}|`, r.full_name, "container", r.html_url)), cursor: response.headers.link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
    }
    const { repo, path } = parts(parent);
    const data = await json<Entry[]>(ctx, filePath(repo, path), undefined, headers);
    if (!Array.isArray(data)) throw new AppError("Select a repository directory.", 400);
    if (data.length >= 1000) throw new AppError("GitHub limits this directory listing to 1,000 entries. Select smaller directories or use a custom API connector.", 422);
    return { items: data.filter((f) => !f.submodule_git_url && (f.type === "dir" || f.type === "file" && readableFile(f.name)))
      .map((f) => item(`${repo}|${f.path}`, f.name, f.type === "dir" ? "container" : "document", f.html_url, f.sha)) };
  },
  async read(ctx, id, previous) {
    const { repo, path } = parts(id), url = filePath(repo, path);
    const f = await json<Entry>(ctx, url, undefined, headers);
    if (f.type !== "file" || f.submodule_git_url) throw new AppError("Select a readable repository file.", 422);
    const meta = { name: f.name, url: f.html_url, version: f.sha };
    if (previous && previous === f.sha) return meta;
    return { ...meta, text: await documentText(f.name, await ctx.request(url, { headers: { ...authHeaders(ctx), ...headers, Accept: "application/vnd.github.raw+json" } })) };
  },
};
