@smoke @products
Feature: Product catalog API
  As a shopper
  I want the catalog endpoint to return products
  So that I can browse and search the store

  Scenario: The catalog returns products
    Given the catalog service is available
    When I request the product list
    Then the response contains at least one product
    And every product has a name and a price

  Scenario Outline: Searching narrows the catalog
    Given the catalog service is available
    When I search the catalog for "<query>"
    Then every returned product matches "<query>"

    Examples:
      | query  |
      | milk   |
      | banana |
