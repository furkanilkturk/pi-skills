#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKS } from "./install-pack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GLOBAL_SKILLS = ["metonia-interview", "metonia-context"];
const expected = [
	...Object.entries(PACKS).flatMap(([pack, names]) => names.map((name) => ({ pack, name }))),
	...GLOBAL_SKILLS.map((name) => ({ pack: "global", name })),
];
const seen = [];

for (const { pack, name } of expected) {
	const skillPath = path.join(root, "skills", pack, name, "SKILL.md");
	const text = await fs.readFile(skillPath, "utf8");
	const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatter) throw new Error(`Missing YAML frontmatter: ${skillPath}`);
	if (!new RegExp(`^name:\\s*${name}\\s*$`, "m").test(frontmatter[1])) throw new Error(`Wrong skill name: ${skillPath}`);
	const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
	if (!description || description.length < 30) throw new Error(`Description is missing or too broad: ${skillPath}`);
	if (/\b(TODO|TBD|placeholder)\b/i.test(text)) throw new Error(`Unfinished scaffold marker: ${skillPath}`);
	seen.push(path.normalize(skillPath));
}

async function walk(directory) {
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) await walk(full);
		else if (entry.name === "SKILL.md" && !seen.includes(path.normalize(full))) throw new Error(`Unregistered skill: ${full}`);
	}
}
await walk(path.join(root, "skills"));

const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const expectedGlobalPaths = GLOBAL_SKILLS.map((name) => `./skills/global/${name}`);
if (!Array.isArray(manifest.pi?.skills) || JSON.stringify(manifest.pi.skills) !== JSON.stringify(expectedGlobalPaths)) {
	throw new Error(`package.json may autoload only the lightweight global skills: ${expectedGlobalPaths.join(", ")}`);
}

console.log(`Validated ${seen.length} skills; only ${GLOBAL_SKILLS.length} lightweight routing skills are package-autoloaded.`);
