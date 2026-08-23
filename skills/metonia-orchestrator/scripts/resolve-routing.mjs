#!/usr/bin/env node

import { CAPABILITIES, resolveRoute } from "../../../extensions/metonia-delegate/routing.mjs";

function fail(message) {
  process.stderr.write(`routing error: ${message}\n`);
  process.exit(1);
}
function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    fail(`${name} requires a value`);
  }
  return args[index + 1];
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  process.stdout.write(
    "Usage: resolve-routing.mjs <capability> [--profile name] [--config path] [--compact]\n" +
      `Capabilities: ${CAPABILITIES.join(", ")}\n`,
  );
  process.exit(args.length === 0 ? 1 : 0);
}

const capability = args.find((value) => !value.startsWith("--") && ![option(args, "--profile"), option(args, "--config")].includes(value));
if (!CAPABILITIES.includes(capability)) {
  fail(`unknown capability '${capability ?? ""}'`);
}

try {
  const output = resolveRoute(capability, {
    configPath: option(args, "--config"),
    profile: option(args, "--profile"),
  });
  process.stdout.write(`${JSON.stringify(output, null, args.includes("--compact") ? 0 : 2)}\n`);
} catch (error) {
  fail(error.message);
}
