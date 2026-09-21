"""Cliente REST do Supabase com a chave `service_role`.

Camada fina e injetável: tudo que o worker faz no banco e no Storage passa por
aqui, para os testes trocarem por um duplo sem rede.

A `service_role` **bypassa a RLS** — é por isso que as travas que importam
(D5, D7, tenant) estão em trigger e em função `security definer`, não em
`if` no Python. Ver spec §8 e a migration `fase3-face-recognition.sql`.
"""

from __future__ import annotations

from typing import Any, Protocol

import httpx


class SupabaseApi(Protocol):
    def rpc(self, name: str, payload: dict[str, Any]) -> Any: ...
    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...
    def count(self, table: str, params: dict[str, str]) -> int: ...
    def download(self, bucket: str, path: str) -> bytes: ...
    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None: ...
    def remove(self, bucket: str, paths: list[str]) -> None: ...


class SupabaseError(RuntimeError):
    """Falha de comunicação com o Supabase, já sem corpo de resposta sensível."""


class SupabaseClient:
    def __init__(self, url: str, service_role_key: str, timeout_seconds: int = 60) -> None:
        self._url = url.rstrip("/")
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout_seconds),
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> SupabaseClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # ---------- Postgres ----------

    def rpc(self, name: str, payload: dict[str, Any]) -> Any:
        resp = self._client.post(
            f"{self._url}/rest/v1/rpc/{name}",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        self._raise_for_status(resp, f"rpc {name}")
        return resp.json() if resp.content else None

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        resp = self._client.get(f"{self._url}/rest/v1/{table}", params=params)
        self._raise_for_status(resp, f"select {table}")
        data = resp.json()
        return data if isinstance(data, list) else []

    def count(self, table: str, params: dict[str, str]) -> int:
        resp = self._client.head(
            f"{self._url}/rest/v1/{table}",
            params={**params, "select": "id"},
            headers={"Prefer": "count=exact"},
        )
        self._raise_for_status(resp, f"count {table}")
        # Content-Range vem como "*/12".
        total = resp.headers.get("content-range", "*/0").split("/")[-1]
        return int(total) if total.isdigit() else 0

    # ---------- Storage ----------

    def download(self, bucket: str, path: str) -> bytes:
        resp = self._client.get(f"{self._url}/storage/v1/object/{bucket}/{path}")
        self._raise_for_status(resp, f"download {bucket}")
        return resp.content

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        resp = self._client.post(
            f"{self._url}/storage/v1/object/{bucket}/{path}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
        )
        self._raise_for_status(resp, f"upload {bucket}")

    def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        resp = self._client.request(
            "DELETE",
            f"{self._url}/storage/v1/object/{bucket}",
            json={"prefixes": paths},
            headers={"Content-Type": "application/json"},
        )
        self._raise_for_status(resp, f"remove {bucket}")

    @staticmethod
    def _raise_for_status(resp: httpx.Response, context: str) -> None:
        if resp.is_success:
            return
        # O corpo pode trazer o caminho do objeto, que identifica a foto de um
        # aluno. Só o código sobe para o log; o detalhe fica na exceção, que o
        # chamador grava em `last_error` do job — coluna da escola, não do log.
        raise SupabaseError(f"{context}: HTTP {resp.status_code} {resp.text[:300]}")
