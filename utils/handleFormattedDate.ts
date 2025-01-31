export const handleFormatDate = (date: Date) => {
  // 日本のタイムゾーンでフォーマット
  const formattedDate = date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short', // 「日」,「月」,「火」, ...
  });

  return formattedDate;
};
