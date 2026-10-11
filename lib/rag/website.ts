import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { AppError } from "@/lib/config";

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateWebsiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("Enter a valid public website URL.", 400);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new AppError(
      "Use a public HTTP or HTTPS page without embedded credentials.",
      400,
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (ipaddr.isValid(host) && !isPublicAddress(host))
  )
    throw new AppError(
      "Private and local network addresses cannot be imported.",
      400,
    );
  url.hash = "";
  return url;
}
async function fetchPage(
  url: URL,
  signal: AbortSignal,
): Promise<{ body: string; location?: string; plainText?: boolean }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === "ipv4" ? 4 : 6 }]
    : await new Promise<{ address: string; family: number }[]>(
        (resolve, reject) => {
          const abort = () =>
            reject(
              new AppError(
                "Website DNS lookup exceeded the import time limit.",
                502,
              ),
            );
          if (signal.aborted) {
            abort();
            return;
          }
          signal.addEventListener("abort", abort, { once: true });
          lookup(host, { all: true })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        },
      );
  if (
    !addresses.length ||
    addresses.some((record) => !isPublicAddress(record.address))
  )
    throw new AppError(
      "This website resolves to a private or reserved address.",
      400,
    );
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        signal,
        headers: {
          "User-Agent": "ResolvoKnowledgeImporter/1.0",
          Accept: "text/html,text/plain",
          "Accept-Encoding": "identity",
        },
        // Pin the validated DNS result; a second lookup must not enable DNS rebinding.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else {
            const record =
              addresses.find(
                (item) => !options.family || item.family === options.family,
              ) ?? addresses[0];
            callback(null, record.address, record.family);
          }
        },
      },
      (response) => {
        const status = response.statusCode ?? 500;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ body: "", location: response.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(
            new AppError(
              "The website could not be downloaded. Check that the page is publicly accessible.",
              400,
            ),
          );
          return;
        }
        if (
          !/^(text\/html|text\/plain)/i.test(
            response.headers["content-type"] ?? "",
          )
        ) {
          response.resume();
          reject(
            new AppError(
              "This URL must return a public HTML or text page.",
              400,
            ),
          );
          return;
        }
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        ) {
          response.resume();
          reject(
            new AppError("Import an uncompressed HTML or text page.", 400),
          );
          return;
        }
        const parts: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 2 * 1024 * 1024) {
            response.destroy();
            reject(
              new AppError(
                "This web page is too large. Import a smaller page.",
                400,
              ),
            );
          } else parts.push(chunk);
        });
        response.on("end", () =>
          resolve({
            body: Buffer.concat(parts).toString("utf8"),
            plainText:
              response.headers["content-type"]?.startsWith("text/plain"),
          }),
        );
        response.on("error", () =>
          reject(new AppError("Website download was interrupted.", 502)),
        );
      },
    );
    req.on("error", () =>
      reject(
        new AppError(
          "The website could not be reached within the import time limit.",
          502,
        ),
      ),
    );
    req.end();
  });
}
export function extractVisibleText(body: string, plainText = false) {
  if (plainText) return { title: "", text: body.replace(/\s+/g, " ").trim() };
  const html = load(body);
  const title = html("title").first().text().trim().slice(0, 160);
  html(
    "script,style,noscript,nav,footer,header,form,iframe,svg,[hidden],[aria-hidden='true']",
  ).remove();
  const root = html("main,article").first();
  return {
    title,
    text: (root.length ? root.text() : html("body").text())
      .replace(/\s+/g, " ")
      .trim(),
  };
}
export async function extractWebsite(value: string) {
  let url = validateWebsiteUrl(value);
  const signal = AbortSignal.timeout(20_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const page = await fetchPage(url, signal);
    if (page.location) {
      url = validateWebsiteUrl(new URL(page.location, url).href);
      continue;
    }
    const { title, text } = extractVisibleText(page.body, page.plainText);
    if (text.length < 20)
      throw new AppError(
        "This page contains too little readable text. Import a page with visible text.",
        400,
      );
    return { name: title || url.hostname, text, locator: url.href };
  }
  throw new AppError("The website redirects too many times.", 400);
}
