// E2E: 原実装(vfm-mdbp-vscode)同様、実際の VFM パイプラインに本プラグインを
// rehype プラグインとして組み込み、Markdown → HTML を通しで検証する。
//   npm test  （= node --test "tests/**/*.ts"）
//
// VFM 2.7 は unified@9 / vfile@4 上で動くため、vfile のコンテンツキーは `contents`
// （`value` ではない）。path 付きで渡すと file.dirname が解決され、画像を読める。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { VFM, type StringifyMarkdownOptions } from "@vivliostyle/vfm";

import { libroSvgImg } from "../src/index.ts";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** partial モードの VFM に本プラグインを差し込み、Markdown を HTML 文字列へ変換する。 */
async function render(md: string, options: StringifyMarkdownOptions = {}): Promise<string> {
  const processor = VFM({ partial: true, ...options }).use(libroSvgImg, { fs });
  const file = await processor.process({ path: path.join(fixturesDir, "doc.md"), contents: md });
  return String(file);
}

// sample.png=720x540px → 254mm×190.5mm。VFM の hast→html 直列化に合わせた期待文字列。
const svg = (width: string, height: string, viewBox: string, transform: string) =>
  `<svg width="${width}" height="${height}" viewBox="${viewBox}">` +
  `<image width="254" height="190.5" xlink:href="sample.png" transform="${transform}"></image></svg>`;

describe("E2E(VFM): svgimg が SVG に変換される", () => {
  test("倍率のみ：<p> 内の img が svg に置換される", async () => {
    const html = await render("![](sample.png?svgimg=40)");
    assert.ok(
      html.includes(svg("101.6mm", "76.2mm", "0 0 101.6 76.2", "translate(0,0) scale(0.4)")),
      html,
    );
  });

  test("フル指定 30,180,200,-10,-10", async () => {
    const html = await render("![](sample.png?svgimg=30,180,200,-10,-10)");
    assert.ok(
      html.includes(svg("180mm", "200mm", "0 0 180 200", "translate(-10,-10) scale(0.3)")),
      html,
    );
  });

  test("svgimg なしの画像は <img> のまま残る", async () => {
    const html = await render("![](sample.png)");
    assert.match(html, /<img src="sample\.png">/);
    assert.ok(!html.includes("<svg"), html);
  });
});

describe("E2E(VFM): alt は figcaption として残る（原実装との差異）", () => {
  // 原実装は ![alt](...) 全体を svg 化し VFM の figure 化を先回りで潰すため alt が消える。
  // 本実装(hast)は VFM が先に figure+figcaption を生成し、その img だけが svg に替わるので
  // alt 由来の figcaption は残る。両者の挙動差をここで固定する。
  test("![alt](...) は <figure> 内に svg と figcaption を併存させる", async () => {
    const html = await render("![スクショ](sample.png?svgimg=40)");
    assert.match(html, /<figure>/);
    assert.ok(
      html.includes(svg("101.6mm", "76.2mm", "0 0 101.6 76.2", "translate(0,0) scale(0.4)")),
      html,
    );
    assert.match(html, /<figcaption[^>]*>スクショ<\/figcaption>/);
  });
});

describe("E2E(VFM): captionlessImagePolicy との協動（空 alt）", () => {
  // 空 alt の画像は captionless 扱い。policy に応じて VFM が p / figure / figure+空figcaption で
  // 包むが、本プラグインは img をその場で svg に置換するだけなので、どの包み方でも成立する。
  const expectedSvg = svg("101.6mm", "76.2mm", "0 0 101.6 76.2", "translate(0,0) scale(0.4)");
  const md = "![](sample.png?svgimg=40)";

  test("paragraph: <p> 内に svg（figure 化しない）", async () => {
    const html = await render(md, { captionlessImagePolicy: "paragraph" });
    assert.ok(html.includes(expectedSvg), html);
    assert.match(html, /<p>\s*<svg/);
    assert.ok(!html.includes("<figure"), html);
  });

  test("figure: <figure> 内に svg（figcaption なし）", async () => {
    const html = await render(md, { captionlessImagePolicy: "figure" });
    assert.ok(html.includes(expectedSvg), html);
    assert.match(html, /<figure>\s*<svg/);
    assert.ok(!html.includes("<figcaption"), html);
  });

  test("figure-with-figcaption: <figure> 内に svg ＋ 空 figcaption", async () => {
    const html = await render(md, { captionlessImagePolicy: "figure-with-figcaption" });
    assert.ok(html.includes(expectedSvg), html);
    assert.match(html, /<figure>\s*<svg/);
    assert.match(html, /<figcaption[^>]*><\/figcaption>/);
  });
});

describe("E2E(VFM): imgFigcaptionOrder との協動（svg は img の位置に入る）", () => {
  // 本プラグインは位置を動かさず in-place 置換するので、figure 内の img↔figcaption の順序は
  // VFM の指定どおりになる（img があった場所に svg が入る）。両順序を固定する。
  const expectedSvg = svg("101.6mm", "76.2mm", "0 0 101.6 76.2", "translate(0,0) scale(0.4)");
  const md = "![スクショ](sample.png?svgimg=40)";

  test("img-figcaption（既定）: svg → figcaption の順", async () => {
    const html = await render(md, { imgFigcaptionOrder: "img-figcaption" });
    assert.ok(html.includes(expectedSvg), html);
    assert.match(html, /<\/svg>\s*<figcaption[^>]*>スクショ<\/figcaption>/);
  });

  test("figcaption-img: figcaption → svg の順", async () => {
    const html = await render(md, { imgFigcaptionOrder: "figcaption-img" });
    assert.ok(html.includes(expectedSvg), html);
    assert.match(html, /<figcaption[^>]*>スクショ<\/figcaption>\s*<svg/);
  });
});

describe("E2E(VFM): 不正な svgimg はパイプラインを止める", () => {
  test("?svgimg=,180（倍率空）は process が reject する", async () => {
    await assert.rejects(render("![](sample.png?svgimg=,180)"), /invalid svgimg/);
  });
});
