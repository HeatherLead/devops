const { createLogger, format, transports } = require("winston");
const LokiTransport = require("winston-loki");
const { combine, timestamp, colorize, printf, json } = format;

const consoleLogFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

const jsonLogFormat = combine(timestamp(), json());

const logger = createLogger({
  level: "info",
  transports: [
    new transports.Console({
      level: "info",
      format: consoleLogFormat,
    }),
    new LokiTransport({
      host: "http://localhost:3100",
      json: true,
      labels: { job: "my-application" },
    }),
  ],
});

logger.infoWithDetails = function (message, details) {
  this.info(`${message} | Details: ${JSON.stringify(details)}`);
};

logger.errorWithDetails = function (message, errorDetails) {
  this.error(`${message} | Error: ${JSON.stringify(errorDetails)}`);
};

module.exports = logger;
