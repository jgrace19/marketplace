import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

import main


class PromoCodeTests(unittest.TestCase):
    def test_fresh10_returns_discounted_total(self):
        promo = main.validate_promo_code(" fresh10 ", 3490)

        self.assertEqual(promo["code"], "FRESH10")
        self.assertEqual(promo["discount_amount"], 3.49)
        self.assertEqual(promo["total"], 31.41)

    def test_save5_requires_minimum_subtotal(self):
        with self.assertRaises(HTTPException) as context:
            main.validate_promo_code("SAVE5", 2499)

        self.assertEqual(
            context.exception.detail["code"],
            "minimum_subtotal_not_met",
        )

    def test_expired_and_unknown_codes_have_structured_errors(self):
        expected_errors = {
            "FRESH20EXPIRED": "expired_promo_code",
            "NOTREAL": "invalid_promo_code",
        }

        for code, expected_error in expected_errors.items():
            with self.subTest(code=code), self.assertRaises(HTTPException) as context:
                main.validate_promo_code(code, 5000)
            self.assertEqual(context.exception.detail["code"], expected_error)

    @patch.object(main.stripe.checkout.Session, "create")
    @patch.dict(main.os.environ, {"STRIPE_SECRET_KEY": "sk_test_example"})
    def test_checkout_line_items_match_discounted_total(self, create_session):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session",
            id="cs_test_promo",
        )
        payload = main.CheckoutRequest(
            items=[
                main.CheckoutItem(
                    id="greenmart-grocery-1",
                    name="Forged name",
                    price=0.01,
                    quantity=2,
                ),
                main.CheckoutItem(
                    id="greenmart-grocery-2",
                    name="Forged name",
                    price=0.01,
                    quantity=1,
                ),
            ],
            store_id="greenmart",
            store_name="GreenMart",
            promo_code="FRESH10",
        )

        result = main.create_checkout_session(payload)

        self.assertEqual(result["session_id"], "cs_test_promo")
        session_kwargs = create_session.call_args.kwargs
        stripe_total = sum(
            item["price_data"]["unit_amount"] * item["quantity"]
            for item in session_kwargs["line_items"]
        )
        self.assertEqual(stripe_total, 853)
        self.assertEqual(session_kwargs["metadata"]["promo_code"], "FRESH10")
        self.assertEqual(session_kwargs["metadata"]["discount_amount"], "0.95")

    @patch.object(main.stripe.checkout.Session, "create")
    @patch.dict(main.os.environ, {"STRIPE_SECRET_KEY": "sk_test_example"})
    def test_save5_checkout_uses_authoritative_catalog_price(self, create_session):
        create_session.return_value = SimpleNamespace(
            url="https://checkout.stripe.test/session",
            id="cs_test_save5",
        )
        payload = main.CheckoutRequest(
            items=[
                main.CheckoutItem(
                    id="greenmart-grocery-6",
                    name="Not chicken",
                    price=1000,
                    quantity=3,
                )
            ],
            store_id="greenmart",
            promo_code="SAVE5",
        )

        main.create_checkout_session(payload)

        session_kwargs = create_session.call_args.kwargs
        stripe_total = sum(
            item["price_data"]["unit_amount"] * item["quantity"]
            for item in session_kwargs["line_items"]
        )
        self.assertEqual(stripe_total, 3037)
        self.assertEqual(session_kwargs["metadata"]["discount_amount"], "5.00")

    @patch.object(main.stripe.checkout.Session, "create")
    def test_invalid_promos_never_call_stripe(self, create_session):
        for code in ("NOTREAL", "FRESH20EXPIRED"):
            payload = main.CheckoutRequest(
                items=[
                    main.CheckoutItem(
                        id="greenmart-grocery-1",
                        name="Bananas",
                        price=3.49,
                        quantity=1,
                    )
                ],
                store_id="greenmart",
                promo_code=code,
            )
            with self.subTest(code=code), self.assertRaises(HTTPException):
                main.create_checkout_session(payload)

        create_session.assert_not_called()

    def test_checkout_request_limits_products_for_stripe(self):
        item = {
            "id": "greenmart-grocery-1",
            "name": "Bananas",
            "price": 3.49,
            "quantity": 1,
        }

        with self.assertRaises(ValidationError):
            main.CheckoutRequest(items=[item] * 51, store_id="greenmart")


if __name__ == "__main__":
    unittest.main()
