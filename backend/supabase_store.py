import asyncio
import json
import logging
import socket
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, unquote, urlparse, urlunparse

import asyncpg
import httpx

logger = logging.getLogger(__name__)

DEFAULT_SUPABASE_POOLER_REGIONS = [
    "us-east-1",
    "us-west-1",
    "us-west-2",
    "eu-west-1",
    "eu-central-1",
    "ap-south-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ca-central-1",
    "sa-east-1",
]

DEFAULT_SUPABASE_POOLER_PREFIXES = ["aws-1", "aws-0"]


class UpdateResult:
    def __init__(self, matched_count: int = 0, modified_count: int = 0, upserted_id: Optional[int] = None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class DeleteResult:
    def __init__(self, deleted_count: int = 0):
        self.deleted_count = deleted_count


class InsertResult:
    def __init__(self, inserted_id: Optional[int] = None):
        self.inserted_id = inserted_id


MISSING = object()


def _json_default(value: Any):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Type not serializable: {type(value)}")


def _to_json(value: Any) -> str:
    return json.dumps(value, default=_json_default, ensure_ascii=False)


def _get_by_path(doc: Dict[str, Any], path: str, default: Any = MISSING):
    current: Any = doc
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def _set_by_path(doc: Dict[str, Any], path: str, value: Any):
    parts = path.split(".")
    current: Dict[str, Any] = doc
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            child = {}
            current[part] = child
        current = child
    current[parts[-1]] = value


def _delete_by_path(doc: Dict[str, Any], path: str):
    parts = path.split(".")
    current = doc
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return
        current = current[part]
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def _compare(actual: Any, operator: str, expected: Any) -> bool:
    if actual is MISSING:
        return False
    try:
        if operator == "$gte":
            return actual >= expected
        if operator == "$gt":
            return actual > expected
        if operator == "$lte":
            return actual <= expected
        if operator == "$lt":
            return actual < expected
        if operator == "$ne":
            return actual != expected
        if operator == "$in":
            return actual in expected
        if operator == "$nin":
            return actual not in expected
    except Exception:
        return False
    raise ValueError(f"Unsupported query operator: {operator}")


def _matches_query(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    if not query:
        return True

    for key, expected in query.items():
        if key == "$or":
            if not any(_matches_query(doc, sub_query) for sub_query in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches_query(doc, sub_query) for sub_query in expected):
                return False
            continue

        actual = _get_by_path(doc, key, MISSING)
        if isinstance(expected, dict):
            has_operator = any(k.startswith("$") for k in expected.keys())
            if has_operator:
                for op, op_value in expected.items():
                    if not _compare(actual, op, op_value):
                        return False
            else:
                if actual != expected:
                    return False
        else:
            if actual is MISSING and expected is None:
                continue
            if actual != expected:
                return False

    return True


def _apply_projection(doc: Dict[str, Any], projection: Optional[Dict[str, int]]) -> Dict[str, Any]:
    if not projection:
        return deepcopy(doc)

    projection = {k: v for k, v in projection.items() if k != "_id"}
    if not projection:
        return deepcopy(doc)

    include_fields = [k for k, v in projection.items() if v]
    exclude_fields = [k for k, v in projection.items() if not v]

    if include_fields:
        out: Dict[str, Any] = {}
        for path in include_fields:
            value = _get_by_path(doc, path, MISSING)
            if value is not MISSING:
                _set_by_path(out, path, deepcopy(value))
        return out

    out = deepcopy(doc)
    for path in exclude_fields:
        _delete_by_path(out, path)
    return out


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
    next_doc = deepcopy(doc)

    for path, value in (update.get("$set") or {}).items():
        _set_by_path(next_doc, path, value)

    for path, value in (update.get("$inc") or {}).items():
        current = _get_by_path(next_doc, path, 0)
        if current in (MISSING, None):
            current = 0
        _set_by_path(next_doc, path, current + value)

    for path, value in (update.get("$addToSet") or {}).items():
        current = _get_by_path(next_doc, path, [])
        if current in (MISSING, None) or not isinstance(current, list):
            current = []
        if value not in current:
            current.append(value)
        _set_by_path(next_doc, path, current)

    for path, value in (update.get("$push") or {}).items():
        current = _get_by_path(next_doc, path, [])
        if current in (MISSING, None) or not isinstance(current, list):
            current = []

        if isinstance(value, dict) and "$each" in value:
            current.extend(value.get("$each") or [])
            if "$slice" in value:
                slice_val = int(value["$slice"])
                if slice_val >= 0:
                    current = current[:slice_val]
                else:
                    current = current[slice_val:]
        else:
            current.append(value)

        _set_by_path(next_doc, path, current)

    return next_doc


class SupabaseCursor:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        if length is None:
            return deepcopy(self._rows)
        return deepcopy(self._rows[:length])


class SupabaseCollection:
    def __init__(self, store: "SupabaseDocumentStore", name: str):
        self.store = store
        self.name = name

    async def _fetch_rows(self) -> List[Tuple[int, Dict[str, Any]]]:
        pool = await self.store.get_pool()
        rows = await pool.fetch(
            "SELECT id, doc FROM app_documents WHERE collection = $1",
            self.name,
        )
        out: List[Tuple[int, Dict[str, Any]]] = []
        for row in rows:
            raw_doc = row["doc"]
            doc = json.loads(raw_doc) if isinstance(raw_doc, str) else raw_doc
            out.append((row["id"], doc))
        return out

    async def find_one(self, query: Dict[str, Any], projection: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
        for _, doc in await self._fetch_rows():
            if _matches_query(doc, query):
                return _apply_projection(doc, projection)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> SupabaseCursor:
        async def _execute():
            matched: List[Dict[str, Any]] = []
            for _, doc in await self._fetch_rows():
                if _matches_query(doc, query):
                    matched.append(_apply_projection(doc, projection))
            return matched

        class _LazyCursor(SupabaseCursor):
            def __init__(self):
                super().__init__([])
                self._loaded = False

            async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
                if not self._loaded:
                    self._rows = await _execute()
                    self._loaded = True
                return await super().to_list(length)

        return _LazyCursor()

    async def insert_one(self, doc: Dict[str, Any]) -> InsertResult:
        pool = await self.store.get_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO app_documents (collection, doc)
            VALUES ($1, $2::jsonb)
            RETURNING id
            """,
            self.name,
            _to_json(doc),
        )
        return InsertResult(inserted_id=row["id"] if row else None)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        rows = await self._fetch_rows()
        for row_id, doc in rows:
            if _matches_query(doc, query):
                next_doc = _apply_update(doc, update)
                pool = await self.store.get_pool()
                await pool.execute(
                    "UPDATE app_documents SET doc = $1::jsonb WHERE id = $2",
                    _to_json(next_doc),
                    row_id,
                )
                return UpdateResult(matched_count=1, modified_count=1)

        if upsert:
            seed_doc = deepcopy(query)
            next_doc = _apply_update(seed_doc, update)
            insert_res = await self.insert_one(next_doc)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=insert_res.inserted_id)

        return UpdateResult(matched_count=0, modified_count=0)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> UpdateResult:
        rows = await self._fetch_rows()
        matched = 0
        pool = await self.store.get_pool()
        for row_id, doc in rows:
            if _matches_query(doc, query):
                matched += 1
                next_doc = _apply_update(doc, update)
                await pool.execute(
                    "UPDATE app_documents SET doc = $1::jsonb WHERE id = $2",
                    _to_json(next_doc),
                    row_id,
                )
        return UpdateResult(matched_count=matched, modified_count=matched)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._fetch_rows()
        for row_id, doc in rows:
            if _matches_query(doc, query):
                pool = await self.store.get_pool()
                await pool.execute("DELETE FROM app_documents WHERE id = $1", row_id)
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._fetch_rows()
        to_delete = [row_id for row_id, doc in rows if _matches_query(doc, query)]
        if not to_delete:
            return DeleteResult(deleted_count=0)
        pool = await self.store.get_pool()
        await pool.execute("DELETE FROM app_documents WHERE id = ANY($1::bigint[])", to_delete)
        return DeleteResult(deleted_count=len(to_delete))

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        rows = await self._fetch_rows()
        return sum(1 for _, doc in rows if _matches_query(doc, query))

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> SupabaseCursor:
        async def _execute():
            docs: List[Dict[str, Any]] = [doc for _, doc in await self._fetch_rows()]

            for stage in pipeline:
                if "$match" in stage:
                    docs = [doc for doc in docs if _matches_query(doc, stage["$match"])]
                    continue

                if "$unwind" in stage:
                    field = stage["$unwind"].lstrip("$")
                    unwound: List[Dict[str, Any]] = []
                    for doc in docs:
                        value = _get_by_path(doc, field, [])
                        if isinstance(value, list):
                            for item in value:
                                next_doc = deepcopy(doc)
                                _set_by_path(next_doc, field, item)
                                unwound.append(next_doc)
                    docs = unwound
                    continue

                if "$group" in stage:
                    spec = stage["$group"]
                    group_expr = spec.get("_id")
                    grouped: Dict[str, Dict[str, Any]] = {}

                    for doc in docs:
                        if isinstance(group_expr, str) and group_expr.startswith("$"):
                            group_key = _get_by_path(doc, group_expr[1:], None)
                        else:
                            group_key = group_expr
                        json_key = _to_json(group_key)
                        bucket = grouped.get(json_key)
                        if bucket is None:
                            bucket = {"_id": group_key}
                            for field, agg in spec.items():
                                if field == "_id":
                                    continue
                                if "$sum" in agg:
                                    bucket[field] = 0
                            grouped[json_key] = bucket

                        for field, agg in spec.items():
                            if field == "_id":
                                continue
                            if "$sum" in agg:
                                sum_expr = agg["$sum"]
                                if isinstance(sum_expr, str) and sum_expr.startswith("$"):
                                    add_value = _get_by_path(doc, sum_expr[1:], 0)
                                else:
                                    add_value = sum_expr
                                bucket[field] += add_value or 0

                    docs = list(grouped.values())
                    continue

                if "$count" in stage:
                    field = stage["$count"]
                    docs = [{field: len(docs)}]
                    continue

                raise ValueError(f"Unsupported aggregation stage: {stage}")

            return docs

        class _LazyAggCursor(SupabaseCursor):
            def __init__(self):
                super().__init__([])
                self._loaded = False

            async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
                if not self._loaded:
                    self._rows = await _execute()
                    self._loaded = True
                return await super().to_list(length)

        return _LazyAggCursor()


class SupabaseDocumentStore:
    def __init__(
        self,
        database_url: str,
        supabase_url: Optional[str] = None,
        auto_discover_pooler: bool = True,
        pooler_discovery_timeout: float = 2.0,
        pooler_regions: Optional[List[str]] = None,
    ):
        self.database_url = self._normalize_database_url(database_url)
        self.supabase_url = supabase_url
        self.auto_discover_pooler = auto_discover_pooler
        self.pooler_discovery_timeout = pooler_discovery_timeout
        self.pooler_regions = pooler_regions or list(DEFAULT_SUPABASE_POOLER_REGIONS)
        self._pool: Optional[asyncpg.Pool] = None
        self._lock = asyncio.Lock()
        self._collections: Dict[str, SupabaseCollection] = {}
        self._pooler_discovery_attempted = False

    @staticmethod
    def _normalize_database_url(database_url: str) -> str:
        if "://" not in database_url or "@" not in database_url:
            return database_url
        scheme, rest = database_url.split("://", 1)
        if "@" not in rest:
            return database_url
        userinfo, host_part = rest.rsplit("@", 1)
        if ":" not in userinfo:
            return database_url
        username, password = userinfo.split(":", 1)
        encoded_password = quote(unquote(password), safe="")
        return f"{scheme}://{username}:{encoded_password}@{host_part}"

    @staticmethod
    def _host_has_ipv4(hostname: str) -> bool:
        try:
            records = socket.getaddrinfo(hostname, None, socket.AF_INET)
            return bool(records)
        except socket.gaierror:
            return False

    def _extract_project_ref(self, parsed) -> Optional[str]:
        hostname = (parsed.hostname or "").lower()
        if hostname.startswith("db.") and hostname.endswith(".supabase.co"):
            parts = hostname.split(".")
            if len(parts) >= 4:
                return parts[1]
        if self.supabase_url:
            supa_host = (urlparse(self.supabase_url).hostname or "").lower()
            if supa_host.endswith(".supabase.co"):
                return supa_host.split(".")[0]
        return None

    @staticmethod
    def _build_database_url(parsed, username: str, host: str, port: int) -> str:
        scheme = parsed.scheme or "postgresql"
        password = unquote(parsed.password or "")
        path = parsed.path or "/postgres"
        query = parsed.query
        user_enc = quote(username, safe="")
        password_enc = quote(password, safe="")
        netloc = f"{user_enc}:{password_enc}@{host}:{port}"
        return urlunparse((scheme, netloc, path, parsed.params, query, parsed.fragment))

    async def _probe_database_url(self, probe_url: str) -> bool:
        conn = None
        try:
            conn = await asyncpg.connect(
                probe_url,
                timeout=self.pooler_discovery_timeout,
                statement_cache_size=0,
            )
            await conn.execute("SELECT 1")
            return True
        except Exception:
            return False
        finally:
            if conn is not None:
                await conn.close()

    async def _discover_pooler_url(self) -> Optional[str]:
        parsed = urlparse(self.database_url)
        hostname = (parsed.hostname or "").lower()
        if not hostname:
            return None
        if not (hostname.startswith("db.") and hostname.endswith(".supabase.co")):
            return None
        if self._host_has_ipv4(hostname):
            return None

        project_ref = self._extract_project_ref(parsed)
        if not project_ref:
            return None

        base_user = unquote(parsed.username or "postgres")
        candidate_users: List[str] = []
        if base_user and not base_user.endswith(f".{project_ref}"):
            candidate_users.append(f"{base_user}.{project_ref}")
        if base_user:
            candidate_users.append(base_user)
        if f"postgres.{project_ref}" not in candidate_users:
            candidate_users.append(f"postgres.{project_ref}")

        tried: set = set()
        logger.info("Supabase IPv4 pooler auto-discovery started for project %s", project_ref)
        for prefix in DEFAULT_SUPABASE_POOLER_PREFIXES:
            for region in self.pooler_regions:
                host = f"{prefix}-{region}.pooler.supabase.com"
                if not self._host_has_ipv4(host):
                    continue
                for username in candidate_users:
                    probe_url = self._build_database_url(parsed, username, host, 6543)
                    if probe_url in tried:
                        continue
                    tried.add(probe_url)
                    if await self._probe_database_url(probe_url):
                        logger.info("Supabase IPv4 pooler discovered at %s:6543", host)
                        return probe_url
        logger.warning("Supabase pooler auto-discovery failed for project %s", project_ref)
        return None

    async def get_pool(self) -> asyncpg.Pool:
        if self._pool:
            return self._pool
        async with self._lock:
            if self._pool:
                return self._pool
            try:
                # Supabase pooler (PgBouncer) in transaction mode is incompatible with asyncpg statement caching.
                self._pool = await asyncpg.create_pool(
                    self.database_url,
                    min_size=1,
                    max_size=10,
                    statement_cache_size=0,
                )
            except Exception:
                if not self.auto_discover_pooler or self._pooler_discovery_attempted:
                    raise
                self._pooler_discovery_attempted = True
                discovered_url = await self._discover_pooler_url()
                if not discovered_url:
                    raise
                self.database_url = discovered_url
                self._pool = await asyncpg.create_pool(
                    self.database_url,
                    min_size=1,
                    max_size=10,
                    statement_cache_size=0,
                )
            await self._ensure_schema()
            return self._pool

    async def _ensure_schema(self):
        pool = self._pool
        if not pool:
            return
        async with pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_documents (
                    id BIGSERIAL PRIMARY KEY,
                    collection TEXT NOT NULL,
                    doc JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_app_documents_collection ON app_documents (collection);"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_app_documents_doc_gin ON app_documents USING GIN (doc);"
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_files (
                    storage_key TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    content_type TEXT NOT NULL DEFAULT 'application/pdf',
                    content BYTEA NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_app_files_user_id ON app_files (user_id);"
            )

    def __getattr__(self, item: str) -> SupabaseCollection:
        if item.startswith("_"):
            raise AttributeError(item)
        collection = self._collections.get(item)
        if collection is None:
            collection = SupabaseCollection(self, item)
            self._collections[item] = collection
        return collection

    async def close(self):
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def put_file(self, storage_key: str, user_id: str, content: bytes, content_type: str = "application/pdf"):
        pool = await self.get_pool()
        await pool.execute(
            """
            INSERT INTO app_files (storage_key, user_id, content_type, content, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (storage_key)
            DO UPDATE SET
                user_id = EXCLUDED.user_id,
                content_type = EXCLUDED.content_type,
                content = EXCLUDED.content,
                updated_at = NOW()
            """,
            storage_key,
            user_id,
            content_type,
            content,
        )

    async def get_file(self, storage_key: str) -> Optional[Dict[str, Any]]:
        pool = await self.get_pool()
        row = await pool.fetchrow(
            """
            SELECT storage_key, user_id, content_type, content
            FROM app_files
            WHERE storage_key = $1
            """,
            storage_key,
        )
        if not row:
            return None
        return {
            "storage_key": row["storage_key"],
            "user_id": row["user_id"],
            "content_type": row["content_type"],
            "content": row["content"],
        }

    async def delete_file(self, storage_key: str) -> bool:
        pool = await self.get_pool()
        result = await pool.execute(
            "DELETE FROM app_files WHERE storage_key = $1",
            storage_key,
        )
        return result.endswith("1")

    async def delete_files_by_user(self, user_id: str):
        pool = await self.get_pool()
        await pool.execute("DELETE FROM app_files WHERE user_id = $1", user_id)


class SupabaseRestCollection:
    def __init__(self, store: "SupabaseRestDocumentStore", name: str):
        self.store = store
        self.name = name

    async def _request(self, method: str, path: str, **kwargs):
        return await self.store._request(method, path, **kwargs)

    async def _fetch_rows(self) -> List[Tuple[int, Dict[str, Any]]]:
        response = await self._request(
            "GET",
            "/rest/v1/app_documents",
            params={
                "select": "id,doc",
                "collection": f"eq.{self.name}",
                "order": "id.asc",
            },
        )
        payload = response.json() or []
        out: List[Tuple[int, Dict[str, Any]]] = []
        for row in payload:
            out.append((row["id"], row.get("doc") or {}))
        return out

    async def find_one(self, query: Dict[str, Any], projection: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
        for _, doc in await self._fetch_rows():
            if _matches_query(doc, query):
                return _apply_projection(doc, projection)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> SupabaseCursor:
        async def _execute():
            matched: List[Dict[str, Any]] = []
            for _, doc in await self._fetch_rows():
                if _matches_query(doc, query):
                    matched.append(_apply_projection(doc, projection))
            return matched

        class _LazyCursor(SupabaseCursor):
            def __init__(self):
                super().__init__([])
                self._loaded = False

            async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
                if not self._loaded:
                    self._rows = await _execute()
                    self._loaded = True
                return await super().to_list(length)

        return _LazyCursor()

    async def insert_one(self, doc: Dict[str, Any]) -> InsertResult:
        response = await self._request(
            "POST",
            "/rest/v1/app_documents",
            json=[{"collection": self.name, "doc": doc}],
            headers={"Prefer": "return=representation"},
        )
        rows = response.json() or []
        inserted_id = rows[0]["id"] if rows else None
        return InsertResult(inserted_id=inserted_id)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        rows = await self._fetch_rows()
        for row_id, doc in rows:
            if _matches_query(doc, query):
                next_doc = _apply_update(doc, update)
                await self._request(
                    "PATCH",
                    "/rest/v1/app_documents",
                    params={"id": f"eq.{row_id}"},
                    json={"doc": next_doc},
                )
                return UpdateResult(matched_count=1, modified_count=1)

        if upsert:
            seed_doc = deepcopy(query)
            next_doc = _apply_update(seed_doc, update)
            insert_res = await self.insert_one(next_doc)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=insert_res.inserted_id)

        return UpdateResult(matched_count=0, modified_count=0)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> UpdateResult:
        rows = await self._fetch_rows()
        matched = 0
        for row_id, doc in rows:
            if _matches_query(doc, query):
                matched += 1
                next_doc = _apply_update(doc, update)
                await self._request(
                    "PATCH",
                    "/rest/v1/app_documents",
                    params={"id": f"eq.{row_id}"},
                    json={"doc": next_doc},
                )
        return UpdateResult(matched_count=matched, modified_count=matched)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._fetch_rows()
        for row_id, doc in rows:
            if _matches_query(doc, query):
                await self._request(
                    "DELETE",
                    "/rest/v1/app_documents",
                    params={"id": f"eq.{row_id}"},
                )
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._fetch_rows()
        deleted = 0
        for row_id, doc in rows:
            if _matches_query(doc, query):
                await self._request(
                    "DELETE",
                    "/rest/v1/app_documents",
                    params={"id": f"eq.{row_id}"},
                )
                deleted += 1
        return DeleteResult(deleted_count=deleted)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        rows = await self._fetch_rows()
        return sum(1 for _, doc in rows if _matches_query(doc, query))

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> SupabaseCursor:
        async def _execute():
            docs: List[Dict[str, Any]] = [doc for _, doc in await self._fetch_rows()]

            for stage in pipeline:
                if "$match" in stage:
                    docs = [doc for doc in docs if _matches_query(doc, stage["$match"])]
                    continue

                if "$unwind" in stage:
                    field = stage["$unwind"].lstrip("$")
                    unwound: List[Dict[str, Any]] = []
                    for doc in docs:
                        value = _get_by_path(doc, field, [])
                        if isinstance(value, list):
                            for item in value:
                                next_doc = deepcopy(doc)
                                _set_by_path(next_doc, field, item)
                                unwound.append(next_doc)
                    docs = unwound
                    continue

                if "$group" in stage:
                    spec = stage["$group"]
                    group_expr = spec.get("_id")
                    grouped: Dict[str, Dict[str, Any]] = {}
                    for doc in docs:
                        if isinstance(group_expr, str) and group_expr.startswith("$"):
                            group_key = _get_by_path(doc, group_expr[1:], None)
                        else:
                            group_key = group_expr
                        json_key = _to_json(group_key)
                        bucket = grouped.get(json_key)
                        if bucket is None:
                            bucket = {"_id": group_key}
                            for field, agg in spec.items():
                                if field == "_id":
                                    continue
                                if "$sum" in agg:
                                    bucket[field] = 0
                            grouped[json_key] = bucket

                        for field, agg in spec.items():
                            if field == "_id":
                                continue
                            if "$sum" in agg:
                                sum_expr = agg["$sum"]
                                if isinstance(sum_expr, str) and sum_expr.startswith("$"):
                                    add_value = _get_by_path(doc, sum_expr[1:], 0)
                                else:
                                    add_value = sum_expr
                                bucket[field] += add_value or 0

                    docs = list(grouped.values())
                    continue

                if "$count" in stage:
                    docs = [{stage["$count"]: len(docs)}]
                    continue

                raise ValueError(f"Unsupported aggregation stage: {stage}")
            return docs

        class _LazyAggCursor(SupabaseCursor):
            def __init__(self):
                super().__init__([])
                self._loaded = False

            async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
                if not self._loaded:
                    self._rows = await _execute()
                    self._loaded = True
                return await super().to_list(length)

        return _LazyAggCursor()


class SupabaseRestDocumentStore:
    def __init__(self, supabase_url: str, service_role_key: str, storage_bucket: str = "secure-pdfs"):
        self.supabase_url = supabase_url.rstrip("/")
        self.service_role_key = service_role_key
        self.storage_bucket = storage_bucket
        self._client: Optional[httpx.AsyncClient] = None
        self._collections: Dict[str, SupabaseRestCollection] = {}

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if extra:
            headers.update(extra)
        return headers

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        client = await self._ensure_client()
        headers = self._headers(kwargs.pop("headers", None))
        response = await client.request(method, f"{self.supabase_url}{path}", headers=headers, **kwargs)
        response.raise_for_status()
        return response

    def __getattr__(self, item: str) -> SupabaseRestCollection:
        if item.startswith("_"):
            raise AttributeError(item)
        coll = self._collections.get(item)
        if coll is None:
            coll = SupabaseRestCollection(self, item)
            self._collections[item] = coll
        return coll

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def put_file(self, storage_key: str, user_id: str, content: bytes, content_type: str = "application/pdf"):
        await self._request(
            "POST",
            f"/storage/v1/object/{self.storage_bucket}/{quote(storage_key, safe='/')}",
            headers={
                "x-upsert": "true",
                "Content-Type": content_type,
                "x-user-id": user_id,
            },
            content=content,
        )

    async def get_file(self, storage_key: str) -> Optional[Dict[str, Any]]:
        client = await self._ensure_client()
        response = await client.get(
            f"{self.supabase_url}/storage/v1/object/{self.storage_bucket}/{quote(storage_key, safe='/')}",
            headers=self._headers(),
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return {
            "storage_key": storage_key,
            "content_type": response.headers.get("content-type", "application/pdf"),
            "content": response.content,
        }

    async def delete_file(self, storage_key: str) -> bool:
        client = await self._ensure_client()
        response = await client.delete(
            f"{self.supabase_url}/storage/v1/object/{self.storage_bucket}/{quote(storage_key, safe='/')}",
            headers=self._headers(),
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True

    async def delete_files_by_user(self, user_id: str):
        client = await self._ensure_client()
        offset = 0
        while True:
            list_resp = await client.post(
                f"{self.supabase_url}/storage/v1/object/list/{self.storage_bucket}",
                headers=self._headers({"Content-Type": "application/json"}),
                json={
                    "prefix": f"{user_id}/",
                    "limit": 1000,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
            )
            list_resp.raise_for_status()
            items = list_resp.json() or []
            if not items:
                break
            for item in items:
                name = item.get("name")
                if name:
                    await self.delete_file(f"{user_id}/{name}")
            if len(items) < 1000:
                break
            offset += 1000


def create_document_store(
    database_url: Optional[str],
    supabase_url: Optional[str],
    service_role_key: Optional[str],
    storage_bucket: str = "secure-pdfs",
    force_rest: bool = False,
    auto_discover_pooler: bool = True,
    pooler_discovery_timeout: float = 2.0,
    pooler_regions: Optional[List[str]] = None,
):
    if force_rest:
        if not (supabase_url and service_role_key):
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for REST mode")
        return SupabaseRestDocumentStore(supabase_url, service_role_key, storage_bucket)

    if database_url:
        return SupabaseDocumentStore(
            database_url,
            supabase_url=supabase_url,
            auto_discover_pooler=auto_discover_pooler,
            pooler_discovery_timeout=pooler_discovery_timeout,
            pooler_regions=pooler_regions,
        )

    if supabase_url and service_role_key:
        return SupabaseRestDocumentStore(supabase_url, service_role_key, storage_bucket)

    raise RuntimeError("Either SUPABASE_DB_URL (DATABASE_URL) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required")
