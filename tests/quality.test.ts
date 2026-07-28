import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";

process.env.GLM_API_KEY = "";
process.env.NAMING_TELEMETRY_ENABLED = "false";

interface Candidate {
  id: string;
  name: string;
  meaning: string;
  origin: string;
  coreMeaning?: string;
  fitReason?: string;
}

const qualityCases = [
  { surname: "林", expectations: ["温和有分寸"] },
  { surname: "欧阳", expectations: ["有志向看得远", "儒雅有底蕴"] },
  { surname: "司马", expectations: ["正直有原则", "自由开阔"] },
];

const prohibitedContent = /完美契合|完美满足|唯一最佳|保证|出自|源自|见于/u;
const transparentOrigin = /(取意|意象|字义|字意|化用)/u;

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = createApp({ rateLimitMax: 100, aiClient: null }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertContentQuality(candidate: Candidate, surname: string) {
  assert.match(candidate.name, /^\p{Script=Han}+$/u);
  assert.ok(candidate.name.startsWith(surname));
  assert.ok(candidate.name.length > surname.length);
  assert.match(candidate.origin, transparentOrigin);
  assert.doesNotMatch(
    [candidate.meaning, candidate.origin, candidate.coreMeaning, candidate.fitReason]
      .filter((value): value is string => typeof value === "string")
      .join("\n"),
    prohibitedContent,
  );
}

test("固定质量样本在首轮与精细筛选中保持姓名、去重和内容约束", async () => {
  await withServer(async (baseUrl) => {
    for (const qualityCase of qualityCases) {
      const batchResponse = await postJson(baseUrl, "/api/naming/batch-1", qualityCase);
      const batchBody = await batchResponse.json() as {
        source?: string;
        degraded?: boolean;
        candidates?: Candidate[];
      };

      assert.equal(batchResponse.status, 200);
      assert.equal(batchBody.source, "fallback");
      assert.equal(batchBody.degraded, true);
      assert.equal(batchBody.candidates?.length, 6);
      const batchCandidates = batchBody.candidates || [];
      assert.equal(new Set(batchCandidates.map((candidate) => candidate.name)).size, batchCandidates.length);
      batchCandidates.forEach((candidate) => assertContentQuality(candidate, qualityCase.surname));

      const liked = batchCandidates[0];
      const shortlistResponse = await postJson(baseUrl, "/api/naming/shortlist", {
        ...qualityCase,
        candidateFeedbacks: [{
          candidateId: liked.id,
          feedback: "like",
          name: liked.name,
          meaning: liked.meaning,
          origin: liked.origin,
        }],
        refinements: ["更有书卷气"],
        excludeNames: batchCandidates.map((candidate) => candidate.name),
      });
      const shortlistBody = await shortlistResponse.json() as { candidates?: Candidate[] };

      assert.equal(shortlistResponse.status, 200);
      assert.equal(shortlistBody.candidates?.length, 3);
      const shortlistCandidates = shortlistBody.candidates || [];
      assert.equal(new Set(shortlistCandidates.map((candidate) => candidate.name)).size, shortlistCandidates.length);
      shortlistCandidates.forEach((candidate) => assertContentQuality(candidate, qualityCase.surname));
      assert.ok(shortlistCandidates.some((candidate) => candidate.name === liked.name));
      assert.ok(shortlistCandidates
        .filter((candidate) => candidate.name !== liked.name)
        .every((candidate) => !batchCandidates.some((batch) => batch.name === candidate.name)));
    }
  });
});
