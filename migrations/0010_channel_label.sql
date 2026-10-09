-- チャンネルの表示・非表示を切り替えるボタンに出す短いラベル。空ならチャンネル名を出す
ALTER TABLE channels ADD COLUMN label TEXT;

UPDATE channels SET label = '公式' WHERE id = 'UCDZ9IS3qPuacdG_GhGiB7Gg';
UPDATE channels SET label = '💖💫' WHERE id = 'UCGCNass-jSHshAHA4ufX3Ng';
UPDATE channels SET label = '🐻‍❄️🌙' WHERE id = 'UC4g6i7aL2fn2EME3r9fEHxA';
UPDATE channels SET label = '💛🪐' WHERE id = 'UC3QnUPDxkrqGW3W-x077djA';
UPDATE channels SET label = '🪿☀️' WHERE id = 'UCahlYbdb3AHrNQdojztSMvQ';
UPDATE channels SET label = '☂️🫧' WHERE id = 'UCIYk01c-wq6Ex9sjsDBEl0g';
