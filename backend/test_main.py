from unittest import TestCase
from unittest.mock import patch

import main


class RecommendationsTests(TestCase):
    def test_recommendations_returns_empty_result_without_discounted_products(self) -> None:
        products = [
            main.Product(
                id="regular-1",
                name="Regular Item",
                description="Costs more than the discount threshold",
                price=3.49,
                image_url="https://example.com/regular.jpg",
                source="test",
            )
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(
            response,
            {"average_deal_price": 0.0, "items": []},
        )

    def test_recommendations_averages_discounted_products(self) -> None:
        products = [
            main.Product(
                id="deal-1",
                name="Deal One",
                description="Discounted",
                price=0.50,
                image_url="https://example.com/deal-1.jpg",
                source="test",
            ),
            main.Product(
                id="deal-2",
                name="Deal Two",
                description="Discounted",
                price=0.75,
                image_url="https://example.com/deal-2.jpg",
                source="test",
            ),
            main.Product(
                id="regular-1",
                name="Regular Item",
                description="Not discounted",
                price=2.00,
                image_url="https://example.com/regular.jpg",
                source="test",
            ),
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.62)
        self.assertEqual(
            [item["id"] for item in response["items"]],
            ["deal-1", "deal-2"],
        )
