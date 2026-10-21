import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { HostError } from "./sessions.ts";
import { createPlanningCredentials } from "./planning-credentials.ts";
import { planningEndpoint, planningProviderConfig } from "./planning-provider.ts";
import { normalizedBytes, sha256 } from "./storage/records.ts";

const stored = z.strictObject({ config: planningProviderConfig, credentialIdentity: z.string().uuid() });
export const planningConfigInput = planningProviderConfig.omit({ revision: true }).extend({
  expectedRevision: z.number().int().nonnegative().safe(), apiKey: z.string().max(16384).nullable() });

export function createPlanningConfig(machineDirectory: string | undefined, executable: string) {
  const credentials = createPlanningCredentials(executable);
  let tail: Promise<unknown> = Promise.resolve();
  const path = () => {
    if (!machineDirectory) throw new HostError("COMPONENT_NOT_READY", 503, "A machine data directory is required for provider configuration.");
    return join(machineDirectory, "planning-provider.json");
  };
  const read = async () => {
    try { return stored.parse(JSON.parse(await readFile(path(), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  const describe = async () => {
    const value = await read();
    return { config: value?.config ?? null, keyConfigured: value ? await credentials.configured(value.credentialIdentity) : false };
  };
  return {
    describe,
    async get() {
      const value = await read();
      if (!value) throw new HostError("COMPONENT_NOT_READY", 409, "Configure a provider before preparing a generation request.");
      return value;
    },
    key: (identity: string) => credentials.get(identity),
    save(input: z.infer<typeof planningConfigInput>) {
      const action = tail.then(async () => {
        const value = planningConfigInput.parse(input), old = await read();
        if ((old?.config.revision ?? 0) !== value.expectedRevision) throw new HostError("REVISION_CONFLICT", 409, "Provider configuration changed.");
        const { apiKey, expectedRevision, ...fields } = value;
        const config = planningProviderConfig.parse({ ...fields, revision: expectedRevision + 1 });
        planningEndpoint(config);
        const destinationChanged = old && ["baseUrl", "protocol", "providerId"].some(field =>
          old.config[field as "baseUrl" | "protocol" | "providerId"] !== config[field as "baseUrl" | "protocol" | "providerId"]);
        if (apiKey === null && (!old || destinationChanged)) throw new HostError("INVALID_ARGUMENT", 400, "Supply a key for the newly selected provider destination.");
        const credentialIdentity = apiKey === null ? old!.credentialIdentity : randomUUID();
        if (apiKey !== null) await credentials.put(credentialIdentity, apiKey);
        const filename = path();
        await mkdir(machineDirectory!, { recursive: true, mode: 0o700 });
        const temporary = `${filename}.${randomUUID()}.tmp`;
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify({ config, credentialIdentity }) + "\n", "utf8"); await file.sync(); }
        finally { await file.close(); }
        await rename(temporary, filename);
        return describe();
      });
      tail = action.catch(() => {});
      return action;
    },
    digest: (config: unknown) => sha256(normalizedBytes(config)),
  };
}
