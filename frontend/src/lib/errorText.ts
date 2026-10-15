import type { ApiError } from '../services/api'

/** A short headline for an API failure; `what` names the data, e.g. "the graph". */
export function errorTitle(error: ApiError, what: string): string {
  switch (error.kind) {
    case 'network':
      return "Can't reach the CodeAtlas API"
    case 'http':
      return error.status === 404 ? `${capitalize(what)} was not found` : `The API returned an error loading ${what}`
    case 'invalid':
      return `The API sent ${what} in an unexpected format`
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
