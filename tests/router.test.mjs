/**
 * Le routeur de hooks (runtime/router.mjs) : un inscrit qui échoue est journalisé sous « hook → nom » et n'empêche pas les
 * suivants — qu'il échoue tout de suite ou plus tard (fonction asynchrone).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listeners = new Map();
globalThis.Hooks = { on: (hook, fn) => listeners.set(hook, fn) };
const { route, routeClaim } = await import("../module/scripts/runtime/router.mjs");

let logged;
beforeEach(() => { logged = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => logged.mockRestore());

describe("routeur de hooks", () => {
  it("une erreur immédiate est journalisée, les inscrits suivants sont appelés", () => {
    const calls = [];
    route("testSync", "le premier", () => { throw new Error("raté"); });
    route("testSync", "le second", value => calls.push(value));
    listeners.get("testSync")(7);
    expect(calls).toEqual([7]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toBe("testSync → le premier");
  });

  it("l'échec d'un inscrit asynchrone est journalisé sous son nom, pas laissé sans suite", async () => {
    const calls = [];
    route("testAsync", "le coffre", async () => { await null; throw new Error("création refusée"); });
    route("testAsync", "le second", value => calls.push(value));
    listeners.get("testAsync")(7);
    expect(calls).toEqual([7]);
    await new Promise(resolve => setTimeout(resolve));
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toBe("testAsync → le coffre");
    expect(logged.mock.calls[0][2].message).toBe("création refusée");
  });

  it("hook annulable : seul `false` annule ; une promesse qui échoue est journalisée", async () => {
    routeClaim("testClaim", "asynchrone", async () => { throw new Error("plus tard"); });
    expect(listeners.get("testClaim")()).toBeUndefined();
    routeClaim("testClaim", "refus", () => false);
    expect(listeners.get("testClaim")()).toBe(false);
    await new Promise(resolve => setTimeout(resolve));
    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged.mock.calls[0][1]).toBe("testClaim → asynchrone");
  });
});
