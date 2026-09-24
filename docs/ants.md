# アリの自律生態系モデル

120 × 76 の連続座標フィールドを 30 Hz の固定時間刻みで更新します。80 匹で開始し、餌の自然発生、エネルギー消費、出生、死亡を自動で進めます。画面更新速度とシミュレーション速度は独立し、初期速度は 2 倍、1〜8 倍を選べます。非表示中の時間を後からまとめて進めません。

探索中のアリは前方と左右 ±0.6 rad、距離 5 のアンテナで匂いを比較します。探索の自由度を確率として、匂いに従うかランダムな揺らぎを優先するか決めます。半径 11 内の餌は、壁越しでない場合だけ直接感知します。餌場へ近づくと 1 単位持ち帰ります。帰巣中は巣の方角が分かる人工的なコンパスを与えています。帰巣は壁で妨げられ、閉じ込められた場合の到達は保証しません。

帰巣するアリは周囲 3 × 3 セルにフェロモンを残します。分泌は帰路の長さに応じて少しずつ弱まります。場の濃度は 12 が上限で、半減期 12 秒で減衰します。拡散は実装していません。巣の位置以外の目的地や最短経路を個体へ渡しません。移動は 0.56 セル以下で区間内も衝突判定します。アリ同士の衝突や神経回路学習はモデル化していません。

## 食糧と季節

草原は雨季 40 秒・乾季 45 秒・回復期 35 秒、乾いた土地は 25・70・30 秒、豊かな森は 50・25・40 秒で循環します。乾季は新たな餌が発生しません。乾季以外は環境ごとの間隔・量に基づき、巣から離れた場所に餌場を作ります。位置と量にはシード固定の揺らぎがあります。餌場は 40〜75 秒で枯れ、未回収の食糧も失われます。最大 16 箇所で、量は非負です。初期の巣の蓄えは通常 50、乾いた土地では 25 です。

食糧は、野外・運搬中・巣の蓄え・消費済み・育成費・枯渇分・運搬中の死亡による喪失として勘定します。配達の累計はこれらと重複する観測値で、食糧を複製しません。

## 個体の生活史

各個体にエネルギー（0〜100）、年齢、寿命を持たせます。初期エネルギーは 50〜95、初期年齢は 0〜35 秒、寿命は 120〜220 秒です。通常毎秒 0.8、運搬中は 0.95 のエネルギーを消費します。30 未満で空腹として描画し、巣に蓄えがある場合は帰巣します。巣の近くでエネルギーが 60 未満なら食糧 1 を使って 55 回復。野外では 45 未満なら餌 1 を自分で食べます。いずれも最大 100 です。

エネルギーが 0 以下なら餓死、寿命に達した場合は老衰として個体を除去します。同時に満たした場合は餓死に分類します。死亡地点に 15 秒だけ印を残します。運搬中の餌は失われます。

## コロニーの繁殖と絶滅

3 秒ごとに、成体が生きていて、巣の蓄えが `max(15, 成体数 × 0.4)` を超えて余っていれば、幼体 1〜3 匹分の育成費を支出します。1 匹の費用は食糧 4、育成に 15 秒かかります。育成費は前払いし、幼体の死亡はモデル化していません。羽化時は年齢 0・エネルギー 85 で巣に現れます。これはコロニー単位の規則で、働きアリが交配・産卵するという意味ではありません。

成体と幼体の合計は負荷制限として最大 240 匹です。成体がいなくても、育成済みの幼体が残っていれば羽化を待ちます。成体・幼体ともに 0 になると絶滅し、時間を止めます。自動で復活・リセットはしません。

## 観察と再現

初期状態と乱数列は同じ SEED と環境で再現できます。操作は一時停止・速度・表示・新しい観察の開始に絞り、餌や壁の手動編集は画面から外しました。従来の手動採餌エンジンと編集関数は回帰テストのためモジュール内に残しています。現在は保存・リプレイ機能はなく、別モードから戻るとその位置から再開します。履歴は生存数 360 点（5 秒間隔）、出来事 12 件、死亡の印 80 個を上限とし、長時間でも増え続けません。

これは集団行動を観察するための簡略モデルで、秒数や世代交代は人工的に短縮しています。生物学的に検証された再現ではありません。テストでは再現性、人口・食糧の収支、餓死・寿命・幼体の羽化、季節、絶滅後の停止、3 環境で各 10 分の自律経過を確認します。

## 共有画像

`public/ant-og.png` は内蔵 imagegen で生成しました。従来の `public/og.png` は保持しています。生成プロンプト:

> Create one landscape 1536x1024 social preview card for the interactive web simulator 'FLYLAB / ANT FIELD'. Use case: ads-marketing. Complete cohesive card including typography. Background extremely dark forest green #091713, sparse delicate grid of dots, editorial scientific field notebook aesthetic. Large exact text upper left 'ANT FIELD', smaller exact text 'FLYLAB' and 'Collective behavior, one ant at a time.' Crisp warm ivory sans serif type. Right and lower area top-down miniature ant colony simulation: small ivory ants walking on organically branching luminous amber pheromone trails from a soft mint-green circular nest on left to two clusters of lime food grains on right, a subtle stone barrier blocking part of one trail. Tiny ants with visible three body segments, scientific restrained appearance, not realistic macro insect photography. Palette muted forest, pale sage #bde778, glowing amber #e6af4a. Elegant ample negative space, no browser chrome, no fake controls, no other words, no watermark. This is the social card for an actual local-rules ant foraging simulation with editable food and walls.
