import { filter, last, map, pipe, reverse, sort, splitAt } from "npm:remeda";
import * as semver from "jsr:@std/semver";

type McrDockerTagsResponse = {
  name: string;
  tags: string[];
};

const config = {
  GITHUB_OUTPUT: Deno.env.get("GITHUB_OUTPUT"),
  LIMIT: Number.parseInt(Deno.env.get("LIMIT") ?? "") || 10,
  IMAGE_NAME: Deno.env.get("IMAGE_NAME"),
};

if (!config.GITHUB_OUTPUT || !config.IMAGE_NAME) {
  throw new Error("GITHUB_OUTPUT and IMAGE_NAME are not set");
}

const GITHUB_OUTPUT = config.GITHUB_OUTPUT;
const IMAGE_NAME = config.IMAGE_NAME;
const LIMIT = config.LIMIT;

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

async function main() {
  const buildTargetResponse = await fetchMcr(
    fetch,
    new Request(generateMcrUrl(IMAGE_NAME)),
  );

  const minSemver = pipe(
    buildTargetResponse.tags,
    filter(semver.canParse), // semverとしてパース可能なもののみ
    map(semver.parse), // 元の文字列とsemverのタプルに変換
    map((s) => `${s.major}.${s.minor}.${s.patch}`), // プリミティブなバージョンのみの文字列に変換
    (v) => Array.from(new Set(v)), // 重複を削除
    map(semver.parse), // 元の文字列とsemverのタプルに変換
    sort((s1, s2) => semver.compare(s1, s2)), // ソート
    reverse(), // 降順にする
    (v) => last(splitAt(v, LIMIT)[0]), // 最初のLIMIT個までの最後の要素を取り出す
  );

  if (!minSemver) {
    throw new Error("No valid semver found");
  }

  console.log("minSemver", minSemver);

  const targetBasicTagList = pipe(
    buildTargetResponse.tags,
    filter((tag) => tag.startsWith("v")), // vから始まるタグのみ
    filter(isBasicTag), // 基本的なタグのみ
    filter(semver.canParse), // semverとしてパース可能なもののみ
    map((v) => [v, semver.parse(v)] as const), // 元の文字列とsemverのタプルに変換
    filter(([_v, s]) => semver.greaterOrEqual(s, minSemver)), // 最低バージョン以上
    sort(([_v1, s1], [_v2, s2]) => semver.compare(s1, s2)), // ソート
    reverse(), // 降順にする
    map(([v]) => v), // タプルの文字列を取り出す
  );

  const targetArm64 = pipe(
    targetBasicTagList,
    filter(isArchitectureArm64),
  );
  const targetArm64Set = new Set(targetArm64);
  console.log("targetArm64", targetArm64.length, targetArm64);

  const targetAmd64 = pipe(
    targetBasicTagList,
    filter(isArchitectureAmd64),
  );
  const targetAmd64Set = new Set(targetAmd64);
  console.log("targetAmd64", targetAmd64.length, targetAmd64);

  const targetMulti = pipe(
    targetBasicTagList,
    filter((v) => isArchitectureMulti(targetAmd64Set, targetArm64Set, v)),
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
    GITHUB_OUTPUT,
    output,
    { append: true },
  );
}

if (import.meta.main) {
  await main();
}
