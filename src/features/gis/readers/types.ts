export interface ReaderError {
  kind:
    | 'malformed'
    | 'missing_projection'
    | 'unsupported_projection'
    | 'missing_part'
    | 'multiple_tables'
  detail: string
}
