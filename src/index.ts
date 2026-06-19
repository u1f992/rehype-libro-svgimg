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
 * `path?svgimg=N[,w,h,tx,ty]` を解析する。svgimgクエリが無ければ null（変換対象外）。
 * scale が空（先頭カンマ ?svgimg=,... 等）なら原実装どおり parseFloat("")=NaN を返し、
 * 呼び出し側で寸法 NaN の壊れたSVGになる（原稿に該当はない）。
 * （?? "" は noUncheckedIndexedAccess 下の型の絞り込み。実行時 params[0] は常に文字列。）
 */
function parseSvgImg(src: hast.Properties[string]): SvgImgParams | null {
  if (typeof src !== "string") {
    return null;
  }
  const queryAt = src.indexOf("?");
  if (queryAt < 0) return null;
  const svgimg = new URLSearchParams(src.slice(queryAt + 1)).get("svgimg");
  if (!svgimg) return null;
  const params = svgimg.split(",");
  return {
    path: src.slice(0, queryAt),
    scale: parseFloat(params[0] ?? "") / 100,
    width: params[1] ? parseFloat(params[1]) : 0,
    height: params[2] ? parseFloat(params[2]) : 0,
    x: params[3] ? parseFloat(params[3]) : 0,
    y: params[4] ? parseFloat(params[4]) : 0,
  };
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
      throw new Error("libroSvgImg: ");
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
