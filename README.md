# rehype-libro-svgimg

[vfm-mdbp-vscode](https://github.com/libroworks/vfm-mdbp-vscode)@[v0.3.6](https://github.com/libroworks/vfm-mdbp-vscode/tree/8490f88200155e242edd44abb4628023f2d722d5)の「画像のトリミング」機能をRehypeプラグインとして移植したもの。

vfm-mdbp-vscodeの機能はVFMより先に`![キャプション](img.png?svgimg= ... )`をSVGに置換することで実装されていますが、このプラグインではHTMLに変換してから`src`属性を処理しています。VFMにチェインする場合、`![キャプション](img.png?svgimg= ... )`は`<svg> ... </svg>`ではなく、`<figure><svg> ... </svg><figcaption>キャプション</figcaption></figure>`となります。キャプションと画像の順番は、VFMの`imageFigcaptionOrder: "img-figcaption" | "figcaption-img"`によって制御できます。キャプションがない場合、VFMの`captionlessImagePolicy: "paragraph" | "figure" | "figure-with-figcaption"`によって、ラップ要素と`figcaption`要素の有無を制御できます。
