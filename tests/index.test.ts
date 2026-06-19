// 期待値は tests/fixtures/sample.png (720x540px) を基準に算出している。
//   printW = 720 * 25.4/72 = 254mm, printH = 540 * 25.4/72 = 190.5mm
// これらは原実装(vfm-mdbp-vscode v0.3.6)を VS Code プラグインで実行した
// tests/fixtures/test.html の出力と一致することを確認済み。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import type * as hast from "hast";

import { libroSvgImg, type LibroSvgImgOptions } from "../src/index.ts";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// libroSvgImg は unified.Plugin。Plugin 型は this:Processor を要求し直接呼ぶと
// TS2684 になるため、素の関数型へキャストしてから設定を渡し transformer を得る。
type Transform = (tree: hast.Root, file: { dirname: string | null }) => void;
const createTransform = libroSvgImg as unknown as (options: LibroSvgImgOptions) => Transform;
const transform = createTransform({ fs });

/** img 1個だけの木をプラグインに通し、置換後のノードを返す。 */
function transformImg(properties: hast.Properties): hast.Element {
  const img: hast.Element = { type: "element", tagName: "img", properties, children: [] };
  const tree: hast.Root = { type: "root", children: [img] };
  transform(tree, { dirname: fixturesDir });
  return tree.children[0] as hast.Element;
}

const imageEl = (transformAttr: string): hast.Element => ({
  type: "element",
  tagName: "image",
  // hast では xlink:href は xLinkHref というプロパティキーで保持される。
  properties: { width: "254", height: "190.5", xLinkHref: "sample.png", transform: transformAttr },
  children: [],
});

const svgEl = (width: string, height: string, viewBox: string, transformAttr: string): hast.Element => ({
  type: "element",
  tagName: "svg",
  properties: { width, height, viewBox },
  children: [imageEl(transformAttr)],
});

const cases: ReadonlyArray<{ name: string; src: string; expected: hast.Element }> = [
  {
    name: "1. 倍率のみ（幅高さなりゆき・シフト0）",
    src: "sample.png?svgimg=40",
    expected: svgEl("101.6mm", "76.2mm", "0 0 101.6 76.2", "translate(0,0) scale(0.4)"),
  },
  {
    name: "2. 倍率のみ（30%）",
    src: "sample.png?svgimg=30",
    expected: svgEl("76.2mm", "57.15mm", "0 0 76.2 57.15", "translate(0,0) scale(0.3)"),
  },
  {
    name: "3. 倍率＋横幅（高さなりゆき）",
    src: "sample.png?svgimg=30,180",
    expected: svgEl("180mm", "57.15mm", "0 0 180 57.15", "translate(0,0) scale(0.3)"),
  },
  {
    name: "4. 倍率＋横幅＋高さ",
    src: "sample.png?svgimg=30,180,200",
    expected: svgEl("180mm", "200mm", "0 0 180 200", "translate(0,0) scale(0.3)"),
  },
  {
    name: "5. フル指定（README の例 30,180,200,-10,-10）",
    src: "sample.png?svgimg=30,180,200,-10,-10",
    expected: svgEl("180mm", "200mm", "0 0 180 200", "translate(-10,-10) scale(0.3)"),
  },
  {
    name: "6. 中間フィールド省略（幅高さ空・シフトのみ）",
    src: "sample.png?svgimg=50,,,5,5",
    expected: svgEl("127mm", "95.25mm", "0 0 127 95.25", "translate(5,5) scale(0.5)"),
  },
  {
    // 190.5*0.333 は IEEE-754 で 63.43649… のため round3 は 63.437 ではなく 63.436。
    // 原実装(test.html)も同値。
    name: "7. 小数倍率（浮動小数点の丸め）",
    src: "sample.png?svgimg=33.3",
    expected: svgEl("84.582mm", "63.436mm", "0 0 84.582 63.436", "translate(0,0) scale(0.333)"),
  },
];

describe("libroSvgImg: 正常系（svgimg を SVG に変換）", () => {
  for (const c of cases) {
    test(c.name, () => {
      assert.deepEqual(transformImg({ src: c.src }), c.expected);
    });
  }
});

describe("libroSvgImg: 対照群（変換対象外＝img のまま残る）", () => {
  // "?svgimg=" をリテラルで含まないものは非変換。
  for (const src of ["sample.png", "sample.png?foo=bar"]) {
    test(`src=${src}`, () => {
      const node = transformImg({ src });
      assert.equal(node.tagName, "img");
      assert.equal(node.properties?.src, src);
    });
  }
});

describe("libroSvgImg: 不正な svgimg 指定はエラー（原実装は NaN SVG）", () => {
  // 倍率が空・数値化できない値は throw。空の省略フィールド（なりゆき）は許容。
  for (const src of [
    "sample.png?svgimg=", // 倍率が空
    "sample.png?svgimg=,180", // 先頭カンマで倍率が空
    "sample.png?svgimg=abc", // 倍率が数値でない
    "sample.png?svgimg=40,xyz", // 幅が数値でない
  ]) {
    test(`src=${src}`, () => {
      assert.throws(() => transformImg({ src }), /invalid svgimg/);
    });
  }
});

describe("libroSvgImg: 移植版固有の挙動", () => {
  test("file.dirname が null なら throw する", () => {
    const tree: hast.Root = { type: "root", children: [] };
    assert.throws(() => transform(tree, { dirname: null }), /libroSvgImg/);
  });

  test("画像ファイルが存在しなければ throw する（原実装は警告して非変換）", () => {
    assert.throws(() => transformImg({ src: "does-not-exist.png?svgimg=40" }));
  });
});
