import { test, expect } from "./fixtures/checkout";

/**
 * E2E coverage for discount codes on guest checkout (ADO #1).
 * Reuses the cartWithItem fixture and CartPage page object.
 */
test.describe("Discount codes on guest checkout", () => {
  test("a valid percentage code reduces the order total", async ({
    cartWithItem,
  }) => {
    const subtotal = await cartWithItem.getOrderTotal();

    await cartWithItem.applyDiscountCode("SAVE10");

    await cartWithItem.expectDiscountApplied();
    await expect(cartWithItem.cartSubtotal).toBeVisible();
    const discounted = await cartWithItem.getOrderTotal();
    expect(discounted).toBeLessThan(subtotal);
    expect(discounted).toBeCloseTo(Number((subtotal * 0.9).toFixed(2)), 2);
  });

  test("a 100% off code drives the total to zero", async ({ cartWithItem }) => {
    await cartWithItem.applyDiscountCode("WELCOME100");

    await cartWithItem.expectDiscountApplied();
    expect(await cartWithItem.getOrderTotal()).toBe(0);
  });

  test("an unknown code is rejected and leaves the total unchanged", async ({
    cartWithItem,
  }) => {
    const subtotal = await cartWithItem.getOrderTotal();

    await cartWithItem.applyDiscountCode("NOPE");

    await cartWithItem.expectDiscountRejected();
    expect(await cartWithItem.getOrderTotal()).toBe(subtotal);
  });

  test("an expired code is rejected", async ({ cartWithItem }) => {
    await cartWithItem.applyDiscountCode("EXPIRED20");

    await cartWithItem.expectDiscountRejected();
    await expect(cartWithItem.discountError).toContainText(/expired/i);
  });

  test("an applied code can be removed", async ({ cartWithItem }) => {
    await cartWithItem.applyDiscountCode("SAVE10");
    await cartWithItem.expectDiscountApplied();

    await cartWithItem.removeDiscountButton.click();

    await expect(cartWithItem.discountMessage).toBeHidden();
    await expect(cartWithItem.discountInput).toBeEditable();
  });
});
