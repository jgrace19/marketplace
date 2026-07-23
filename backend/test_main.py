from unittest import TestCase
from unittest.mock import patch

import main


class RecommendationsTest(TestCase):
    def test_returns_empty_recommendations_when_no_discounted_items(self) -> None:
        products = [
            main.Product(
                id="regular-1",
                name="Regular item",
                description="Not discounted",
                price=3.49,
                image_url="",
                source="test",
            )
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(response, {"average_deal_price": 0.0, "items": []})

    def test_averages_discounted_recommendations(self) -> None:
        discounted = main.Product(
            id="deal-1",
            name="Discounted item",
            description="Under threshold",
            price=0.50,
            image_url="",
            source="test",
        )
        products = [
            discounted,
            main.Product(
                id="regular-1",
                name="Regular item",
                description="Not discounted",
                price=3.49,
                image_url="",
                source="test",
            ),
        ]

        with patch.object(main, "get_products", return_value=products):
            response = main.get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.5)
        self.assertEqual(response["items"], [main.asdict(discounted)])
