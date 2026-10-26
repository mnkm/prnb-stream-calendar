import type { MorningManualVoice } from '../shared/types';

/**
 * 目で確かめて足した、朝活のボイス(配信の id ごと、時刻の順)。
 *
 * 自動の読み取り(src/shared/morning.ts と、使う側の「ボイス🎤」の行の読み取り)では拾えない回の分。
 * 2026-10 に公開の朝活 501 本を調べ、「ボイス🎤」の行が無かった 212 本をユーザーが目で確かめた結果で、
 * 「1回目🎤（エコーなし）」のように回数で書かれた行や、🎤 の無い行などがここに入る。
 * ここに無い残りの回は、ボイスが無いことを確かめたもの。
 * /api/morning-comments の manualVoices で返す(README の「朝活のコメント」)。
 */
export const MORNING_MANUAL_VOICES: Readonly<Record<string, readonly MorningManualVoice[]>> = {
  // 2025-07-07
  "Oe2yQdoKZAQ": [
    { time: "02:24:47", name: "七夕ボイス🎤", commentId: "Ugw99u5vXhUV_gNXP8Z4AaABAg" },
  ],
  // 2025-02-14
  "yyJMHbSCac0": [
    { time: "00:25:28", name: "🎤告白ボイス（ツンデレな女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "00:27:07", name: "🎤告白ボイス（真面目な女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "00:39:32", name: "🎤告白ボイス（明るい女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "01:03:26", name: "🎤告白ボイス（マイペースな女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "01:05:15", name: "🎤告白ボイス（チャラい女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "01:24:51", name: "🎤告白ボイス（前向きな女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "01:53:41", name: "🎤告白ボイス（ヤンデレな女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
    { time: "02:28:32", name: "🎤告白ボイス（素直な女の子）", commentId: "UgwLYTZSQf6Y7i02aeB4AaABAg" },
  ],
  // 2024-11-01
  "J8D10q8WExI": [
    { time: "02:25:15", name: "🎤付き合って8年、同棲して5年の記念日ボイス", commentId: "UgyFa2yFSYW5g-97WI14AaABAg.AAISjTO3K9_AAI_4yF0xdD" },
  ],
  // 2024-10-21
  "x9bgC5bczlk": [
    { time: "02:23:41", name: "ご飯警察ボイス🎤", commentId: "UgyBc0uKwIznHMniCql4AaABAg.A9rAHkmH4zhA9rAX7JvxfE" },
  ],
  // 2023-11-01
  "1hjlqKJdqM0": [
    { time: "02:21:05", name: "1回目🎤（普通のロリ）", commentId: "UgzSIi26aZN_lD4Octt4AaABAg.9waNkYd-nDU9waQegqDdH_" },
    { time: "02:22:53", name: "2回目🎤（年齢低めのロリ）", commentId: "UgzSIi26aZN_lD4Octt4AaABAg.9waNkYd-nDU9waQegqDdH_" },
  ],
  // 2023-10-26
  "WGy4d9buz3Q": [
    { time: "02:16:23", name: "1回目🎤（通常）", commentId: "UgyWpyznW9Xy3GKB8JZ4AaABAg" },
    { time: "02:20:53", name: "2回目🎤（改変・ヤンデレ）", commentId: "UgyWpyznW9Xy3GKB8JZ4AaABAg" },
  ],
  // 2023-10-17
  "axIYCTAjQ9Y": [
    { time: "02:17:42", name: "1回目🎤（誕生日お祝いボイス）", commentId: "Ugx5-EhggfyEjJvuC9p4AaABAg" },
    { time: "02:24:49", name: "2回目🎤（配信コンテンツオフ）", commentId: "Ugx5-EhggfyEjJvuC9p4AaABAg" },
  ],
  // 2023-09-27
  "iL2mWhfUx9k": [
    { time: "02:20:41", name: "1回目🎤（ゆらくんバージョン）", commentId: "UgylYb_WZBp0YArK5yZ4AaABAg" },
    { time: "02:27:00", name: "2回目🎤（ゆらちゃんバージョン）", commentId: "UgylYb_WZBp0YArK5yZ4AaABAg" },
  ],
  // 2023-09-25
  "IMuOkqqzlOg": [
    { time: "01:55:01", name: "1回目🎤（通常バージョン）", commentId: "Ugx3WGIN7WOdYTTJAxF4AaABAg.9v4nNl9_RvA9v4nSq8UX1b" },
    { time: "02:05:41", name: "2回目🎤（ガチロリバージョン）", commentId: "Ugx3WGIN7WOdYTTJAxF4AaABAg.9v4nNl9_RvA9v4nSq8UX1b" },
  ],
  // 2023-09-21
  "ESY-8owIT0s": [
    { time: "02:20:02", name: "寝たフリいたずらボイス🎤", commentId: "UgzVQpLCxZvoB7-n2r54AaABAg.9uyLR8ru2PK9uyLWgBAGOQ" },
  ],
  // 2023-09-15
  "6VsSVbgkJf8": [
    { time: "02:06:17", name: "1回目🎤（ゆらくんバージョン）", commentId: "UgyAPp0ZvXA0RO62ySJ4AaABAg.9ugH6vJvNTc9ugHbZElz3X" },
    { time: "02:12:22", name: "2回目🎤（ゆらちゃんバージョン）", commentId: "UgyAPp0ZvXA0RO62ySJ4AaABAg.9ugH6vJvNTc9ugHbZElz3X" },
  ],
  // 2023-09-11
  "di8EGDqNSGE": [
    { time: "02:10:28", name: "1回目🎤（ゆらくんバージョン）", commentId: "Ugxi1xWkCNKvrPuJITd4AaABAg.9uWq7W2uAMk9uWqT66DNma" },
    { time: "02:14:52", name: "2回目🎤（ゆらちゃんバージョン）", commentId: "Ugxi1xWkCNKvrPuJITd4AaABAg.9uWq7W2uAMk9uWqT66DNma" },
  ],
  // 2023-09-08
  "cMky8h9h5oA": [
    { time: "02:25:41", name: "1回目🎤（君呼び、エコーなし）", commentId: "UgxC06axRQ1im1BXKJt4AaABAg.9uPMGokVNku9uPMIc8QQCd" },
    { time: "02:30:15", name: "2回目🎤（ちゃん呼び、エコーあり）", commentId: "UgxC06axRQ1im1BXKJt4AaABAg.9uPMGokVNku9uPMIc8QQCd" },
  ],
  // 2023-08-29
  "nZFVANRJP7k": [
    { time: "02:03:33", name: "1回目🎤（エコーなし）", commentId: "Ugwgc4K96TXi87r_CBV4AaABAg.9u-Pc29XuHM9u-PerNZ1sL" },
    { time: "02:08:04", name: "2回目🎤（エコーあり→なし）", commentId: "Ugwgc4K96TXi87r_CBV4AaABAg.9u-Pc29XuHM9u-PerNZ1sL" },
  ],
  // 2023-08-23
  "ml-MV5BlXow": [
    { time: "02:21:24", name: "1回目🎤（エコーなし）", commentId: "UgzAFyIx2rmLiOZSc1l4AaABAg" },
    { time: "02:28:26", name: "2回目🎤（エコーあり）", commentId: "UgzAFyIx2rmLiOZSc1l4AaABAg" },
  ],
  // 2023-08-17
  "ZVXhYvTHUgU": [
    { time: "02:54:14", name: "1回目🎤（圧強めバージョン）", commentId: "UgzG7sy5RhDCV7tVpQ54AaABAg" },
    { time: "02:58:54", name: "2回目🎤（甘々バージョン）", commentId: "UgzG7sy5RhDCV7tVpQ54AaABAg" },
  ],
  // 2023-08-10
  "Gs6QL8yDh9M": [
    { time: "02:06:26", name: "欲張りセット🎤（エコーなし）", commentId: "Ugz35BrvxAhg-ggY5w94AaABAg.9tEDQziPE0E9tEDW_tc4zp" },
  ],
  // 2023-08-09
  "GxVKAxH0myY": [
    { time: "02:00:39", name: "1回目🎤（ゆらくんバージョン）", commentId: "Ugy_it6geGTA4mWmcg14AaABAg" },
    { time: "02:09:03", name: "2回目🎤（ゆらちゃんバージョン）", commentId: "Ugy_it6geGTA4mWmcg14AaABAg" },
  ],
  // 2023-08-08
  "OHFYUr7HCfk": [
    { time: "02:18:39", name: "1回目🎤（ゆらみりー勝ち、ゆら告白）", commentId: "UgyUZfbz5J5A4EGMG314AaABAg" },
    { time: "02:26:24", name: "2回目🎤（ゆら勝ち、ゆらみりー告白）", commentId: "UgyUZfbz5J5A4EGMG314AaABAg" },
  ],
  // 2023-08-07
  "qOWMUYVDLSY": [
    { time: "01:44:00", name: "プロポーズお返事ボイス🎤", commentId: "UgxbuJSmK92g6wi606N4AaABAg" },
  ],
  // 2023-08-04
  "EdvYZd8Kwlg": [
    { time: "01:57:15", name: "1回目🎤（ショタバージョン）", commentId: "UgwiJNRkervl3aOhaRh4AaABAg" },
    { time: "02:04:07", name: "2回目🎤（普通のゆらバージョン）", commentId: "UgwiJNRkervl3aOhaRh4AaABAg" },
  ],
  // 2023-08-03
  "ePFpy_lNGUE": [
    { time: "01:55:33", name: "1回目🎤（男の子向け）", commentId: "UgznUA9PHNTMkx3-bWd4AaABAg" },
    { time: "02:08:34", name: "2回目🎤（女の子向け）", commentId: "UgznUA9PHNTMkx3-bWd4AaABAg" },
  ],
  // 2023-08-02
  "7MkCxr5SC_k": [
    { time: "02:03:24", name: "1回目🎤（普通のゆらバージョン）", commentId: "Ugy5LuOlFFe_LRlvKs94AaABAg" },
    { time: "02:23:08", name: "2回目🎤（妹バージョン）", commentId: "Ugy5LuOlFFe_LRlvKs94AaABAg" },
  ],
  // 2023-07-31
  "HOcJEMrcFnw": [
    { time: "02:08:17", name: "1回目🎤（エコーなし→あり）", commentId: "Ugzf1Wt56_7sxq_f6Mt4AaABAg" },
    { time: "02:13:54", name: "2回目🎤（エコーあり→なし）", commentId: "Ugzf1Wt56_7sxq_f6Mt4AaABAg" },
  ],
  // 2023-07-27
  "dT4OfvCA6P0": [
    { time: "02:12:28", name: "1回目🎤（ゆらバージョン）", commentId: "Ugwvryv4HpL6hY5FjQR4AaABAg" },
    { time: "02:19:10", name: "2回目🎤（お姉さんバージョン）", commentId: "Ugwvryv4HpL6hY5FjQR4AaABAg" },
    { time: "02:27:29", name: "3回目🎤（ヤンデレショタバージョン）", commentId: "Ugwvryv4HpL6hY5FjQR4AaABAg" },
    { time: "02:31:28", name: "4回目🎤（ロリバージョン）", commentId: "Ugwvryv4HpL6hY5FjQR4AaABAg" },
  ],
  // 2023-07-26
  "z4uUWOovwPk": [
    { time: "01:52:56", name: "1回目🎤（通常バージョン）", commentId: "UgzUzxXEoDAQJDcCzJN4AaABAg" },
    { time: "02:07:29", name: "2回目🎤（イケショタバージョン）", commentId: "UgzUzxXEoDAQJDcCzJN4AaABAg" },
  ],
  // 2023-07-25
  "bKxGxsdPRgM": [
    { time: "02:03:37", name: "1回目🎤（通常、エコーなし）", commentId: "UgwpceFB1nLh48TsncR4AaABAg" },
    { time: "02:14:58", name: "2回目🎤（通常、エコーあり）", commentId: "UgwpceFB1nLh48TsncR4AaABAg" },
    { time: "02:38:05", name: "3回目🎤（ヤンデレ、エコーあり）", commentId: "UgwpceFB1nLh48TsncR4AaABAg" },
  ],
  // 2023-07-24
  "pccuzjeUuck": [
    { time: "02:05:23", name: "1回目🎤（新婚さん）", commentId: "Ugzeq7t-6JwY0jN7mZJ4AaABAg" },
    { time: "02:11:18", name: "2回目🎤（おまけ、エコーありなし2連続）", commentId: "Ugzeq7t-6JwY0jN7mZJ4AaABAg" },
  ],
  // 2023-07-21
  "TkuQHJ8CsXI": [
    { time: "01:43:14", name: "1回目🎤（普通のゆらバージョン）", commentId: "UgxmqwA1ptryDVKVCZ94AaABAg" },
    { time: "01:51:47", name: "2回目🎤（ショタバージョン）", commentId: "UgxmqwA1ptryDVKVCZ94AaABAg" },
  ],
  // 2023-07-20
  "9RerbSCla3Y": [
    { time: "02:10:27", name: "ボイスマロ🎤", commentId: "Ugw9Ff7-d8U3AsrDqct4AaABAg" },
  ],
  // 2023-07-19
  "S2F6--CfRWo": [
    { time: "02:12:26", name: "1回目🎤（ロリメイド）", commentId: "Ugwy4S3M_i_AX_ia_Lp4AaABAg" },
    { time: "02:19:43", name: "2回目🎤（ゆらメイド）", commentId: "Ugwy4S3M_i_AX_ia_Lp4AaABAg" },
    { time: "02:25:28", name: "3回目🎤（お姉さんメイド）", commentId: "Ugwy4S3M_i_AX_ia_Lp4AaABAg" },
    { time: "02:34:53", name: "4回目🎤（ガチロリメイド）", commentId: "Ugwy4S3M_i_AX_ia_Lp4AaABAg" },
  ],
  // 2023-07-14
  "H3ppl7Gxzpg": [
    { time: "02:08:30", name: "1回目🎤（エコーなし）", commentId: "Ugx_LrMS_GskZGlH6sB4AaABAg" },
    { time: "02:30:47", name: "2回目🎤（エコーあり ミステイク 噛みました）", commentId: "Ugx_LrMS_GskZGlH6sB4AaABAg" },
    { time: "02:31:52", name: "3回目🎤（エコーあり リテイク）", commentId: "Ugx_LrMS_GskZGlH6sB4AaABAg" },
  ],
  // 2023-07-13
  "7mjO-IYwwzQ": [
    { time: "01:56:36", name: "1回目🎤（通常バージョン）", commentId: "Ugz9YchsJOKSC45OTIt4AaABAg" },
    { time: "02:12:03", name: "2回目🎤（百合バージョン）", commentId: "Ugz9YchsJOKSC45OTIt4AaABAg" },
  ],
  // 2023-07-12
  "yzYUomYpriM": [
    { time: "02:41:47", name: "1回目🎤（通常ボイス）", commentId: "UgyMXJTJ58DJXz6cfo94AaABAg" },
    { time: "02:44:40", name: "2回目🎤（ウィスパーボイス）", commentId: "UgyMXJTJ58DJXz6cfo94AaABAg" },
  ],
  // 2023-07-11
  "sKGc4xQ38dI": [
    { time: "01:59:46", name: "1回目🎤（兄さん呼び エコーなし ミステイク #ゆらかし ）", commentId: "UgxmxX05am7vt3QjKN14AaABAg" },
    { time: "02:07:00", name: "2回目🎤（兄さん呼び エコーあり リテイク）", commentId: "UgxmxX05am7vt3QjKN14AaABAg" },
    { time: "02:16:49", name: "3回目🎤（姉さん呼び エコーあり）", commentId: "UgxmxX05am7vt3QjKN14AaABAg" },
  ],
  // 2023-07-10
  "bqMr2yK7XkU": [
    { time: "01:59:58", name: "1回目🎤（エコーなし、ミステイク）", commentId: "UgzXT2Cv3_JZaOMDG2h4AaABAg" },
    { time: "02:00:27", name: "2回目🎤（エコーなし）", commentId: "UgzXT2Cv3_JZaOMDG2h4AaABAg" },
    { time: "02:08:56", name: "3回目🎤（エコーあり）", commentId: "UgzXT2Cv3_JZaOMDG2h4AaABAg" },
  ],
  // 2023-07-06
  "HYNXqH-j5W4": [
    { time: "02:09:55", name: "相合傘ボイス🎤", commentId: "UgxGzAA7WUTkL-HuJlR4AaABAg" },
  ],
  // 2023-07-05
  "f8bcXKlYm6o": [
    { time: "01:56:47", name: "1回目🎤（エコーなし）", commentId: "Ugwd-oSw5IQ1-fLTJrt4AaABAg" },
    { time: "02:07:22", name: "2回目🎤（エコーなし、リテイク）", commentId: "Ugwd-oSw5IQ1-fLTJrt4AaABAg" },
    { time: "02:23:27", name: "3回目🎤（エコーあり）", commentId: "Ugwd-oSw5IQ1-fLTJrt4AaABAg" },
  ],
  // 2023-07-03
  "ZoYFjN5Qh-Q": [
    { time: "01:56:32", name: "愛情たっぷりのゆらの手作りレモネードボイス🎤", commentId: "UgzSf4e_ykZMCQ_LkT54AaABAg" },
  ],
  // 2023-06-29
  "t73R5fRdZas": [
    { time: "02:09:02", name: "1回目🎤（エコーなし）", commentId: "UgysfQJYFOmxF_kKsnh4AaABAg" },
    { time: "02:14:43", name: "2回目🎤（エコーあり）", commentId: "UgysfQJYFOmxF_kKsnh4AaABAg" },
  ],
  // 2023-06-28
  "f1XfRMq0g58": [
    { time: "01:48:48", name: "1回目🎤（エコーなし）", commentId: "UgytBJUPkmkcVMk74ct4AaABAg" },
    { time: "02:03:12", name: "2回目🎤（エコーあり）", commentId: "UgytBJUPkmkcVMk74ct4AaABAg" },
  ],
  // 2023-06-27
  "7AujyzGgQAk": [
    { time: "01:49:59", name: "自信がないゆらみりーを励ますボイス🎤", commentId: "UgzcCnL92THKxq84V-x4AaABAg" },
  ],
  // 2023-06-23
  "cZY6Z-IHdkQ": [
    { time: "02:11:53", name: "1回目🎤（エコーなし）", commentId: "UgwZZTp1-T-okT2jVUp4AaABAg" },
    { time: "02:17:48", name: "2回目🎤（最後だけエコー）", commentId: "UgwZZTp1-T-okT2jVUp4AaABAg" },
  ],
  // 2023-06-22
  "VjqjC_U4kC8": [
    { time: "01:56:30", name: "1回目🎤（照れてる）", commentId: "UgyYIkupK6_3gGGa5e94AaABAg" },
    { time: "02:03:45", name: "2回目🎤（我慢できなくなった）", commentId: "UgyYIkupK6_3gGGa5e94AaABAg" },
  ],
  // 2023-06-21
  "Ej6eMP6GqYE": [
    { time: "01:34:53", name: "1回目🎤（エコーなし）", commentId: "UgxykBCmevYGUSunF754AaABAg" },
    { time: "01:44:27", name: "2回目🎤（最後だけエコー）", commentId: "UgxykBCmevYGUSunF754AaABAg" },
  ],
  // 2023-06-20
  "qRa4y9nLstQ": [
    { time: "01:29:19", name: "1回目（エコーなし）", commentId: "UgylJcpC3Puot-Q_mSB4AaABAg.9rBVk0YvtSs9rBVlZjJy4o" },
    { time: "01:40:12", name: "2回目（エコーあり）", commentId: "UgylJcpC3Puot-Q_mSB4AaABAg.9rBVk0YvtSs9rBVlZjJy4o" },
  ],
  // 2023-06-19
  "j78IKlBCB0o": [
    { time: "01:50:38", name: "1回目", commentId: "UgxmR3cytfGZyfhR49x4AaABAg.9r92iBsQlyo9r92jyqXM8W" },
    { time: "02:03:03", name: "2回目（リベンジ）", commentId: "UgxmR3cytfGZyfhR49x4AaABAg.9r92iBsQlyo9r92lEYRinw" },
  ],
  // 2023-06-16
  "4pmnCrKZdcM": [
    { time: "02:03:58", name: "1回目（飽きれ）", commentId: "UgzHO-1jjTonHwlZMiF4AaABAg.9r0zfFgpw8Z9r0zjBqg3UF" },
    { time: "02:07:03", name: "2回目（照れ）", commentId: "UgzHO-1jjTonHwlZMiF4AaABAg.9r0zfFgpw8Z9r0zjBqg3UF" },
  ],
  // 2023-06-15
  "pa4EzKmxfZQ": [
    { time: "01:16:30", name: "お願いボイス🎤", commentId: "UgyRXgo1UaXEBCDJibF4AaABAg.9qziTP5QbF49qziVGR0Qqn" },
  ],
  // 2023-06-14
  "QzAxcA-Ni48": [
    { time: "01:42:11", name: "1回目（ぷりぷり）", commentId: "Ugy1TmS9lkmG0mZFtCh4AaABAg" },
    { time: "01:52:05", name: "2回目（涙目）", commentId: "Ugy1TmS9lkmG0mZFtCh4AaABAg" },
  ],
  // 2023-06-13
  "wqJfhyyUOO8": [
    { time: "01:52:48", name: "1回目（エコーなし）", commentId: "UgzJVmH4qDUaztevzSJ4AaABAg.9quU1-uX7zh9quU3s3ZIjj" },
    { time: "01:56:53", name: "2回目（エコーあり）", commentId: "UgzJVmH4qDUaztevzSJ4AaABAg.9quU1-uX7zh9quU3s3ZIjj" },
  ],
  // 2023-06-12
  "sUXinaw9WfU": [
    { time: "02:24:23", name: "1回目（付き合ってる設定、デート中）", commentId: "UgyuS9C0gR-VqzBjQzJ4AaABAg" },
    { time: "02:27:31", name: "2回目（ツンデレ）", commentId: "UgyuS9C0gR-VqzBjQzJ4AaABAg" },
    { time: "02:31:05", name: "3回目（子供に接する感じ）", commentId: "UgyuS9C0gR-VqzBjQzJ4AaABAg" },
    { time: "02:35:16", name: "4回目（お姉さん）", commentId: "UgyuS9C0gR-VqzBjQzJ4AaABAg" },
  ],
  // 2023-06-08
  "oKABZGvB8jw": [
    { time: "01:49:45", name: "1回目（エコーなし）", commentId: "UgyhchbKP5ibnf7qO0d4AaABAg" },
    { time: "01:52:14", name: "2回目（エコーあり）", commentId: "UgyhchbKP5ibnf7qO0d4AaABAg" },
  ],
  // 2023-06-07
  "Ia2TJ_Y7sH8": [
    { time: "01:01:39", name: "1回目（エコーなし）", commentId: "UgypbmbJFEYNDhiWFGN4AaABAg" },
    { time: "01:08:07", name: "2回目（エコーあり）", commentId: "UgypbmbJFEYNDhiWFGN4AaABAg" },
  ],
  // 2023-05-24
  "l8gfK-J2B9Y": [
    { time: "01:53:56", name: "★ざ～こ、ざ～こ（エコー無し）", commentId: "UgwL_dGemescv8Cys1t4AaABAg" },
    { time: "01:57:53", name: "★ざ～こ、ざ～こ（エコー有り）", commentId: "UgwL_dGemescv8Cys1t4AaABAg" },
  ],
};
