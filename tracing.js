const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const { ZipkinExporter } = require("@opentelemetry/exporter-zipkin");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");

const zipkinExporter = new ZipkinExporter({
  serviceName: "my-express-service",
  endpoint: "http://localhost:9411/api/v2/spans",
});

const sdk = new NodeSDK({
  traceExporter: zipkinExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: new PrometheusExporter({ port: 9464 }),
    exportIntervalMillis: 1000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
