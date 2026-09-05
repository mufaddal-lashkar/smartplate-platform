import logging

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.tools import BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI

from src.config import settings

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, model: str | None = None, temperature: float = 0.0) -> None:
        self._model_name = model or settings.gemini_model
        self._temperature = temperature
        self._base = ChatGoogleGenerativeAI(
            model=self._model_name,
            google_api_key=settings.gemini_api_key,
            temperature=self._temperature,
        )

    def bind_tools(self, tools: list[BaseTool]) -> BaseChatModel:
        return self._base.bind_tools(tools)

    async def ainvoke(self, messages: list[BaseMessage]) -> BaseMessage:
        return await self._base.ainvoke(messages)
