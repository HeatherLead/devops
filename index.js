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
const { trace } = require("@opentelemetry/api");
const logger = require("./logger");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 8000;

// Prometheus setup
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

// OpenTelemetry setup
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

app.use((req, res, next) => {
  if (req.originalUrl === "/metrics") {
    return next();
  }
  const start = Date.now();

  res.on("finish", () => {
    const responseTime = Date.now() - start;

    const logObject = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: responseTime,
    };

    const statusCode = res.statusCode;

    if (statusCode >= 200 && statusCode < 300) {
      logger.infoWithDetails("Request processed", logObject);
    } else {
      const extendedLogObject = {
        ...logObject,
        errorMessage: res.locals?.errorMessage || "No error message provided",
      };
      logger.errorWithDetails("Request failed", extendedLogObject);
    }
  });

  next();
});

// Metrics middleware for collecting request/response time
app.use((req, res, next) => {
  if (req.url === "/metrics") return next();

  const tracer = trace.getTracer("default");
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

// Routes
app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

app.get("/slow", async (req, res, next) => {
  try {
    const timeTaken = await doHeavyTask();
    res.json({
      status: "Success",
      message: `Heavy task completed in ${timeTaken}ms`,
    });
  } catch (error) {}
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

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

app.get("/error", async (req, res, next) => {
  try {
    const errorMessage = getRandomErrorMessage();
    throw new Error(errorMessage);
  } catch (error) {
    res.locals.errorMessage = error.message;
    res.status(500).json({
      status: "Error",
      message: error.message,
    });
  }
});

function getRandomErrorMessage() {
  const errors = [
    "DB Payment Failure",
    "DB Server is Down",
    "Access Denied",
    "Not Found Error",
    "Internal Server Error",
    "Unauthorized Access",
  ];

  return errors[Math.floor(Math.random() * errors.length)];
}
