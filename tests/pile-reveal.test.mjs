/**
 * Le tas né transparent (runtime/drop.mjs `putOnGround`) et révélé à la fin du vol, sur le faux Foundry de
 * tests/fake-foundry.mjs : une révélation qui échoue ou qui n'a pas eu lieu ne laisse pas un tas invisible.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { installFakeFoundry, FakeActor, FakeItem, FakeCollection, settings, tick } from "./fake-foundry.mjs";

installFakeFoundry();
const { putOnGround } = await import("../module/scripts/runtime/drop.mjs");
const { realignPiles } = await import("../module/scripts/adapter/drop.mjs");

/** Une scène dont les tuiles et les régions se créent après un délai, comme sur le serveur. */
function fakeScene() {
  const cell = v => Math.floor(v / 100) * 100;
  const scene = { id: "s", grid: { size: 100, getTopLeftPoint: p => ({ x: cell(p.x), y: cell(p.y) }) },
    regions: new FakeCollection(), tiles: new FakeCollection() };
  let n = 0;
  const makers = {
    Tile: data => ({ ...structuredClone(data), id: `tile${++n}`,
      async update(changes) { await tick(); Object.assign(this, changes); } }),
    Region: data => {
      const [shape] = data.shapes;
      const inside = (v, from, length) => (v >= from) && (v <= from + length);
      const region = { id: `region${++n}`, parent: scene, flags: data.flags, shapes: data.shapes, behaviors: new FakeCollection(),
        getFlag: (scope, key) => data.flags[scope]?.[key],
        includedInLevel: () => true,
        polygonTree: { testPoint: p => inside(p.x, shape.x, shape.width) && inside(p.y, shape.y, shape.height) },
        bounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height } };
      const behavior = { id: `behavior${++n}`, uuid: `Scene.s.Region.${region.id}.RegionBehavior.b`, parent: region, region,
        system: { ...data.behaviors[0].system, actor: null },
        async update(changes) { await tick(); this.system.actor = changes["system.actor"]; } };
      region.behaviors.set(behavior.id, behavior);
      return region;
    }
  };
  scene.createEmbeddedDocuments = async (type, list) => {
    await tick();
    const collection = (type === "Tile") ? scene.tiles : scene.regions;
    return list.map(data => { const doc = makers[type](data); collection.set(doc.id, doc); return doc; });
  };
  return scene;
}

const worldItem = name => new FakeItem({ name, type: "loot", img: `${name}.webp`, system: { quantity: 1 } }, null);

beforeAll(() => {
  settings.dropMode = "on";
  let stores = 0;
  game.folders = [{ id: "dossier", type: "Actor", getFlag: () => true }];
  const create = async data => { await tick(); return new FakeActor({ id: `coffre${++stores}`, ...data }); };
  FakeActor.implementation = { create };
});

describe("révélation d'un tas", () => {
  it("le tas pris avant la fin du vol : la révélation échoue sans rejet non géré, c'est journalisé", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const scene = fakeScene();
      const point = { x: 210, y: 320 };
      const dropped = putOnGround({ scene, point, from: point, item: worldItem("Corde") });
      await vi.advanceTimersByTimeAsync(100);
      const region = await dropped;
      const tile = scene.tiles.contents[0];
      expect(tile.alpha).toBe(0);
      // Ramassé pendant le vol : la tuile est partie avec la région, le serveur refuse la mise à jour.
      tile.update = async () => { throw new Error(`Tile "${tile.id}" does not exist!`); };
      await vi.advanceTimersByTimeAsync(2000);
      expect(region).toBeTruthy();
      expect(warned).toHaveBeenCalledTimes(1);
      expect(warned.mock.calls[0].join(" ")).toContain("does not exist");
    } finally {
      vi.useRealTimers();
      warned.mockRestore();
    }
  });

  it("au chargement du MJ, un tas resté transparent (MJ déconnecté pendant le vol) est révélé", async () => {
    const scene = fakeScene();
    const point = { x: 210, y: 320 };
    await putOnGround({ scene, point, from: point, item: worldItem("Corde"), flight: false });
    const tile = scene.tiles.contents[0];
    tile.alpha = 0;
    const sent = [];
    // Une collection de Foundry se parcourt par ses documents (la Map du faux Foundry, par ses paires).
    game.scenes = [{ ...scene, regions: scene.regions.contents, updateEmbeddedDocuments: async (...args) => { sent.push(args); } }];
    await realignPiles();
    expect(sent).toEqual([["Tile", [{ _id: tile.id, alpha: 1 }]]]);
    tile.alpha = 1;
    sent.length = 0;
    await realignPiles();
    expect(sent).toEqual([]);
  });
});
