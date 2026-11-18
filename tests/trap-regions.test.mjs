/**
 * Les régions que les pièges d'une scène cachent encore (adapter/trapped.mjs) et leur suivi chez le MJ (runtime/hidden.mjs
 * `syncTrapParts`), sur le faux Foundry de tests/fake-foundry.mjs : le même résultat, sans relire tous les pièges de la scène
 * pour chaque région.
 */
import { describe, it, expect } from "vitest";
import { installFakeFoundry, documents } from "./fake-foundry.mjs";

installFakeFoundry();
foundry.utils.deepClone = value => structuredClone(value);
const { regionHiddenByTraps, tilesHiddenByTraps } = await import("../module/scripts/adapter/trapped.mjs");
const { TRAP_ZONE } = await import("../module/scripts/adapter/trap-behavior.mjs");
const { CONTAINER_TYPE } = await import("../module/scripts/adapter/container-behavior.mjs");
const { syncTrapParts } = await import("../module/scripts/runtime/hidden.mjs");

const hiddenTrap = { enabled: true, found: false };
const foundTrap = { enabled: true, found: true };

/**
 * Une scène de sept régions :
 * - r1 porte un piège caché dont le déclencheur est r2 → r2 cachée ;
 * - r3 porte un piège repéré dont la source, pas encore repérée, est r4 → r4 cachée ;
 * - r5 porte un piège caché mais désamorcé ; r6, un levier piégé (au clic) ; r7, un coffre piégé : toutes trois visibles.
 * `reads` compte les lectures des réglages d'un piège de zone (une par poignée construite).
 */
function trappedScene() {
  documents.clear();
  const reads = { count: 0 };
  const scene = { regions: [], walls: [], tokens: [], tiles: [], updates: [],
    async updateEmbeddedDocuments(type, updates) { this.updates.push([type, updates]); } };
  const region = id => {
    const doc = { id, uuid: `Scene.s.Region.${id}`, documentName: "Region", name: id, parent: scene, behaviors: [], flags: {},
      polygonTree: { testPoint: () => false },
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; },
      async updateEmbeddedDocuments() {} };
    scene.regions.push(doc);
    documents.set(doc.uuid, doc);
    return doc;
  };
  const [r1, r2, r3, r4, r5, r6, r7] = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"].map(region);
  const trap = (on, data) => {
    const settings = { disarmed: false, triggerRegion: null, effectRegion: null, source: { uuid: null, hidden: foundTrap },
      hidden: hiddenTrap, activation: "enter", ...data };
    on.behaviors.push({ id: `piege-${on.id}`, uuid: `${on.uuid}.RegionBehavior.piege`, documentName: "RegionBehavior",
      type: TRAP_ZONE, disabled: false, region: on, parent: on,
      system: { ...settings, displayName: "", toObject: () => { reads.count++; return structuredClone(settings); } } });
  };
  trap(r1, { triggerRegion: r2.uuid });
  trap(r3, { hidden: foundTrap, source: { uuid: r4.uuid, hidden: hiddenTrap } });
  trap(r5, { disarmed: true });
  trap(r6, { activation: "click" });
  r7.behaviors.push({ id: "coffre", uuid: `${r7.uuid}.RegionBehavior.coffre`, documentName: "RegionBehavior", type: CONTAINER_TYPE,
    disabled: false, region: r7, parent: r7, system: { displayName: "", trap: { enabled: true, hidden: hiddenTrap } } });
  return { scene, reads, regions: { r1, r2, r3, r4, r5, r6, r7 } };
}

describe("régions cachées par les pièges", () => {
  it("le déclencheur d'un piège caché et la source pas encore repérée ; ni désamorcé, ni levier, ni coffre", () => {
    const { scene } = trappedScene();
    expect(scene.regions.filter(regionHiddenByTraps).map(r => r.id)).toEqual(["r2", "r4"]);
    expect(tilesHiddenByTraps(scene)).toEqual([]);
  });

  it("syncTrapParts cache ces régions-là, et elles seules", async () => {
    const { scene } = trappedScene();
    await syncTrapParts(scene);
    expect(scene.regions.filter(r => r.getFlag("darsh-loot", "concealed")).map(r => r.id)).toEqual(["r2", "r4"]);
    expect(scene.updates).toEqual([]);
  });

  it("syncTrapParts ne relit pas tous les pièges pour chaque région de la scène", async () => {
    const { scene, reads } = trappedScene();
    await syncTrapParts(scene);
    // Quatre pièges de zone, lus : une fois pour toute la scène, une fois par région cachée (deux), une fois pour les tuiles.
    expect(reads.count).toBe(4 * 4);
  });
});
