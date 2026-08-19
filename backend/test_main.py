import socket
from unittest import TestCase
from unittest.mock import Mock, patch

import requests
from fastapi import HTTPException

from main import (
    PRICE_CHECK_CONNECT_TIMEOUT_SECONDS,
    PRICE_CHECK_READ_TIMEOUT_SECONDS,
    REQUEST_HEADERS,
    price_check,
)


PUBLIC_ADDRESS = [
    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
]


class PriceCheckTests(TestCase):
    @patch("main.socket.getaddrinfo", return_value=PUBLIC_ADDRESS)
    @patch("main.requests.get")
    def test_success_returns_response_metadata(
        self, mock_get: Mock, _mock_resolve: Mock
    ) -> None:
        response = Mock(status_code=200)
        response.iter_content.return_value = [b"comparable product"]
        mock_get.return_value = response

        result = price_check("https://www.example.com/product")

        self.assertEqual(result, {"status_code": 200, "content_length": 18})
        mock_get.assert_called_once_with(
            "https://www.example.com/product",
            headers=REQUEST_HEADERS,
            timeout=(
                PRICE_CHECK_CONNECT_TIMEOUT_SECONDS,
                PRICE_CHECK_READ_TIMEOUT_SECONDS,
            ),
            allow_redirects=False,
            stream=True,
        )
        response.close.assert_called_once()

    def test_missing_scheme_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("www.example.com")

        self.assertEqual(raised.exception.status_code, 400)

    def test_non_http_url_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("ftp://www.example.com/product")

        self.assertEqual(raised.exception.status_code, 400)

    def test_malformed_hostname_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("http://exa mple.com")

        self.assertEqual(raised.exception.status_code, 400)

    def test_empty_url_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("")

        self.assertEqual(raised.exception.status_code, 400)

    def test_multicast_destination_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("http://224.0.0.1/product")

        self.assertEqual(raised.exception.status_code, 400)

    @patch(
        "main.socket.getaddrinfo",
        return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))
        ],
    )
    def test_private_destination_is_rejected(self, _mock_resolve: Mock) -> None:
        with self.assertRaises(HTTPException) as raised:
            price_check("http://example.com")

        self.assertEqual(raised.exception.status_code, 400)

    @patch("main.socket.getaddrinfo", return_value=PUBLIC_ADDRESS)
    @patch("main.requests.get")
    def test_connection_failure_returns_bad_gateway(
        self, mock_get: Mock, _mock_resolve: Mock
    ) -> None:
        mock_get.side_effect = requests.ConnectionError("host unavailable")

        with self.assertRaises(HTTPException) as raised:
            price_check("http://definitely-not-a-real-host.invalid/product")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail, "Unable to reach the comparison URL.")
