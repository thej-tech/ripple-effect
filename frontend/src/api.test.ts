import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, collectPages } from "./api";

const config = {
  baseUrl: "http://localhost:8000/",
  userId: "user-id",
  organizationId: "organization-id",
};

describe("ApiClient", () => {
  it("loads saved commentary without inference and treats only 404 as missing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ model: "saved", explanation: "Stored text" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Not saved" } }), {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Database unavailable" } }),
          { status: 503 },
        ),
      );
    const client = new ApiClient(config, fetcher);
    await expect(client.getSavedExplanation("run", "entity")).resolves.toEqual({
      model: "saved",
      explanation: "Stored text",
    });
    await expect(
      client.getSavedExplanation("run", "entity"),
    ).resolves.toBeNull();
    await expect(
      client.getSavedExplanation("run", "entity"),
    ).rejects.toMatchObject({ status: 503 });
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toContain("/ai-explanation?entity_id=entity");
      expect(init?.method).not.toBe("POST");
    }
  });

  it("collects every page using the server's returned page size", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: ["first", "second"],
        offset: 0,
        limit: 2,
        total: 3,
      })
      .mockResolvedValueOnce({
        items: ["last"],
        offset: 2,
        limit: 2,
        total: 3,
      });
    await expect(collectPages(load)).resolves.toEqual([
      "first",
      "second",
      "last",
    ]);
    expect(load.mock.calls).toEqual([[0], [2]]);
  });

  it("fails visibly instead of silently accepting a non-advancing page", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ items: ["first"], offset: 0, limit: 1, total: 3 });
    await expect(collectPages(load)).rejects.toThrow(/pagination/i);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("supports later pages for all active workspace collections and paths", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ items: [], limit: 100, offset: 100, total: 100 }),
          ),
      );
    const client = new ApiClient(config, fetcher);
    await client.listEntities(100);
    await client.listDependencies(100);
    await client.listEvents(100);
    await client.listRuns(undefined, 100);
    await client.listPaths("run", "entity", 100);
    for (const [url] of fetcher.mock.calls) {
      expect(new URL(String(url)).searchParams.get("offset")).toBe("100");
    }
  });

  it("sends the active local identity and uses a normalized API base URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], limit: 100, offset: 0, total: 0 }),
          { status: 200 },
        ),
      );
    const client = new ApiClient(config, fetcher);

    await client.listEntities();

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/entities?limit=100");
    expect(new Headers(init?.headers).get("X-Local-User-ID")).toBe("user-id");
    expect(new Headers(init?.headers).get("X-Active-Organization-ID")).toBe(
      "organization-id",
    );
  });

  it("serializes state-changing requests as JSON", async () => {
    const created = { id: "entity-id", name: "Library" };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(created), { status: 201 }),
      );
    const client = new ApiClient(config, fetcher);

    await expect(
      client.createEntity({ name: "Library", entity_type: "resource" }),
    ).resolves.toEqual(created);

    const [, init] = fetcher.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(init?.body).toBe(
      JSON.stringify({ name: "Library", entity_type: "resource" }),
    );
  });

  it("preserves API validation details and request IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "The request could not be validated.",
            details: [
              {
                field: "body.weight",
                message: "Input should be less than or equal to 1",
                code: "less_than_equal",
              },
            ],
            request_id: "request-123",
          },
        }),
        { status: 422, headers: { "X-Request-ID": "request-123" } },
      ),
    );
    const client = new ApiClient(config, fetcher);

    await expect(
      client.createEntity({ name: "bad", entity_type: "resource" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "validation_error",
      requestId: "request-123",
      message: expect.stringContaining("body.weight"),
    } satisfies Partial<ApiError>);
  });
});
