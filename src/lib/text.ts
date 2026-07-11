export function storageSafeText(value: string, maxLength = Number.POSITIVE_INFINITY) {
  const finiteLimit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : value.length
  const requestedEnd = Math.min(value.length, finiteLimit)
  const end =
    requestedEnd > 0 &&
    requestedEnd < value.length &&
    value.charCodeAt(requestedEnd - 1) >= 0xd800 &&
    value.charCodeAt(requestedEnd - 1) <= 0xdbff &&
    value.charCodeAt(requestedEnd) >= 0xdc00 &&
    value.charCodeAt(requestedEnd) <= 0xdfff
      ? requestedEnd - 1
      : requestedEnd

  let result = ''
  for (let index = 0; index < end; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (index + 1 < end && next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1]
        index += 1
      } else {
        result += '\ufffd'
      }
      continue
    }
    result += code >= 0xdc00 && code <= 0xdfff ? '\ufffd' : value[index]
  }

  return result
}
