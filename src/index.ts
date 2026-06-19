import type * as hast from "hast";
import { selectAll } from "hast-util-select";
import { s } from "hastscript";
import { imageSize } from "image-size";
import type * as unified from "unified";
import upath from "upath";

type SvgImgParams = {
  path: string;
  scale: number; // 拡大率 N/100
  width: number; // 指定幅(mm)。0で未指定（拡大後の幅を使う）
  height: number; // 指定高(mm)。0で未指定
  x: number; // image の translate x
  y: number; // image の translate y
};

/**
 * `path?svgimg=N[,w,h,tx,ty]` を解析する。`?svgimg=` を含まなければ null（変換対象外）。
 * 原実装と同じく `?svgimg=` をリテラル一致で探し、それ以降をカンマ区切りで読む。
 * 倍率は必須。空（先頭カンマ `?svgimg=,...` 等）や数値化できない値は不正としてエラーを投げる
 * （原実装は NaN のまま壊れた SVG を出力していたが、移植版では早期に失敗させる）。
 * 省略フィールド（空文字）は 0＝なりゆきとして許容する。
 */
function parseSvgImg(src: hast.Properties[string]): SvgImgParams | null {
  if (typeof src !== "string") {
    return null;
  }
  const at = src.indexOf("?svgimg=");
  if (at < 0) return null;
  const [scaleField, widthField, heightField, xField, yField] = src
    .slice(at + "?svgimg=".length)
    .split(",");
  // 倍率は必須。空・未指定をここで弾くことで scaleField を string に絞り込む。
  // （?? "" のような型だけの回避ではなく、実際に不正入力を排除するガードにしている。）
  if (!scaleField) {
    throw new Error(`libroSvgImg: invalid svgimg parameter (empty scale): "${src}"`);
  }
  const parsed: SvgImgParams = {
    path: src.slice(0, at),
    scale: parseFloat(scaleField) / 100,
    width: widthField ? parseFloat(widthField) : 0,
    height: heightField ? parseFloat(heightField) : 0,
    x: xField ? parseFloat(xField) : 0,
    y: yField ? parseFloat(yField) : 0,
  };
  if ([parsed.scale, parsed.width, parsed.height, parsed.x, parsed.y].some((v) => Number.isNaN(v))) {
    throw new Error(`libroSvgImg: invalid svgimg parameter: "${src}"`);
  }
  return parsed;
}

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72; // タイポグラフィのポイント定義（1inch=72pt）？
const MM_PER_PT = MM_PER_INCH / PT_PER_INCH;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function buildSvg(
  { scale: newscale, ...param }: SvgImgParams,
  size: Pick<ReturnType<typeof imageSize>, "width" | "height">,
): hast.Element {
  let printW = size.width * MM_PER_PT;
  let printH = size.height * MM_PER_PT;
  const scaleW = round3(printW * newscale);
  const scaleH = round3(printH * newscale);
  newscale = round3(newscale);
  const trimW = param.width === 0 ? scaleW : param.width;
  const trimH = param.height === 0 ? scaleH : param.height;
  printW = round3(printW);
  printH = round3(printH);

  return s(
    "svg",
    {
      width: `${trimW}mm`,
      height: `${trimH}mm`,
      viewBox: `0 0 ${trimW} ${trimH}`,
    },
    s("image", {
      width: String(printW),
      height: String(printH),
      "xlink:href": param.path,
      transform: `translate(${param.x},${param.y}) scale(${newscale})`,
    }),
  );
}

export type LibroSvgImgOptions = {
  fs: {
    readFileSync(path: string): Uint8Array;
  };
};

export const libroSvgImg: unified.Plugin<[LibroSvgImgOptions]> =
  ({ fs: { readFileSync } }) =>
  (tree, file) => {
    // Vivliostyle CLI v11.0.2では、file.dirnameはPOSIX-like絶対パスで与えられる。
    // - `vfile({ path: filepath, contents: markdownString }),` at https://github.com/vivliostyle/vivliostyle-cli/blob/v11.0.2/src/processor/markdown.ts#L28
    //   - https://github.com/vivliostyle/vivliostyle-cli/blob/v11.0.2/src/processor/compile.ts#L193
    //     - https://github.com/vivliostyle/vivliostyle-cli/blob/v11.0.2/src/config/resolve.ts#L1127
    //       - `sourcePath = upath.resolve(context, input.entry);` at https://github.com/vivliostyle/vivliostyle-cli/blob/v11.0.2/src/config/resolve.ts#L1059
    if (file.dirname == null) {
      throw new Error("libroSvgImg: file.dirname is null; cannot resolve image paths");
    }
    selectAll("img", tree as hast.Root)
      .flatMap((img) => {
        const params = parseSvgImg(img.properties?.src);
        return params ? [{ img, params }] : [];
      })
      .forEach(({ img, params }) => {
        Object.assign(
          img,
          buildSvg(
            params,
            imageSize(readFileSync(upath.join(file.dirname, params.path))),
          ),
        );
      });
  };
