import { createTokenStore } from "../../lib/tokenStore.js";

function makeBackend() {
  const data = new Map();
  return {
    data,
    get: jest.fn(async (key) => data.get(key) ?? null),
    set: jest.fn(async (key, value) => {
      data.set(key, value);
    }),
    remove: jest.fn(async (key) => {
      data.delete(key);
    }),
  };
}

describe("createTokenStore", () => {
  it("reports no session when nothing is stored", async () => {
    const store = createTokenStore(makeBackend());

    expect(await store.hasSession()).toBe(false);
    expect(await store.getAccessToken()).toBeNull();
  });

  it("persists and returns a session", async () => {
    const backend = makeBackend();
    const store = createTokenStore(backend);

    await store.setSession({ accessToken: "a1", refreshToken: "r1" });

    expect(await store.getAccessToken()).toBe("a1");
    expect(await store.getRefreshToken()).toBe("r1");
    expect(await store.hasSession()).toBe(true);
    expect(backend.set).toHaveBeenCalledWith("saydle.accessToken", "a1");
    expect(backend.set).toHaveBeenCalledWith("saydle.refreshToken", "r1");
  });

  it("reads a session written by a previous launch", async () => {
    const backend = makeBackend();
    backend.data.set("saydle.accessToken", "a1");
    backend.data.set("saydle.refreshToken", "r1");

    const store = createTokenStore(backend);

    expect(await store.getRefreshToken()).toBe("r1");
  });

  it("hydrates from the backend only once", async () => {
    const backend = makeBackend();
    const store = createTokenStore(backend);

    await store.getAccessToken();
    await store.getAccessToken();
    await store.getRefreshToken();

    // Two reads on the first hydrate, none after.
    expect(backend.get).toHaveBeenCalledTimes(2);
  });

  it("clears both tokens", async () => {
    const backend = makeBackend();
    const store = createTokenStore(backend);
    await store.setSession({ accessToken: "a1", refreshToken: "r1" });

    await store.clear();

    expect(await store.getAccessToken()).toBeNull();
    expect(await store.hasSession()).toBe(false);
    expect(backend.remove).toHaveBeenCalledWith("saydle.accessToken");
    expect(backend.remove).toHaveBeenCalledWith("saydle.refreshToken");
  });

  it("removes rather than stores a missing token", async () => {
    const backend = makeBackend();
    const store = createTokenStore(backend);
    await store.setSession({ accessToken: "a1", refreshToken: "r1" });

    await store.setSession({ accessToken: "a2", refreshToken: undefined });

    expect(await store.getRefreshToken()).toBeNull();
    expect(backend.remove).toHaveBeenCalledWith("saydle.refreshToken");
  });
});
