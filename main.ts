import { filter, map, pipe, reverse, sort } from "npm:remeda@2.14.0";
import * as semver from "jsr:@std/semver@1.0.3";
import * as path from "jsr:@std/path@1.0.3";

type McrDockerTagsResponse = {
  name: string;
  tags: string[];
};

const config = {
  GITHUB_OUTPUT: Deno.env.get("GITHUB_OUTPUT"),
  IMAGE_NAME: Deno.env.get("IMAGE_NAME"),
};

if (!config.GITHUB_OUTPUT || !config.IMAGE_NAME) {
  throw new Error("GITHUB_OUTPUT and IMAGE_NAME are not set");
}

const GITHUB_OUTPUT = config.GITHUB_OUTPUT;
const IMAGE_NAME = config.IMAGE_NAME;

function generateMcrUrl(imageName: string) {
  return `https://mcr.microsoft.com/v2/${imageName}/tags/list`;
}

async function fetchMcr(
  fetch: typeof globalThis.fetch,
  req: Request,
): Promise<McrDockerTagsResponse> {
  const responseSource = await fetch(req);

  if (!responseSource.ok || responseSource.status !== 200) {
    throw new Error("Failed to fetch tags from MCR");
  }

  // TODO validate
  return await responseSource.json();
}

function isArchitectureAmd64(tag: string): boolean {
  return tag.includes("amd64");
}

function isArchitectureArm64(tag: string): boolean {
  return tag.includes("arm64");
}

function addArm64TagSuffix(tag: string): string {
  return `${tag}-arm64`;
}

function addAmd64TagSuffix(tag: string): string {
  return `${tag}-amd64`;
}

function isBasicTag(tag: string): boolean {
  return !tag.includes("-alpha") && !tag.includes("-beta") &&
    !tag.includes("-next");
}

function isArchitectureMulti(
  amd64: Set<string>,
  arm64: Set<string>,
  tag: string,
): boolean {
  return !isArchitectureAmd64(tag) && !isArchitectureArm64(tag) &&
    amd64.has(addAmd64TagSuffix(tag)) && arm64.has(addArm64TagSuffix(tag));
}

const preResultPath = path.join(import.meta.dirname ?? ".", "pre-result.json");

async function main() {
  const buildTargetResponse = await fetchMcr(
    fetch,
    new Request(generateMcrUrl(IMAGE_NAME)),
  );

  const targetBasicTagList = pipe(
    buildTargetResponse.tags,
    filter((tag) => tag.startsWith("v")), // vから始まるタグのみ
    filter(isBasicTag), // 基本的なタグのみ
    filter(semver.canParse), // semverとしてパース可能なもののみ
    map((v) => [v, semver.parse(v)] as const), // 元の文字列とsemverのタプルに変換
    sort(([_v1, s1], [_v2, s2]) => semver.compare(s1, s2)), // ソート
    reverse(), // 降順にする
    map(([v]) => v), // タプルの文字列を取り出す
  );

  let preResult: {
    arm64: string[];
    amd64: string[];
    multi: string[];
  };

  try {
    preResult = JSON.parse(
      Deno.readTextFileSync(preResultPath),
    );
  } catch (e) {
    preResult = {
      arm64: [],
      amd64: [],
      multi: [],
    };
  }

  const preResultSet = {
    arm64: new Set(preResult.arm64),
    amd64: new Set(preResult.amd64),
    multi: new Set(preResult.multi),
  };

  const targetArm64 = pipe(
    targetBasicTagList,
    filter(isArchitectureArm64),
    filter((v) => !preResultSet.arm64.has(v)),
  );
  const targetArm64Set = new Set(targetArm64);
  console.log("targetArm64", targetArm64.length, targetArm64);

  const targetAmd64 = pipe(
    targetBasicTagList,
    filter(isArchitectureAmd64),
    filter((v) => !preResultSet.amd64.has(v)),
  );
  const targetAmd64Set = new Set(targetAmd64);
  console.log("targetAmd64", targetAmd64.length, targetAmd64);

  const targetMulti = pipe(
    targetBasicTagList,
    filter((v) => isArchitectureMulti(targetAmd64Set, targetArm64Set, v)),
    filter((v) => !preResultSet.multi.has(v)),
  );
  console.log("targetMulti", targetMulti.length, targetMulti);

  // 末尾改行
  const output = `
arm64=${JSON.stringify(targetArm64)}
amd64=${JSON.stringify(targetAmd64)}
multi=${JSON.stringify(targetMulti)}
`.trimStart();

  console.log(output);

  Deno.writeTextFileSync(
    preResultPath,
    JSON.stringify(
      {
        arm64: [...preResult.arm64, ...targetArm64],
        amd64: [...preResult.amd64, ...targetAmd64],
        multi: [...preResult.multi, ...targetMulti],
      },
      null,
      2,
    ),
  );

  Deno.writeTextFileSync(
    GITHUB_OUTPUT,
    output,
    { append: true },
  );
}

if (import.meta.main) {
  await main();
}
