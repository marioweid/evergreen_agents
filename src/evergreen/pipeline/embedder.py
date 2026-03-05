"""Generate text embeddings using OpenAI text-embedding-3-small."""

from __future__ import annotations

from openai import AsyncOpenAI

_MODEL = "text-embedding-3-small"
_DIMENSIONS = 1536

_client: AsyncOpenAI | None = None


def _get_client(api_key: str) -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=api_key)
    return _client


def build_document(item_title: str, item_description: str | None, products: list[str]) -> str:
    """Build the text document to embed for a roadmap item."""
    parts = [f"Title: {item_title}"]
    if item_description:
        parts.append(f"Description: {item_description}")
    if products:
        parts.append(f"Products: {', '.join(products)}")
    return "\n".join(parts)


async def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed a batch of texts, returning one embedding vector per text."""
    client = _get_client(api_key)
    response = await client.embeddings.create(
        model=_MODEL,
        input=texts,
        dimensions=_DIMENSIONS,
    )
    return [entry.embedding for entry in response.data]


async def embed_query(text: str, api_key: str) -> list[float]:
    """Embed a single query string."""
    embeddings = await embed_texts([text], api_key)
    return embeddings[0]
