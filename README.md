# FlyLab

MaleCNS v1.0 と Stonkfly の実験に着想を得た、ブラウザで動くハエの縮約神経回路シミュレータです。

光・匂い・報酬・ノイズを入力し、84 個の leaky integrate-and-fire ニューロンが発火して、人工的な旋回・前進出力へ至る過程を観察できます。条件、乱数シード、可塑性の有無を変えた実験を保存し、CSV で比較できます。

> [!IMPORTANT]
> FlyLab は MaleCNS v1.0 の実コネクトームを直接シミュレートするものではありません。MaleCNS に見られる感覚・統合・記憶・運動という構成から着想を得た教育・探索用の縮約モデルです。挙動は生物学的な能力、意識、痛覚、学習能力を示す証拠ではありません。

## できること

- 左右の光、匂い、報酬／嫌悪、神経ノイズをリアルタイムに変更
- 84 ニューロン、数百シナプスの発火と信号伝播を Canvas で観察
- 4 つのプリセット（光走性、匂いと報酬、感覚競合、ノイズ耐性）
- 開始、一時停止、1 ステップ、リセット、1〜8 倍速
- 記憶→運動シナプスの簡略化された報酬依存可塑性
- 左右運動集団から計算した旋回、前進、仮想軌跡の表示
- シード固定による再現可能な実験
- 実験結果のローカル保存、個別削除、CSV エクスポート
- デスクトップ、タブレット、モバイル対応

## 起動

Node.js 22.13 以降が必要です。

```bash
npm install
npm run dev
```

表示されたローカル URL をブラウザで開きます。

## 実験の進め方

1. 左側のプリセットを 1 つ選びます。
2. 必要なら刺激スライダー、可塑性、SEED を変更します。
3. 「実験開始」を押し、中央の発火と右側の行動出力を観察します。
4. 一時停止して「この結果を記録」を押します。
5. 条件を変えて繰り返し、実験記録で比較します。

最初は次の比較がおすすめです。

| 比較 | 変えるもの | 見るもの |
| --- | --- | --- |
| 左右の光 | 左の光 / 右の光 | TURN と運動集団の発火率 |
| 学習候補 | 可塑性 ON / OFF | Δ WEIGHT |
| 再現性 | 同じ SEED / 別の SEED | 発火数と軌跡 |
| ノイズ耐性 | ノイズのみ | 行動出力の揺れ |

## モデル

8 集団で構成した疎な有向グラフです。

```text
左右視覚 ─┐
          ├→ 統合 ─→ 記憶 ─→ 左右運動 ─→ 旋回・前進
嗅覚 ─────┘           ↑
                    ドーパミン（人工的な報酬信号）
```

各ニューロンは 20 ms 刻みの leaky integrate-and-fire モデルです。可塑性は記憶→運動の一部接続だけに適用し、発火の適格度トレースと報酬信号から重みを更新します。重みには上下限があります。

詳しい仮定と設計は [docs/design.md](docs/design.md)、実装記録は [docs/implementation.md](docs/implementation.md)、調査メモは [docs/research.md](docs/research.md) を参照してください。

## 検証

```bash
npm run lint
npm test
npm run build
```

テストでは回路サイズ、シードによる決定性、可塑性 OFF 時の重み不変条件、可塑性 ON 時の重み境界、行動ラベル、完成画面のサーバー描画を確認します。

## 主なファイル

- `lib/simulation.ts`: 回路生成、LIF 更新、可塑性、行動読み出し
- `app/FlyLab.tsx`: 操作、Canvas 描画、実験記録、CSV 出力
- `app/globals.css`: レスポンシブな実験 UI
- `tests/simulation.test.ts`: モデルの自動テスト
- `tests/rendered-html.test.mjs`: 完成画面とメタデータの検証

## 参考資料

- [GIGAZINE: ハエの脳を基にした16万6700個の仮想ニューロンで仮想通貨のデイトレードを行う試み](https://gigazine.net/news/20260914-stonkfly-malecns-v1-0-crypto/)
- [natverse/malecns](https://github.com/natverse/malecns)
- [malecns package site](https://natverse.org/malecns/)
- [nftechie/stonkfly](https://github.com/nftechie/stonkfly)

## License

このリポジトリにライセンスファイルはまだありません。利用・再配布条件を明確にする場合は、適切なライセンスを追加してください。
