#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalisePath(value) {
	return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function categoryFor(file) {
	const lower = file.toLowerCase();
	const base = path.posix.basename(lower);
	if (/(^|\/)(agents|claude)\.md$/.test(lower)) return "instructions";
	if (lower === "readme.md" || lower.startsWith("docs/") || /(^|\/)readme\.md$/.test(lower)) return "documentation";
	if (lower.startsWith(".github/") || lower.startsWith("deploy/") || lower.startsWith("docker/")) return "delivery-operations";
	if (lower.startsWith("drizzle/") || lower.includes("/migrations/") || /(^|\/)(schema|seed)[^/]*\.[^.]+$/.test(lower)) {
		return "database-migrations";
	}
	if (lower.startsWith("e2e/") || lower.includes("/tests/") || /\.(?:test|spec)\.[^.]+$/.test(lower)) return "tests-quality";
	if (lower.startsWith("src/routes/") || lower.startsWith("app/") || lower.startsWith("pages/")) return "routes-api";
	if (lower.startsWith("src/lib/server/") || lower.startsWith("server/") || lower.startsWith("backend/")) return "server-runtime";
	if (lower.startsWith("src/lib/client/") || lower.startsWith("client/") || lower.startsWith("frontend/")) return "client-ui";
	if (lower.startsWith("src/lib/shared/") || lower.startsWith("shared/") || lower.startsWith("packages/")) return "shared-contracts";
	if (lower.startsWith("messages/") || lower.includes("/locales/") || lower.includes("/i18n/")) return "localization";
	if (lower.startsWith("static/") || lower.startsWith("public/") || lower.startsWith("assets/")) return "assets";
	if (lower.startsWith("scripts/") || lower.startsWith("tools/")) return "automation";
	if (
		!file.includes("/") &&
		(base === "package.json" ||
			base.endsWith("config.js") ||
			base.endsWith("config.ts") ||
			base.endsWith("config.mjs") ||
			base.endsWith("config.cjs") ||
			/^(dockerfile|compose.*\.ya?ml|tsconfig.*\.json|.*\.config\.[^.]+)$/.test(base))
	) {
		return "build-configuration";
	}
	return "other";
}

function directoryAncestors(file) {
	const directory = path.posix.dirname(file);
	if (directory === ".") return ["<root>"];
	const parts = directory.split("/");
	return ["<root>", ...parts.map((_part, index) => parts.slice(0, index + 1).join("/"))];
}

