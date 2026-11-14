import asyncio
import os
import sys

# psycopg async cannot run on Windows' default ProactorEventLoop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Silence the "set up Logfire" banner when tracing is not configured (OTel/Logfire are opt-in).
os.environ.setdefault("LOGFIRE_IGNORE_NO_CONFIG", "1")
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")
