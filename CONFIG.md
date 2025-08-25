# 設定ファイルガイド

このアプリケーションでは、地図のデータや表示、経路探索の挙動をJSONファイルでカスタマイズできます。設定ファイルは `data/` ディレクトリにあります。

## 1. アプリケーション設定 (`data/config.json`)

アプリケーションの全体的な動作を制御します。

```json
{
    "pathfinding": {
        "avoidRoadTypes": ["mountain"],
        "kShortestPaths": 3
    },
    "rendering": {
        "routeColors": ["#ffd700", "#00bfff", "#32cd32"],
        "nodeColors": {
            "start": "green",
            "end": "red",
            "via": "orange",
            "default": "lightblue"
        }
    }
}
```

### `pathfinding`
- `avoidRoadTypes`: 経路探索時に避ける道路の種別を文字列の配列で指定します。`data/roadTypes.json` のキーと一致させます。
- `kShortestPaths`: 経由地がない場合に、探索する代替経路の最大数を整数で指定します。

### `rendering`
- `routeColors`: 地図上に表示される経路の色を、カラーコードの配列で指定します。複数の経路が表示される場合に、この配列の色が順番に使われます。
- `nodeColors`: ノード（地点）の種類ごとの色をオブジェクトで指定します。
    - `start`: 出発地
    - `end`: 到着地
    - `via`: 経由地
    - `default`: その他のノード

---

## 2. 道路種別のスタイル設定 (`data/roadTypes.json`)

道路の種類ごとの見た目を定義します。

```json
{
    "default": { "color": "black", "lineWidth": 1, "style": "solid" },
    "highway": { "color": "red", "lineWidth": 3, "style": "solid" },
    "prefectural": { "color": "blue", "lineWidth": 2, "style": "solid" },
    "city": { "color": "green", "lineWidth": 1.5, "style": "solid" },
    "mountain": { "color": "brown", "lineWidth": 1, "style": "dashed" },
    "river": { "color": "cyan", "lineWidth": 1, "style": "dotted" }
}
```

- **キー**: 道路の種別名（`data/edges.json` で使用）
- **値 (オブジェクト)**:
    - `color`: 道路の色をカラーコードまたは色名で指定します。
    - `lineWidth`: 道路の線の太さを数値で指定します。
    - `style`: 線のスタイルを `"solid"` (実線), `"dashed"` (破線), `"dotted"` (点線) から選びます。

---

## 3. 地図データ

### ノード（地点）データ (`data/nodes.json`)

地図上の表示されるノード（地点）とその座標を定義します。

- **形式**: `{"ノード名": [x座標, y座標]}` のオブジェクト
- **例**: `{"村山駅": [500, 300], "楯岡": [450, 350]}`

### 非表示ノードデータ (`data/hiddenNodes.json`)

経路計算には使われるが、地図上には表示されないノードを定義します。主に、道路の形状を滑らかにするための中間点として使用します。

- **形式**: `nodes.json` と同じ
- **例**: `{"交差点A": [510, 320]}`

### エッジ（道路）データ (`data/edges.json`)

ノード間をつなぐエッジ（道路）を定義します。

- **形式**: `["始点ノード", "終点ノード", コスト, "道路種別"]` の配列
- **例**: `["楯岡", "東沢", 4, "city"]`
    - `始点ノード`, `終点ノード`: `nodes.json` または `hiddenNodes.json` で定義したノード名
    - `コスト`: 経路計算に使われる距離や時間などの重み（数値）
    - `道路種別`: `roadTypes.json` で定義したキー（文字列）
