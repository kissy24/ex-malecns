# 調査メモ

調査日: 2026-09-17

## MaleCNS と `natverse/malecns`

`natverse/malecns` は、Janelia FlyEM Project Team と Cambridge の Drosophila Connectomics Group による雄ショウジョウバエ中枢神経系データへ、R / natverse からアクセスしやすくするパッケージである。

- 公開読み取り専用データセット: `male-cns:v1.0`
- 接続・注釈へのアクセス: neuPrint / `neuprintr`
- 追加メタデータ: `flywireType`、`mancType`、`itoleeHl` など
- 通常のアクセスでも neuPrint token の設定が必要
- パッケージ自身は神経活動シミュレータではない

FlyLab 初版では認証や数 GB 規模の取得を必須にせず、ローカルだけで実験できることを優先した。実データは将来、neuPrint で対象集団を抽出して縮約グラフへ変換する入口として扱う。

## Stonkfly から参考にした考え方

Stonkfly は MaleCNS v1.0 の 166,700 ニューロンと約 25.6M 接続を保持する実験で、公開市場データを画像化し、視覚入力へ与えている。固定された読み出し規則で買い・売り・何もしないを提案し、損益を人工的な報酬・嫌悪刺激として使う候補可塑性則を持つ。

FlyLab が参考にした点:

- 入力を神経活動へ変換し、回路を通した後に人工的な行動へ読み出す構成
- 報酬信号と適格度を使った、限定された可塑性
- 同じ条件とシードで比較できる実験設計
- 「信号が伝わったこと」と「有用な課題を学習したこと」を区別する注意書き

FlyLab が行わないこと:

- MaleCNS 全ニューロン・全接続の保持
- Coinbase、市場データ、実取引との接続
- 利益や課題性能の最適化
- 意識、快楽、痛覚のモデル化

## 初版での判断

1. 84 ニューロンに縮約し、ブラウザで即座に動くことを優先した。
2. 個々の発火、集団発火率、運動出力、重み変化を同時に可視化した。
3. 実験結果を端末内に保存し、CSV で外部分析できるようにした。
4. 生物学的ラベルは機能集団レベルに留め、特定ニューロン型の再現を主張しない。
5. 実データ統合は認証、データ量、ライセンス、前処理方法を整理した後の拡張とした。

## 参照先

- https://gigazine.net/news/20260914-stonkfly-malecns-v1-0-crypto/
- https://github.com/natverse/malecns
- https://natverse.org/malecns/
- https://github.com/nftechie/stonkfly