function parseTrackedFiles(raw) {
	return raw
		.split("\0")
		.filter(Boolean)
		.map((record) => {
			const match = record.match(/^(\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/);
			if (!match) throw new Error(`Unexpected git ls-files record: ${record}`);
			return {
				mode: match[1],
				oid: match[2],
				stage: Number(match[3]),
				path: normalisePath(match[4]),
			};
		});
}

async function git(repo, args, allowFailure = false) {
	try {
		return (
			await execFileAsync("git", ["-C", repo, ...args], {
				encoding: "utf8",
				maxBuffer: 32 * 1024 * 1024,
			})
		).stdout;
	} catch (error) {
		if (allowFailure) return "";
		throw error;
	}
}

export async function buildRepositoryInventory(repositoryPath) {
	const requested = path.resolve(repositoryPath);
	const root = (await git(requested, ["rev-parse", "--show-toplevel"])).trim();
	const head = (await git(root, ["rev-parse", "HEAD"])).trim();
	const headTree = (await git(root, ["rev-parse", "HEAD^{tree}"])).trim();
	const tracked = parseTrackedFiles(await git(root, ["ls-files", "-s", "-z"]));
	const statusLines = (await git(root, ["status", "--porcelain=v1", "--untracked-files=all"]))
		.split(/\r?\n/)
		.filter(Boolean);
	const remoteLines = (await git(root, ["config", "--get-regexp", "^remote\\..*\\.url$"], true))
		.split(/\r?\n/)
		.filter(Boolean);
	const remotes = remoteLines.map((line) => {
		const [name, ...value] = line.trim().split(/\s+/);
		return { name: name.replace(/^remote\.|\.url$/g, ""), url: value.join(" ") };
	});

	const inventoryHash = createHash("sha256");
	const categories = new Map();
	const directories = new Map();
	const extensions = new Map();
	const files = [];

	for (const entry of tracked.sort((left, right) => left.path.localeCompare(right.path))) {
		inventoryHash.update(`${entry.mode}\0${entry.oid}\0${entry.path}\n`);
		let size = null;
		try {
			size = (await fs.lstat(path.join(root, ...entry.path.split("/")))).size;
		} catch {
			// Sparse or missing working-tree entries remain represented by Git metadata.
		}
		const category = categoryFor(entry.path);
		const extension = path.posix.extname(entry.path).toLowerCase() || "<none>";
		files.push({ ...entry, size, category, extension });
		if (!categories.has(category)) categories.set(category, []);
		categories.get(category).push(entry.path);
		extensions.set(extension, (extensions.get(extension) ?? 0) + 1);

		const ancestors = directoryAncestors(entry.path);
		for (const directory of ancestors) {
			const record = directories.get(directory) ?? { path: directory, directFiles: 0, totalFiles: 0, extensions: new Map() };
			record.totalFiles += 1;
			record.extensions.set(extension, (record.extensions.get(extension) ?? 0) + 1);
			directories.set(directory, record);
		}
		const parent = ancestors.at(-1);
		directories.get(parent).directFiles += 1;
	}

	const guidanceFiles = tracked
		.map((entry) => entry.path)
		.filter((file) => /(^|\/)(AGENTS|CLAUDE|README)\.md$/i.test(file));
	const manifestsAndConfigs = tracked
		.map((entry) => entry.path)
		.filter((file) =>
			/(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|composer\.json|Dockerfile|compose.*\.ya?ml|tsconfig.*\.json|.*\.config\.[^.]+)$/i.test(file),
		);

	return {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		repository: {
			root,
			head,
			headTree,
			remotes,
			clean: statusLines.length === 0,
			dirtyEntries: statusLines,
		},
		coverage: {
			trackedFiles: tracked.length,
			trackedDirectories: Math.max(0, directories.size - 1),
			inventoryHash: inventoryHash.digest("hex"),
			categories: [...categories.entries()]
				.map(([name, categoryFiles]) => ({ name, count: categoryFiles.length }))
				.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
			extensions: [...extensions.entries()]
				.map(([name, count]) => ({ name, count }))
				.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
		},
		guidanceFiles,
		manifestsAndConfigs,
		directories: [...directories.values()]
			.map((record) => ({
				path: record.path,
				directFiles: record.directFiles,
				totalFiles: record.totalFiles,
				extensions: [...record.extensions.entries()]
					.map(([name, count]) => ({ name, count }))
					.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
			}))
			.sort((left, right) => left.path.localeCompare(right.path)),
		categories: [...categories.entries()]
			.map(([name, categoryFiles]) => ({ name, files: categoryFiles }))
			.sort((left, right) => left.name.localeCompare(right.name)),
		files,
	};
}

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (!key.startsWith("--") || !argv[index + 1]) throw new Error(`Expected --name value, got: ${key}`);
		args[key.slice(2)] = argv[++index];
	}
	return args;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	try {
		const args = parseArgs(process.argv.slice(2));
		if (!args.repo) throw new Error("Usage: repository-inventory.mjs --repo /path/to/repo [--output /tmp/inventory.json]");
		const inventory = await buildRepositoryInventory(args.repo);
		const json = `${JSON.stringify(inventory, null, 2)}\n`;
		if (args.output) {
			await fs.writeFile(path.resolve(args.output), json, { encoding: "utf8", flag: "wx" });
			console.log(
				JSON.stringify({
					output: path.resolve(args.output),
					head: inventory.repository.head,
					clean: inventory.repository.clean,
					trackedFiles: inventory.coverage.trackedFiles,
					trackedDirectories: inventory.coverage.trackedDirectories,
					inventoryHash: inventory.coverage.inventoryHash,
				}),
			);
		} else {
			process.stdout.write(json);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
