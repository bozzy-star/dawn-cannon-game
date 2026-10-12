# 音声素材

日本語男性合成音声 Eddy をもとに、若めの男性が海上で声を張ることを
意識して生成した音声です。以前の Rocko 版から声を変更し、少し高い
ピッチ、短く速い報告、語尾の強勢、明瞭な広い帯域を使っています。
無線の送受信音は外しています。人間の声優による収録ではありません。

| 素材 | 発話 |
| --- | --- |
| `enemy-sunk.wav` | 敵艦、撃沈！ |
| `air-spotted.wav` | 敵機発見！ |
| `hit-bow.wav` | 艦首、被弾！ |
| `hit-stern.wav` | 艦尾、被弾！ |
| `hit-port.wav` | 左舷、被弾！ |
| `hit-starboard.wav` | 右舷、被弾！ |
| `hit-bridge.wav` | 艦橋、被弾！ |
| `hit-engine.wav` | 機関部、被弾！ |

元音声: 242 words/min、24 kHz / mono。ゲーム収録版: 24 kHz / mono / PCM16。
生成処理と中間音は `work/audio-v5/` に保存しています。

砲撃・爆発・ソナー・モールス信号は `audio.js` の手続き生成音です。
