from unittest import TestCase
from unittest.mock import Mock, patch

import requests
from fastapi import HTTPException

from main import PRICE_CHECK_TIMEOUT_SECONDS, REQUEST_HEADERS, price_check


class PriceCheckTests(TestCase):
    @patch("main.requests.get")
    def test_success_returns_response_metadata(self, mock_get: Mock) -> None:
        mock_get.return_value = Mock(status_code=200, content=b"comparable product")

        result = price_check("https://www.example.com/product")

        self.assertEqual(result, {"status_code": 200, "content_length": 18})
        mock_get.assert_called_once_with(
            "https://www.example.com/product",
            headers=REQUEST_HEADERS,
            timeout=PRICE_CHECK_TIMEOUT_SECONDS,
        )

    def test_missing_scheme_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("www.example.com")

        self.assertEqual(raised.exception.status_code, 400)

    def test_non_http_url_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("ftp://www.example.com/product")

        self.assertEqual(raised.exception.status_code, 400)

    @patch("main.requests.get")
    def test_connection_failure_returns_bad_gateway(self, mock_get: Mock) -> None:
        mock_get.side_effect = requests.ConnectionError("host unavailable")

        with self.assertRaises(HTTPException) as raised:
            price_check("http://definitely-not-a-real-host.invalid/product")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail, "Unable to reach the comparison URL.")
