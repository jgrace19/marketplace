import { test as base, expect } from "@playwright/test";
import { ShopPage } from "../pages/ShopPage";
import { CartPage } from "../pages/CartPage";

/**
 * Shared checkout fixtures. Tests should depend on these instead of repeating
 * shop/cart setup (see .cursor/rules/e2e-playwright.mdc).
 *
 * - `shopPage` / `cartPage`: page objects bound to the current page.
 * - `cartWithItem`: a CartPage with one product already added, ready for the
 *   discount and checkout flows.
 */
type CheckoutFixtures = {
  shopPage: ShopPage;
  cartPage: CartPage;
  cartWithItem: CartPage;
};

export const test = base.extend<CheckoutFixtures>({
  shopPage: async ({ page }, use) => {
    await use(new ShopPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  cartWithItem: async ({ page }, use) => {
    const shop = new ShopPage(page);
    const cart = new CartPage(page);
    await shop.goto();
    await shop.addFirstProductToCart();
    await expect(cart.cartItems.first()).toBeVisible();
    await use(cart);
  },
});

export { expect };
