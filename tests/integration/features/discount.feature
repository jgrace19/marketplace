@discount @api
Feature: Discount code validation API
  As a guest shopper
  I want discount codes validated against my cart subtotal
  So that only legitimate discounts are applied before payment

  Scenario Outline: Valid codes return the expected discount
    Given the checkout service is available
    When I validate the code "<code>" against a subtotal of <subtotal>
    Then the code is accepted
    And the discount amount is <amount>
    And the new total is <total>

    Examples:
      | code       | subtotal | amount | total |
      | SAVE10     | 100.00   | 10.00  | 90.00 |
      | 5OFF       | 50.00    | 5.00   | 45.00 |
      | WELCOME100 | 100.00   | 100.00 | 0.00  |

  Scenario Outline: Invalid codes are rejected with a reason
    Given the checkout service is available
    When I validate the code "<code>" against a subtotal of <subtotal>
    Then the code is rejected
    And the rejection reason mentions "<reason>"

    Examples:
      | code      | subtotal | reason         |
      | 5OFF      | 10.00    | minimum spend  |
      | EXPIRED20 | 100.00   | expired        |
      | USEDONCE  | 100.00   | already been used |
      | NOPE      | 100.00   | not a valid    |
