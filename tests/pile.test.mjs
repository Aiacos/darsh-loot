/**
 * Poser au sol chez le MJ (runtime/drop.mjs `putOnGround`), sur le faux Foundry de tests/fake-foundry.mjs : un seul tas par
 * case (SPEC §3.8), même quand deux objets y tombent ensemble.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { installFakeFoundry, FakeActor, FakeItem, FakeCollection, settings, tick } from "./fake-foundry.mjs";

installFakeFoundry();
const { putOnGround } = await import("../module/scripts/runtime/drop.mjs");

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
      const region = { id: `region${++n}`, parent: scene, flags: data.flags, behaviors: new FakeCollection(),
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

describe("poser au sol", () => {
  it("deux objets lâchés ensemble dans la même case : un seul tas, qui les contient tous les deux", async () => {
    const scene = fakeScene();
    const drop = (name, point) => putOnGround({ scene, point, from: point, item: worldItem(name), flight: false });
    const [first, second] = await Promise.all([drop("Corde", { x: 210, y: 320 }), drop("Torche", { x: 290, y: 380 })]);
    expect(scene.regions.size).toBe(1);
    expect(scene.tiles.size).toBe(1);
    expect(second).toBe(first);
    const store = fromUuidSync(first.behaviors.contents[0].system.actor);
    expect(store.items.map(i => i.name).sort()).toEqual(["Corde", "Torche"]);
  });

  it("deux cases différentes : deux tas ; puis un objet de plus rejoint le tas de sa case", async () => {
    const scene = fakeScene();
    const drop = (name, point) => putOnGround({ scene, point, from: point, item: worldItem(name), flight: false });
    const [first, second] = await Promise.all([drop("Corde", { x: 210, y: 320 }), drop("Torche", { x: 410, y: 320 })]);
    expect(second).not.toBe(first);
    expect(scene.regions.size).toBe(2);
    expect(await drop("Pelle", { x: 250, y: 350 })).toBe(first);
    expect(scene.regions.size).toBe(2);
  });
});
