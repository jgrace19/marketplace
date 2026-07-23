import unittest
from unittest.mock import patch

from main import Product, get_recommendations


def make_product(product_id: str, price: float) -> Product:
    return Product(
        id=product_id,
        name=f"Product {product_id}",
        description="Test product",
        price=price,
        image_url="https://example.com/product.jpg",
        source="test",
    )


class RecommendationsTest(unittest.TestCase):
    @patch("main.get_products")
    def test_handles_no_discounted_products(self, mock_get_products):
        mock_get_products.return_value = [
            make_product("regular-1", 1.00),
            make_product("regular-2", 3.49),
        ]

        response = get_recommendations()

        self.assertEqual(response, {"average_deal_price": 0.0, "items": []})
        mock_get_products.assert_called_once_with(limit=24)

    @patch("main.get_products")
    def test_returns_discounted_products_and_average_price(self, mock_get_products):
        discounted = [
            make_product("deal-1", 0.50),
            make_product("deal-2", 0.70),
        ]
        mock_get_products.return_value = [
            *discounted,
            make_product("regular", 4.99),
        ]

        response = get_recommendations()

        self.assertEqual(response["average_deal_price"], 0.60)
        self.assertEqual(response["items"], [product.__dict__ for product in discounted])
        mock_get_products.assert_called_once_with(limit=24)


if __name__ == "__main__":
    unittest.main()
