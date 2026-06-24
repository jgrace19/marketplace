import { Page, Locator, expect } from "@playwright/test";

/**
 * Page object for the FreshCart cart, including the discount-code controls.
 * E2E tests reuse this rather than re-selecting cart internals.
 */
export class CartPage {
  readonly page: Page;
  readonly cart: Locator;
  readonly cartItems: Locator;
  readonly cartTotal: Locator;
  readonly cartSubtotal: Locator;
  readonly discountInput: Locator;
  readonly applyDiscountButton: Locator;
  readonly removeDiscountButton: Locator;
  readonly discountMessage: Locator;
  readonly discountError: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cart = page.getByTestId("cart");
    this.cartItems = page.getByTestId("cart-item");
    this.cartTotal = page.getByTestId("cart-total");
    this.cartSubtotal = page.getByTestId("cart-subtotal");
    this.discountInput = page.getByTestId("discount-code-input");
    this.applyDiscountButton = page.getByTestId("apply-discount-button");
    this.removeDiscountButton = page.getByTestId("remove-discount-button");
    this.discountMessage = page.getByTestId("discount-message");
    this.discountError = page.getByTestId("discount-error");
    this.checkoutButton = page.getByTestId("checkout-button");
  }

  async applyDiscountCode(code: string): Promise<void> {
    await this.discountInput.fill(code);
    await this.applyDiscountButton.click();
  }

  /** Parse the displayed order total into a number (e.g. "Total: $90.00" -> 90). */
  async getOrderTotal(): Promise<number> {
    const text = (await this.cartTotal.textContent()) ?? "";
    const match = text.match(/[\d,]+\.\d{2}/);
    return match ? Number(match[0].replace(/,/g, "")) : NaN;
  }

  async expectDiscountApplied(): Promise<void> {
    await expect(this.discountMessage).toBeVisible();
  }

  async expectDiscountRejected(): Promise<void> {
    await expect(this.discountError).toBeVisible();
  }
}
