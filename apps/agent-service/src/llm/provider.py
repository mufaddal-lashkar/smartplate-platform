from typing import Protocol

from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse


class ProviderError(Exception):
    pass


class ReuseProvider(Protocol):
    async def __call__(self, request: ReuseEstimateRequest) -> ReuseEstimateResponse: ...
