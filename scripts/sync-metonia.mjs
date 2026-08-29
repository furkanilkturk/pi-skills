#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installPack } from "./install-pack.mjs";

function readTemplateArg(argv) {
	const index = argv.indexOf("--template");
	if (index < 0 || !argv[index + 1]) throw new Error("Usage: node scripts/sync-metonia.mjs --template /path/to/metonia/template");
	return path.resolve(argv[index + 1]);
}

export async function syncMetonia(templateRoot) {
	const mappings = [
		["learning", path.join(templateRoot, "Learning", ".agents", "skills")],
		["work", path.join(templateRoot, "Work", ".agents", "skills")],
		["video", path.join(templateRoot, "Studio", "Video", ".agents", "skills")],
	];
	const installed = [];
	for (const [pack, target] of mappings) installed.push(...(await installPack(pack, target)));
	return installed;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	try {
		const installed = await syncMetonia(readTemplateArg(process.argv.slice(2)));
		for (const destination of installed) console.log(`Synced ${destination}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
