export const CATALOG_VERSION = 1;
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function approvedQuotes(data) {
  if (!Array.isArray(data)) throw new Error('문장 목록을 읽을 수 없어요.');
  const list = data.filter(q => q.enabled === true && q.reviewStatus === 'approved');
  if (!list.length || list.some(q => typeof q.id !== 'string' || typeof q.text !== 'string' || typeof q.sourceTitle !== 'string') || new Set(list.map(q=>q.id)).size !== list.length) throw new Error('문장 목록이 올바르지 않아요.');
  return list;
}
// An epoch-day mapping avoids consecutive repeats independently of visit history.
export function chooseQuote(dateKey, quotes, previousId) {
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`)/86400000);
  let index = ((day + CATALOG_VERSION * 31) % quotes.length + quotes.length) % quotes.length;
  if (quotes.length > 1 && quotes[index].id === previousId) index = (index+1)%quotes.length;
  return quotes[index];
}
export function previousDate(key) {
  const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate()-1); return localDate(date);
}
