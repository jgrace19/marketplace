import { Page, Locator, expect } from "@playwright/test";

/** Page object for the FreshCart shop/listing page. */
export class ShopPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly productCards: Locator;
  readonly addToCartButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByTestId("search-input");
    this.productCards = page.getByTestId("product-card");
    this.addToCartButtons = page.getByTestId("add-to-cart-button");
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    await expect(this.productCards.first()).toBeVisible();
  }

  /** Add the first available product to the cart. */
  async addFirstProductToCart(): Promise<void> {
    await this.addToCartButtons.first().click();
  }

  async addProductsToCart(count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await this.addToCartButtons.nth(i).click();
    }
  }
}
