from unittest import TestCase
from unittest.mock import patch

from main import Product, get_recommendations


def product(id: str, price: float) -> Product:
    return Product(
        id=id,
        name=f"Product {id}",
        description="Test product",
        price=price,
        image_url="https://example.com/product.png",
        source="test",
    )


class RecommendationTests(TestCase):
    def test_get_recommendations_returns_empty_deals_safely(self) -> None:
        with patch("main.get_products", return_value=[product("full-price", 1.19)]):
            response = get_recommendations()

        self.assertEqual(response, {"average_deal_price": 0.0, "items": []})

    def test_get_recommendations_averages_discounted_products(self) -> None:
        discounted_a = product("discount-a", 0.5)
        discounted_b = product("discount-b", 0.7)
        full_price = product("full-price", 1.19)

        with patch("main.get_products", return_value=[discounted_a, full_price, discounted_b]):
            response = get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.6)
        self.assertEqual(
            [item["id"] for item in response["items"]],
            ["discount-a", "discount-b"],
        )
