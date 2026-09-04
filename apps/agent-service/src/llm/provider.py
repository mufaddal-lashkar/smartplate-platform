from typing import Protocol

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.tools import BaseTool

from src.schemas.reuse_estimate import ReuseEstimateRequest, ReuseEstimateResponse


class ProviderError(Exception):
    pass


class ReuseProvider(Protocol):
    async def __call__(self, request: ReuseEstimateRequest) -> ReuseEstimateResponse: ...


class LLMProvider(Protocol):
    def bind_tools(self, tools: list[BaseTool]) -> BaseChatModel: ...

    async def ainvoke(self, messages: list[BaseMessage]) -> BaseMessage: ...
