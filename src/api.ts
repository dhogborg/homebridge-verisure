import * as verisure from "verisure"

export let VERISURE_TOKEN: string | null = null
let OVERVIEW_PROMISES: { [key: string]: Promise<verisure.Overview> } = {}

export function getVerisureInstallations(
  email: string,
  password: string,
): Promise<verisure.Installation[]> {
  return new Promise<verisure.Installation[]>(function(resolve, reject): void {
    verisure.auth(email, password, function(err, token): void {
      if (err) {
        reject(err)
        return
      }
      VERISURE_TOKEN = token

      verisure.installations(token, email, function(err, installations): void {
        if (err) {
          reject(err)
          return
        }
        resolve(installations)
      })
    })
  })
}

export function getOverview(i: verisure.Installation): Promise<verisure.Overview> {
  let giid = i.giid
  if (OVERVIEW_PROMISES[giid]) {
    return OVERVIEW_PROMISES[giid]
  }

  OVERVIEW_PROMISES[giid] = new Promise<verisure.Overview>(function(resolve, reject) {
    verisure.overview(VERISURE_TOKEN, i, function(err, overview): void {
      if (err) {
        reject(err)
        return
      }
      resolve(overview)
      OVERVIEW_PROMISES[giid] = null
    })
  })

  return OVERVIEW_PROMISES[giid]
}
/*
* API interface
*
*/
export interface Response {
  response: verisure.APIResponse
  error: RequestError | null
  body: any | null
}

export interface RequestOptions {
  uri: string
  method?: string
  headers?: { [key: string]: string }
  json?: any
}

export interface RequestError {
  errorGroup: string
  errorCode: string
  errorMessage: string
}

// Wrap the verisure api call in a promise and set some defaults
// that can be overridden by options
export const apiCall = function(options: RequestOptions): Promise<Response> {
  if (!options.uri) {
    return Promise.reject("missing option: uri")
  }

  let _options: any = {
    uri: "",
    method: "GET",
    headers: {
      Cookie: `vid=${VERISURE_TOKEN}`,
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
  }
  for (let key in options) {
    if ((<any>options)[key]) {
      _options[key] = (<any>options)[key]
    }
  }

  return new Promise<Response>(function(resolve, reject) {
    verisure._apiClient(
      _options,
      function(error, response, body) {
        body = typeof body == "string" ? JSON.parse(body) : body
        if (error != null) {
          reject(<Response>{
            response: response,
            error: error,
            body: body,
          })
          return
        }

        resolve(<Response>{
          response: response,
          error: null,
          body: body,
        })
      },
      false,
    )
  })
}
