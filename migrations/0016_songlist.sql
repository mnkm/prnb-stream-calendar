-- タレント別の楽曲リスト(https://mnkm.page/prnb-songlist/)で、そのチャンネルを表示するための talent パラメータの値。
-- 入れると、チャンネルの詳細に「楽曲リストを開く」ボタンが出る。空なら出さない(01 の公式は出さない)
ALTER TABLE channels ADD COLUMN songlist_talent TEXT;

UPDATE channels SET songlist_talent = 'nina' WHERE id = 'UCGCNass-jSHshAHA4ufX3Ng';
UPDATE channels SET songlist_talent = 'yura' WHERE id = 'UC4g6i7aL2fn2EME3r9fEHxA';
UPDATE channels SET songlist_talent = 'ren' WHERE id = 'UC3QnUPDxkrqGW3W-x077djA';
UPDATE channels SET songlist_talent = 'hinata' WHERE id = 'UCahlYbdb3AHrNQdojztSMvQ';
UPDATE channels SET songlist_talent = 'ruka' WHERE id = 'UCIYk01c-wq6Ex9sjsDBEl0g';
