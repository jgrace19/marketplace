from unittest import TestCase
from unittest.mock import patch

import main


class RecommendationsTest(TestCase):
    def test_returns_empty_recommendations_when_no_products_are_discounted(self) -> None:
        products = [
            main.Product(
                id="product-1",
                name="Full Price Item",
                description="Not eligible for deals",
                price=4.99,
                image_url="https://example.com/full-price.jpg",
                source="test",
            )
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.0)
        self.assertEqual(response["items"], [])

    def test_returns_average_price_for_discounted_products(self) -> None:
        products = [
            main.Product(
                id="deal-1",
                name="Deal One",
                description="Eligible deal",
                price=0.25,
                image_url="https://example.com/deal-one.jpg",
                source="test",
            ),
            main.Product(
                id="deal-2",
                name="Deal Two",
                description="Eligible deal",
                price=0.75,
                image_url="https://example.com/deal-two.jpg",
                source="test",
            ),
            main.Product(
                id="full-price",
                name="Full Price",
                description="Not eligible for deals",
                price=1.25,
                image_url="https://example.com/full-price.jpg",
                source="test",
            ),
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.5)
        self.assertEqual([item["id"] for item in response["items"]], ["deal-1", "deal-2"])
