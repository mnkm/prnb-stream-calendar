/** 初めて見る人向けのおすすめの再生リスト(タイトルで判定し、一覧の先頭に固定する) */
const RECOMMENDED = /初見|はじめて|初めて|まずはこれ/;

export const isRecommendedPlaylist = (title: string) => RECOMMENDED.test(title);
