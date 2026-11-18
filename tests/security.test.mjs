/**
 * Les requêtes au MJ ne font que ce que l'expéditeur a le droit de demander (journal, 2026-11-18) : chaque test l'envoie depuis un
 * joueur. Joués sur le faux Foundry de tests/fake-foundry.mjs.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { installFakeFoundry, FakeActor, FakeCollection, documents } from "./fake-foundry.mjs";

installFakeFoundry();
const { transfer } = await import("../module/scripts/adapter/dnd5e.mjs");
const { registerTake } = await import("../module/scripts/runtime/take.mjs");
const { registerMechanismsInit } = await import("../module/scripts/runtime/mechanisms.mjs");

const GM = { id: "gm", isGM: true, name: "MJ" };
const PLAYER = { id: "joueur", isGM: false, name: "Joueur" };
const sword = { _id: "epee", name: "Épée longue", type: "weapon", system: { quantity: 1, properties: ["gear"] } };
const take = (payload, user=PLAYER) => CONFIG.queries["darsh-loot.take"](payload, { user });

beforeAll(() => {
  registerTake();
  try { registerMechanismsInit(); } catch { /* la feuille de réglages n'existe pas ici : seule la requête compte */ }
});
beforeEach(() => documents.clear());

/** Une scène de 5 ft par case, et un token posé dessus pour `actor`. */
function scene() {
  return { name: "Scène", tokens: new FakeCollection(), regions: new FakeCollection(), grid: { size: 100, distance: 5 } };
}
function tokenOn(where, actor, x) {
  const token = { id: `t-${actor.id}`, uuid: `Scene.s.Token.t-${actor.id}`, documentName: "Token", name: actor.name, parent: where,
    actor, flags: {}, getFlag: () => undefined, _source: { x, y: 0, width: 1, height: 1, elevation: 0 } };
  where.tokens.set(token.id, token);
  documents.set(token.uuid, token);
  return token;
}

describe("un id répété ne duplique pas l'objet", () => {
  it("[id, id, id] ne donne qu'un objet", async () => {
    const corpse = new FakeActor({ id: "mort", name: "Garde", type: "npc", items: [sword] });
    const pc = new FakeActor({ id: "pj", name: "Clerc" });
    const taken = await transfer(corpse, pc, { itemIds: ["epee", "epee", "epee"] });
    expect(pc.count(sword.name)).toBe(1);
    expect(corpse.items.size).toBe(0);
    expect(taken.names).toEqual([sword.name]);
  });
});

describe("on ne prend que dans un cadavre ou un conteneur", () => {
  it("la boutique d'un marchand (son acteur, sans portée) : refusée au joueur, rien ne bouge", async () => {
    const shop = new FakeActor({ id: "marchand", name: "Marchand", type: "npc", currency: { gp: 500 }, items: [sword],
      flags: { "darsh-loot": { merchant: { enabled: true } } } });
    const pc = new FakeActor({ id: "pj", name: "Roublard", owners: [PLAYER.id] });
    const looter = tokenOn(scene(), pc, 0);
    await expect(take({ source: { kind: "merchant", uuid: shop.uuid }, looter: looter.uuid, itemIds: ["epee"], coins: true }))
      .rejects.toThrow("DLO.Refus.Introuvable");
    expect(shop.items.size).toBe(1);
    expect(shop.system.currency.gp).toBe(500);
    expect(pc.count(sword.name)).toBe(0);
  });

  it("les poches d'un PNJ vivant à côté : refusées au joueur (le vol passe par `steal`)", async () => {
    const where = scene();
    const npc = new FakeActor({ id: "pnj", name: "Garde", type: "npc", currency: { gp: 50 }, items: [sword] });
    const pc = new FakeActor({ id: "pj", name: "Roublard", owners: [PLAYER.id] });
    const victim = tokenOn(where, npc, 100);
    const looter = tokenOn(where, pc, 0);
    await expect(take({ source: { kind: "pocket", uuid: victim.uuid }, looter: looter.uuid, itemIds: ["epee"], coins: true }))
      .rejects.toThrow("DLO.Refus.Introuvable");
    expect(npc.items.size).toBe(1);
    expect(npc.system.currency.gp).toBe(50);
  });
});

describe("seul un MJ fait lancer des macros chez un autre", () => {
  const macroQuery = () => CONFIG.queries["darsh-loot.mechanismMacros"];

  it("la requête existe sur ce client", () => expect(typeof macroQuery()).toBe("function"));

  it("envoyée par un joueur : refusée, la macro ne part pas", async () => {
    let ran = false;
    globalThis.__ranMacro = () => { ran = true; };
    documents.set("Macro.m", { uuid: "Macro.m", documentName: "Macro", name: "piège", type: "script", command: "globalThis.__ranMacro();" });
    expect(await macroQuery()({ macros: ["Macro.m"] }, { user: PLAYER })).toBe(false);
    expect(await macroQuery()({ macros: ["Macro.m"] }, {})).toBe(false);
    expect(ran).toBe(false);
  });
});
