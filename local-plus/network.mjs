// Retry only failures to establish a connection, before any HTTP request was
// sent. Do not replay HTTP failures or an interrupted generation.
export async function fetchConnected(url, options = {}, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fetchImpl(url, options); }
    catch (error) {
      if (attempt === 2 || options.signal?.aborted || error.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT') throw error;
    }
  }
}
