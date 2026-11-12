from pydantic_ai import Agent

from app.core.config import Settings


def setup_telemetry(settings: Settings) -> bool:
    """Enable Pydantic AI OpenTelemetry instrumentation only when tracing env is set.

    Langfuse Cloud / any OTLP backend: set OTEL_EXPORTER_OTLP_ENDPOINT (+ headers env).
    Logfire: set LOGFIRE_TOKEN (requires the optional `logfire` package).
    """
    if settings.logfire_token:
        import logfire

        logfire.configure(token=settings.logfire_token)
    elif settings.otel_exporter_otlp_endpoint:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
    else:
        return False
    Agent.instrument_all()
    return True
