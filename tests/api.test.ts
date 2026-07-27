import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp, type AppOptions } from "../src/app.ts";

process.env.GLM_API_KEY = "";

async function withServer(
  options: AppOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createApp(options).listen(0, "127.0.0.1");
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

function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBatchRequest = {
  surname: "林",
  expectations: ["温和有分寸"],
  additionalNote: "避免生僻字",
};

test("合法首轮请求保持原有成功响应结构", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await response.json() as {
      requestId?: string;
      source?: string;
      degraded?: boolean;
      degradationReason?: string;
      candidates?: Array<{ id?: string; name?: string; meaning?: string; origin?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(typeof body.requestId, "string");
    assert.equal(body.source, "fallback");
    assert.equal(body.degraded, true);
    assert.equal(body.degradationReason, "AI_NOT_CONFIGURED");
    assert.equal(body.candidates?.length, 6);
    assert.equal(typeof body.candidates[0].id, "string");
    assert.equal(typeof body.candidates[0].name, "string");
    assert.equal(typeof body.candidates[0].meaning, "string");
    assert.equal(typeof body.candidates[0].origin, "string");
  });
});

test("畸形字段返回 400，且不会使服务退出", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const invalidResponse = await postJson(baseUrl, "/api/naming/batch-1", {
      surname: {},
      expectations: [1],
    });
    const invalidBody = await invalidResponse.json() as { error?: string };

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.error, "INVALID_REQUEST");

    const recoveryResponse = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    assert.equal(recoveryResponse.status, 200);
  });
});

test("非法 JSON 和过大请求体被拒绝", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const malformedResponse = await fetch(`${baseUrl}/api/naming/batch-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{\"surname\":",
    });
    assert.equal(malformedResponse.status, 400);

    const oversizedResponse = await postJson(baseUrl, "/api/naming/batch-1", {
      ...validBatchRequest,
      additionalNote: "长".repeat(20_000),
    });
    assert.equal(oversizedResponse.status, 413);
  });
});

test("超过请求额度时返回 429", async () => {
  await withServer({ rateLimitMax: 2, rateLimitWindowMs: 60_000 }, async (baseUrl) => {
    const first = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const second = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const third = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await third.json() as { error?: string };

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(body.error, "RATE_LIMITED");
  });
});

test("短名单在服务端过滤已展示名字", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/shortlist", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: [{
        candidateId: "candidate-1",
        feedback: "like",
        name: "林清和",
        meaning: "温和有分寸。",
        origin: "清雅意象",
      }],
      refinements: ["更有书卷气"],
      excludeNames: ["林清和", "林修远"],
    });
    const body = await response.json() as {
      source?: string;
      degraded?: boolean;
      candidates?: Array<{ name: string; fitReason?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, "fallback");
    assert.equal(body.degraded, true);
    assert.equal(body.candidates?.length, 3);
    assert.ok(body.candidates?.some((candidate) => candidate.name === "林清和"));
    assert.ok(body.candidates?.every((candidate) => candidate.name !== "林修远"));
    assert.ok(body.candidates?.every((candidate) => !candidate.fitReason?.includes("。。")));
  });
});

test("fallback 使用用户姓氏并固定返回 6 个首轮候选", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", {
      surname: "王",
      expectations: ["沉稳可靠"],
    });
    const body = await response.json() as { candidates?: Array<{ name: string }> };

    assert.equal(response.status, 200);
    assert.equal(body.candidates?.length, 6);
    assert.ok(body.candidates?.every((candidate) => candidate.name.startsWith("王")));
  });
});

test("refresh 会在第一组耗尽后使用下一组 fallback", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/shortlist/refresh", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: [{
        candidateId: "candidate-1",
        feedback: "neutral",
        name: "林清和",
      }],
      refinements: [],
      excludeCandidateNames: ["林修远", "林以忱", "林景行"],
    });
    const body = await response.json() as { candidates?: Array<{ name: string }> };
    const names = body.candidates?.map((candidate) => candidate.name).sort();

    assert.equal(response.status, 200);
    assert.deepEqual(names, ["林初霁", "林归远", "林砚秋"].sort());
  });
});
