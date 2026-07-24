/** Minimal shapes the inline "select or create" fields need — just enough to
 * populate a <Select> and label a newly-created row. Both QuoteBuilder and
 * the standalone Add*Button/Edit*Button forms share these. */
export interface ClientOption {
  id: string;
  name: string;
}

export interface JobOption {
  id: string;
  name: string;
}
