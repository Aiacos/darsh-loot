/**
 * `moveItem` (adapter/drop.mjs) sur le faux Foundry de tests/fake-foundry.mjs : la quantité déplacée.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { installFakeFoundry, FakeActor, documents } from "./fake-foundry.mjs";

installFakeFoundry();
const { moveItem } = await import("../module/scripts/adapter/drop.mjs");

const arrows = quantity => ({ _id: "fleches", name: "Flèche", type: "consumable", system: { quantity } });

beforeEach(() => documents.clear());

describe("moveItem : quantité déplacée", () => {
  it("une quantité à virgule est ramenée à l'entier : pas de demi-flèche de part et d'autre", async () => {
    const giver = new FakeActor({ id: "a", name: "Alice", items: [arrows(3)] });
    const taker = new FakeActor({ id: "b", name: "Bob" });
    const moved = await moveItem(giver, taker, "fleches", 1.5);
    expect(moved.quantity).toBe(1);
    expect([giver.count("Flèche"), taker.count("Flèche")]).toEqual([2, 1]);
  });

  it("moins d'une unité demandée : une unité part", async () => {
    const giver = new FakeActor({ id: "a", name: "Alice", items: [arrows(3)] });
    const taker = new FakeActor({ id: "b", name: "Bob" });
    await moveItem(giver, taker, "fleches", 0.4);
    expect([giver.count("Flèche"), taker.count("Flèche")]).toEqual([2, 1]);
  });

  it("sans quantité, ou plus que la pile : toute la pile", async () => {
    for ( const quantity of [undefined, 7.9] ) {
      documents.clear();
      const giver = new FakeActor({ id: "a", name: "Alice", items: [arrows(3)] });
      const taker = new FakeActor({ id: "b", name: "Bob" });
      await moveItem(giver, taker, "fleches", quantity);
      expect([giver.count("Flèche"), taker.count("Flèche")]).toEqual([0, 3]);
    }
  });
});
