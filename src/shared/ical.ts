/**
 * カレンダーアプリで購読する iCal のフィード(`/api/ical/<キー>.ics`)のキーと、チャンネルの対応。
 * 購読の URL は、一度配ると変えられない(購読した人のアプリに残り続ける)ので、ほかの値(楽曲リストの talent など)を
 * 使い回さず、ここで固定する。チャンネルを足したら、ここにもキーを足す(足さなければ all.ics にだけ入る)
 */
export const ICAL_CHANNEL_KEYS: Readonly<Record<string, string>> = {
  official: 'UCDZ9IS3qPuacdG_GhGiB7Gg',
  nina: 'UCGCNass-jSHshAHA4ufX3Ng',
  yura: 'UC4g6i7aL2fn2EME3r9fEHxA',
  ren: 'UC3QnUPDxkrqGW3W-x077djA',
  hinata: 'UCahlYbdb3AHrNQdojztSMvQ',
  ruka: 'UCIYk01c-wq6Ex9sjsDBEl0g',
};

/** 有効なチャンネルすべての予定を入れるフィードのキー */
export const ICAL_ALL_KEY = 'all';

/** チャンネルのフィードのキー。キーが無いチャンネルは null */
export const icalKeyOf = (channelId: string): string | null =>
  Object.entries(ICAL_CHANNEL_KEYS).find(([, id]) => id === channelId)?.[0] ?? null;
