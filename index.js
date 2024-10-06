const express = require("express");
const responseTime = require("response-time");
const promClient = require("prom-client");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const { ZipkinExporter } = require("@opentelemetry/exporter-zipkin");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { createLogger } = require("winston");
const LokiTransport = require("winston-loki");

const app = express();

const logger = createLogger({
  level: "error",
  transports: [
    new LokiTransport({
      host: "http://127.0.0.1:3100",
      labels: { service: "my-express-service", environment: "production" },
      level: "error",
    }),
  ],
});

promClient.collectDefaultMetrics({ register: promClient.register });

const reqResTime = new promClient.Histogram({
  name: "http_express_req_res_time",
  help: "Time taken for request and response",
  labelNames: ["method", "route", "status_code"],
  buckets: [1, 50, 100, 200, 400, 500, 800, 1000, 2000],
});

const totalReqCounter = new promClient.Counter({
  name: "total_request",
  help: "Total number of requests made",
});

const sdk = new NodeSDK({
  traceExporter: new ZipkinExporter({
    serviceName: "my-express-service",
    endpoint: "http://localhost:9411/api/v2/spans",
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new PrometheusExporter({ port: 9464 }),
    exportIntervalMillis: 1000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

app.use(async (req, res, next) => {
  if (req.url === "/metrics") return next();

  const tracer = require("@opentelemetry/api").trace.getTracer("default");
  const span = tracer.startSpan(`Processing ${req.method} ${req.url}`);

  res.on("finish", () => {
    span.setAttributes({
      route: req.url,
      method: req.method,
      status_code: res.statusCode,
    });
    span.end();
    const responseTime = parseFloat(res.get("X-Response-Time")) || 0;
    totalReqCounter.inc();
    reqResTime
      .labels(req.method, req.url, res.statusCode)
      .observe(responseTime);
  });
  next();
});

app.get("/slow", async (req, res, next) => {
  try {
    const timeTaken = await doHeavyTask();
    res.json({
      status: "Success",
      message: `Heavy task completed in ${timeTaken}ms`,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  logger.error(
    `Error ${statusCode}: ${req.method} ${req.url} - ${err.message}`,
    {
      route: req.url,
      method: req.method,
      status_code: statusCode,
      error_message: err.message,
    }
  );
  res.status(statusCode).json({
    status: "Error",
    error: err.message,
  });
});

app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

async function doHeavyTask() {
  const delay = getRandomValue([
    100, 150, 200, 300, 600, 500, 1000, 1400, 2500,
  ]);
  const shouldThrowError = getRandomValue([1, 2, 3, 4, 5, 6, 7, 8]) === 8;

  if (shouldThrowError) {
    throw new Error(
      getRandomValue([
        "DB Payment Failure",
        "DB Server is Down",
        "Access Denied",
        "Not Found Error",
      ])
    );
  }

  return new Promise((resolve) => setTimeout(() => resolve(delay), delay));
}

function getRandomValue(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  logger.error(
    `Error ${statusCode}: ${req.method} ${req.url} - ${err.message}`
  );
  res.status(statusCode).json({
    status: "Error",
    error: err.message,
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
