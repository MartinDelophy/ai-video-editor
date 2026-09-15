import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const indexPath = "/.well-known/agent-skills/index.json";
const skillDirectory = ".well-known/agent-skills";

export const agentDiscoveryLinkHeader = [
  '</agent-guide.md>; rel="service-doc"; type="text/markdown"; title="Timeline Studio agent guide"',
  `<${indexPath}>; rel="https://agentskills.io/discovery"; type="application/json"`,
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ");

function skillIndex(publicDirectory) {
  const directory = join(publicDirectory, skillDirectory);
  const skills = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const bytes = readFileSync(join(directory, entry.name, "SKILL.md"));
      const frontmatter = bytes
        .toString("utf8")
        .match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      const name = frontmatter?.match(/^name: ([a-z0-9]+(?:-[a-z0-9]+)*)\r?$/m)?.[1];
      const description = frontmatter?.match(/^description: (.+?)\r?$/m)?.[1];
      if (name !== entry.name || name.length > 64 || !description || description.length > 1024) {
        throw new Error(`Invalid discovery skill metadata: ${entry.name}/SKILL.md`);
      }
      return {
        name,
        type: "skill-md",
        description,
        url: `/.well-known/agent-skills/${entry.name}/SKILL.md`,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      };
    });
  return `${JSON.stringify({ $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json", skills }, null, 2)}\n`;
}

function writeSkillIndex(publicDirectory) {
  const file = join(publicDirectory, indexPath);
  const content = skillIndex(publicDirectory);
  if (!existsSync(file) || readFileSync(file, "utf8") !== content) writeFileSync(file, content);
}

function discoveryMiddleware(publicDirectory, refreshIndex = false) {
  return (request, response, next) => {
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      return next();
    }
    if (
      path !== "/agent-guide.md" &&
      path !== "/auth.md" &&
      path !== "/.well-known" &&
      !path.startsWith("/.well-known/")
    )
      return next();
    const file = resolve(publicDirectory, `.${path}`);
    if (
      !file.startsWith(`${resolve(publicDirectory)}${sep}`) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : "Not found.\n");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    if (refreshIndex && path === indexPath) writeSkillIndex(publicDirectory);
    const contentType = path.endsWith(".md")
      ? "text/markdown; charset=utf-8"
      : path.endsWith(".json")
        ? "application/json; charset=utf-8"
        : null;
    if (!contentType) return next();
    const bytes = readFileSync(file);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": bytes.byteLength,
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      Link: agentDiscoveryLinkHeader,
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  };
}

// Discovery is a static build artifact; no server or credentials are required.
export function agentDiscoveryPlugin() {
  let configuration;
  return {
    name: "timeline-agent-discovery",
    configResolved(config) {
      configuration = config;
      writeSkillIndex(config.publicDir);
    },
    configureServer(server) {
      server.middlewares.use(discoveryMiddleware(configuration.publicDir, true));
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        discoveryMiddleware(resolve(configuration.root, configuration.build.outDir)),
      );
    },
    writeBundle() {
      const outputDirectory = resolve(configuration.root, configuration.build.outDir);
      const publishedIndex = readFileSync(join(outputDirectory, indexPath), "utf8");
      if (publishedIndex !== skillIndex(outputDirectory)) {
        throw new Error(
          "Published agent skill bytes do not match the discovery index. Rebuild before deploying.",
        );
      }
    },
  };
}
