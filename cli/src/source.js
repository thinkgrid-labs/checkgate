// Loads raw flag definitions either from a local JSON file (`--input`) or from a
// running Checkgate server's REST API using a personal access token.

import { readFile } from 'node:fs/promises'

/**
 * Fetch the flag list for an environment from the server.
 * Uses Bearer auth (a personal access token or SDK key).
 */
export async function fetchFlagsFromApi({ url, env, token }) {
  if (!url) throw new Error('Missing server URL (pass --url or set CHECKGATE_URL).')
  if (!env) throw new Error('Missing environment id (pass --env or set CHECKGATE_ENV).')
  if (!token) throw new Error('Missing access token (pass --token or set CHECKGATE_TOKEN).')

  const base = url.replace(/\/+$/, '')
  const endpoint = `${base}/api/environments/${encodeURIComponent(env)}/flags`

  let res
  try {
    res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
  } catch (e) {
    throw new Error(`Could not reach ${endpoint}: ${e.message}`)
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Server rejected the token (HTTP ${res.status}). Check --token and its access to this environment.`)
  }
  if (res.status === 404) {
    throw new Error(`Environment not found (HTTP 404): ${env}`)
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch flags (HTTP ${res.status}).`)
  }

  return res.json()
}

/** Read a flag array from a local JSON file (e.g. an exported snapshot). */
export async function readFlagsFromFile(path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    throw new Error(`Could not read --input file "${path}": ${e.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`--input file "${path}" is not valid JSON: ${e.message}`)
  }
}

/** Resolve the raw flag list from whichever source the options specify. */
export async function loadFlags(opts) {
  if (opts.input) return readFlagsFromFile(opts.input)
  return fetchFlagsFromApi(opts)
}
