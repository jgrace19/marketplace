import { test, expect } from "./fixtures/checkout";

test.describe("FreshCart smoke", () => {
  test("shopper can browse products and add one to the cart", async ({
    shopPage,
    cartPage,
  }) => {
    await shopPage.goto();
    await expect(shopPage.productCards.first()).toBeVisible();

    await shopPage.addFirstProductToCart();

    await expect(cartPage.cartItems.first()).toBeVisible();
    await expect(cartPage.checkoutButton).toBeEnabled();

    // Only one product was added, so the cart should contain exactly 1 item.
    await expect(cartPage.cartItems).toHaveCount(1);
  });
});
