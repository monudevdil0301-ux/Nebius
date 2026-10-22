"""
Realistic Production Incidents & Broken Repositories for Demonstration
Each scenario represents a real-world production outage with stack traces,
affected files, and a test suite that initially fails.
"""

SCENARIOS = {
    "pydantic-v2-billing-outage": {
        "id": "pydantic-v2-billing-outage",
        "title": "🚨 Pydantic v2 Migration Crash in Billing Microservice",
        "service": "billing-service:v2.4.1",
        "severity": "CRITICAL (P1)",
        "description": "After a dependency auto-bump, all checkout transactions throw 500 errors. The legacy `@validator` decorator and `.dict()` calls broke with Pydantic v2 runtime incompatibility.",
        "stack_trace": """Traceback (most recent call last):
  File "app/billing/processor.py", line 42, in process_transaction
    payload = PaymentRequest.parse_raw(raw_json)
  File "pydantic/main.py", line 1120, in parse_raw
    raise PydanticUserError(
pydantic.errors.PydanticUserError: `parse_raw` isn't supported in Pydantic V2, use `model_validate_json` instead.
During handling of the above exception, another exception occurred:
Traceback (most recent call last):
  File "app/billing/models.py", line 18, in <module>
    @validator("card_number")
    ^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: module 'pydantic' has no attribute 'validator'. Did you mean: 'field_validator'?""",
        "failing_file": "app/billing/models.py",
        "original_code": '''from pydantic import BaseModel, validator, Field
import re

class PaymentRequest(BaseModel):
    user_id: str
    amount_cents: int = Field(gt=0)
    currency: str = "USD"
    card_number: str
    cvv: str

    @validator("card_number")
    def validate_card_luhn(cls, v):
        clean = re.sub(r'\\D', '', v)
        if len(clean) != 16:
            raise ValueError("Card number must be 16 digits")
        return clean

    @validator("cvv")
    def validate_cvv(cls, v):
        if not re.match(r'^\\d{3,4}$', v):
            raise ValueError("CVV must be 3 or 4 digits")
        return v

    def serialize_for_gateway(self):
        # Deprecated in Pydantic v2
        return self.dict(exclude={"cvv"})
''',
        "test_code": '''import pytest
from app.billing.models import PaymentRequest

def test_valid_payment_model():
    req = PaymentRequest.model_validate_json('{"user_id": "usr_99", "amount_cents": 5000, "card_number": "4111-2222-3333-4444", "cvv": "123"}')
    assert req.user_id == "usr_99"
    assert req.card_number == "4111222233334444"
    data = req.serialize_for_gateway()
    assert "cvv" not in data
    assert data["amount_cents"] == 5000

def test_invalid_cvv():
    with pytest.raises(Exception):
        PaymentRequest.model_validate({"user_id": "usr_1", "amount_cents": 100, "card_number": "4111222233334444", "cvv": "abc"})
'''
    },

    "sqlalchemy-async-deadlock": {
        "id": "sqlalchemy-async-deadlock",
        "title": "⚡ Async SQLAlchemy 2.0 Connection Pool Exhaustion",
        "service": "order-service:v3.1.0",
        "severity": "HIGH (P2)",
        "description": "High traffic causes connections to remain open because `session.commit()` is not awaited and transactions do not release properly back to the async connection pool.",
        "stack_trace": """sqlalchemy.exc.TimeoutError: QueuePool limit of size 20 overflow 10 reached, connection timed out, timeout 30.00
  File "app/services/order.py", line 64, in checkout_cart
    result = session.execute(stmt)
  File "sqlalchemy/ext/asyncio/session.py", line 412, in execute
    raise InvalidRequestError("AsyncSession.execute() must be awaited")""",
        "failing_file": "app/services/order.py",
        "original_code": '''from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models import Order, Inventory

class OrderService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def checkout_cart(self, user_id: str, items: list[dict]):
        total = 0
        # BUG: Synchronous calls on AsyncSession and unawaited commit
        for item in items:
            stmt = select(Inventory).where(Inventory.sku == item["sku"])
            res = self.session.execute(stmt)
            inv = res.scalar_one_or_none()
            if not inv or inv.stock < item["qty"]:
                raise ValueError(f"Insufficient stock for {item['sku']}")
            inv.stock -= item["qty"]
            total += inv.price * item["qty"]

        new_order = Order(user_id=user_id, total_amount=total, status="CONFIRMED")
        self.session.add(new_order)
        # BUG: Forgot to await commit and close
        self.session.commit()
        return {"order_id": new_order.id, "status": "CONFIRMED"}
''',
        "test_code": '''import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.order import OrderService

@pytest.mark.asyncio
async def test_order_checkout_awaits_properly():
    session = AsyncMock()
    # Mocking scalar_one_or_none
    mock_inv = MagicMock(sku="ITEM1", stock=10, price=20)
    mock_exec = MagicMock()
    mock_exec.scalar_one_or_none.return_value = mock_inv
    session.execute.return_value = mock_exec
    
    svc = OrderService(session)
    res = await svc.checkout_cart("u123", [{"sku": "ITEM1", "qty": 2}])
    assert res["status"] == "CONFIRMED"
    session.execute.assert_awaited()
    session.commit.assert_awaited()
'''
    },

    "transformers-padding-crash": {
        "id": "transformers-padding-crash",
        "title": "🧠 Tensor Shape Mismatch in Nemotron LLM Batch Inference",
        "service": "inference-engine:v1.8.0",
        "severity": "CRITICAL (P1)",
        "description": "FlashAttention2 requires left-padding for decoder-only autoregressive generation, but tokenizer was set to right-padding, causing attention mask dimension mismatch in production.",
        "stack_trace": """RuntimeError: FlashAttention only supports left padding for generation, but right padding was detected (padding_side='right').
  File "engine/inference.py", line 55, in batch_generate
    outputs = model.generate(**inputs, max_new_tokens=64)
  File "transformers/generation/utils.py", line 1820, in generate
    raise ValueError("Decoder-only architecture with batched generation requires tokenizer.padding_side = 'left'")""",
        "failing_file": "engine/inference.py",
        "original_code": '''class BatchInferencePipeline:
    def __init__(self, tokenizer, model):
        self.tokenizer = tokenizer
        self.model = model
        # BUG: Decoder-only autoregressive generation requires left padding
        self.tokenizer.padding_side = "right"
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

    def batch_generate(self, prompts: list[str], max_new_tokens: int = 64):
        # BUG: Missing left padding and attention mask validation
        inputs = self.tokenizer(
            prompts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=2048
        )
        return self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            pad_token_id=self.tokenizer.pad_token_id
        )
''',
        "test_code": '''import pytest
from unittest.mock import MagicMock
from engine.inference import BatchInferencePipeline

def test_inference_pipeline_left_padding():
    tok = MagicMock()
    tok.pad_token = None
    tok.eos_token = "<eos>"
    tok.padding_side = "right"
    model = MagicMock()
    pipe = BatchInferencePipeline(tok, model)
    assert pipe.tokenizer.padding_side == "left"
    assert pipe.tokenizer.pad_token == "<eos>"
'''
    }
}
