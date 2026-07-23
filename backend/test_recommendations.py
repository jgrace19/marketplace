import unittest
from unittest.mock import patch

from main import Product, get_recommendations


class RecommendationsTest(unittest.TestCase):
    def test_returns_empty_deals_when_no_products_are_discounted(self) -> None:
        products = [
            Product(
                id="grocery-19",
                name="Cucumber - each",
                description="Cool crisp cucumbers for salads and snacks.",
                price=1.19,
                image_url="https://example.com/cucumber.jpg",
                source="test",
            )
        ]

        with patch("main.get_products", return_value=products):
            response = get_recommendations()

        self.assertEqual(response, {"average_deal_price": 0.0, "items": []})

    def test_averages_discounted_products_only(self) -> None:
        discounted_a = Product(
            id="deal-1",
            name="Banana",
            description="Discounted banana",
            price=0.50,
            image_url="https://example.com/banana.jpg",
            source="test",
        )
        discounted_b = Product(
            id="deal-2",
            name="Apple",
            description="Discounted apple",
            price=0.70,
            image_url="https://example.com/apple.jpg",
            source="test",
        )
        full_price = Product(
            id="full-price",
            name="Milk",
            description="Full-price milk",
            price=4.29,
            image_url="https://example.com/milk.jpg",
            source="test",
        )

        with patch(
            "main.get_products",
            return_value=[discounted_a, discounted_b, full_price],
        ):
            response = get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.60)
        self.assertEqual(
            [item["id"] for item in response["items"]],
            ["deal-1", "deal-2"],
        )


if __name__ == "__main__":
    unittest.main()
