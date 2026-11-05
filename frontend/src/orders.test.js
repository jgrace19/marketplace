import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORDER_STAGES,
  STAGE_MS,
  addOrder,
  isInProgress,
  sortedOrders,
  stageForOrder
} from "./orders.js";

describe("addOrder", () => {
  it("is idempotent for the same id", () => {
    const base = {};
    const first = addOrder(base, { id: "sess_1", items: [], total: 1 }, 1000);
    const second = addOrder(first, { id: "sess_1", items: [], total: 99 }, 2000);
    assert.equal(second, first);
    assert.equal(first.sess_1.placedAt, 1000);
    assert.equal(Object.keys(first).length, 1);
  });

  it("adds distinct orders", () => {
    let orders = {};
    orders = addOrder(orders, { id: "a", items: [], total: 1 }, 100);
    orders = addOrder(orders, { id: "b", items: [], total: 2 }, 200);
    assert.equal(Object.keys(orders).length, 2);
  });
});

describe("stageForOrder", () => {
  const order = { id: "x", placedAt: 10_000, items: [] };

  it("steps through stages at STAGE_MS boundaries", () => {
    assert.equal(stageForOrder(order, 10_000), "Placed");
    assert.equal(stageForOrder(order, 10_000 + STAGE_MS - 1), "Placed");
    assert.equal(stageForOrder(order, 10_000 + STAGE_MS), "Shopping");
    assert.equal(stageForOrder(order, 10_000 + 2 * STAGE_MS), "On the way");
    assert.equal(stageForOrder(order, 10_000 + 3 * STAGE_MS), "Delivered");
    assert.equal(stageForOrder(order, 10_000 + 10 * STAGE_MS), "Delivered");
  });

  it("returns Placed when now is before placedAt", () => {
    assert.equal(stageForOrder(order, 9_999), "Placed");
  });
});

describe("isInProgress", () => {
  const order = { id: "x", placedAt: 0, items: [] };

  it("is true until Delivered", () => {
    assert.equal(isInProgress(order, 0), true);
    assert.equal(isInProgress(order, STAGE_MS * 2), true);
    assert.equal(isInProgress(order, STAGE_MS * 3), false);
  });
});

describe("sortedOrders", () => {
  it("sorts newest first and drops malformed entries", () => {
    const list = sortedOrders({
      old: { id: "old", placedAt: 1, items: [] },
      new: { id: "new", placedAt: 99, items: [] },
      bad: { id: "bad", placedAt: 50 }
    });
    assert.deepEqual(
      list.map((entry) => entry.id),
      ["new", "old"]
    );
  });
});

describe("ORDER_STAGES", () => {
  it("has four stages ending in Delivered", () => {
    assert.equal(ORDER_STAGES.length, 4);
    assert.equal(ORDER_STAGES[ORDER_STAGES.length - 1], "Delivered");
  });
});
