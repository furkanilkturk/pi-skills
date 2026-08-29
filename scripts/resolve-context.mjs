#!/usr/bin/env node
import path from "node:path";
import { formatContextData, resolveMetoniaContext } from "../src/context-resolver.ts";

function parse(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (!key.startsWith("--") || !argv[index + 1]) throw new Error(`Expected --name value, got: ${key}`);
		values[key.slice(2)] = argv[++index];
	}
	return values;
}

try {
	const args = parse(process.argv.slice(2));
	const vault = args.vault ?? process.env.METONIA_VAULT;
	if (!vault) throw new Error("Pass --vault or set METONIA_VAULT.");
	const context = await resolveMetoniaContext({
		vaultPath: path.resolve(vault),
		cwd: path.resolve(args.cwd ?? process.cwd()),
	});
	console.log(formatContextData(context));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	if (error && typeof error === "object" && "candidates" in error && Array.isArray(error.candidates)) {
		for (const candidate of error.candidates) console.error(`- ${candidate}`);
	}
	process.exitCode = 1;
}
