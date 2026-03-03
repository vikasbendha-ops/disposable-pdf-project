import argparse
import asyncio
import os
from pathlib import Path
from typing import Dict

from dotenv import load_dotenv
from pymongo import MongoClient

try:
    from supabase_store import create_document_store
except ImportError:  # pragma: no cover
    from backend.supabase_store import create_document_store


def _load_env():
    root = Path(__file__).parent
    load_dotenv(root / ".env")


def _env_or_default(name: str, default: str) -> str:
    return os.environ.get(name) or default


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


async def _copy_collection(store, collection_name: str, source_docs):
    dest_collection = getattr(store, collection_name)
    copied = 0
    for src in source_docs:
        doc = dict(src)
        doc.pop("_id", None)
        await dest_collection.insert_one(doc)
        copied += 1
    return copied


async def _migrate_pdfs(store, source_docs):
    dest_collection = store.pdfs
    copied = 0
    file_copied = 0
    file_missing = 0

    for src in source_docs:
        doc = dict(src)
        doc.pop("_id", None)

        existing_path = doc.get("file_path")
        user_id = doc.get("user_id") or "unknown"
        if doc.get("storage_key"):
            storage_key = doc["storage_key"]
        else:
            file_name = Path(existing_path).name if existing_path else f"{doc.get('pdf_id', 'file')}.pdf"
            storage_key = f"{user_id}/{file_name}"
            doc["storage_key"] = storage_key

        if existing_path:
            file_path = Path(existing_path)
            if file_path.exists():
                content = file_path.read_bytes()
                await store.put_file(storage_key, user_id, content, "application/pdf")
                file_copied += 1
            else:
                file_missing += 1
        else:
            file_missing += 1

        await dest_collection.insert_one(doc)
        copied += 1

    return copied, file_copied, file_missing


async def run(reset: bool):
    _load_env()

    mongo_url = _env_or_default("MONGO_URL", "mongodb://localhost:27017")
    mongo_db_name = _env_or_default("DB_NAME", "autodestroy")
    supabase_db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    storage_bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "secure-pdfs")
    force_rest = _env_flag("SUPABASE_FORCE_REST", False)
    auto_pooler = _env_flag("SUPABASE_AUTO_DISCOVER_POOLER", True)
    pooler_timeout = _env_float("SUPABASE_POOLER_DISCOVERY_TIMEOUT", 2.0)
    pooler_regions_raw = os.environ.get("SUPABASE_POOLER_REGIONS", "")
    pooler_regions = [region.strip() for region in pooler_regions_raw.split(",") if region.strip()] or None

    source = MongoClient(mongo_url)[mongo_db_name]
    store = create_document_store(
        database_url=supabase_db_url,
        supabase_url=supabase_url,
        service_role_key=service_role_key,
        storage_bucket=storage_bucket,
        force_rest=force_rest,
        auto_discover_pooler=auto_pooler,
        pooler_discovery_timeout=pooler_timeout,
        pooler_regions=pooler_regions,
    )
    if not force_rest and hasattr(store, "get_pool"):
        pool = await store.get_pool()
    else:
        pool = None

    if reset and pool is not None:
        await pool.execute("TRUNCATE TABLE app_documents RESTART IDENTITY CASCADE")
        await pool.execute("TRUNCATE TABLE app_files RESTART IDENTITY CASCADE")
    elif reset:
        await store.users.delete_many({})
        await store.user_sessions.delete_many({})
        await store.password_resets.delete_many({})
        await store.folders.delete_many({})
        await store.pdfs.delete_many({})
        await store.links.delete_many({})
        await store.payment_transactions.delete_many({})
        await store.platform_settings.delete_many({})
        await store.domains.delete_many({})

    collections = [
        "users",
        "user_sessions",
        "password_resets",
        "folders",
        "pdfs",
        "links",
        "payment_transactions",
        "platform_settings",
        "domains",
    ]

    results: Dict[str, int] = {}
    for name in collections:
        if name not in source.list_collection_names():
            results[name] = 0
            continue

        docs = list(source[name].find({}))
        if name == "pdfs":
            copied, file_copied, file_missing = await _migrate_pdfs(store, docs)
            results[name] = copied
            print(f"[pdfs] docs={copied} files_copied={file_copied} files_missing={file_missing}")
        else:
            copied = await _copy_collection(store, name, docs)
            results[name] = copied
            print(f"[{name}] docs={copied}")

    print("\nMigration complete.")
    print("Summary:")
    for name in collections:
        print(f"- {name}: {results.get(name, 0)}")

    await store.close()


def main():
    parser = argparse.ArgumentParser(description="Migrate MongoDB data and local PDFs to Supabase Postgres store")
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="Do not truncate destination tables before migration",
    )
    args = parser.parse_args()
    asyncio.run(run(reset=not args.no_reset))


if __name__ == "__main__":
    main()
