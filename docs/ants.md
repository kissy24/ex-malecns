# アリの採餌モデル

120 × 76 の連続座標フィールドを 30 Hz の固定時間刻みで更新します。壁とフェロモンはセル単位、アリは連続座標です。60・120・240 匹を選べます。画面更新速度とシミュレーション速度は独立しており、非表示中の時間を後からまとめて進めません。

探索中のアリは前方と左右 ±0.6 rad、距離 5 のアンテナで匂いを比較します。探索の自由度を確率として、匂いに従うかランダムな揺らぎを優先するか決めます。半径 11 内の餌は、壁越しでない場合だけ直接感知します。餌場へ近づくと 1 単位持ち帰ります。帰巣中は巣の方角が分かる人工的なコンパスを与えています。帰巣は壁で妨げられ、閉じ込められた場合の到達は保証しません。

帰巣するアリは周囲 3 × 3 セルにフェロモンを残します。分泌は帰路の長さに応じて少しずつ弱まります。場の濃度は 12 が上限で、設定した半減期に従い指数的に減衰します。拡散は実装していません。巣の位置以外の目的地や最短経路を個体へ渡しません。壁は匂い感知と移動を遮ります。移動は 0.56 セル以下で区間内も衝突判定します。アリ同士の衝突、栄養消費、繁殖、神経回路学習はモデル化していません。

餌・壁・消しゴムによる操作は進行中にも可能です。壁を描くとそのセルの匂いが消えます。巣・餌場の周辺、アリがいるセルは壁から保護します。消しゴムは壁と匂いを消し、近くの餌場も取り除きます。餌場の除去で、運搬中の餌は失われません。1 箇所の餌追加は 200 単位、餌場は最大 40 箇所です。

初期状態と乱数列は SEED 固定で再現できます。再現に必要なのは SEED、個体数、環境、パラメータ、同じ tick での同じ介入です。現在は実験の保存・リプレイ機能はありません。別モードから戻ると、実行していたアリの実験はその位置から再開します。

これは集団行動を観察するために設計した簡略モデルであり、生物学的能力の検証結果ではありません。テストは再現性、食物の保存、壁への衝突、匂いの減衰、餌と壁の変更後の動作を確認します。

## 共有画像

`public/ant-og.png` は内蔵 imagegen で生成しました。従来の `public/og.png` は保持しています。生成プロンプト:

> Create one landscape 1536x1024 social preview card for the interactive web simulator 'FLYLAB / ANT FIELD'. Use case: ads-marketing. Complete cohesive card including typography. Background extremely dark forest green #091713, sparse delicate grid of dots, editorial scientific field notebook aesthetic. Large exact text upper left 'ANT FIELD', smaller exact text 'FLYLAB' and 'Collective behavior, one ant at a time.' Crisp warm ivory sans serif type. Right and lower area top-down miniature ant colony simulation: small ivory ants walking on organically branching luminous amber pheromone trails from a soft mint-green circular nest on left to two clusters of lime food grains on right, a subtle stone barrier blocking part of one trail. Tiny ants with visible three body segments, scientific restrained appearance, not realistic macro insect photography. Palette muted forest, pale sage #bde778, glowing amber #e6af4a. Elegant ample negative space, no browser chrome, no fake controls, no other words, no watermark. This is the social card for an actual local-rules ant foraging simulation with editable food and walls.
