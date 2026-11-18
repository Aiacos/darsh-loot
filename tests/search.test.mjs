/**
 * « Fouiller les environs » chez le MJ (runtime/hidden.mjs `handleSearch`), sur le faux Foundry de tests/fake-foundry.mjs :
 * une fouille à la fois par personnage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { installFakeFoundry, FakeActor, FakeCollection, documents, settings, tick } from "./fake-foundry.mjs";

installFakeFoundry();
const { registerHiddenInit } = await import("../module/scripts/runtime/hidden.mjs");

const GM = { id: "gm", isGM: true, name: "MJ" };
const search = token => CONFIG.queries["darsh-loot.search"]({ token: token.uuid, delayMs: 0 }, { user: GM });

/** Un personnage sur une scène vide, dont chaque jet de compétence est compté et met un instant à revenir. */
function searcher() {
  const actor = new FakeActor({ id: "pj", name: "Clerc" });
  const rolls = [];
  actor.rollSkill = async ({ skill }) => { rolls.push(skill); await tick(); return [{ total: 12 }]; };
  actor.setFlag = async (scope, key, value) => { await tick(); ((actor.flags[scope] ??= {})[key] = value); };
  const scene = { grid: { size: 100, distance: 5, units: "ft" },
    regions: new FakeCollection(), walls: new FakeCollection(), tokens: new FakeCollection(), tiles: new FakeCollection() };
  const token = { id: "t1", uuid: "Scene.s.Token.t1", name: "Clerc", parent: scene, actor,
    _source: { x: 0, y: 0, elevation: 0, width: 1, height: 1 } };
  scene.tokens.set(token.id, token);
  documents.set(token.uuid, token);
  return { token, actor, rolls };
}

beforeAll(() => {
  Object.assign(settings, { searchRadius: 30, searchCooldown: 0, searchDuration: 0 });
  globalThis.document = { hidden: false };
  game.messages = new FakeCollection();
  registerHiddenInit();
});

describe("fouille active, chez le MJ", () => {
  it("deux demandes de suite pour le même personnage (double clic) : une seule fouille, un seul jet", async () => {
    const { token, rolls } = searcher();
    const results = await Promise.allSettled([search(token), search(token)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(results[0].value).toEqual({ found: 0 });
    expect(results[1].reason.message).toBe("DLO.Hidden.Searching");
    expect(rolls).toEqual(["prc"]);
  });

  it("la fouille finie (ou échouée), le personnage peut fouiller de nouveau", async () => {
    const { token, actor, rolls } = searcher();
    await search(token);
    await search(token);
    expect(rolls).toEqual(["prc", "prc"]);
    actor.rollSkill = async () => { throw new Error("jet annulé"); };
    await expect(search(token)).rejects.toThrow("jet annulé");
    actor.rollSkill = async ({ skill }) => { rolls.push(skill); return [{ total: 12 }]; };
    await expect(search(token)).resolves.toEqual({ found: 0 });
  });
});
