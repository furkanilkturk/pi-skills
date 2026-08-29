#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PACKS = Object.freeze({
	learning: ["doc-learning", "video-learning"],
	work: ["project-planning"],
	video: ["video-research", "video-concept", "video-review"],
});

const RETIRED_PACK_SKILLS = Object.freeze({
	work: ["project-learning"],
});

function parseArgs(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (!key.startsWith("--") || index + 1 >= argv.length) throw new Error(`Expected --name value, got: ${key}`);
		result[key.slice(2)] = argv[++index];
	}
	return result;
}

export async function installPack(pack, target) {
	const names = PACKS[pack];
	if (!names) throw new Error(`Unknown pack "${pack}". Choose: ${Object.keys(PACKS).join(", ")}`);
	if (!target) throw new Error("A target .agents/skills directory is required.");

	const targetRoot = path.resolve(target);
	if (path.basename(targetRoot).toLowerCase() !== "skills" || path.basename(path.dirname(targetRoot)).toLowerCase() !== ".agents") {
		throw new Error(`Scoped skill target must end in .agents${path.sep}skills: ${targetRoot}`);
	}
	try {
		const metadata = await fs.lstat(targetRoot);
		if (metadata.isSymbolicLink()) throw new Error(`Scoped skill target must not be a symlink or junction: ${targetRoot}`);
	} catch (error) {
		if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
	}
	await fs.mkdir(targetRoot, { recursive: true });
	for (const name of RETIRED_PACK_SKILLS[pack] ?? []) {
		await fs.rm(path.join(targetRoot, name), { recursive: true, force: true });
	}
	const installed = [];
	for (const name of names) {
		const source = path.join(repoRoot, "skills", pack, name);
		const destination = path.join(targetRoot, name);
		await fs.access(path.join(source, "SKILL.md"));
		await fs.rm(destination, { recursive: true, force: true });
		await fs.cp(source, destination, { recursive: true, force: true });
		installed.push(destination);
	}
	return installed;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	try {
		const args = parseArgs(process.argv.slice(2));
		const installed = await installPack(args.pack, args.target);
		for (const destination of installed) console.log(`Installed ${path.basename(destination)} -> ${destination}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
