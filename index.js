const express = require("express");
const responseTime = require("response-time");
const client = require("prom-client");
const app = express();
const PORT = process.env.PORT || 8000;

const { createLogger, transports } = require("winston");
const LokiTransport = require("winston-loki");
const options = {
  transports: [
    new LokiTransport({
      host: "http://127.0.0.1:3100",
    }),
  ],
};
const logger = createLogger(options);

const collectDefaultMetrix = client.collectDefaultMetrics;
collectDefaultMetrix({ register: client.register });

const reqResTime = new client.Histogram({
  name: "http_express_req_res_time",
  help: "this tells how much time is taken by request and response",
  labelNames: ["method", "route", "status_code"],
  buckets: [1, 50, 100, 200, 400, 500, 800, 1000, 2000],
});

const totalReqCounter = new client.Counter({
  name: "total_request",
  help: "total number of requests made",
});

app.use(
  responseTime((req, res, time) => {
    totalReqCounter.inc();
    reqResTime
      .labels({
        method: req.method,
        route: req.url,
        status_code: res.statusCode,
      })
      .observe(time);
  })
);

app.get("/", (req, res) => {
  logger.info("request on / route");
  res.send("Welcome to the Home Page!");
});

app.get("/slow", async (req, res) => {
  try {
    logger.info("request on /slow route");
    const timeTaken = await doSomeHeavyTask();
    return res.json({
      status: "Success",
      message: `Heavy task completed in ${timeTaken}ms`,
    });
  } catch (error) {
    logger.error(error.message);
    return res
      .status(500)
      .json({ status: "Error", error: "Internal Server Error" });
  }
});

app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", client.register.contentType);
  const metrics = await client.register.metrics();
  res.send(metrics);
});

function doSomeHeavyTask() {
  const ms = getRandomValue([100, 150, 200, 300, 600, 500, 1000, 1400, 2500]);
  const shouldThrowError = getRandomValue([1, 2, 3, 4, 5, 6, 7, 8]) === 8;

  if (shouldThrowError) {
    const randomError = getRandomValue([
      "DB Payment Failure",
      "DB Server is Down",
      "Access Denied",
      "Not Found Error",
    ]);
    throw new Error(randomError);
  }

  return new Promise((resolve) => {
    setTimeout(() => resolve(ms), ms);
  });
}

function getRandomValue(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
