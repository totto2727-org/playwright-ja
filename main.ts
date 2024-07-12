import { filter, map, pipe, tap } from "npm:remeda";
import { canParse, greaterThan, parse } from "jsr:@std/semver";

type McrDockerTagsResponse = {
    name: string;
    tags: string[];
};

type GhcrDockerTagsResponse = { name: string }[];

const config = {
    GITHUB_TOKEN: Deno.env.get("GITHUB_TOKEN"),
    GITHUB_OUTPUT: Deno.env.get("GITHUB_OUTPUT"),
    ARCHITECTURE: Deno.env.get("ARCHITECTURE"),
    org: "totto2727-org",
    packageType: "container",
    packageName: "playwright-ja",
};

if (!config.GITHUB_TOKEN || !config.GITHUB_OUTPUT || !config.ARCHITECTURE) {
    throw new Error("GITHUB_TOKEN, GITHUB_OUTPUT, and ARCHITECTURE are not set");
}

const GITHUB_TOKEN = config.GITHUB_TOKEN;
const GITHUB_OUTPUT = config.GITHUB_OUTPUT;
const ARCHITECTURE = config.ARCHITECTURE;


async function main() {

    const responseSource = await fetch(
        "https://mcr.microsoft.com/v2/playwright/tags/list",
    );
    if (!responseSource.ok || responseSource.status !== 200) {
        throw new Error("Failed to fetch tags from MCR");
    }
    const jsonSource: McrDockerTagsResponse = await responseSource.json();
    const filteredVersion = pipe(
        jsonSource.tags,
        filter((v) => v.startsWith("v")),
        filter((v) => canParse(v) && greaterThan(parse(v), parse("1.40.0"))),
        filter((v) => !v.includes("-alpha") && !v.includes("-beta")),
        filter((v) => v.includes(ARCHITECTURE)),
    );

    const responseTarget = await fetch(
        `https://api.github.com/orgs/${config.org}/packages/${config.packageType}/${config.packageName}/versions`,
        {
            method: "GET",
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        },
    );
    if (!responseSource.ok || responseSource.status !== 200) {
        throw new Error("Failed to fetch tags from GHCR");
    }
    const jsonTarget: GhcrDockerTagsResponse = await responseTarget.json();
    const setTarget = new Set(jsonTarget.map((v) => v.name));

    const requiredBuildTagList = { tag: filteredVersion.filter((v) => !setTarget.has(v)) };

    Deno.writeTextFileSync(
        GITHUB_OUTPUT,
        `matrix=${JSON.stringify(requiredBuildTagList)}\n`,
        { append: true },
    );
}

if (import.meta.main) {
    await main();
}
