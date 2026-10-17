from unittest import TestCase
from unittest.mock import MagicMock, patch

import requests
from fastapi import HTTPException

from main import price_check


class PriceCheckTests(TestCase):
    def test_price_check_rejects_invalid_url(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            price_check(url="not-a-url")

        self.assertEqual(ctx.exception.status_code, 400)

    def test_price_check_returns_fetch_metadata(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"ok"

        with patch("main.requests.get", return_value=mock_response) as mock_get:
            response = price_check(url="https://example.com/product")

        mock_get.assert_called_once()
        self.assertEqual(
            response,
            {
                "url": "https://example.com/product",
                "status_code": 200,
                "content_length": 2,
            },
        )

    def test_price_check_maps_connection_errors_to_502(self) -> None:
        with patch(
            "main.requests.get",
            side_effect=requests.exceptions.ConnectionError("dns failed"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                price_check(url="http://definitely-not-a-real-host.invalid/product")

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("Unable to fetch product URL", ctx.exception.detail)
